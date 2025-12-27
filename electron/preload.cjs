const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  openSpotifyAuth: (url) => ipcRenderer.invoke('spotify:open-auth', url),
  spotifyLogin: (args) => ipcRenderer.invoke('spotify:login', args),
  spotifyRefresh: (args) =>
    ipcRenderer.invoke('spotify:refresh', args),
  onSpotifyAuth: (callback) => {
    const handler = (_e, tokens) => callback(tokens)
    ipcRenderer.on('spotify:auth', handler)
    return () => ipcRenderer.off('spotify:auth', handler)
  }, 
  onSpotifyAuthError: (callback) => {
    const handler = (_e, err) => callback(err)
    ipcRenderer.on('spotify:auth-error', handler)
    return () => ipcRenderer.off('spotify:auth-error', handler)
  }
})
