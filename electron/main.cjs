const { app, BrowserWindow, ipcMain, shell, session } = require('electron')
const { spawn } = require('child_process')
const crypto = require('crypto')
const http = require('http')
const path = require('path')
const fs = require('fs')

let librespotProc = null
let librespotReady = false
let librespotStarting = false
let librespotAuthToken = null
let pendingLibrespotAuthToken = null

function getLibrespotPath() {
  const isPackaged = app.isPackaged
  const platform = process.platform
  const binaryName = platform === 'win32' ? 'librespot.exe' : 'librespot'
  
  if (isPackaged) {
    return path.join(process.resourcesPath, 'librespot', binaryName)
  }
  return path.join(__dirname, '..', 'resources', 'librespot', binaryName)
}

function librespotExists() {
  const binPath = getLibrespotPath()
  return fs.existsSync(binPath)
}

function startLibrespot(accessToken) {
  if (librespotProc || librespotStarting) return
  
  const binPath = getLibrespotPath()
  if (!fs.existsSync(binPath)) {
    console.warn('librespot binary not found at:', binPath)
    console.warn('Muffle will work in Connect-only mode (control external devices)')
    return
  }
  
  librespotStarting = true
  console.log('Starting librespot from:', binPath)

  const systemCacheDir = path.join(app.getPath('userData'), 'librespot')
  try {
    fs.mkdirSync(systemCacheDir, { recursive: true })
  } catch {
  }
  
  const args = [
    '--name', 'Muffle',
    '--backend', 'rodio',
    '--bitrate', '320',
    '--device-type', 'computer',
    '--system-cache', systemCacheDir,
    '--disable-audio-cache',
    '--enable-volume-normalisation',
    '--initial-volume', '80'
  ]

  if (accessToken) {
    args.push('--access-token', String(accessToken))
  }
  
  librespotProc = spawn(binPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  
  librespotProc.stdout.on('data', (data) => {
    const output = data.toString()
    console.log('[librespot]', output)
    if (output.includes('Authenticated') || output.includes('authenticated')) {
      librespotReady = true
      librespotStarting = false
      if (mainWindow) {
        mainWindow.webContents.send('librespot:ready')
      }
    }
  })
  
  librespotProc.stderr.on('data', (data) => {
    const output = data.toString()
    console.log('[librespot:err]', output)
    if (output.includes('Authenticated') || output.includes('authenticated')) {
      librespotReady = true
      librespotStarting = false
      if (mainWindow) {
        mainWindow.webContents.send('librespot:ready')
      }
    }
  })
  
  librespotProc.on('error', (err) => {
    console.error('Failed to start librespot:', err)
    librespotProc = null
    librespotReady = false
    librespotStarting = false
  })
  
  librespotProc.on('exit', (code, signal) => {
    console.log('librespot exited with code:', code, 'signal:', signal)
    librespotProc = null
    librespotReady = false
    librespotStarting = false

    if (pendingLibrespotAuthToken) {
      const tok = pendingLibrespotAuthToken
      pendingLibrespotAuthToken = null
      librespotAuthToken = tok
      setTimeout(() => startLibrespot(tok), 250)
    }
  })
}

function stopLibrespot() {
  if (librespotProc) {
    console.log('Stopping librespot...')
    librespotProc.kill('SIGTERM')
    librespotProc = null
    librespotReady = false
  }
}

let mainWindow = null

let spotifyAuthServer = null
let spotifyRedirectUri = null
let spotifyPkceVerifier = null
let spotifyAuthState = null

if (process.env.NODE_ENV !== 'production') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
  process.env.ELECTRON_DISABLE_SANDBOX = '1'
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

if (process.platform === 'win32') {
  try {
    app.setAppUserModelId("al.kaleid.muffle");
    const squirrelStartup = require('electron-squirrel-startup')
    if (squirrelStartup) app.quit()
  } catch {
  }
}

function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createPkceVerifier() {
  return base64UrlEncode(crypto.randomBytes(32))
}

function createPkceChallenge(verifier) {
  const digest = crypto.createHash('sha256').update(verifier).digest()
  return base64UrlEncode(digest)
}

async function exchangeSpotifyCode(args) {
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

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || 'Spotify token exchange failed')
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in
  }
}

async function refreshSpotifyToken(args) {
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

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || 'Spotify token refresh failed')
  }

  const hasRefreshToken = Object.prototype.hasOwnProperty.call(json || {}, 'refresh_token')
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in,
    ...(hasRefreshToken ? { refreshToken: json.refresh_token ?? null } : {})
  }
}

