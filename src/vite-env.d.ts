/// <reference types="vite/client" />

declare global {
  interface Window {
    electron?: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      openSpotifyAuth: (url: string) => Promise<void>

      spotifyLogin: (args: { clientId: string; scopes: string[] }) => Promise<{ redirectUri: string }>
      spotifyRefresh: (args: { clientId: string; refreshToken: string }) => Promise<{ accessToken: string; expiresIn: number }>
      onSpotifyAuth: (
        callback: (tokens: { accessToken: string; refreshToken: string | null; expiresIn: number }) => void
      ) => () => void
      onSpotifyAuthError: (callback: (err: { message: string }) => void) => () => void
    }

    Spotify?: any
    onSpotifyWebPlaybackSDKReady?: () => void
  }
}

export {}
