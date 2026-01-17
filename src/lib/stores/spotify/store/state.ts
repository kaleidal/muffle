import type { SpotifyArtist, SpotifyCurrentlyPlaying, SpotifyPlaylist, SpotifyUser } from '../types'
import type { LibrespotStatus } from '../librespot'

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
  librespot: { status: LibrespotStatus; available: boolean }
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
  current: null,
  librespot: { status: 'unavailable', available: false }
}

export function isUnauthorized(err: unknown) {
  const msg = String((err as any)?.message || err || '')
  return /\bSpotify API error 401\b/i.test(msg)
}
