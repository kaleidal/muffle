import type { SpotifyState } from './state'
import { STORAGE_KEYS, getClientId } from '../config'

type StoreLike = {
  getState: () => SpotifyState
  update: (fn: (s: SpotifyState) => SpotifyState) => void
  set: (s: SpotifyState) => void
}

type Deps = {
  store: StoreLike
  stopPlaybackPolling: () => void
  webPlaybackDisconnect: () => void
}

export function clearPersisted() {
  localStorage.removeItem(STORAGE_KEYS.accessToken)
  localStorage.removeItem(STORAGE_KEYS.refreshToken)
  localStorage.removeItem(STORAGE_KEYS.expiresAt)
}

export function persistTokens(store: StoreLike, args: { accessToken: string; refreshToken?: string | null; expiresIn: number }) {
  const expiresAt = Date.now() + args.expiresIn * 1000
  localStorage.setItem(STORAGE_KEYS.accessToken, args.accessToken)
  localStorage.setItem(STORAGE_KEYS.expiresAt, String(expiresAt))
  if (args.refreshToken !== undefined) {
    if (args.refreshToken) localStorage.setItem(STORAGE_KEYS.refreshToken, args.refreshToken)
    else localStorage.removeItem(STORAGE_KEYS.refreshToken)
  }

  store.update((s) => ({
    ...s,
    accessToken: args.accessToken,
    refreshToken: args.refreshToken !== undefined ? args.refreshToken : s.refreshToken,
    expiresAt
  }))
}

export function safeLogout(deps: Deps, message?: string) {
  deps.stopPlaybackPolling()
  clearPersisted()
  deps.webPlaybackDisconnect()

  deps.store.set({
    ...deps.store.getState(),
    status: 'idle',
    error: message ?? null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
    playlists: [],
    featuredPlaylists: [],
    topArtists: [],
    current: null
  })
}

export function loadPersistedSession(store: StoreLike) {
  const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken)
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken)
  const expiresAtRaw = localStorage.getItem(STORAGE_KEYS.expiresAt)
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : null

  return { accessToken, refreshToken, expiresAt }
}

export function ensureFreshTokenFactory(deps: Deps) {
  return async function ensureFreshToken() {
    const state = deps.store.getState()
    const accessToken = state.accessToken
    const refreshToken = state.refreshToken
    const expiresAt = state.expiresAt

    if (!accessToken) return null

    if (expiresAt && expiresAt - Date.now() > 60_000) return accessToken

    if (!refreshToken || !window.electron?.spotifyRefresh) {
      if (expiresAt && expiresAt <= Date.now()) {
        safeLogout(deps, 'Spotify session expired. Please log in again.')
        return null
      }
      return accessToken
    }

    const clientId = getClientId()

    try {
      const refreshed = await window.electron.spotifyRefresh({ clientId, refreshToken })
      if (!refreshed?.accessToken) throw new Error('Spotify token refresh failed')
      persistTokens(deps.store, {
        accessToken: refreshed.accessToken,
        refreshToken: 'refreshToken' in refreshed ? (refreshed as any).refreshToken : undefined,
        expiresIn: refreshed.expiresIn
      })
      return refreshed.accessToken
    } catch (e: any) {
      const msg = String(e?.message || e || '')
      const isRevoked = /revoked|invalid_grant/i.test(msg)
      const expired = !!expiresAt && expiresAt <= Date.now()

      if (isRevoked || expired) {
        safeLogout(deps, 'Spotify session expired. Please log in again.')
        return null
      }

      deps.store.update((s) => ({ ...s, error: 'Spotify refresh failed. Retrying…' }))
      return accessToken
    }
  }
}
