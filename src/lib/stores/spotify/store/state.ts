import type { SpotifyArtist, SpotifyCurrentlyPlaying, SpotifyPlaylist, SpotifyUser } from '../types'

export type SpotifyStatus = 'idle' | 'authenticating' | 'authenticated'

export type SpotifyState = {
  status: SpotifyStatus
  error: string | null
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
  user: SpotifyUser | null
  playlists: SpotifyPlaylist[]
  featuredPlaylists: SpotifyPlaylist[]
  topArtists: SpotifyArtist[]
  current: SpotifyCurrentlyPlaying | null
}

export const initialSpotifyState: SpotifyState = {
  status: 'idle',
  error: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  user: null,
  playlists: [],
  featuredPlaylists: [],
  topArtists: [],
  current: null
}

export function isUnauthorized(err: unknown) {
  const msg = String((err as any)?.message || err || '')
  return /\bSpotify API error 401\b/i.test(msg)
}
