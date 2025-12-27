import type { Track } from '../playerStore'

declare global {
  interface Window {
    Spotify?: any
    onSpotifyWebPlaybackSDKReady?: () => void
  }
}

export type WebPlaybackStatus = 'idle' | 'in-progress' | 'ready'

export function createWebPlaybackController(args: {
  getAccessToken: () => Promise<string | null>
  onError: (message: string) => void
  onPlaybackState: (state: { current: Track; next: Track | null; queue: Track[]; isPlaying: boolean; progressPct: number }) => void
}) {
  let webPlayer: any | null = null
  let initState: WebPlaybackStatus = 'idle'
  let deviceId: string | null = null

  let preferred = false
  let disabledUntil = 0
  let failureCount = 0

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  const loadSdk = async () => {
    if (window.Spotify) return

    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-spotify-sdk]') as HTMLScriptElement | null
      if (existing) {
        const id = window.setInterval(() => {
          if (window.Spotify) {
            clearInterval(id)
            resolve()
          }
        }, 50)

        window.setTimeout(() => {
          clearInterval(id)
          if (!window.Spotify) reject(new Error('Spotify Web Playback SDK load timed out'))
        }, 10_000)

        return
      }

      const script = document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      script.setAttribute('data-spotify-sdk', 'true')

      script.onerror = () => reject(new Error('Failed to load Spotify Web Playback SDK'))
      document.head.appendChild(script)

      window.onSpotifyWebPlaybackSDKReady = () => resolve()
      window.setTimeout(() => reject(new Error('Spotify Web Playback SDK load timed out')), 10_000)
    })
  }

  const disconnect = () => {
    try {
      webPlayer?.disconnect?.()
    } catch {
      // ignore
    }
    webPlayer = null
    initState = 'idle'
    deviceId = null
  }

  const init = async (connectNow = false) => {
    if (initState === 'in-progress' || initState === 'ready') return
    if (Date.now() < disabledUntil) return

    initState = 'in-progress'

    try {
      await loadSdk()

      webPlayer = new window.Spotify.Player({
        name: 'Muffle',
        volume: 0.8,
        getOAuthToken: async (cb: (token: string) => void) => {
          try {
            const token = await args.getAccessToken()
            cb(token || '')
          } catch {
            cb('')
          }
        }
      })

      webPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
        deviceId = device_id
        initState = 'ready'
      })

      webPlayer.addListener('not_ready', () => {
        deviceId = null
        initState = 'idle'
      })

      webPlayer.addListener('player_state_changed', (state: any) => {
        if (!state) return
        const currentItem = state.track_window?.current_track
        if (!currentItem) return

        const currentTrack: Track = {
          id: currentItem.id,
          name: currentItem.name,
          artist: (currentItem.artists || []).map((a: any) => a.name).join(', '),
          album: currentItem.album?.name ?? '',
          albumArt: currentItem.album?.images?.[0]?.url ?? '',
          duration: currentItem.duration_ms ?? 0,
          uri: currentItem.uri ?? ''
        }

        const nextItem = state.track_window?.next_tracks?.[0] ?? null
        const nextTrack: Track | null = nextItem
          ? {
              id: nextItem.id,
              name: nextItem.name,
              artist: (nextItem.artists || []).map((a: any) => a.name).join(', '),
              album: nextItem.album?.name ?? '',
              albumArt: nextItem.album?.images?.[0]?.url ?? '',
              duration: nextItem.duration_ms ?? 0,
              uri: nextItem.uri ?? ''
            }
          : null

        const queueTracks: Track[] = (state.track_window?.next_tracks ?? []).slice(0, 20).map((t: any) => ({
          id: t.id,
          name: t.name,
          artist: (t.artists || []).map((a: any) => a.name).join(', '),
          album: t.album?.name ?? '',
          albumArt: t.album?.images?.[0]?.url ?? '',
          duration: t.duration_ms ?? 0,
          uri: t.uri ?? ''
        }))

        const progressPct = currentTrack.duration ? (state.position / currentTrack.duration) * 100 : 0

        args.onPlaybackState({
          current: currentTrack,
          next: nextTrack,
          queue: queueTracks,
          isPlaying: !state.paused,
          progressPct
        })
      })

      webPlayer.addListener('initialization_error', ({ message }: any) => {
        args.onError(String(message || 'Playback init error'))
        initState = 'idle'
      })

      webPlayer.addListener('authentication_error', ({ message }: any) => {
        args.onError(String(message || 'Playback auth error'))
        initState = 'idle'
      })

      webPlayer.addListener('account_error', ({ message }: any) => {
        args.onError(String(message || 'Playback account error'))
        initState = 'idle'
      })

      webPlayer.addListener('playback_error', ({ message }: any) => {
        const msg = String(message || 'Playback error')
        failureCount += 1

        if (failureCount >= 2) {
          disabledUntil = Date.now() + 5 * 60_000
          preferred = false
          disconnect()
          args.onError('In-app playback unavailable. Using Spotify Connect instead.')
        } else {
          args.onError(msg)
        }
      })

      if (connectNow) {
        const ok = await webPlayer.connect()
        if (!ok) {
          initState = 'idle'
          args.onError('Failed to connect Web Playback device')
        }
      } else {
        initState = 'idle'
      }
    } catch (e: any) {
      args.onError(String(e?.message || 'Failed to initialize playback'))
      initState = 'idle'
    }
  }

  const ensureReady = async () => {
    if (initState === 'idle') void init(true)

    for (let i = 0; i < 30; i++) {
      if (deviceId) return { deviceId, status: initState }
      await sleep(100)
    }

    return { deviceId, status: initState }
  }

  const trySeek = async (positionMs: number) => {
    const canUseSdk = webPlayer && typeof webPlayer.getCurrentState === 'function' && typeof webPlayer.seek === 'function'
    if (!canUseSdk) return false

    const sdkState = await webPlayer.getCurrentState().catch(() => null)
    if (!sdkState) return false

    await webPlayer.seek(positionMs)
    return true
  }

  return {
    init,
    ensureReady,
    disconnect,
    trySeek,
    getDeviceId: () => deviceId,
    getPreferredDeviceId: () => (preferred ? deviceId : null),
    setPreferred: (isPreferred: boolean) => {
      preferred = isPreferred
      if (isPreferred) {
        failureCount = 0
        disabledUntil = 0
      }
    },
    getStatus: () => initState
  }
}
