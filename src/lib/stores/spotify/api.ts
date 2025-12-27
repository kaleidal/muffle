export async function apiGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
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
  const res = await fetch(url, {
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
  const res = await fetch(`https://api.spotify.com/v1${args.path}`, {
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

export function isInsufficientScopeError(err: unknown) {
  const msg = String((err as any)?.message || err || '')
  return /\bSpotify API error 403\b/i.test(msg) && /insufficient client scope/i.test(msg)
}
