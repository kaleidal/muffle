export type LRCLibLyricsResponse = {
  id: number
  name: string
  trackName: string
  artistName: string
  albumName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

export async function fetchLyricsFromLRCLib(args: {
  trackName: string
  artistName: string
  albumName?: string
  durationSeconds?: number
  signal?: AbortSignal
}): Promise<LRCLibLyricsResponse | null> {
  const params = new URLSearchParams()
  params.set('track_name', args.trackName)
  params.set('artist_name', args.artistName)
  if (args.albumName) params.set('album_name', args.albumName)
  if (typeof args.durationSeconds === 'number' && Number.isFinite(args.durationSeconds)) {
    params.set('duration', String(args.durationSeconds))
  }

  const url = `https://lrclib.net/api/get?${params.toString()}`

  const res = await fetch(url, {
    method: 'GET',
    signal: args.signal,
    headers: {
      Accept: 'application/json'
    }
  })

  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`LRCLIB error ${res.status}`)
  }

  const json = (await res.json()) as LRCLibLyricsResponse
  return json
}
