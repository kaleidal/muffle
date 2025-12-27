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
