import { derived, writable } from 'svelte/store'

export type Track = {
  id: string
  name: string
  artist: string
  album: string
  albumArt: string
  duration: number
}

export type RepeatMode = 'off' | 'all' | 'one'

export type PlayerState = {
  currentTrack: Track | null
  nextTrack: Track | null
  queue: Track[]
  isPlaying: boolean
  progress: number
  volume: number
  shuffle: boolean
  repeat: RepeatMode
  showNextPreview: boolean
  peekLatched: boolean
  isTransitioning: boolean
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function createPlayerStore() {
  const { subscribe, update } = writable<PlayerState>({
    currentTrack: null,
    nextTrack: null,
    queue: [],
    isPlaying: false,
    progress: 0,
    volume: 80,
    shuffle: false,
    repeat: 'off',
    showNextPreview: false,
    peekLatched: false,
    isTransitioning: false
  })

  let progressInterval: ReturnType<typeof setInterval> | null = null

  const stopTicking = () => {
    if (progressInterval) {
      clearInterval(progressInterval)
      progressInterval = null
    }
  }

  const startTicking = () => {
    if (progressInterval) return
    progressInterval = setInterval(tick, 1000)
  }

  const setTransitioning = () => {
    update((state) => ({ ...state, isTransitioning: true }))
    setTimeout(() => {
      update((state) => ({ ...state, isTransitioning: false, peekLatched: false }))
    }, 600)
  }

  const tick = () => {
    update((state) => {
      if (!state.currentTrack) return state

      const step = 100 / (state.currentTrack.duration / 1000)
      const newProgress = state.progress + step

      const remainingMs = state.currentTrack.duration * (1 - state.progress / 100)
      const showNextPreview = remainingMs <= 15000 && !!state.nextTrack

      // Once latched, keep it latched until the transition reset clears it.
      const peekLatched = state.peekLatched || showNextPreview

      if (newProgress >= 100) {
        return { ...state, progress: 100, showNextPreview: false, peekLatched: state.peekLatched }
      }

      return { ...state, progress: newProgress, showNextPreview, peekLatched }
    })
  }

  const api = {
    subscribe,

    setPlaybackState(args: { current: Track | null; next: Track | null; queue: Track[]; isPlaying: boolean; progressPct: number }) {
      let changedTrack = false
      update((state) => {
        const prevId = state.currentTrack?.id ?? null
        const nextId = args.current?.id ?? null
        changedTrack = !!nextId && nextId !== prevId

        const remainingMs = args.current ? args.current.duration * (1 - args.progressPct / 100) : Infinity
        const showNextPreview = remainingMs <= 15000 && !!args.next

        // Sticky latch: once it turns on, it stays on until transition end clears it.
        const peekLatched = state.peekLatched || showNextPreview

        return {
          ...state,
          currentTrack: args.current,
          nextTrack: args.next,
          queue: args.queue,
          isPlaying: args.isPlaying,
          progress: clamp(args.progressPct, 0, 100),
          showNextPreview,
          peekLatched
        }
      })

      if (args.isPlaying) startTicking()
      else stopTicking()

      if (changedTrack) setTransitioning()
    },

    setIsPlaying(isPlaying: boolean) {
      update((state) => ({ ...state, isPlaying }))
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
    },

    setVolume(volume: number) {
      update((state) => ({ ...state, volume: clamp(volume, 0, 100) }))
    },

    toggleShuffle() {
      update((state) => ({ ...state, shuffle: !state.shuffle }))
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
