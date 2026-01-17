import { apiCall, apiCallJson, apiGet, apiGetUrl } from '../api'
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
    snapshotId: meta.snapshot_id ?? null,
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

export async function createPlaylist(token: string, args: { userId: string; name: string }) {
  const name = args.name.trim()
  if (!name) throw new Error('Playlist name is required')

  return await apiCallJson<SpotifyPlaylist>(token, {
    method: 'POST',
    path: `/users/${encodeURIComponent(args.userId)}/playlists`,
    body: { name, public: false }
  })
}

export async function renamePlaylist(token: string, args: { playlistId: string; name: string }) {
  const name = args.name.trim()
  if (!name) throw new Error('Playlist name is required')
  await apiCall(token, { method: 'PUT', path: `/playlists/${encodeURIComponent(args.playlistId)}`, body: { name } })
}

export async function addTracksToPlaylist(token: string, args: { playlistId: string; uris: string[] }) {
  const uris = (args.uris || []).filter(Boolean)
  if (!uris.length) return
  await apiCall(token, { method: 'POST', path: `/playlists/${encodeURIComponent(args.playlistId)}/tracks`, body: { uris } })
}

export async function reorderPlaylistTrack(token: string, args: { playlistId: string; fromIndex: number; toIndex: number; snapshotId?: string | null }) {
  const from = Math.max(0, args.fromIndex | 0)
  const to = Math.max(0, args.toIndex | 0)
  if (from === to) return null

  const body: any = {
    range_start: from,
    insert_before: to,
    range_length: 1
  }

  if (args.snapshotId) body.snapshot_id = args.snapshotId

  const res = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(args.playlistId)}/tracks`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Spotify API error ${res.status} ${res.statusText} ${text}`)
  }

  const json = (await res.json().catch(() => null)) as any
  return (json?.snapshot_id as string | undefined) ?? null
}

export async function saveTracksToLiked(token: string, trackIds: string[]) {
  const ids = (trackIds || []).filter(Boolean).slice(0, 50)
  if (!ids.length) return
  const qs = new URLSearchParams({ ids: ids.join(',') })
  await apiCall(token, { method: 'PUT', path: `/me/tracks?${qs.toString()}` })
}

export async function uploadPlaylistCoverJpegBase64(token: string, args: { playlistId: string; jpegBase64: string }) {
  const payload = (args.jpegBase64 || '').trim()
  if (!payload) throw new Error('Cover image data is required')

  const res = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(args.playlistId)}/images`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'image/jpeg'
    },
    body: payload
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Spotify API error ${res.status} ${res.statusText} ${text}`)
  }
}

export async function isTrackInLiked(token: string, trackId: string): Promise<boolean> {
  const id = String(trackId || '').trim()
  if (!id) return false
  const qs = new URLSearchParams({ ids: id })
  const res = await apiGet<boolean[]>(token, `/me/tracks/contains?${qs.toString()}`)
  return !!res?.[0]
}

type PlaylistTracksContainsPage = {
  items?: Array<{ track?: { uri?: string | null; id?: string | null } | null }>
  next?: string | null
}

export async function playlistContainsTrackUri(
  token: string,
  args: { playlistId: string; trackUri: string; maxPages?: number }
): Promise<boolean> {
  const playlistId = String(args.playlistId || '').trim()
  const trackUri = String(args.trackUri || '').trim()
  if (!playlistId || !trackUri) return false

  const maxPages = Math.max(1, Math.min(25, args.maxPages ?? 6))
  const fields = 'items(track(uri,id)),next'

  let page = await apiGet<PlaylistTracksContainsPage>(
    token,
    `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&market=from_token&fields=${encodeURIComponent(fields)}`
  )

  let guard = 0
  while (guard < maxPages) {
    guard += 1
    for (const it of page?.items || []) {
      const uri = it?.track?.uri
      if (uri && uri === trackUri) return true
    }

    if (!page?.next) break
    page = await apiGetUrl<PlaylistTracksContainsPage>(token, page.next)
  }

  return false
}
