import { get, writable } from 'svelte/store'
import { playerStore } from '../playerStore'
import type { Track } from '../playerStore'
import { native } from '../../native'
import { apiCall, apiGet, isInsufficientScopeError } from './api'
import { fetchPlaybackOnceFactory } from './store/playback'
import { ensureFreshTokenFactory, safeLogout } from './store/auth'
import { createPolling } from './store/polling'
import { createLibrespotController } from './librespot'
import { createPlayerCommands } from './store/playerCommands'
import {
  fetchAllPlaylists,
  fetchTopArtists,
  createPlaylist,
  getLikedSongsView,
  getPlaylistView,
  isTrackInLiked,
  playlistContainsTrackUri,
  renamePlaylist,
  uploadPlaylistCoverJpegBase64,
  addTracksToPlaylist,
  removeTracksFromPlaylist,
  unsaveFromLibrary,
  reorderPlaylistTrack,
  saveTracksToLiked,
} from './store/library'
import { initialSpotifyState, isUnauthorized, type SpotifyState } from './store/state'
import type { SpotifyUser } from './types'

function createSpotifyStore() {
  const { subscribe, set, update } = writable<SpotifyState>(initialSpotifyState)

  playerStore.setQueueSource('spotify')

  let stopAuthListener: null | (() => void) = null

  const storeLike = {
    getState: () => get({ subscribe }),
    update,
    set
  }

  const librespotController = createLibrespotController({
    getAccessToken: async () => ensureFreshToken(),
    onReady: () => {
      void (async () => {
        try {
          await librespotController.refreshDeviceId()
          const token = await ensureFreshToken()
          if (!token) return
          void ensureLibrespotIsActive(token)
        } catch {}
      })()
    },
    onError: (message) => update((s) => ({ ...s, error: message })),
    onStatusChange: (next) => update((s) => ({ ...s, librespot: next }))
  })
  const stopPlaybackPolling = () => polling.stop()

  const ensureFreshToken = ensureFreshTokenFactory({
    store: storeLike,
    stopPlaybackPolling,
    playbackDisconnect: () => librespotController.disconnect()
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

      } catch {}
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
      { store: storeLike, stopPlaybackPolling, playbackDisconnect: () => librespotController.disconnect() },
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
    stopAuthListener = native.onAuthState((state) => {
      if (state.state === 'signedIn') {
        update((current) => ({ ...current, status: 'authenticated', accessToken: 'native', error: null }))
        void fetchAll()
        polling.start()
      } else if (state.state === 'failed') {
        update((current) => ({ ...current, status: 'idle', error: state.message }))
      } else if (state.state === 'signedOut') {
        doSafeLogout()
      }
    })
  }

  const refreshPlaylists = async () => {
    const token = await ensureFreshToken()
    if (!token) return
    try {
      const playlists = await fetchAllPlaylists(token)
      update((state) => ({ ...state, playlists }))
    } catch {
      update((state) => ({ ...state, error: 'Could not refresh playlists' }))
    }
  }

  return {
    subscribe,

    getLibrespotDeviceId() {
      return librespotController.getDeviceId()
    },

    init() {
      attachAuthListeners()

      void librespotController.init()
      update((s) => ({ ...s, librespot: { status: librespotController.getStatus(), available: librespotController.isBinaryAvailable() } }))

      try {
        const savedShuffle = localStorage.getItem('muffle_shuffle_enabled')
        if (savedShuffle !== null) {
          playerStore.setShuffle(savedShuffle === 'true')
        }
      } catch {}

      void (async () => {
        try {
          const auth = await native.authStatus()
          if (auth.state !== 'signedIn') return
          update((current) => ({ ...current, status: 'authenticated', accessToken: 'native' }))
          const token = 'native'
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

      await native.signIn()
    },

    async refresh() {
      await ensureFreshToken()
    },

    refreshPlaylists,

    async createPlaylist(name: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      const state = get({ subscribe })
      const userId = state.user?.id
      if (!userId) throw new Error('Missing Spotify user')

      const created = await createPlaylist(token, { userId, name })
      await refreshPlaylists()
      return created
    },

    async renamePlaylist(playlistId: string, name: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      await renamePlaylist(token, { playlistId, name })
      await refreshPlaylists()
    },

    async setPlaylistCoverJpegBase64(playlistId: string, jpegBase64: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      await uploadPlaylistCoverJpegBase64(token, { playlistId, jpegBase64 })
      await refreshPlaylists()
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

    async removeTrackFromPlaylist(playlistId: string, uri: string, snapshotId?: string | null) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      return await removeTracksFromPlaylist(token, { playlistId, uris: [uri], snapshotId })
    },

    async unsaveUri(uri: string) {
      const token = await ensureFreshToken()
      if (!token) throw new Error('Not authenticated')
      await unsaveFromLibrary(token, [uri])
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

    async ensureLibrespotReady() {
      await librespotController.init()
      let deviceId = await librespotController.refreshDeviceId()

      if (!deviceId) {
        await librespotController.authorize()
        deviceId = await librespotController.refreshDeviceId()
      }

      if (deviceId) {
        const token = await ensureFreshToken()
        if (token) {
          await apiCall(token, { method: 'PUT', path: '/me/player', body: { device_ids: [deviceId], play: false } })
        }
        librespotController.setPreferred(true)
      }

      return { deviceId, status: librespotController.getStatus() }
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


    async next() {
      await commands.next()
    },

    async previous() {
      await commands.previous()
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

    async logout() {
      await native.signOut()
      doSafeLogout(undefined)
    }
  }
}

export const spotifyStore = createSpotifyStore()
