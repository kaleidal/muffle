export const DEFAULT_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-top-read',
  'user-read-recently-played'
]

export const STORAGE_KEYS = {
  accessToken: 'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt: 'spotify_expires_at'
} as const

export function getClientId() {
  return (import.meta as any).env?.VITE_SPOTIFY_CLIENT_ID || '467492da42cc4b87882001c52c7a7721'
}
