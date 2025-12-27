import type { Track } from '../playerStore'
import type { SpotifyImage, SpotifyCurrentlyPlaying } from './types'

export function mapToTrack(item: NonNullable<SpotifyCurrentlyPlaying['item']>): Track {
  return {
    id: item.id,
    name: item.name,
    artist: item.artists.map((a) => a.name).join(', '),
    album: item.album.name,
    albumArt: item.album.images?.[0]?.url || '',
    duration: item.duration_ms,
    uri: (item as any).uri || ''
  }
}

export type PlayableTrack = {
  id: string
  name: string
  artist: string
  album: string
  albumArt: string
  duration: number
  uri: string
}

export function mapToPlayableTrack(item: {
  id: string
  name: string
  duration_ms: number
  uri: string
  artists: { name: string }[]
  album: { name: string; images: SpotifyImage[] }
}): PlayableTrack {
  return {
    id: item.id,
    name: item.name,
    artist: (item.artists || []).map((a) => a.name).join(', '),
    album: item.album?.name ?? '',
    albumArt: item.album?.images?.[0]?.url ?? '',
    duration: item.duration_ms ?? 0,
    uri: item.uri
  }
}
