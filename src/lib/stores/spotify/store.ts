import { get, writable } from 'svelte/store'
import { playerStore } from '../playerStore'
import { apiGet, isInsufficientScopeError } from './api'
import { DEFAULT_SCOPES, getClientId } from './config'
import { fetchPlaybackOnceFactory } from './store/playback'
import { ensureFreshTokenFactory, loadPersistedSession, persistTokens, safeLogout } from './store/auth'
import { createPolling } from './store/polling'
import { createWebPlaybackController } from './webPlayback'
import { createPlayerCommands } from './store/playerCommands'
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
import { bestImageUrl } from '../../utils/spotifyImages'

function createSpotifyStore() {
  const { subscribe, set, update } = writable<SpotifyState>(initialSpotifyState)

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

  const storeLike = {
    getState: () => get({ subscribe }),
    update,
    set
  }

  const webPlayback = createWebPlaybackController({
    getAccessToken: async () => ensureFreshToken(),
    onError: (message) => update((s) => ({ ...s, error: message })),
    onPlaybackState: (state) => {
      playerStore.setPlaybackState({
        current: state.current,
        next: state.next,
        queue: state.queue,
        isPlaying: state.isPlaying,
        progressPct: state.progressPct
      })
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

  const polling = createPolling({
    fetchTick: async () => {
      try {
        const token = await ensureFreshToken()
        if (!token) return
        await fetchPlaybackOnce(token)
      } catch {
        // ignore
      }
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

    ...createPlayerCommands({
      ensureFreshToken,
      webPlayback,
      refreshPlayback: async () => {
        const token = await ensureFreshToken()
        if (!token) return
        await fetchPlaybackOnce(token)
      }
    }),

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
