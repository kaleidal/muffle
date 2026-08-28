import { appWindow, invoke, isAvailable, listen } from '@lantharos/sabine'

export type AuthState =
  | { state: 'signedOut' }
  | { state: 'signingIn' }
  | { state: 'signedIn' }
  | { state: 'failed'; message: string }

export type PlaybackAvailability =
  | { state: 'unavailable' }
  | { state: 'authorizing' }
  | { state: 'connecting' }
  | { state: 'ready'; device_id?: string; deviceId?: string }
  | { state: 'failed'; message: string }

export type SpotifyReceiver = {
  name: string
  address: string
  port: number
  path: string
}

export function requireNative() {
  if (!isAvailable()) throw new Error('Muffle must run inside Sabine')
}

export const native = {
  window: appWindow,
  authStatus: () => invoke<AuthState>('muffle.auth.status'),
  signIn: () => invoke<{ started: boolean }>('muffle.auth.signIn'),
  signOut: () => invoke<void>('muffle.auth.signOut'),
  openExternal: (url: string) => invoke<void>('muffle.openExternal', { url }),
  pickPlaylistCover: () => invoke<string | null>('muffle.pickPlaylistCover'),
  spotifyRequest: <T>(request: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    path: string
    body?: unknown
    textBody?: string
    contentType?: string
  }) => invoke<{ status: number; body: T | null }>('muffle.spotify.request', request),
  playbackStatus: () =>
    invoke<{ availability: PlaybackAvailability; local: unknown }>('muffle.playback.status'),
  authorizePlayback: () => invoke<{ started: boolean }>('muffle.playback.authorize'),
  playbackCommand: (name: string, params: Record<string, unknown> = {}) =>
    invoke<void>('muffle.playback.command', { name, params }),
  getSettings: <T>() => invoke<T>('muffle.settings.get'),
  updateSettings: <T>(settings: T) => invoke<void>('muffle.settings.update', { settings }),
  discoverReceivers: (timeoutMs = 1800) => invoke<SpotifyReceiver[]>('muffle.zeroconf.discover', { timeoutMs }),
  activateReceiver: (receiver: SpotifyReceiver) => invoke<void>('muffle.zeroconf.activate', { receiver }),
  onAuthState: (callback: (state: AuthState) => void) => listen('muffle.authState', callback),
  onPlaybackStatus: (callback: (state: PlaybackAvailability) => void) =>
    listen('muffle.playbackStatus', callback),
}
