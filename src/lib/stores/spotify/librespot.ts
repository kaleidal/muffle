import { native, type PlaybackAvailability } from '../../native'

export type LibrespotStatus = 'unavailable' | 'starting' | 'ready' | 'not-found'

function mapStatus(availability: PlaybackAvailability): LibrespotStatus {
  if (availability.state === 'ready') return 'ready'
  if (availability.state === 'authorizing' || availability.state === 'connecting') return 'starting'
  return 'unavailable'
}

export function createLibrespotController(args: {
  getAccessToken: () => Promise<string | null>
  onReady: () => void
  onError: (message: string) => void
  onStatusChange?: (next: { status: LibrespotStatus; available: boolean }) => void
}) {
  let status: LibrespotStatus = 'unavailable'
  let deviceId: string | null = null
  let preferred = true
  let stopListener: (() => void) | null = null

  const apply = (availability: PlaybackAvailability) => {
    status = mapStatus(availability)
    if (availability.state === 'ready') {
      deviceId = availability.deviceId ?? availability.device_id ?? null
      args.onReady()
    } else if (availability.state === 'failed') {
      args.onError(availability.message)
    }
    args.onStatusChange?.({ status, available: true })
  }

  const refresh = async () => {
    const response = await native.playbackStatus()
    apply(response.availability)
    return deviceId
  }

  const init = async () => {
    stopListener?.()
    stopListener = native.onPlaybackStatus(apply)
    await refresh()
  }

  const authorize = async () => {
    await native.authorizePlayback()
    await refresh()
  }

  return {
    init,
    authorize,
    disconnect() {
      stopListener?.()
      stopListener = null
      deviceId = null
    },
    refreshDeviceId: refresh,
    getDeviceId: () => deviceId,
    getPreferredDeviceId: () => (preferred ? deviceId : null),
    setPreferred: (value: boolean) => {
      preferred = value
    },
    getStatus: () => status,
    isBinaryAvailable: () => true,
    isAvailable: () => true,
    command: (name: string, params: Record<string, unknown> = {}) => native.playbackCommand(name, params),
    trySeek: async (positionMs: number) => {
      if (!deviceId) return false
      await native.playbackCommand('seek', { positionMs })
      return true
    },
  }
}
