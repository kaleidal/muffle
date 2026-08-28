import type { SpotifyState } from './state'

type StoreLike = {
  getState: () => SpotifyState
  update: (fn: (state: SpotifyState) => SpotifyState) => void
  set: (state: SpotifyState) => void
}

type Deps = {
  store: StoreLike
  stopPlaybackPolling: () => void
  playbackDisconnect: () => void
}

export function safeLogout(deps: Deps, message?: string) {
  deps.stopPlaybackPolling()
  deps.playbackDisconnect()
  deps.store.set({
    ...deps.store.getState(),
    status: 'idle',
    error: message ?? null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
    playlists: [],
    topArtists: [],
    current: null,
  })
}

export function ensureFreshTokenFactory(deps: Deps) {
  return async function ensureFreshToken(): Promise<string | null> {
    return deps.store.getState().status === 'authenticated' ? 'native' : null
  }
}
