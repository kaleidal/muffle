import { native } from '../../native'

export class SpotifyRateLimitError extends Error {
  readonly status = 429
}

async function request<T>(args: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  textBody?: string
  contentType?: string
}): Promise<T> {
  try {
    const response = await native.spotifyRequest<T>(args)
    return response.body as T
  } catch (error) {
    const message = String((error as Error)?.message || error)
    if (/Spotify API error 429/i.test(message)) throw new SpotifyRateLimitError(message)
    throw error
  }
}

export async function apiGet<T>(_token: string, path: string): Promise<T> {
  return request<T>({ method: 'GET', path })
}

export async function apiGetUrl<T>(_token: string, url: string): Promise<T> {
  return request<T>({ method: 'GET', path: url })
}

export async function apiCall(
  _token: string,
  args: { method: 'PUT' | 'POST' | 'DELETE'; path: string; body?: unknown },
) {
  await request({ ...args })
}

export async function apiCallJson<T>(
  _token: string,
  args: { method: 'PUT' | 'POST' | 'DELETE'; path: string; body?: unknown },
): Promise<T> {
  return request<T>({ ...args })
}

export async function apiCallText(
  _token: string,
  args: { method: 'PUT' | 'POST'; path: string; textBody: string; contentType: string },
) {
  await request({ ...args })
}

export function isInsufficientScopeError(error: unknown) {
  const message = String((error as Error)?.message || error)
  return /Spotify API error 403/i.test(message) && /scope/i.test(message)
}
