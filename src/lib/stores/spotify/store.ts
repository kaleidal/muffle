import { get, writable } from 'svelte/store'
import { playerStore } from '../playerStore'
import type { Track } from '../playerStore'
import { apiCall, apiGet, isInsufficientScopeError } from './api'
import { DEFAULT_SCOPES, getClientId } from './config'
import { fetchPlaybackOnceFactory } from './store/playback'
import { ensureFreshTokenFactory, loadPersistedSession, persistTokens, safeLogout } from './store/auth'
import { createPolling } from './store/polling'
import { createLibrespotController } from './librespot'
import { createPlayerCommands } from './store/playerCommands'
import { mapToTrack } from './mappers'
import {
  fetchAllPlaylists,
  fetchRecentlyPlayedPlaylistContexts,
  fetchTopArtists,
  fetchTopTracks,
  createPlaylist,
  getLikedSongsView,
  getPlaylistView,
  isTrackInLiked,
  playlistContainsTrackUri,
  renamePlaylist,
  uploadPlaylistCoverJpegBase64,
  addTracksToPlaylist,
  reorderPlaylistTrack,
  saveTracksToLiked,
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
        topTracks: Array<{ id: string; name: string; image: string; uri: string; artist: string; album: string; albumArt: string; duration: number }>
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

  const librespotController = createLibrespotController({
    getAccessToken: async () => ensureFreshToken(),
    onReady: () => {
      console.log('Librespot device is ready')
      void (async () => {
        try {
          await librespotController.refreshDeviceId()
          const token = await ensureFreshToken()
          if (!token) return
          void ensureLibrespotIsActive(token)
        } catch {
          // ignore
        }
      })()
    },
    onError: (message) => update((s) => ({ ...s, error: message })),
    onStatusChange: (next) => update((s) => ({ ...s, librespot: next }))
  })
  const stopPlaybackPolling = () => polling.stop()

  const ensureFreshToken = ensureFreshTokenFactory({
    store: storeLike,
    stopPlaybackPolling,
    webPlaybackDisconnect: () => librespotController.disconnect()
  })

  const fetchPlaybackOnce = fetchPlaybackOnceFactory({
    updateCurrent: (current) => update((s) => ({ ...s, current }))
  })

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

        await fetchPlaybackOnce(token)

        const p = get(playerStore)
        if (p.currentTrack) lastKnownTrack = p.currentTrack
      } catch {
        // ignore
      }
    }
  })

  const commands = createPlayerCommands({
    ensureFreshToken,
    librespotController,
    refreshPlayback: async () => {
      const token = await ensureFreshToken()
      if (!token) return
      await fetchPlaybackOnce(token)
    }
  })

  let librespotEnsureInFlight: Promise<string | null> | null = null
  let lastLibrespotAuthToken: string | null = null

  const ensureLibrespotIsActive = async (token: string) => {
    if (librespotEnsureInFlight) return await librespotEnsureInFlight

    librespotEnsureInFlight = (async () => {
      try {
        const devicesRes = await apiGet<{ devices?: Array<{ id?: string | null; is_active?: boolean | null }> }>(
          token,
          '/me/player/devices'
        )
        const active = (devicesRes.devices || []).find((d) => d.is_active && d.id)
        if (active?.id) return active.id

        const status = await window.electron?.librespotStatus?.().catch(() => null)
        const canAuth = !!(window.electron?.librespotAuth && status?.available)

        if (canAuth && lastLibrespotAuthToken !== token) {
          lastLibrespotAuthToken = token
          await window.electron!.librespotAuth!(token)
        }

        await librespotController.init()

        const startTime = Date.now()
        let deviceId: string | null = null
        while (Date.now() - startTime < 12000) {
          deviceId = await librespotController.refreshDeviceId()
          if (deviceId) break
          await new Promise((r) => setTimeout(r, 500))
        }
        if (!deviceId) return null

        librespotController.setPreferred(true)
        await apiCall(token, { method: 'PUT', path: '/me/player', body: { device_ids: [deviceId], play: false } })
        return deviceId
      } catch {
        return null
      } finally {
        librespotEnsureInFlight = null
      }
    })()

    return await librespotEnsureInFlight
  }

  const doSafeLogout = (message?: string) =>
    safeLogout(
      { store: storeLike, stopPlaybackPolling, webPlaybackDisconnect: () => librespotController.disconnect() },
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
        void ensureLibrespotIsActive(tokens.accessToken)
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

    getLibrespotDeviceId() {
      return librespotController.getDeviceId()
    },

    async initLibrespot() {
      await librespotController.init()
    },

    init() {
      attachAuthListeners()

      void librespotController.init()
      update((s) => ({ ...s, librespot: { status: librespotController.getStatus(), available: librespotController.isBinaryAvailable() } }))

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
          void ensureLibrespotIsActive(token)
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

    async refreshPlaylists() {
      const token = await ensureFreshToken()
      if (!token) return
      try {
        const playlists = await fetchAllPlaylists(token)
        update((s) => ({ ...s, playlists: playlists || [] }))
      } catch {
        // ignore
      }
    },

    async createPlaylist(name: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      const state = get({ subscribe })
      const userId = state.user?.id
      if (!userId) throw new Error('Missing Spotify user')

      const created = await createPlaylist(token, { userId, name })
      await (this as any).refreshPlaylists()
      return created
    },

    async renamePlaylist(playlistId: string, name: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      await renamePlaylist(token, { playlistId, name })
      await (this as any).refreshPlaylists()
    },

    async setPlaylistCoverJpegBase64(playlistId: string, jpegBase64: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      await uploadPlaylistCoverJpegBase64(token, { playlistId, jpegBase64 })
      await (this as any).refreshPlaylists()
    },

    async addTrackToLiked(trackId: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      await saveTracksToLiked(token, [trackId])
    },

    async isTrackInLiked(trackId: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      return await isTrackInLiked(token, trackId)
    },

    async addTrackToPlaylist(playlistId: string, uri: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      await addTracksToPlaylist(token, { playlistId, uris: [uri] })
    },

    async isTrackInPlaylist(playlistId: string, uri: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      return await playlistContainsTrackUri(token, { playlistId, trackUri: uri })
    },

    async reorderPlaylistTrack(playlistId: string, fromIndex: number, toIndex: number, snapshotId?: string | null) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      return await reorderPlaylistTrack(token, { playlistId, fromIndex, toIndex, snapshotId })
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
                    uri: t.uri,
                    artist: t.artist,
                    album: t.album,
                    albumArt: t.albumArt,
                    duration: t.duration
                  }))
                : []

            const continuePlaylists = recentIds
              .map((id) => playlists.find((p) => p.id === id))
              .filter(Boolean)
              .slice(0, 12) as any

            const topArtists = fallbackTopArtists

            const mixes: Array<{ id: string; name: string; image: string; uris: string[] }> = []

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

    async ensureLibrespotReady() {
      await librespotController.init()
      const deviceId = await librespotController.refreshDeviceId()

      if (deviceId) {
        const token = await ensureFreshToken()
        if (token) {
          await apiCall(token, { method: 'PUT', path: '/me/player', body: { device_ids: [deviceId], play: false } })
        }
        librespotController.setPreferred(true)
      }

      return { deviceId, status: librespotController.getStatus() }
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

      const deviceId = librespotController.getDeviceId()
      const qs = new URLSearchParams({ uri: track.uri })
      if (deviceId) qs.set('device_id', deviceId)
      await apiCall(token, { method: 'POST', path: `/me/player/queue?${qs.toString()}` })
    },

    async enqueueUri(uri: string) {
      const token = await ensureFreshToken()
      if (!token) return
      const deviceId = librespotController.getDeviceId()
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
