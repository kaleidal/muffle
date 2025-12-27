import { get, writable } from 'svelte/store'
import { playerStore, type Track } from './playerStore'

declare global {
  interface Window {
    Spotify?: any
    onSpotifyWebPlaybackSDKReady?: () => void
  }
}

type SpotifyUser = {
  id: string
  display_name: string
  country?: string
  images?: { url: string }[]
}

type SpotifyImage = { url: string; height?: number; width?: number }

export type SpotifyPlaylist = {
  id: string
  name: string
  images: SpotifyImage[]
  owner?: { display_name?: string }
}

type SpotifyFeaturedPlaylists = {
  playlists: { items: SpotifyPlaylist[] }
}

type SpotifyCategoryPlaylists = {
  playlists: { items: SpotifyPlaylist[] }
}

type SpotifyCategoriesResponse = {
  categories: { items: { id: string }[] }
}

type SpotifyPaging<T> = {
  items: T[]
  next: string | null
}

type SpotifyArtist = {
  id: string
  name: string
  images?: SpotifyImage[]
}

type SpotifyCurrentlyPlaying = {
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

type SpotifyQueue = {
  currently_playing: SpotifyCurrentlyPlaying['item']
  queue: NonNullable<SpotifyCurrentlyPlaying['item']>[]
}

export type SpotifyDevice = {
  id: string | null
  name: string
  type: string
  is_active: boolean
}

type SpotifyDevicesResponse = {
  devices: SpotifyDevice[]
}

const DEFAULT_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-top-read'
]

const STORAGE_KEYS = {
  accessToken: 'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt: 'spotify_expires_at'
} as const

function getClientId() {
  // Prefer env, fall back to whatever was previously hardcoded.
  return (import.meta as any).env?.VITE_SPOTIFY_CLIENT_ID || '467492da42cc4b87882001c52c7a7721'
}

async function apiGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Spotify API error ${res.status} ${res.statusText} ${text}`)
  }

  return (await res.json()) as T
}

async function apiGetUrl<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Spotify API error ${res.status} ${res.statusText} ${text}`)
  }

  return (await res.json()) as T
}

