import { apiGet, apiGetUrl } from '../api'
import type {
  SpotifyArtist,
  SpotifyPaging,
  SpotifyPlaylist,
  SpotifyPlaylistMeta,
  SpotifyPlaylistTracksPage,
  SpotifySavedTracksPage,
  SpotifySearchTracksResponse
} from '../types'
import { mapToPlayableTrack, type PlayableTrack } from '../mappers'

type SpotifyRecommendationsResponse = {
  tracks: Array<{
    id: string
    uri: string
    name: string
    duration_ms: number
    artists: { name: string }[]
    album: { name: string; images: { url: string }[] }
  }>
}

type SpotifyTopTracksResponse = {
  items: SpotifyRecommendationsResponse['tracks']
}

type SpotifyRecentlyPlayedResponse = {
  items: Array<{
    track: SpotifyRecommendationsResponse['tracks'][number] | null
    context: { uri: string; type: string } | null
  }>
}

export async function fetchAllPlaylists(token: string) {
  const items: SpotifyPlaylist[] = []
  let page = await apiGet<SpotifyPaging<SpotifyPlaylist>>(token, '/me/playlists?limit=50')
  items.push(...(page.items || []))

  let guard = 0
  while (page.next && guard < 20) {
    guard += 1
    page = await apiGetUrl<SpotifyPaging<SpotifyPlaylist>>(token, page.next)
    items.push(...(page.items || []))
  }

  return items
}

export async function searchTracks(token: string, query: string): Promise<PlayableTrack[]> {
  const q = query.trim()
  if (!q) return []

  const res = await apiGet<SpotifySearchTracksResponse>(
    token,
    `/search?type=track&limit=30&market=from_token&q=${encodeURIComponent(q)}`
  )

  const items = res?.tracks?.items || []
  return items.map(mapToPlayableTrack)
}

export async function getPlaylistView(token: string, playlistId: string) {
  const meta = await apiGet<SpotifyPlaylistMeta>(token, `/playlists/${encodeURIComponent(playlistId)}?market=from_token`)

  const tracks: PlayableTrack[] = []
  let page = await apiGet<SpotifyPlaylistTracksPage>(
    token,
    `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&market=from_token`
  )

  const push = (p: SpotifyPlaylistTracksPage) => {
    for (const it of p.items || []) {
      if (!it?.track) continue
      tracks.push(mapToPlayableTrack(it.track))
    }
  }

  push(page)

  let guard = 0
  while (page.next && guard < 20) {
    guard += 1
    page = await apiGetUrl<SpotifyPlaylistTracksPage>(token, page.next)
    push(page)
  }

  return {
    id: meta.id,
    name: meta.name,
    uri: meta.uri,
    images: meta.images || [],
    ownerName: meta.owner?.display_name || 'Spotify',
    tracks
  }
}

export async function getLikedSongsView(token: string) {
  const tracks: PlayableTrack[] = []
  let page = await apiGet<SpotifySavedTracksPage>(token, '/me/tracks?limit=50&market=from_token')

  const push = (p: SpotifySavedTracksPage) => {
    for (const it of p.items || []) {
      if (!it?.track) continue
      tracks.push(mapToPlayableTrack(it.track))
    }
  }

  push(page)

  let guard = 0
  while (page.next && guard < 10) {
    guard += 1
    page = await apiGetUrl<SpotifySavedTracksPage>(token, page.next)
    push(page)
  }

  return {
    id: 'liked',
    name: 'Liked Songs',
    uri: '',
    images: [],
    ownerName: 'You',
    tracks
  }
}

export async function fetchTopArtists(token: string) {
  const res = await apiGet<{ items: SpotifyArtist[] }>(token, '/me/top/artists?limit=10&time_range=short_term')
  return res.items || []
}

export async function fetchTopTracks(token: string, limit = 12): Promise<PlayableTrack[]> {
  const l = Math.max(1, Math.min(50, limit | 0))
  const res = await apiGet<SpotifyTopTracksResponse>(
    token,
    `/me/top/tracks?limit=${l}&time_range=short_term&market=from_token`
  )
  return (res.items || []).map(mapToPlayableTrack)
}

export async function fetchRecentlyPlayedPlaylistContexts(token: string, limit = 50): Promise<string[]> {
  const l = Math.max(1, Math.min(50, limit | 0))
  const res = await apiGet<SpotifyRecentlyPlayedResponse>(token, `/me/player/recently-played?limit=${l}`)

  const seen = new Set<string>()
  const playlistIds: string[] = []

  for (const it of res.items || []) {
    const uri = it?.context?.uri
    if (!uri) continue
    const m = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(uri)
    if (!m) continue
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)
    playlistIds.push(id)
  }

  return playlistIds
}

export async function fetchRecommendations(
  token: string,
  args: { seedArtistIds?: string[]; seedTrackIds?: string[]; limit?: number }
): Promise<PlayableTrack[]> {
  const seedsArtists = (args.seedArtistIds || []).filter(Boolean)
  const seedsTracks = (args.seedTrackIds || []).filter(Boolean)
  const limit = Math.max(1, Math.min(50, args.limit ?? 30))

  const qs = new URLSearchParams({
    limit: String(limit),
    market: 'from_token'
  })

  if (seedsArtists.length) qs.set('seed_artists', seedsArtists.slice(0, 5).join(','))
  if (seedsTracks.length) qs.set('seed_tracks', seedsTracks.slice(0, 5).join(','))

  const res = await apiGet<SpotifyRecommendationsResponse>(token, `/recommendations?${qs.toString()}`)
  return (res.tracks || []).map(mapToPlayableTrack)
}
