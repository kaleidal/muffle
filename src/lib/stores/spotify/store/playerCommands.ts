import { get } from 'svelte/store'
import { playerStore } from '../../playerStore'
import { apiCall, apiGet } from '../api'
import type { SpotifyDevice, SpotifyDevicesResponse } from '../types'

type WebPlaybackLike = {
  getDeviceId: () => string | null
  getPreferredDeviceId: () => string | null
  setPreferred: (isPreferred: boolean) => void
  trySeek: (positionMs: number) => Promise<boolean>
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createPlayerCommands(args: {
  ensureFreshToken: () => Promise<string | null>
  webPlayback: WebPlaybackLike
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

    const webPreferred = args.webPlayback.getPreferredDeviceId()
    if (webPreferred) return webPreferred

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

    const webId = args.webPlayback.getDeviceId()
    if (webId && !devices.some((d) => d.id === webId)) {
      devices.unshift({ id: webId, name: 'Muffle', type: 'Computer', is_active: false })
    }

    return devices
  }

  const transferToDevice = async (deviceId: string, play = false) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    await apiCall(token, { method: 'PUT', path: '/me/player', body: { device_ids: [deviceId], play } })

    const webId = args.webPlayback.getDeviceId()
    if (webId && deviceId === webId) args.webPlayback.setPreferred(true)

    void args.refreshPlayback()
  }

  const seekToPercent = async (pct: number) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const state = get(playerStore)
    if (!state.currentTrack) return

    const positionMs = Math.max(0, Math.min(state.currentTrack.duration, Math.floor((pct / 100) * state.currentTrack.duration)))
    playerStore.seek(pct)

    const usedSdk = await args.webPlayback.trySeek(positionMs).catch(() => false)
    if (usedSdk) {
      void args.refreshPlayback()
      return
    }

    const activeDeviceId = await getActiveDeviceId(token)
    const qs = activeDeviceId ? `&device_id=${encodeURIComponent(activeDeviceId)}` : ''
    await apiCall(token, { method: 'PUT', path: `/me/player/seek?position_ms=${positionMs}${qs}` })

    void args.refreshPlayback()
  }

  const play = async () => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.webPlayback.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, { method: 'PUT', path: `/me/player/play${qs}` })
    playerStore.setIsPlaying(true)
    void args.refreshPlayback()
  }

  const pause = async () => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.webPlayback.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, { method: 'PUT', path: `/me/player/pause${qs}` })
    playerStore.setIsPlaying(false)
    void args.refreshPlayback()
  }

  const next = async () => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.webPlayback.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, { method: 'POST', path: `/me/player/next${qs}` })
    void args.refreshPlayback()
  }

  const previous = async () => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.webPlayback.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, { method: 'POST', path: `/me/player/previous${qs}` })
    void args.refreshPlayback()
  }

  const playTrackUri = async (uri: string) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.webPlayback.getPreferredDeviceId()
    const qs = preferred ? `?device_id=${encodeURIComponent(preferred)}` : ''

    await runPlayerCommand(token, { method: 'PUT', path: `/me/player/play${qs}`, body: { uris: [uri] } })
    playerStore.setIsPlaying(true)
    void args.refreshPlayback()
  }

  const playPlaylistTrack = async (playlistUri: string, position: number) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const preferred = args.webPlayback.getPreferredDeviceId()
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

    playerStore.setIsPlaying(true)
    void args.refreshPlayback()
  }

  const setShuffle = async (enabled: boolean) => {
    const token = await args.ensureFreshToken()
    if (!token) return

    const activeDeviceId = await getActiveDeviceId(token)
    const device = activeDeviceId ? `&device_id=${encodeURIComponent(activeDeviceId)}` : ''

    await apiCall(token, { method: 'PUT', path: `/me/player/shuffle?state=${enabled ? 'true' : 'false'}${device}` })

    playerStore.setShuffle(enabled)
    void args.refreshPlayback()
  }

  return {
    getDevices,
    transferToDevice,
    seekToPercent,
    play,
    pause,
    next,
    previous,
    playTrackUri,
    playPlaylistTrack,
    setShuffle
  }
}
