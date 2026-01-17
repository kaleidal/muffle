import type { SpotifyDevice } from './types'
import { apiGet } from './api'
import type { SpotifyDevicesResponse } from './types'

declare global {
  interface Window {
    electron?: {
      minimize?: () => Promise<void>
      maximize?: () => Promise<void>
      close?: () => Promise<void>
      openSpotifyAuth?: (url: string) => Promise<void>
      spotifyLogin?: (args: { clientId: string; scopes: string[] }) => Promise<{ redirectUri: string }>
      spotifyRefresh?: (args: { clientId: string; refreshToken: string }) => Promise<{ accessToken: string; expiresIn: number; error?: string }>
      onSpotifyAuth?: (callback: (tokens: { accessToken: string; refreshToken: string | null; expiresIn: number }) => void) => () => void
      onSpotifyAuthError?: (callback: (err: { message: string }) => void) => () => void
      librespotStatus?: () => Promise<{ running: boolean; ready: boolean; available: boolean }>
      librespotRestart?: () => Promise<void>
      librespotAuth?: (accessToken: string) => Promise<{ ok: boolean }>
      onLibrespotReady?: (callback: () => void) => () => void
    }
  }
}

export type LibrespotStatus = 'unavailable' | 'starting' | 'ready' | 'not-found'

const MUFFLE_DEVICE_NAME = 'Muffle'

export function createLibrespotController(args: {
  getAccessToken: () => Promise<string | null>
  onReady: () => void
  onError: (message: string) => void
  onStatusChange?: (next: { status: LibrespotStatus; available: boolean }) => void
}) {
  let status: LibrespotStatus = 'unavailable'
  let available = false
  let muffleDeviceId: string | null = null
  let preferred = true
  let stopListener: (() => void) | null = null

  const emit = () => args.onStatusChange?.({ status, available })

  const findMuffleDevice = async (): Promise<SpotifyDevice | null> => {
    const token = await args.getAccessToken()
    if (!token) return null

    try {
      const res = await apiGet<SpotifyDevicesResponse>(token, '/me/player/devices')
      const devices = res.devices || []
      const muffleDevice = devices.find(
        (d) => d.name === MUFFLE_DEVICE_NAME || d.name?.toLowerCase().includes('muffle')
      )
      return muffleDevice ?? null
    } catch {
      return null
    }
  }

  const waitForMuffleDevice = async (maxWaitMs = 10000): Promise<string | null> => {
    const startTime = Date.now()
    const pollInterval = 1500

    while (Date.now() - startTime < maxWaitMs) {
      const device = await findMuffleDevice()
      if (device?.id) {
        muffleDeviceId = device.id
        return device.id
      }
      await new Promise((r) => setTimeout(r, pollInterval))
    }

    return null
  }

  const init = async () => {
    stopListener?.()
    stopListener = null

    if (!window.electron?.librespotStatus) {
      status = 'unavailable'
      available = false
      emit()
      return
    }

    try {
      const libStatus = await window.electron.librespotStatus()

      available = !!libStatus.available

      if (!libStatus.available) {
        status = 'not-found'
        console.log('Librespot binary not found, using Connect-only mode')
        emit()
        return
      }

      if (libStatus.ready) {
        status = 'ready'
        emit()
        const deviceId = await waitForMuffleDevice(5000)
        if (deviceId) {
          muffleDeviceId = deviceId
          args.onReady()
        }
      } else if (libStatus.running) {
        status = 'starting'
        emit()
      } else {
        status = 'starting'
        emit()
      }

      stopListener = window.electron.onLibrespotReady?.(() => {
        status = 'ready'
        emit()
        void waitForMuffleDevice(10000).then((deviceId) => {
          if (deviceId) {
            muffleDeviceId = deviceId
            args.onReady()
          }
        })
      }) ?? null
    } catch (e) {
      console.error('Failed to check librespot status:', e)
      status = 'unavailable'
      available = false
      emit()
    }
  }

  const refreshDeviceId = async (): Promise<string | null> => {
    const device = await findMuffleDevice()
    if (device?.id) {
      muffleDeviceId = device.id
    }
    return muffleDeviceId
  }

  const disconnect = () => {
    stopListener?.()
    stopListener = null
    muffleDeviceId = null
  }

  return {
    init,
    disconnect,
    refreshDeviceId,
    getDeviceId: () => muffleDeviceId,
    getPreferredDeviceId: () => (preferred ? muffleDeviceId : null),
    setPreferred: (isPreferred: boolean) => {
      preferred = isPreferred
    },
    getStatus: () => status,
    isBinaryAvailable: () => available,
    isAvailable: () => status === 'ready' || status === 'starting',
    trySeek: async (_positionMs: number) => false
  }
}