async function stopSpotifyAuthServer() {
  await new Promise((resolve) => {
    if (!spotifyAuthServer) return resolve()
    spotifyAuthServer.close(() => resolve())
  })
  spotifyAuthServer = null
  spotifyRedirectUri = null
  spotifyPkceVerifier = null
  spotifyAuthState = null
}

async function startSpotifyAuthServer(clientId) {
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
        if (mainWindow) {
          mainWindow.webContents.send('spotify:auth-error', { message: error })
        }
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

      if (mainWindow) {
        mainWindow.webContents.send('spotify:auth', tokens)
      }
      await stopSpotifyAuthServer()
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('Auth error')
      if (mainWindow) {
        mainWindow.webContents.send('spotify:auth-error', { message: e?.message || 'Auth error' })
      }
      await stopSpotifyAuthServer()
    }
  })

  await new Promise((resolve, reject) => {
    spotifyAuthServer.once('error', (err) => reject(err))
    spotifyAuthServer.listen(5174, '127.0.0.1', () => resolve())
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
    backgroundColor: '#050505',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#050505',
      symbolColor: '#ffffff',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: app.isPackaged,
      plugins: true
    },
    icon: path.join(__dirname, '../public/icon.png')
  })

  const isDev = !app.isPackaged

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer did-fail-load', { errorCode, errorDescription, validatedURL })
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('Renderer process gone', details)
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  const isDev = !app.isPackaged
  const devOrigin = 'http://localhost:5173'

  startLibrespot()

  const csp = [
    isDev ? `default-src 'self' ${devOrigin}` : "default-src 'self'",
    isDev
      ? `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${devOrigin}`
      : "script-src 'self' 'unsafe-inline'",
    isDev
      ? "connect-src 'self' https://*.spotify.com https://*.scdn.co https://*.spotifycdn.com wss://*.spotify.com https://api.spotify.com https://accounts.spotify.com https://lrclib.net http://127.0.0.1:5174 ws://localhost:5173 http://localhost:5173"
      : "connect-src 'self' https://*.spotify.com https://*.scdn.co https://*.spotifycdn.com wss://*.spotify.com https://api.spotify.com https://accounts.spotify.com https://lrclib.net http://127.0.0.1:5174",
    isDev ? `img-src 'self' data: https: ${devOrigin}` : "img-src 'self' data: https:",
    isDev
      ? `style-src 'self' 'unsafe-inline' ${devOrigin} https://fonts.googleapis.com`
      : "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    isDev
      ? `style-src-elem 'self' 'unsafe-inline' ${devOrigin} https://fonts.googleapis.com`
      : "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "media-src 'self' blob: https: https://*.spotifycdn.com",
    "frame-src https://accounts.spotify.com",
  ].join('; ')

  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = details.responseHeaders || {}
      headers['Content-Security-Policy'] = [csp]
      callback({ responseHeaders: headers })
    })
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopLibrespot()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopLibrespot()
})

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close()
})

ipcMain.handle('spotify:open-auth', async (_event, authUrl) => {
  await shell.openExternal(authUrl)
})

ipcMain.handle('spotify:login', async (_event, args) => {
  const { redirectUri, params } = await startSpotifyAuthServer(args.clientId)
  params.set('scope', args.scopes.join(' '))
  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`
  await shell.openExternal(authUrl)
  return { redirectUri }
})

ipcMain.handle('spotify:refresh', async (_event, args) => {
  try {
    return await refreshSpotifyToken(args)
  } catch (e) {
    const message = e?.message || 'Spotify token refresh failed'
    if (mainWindow) {
      mainWindow.webContents.send('spotify:auth-error', { message })
    }
    throw new Error(message)
  }
})

ipcMain.handle('librespot:status', () => {
  return {
    running: !!librespotProc,
    ready: librespotReady,
    available: librespotExists()
  }
})

ipcMain.handle('librespot:restart', () => {
  stopLibrespot()
  setTimeout(() => startLibrespot(), 500)
})

ipcMain.handle('librespot:auth', (_event, accessToken) => {
  const tokenStr = accessToken ? String(accessToken) : null

  if (!librespotExists()) {
    return { ok: false, skipped: true, reason: 'not-found' }
  }

  if (tokenStr && librespotProc && librespotAuthToken === tokenStr) {
    return { ok: true, skipped: true }
  }

  if (librespotStarting) {
    pendingLibrespotAuthToken = tokenStr
    return { ok: true, queued: true }
  }

  librespotAuthToken = tokenStr

  if (librespotProc) {
    pendingLibrespotAuthToken = tokenStr
    stopLibrespot()
    return { ok: true, queued: true }
  }

  startLibrespot(tokenStr)
  return { ok: true }
})
