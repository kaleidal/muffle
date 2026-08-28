import { apiCall, apiCallJson, apiCallText, apiGet, apiGetUrl } from '../api'
import type {
  SpotifyArtist,
  SpotifyPaging,
  SpotifyPlaylist,
  SpotifyPlaylistMeta,
  SpotifyPlaylistTracksPage,
  SpotifySavedTracksPage
} from '../types'
import { mapToPlayableTrack, type PlayableTrack } from '../mappers'

export async function fetchPlaylistsPage(token: string, url = '/me/playlists?limit=50') {
  const page = url.startsWith('http')
    ? await apiGetUrl<SpotifyPaging<SpotifyPlaylist>>(token, url)
    : await apiGet<SpotifyPaging<SpotifyPlaylist>>(token, url)
  return { items: page.items ?? [], next: page.next ?? null }
}

export async function getPlaylistView(token: string, playlistId: string) {
  const [meta, page] = await Promise.all([
    apiGet<SpotifyPlaylistMeta>(token, `/playlists/${encodeURIComponent(playlistId)}?market=from_token`),
    apiGet<SpotifyPlaylistTracksPage>(
      token,
      `/playlists/${encodeURIComponent(playlistId)}/items?limit=50&market=from_token&additional_types=track,episode`,
    ),
  ])

  return {
    id: meta.id,
    name: meta.name,
    uri: meta.uri,
    snapshotId: meta.snapshot_id ?? null,
    images: meta.images || [],
    ownerName: meta.owner?.display_name || 'Spotify',
    ownerId: meta.owner?.id || null,
    tracks: mapPlaylistItems(page),
    next: page.next ?? null,
    total: page.total ?? meta.tracks?.total ?? page.items?.length ?? 0,
  }
}

export async function getLikedSongsView(token: string) {
  const page = await apiGet<SpotifySavedTracksPage>(token, '/me/tracks?limit=50&market=from_token')

  return {
    id: 'liked',
    name: 'Liked Songs',
    uri: '',
    images: [],
    ownerName: 'You',
    ownerId: null,
    snapshotId: null,
    tracks: mapPlaylistItems(page),
    next: page.next ?? null,
    total: page.total ?? page.items?.length ?? 0,
  }
}

export async function getPlaylistItemsPage(token: string, url: string) {
  const page = await apiGetUrl<SpotifyPlaylistTracksPage | SpotifySavedTracksPage>(token, url)
  return {
    tracks: mapPlaylistItems(page),
    next: page.next ?? null,
    total: page.total,
  }
}

function mapPlaylistItems(page: SpotifyPlaylistTracksPage | SpotifySavedTracksPage) {
  const tracks: PlayableTrack[] = []
  for (const entry of page.items ?? []) {
    const item = 'item' in entry ? entry.item ?? entry.track : entry.track
    if (item) tracks.push(mapToPlayableTrack(item))
  }
  return tracks
}

export async function fetchTopArtists(token: string) {
  const res = await apiGet<{ items: SpotifyArtist[] }>(token, '/me/top/artists?limit=10&time_range=short_term')
  return res.items || []
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
  await apiCall(token, { method: 'POST', path: `/playlists/${encodeURIComponent(args.playlistId)}/items`, body: { uris } })
}

export async function removeTracksFromPlaylist(token: string, args: { playlistId: string; uris: string[]; snapshotId?: string | null }) {
  const items = args.uris.filter(Boolean).map((uri) => ({ uri }))
  if (!items.length) return null
  const body: { items: Array<{ uri: string }>; snapshot_id?: string } = { items }
  if (args.snapshotId) body.snapshot_id = args.snapshotId
  const result = await apiCallJson<{ snapshot_id?: string }>(token, {
    method: 'DELETE',
    path: `/playlists/${encodeURIComponent(args.playlistId)}/items`,
    body,
  })
  return result?.snapshot_id ?? null
}

export async function unsaveFromLibrary(token: string, uris: string[]) {
  const clean = uris.filter(Boolean).slice(0, 40)
  if (!clean.length) return
  const query = new URLSearchParams({ uris: clean.join(',') })
  await apiCall(token, { method: 'DELETE', path: `/me/library?${query}` })
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

  const result = await apiCallJson<{ snapshot_id?: string }>(token, {
    method: 'PUT',
    path: `/playlists/${encodeURIComponent(args.playlistId)}/items`,
    body
  })
  return result?.snapshot_id ?? null
}

export async function saveTracksToLiked(token: string, trackIds: string[]) {
  const ids = (trackIds || []).filter(Boolean).slice(0, 40)
  if (!ids.length) return
  const uris = ids.map((id) => `spotify:track:${id}`)
  const qs = new URLSearchParams({ uris: uris.join(',') })
  await apiCall(token, { method: 'PUT', path: `/me/library?${qs.toString()}` })
}

export async function uploadPlaylistCoverJpegBase64(token: string, args: { playlistId: string; jpegBase64: string }) {
  const payload = (args.jpegBase64 || '').trim()
  if (!payload) throw new Error('Cover image data is required')

  await apiCallText(token, {
    method: 'PUT',
    path: `/playlists/${encodeURIComponent(args.playlistId)}/images`,
    textBody: payload,
    contentType: 'image/jpeg'
  })
}

export async function isTrackInLiked(token: string, trackId: string): Promise<boolean> {
  const id = String(trackId || '').trim()
  if (!id) return false
  const qs = new URLSearchParams({ uris: `spotify:track:${id}` })
  const res = await apiGet<boolean[]>(token, `/me/library/contains?${qs.toString()}`)
  return !!res?.[0]
}

type PlaylistTracksContainsPage = {
  items?: Array<{
    item?: { uri?: string | null; id?: string | null } | null
    track?: { uri?: string | null; id?: string | null } | null
  }>
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
  const fields = 'items(item(uri,id)),next'

  let page = await apiGet<PlaylistTracksContainsPage>(
    token,
    `/playlists/${encodeURIComponent(playlistId)}/items?limit=100&market=from_token&fields=${encodeURIComponent(fields)}`
  )

  let guard = 0
  while (guard < maxPages) {
    guard += 1
    for (const it of page?.items || []) {
      const uri = it?.item?.uri ?? it?.track?.uri
      if (uri && uri === trackUri) return true
    }

    if (!page?.next) break
    page = await apiGetUrl<PlaylistTracksContainsPage>(token, page.next)
  }

  return false
}
