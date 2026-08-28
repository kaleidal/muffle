import { apiGet } from './api'

export type SpotifyImage = { url: string; width?: number; height?: number }
export type HomeArtist = { id: string; name: string; uri: string; images?: SpotifyImage[] }
export type HomeAlbum = {
  id: string
  name: string
  uri: string
  images: SpotifyImage[]
  artists: Array<{ id: string; name: string; uri: string }>
}
export type HomeTrack = {
  id: string
  name: string
  uri: string
  duration_ms: number
  artists: Array<{ id: string; name: string; uri: string }>
  album: HomeAlbum
}
export type HomePlaylist = {
  id: string
  name: string
  uri: string
  description?: string
  images: SpotifyImage[]
  owner?: { display_name?: string }
}
export type HomeShow = {
  id: string
  name: string
  uri: string
  publisher?: string
  images: SpotifyImage[]
}

export type HomeData = {
  recent: HomeTrack[]
  topTracks: HomeTrack[]
  recommendations: HomeTrack[]
  topArtists: HomeArtist[]
  albums: HomeAlbum[]
  shows: HomeShow[]
}

type Page<T> = { items?: T[] }

async function settled<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise
  } catch {
    return fallback
  }
}

export async function loadHome(token: string): Promise<HomeData> {
  const [recent, topTracks, topArtists, albums, shows] = await Promise.all([
    settled(
      apiGet<{ items?: Array<{ track?: HomeTrack }> }>(token, '/me/player/recently-played?limit=24'),
      {},
    ),
    settled(apiGet<Page<HomeTrack>>(token, '/me/top/tracks?time_range=short_term&limit=20'), {}),
    settled(apiGet<Page<HomeArtist>>(token, '/me/top/artists?time_range=medium_term&limit=16'), {}),
    settled(apiGet<Page<{ album?: HomeAlbum }>>(token, '/me/albums?limit=16'), {}),
    settled(apiGet<Page<{ show?: HomeShow }>>(token, '/me/shows?limit=12'), {}),
  ])

  const uniqueRecent = new Map<string, HomeTrack>()
  for (const item of recent.items ?? []) {
    if (item.track?.id) uniqueRecent.set(item.track.id, item.track)
  }

  const seedTracks = (topTracks.items ?? []).slice(0, 3).map((track) => track.id)
  const seedArtists = (topArtists.items ?? []).slice(0, 2).map((artist) => artist.id)
  const recommendationParams = new URLSearchParams({ limit: '20', market: 'from_token' })
  if (seedTracks.length) recommendationParams.set('seed_tracks', seedTracks.join(','))
  if (seedArtists.length) recommendationParams.set('seed_artists', seedArtists.join(','))
  const recommendations = seedTracks.length || seedArtists.length
    ? await settled(apiGet<{ tracks?: HomeTrack[] }>(token, `/recommendations?${recommendationParams}`), {})
    : {}

  return {
    recent: [...uniqueRecent.values()],
    topTracks: topTracks.items ?? [],
    recommendations: recommendations.tracks ?? [],
    topArtists: topArtists.items ?? [],
    albums: (albums.items ?? []).flatMap((item) => (item.album ? [item.album] : [])),
    shows: (shows.items ?? []).flatMap((item) => (item.show ? [item.show] : [])),
  }
}

export function image(images: SpotifyImage[] | undefined, fallback = '') {
  return images?.[0]?.url ?? fallback
}
