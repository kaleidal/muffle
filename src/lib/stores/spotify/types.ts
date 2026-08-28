export type SpotifyUser = {
  id: string
  display_name: string
  country?: string
  images?: { url: string }[]
}

export type SpotifyImage = { url: string; height?: number; width?: number }

export type SpotifyPlaylist = {
  id: string
  name: string
  images: SpotifyImage[]
  owner?: { display_name?: string; id?: string }
}

export type SpotifyArtist = {
  id: string
  name: string
  images?: SpotifyImage[]
}

export type SpotifyCurrentlyPlaying = {
  is_playing: boolean
  progress_ms: number
  item: {
    id: string
    name: string
    duration_ms: number
    artists: { name: string }[]
    album: { name: string; images: SpotifyImage[] }
  } | null
}

export type SpotifyQueue = {
  currently_playing: SpotifyCurrentlyPlaying['item']
  queue: NonNullable<SpotifyCurrentlyPlaying['item']>[]
}

export type SpotifyMePlayer = {
  shuffle_state: boolean
}

export type SpotifyDevice = {
  id: string | null
  name: string
  type: string
  is_active: boolean
}

export type SpotifyPaging<T> = {
  items: T[]
  next: string | null
  total?: number
}

export type SpotifyDevicesResponse = {
  devices: SpotifyDevice[]
}

export type SpotifyPlaylistMeta = {
  id: string
  name: string
  uri: string
  images: SpotifyImage[]
  owner?: { display_name?: string; id?: string }
  snapshot_id?: string
  tracks?: { total?: number }
}

export type SpotifyPlaylistTracksPage = {
  items: Array<{
    item?: {
      id: string
      uri: string
      name: string
      duration_ms: number
      artists: { name: string }[]
      album: { name: string; images: SpotifyImage[] }
    } | null
    track: {
      id: string
      uri: string
      name: string
      duration_ms: number
      artists: { name: string }[]
      album: { name: string; images: SpotifyImage[] }
    } | null
  }>
  next: string | null
  total?: number
}

export type SpotifySavedTracksPage = {
  items: Array<{
    track: {
      id: string
      uri: string
      name: string
      duration_ms: number
      artists: { name: string }[]
      album: { name: string; images: SpotifyImage[] }
    } | null
  }>
  next: string | null
  total?: number
}