async function apiCall(token: string, args: { method: 'PUT' | 'POST'; path: string; body?: any }) {
  const res = await fetch(`https://api.spotify.com/v1${args.path}`, {
    method: args.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(args.body ? { 'content-type': 'application/json' } : {})
    },
    body: args.body ? JSON.stringify(args.body) : undefined
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Spotify API error ${res.status} ${res.statusText} ${text}`)
  }
}

function mapToTrack(item: NonNullable<SpotifyCurrentlyPlaying['item']>): Track {
  return {
    id: item.id,
    name: item.name,
    artist: item.artists.map((a) => a.name).join(', '),
    album: item.album.name,
    albumArt: item.album.images?.[0]?.url || '',
    duration: item.duration_ms
  }
}

type SpotifyState = {
  status: 'idle' | 'authenticating' | 'authenticated'
  error: string | null
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
  user: SpotifyUser | null
  playlists: SpotifyPlaylist[]
  featuredPlaylists: SpotifyPlaylist[]
  topArtists: SpotifyArtist[]
  current: SpotifyCurrentlyPlaying | null
}

function createSpotifyStore() {
  const { subscribe, set, update } = writable<SpotifyState>({
    status: 'idle',
    error: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
    playlists: [],
    featuredPlaylists: [],
    topArtists: [],
    current: null
  })

  let stopAuthListener: null | (() => void) = null
  let stopAuthErrorListener: null | (() => void) = null
  let playbackPoll: ReturnType<typeof setInterval> | null = null
  let webPlayer: any | null = null
  let webPlayerInitState: 'idle' | 'in-progress' | 'ready' = 'idle'
  let webPlaybackDeviceId: string | null = null
  let webPlaybackPreferred = false
  let webPlaybackDisabledUntil = 0
  let webPlaybackFailureCount = 0

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  const loadWebPlaybackSdk = async () => {
    if (window.Spotify) return

    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-spotify-sdk]') as HTMLScriptElement | null
      if (existing) {
        const check = () => (window.Spotify ? resolve() : undefined)
        const id = window.setInterval(() => {
          if (window.Spotify) {
            clearInterval(id)
            resolve()
          }
        }, 50)
        window.setTimeout(() => {
          clearInterval(id)
          if (!window.Spotify) reject(new Error('Spotify Web Playback SDK load timed out'))
        }, 10_000)
        check()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      script.setAttribute('data-spotify-sdk', 'true')

      script.onerror = () => reject(new Error('Failed to load Spotify Web Playback SDK'))
      document.head.appendChild(script)

      window.onSpotifyWebPlaybackSDKReady = () => resolve()
      window.setTimeout(() => reject(new Error('Spotify Web Playback SDK load timed out')), 10_000)
    })
  }

  const initWebPlayback = async (connectNow = false) => {
    if (webPlayerInitState === 'in-progress' || webPlayerInitState === 'ready') return
    if (Date.now() < webPlaybackDisabledUntil) return
    webPlayerInitState = 'in-progress'

    try {
      await loadWebPlaybackSdk()

      webPlayer = new window.Spotify.Player({
        name: 'Muffle',
        volume: 0.8,
        getOAuthToken: async (cb: (token: string) => void) => {
          try {
            const token = await ensureFreshToken()
            cb(token || '')
          } catch {
            cb('')
          }
        }
      })

      webPlayer.addListener('ready', async ({ device_id }: { device_id: string }) => {
        webPlaybackDeviceId = device_id
        webPlayerInitState = 'ready'
        // Do NOT auto-transfer playback to this device.
        // Some environments will fail Widevine license acquisition and cause retry storms.
      })

      webPlayer.addListener('not_ready', () => {
        webPlaybackDeviceId = null
        webPlayerInitState = 'idle'
      })

      webPlayer.addListener('player_state_changed', (state: any) => {
        if (!state) return
        const currentItem = state.track_window?.current_track
        if (!currentItem) return

        const currentTrack: Track = {
          id: currentItem.id,
          name: currentItem.name,
          artist: (currentItem.artists || []).map((a: any) => a.name).join(', '),
          album: currentItem.album?.name ?? '',
          albumArt: currentItem.album?.images?.[0]?.url ?? '',
          duration: currentItem.duration_ms ?? 0
        }

        const nextItem = state.track_window?.next_tracks?.[0] ?? null
        const nextTrack: Track | null = nextItem
          ? {
              id: nextItem.id,
              name: nextItem.name,
              artist: (nextItem.artists || []).map((a: any) => a.name).join(', '),
              album: nextItem.album?.name ?? '',
              albumArt: nextItem.album?.images?.[0]?.url ?? '',
              duration: nextItem.duration_ms ?? 0
            }
          : null

        const queueTracks: Track[] = (state.track_window?.next_tracks ?? []).slice(0, 20).map((t: any) => ({
          id: t.id,
          name: t.name,
          artist: (t.artists || []).map((a: any) => a.name).join(', '),
          album: t.album?.name ?? '',
          albumArt: t.album?.images?.[0]?.url ?? '',
          duration: t.duration_ms ?? 0
        }))

        const progressPct = currentTrack.duration ? (state.position / currentTrack.duration) * 100 : 0

        playerStore.setPlaybackState({
          current: currentTrack,
          next: nextTrack,
          queue: queueTracks,
          isPlaying: !state.paused,
          progressPct
        })
      })

      webPlayer.addListener('initialization_error', ({ message }: any) => {
        update((s) => ({ ...s, error: message || 'Playback init error' }))
        webPlayerInitState = 'idle'
      })

      webPlayer.addListener('authentication_error', ({ message }: any) => {
        update((s) => ({ ...s, error: message || 'Playback auth error' }))
        webPlayerInitState = 'idle'
      })

      webPlayer.addListener('account_error', ({ message }: any) => {
        // This is commonly "Premium required".
        update((s) => ({ ...s, error: message || 'Playback account error' }))
        webPlayerInitState = 'idle'
      })

      webPlayer.addListener('playback_error', ({ message }: any) => {
        const msg = String(message || 'Playback error')
        webPlaybackFailureCount += 1

        // Back off aggressively if playback keeps failing (e.g. Widevine 500 loops).
        if (webPlaybackFailureCount >= 2) {
          webPlaybackDisabledUntil = Date.now() + 5 * 60_000
          webPlaybackPreferred = false
          try {
            webPlayer?.disconnect?.()
          } catch {
            // ignore
          }
          webPlayer = null
          webPlaybackDeviceId = null
          webPlayerInitState = 'idle'
          update((s) => ({ ...s, error: 'In-app playback unavailable (DRM license failed). Using Spotify Connect instead.' }))
        } else {
          update((s) => ({ ...s, error: msg }))
        }
      })

      // Connecting triggers EME/Widevine negotiation in some environments.
      // Only connect on explicit user intent (e.g. opening Devices / choosing Muffle).
      if (connectNow) {
        const ok = await webPlayer.connect()
        if (!ok) {
          webPlayerInitState = 'idle'
          update((s) => ({ ...s, error: 'Failed to connect Web Playback device' }))
        }
      } else {
        webPlayerInitState = 'idle'
      }
    } catch (e: any) {
      update((s) => ({ ...s, error: e?.message || 'Failed to initialize playback' }))
      webPlayerInitState = 'idle'
    }
  }

  const getActiveDeviceId = async (token: string): Promise<string | null> => {
    try {
      const res = await apiGet<SpotifyDevicesResponse>(token, '/me/player/devices')
      const active = (res.devices || []).find((d) => d.is_active && d.id)
      return active?.id ?? null
    } catch {
      return null
    }
  }

  const fetchPlaybackOnce = async (token: string) => {
    const [current, queue] = await Promise.all([
      apiGet<SpotifyCurrentlyPlaying>(token, '/me/player/currently-playing'),
      apiGet<SpotifyQueue>(token, '/me/player/queue')
    ])

    update((s) => ({ ...s, current }))

    const prevPlayer = get(playerStore)

    // Spotify can briefly return `item: null` around track boundaries.
    // If we treat that as "nothing playing", the UI flickers and the next-up transition becomes inconsistent.
    const currentTrack = current?.item ? mapToTrack(current.item) : current?.is_playing ? prevPlayer.currentTrack : null
    const nextItem = queue?.queue?.[0] ?? null
    const nextTrack = nextItem ? mapToTrack(nextItem) : null
    const queueTracks = (queue?.queue ?? []).slice(0, 20).map(mapToTrack)

    const progressPct = current?.item && current.item.duration_ms ? (current.progress_ms / current.item.duration_ms) * 100 : prevPlayer.progress

    playerStore.setPlaybackState({
      current: currentTrack,
      next: nextTrack,
      queue: queueTracks,
      isPlaying: current?.is_playing ?? prevPlayer.isPlaying,
      progressPct
    })
  }

  const persist = (args: { accessToken: string; refreshToken: string | null; expiresIn: number }) => {
    const expiresAt = Date.now() + args.expiresIn * 1000
    localStorage.setItem(STORAGE_KEYS.accessToken, args.accessToken)
    localStorage.setItem(STORAGE_KEYS.expiresAt, String(expiresAt))
    if (args.refreshToken) {
      localStorage.setItem(STORAGE_KEYS.refreshToken, args.refreshToken)
    }
    update((s) => ({ ...s, accessToken: args.accessToken, refreshToken: args.refreshToken ?? s.refreshToken, expiresAt }))
  }

  const clearPersisted = () => {
    localStorage.removeItem(STORAGE_KEYS.accessToken)
    localStorage.removeItem(STORAGE_KEYS.refreshToken)
    localStorage.removeItem(STORAGE_KEYS.expiresAt)
  }

  const ensureFreshToken = async () => {
    let accessToken: string | null = null
    let refreshToken: string | null = null
    let expiresAt: number | null = null

    update((s) => {
      accessToken = s.accessToken
      refreshToken = s.refreshToken
      expiresAt = s.expiresAt
      return s
    })

    if (!accessToken) return null

    // refresh if < 60s left
    if (expiresAt && expiresAt - Date.now() > 60_000) return accessToken
    if (!refreshToken || !window.electron?.spotifyRefresh) return accessToken

    const clientId = getClientId()
    try {
      const refreshed = await window.electron.spotifyRefresh({ clientId, refreshToken })
      persist({ accessToken: refreshed.accessToken, refreshToken, expiresIn: refreshed.expiresIn })
      return refreshed.accessToken
    } catch (e: any) {
      const msg = String(e?.message || e || '')
      const isRevoked = /revoked|invalid_grant/i.test(msg)

      // If refresh token is revoked/invalid, or token is expired and we can't refresh, force logout.
      const expired = !!expiresAt && expiresAt <= Date.now()
      if (isRevoked || expired) {
        stopPlaybackPolling()
        clearPersisted()
        update((s) => ({ ...s, status: 'idle', error: 'Spotify session expired. Please log in again.', accessToken: null, refreshToken: null, expiresAt: null }))
        return null
      }

      // Transient network/DNS failures: keep existing token and surface an error.
      update((s) => ({ ...s, error: 'Spotify refresh failed (network). Retrying…' }))
      return accessToken
    }
  }

  const fetchAllPlaylists = async (token: string) => {
    const items: SpotifyPlaylist[] = []
    let page = await apiGet<SpotifyPaging<SpotifyPlaylist>>(token, '/me/playlists?limit=50')
    items.push(...(page.items || []))
    let guard = 0
    while (page.next && guard < 20) {
      guard++
      page = await apiGetUrl<SpotifyPaging<SpotifyPlaylist>>(token, page.next)
      items.push(...(page.items || []))
    }
    return items
  }

  const fetchFeatured = async (token: string, country?: string) => {
    // Prefer the dedicated endpoint first (often avoids category 404 storms in some markets).
    const featuredPaths = [
      country ? `/browse/featured-playlists?limit=30&country=${encodeURIComponent(country)}` : null,
      '/browse/featured-playlists?limit=30'
    ].filter(Boolean) as string[]

    for (const path of featuredPaths) {
      try {
        const res = await apiGet<SpotifyFeaturedPlaylists>(token, path)
        const items = res?.playlists?.items || []
        if (items.length) return items
      } catch {
        // fall through
      }
    }

    // Fallback: categories. Only use country-qualified requests when we know the market
    // to avoid doubling 404 spam.
    const categoriesPaths = [
      country ? `/browse/categories?limit=50&country=${encodeURIComponent(country)}` : '/browse/categories?limit=50'
    ]

    let categoryIds: string[] = []
    for (const path of categoriesPaths) {
      try {
        const res = await apiGet<SpotifyCategoriesResponse>(token, path)
        const ids = res?.categories?.items?.map((c) => c.id).filter(Boolean) || []
        if (ids.length) {
          // Prefer "toplists" if present, but keep more options for markets where one category 404s.
          const preferred = ids.includes('toplists') ? ['toplists', ...ids.filter((id) => id !== 'toplists')] : ids
          categoryIds = preferred
          break
        }
      } catch {
        // try next
      }
    }

    if (!categoryIds.length) return []

    // Try several categories; some category IDs return 404 in some markets.
    let consecutive404 = 0

    for (const categoryId of categoryIds.slice(0, 10)) {
      const playlistPaths = [
        country
          ? `/browse/categories/${encodeURIComponent(categoryId)}/playlists?limit=30&country=${encodeURIComponent(country)}`
          : `/browse/categories/${encodeURIComponent(categoryId)}/playlists?limit=30`
      ]

      for (const path of playlistPaths) {
        try {
          const res = await apiGet<SpotifyCategoryPlaylists>(token, path)
          const items = res?.playlists?.items || []
          if (items.length) return items
        } catch {
          consecutive404 += 1
          // If we keep hitting 404s, bail quickly to avoid spamming the API.
          if (consecutive404 >= 4) return []
        }
      }
    }

    return []
  }

  const getFirstRunnableDeviceId = async (token: string) => {
    const devices = await apiGet<SpotifyDevicesResponse>(token, '/me/player/devices')
    const active = (devices.devices || []).find((d) => d.is_active && d.id)
    if (active?.id) return active.id

    // Prefer Web Playback only when the user explicitly selected it.
    if (webPlaybackPreferred && webPlaybackDeviceId) return webPlaybackDeviceId

    const any = (devices.devices || []).find((d) => d.id)
    return any?.id ?? null
  }

  const runPlayerCommand = async (token: string, args: { method: 'PUT' | 'POST'; path: string; body?: any }) => {
    const attempt = async () => {
      await apiCall(token, args)
    }

    try {
      await attempt()
      return
    } catch (e: any) {
      const msg = String(e?.message || e || '')
      const isPlayerEndpoint = args.path.startsWith('/me/player')
      const isNotFound = /\bSpotify API error 404\b/i.test(msg)
      const isNoActive = /NO_ACTIVE_DEVICE|No active device found/i.test(msg) || (isPlayerEndpoint && isNotFound)
      const isBadGateway = /\b502\b|Bad gateway/i.test(msg)

      if (isBadGateway) {
        await sleep(350)
        await attempt()
        return
      }

      if (isNoActive) {
        // For pause, treat "no active device" as a no-op.
        if (args.path.startsWith('/me/player/pause')) return

        const target = await getFirstRunnableDeviceId(token)
        if (!target) throw e

        await apiCall(token, { method: 'PUT', path: '/me/player', body: { device_ids: [target], play: false } })
        await sleep(200)
        await attempt()
        return
      }

      throw e
    }
  }

  const fetchAll = async () => {
    const token = await ensureFreshToken()
    if (!token) return

    // Fetch profile first.
    const me = await apiGet<SpotifyUser>(token, '/me')

    const [playlistsRes, topArtistsRes, featuredRes] = await Promise.allSettled([
      fetchAllPlaylists(token),
      apiGet<{ items: SpotifyArtist[] }>(token, '/me/top/artists?limit=10&time_range=short_term'),
      fetchFeatured(token, me.country)
    ])

    const playlists = playlistsRes.status === 'fulfilled' ? playlistsRes.value || [] : []
    const topArtists = topArtistsRes.status === 'fulfilled' ? topArtistsRes.value.items || [] : []
    const featuredPlaylists = featuredRes.status === 'fulfilled' ? featuredRes.value || [] : []

    update((s) => ({
      ...s,
      status: 'authenticated',
      error: null,
      user: me,
      playlists,
      featuredPlaylists,
      topArtists
    }))
  }

  const startPlaybackPolling = () => {
    if (playbackPoll) return
    playbackPoll = setInterval(async () => {
      try {
        const token = await ensureFreshToken()
        if (!token) return

        await fetchPlaybackOnce(token)
      } catch {
        // ignore polling errors
      }
    }, 3000)
  }

  const stopPlaybackPolling = () => {
    if (playbackPoll) clearInterval(playbackPoll)
    playbackPoll = null
  }

  const attachAuthListeners = () => {
    stopAuthListener?.()
    stopAuthErrorListener?.()

    stopAuthListener =
      window.electron?.onSpotifyAuth?.((tokens) => {
      persist(tokens)
      void fetchAll()
      startPlaybackPolling()
      }) ?? null

    stopAuthErrorListener =
      window.electron?.onSpotifyAuthError?.((err) => {
      update((s) => ({ ...s, status: 'idle', error: err.message }))
      }) ?? null
  }

  return {
    subscribe,

    init() {
      attachAuthListeners()

      const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken)
      const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken)
      const expiresAt = localStorage.getItem(STORAGE_KEYS.expiresAt)

      if (accessToken) {
        update((s) => ({
          ...s,
          status: 'authenticated',
          accessToken,
          refreshToken,
          expiresAt: expiresAt ? Number(expiresAt) : null
        }))
        void fetchAll()
        startPlaybackPolling()
      }
    },

    async login() {
      attachAuthListeners()
      update((s) => ({ ...s, status: 'authenticating', error: null }))

      const clientId = getClientId()
      const scopes = DEFAULT_SCOPES

      if (!window.electron?.spotifyLogin) {
        update((s) => ({ ...s, status: 'idle', error: 'Electron bridge not available' }))
        return
      }

      await window.electron.spotifyLogin({ clientId, scopes })
    },

    async refresh() {
      await ensureFreshToken()
    },

    async ensureWebPlaybackReady() {
      // Kick init, but don't block forever.
      if (webPlayerInitState === 'idle') void initWebPlayback(true)
      for (let i = 0; i < 30; i++) {
        if (webPlaybackDeviceId) return { deviceId: webPlaybackDeviceId, status: webPlayerInitState }
        await sleep(100)
      }
      return { deviceId: webPlaybackDeviceId, status: webPlayerInitState }
    },

    async getDevices(): Promise<SpotifyDevice[]> {
      const token = await ensureFreshToken()
      if (!token) return []
      const res = await apiGet<SpotifyDevicesResponse>(token, '/me/player/devices')
      const devices = res.devices || []
      // If our Web Playback device exists but isn't listed (rare), still surface it.
      if (webPlaybackDeviceId && !devices.some((d) => d.id === webPlaybackDeviceId)) {
        devices.unshift({ id: webPlaybackDeviceId, name: 'Muffle', type: 'Computer', is_active: false })
      }
      return devices
    },

    async transferToDevice(deviceId: string, play = false) {
      const token = await ensureFreshToken()
      if (!token) return
      await apiCall(token, { method: 'PUT', path: '/me/player', body: { device_ids: [deviceId], play } })

      // If the user explicitly chose our Web Playback device, start targeting it.
      if (webPlaybackDeviceId && deviceId === webPlaybackDeviceId) {
        webPlaybackPreferred = true
        webPlaybackFailureCount = 0
        webPlaybackDisabledUntil = 0
      }
      void this.refreshPlayback()
    },

    async refreshPlayback() {
      const token = await ensureFreshToken()
      if (!token) return
      await fetchPlaybackOnce(token)
    },

    async seekToPercent(pct: number) {
      const token = await ensureFreshToken()
      if (!token) return

      const state = get(playerStore)
      if (!state.currentTrack) return

      const positionMs = Math.max(0, Math.min(state.currentTrack.duration, Math.floor((pct / 100) * state.currentTrack.duration)))

      // Optimistic UI.
      playerStore.seek(pct)

      const canUseSdk =
        webPlayer && typeof webPlayer.getCurrentState === 'function' && typeof webPlayer.seek === 'function'

      if (canUseSdk) {
        const sdkState = await webPlayer.getCurrentState().catch(() => null)
        if (sdkState) {
          await webPlayer.seek(positionMs)
          void this.refreshPlayback()
          return
        }
      }

      const activeDeviceId = await getActiveDeviceId(token)
      const qs = activeDeviceId ? `&device_id=${encodeURIComponent(activeDeviceId)}` : ''
      await apiCall(token, { method: 'PUT', path: `/me/player/seek?position_ms=${positionMs}${qs}` })

      void this.refreshPlayback()
    },

    async play() {
      const token = await ensureFreshToken()
      if (!token) return
      const qs = webPlaybackPreferred && webPlaybackDeviceId ? `?device_id=${encodeURIComponent(webPlaybackDeviceId)}` : ''
      await runPlayerCommand(token, { method: 'PUT', path: `/me/player/play${qs}` })
      // Optimistic UI, then confirm with a refresh.
      playerStore.setIsPlaying(true)
      void this.refreshPlayback()
    },

    async pause() {
      const token = await ensureFreshToken()
      if (!token) return
      const qs = webPlaybackPreferred && webPlaybackDeviceId ? `?device_id=${encodeURIComponent(webPlaybackDeviceId)}` : ''
      await runPlayerCommand(token, { method: 'PUT', path: `/me/player/pause${qs}` })
      playerStore.setIsPlaying(false)
      void this.refreshPlayback()
    },

    async next() {
      const token = await ensureFreshToken()
      if (!token) return
      const qs = webPlaybackPreferred && webPlaybackDeviceId ? `?device_id=${encodeURIComponent(webPlaybackDeviceId)}` : ''
      await runPlayerCommand(token, { method: 'POST', path: `/me/player/next${qs}` })
      void this.refreshPlayback()
    },

    async previous() {
      const token = await ensureFreshToken()
      if (!token) return
      const qs = webPlaybackPreferred && webPlaybackDeviceId ? `?device_id=${encodeURIComponent(webPlaybackDeviceId)}` : ''
      await runPlayerCommand(token, { method: 'POST', path: `/me/player/previous${qs}` })
      void this.refreshPlayback()
    },

    logout() {
      stopPlaybackPolling()
      clearPersisted()
      try {
        webPlayer?.disconnect?.()
      } catch {
        // ignore
      }
      webPlayer = null
      webPlayerInitState = 'idle'
      webPlaybackDeviceId = null
      set({
        status: 'idle',
        error: null,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        user: null,
        playlists: [],
        featuredPlaylists: [],
        topArtists: [],
        current: null
      })
    }
  }
}

export const spotifyStore = createSpotifyStore()
