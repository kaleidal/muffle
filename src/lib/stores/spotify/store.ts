import { get, writable } from 'svelte/store'
import { playerStore } from '../playerStore'
import { apiGet, isInsufficientScopeError } from './api'
import { DEFAULT_SCOPES, getClientId } from './config'
import { fetchBrowseCategoriesV2, fetchCategoryPlaylists, fetchFeatured, getLocale } from './browse'
import { fetchPlaybackOnceFactory } from './store/playback'
import { ensureFreshTokenFactory, loadPersistedSession, persistTokens, safeLogout } from './store/auth'
import { createPolling } from './store/polling'
import { createWebPlaybackController } from './webPlayback'
import { createPlayerCommands } from './store/playerCommands'
import { fetchAllPlaylists, fetchTopArtists, getLikedSongsView, getPlaylistView, searchTracks } from './store/library'
import { initialSpotifyState, isUnauthorized, type SpotifyState } from './store/state'
import type { SpotifyUser } from './types'

function createSpotifyStore() {
  const { subscribe, set, update } = writable<SpotifyState>(initialSpotifyState)

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

      const [playlistsRes, topArtistsRes, featuredRes] = await Promise.allSettled([
        fetchAllPlaylists(token),
        fetchTopArtists(token),
        fetchFeatured(token, me.country)
      ])

      const playlists = playlistsRes.status === 'fulfilled' ? playlistsRes.value || [] : []
      const topArtists = topArtistsRes.status === 'fulfilled' ? topArtistsRes.value || [] : []
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

    async getHomeCategorySections(args?: { limit?: number; playlistsPerCategory?: number }) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')

      const limit = args?.limit ?? 5
      const playlistsPerCategory = args?.playlistsPerCategory ?? 12

      const userCountry = get({ subscribe }).user?.country
      const locale = getLocale({ userCountry })

      let categories: Array<{ id: string; name?: string; icons?: Array<{ url: string }> }> = []
      try {
        categories = await fetchBrowseCategoriesV2(token, { limit, locale })
      } catch (e) {
        const msg = String((e as any)?.message || e || '')
        if (!/\bSpotify API error 404\b/i.test(msg)) throw e
      }

      if (!categories.length) {
        const playlists = await fetchFeatured(token, userCountry || undefined).catch(() => [])
        return playlists.length
          ? [
              {
                id: 'featured',
                name: 'Featured',
                iconUrl: '',
                playlists
              }
            ]
          : []
      }

      const sections = await Promise.all(
        categories.map(async (c) => {
          const playlists = await fetchCategoryPlaylists(token, c.id, playlistsPerCategory, userCountry || null).catch(() => [])
          return {
            id: c.id,
            name: c.name || 'Category',
            iconUrl: c.icons?.[0]?.url || '',
            playlists
          }
        })
      )

      const filled = sections.filter((s) => s.playlists.length)
      if (filled.length) return filled

      const playlists = await fetchFeatured(token, userCountry || undefined).catch(() => [])
      return playlists.length
        ? [
            {
              id: 'featured',
              name: 'Featured',
              iconUrl: '',
              playlists
            }
          ]
        : []
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
