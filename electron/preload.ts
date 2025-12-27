import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
  maximize: () => ipcRenderer.invoke('window:maximize') as Promise<void>,
  close: () => ipcRenderer.invoke('window:close') as Promise<void>,
  openSpotifyAuth: (url: string) => ipcRenderer.invoke('spotify:open-auth', url) as Promise<void>,
  spotifyLogin: (args: { clientId: string; scopes: string[] }) => ipcRenderer.invoke('spotify:login', args) as Promise<{ redirectUri: string }>,
  spotifyRefresh: (args: { clientId: string; refreshToken: string }) =>
    ipcRenderer.invoke('spotify:refresh', args) as Promise<{ accessToken: string; expiresIn: number }>,
  onSpotifyAuth: (callback: (tokens: { accessToken: string; refreshToken: string | null; expiresIn: number }) => void) => {
    const handler = (_e: unknown, tokens: { accessToken: string; refreshToken: string | null; expiresIn: number }) => callback(tokens)
    ipcRenderer.on('spotify:auth', handler)
    return () => ipcRenderer.off('spotify:auth', handler)
  }, 
  onSpotifyAuthError: (callback: (err: { message: string }) => void) => {
    const handler = (_e: unknown, err: { message: string }) => callback(err)
    ipcRenderer.on('spotify:auth-error', handler)
    return () => ipcRenderer.off('spotify:auth-error', handler)
  }
})
