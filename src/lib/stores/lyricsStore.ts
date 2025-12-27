import { writable } from 'svelte/store'
import type { Track } from './playerStore'
import { fetchLyricsFromLRCLib, type LRCLibLyricsResponse } from '../utils/lrclib'
import { parseSyncedLyrics, type LyricLine } from '../utils/lrc'

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'error'

export type LyricsData = {
  source: 'lrclib'
  instrumental: boolean
  plainLyrics: string | null
  syncedLyricsRaw: string | null
  syncedLines: LyricLine[]
  meta: {
    trackName: string
    artistName: string
    albumName: string
    durationSeconds: number
  }
}

export type LyricsState = {
  status: LyricsStatus
  trackId: string | null
  error: string | null
  data: LyricsData | null
}

function normalizeKeyPart(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function pickPrimaryArtist(artist: string) {
  const raw = (artist || '').trim()
  if (!raw) return ''
  return raw.split(',')[0]?.trim() ?? raw
}

function buildKey(args: { trackName: string; artistName: string; albumName: string; durationSeconds: number }) {
  return `${normalizeKeyPart(args.artistName)}|${normalizeKeyPart(args.albumName)}|${normalizeKeyPart(args.trackName)}|${Math.round(args.durationSeconds)}`
}

function createLyricsStore() {
  const { subscribe, set, update } = writable<LyricsState>({
    status: 'idle',
    trackId: null,
    error: null,
    data: null
  })

  const cache = new Map<string, LyricsData | null>()
  let inFlight: AbortController | null = null
  let lastKey: string | null = null

  async function loadForTrack(track: Track) {
    const durationSeconds = Math.max(0, Math.round(track.duration / 1000))

    const primaryArtist = pickPrimaryArtist(track.artist)
    const meta = {
      trackName: track.name,
      artistName: primaryArtist,
      albumName: track.album,
      durationSeconds
    }

    const key = buildKey(meta)
    lastKey = key

    if (cache.has(key)) {
      const cached = cache.get(key) ?? null
      set({ status: 'ready', trackId: track.id, error: null, data: cached })
      return
    }

    if (inFlight) inFlight.abort()
    inFlight = new AbortController()

    set({ status: 'loading', trackId: track.id, error: null, data: null })

    let res: LRCLibLyricsResponse | null = null
    try {
      res = await fetchLyricsFromLRCLib({
        trackName: meta.trackName,
        artistName: meta.artistName,
        albumName: meta.albumName,
        durationSeconds: meta.durationSeconds,
        signal: inFlight.signal
      })
    } catch (e) {
      if ((e as any)?.name === 'AbortError') return
      const msg = String((e as any)?.message || e || 'Failed to load lyrics')
      cache.set(key, null)
      update((s) => (lastKey === key ? { ...s, status: 'error', error: msg, data: null } : s))
      return
    }

    if (!res) {
      cache.set(key, null)
      update((s) => (lastKey === key ? { ...s, status: 'ready', error: null, data: null } : s))
      return
    }

    const syncedLyricsRaw = res.syncedLyrics ?? null
    const syncedLines = syncedLyricsRaw ? parseSyncedLyrics(syncedLyricsRaw) : []

    const data: LyricsData = {
      source: 'lrclib',
      instrumental: !!res.instrumental,
      plainLyrics: res.plainLyrics ?? null,
      syncedLyricsRaw,
      syncedLines,
      meta
    }

    cache.set(key, data)
    update((s) => (lastKey === key ? { ...s, status: 'ready', error: null, data } : s))
  }

  function clear() {
    if (inFlight) inFlight.abort()
    inFlight = null
    lastKey = null
    set({ status: 'idle', trackId: null, error: null, data: null })
  }

  return { subscribe, loadForTrack, clear }
}

export const lyricsStore = createLyricsStore()
