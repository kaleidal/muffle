import { get } from 'svelte/store'
import { playerStore } from '../../playerStore'
import { apiCall, apiGet } from '../api'
import type { SpotifyDevice, SpotifyDevicesResponse } from '../types'

type LibrespotControllerLike = {
  getDeviceId: () => string | null
  getPreferredDeviceId: () => string | null
  setPreferred: (isPreferred: boolean) => void
  refreshDeviceId?: () => Promise<string | null>
  trySeek: (positionMs: number) => Promise<boolean>
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createPlayerCommands(args: {
  ensureFreshToken: () => Promise<string | null>
  librespotController: LibrespotControllerLike
  refreshPlayback: () => Promise<void>
}) {
  const getActiveDeviceId = async (token: string): Promise<string | null> => {
    try {
      const res = await apiGet<SpotifyDevicesResponse>(token, '/me/player/devices')
      const active = (res.devices || []).find((d) => d.is_active && d.id)
      return active?.id ?? null
    } catch {
      return null
    }
  }

  const getFirstRunnableDeviceId = async (token: string) => {
    const devices = await apiGet<SpotifyDevicesResponse>(token, '/me/player/devices')
    const active = (devices.devices || []).find((d) => d.is_active && d.id)
    if (active?.id) return active.id

    const muffleId =
      args.librespotController.getDeviceId() ??
      (args.librespotController.refreshDeviceId ? await args.librespotController.refreshDeviceId() : null) ??
      (devices.devices || []).find((d) => d.id && (d.name === 'Muffle' || d.name?.toLowerCase().includes('muffle')))?.id ??
      null
    if (muffleId) return muffleId

    const librespotPreferred = args.librespotController.getPreferredDeviceId()
    if (librespotPreferred) return librespotPreferred

    const any = (devices.devices || []).find((d) => d.id)
    return any?.id ?? null
  }

  const runPlayerCommand = async (token: string, cmd: { method: 'PUT' | 'POST'; path: string; body?: any }) => {
    const attempt = async () => {
      await apiCall(token, cmd)
    }

    try {
      await attempt()
      return
    } catch (e: any) {
      const msg = String(e?.message || e || '')
      const isPlayerEndpoint = cmd.path.startsWith('/me/player')
      const isNotFound = /\bSpotify API error 404\b/i.test(msg)
      const isNoActive = /NO_ACTIVE_DEVICE|No active device found/i.test(msg) || (isPlayerEndpoint && isNotFound)
      const isBadGateway = /\b502\b|Bad gateway/i.test(msg)

      if (isBadGateway) {
        await sleep(350)
        await attempt()
        return
      }

      if (isNoActive) {
        if (cmd.path.startsWith('/me/player/pause')) return

        const target = await getFirstRunnableDeviceId(token)
        if (!target) throw e

        await apiCall(token, { method: 'PUT', path: '/me/player', body: { device_ids: [target], play: false } })
        const librespotId = args.librespotController.getDeviceId()
        args.librespotController.setPreferred(Boolean(librespotId && target === librespotId))
        await sleep(200)
        await attempt()
        return
      }

      throw e
    }
  }

  const getDevices = async (): Promise<SpotifyDevice[]> => {
    const token = await args.ensureFreshToken()
    if (!token) return []

    const res = await apiGet<SpotifyDevicesResponse>(token, '/me/player/devices')
    const devices = res.devices || []

    const librespotId = args.librespotController.getDeviceId()
    if (librespotId && !devices.some((d) => d.id === librespotId)) {
      devices.unshift({ id: librespotId, name: 'Muffle', type: 'Computer', is_active: false })
    }

    return devices
  }

  const transferToDevice = async (deviceId: string, play = false) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    await apiCall(token, { method: 'PUT', path: '/me/player', body: { device_ids: [deviceId], play } })

    const librespotId = args.librespotController.getDeviceId()
    if (librespotId && deviceId === librespotId) args.librespotController.setPreferred(true)

    void args.refreshPlayback()
  }

  const seekToPercent = async (pct: number) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const state = get(playerStore)
    if (!state.currentTrack) return

    const positionMs = Math.max(0, Math.min(state.currentTrack.duration, Math.floor((pct / 100) * state.currentTrack.duration)))
    const prevProgress = state.progress
    playerStore.setOptimisticSeek(pct)

    const activeDeviceId = await getActiveDeviceId(token)
    const qs = activeDeviceId ? `&device_id=${encodeURIComponent(activeDeviceId)}` : ''

    try {
      await apiCall(token, { method: 'PUT', path: `/me/player/seek?position_ms=${positionMs}${qs}` })
    } catch (e) {
      playerStore.clearOptimisticSeek()
      playerStore.seek(prevProgress)
      void args.refreshPlayback()
      throw e
    }

    void args.refreshPlayback()
  }

  const play = async () => {
    const prev = get(playerStore)
    if (!prev.isPlaying) playerStore.setOptimisticIsPlaying(true)

    const token = await args.ensureFreshToken()
    if (!token) {
      playerStore.clearOptimisticIsPlaying()
      if (prev.isPlaying) playerStore.play()
      else playerStore.pause()
      return
    }

    const preferred = args.librespotController.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    try {
      await runPlayerCommand(token, { method: 'PUT', path: `/me/player/play${qs}` })
    } catch (e) {
      playerStore.clearOptimisticIsPlaying()
      if (prev.isPlaying) playerStore.play()
      else playerStore.pause()
      void args.refreshPlayback()
      throw e
    }

    void args.refreshPlayback()
  }

  const pause = async () => {
    const prev = get(playerStore)
    if (prev.isPlaying) playerStore.setOptimisticIsPlaying(false)

    const token = await args.ensureFreshToken()
    if (!token) {
      playerStore.clearOptimisticIsPlaying()
      if (prev.isPlaying) playerStore.play()
      else playerStore.pause()
      return
    }

    const preferred = args.librespotController.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    try {
      await runPlayerCommand(token, { method: 'PUT', path: `/me/player/pause${qs}` })
    } catch (e) {
      playerStore.clearOptimisticIsPlaying()
      if (prev.isPlaying) playerStore.play()
      else playerStore.pause()
      void args.refreshPlayback()
      throw e
    }

    void args.refreshPlayback()
  }

  const next = async () => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.librespotController.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, { method: 'POST', path: `/me/player/next${qs}` })
    void args.refreshPlayback()
  }

  const previous = async () => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.librespotController.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, { method: 'POST', path: `/me/player/previous${qs}` })
    void args.refreshPlayback()
  }

  const playTrackUri = async (uri: string) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.librespotController.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, { method: 'PUT', path: `/me/player/play${qs}`, body: { uris: [uri] } })
    void args.refreshPlayback()
  }

  const playPlaylistTrack = async (playlistUri: string, position: number) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.librespotController.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, {
      method: 'PUT',
      path: `/me/player/play${qs}`,
      body: {
        context_uri: playlistUri,
        offset: { position: Math.max(0, position | 0) },
        position_ms: 0
      }
    })
    void args.refreshPlayback()
  }

  const playContextUri = async (contextUri: string) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.librespotController.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, {
      method: 'PUT',
      path: `/me/player/play${qs}`,
      body: { context_uri: contextUri, position_ms: 0 }
    })
    void args.refreshPlayback()
  }

  const playUris = async (uris: string[]) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const clean = (uris || []).filter(Boolean)
    if (!clean.length) return

    const preferred = args.librespotController.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, {
      method: 'PUT',
      path: `/me/player/play${qs}`,
      body: { uris: clean }
    })
    void args.refreshPlayback()
  }

  const setShuffle = async (enabled: boolean) => {
    const prev = get(playerStore).shuffle
    if (prev !== enabled) playerStore.setOptimisticShuffle(enabled)

    const token = await args.ensureFreshToken()
    if (!token) {
      playerStore.clearOptimisticShuffle()
      playerStore.setShuffle(prev)
      return
    }

    try {
      await runPlayerCommand(token, { method: 'PUT', path: `/me/player/shuffle?state=${enabled ? 'true' : 'false'}` })
    } catch (e) {
      playerStore.clearOptimisticShuffle()
      playerStore.setShuffle(prev)
      void args.refreshPlayback()
      throw e
    }

    void args.refreshPlayback()
  }

  const setVolumePercent = async (pct: number) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const volume = Math.max(0, Math.min(100, Math.round(pct)))
    playerStore.setVolume(volume)

    const activeDeviceId = await getActiveDeviceId(token)
    const device = activeDeviceId ? `&device_id=${encodeURIComponent(activeDeviceId)}` : ''
    await apiCall(token, { method: 'PUT', path: `/me/player/volume?volume_percent=${volume}${device}` })

    void args.refreshPlayback()
  }

  return {
    getDevices,
    transferToDevice,
    seekToPercent,
    setVolumePercent,
    play,
    pause,
    next,
    previous,
    playTrackUri,
    playContextUri,
    playUris,
    playPlaylistTrack,
    setShuffle
  }
}
