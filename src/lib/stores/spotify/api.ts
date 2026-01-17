const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let rateLimitedUntil = 0

function parseRetryAfterMs(res: Response) {
  const raw = res.headers.get('retry-after')
  const seconds = raw ? Number(raw) : NaN
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000)
  return 2500
}

async function waitForRateLimit() {
  const now = Date.now()
  if (now >= rateLimitedUntil) return
  await sleep(Math.max(0, rateLimitedUntil - now))
}

function noteRateLimited(res: Response) {
  const backoffMs = parseRetryAfterMs(res)
  rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + backoffMs)
  return backoffMs
}

export class SpotifyRateLimitError extends Error {
  readonly status = 429
  readonly retryAfterMs: number
  constructor(message: string, retryAfterMs: number) {
    super(message)
    this.name = 'SpotifyRateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

async function spotifyFetch(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  await waitForRateLimit()

  const res = await fetch(url, init)
  if (res.status !== 429) return res

  const retryAfterMs = noteRateLimited(res)
  if (attempt >= 1) {
    throw new SpotifyRateLimitError(`Spotify API error 429 API rate limit exceeded (retry after ${Math.ceil(retryAfterMs / 1000)}s)`, retryAfterMs)
  }

  await waitForRateLimit()
  return await spotifyFetch(url, init, attempt + 1)
}

export async function apiGet<T>(token: string, path: string): Promise<T> {
  const res = await spotifyFetch(`https://api.spotify.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Spotify API error ${res.status} ${res.statusText} ${text}`)
  }

  return (await res.json()) as T
}

export async function apiGetUrl<T>(token: string, url: string): Promise<T> {
  const res = await spotifyFetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Spotify API error ${res.status} ${res.statusText} ${text}`)
  }

  return (await res.json()) as T
}

export async function apiCall(token: string, args: { method: 'PUT' | 'POST'; path: string; body?: any }) {
  const res = await spotifyFetch(`https://api.spotify.com/v1${args.path}`, {
    method: args.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(args.body ? { 'content-type': 'application/json' } : {})
    },
    body: args.body ? JSON.stringify(args.body) : undefined
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Spotify API error ${res.status} ${res.statusText} ${text}`)
  }
}

export async function apiCallJson<T>(token: string, args: { method: 'PUT' | 'POST'; path: string; body?: any }): Promise<T> {
  const res = await spotifyFetch(`https://api.spotify.com/v1${args.path}`, {
    method: args.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(args.body ? { 'content-type': 'application/json' } : {})
    },
    body: args.body ? JSON.stringify(args.body) : undefined
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Spotify API error ${res.status} ${res.statusText} ${text}`)
  }

  return (await res.json()) as T
}

export function isInsufficientScopeError(err: unknown) {
  const msg = String((err as any)?.message || err || '')
  return /\bSpotify API error 403\b/i.test(msg) && /insufficient client scope/i.test(msg)
}
