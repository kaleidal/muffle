import { app, BrowserWindow, ipcMain, shell, session } from 'electron'
import crypto from 'crypto'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// castLabs ECS + Windows can error with: "Sandbox cannot access executable" (0x5)
// in some environments (Defender/Controlled Folder Access, permissions, etc.).
// Disabling sandbox is acceptable for local dev.
if (process.env.NODE_ENV !== 'production') {
  // Dev-only: Vite/HMR requires a looser CSP (unsafe-eval) and Electron will warn.
  // This does not affect packaged builds.
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
  process.env.ELECTRON_DISABLE_SANDBOX = '1'
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

// Optional: only needed for Squirrel.Windows install/uninstall events.
if (process.platform === 'win32') {
  try {
    // electron-squirrel-startup is optional in dev.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const squirrelStartup = require('electron-squirrel-startup')
    if (squirrelStartup) app.quit()
  } catch {
    // Not installed in dev; ignore.
  }
}

let mainWindow: BrowserWindow | null = null

type SpotifyAuthSuccess = {
  accessToken: string
  refreshToken: string | null
  expiresIn: number
}

type SpotifyLoginArgs = {
  clientId: string
  scopes: string[]
}

let spotifyAuthServer: http.Server | null = null
let spotifyRedirectUri: string | null = null
let spotifyPkceVerifier: string | null = null
let spotifyAuthState: string | null = null

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createPkceVerifier() {
  // 32 bytes => 43 chars base64url-ish, valid for PKCE
  return base64UrlEncode(crypto.randomBytes(32))
}

function createPkceChallenge(verifier: string) {
  const digest = crypto.createHash('sha256').update(verifier).digest()
  return base64UrlEncode(digest)
}

async function exchangeSpotifyCode(args: {
  clientId: string
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<SpotifyAuthSuccess> {
  const body = new URLSearchParams({
    client_id: args.clientId,
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier
  })

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || 'Spotify token exchange failed')
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in
  }
}

async function refreshSpotifyToken(args: {
  clientId: string
  refreshToken: string
}): Promise<{ accessToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    client_id: args.clientId,
    grant_type: 'refresh_token',
    refresh_token: args.refreshToken
  })

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || 'Spotify token refresh failed')
  }

  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in
  }
}

async function stopSpotifyAuthServer() {
  await new Promise<void>((resolve) => {
    if (!spotifyAuthServer) return resolve()
    spotifyAuthServer.close(() => resolve())
  })
  spotifyAuthServer = null
  spotifyRedirectUri = null
  spotifyPkceVerifier = null
  spotifyAuthState = null
}

async function startSpotifyAuthServer(clientId: string) {
  await stopSpotifyAuthServer()

  spotifyPkceVerifier = createPkceVerifier()
  const codeChallenge = createPkceChallenge(spotifyPkceVerifier)
  spotifyAuthState = base64UrlEncode(crypto.randomBytes(16))

  spotifyAuthServer = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`)
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('Not found')
        return
      }

      const code = reqUrl.searchParams.get('code')
      const state = reqUrl.searchParams.get('state')
      const error = reqUrl.searchParams.get('error')

      if (error) {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end(`<html><body><h2>Spotify login failed</h2><p>${error}</p><p>You can close this window.</p></body></html>`)
        mainWindow?.webContents.send('spotify:auth-error', { message: error })
        await stopSpotifyAuthServer()
        return
      }

      if (!code || !spotifyPkceVerifier || !spotifyRedirectUri) {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end('Missing code')
        return
      }

      if (!state || state !== spotifyAuthState) {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end('Invalid state')
        return
      }

      const tokens = await exchangeSpotifyCode({
        clientId,
        code,
        codeVerifier: spotifyPkceVerifier,
        redirectUri: spotifyRedirectUri
      })

      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(
        `<html><body style="font-family:system-ui;padding:24px"><h2>Connected to Spotify</h2><p>You can close this window and return to Muffle.</p></body></html>`
      )

      mainWindow?.webContents.send('spotify:auth', tokens)
      await stopSpotifyAuthServer()
    } catch (e: any) {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('Auth error')
      mainWindow?.webContents.send('spotify:auth-error', { message: e?.message || 'Auth error' })
      await stopSpotifyAuthServer()
    }
  })

  // Spotify requires exact redirect URIs (no wildcards), so use a stable port.
  await new Promise<void>((resolve, reject) => {
    spotifyAuthServer!.once('error', (err) => reject(err))
    spotifyAuthServer!.listen(5174, '127.0.0.1', () => resolve())
  })

  spotifyRedirectUri = `http://127.0.0.1:5174/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: spotifyRedirectUri,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state: spotifyAuthState,
    show_dialog: 'true'
  })

  return { redirectUri: spotifyRedirectUri, params }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0a',
      symbolColor: '#ffffff',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,
      plugins: true
    },
    icon: path.join(__dirname, '../public/icon.png')
  })

  if (process.env.NODE_ENV !== 'production') {
    void mainWindow.loadURL('http://localhost:5173')
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  // Set a CSP to reduce exposure and remove Electron's insecure CSP warning.
  // In dev we allow 'unsafe-eval' for Vite/HMR.
  const isDev = process.env.NODE_ENV !== 'production'
  const csp = [
    "default-src 'self'",
    // Vite dev uses eval in some cases; keep it dev-only.
    isDev
      ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://sdk.scdn.co"
      : "script-src 'self' 'unsafe-inline' https://sdk.scdn.co",
    // Spotify Web API + auth + local callback + Vite dev server.
    isDev
      ? "connect-src 'self' https://*.spotify.com https://*.scdn.co https://*.spotifycdn.com wss://*.spotify.com https://api.spotify.com https://accounts.spotify.com http://127.0.0.1:5174 ws://localhost:5173 http://localhost:5173"
      : "connect-src 'self' https://*.spotify.com https://*.scdn.co https://*.spotifycdn.com wss://*.spotify.com https://api.spotify.com https://accounts.spotify.com http://127.0.0.1:5174",
    "img-src 'self' data: https:",
    // Allow Google Fonts stylesheet.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Allow Google Fonts font files.
    "font-src 'self' data: https://fonts.gstatic.com",
    "media-src 'self' blob: https: https://*.spotifycdn.com",
    "frame-src https://accounts.spotify.com https://sdk.scdn.co"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {}
    headers['Content-Security-Policy'] = [csp]
    callback({ responseHeaders: headers })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('spotify:open-auth', async (_event, authUrl: string) => {
  await shell.openExternal(authUrl)
})

ipcMain.handle('spotify:login', async (_event, args: SpotifyLoginArgs) => {
  const { redirectUri, params } = await startSpotifyAuthServer(args.clientId)
  params.set('scope', args.scopes.join(' '))
  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`
  await shell.openExternal(authUrl)
  return { redirectUri }
})

ipcMain.handle('spotify:refresh', async (_event, args: { clientId: string; refreshToken: string }) => {
  try {
    return await refreshSpotifyToken(args)
  } catch (e: any) {
    const message = e?.message || 'Spotify token refresh failed'
    // Let renderer decide whether to force logout; this prevents silent failures.
    mainWindow?.webContents.send('spotify:auth-error', { message })
    throw new Error(message)
  }
})
