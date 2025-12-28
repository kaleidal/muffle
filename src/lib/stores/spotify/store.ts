import { get, writable } from 'svelte/store'
import { playerStore } from '../playerStore'
import type { Track } from '../playerStore'
import { apiCall, apiGet, isInsufficientScopeError } from './api'
import { DEFAULT_SCOPES, getClientId } from './config'
import { fetchPlaybackOnceFactory } from './store/playback'
import { ensureFreshTokenFactory, loadPersistedSession, persistTokens, safeLogout } from './store/auth'
import { createPolling } from './store/polling'
import { createWebPlaybackController } from './webPlayback'
import { createPlayerCommands } from './store/playerCommands'
import { mapToTrack } from './mappers'
import {
  fetchAllPlaylists,
  fetchRecommendations,
  fetchRecentlyPlayedPlaylistContexts,
  fetchTopArtists,
  fetchTopTracks,
  getLikedSongsView,
  getPlaylistView,
  searchTracks
} from './store/library'
import { initialSpotifyState, isUnauthorized, type SpotifyState } from './store/state'
import type { SpotifyUser } from './types'
import type { SpotifyQueue } from './types'
import { bestImageUrl } from '../../utils/spotifyImages'

function createSpotifyStore() {
  const { subscribe, set, update } = writable<SpotifyState>(initialSpotifyState)

  playerStore.setQueueSource('spotify')

  let lastObserved:
    | {
        trackId: string | null
        isPlaying: boolean
        progressPct: number
      }
    | null = null

  let lastKnownTrack: Track | null = null

  let homeCache:
    | null
    | {
        continuePlaylists: Array<{ id: string; name: string; images: { url: string }[] }>
        topTracks: Array<{ id: string; name: string; image: string; uri: string }>
        topArtists: Array<{ id: string; name: string; image: string; uri: string }>
        mixes: Array<{ id: string; name: string; image: string; uris: string[] }>
      } = null

  let homeSectionsInFlight: Promise<void> | null = null

  let stopAuthListener: null | (() => void) = null
  let stopAuthErrorListener: null | (() => void) = null

  let lastWebPlaybackAt = 0

  const storeLike = {
    getState: () => get({ subscribe }),
    update,
    set
  }

  const webPlayback = createWebPlaybackController({
    getAccessToken: async () => ensureFreshToken(),
    onError: (message) => update((s) => ({ ...s, error: message })),
    onPlaybackState: (state) => {
      lastWebPlaybackAt = Date.now()
      playerStore.setPlaybackState({
        current: state.current,
        isPlaying: state.isPlaying,
        progressPct: state.progressPct
      })

      if (state.current) lastKnownTrack = state.current
    }
  })
  const stopPlaybackPolling = () => polling.stop()

  const ensureFreshToken = ensureFreshTokenFactory({
    store: storeLike,
    stopPlaybackPolling,
    webPlaybackDisconnect: () => webPlayback.disconnect()
  })

  const fetchPlaybackOnce = fetchPlaybackOnceFactory({
    updateCurrent: (current) => update((s) => ({ ...s, current }))
  })

  const isInAppPlaybackActive = () => {
    const preferred = !!webPlayback.getPreferredDeviceId()
    if (!preferred) return false
    return Date.now() - lastWebPlaybackAt <= 5000
  }

  const fetchQueueOnce = async (token: string) => {
    const queue = await apiGet<SpotifyQueue>(token, '/me/player/queue')
    const nextItem = queue?.queue?.[0] ?? null
    const nextTrack = nextItem ? mapToTrack(nextItem) : null
    const queueTracks = (queue?.queue ?? []).slice(0, 20).map(mapToTrack)
    playerStore.setSpotifyQueue({ next: nextTrack, queue: queueTracks })
  }

  const polling = createPolling({
    fetchTick: async () => {
      try {
        const token = await ensureFreshToken()
        if (!token) return

        if (isInAppPlaybackActive()) {
          await fetchQueueOnce(token)
        } else {
          await fetchPlaybackOnce(token)
        }

        const p = get(playerStore)
        if (p.currentTrack) lastKnownTrack = p.currentTrack
      } catch {
        // ignore
      }
    }
  })

  const commands = createPlayerCommands({
    ensureFreshToken,
    webPlayback,
    refreshPlayback: async () => {
      const token = await ensureFreshToken()
      if (!token) return
      if (isInAppPlaybackActive()) await fetchQueueOnce(token)
      else await fetchPlaybackOnce(token)
    }
  })

  const doSafeLogout = (message?: string) =>
    safeLogout(
      { store: storeLike, stopPlaybackPolling, webPlaybackDisconnect: () => webPlayback.disconnect() },
      message
    )

  const fetchAll = async () => {
    const token = await ensureFreshToken()
    if (!token) return

    try {
      const me = await apiGet<SpotifyUser>(token, '/me')

      const [playlistsRes, topArtistsRes] = await Promise.allSettled([fetchAllPlaylists(token), fetchTopArtists(token)])

      const playlists = playlistsRes.status === 'fulfilled' ? playlistsRes.value || [] : []
      const topArtists = topArtistsRes.status === 'fulfilled' ? topArtistsRes.value || [] : []

      update((s) => ({
        ...s,
        status: 'authenticated',
        error: null,
        user: me,
        playlists,
        topArtists
      }))

      homeCache = null
    } catch (e) {
      if (isUnauthorized(e)) {
        doSafeLogout('Spotify session expired. Please log in again.')
        return
      }
      update((s) => ({ ...s, error: String((e as any)?.message || 'Failed to load Spotify data') }))
    }
  }

  const attachAuthListeners = () => {
    stopAuthListener?.()
    stopAuthErrorListener?.()

    stopAuthListener =
      window.electron?.onSpotifyAuth?.((tokens) => {
        persistTokens(storeLike, tokens)
        void fetchAll()
        polling.start()
      }) ?? null

    stopAuthErrorListener =
      window.electron?.onSpotifyAuthError?.((err) => {
        update((s) => ({ ...s, status: 'idle', error: err.message }))
      }) ?? null
  }

  return {
    subscribe,

    getWebPlaybackDeviceId() {
      return webPlayback.getDeviceId()
    },

    init() {
      attachAuthListeners()

      const sess = loadPersistedSession(storeLike)
      if (!sess.accessToken) return

      update((s) => ({
        ...s,
        status: 'authenticated',
        accessToken: sess.accessToken,
        refreshToken: sess.refreshToken,
        expiresAt: sess.expiresAt
      }))

      void (async () => {
        try {
          const token = await ensureFreshToken()
          if (!token) return
          await fetchAll()
          polling.start()
        } catch (e) {
          if (isUnauthorized(e)) doSafeLogout('Spotify session expired. Please log in again.')
        }
      })()
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

    async getHomeSections() {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')

      const state = get({ subscribe })
      const yourPlaylists = (state.playlists || []).slice(0, 12)
      const fallbackTopArtists = (state.topArtists || [])
        .slice(0, 10)
        .map((a) => ({
          id: a.id,
          name: a.name,
          image: bestImageUrl(a.images || []),
          uri: `spotify:artist:${a.id}`
        }))
        .filter((a) => a.id && a.name)

      const buildFromCache = (cache: NonNullable<typeof homeCache>) =>
        [
          {
            id: 'continue',
            name: 'Continue listening',
            cards: cache.continuePlaylists.map((p) => ({
              id: p.id,
              name: p.name,
              image: bestImageUrl(p.images || []),
              kind: 'playlist',
              uri: `spotify:playlist:${p.id}`
            }))
          },
          {
            id: 'your_playlists',
            name: 'Your playlists',
            cards: yourPlaylists.map((p) => ({
              id: p.id,
              name: p.name,
              image: bestImageUrl(p.images || []),
              kind: 'playlist',
              uri: `spotify:playlist:${p.id}`
            }))
          },
          {
            id: 'top_tracks',
            name: 'Your top tracks',
            cards: cache.topTracks.map((t) => ({
              id: t.id,
              name: t.name,
              image: t.image,
              kind: 'track',
              uri: t.uri
            }))
          },
          {
            id: 'top_artists',
            name: 'Your top artists',
            cards: cache.topArtists.map((a) => ({
              id: a.id,
              name: a.name,
              image: a.image,
              kind: 'artist',
              uri: a.uri
            }))
          },
          {
            id: 'mixes',
            name: 'Muffle Mixes',
            cards: cache.mixes.map((m) => ({
              id: m.id,
              name: m.name,
              image: m.image,
              kind: 'mix'
            }))
          }
        ].filter((s) => (s.cards || []).length)

      if (homeCache) return buildFromCache(homeCache)

      if (!homeSectionsInFlight) {
        homeSectionsInFlight = (async () => {
          try {
            const playlists = (state.playlists || []).slice(0, 24)

            const [recentIdsRes, topTracksRes] = await Promise.allSettled([
              fetchRecentlyPlayedPlaylistContexts(token, 50),
              fetchTopTracks(token, 12)
            ])

            const recentIds = recentIdsRes.status === 'fulfilled' ? recentIdsRes.value || [] : []
            const topTracks =
              topTracksRes.status === 'fulfilled'
                ? (topTracksRes.value || []).map((t) => ({
                    id: t.id,
                    name: t.name,
                    image: t.albumArt,
                    uri: t.uri
                  }))
                : []

            const continuePlaylists = recentIds
              .map((id) => playlists.find((p) => p.id === id))
              .filter(Boolean)
              .slice(0, 12) as any

            const topArtists = fallbackTopArtists

            const mixes: Array<{ id: string; name: string; image: string; uris: string[] }> = []
            const seed = topArtists.slice(0, 6)
            const recRes = await Promise.allSettled(seed.map((a) => fetchRecommendations(token, { seedArtistIds: [a.id], limit: 30 })))

            for (let i = 0; i < seed.length; i++) {
              const a = seed[i]
              const r = recRes[i]
              if (r.status !== 'fulfilled') continue
              const uris = (r.value || []).map((t) => t.uri).filter(Boolean)
              if (!uris.length) continue
              mixes.push({ id: `mix:${a.id}`, name: `Because you like ${a.name}`, image: a.image, uris })
              if (mixes.length >= 6) break
            }

            homeCache = {
              continuePlaylists: continuePlaylists.map((p: any) => ({ id: p.id, name: p.name, images: p.images })),
              topTracks,
              topArtists,
              mixes
            }
          } catch {
            homeCache = {
              continuePlaylists: [],
              topTracks: [],
              topArtists: fallbackTopArtists,
              mixes: []
            }
          } finally {
            homeSectionsInFlight = null
          }
        })()
      }

      try {
        await homeSectionsInFlight
      } catch {
        // ignore
      }

      if (homeCache) return buildFromCache(homeCache)

      return [
        {
          id: 'your_playlists',
          name: 'Your playlists',
          cards: yourPlaylists.map((p) => ({
            id: p.id,
            name: p.name,
            image: bestImageUrl(p.images || []),
            kind: 'playlist',
            uri: `spotify:playlist:${p.id}`
          }))
        },
        {
          id: 'top_artists',
          name: 'Your top artists',
          cards: fallbackTopArtists.map((a) => ({ id: a.id, name: a.name, image: a.image, kind: 'artist', uri: a.uri }))
        }
      ].filter((s) => (s.cards || []).length)
    },

    async playMix(mixId: string) {
      const token = await ensureFreshToken()
      if (!token) return
      const mix = homeCache?.mixes?.find((m) => m.id === mixId)
      if (!mix?.uris?.length) return

      await (this as any).playUris(mix.uris)
    },

    async ensureWebPlaybackReady() {
      return await webPlayback.ensureReady()
    },

    async refreshPlayback() {
      const token = await ensureFreshToken()
      if (!token) return
      await fetchPlaybackOnce(token)
    },

    ...commands,

    async enqueueTrack(track: Track) {
      if (!track?.uri) return
      const token = await ensureFreshToken()
      if (!token) return

      const deviceId = webPlayback.getDeviceId()
      const qs = new URLSearchParams({ uri: track.uri })
      if (deviceId) qs.set('device_id', deviceId)
      await apiCall(token, { method: 'POST', path: `/me/player/queue?${qs.toString()}` })
    },

    async enqueueUri(uri: string) {
      const token = await ensureFreshToken()
      if (!token) return
      const deviceId = webPlayback.getDeviceId()
      const qs = new URLSearchParams({ uri })
      if (deviceId) qs.set('device_id', deviceId)
      await apiCall(token, { method: 'POST', path: `/me/player/queue?${qs.toString()}` })
    },

    async playTrackUri(uri: string) {
      await commands.playTrackUri(uri)
    },


    reorderQueue(_fromIndex: number, _toIndex: number) {
      // Spotify queue cannot be reordered via API.
    },

    async next() {
      await commands.next()
    },

    async previous() {
      await commands.previous()
    },

    async searchTracks(query: string) {
      const token = await ensureFreshToken()
      if (!token) return []
      return await searchTracks(token, query)
    },

    async getPlaylistView(playlistId: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      return await getPlaylistView(token, playlistId)
    },

    async getLikedSongsView() {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')

      try {
        return await getLikedSongsView(token)
      } catch (e) {
        if (isInsufficientScopeError(e)) {
          doSafeLogout('Liked Songs needs permission. Please Connect Spotify again.')
          throw new Error('Liked Songs requires permission. Please Connect Spotify again.')
        }
        throw e
      }
    },

    logout() {
      doSafeLogout(undefined)
    }
  }
}

export const spotifyStore = createSpotifyStore()
