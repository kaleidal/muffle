import { apiGet } from './api'
import type { HomeAlbum, HomeArtist, HomePlaylist, HomeShow, HomeTrack } from './home'

export type SearchResults = {
  tracks: HomeTrack[]
  artists: HomeArtist[]
  albums: HomeAlbum[]
  playlists: HomePlaylist[]
  shows: HomeShow[]
  episodes: Array<{ id: string; name: string; uri: string; images?: Array<{ url: string }>; show?: { name: string } }>
}
type Page<T> = { items?: Array<T | null> }

export async function searchSpotify(query: string): Promise<SearchResults> {
  const params = new URLSearchParams({
    q: query,
    type: 'track,artist,album,playlist,show,episode',
    limit: '12',
    market: 'from_token',
  })
  const result = await apiGet<{
    tracks?: Page<HomeTrack>
    artists?: Page<HomeArtist>
    albums?: Page<HomeAlbum>
    playlists?: Page<HomePlaylist>
    shows?: Page<HomeShow>
    episodes?: Page<SearchResults['episodes'][number]>
  }>('native', `/search?${params}`)
  const compact = <T>(page?: Page<T>) => (page?.items ?? []).filter((item): item is T => item !== null)
  return {
    tracks: compact(result.tracks),
    artists: compact(result.artists),
    albums: compact(result.albums),
    playlists: compact(result.playlists),
    shows: compact(result.shows),
    episodes: compact(result.episodes),
  }
}
