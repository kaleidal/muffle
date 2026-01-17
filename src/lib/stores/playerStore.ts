import { derived, writable } from 'svelte/store'

export type Track = {
  id: string
  name: string
  artist: string
  album: string
  albumArt: string
  duration: number
  uri: string
}

export type RepeatMode = 'off' | 'all' | 'one'

export type NowPlayingToast = {
  id: string
  name: string
  artist: string
  albumArt: string
}

export type PlayerState = {
  currentTrack: Track | null
  nextTrack: Track | null
  queue: Track[]
  queueSource: 'spotify' | 'app'
  isPlaying: boolean
  progress: number
  volume: number
  shuffle: boolean
  repeat: RepeatMode
  expanded: boolean
  showNextPreview: boolean
  peekLatched: boolean
  isTransitioning: boolean
  nowPlayingToast: NowPlayingToast | null
  nowPlayingToastKey: number
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function createPlayerStore() {
  const { subscribe, update } = writable<PlayerState>({
    currentTrack: null,
    nextTrack: null,
    queue: [],
    queueSource: 'app',
    isPlaying: false,
    progress: 0,
    volume: 80,
    shuffle: false,
    repeat: 'off',
    expanded: false,
    showNextPreview: false,
    peekLatched: false,
    isTransitioning: false,
    nowPlayingToast: null,
    nowPlayingToastKey: 0
  })

  let progressInterval: ReturnType<typeof setInterval> | null = null
  let lastTickAt = 0
  let toastTimer: ReturnType<typeof setTimeout> | null = null
  let lastPeekTrackId: string | null = null
  let optimisticIsPlaying: null | { value: boolean; until: number } = null
  let optimisticSeek: null | { value: number; until: number; trackId: string | null } = null
  let optimisticShuffle: null | { value: boolean; until: number } = null
  let optimisticTrackUntil: number = 0

  const stopTicking = () => {
    if (progressInterval) {
      clearInterval(progressInterval)
      progressInterval = null
    }
    lastTickAt = 0
  }

  const startTicking = () => {
    if (progressInterval) return
    lastTickAt = Date.now()
    progressInterval = setInterval(tick, 250)
  }

  const setTransitioning = () => {
    update((state) => ({ ...state, isTransitioning: true }))
    setTimeout(() => {
      update((state) => ({ ...state, isTransitioning: false, peekLatched: false }))
    }, 600)
  }

  const showNowPlayingToast = (track: Track) => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }

    update((state) => ({
      ...state,
      nowPlayingToast: { id: track.id, name: track.name, artist: track.artist, albumArt: track.albumArt },
      nowPlayingToastKey: state.nowPlayingToastKey + 1
    }))

    toastTimer = setTimeout(() => {
      update((state) => ({ ...state, nowPlayingToast: null }))
      toastTimer = null
    }, 1600)
  }

  const tick = () => {
    const now = Date.now()
    update((state) => {
      if (!state.currentTrack) return state

      if (!lastTickAt) {
        lastTickAt = now
        return state
      }

      const elapsedMs = Math.max(0, now - lastTickAt)
      lastTickAt = now

      const duration = state.currentTrack.duration
      if (!duration) return state

      const step = (elapsedMs / duration) * 100
      const newProgress = state.progress + step

      const clampedProgress = clamp(newProgress, 0, 100)
      const remainingMs = duration * (1 - clampedProgress / 100)
      const showNextPreview = remainingMs <= 15000 && !!state.nextTrack

      if (showNextPreview && !state.showNextPreview && state.nextTrack?.id) {
        lastPeekTrackId = state.nextTrack.id
      }

      // Show the peek only while inside the 15s window.
      // If the user seeks back out of the window, it should disappear.
      // We still hold it at the very end (progress hits 100) to cover the track-boundary gap.
      const peekLatched = showNextPreview

      if (newProgress >= 100) {
        return { ...state, progress: 100, showNextPreview: false, peekLatched: state.peekLatched || showNextPreview }
      }

      return { ...state, progress: clampedProgress, showNextPreview, peekLatched }
    })
  }

  const api = {
    subscribe,

    setOptimisticIsPlaying(isPlaying: boolean, ttlMs = 8000) {
      const until = Date.now() + Math.max(0, ttlMs | 0)
      optimisticIsPlaying = ttlMs > 0 ? { value: !!isPlaying, until } : null

      if (isPlaying) startTicking()
      else stopTicking()

      update((state) => ({ ...state, isPlaying: !!isPlaying }))
    },

    clearOptimisticIsPlaying() {
      optimisticIsPlaying = null
    },

    setOptimisticSeek(progressPct: number, ttlMs = 5000) {
      const now = Date.now()
      const until = now + Math.max(0, ttlMs | 0)
      update((state) => {
        const pct = clamp(progressPct, 0, 100)
        optimisticSeek = ttlMs > 0 ? { value: pct, until, trackId: state.currentTrack?.id ?? null } : null
        return { ...state, progress: pct, showNextPreview: false, peekLatched: false }
      })
      lastTickAt = now
    },

    clearOptimisticSeek() {
      optimisticSeek = null
    },

    setOptimisticShuffle(shuffle: boolean, ttlMs = 8000) {
      const until = Date.now() + Math.max(0, ttlMs | 0)
      optimisticShuffle = ttlMs > 0 ? { value: !!shuffle, until } : null
      update((state) => ({ ...state, shuffle: !!shuffle }))
    },

    clearOptimisticShuffle() {
      optimisticShuffle = null
    },

    setShuffleFromServer(shuffle: boolean) {
      const now = Date.now()
      if (optimisticShuffle) {
        if (now >= optimisticShuffle.until) {
          optimisticShuffle = null
        } else if (!!shuffle === optimisticShuffle.value) {
          optimisticShuffle = null
        } else {
          return
        }
      }
      update((state) => ({ ...state, shuffle: !!shuffle }))
    },

    setOptimisticTrack(track: Track) {
      if (!track) return
      optimisticIsPlaying = { value: true, until: Date.now() + 10000 }
      optimisticTrackUntil = Date.now() + 5000

      update((state) => ({
        ...state,
        currentTrack: track,
        progress: 0,
        isPlaying: true,
        showNextPreview: false,
        peekLatched: false
      }))

      lastTickAt = Date.now()
      lastPeekTrackId = null
      setTransitioning()
      startTicking()
    },

    toggleExpanded() {
      update((state) => ({ ...state, expanded: !state.expanded }))
    },

    setExpanded(expanded: boolean) {
      update((state) => ({ ...state, expanded: !!expanded }))
    },

    setPlaybackState(args: {
      current: Track | null
      next?: Track | null
      queue?: Track[]
      isPlaying: boolean
      progressPct: number
    }) {
      let changedTrack = false
      let toastTrack: Track | null = null

      const now = Date.now()
      let effectiveIsPlaying = !!args.isPlaying
      if (optimisticIsPlaying) {
        if (now >= optimisticIsPlaying.until) {
          optimisticIsPlaying = null
        } else if (effectiveIsPlaying === optimisticIsPlaying.value) {
          optimisticIsPlaying = null
        } else {
          effectiveIsPlaying = optimisticIsPlaying.value
        }
      }

      const incomingTrackId = args.current?.id ?? null

      const allowTrackFromServer = () => {
        if (now >= optimisticTrackUntil) return true
        return false
      }

      const allowProgressFromServer = () => {
        if (!optimisticSeek) return true
        if (now >= optimisticSeek.until) {
          optimisticSeek = null
          return true
        }
        if (optimisticSeek.trackId && incomingTrackId && optimisticSeek.trackId !== incomingTrackId) {
          optimisticSeek = null
          return true
        }

        const serverClose = Math.abs((args.progressPct ?? 0) - optimisticSeek.value) <= 1.25
        if (serverClose) {
          optimisticSeek = null
          return true
        }

        return false
      }

      const useServerTrack = allowTrackFromServer()

      update((state) => {
        const prevId = state.currentTrack?.id ?? null
        const nextId = useServerTrack ? (args.current?.id ?? null) : prevId
        const effectiveTrack = useServerTrack ? args.current : state.currentTrack
        changedTrack = useServerTrack && !!nextId && nextId !== prevId

        const nextFromArgs = args.next ?? null
        const effectiveNext = state.queueSource === 'spotify' ? nextFromArgs ?? state.nextTrack : state.nextTrack

        if (state.showNextPreview && effectiveNext?.id && !lastPeekTrackId) {
          lastPeekTrackId = effectiveNext.id
        }

        const suppressForPeek = !!(changedTrack && lastPeekTrackId && nextId && lastPeekTrackId === nextId)
        toastTrack = changedTrack && !suppressForPeek ? args.current : null

        const nextProgress = (useServerTrack && allowProgressFromServer()) ? clamp(args.progressPct, 0, 100) : state.progress

        const trackForCalc = effectiveTrack ?? args.current
        const remainingMs = trackForCalc ? trackForCalc.duration * (1 - nextProgress / 100) : Infinity
        const showNextPreview = remainingMs <= 15000 && !!effectiveNext

        const peekLatched = showNextPreview || (state.peekLatched && args.progressPct >= 99.5)

        return {
          ...state,
          currentTrack: effectiveTrack,
          nextTrack:
            state.queueSource === 'spotify'
              ? args.next === undefined
                ? state.nextTrack
                : nextFromArgs
              : state.nextTrack,
          queue:
            state.queueSource === 'spotify'
              ? args.queue === undefined
                ? state.queue
                : args.queue
              : state.queue,
          isPlaying: effectiveIsPlaying,
          progress: nextProgress,
          showNextPreview,
          peekLatched
        }
      })

      lastTickAt = Date.now()

      if (effectiveIsPlaying) startTicking()
      else stopTicking()

      if (toastTrack) showNowPlayingToast(toastTrack)
      if (changedTrack) setTransitioning()

      if (changedTrack) lastPeekTrackId = null
    },

    setIsPlaying(isPlaying: boolean) {
      update((state) => ({ ...state, isPlaying }))
    },

    setQueueSource(source: 'spotify' | 'app') {
      update((state) => ({ ...state, queueSource: source }))
    },

    setQueue(queue: Track[]) {
      update((state) => ({ ...state, queue }))
    },

    setNextTrack(track: Track | null) {
      update((state) => ({ ...state, nextTrack: track }))
    },

    play() {
      update((state) => ({ ...state, isPlaying: true }))
      startTicking()
    },

    pause() {
      stopTicking()
      update((state) => ({ ...state, isPlaying: false }))
    },

    toggle() {
      update((state) => {
        if (state.isPlaying) api.pause()
        else api.play()
        return state
      })
    },

    next() {
      update((state) => {
        if (state.queue.length === 0) {
          return { ...state, isPlaying: false, progress: 0, showNextPreview: false, peekLatched: false }
        }

        const [nextTrack, ...remainingQueue] = state.queue
        return {
          ...state,
          currentTrack: nextTrack,
          nextTrack: remainingQueue[0] ?? null,
          queue: remainingQueue,
          progress: 0,
          showNextPreview: false,
          peekLatched: state.peekLatched
        }
      })
      setTransitioning()
    },

    previous() {
      update((state) => ({ ...state, progress: 0 }))
    },

    seek(progress: number) {
      update((state) => ({ ...state, progress: clamp(progress, 0, 100) }))
      lastTickAt = Date.now()
    },

    setSpotifyQueue(args: { next: Track | null; queue: Track[] }) {
      update((state) => {
        if (state.queueSource !== 'spotify') return state
        return { ...state, nextTrack: args.next, queue: args.queue }
      })
    },

    setVolume(volume: number) {
      update((state) => ({ ...state, volume: clamp(volume, 0, 100) }))
    },

    toggleShuffle() {
      update((state) => ({ ...state, shuffle: !state.shuffle }))
    },

    setShuffle(shuffle: boolean) {
      update((state) => ({ ...state, shuffle }))
    },

    toggleRepeat() {
      update((state) => {
        const modes: RepeatMode[] = ['off', 'all', 'one']
        const idx = modes.indexOf(state.repeat)
        return { ...state, repeat: modes[(idx + 1) % modes.length] }
      })
    },

    playTrack(track: Track) {
      update((state) => ({
        ...state,
        currentTrack: track,
        nextTrack: null,
        queue: [],
        progress: 0,
        showNextPreview: false
      }))

      showNowPlayingToast(track)
      setTransitioning()
      api.play()
    }
  }

  return api
}

export const playerStore = createPlayerStore()

export const formattedProgress = derived(playerStore, ($player) => {
  const currentMs = ($player.currentTrack?.duration ?? 0) * ($player.progress / 100)
  const totalMs = $player.currentTrack?.duration ?? 0

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return {
    current: formatTime(currentMs),
    total: formatTime(totalMs)
  }
})
