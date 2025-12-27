import { apiGet } from './api'
import type {
  SpotifyFeaturedPlaylists,
  SpotifySearchPlaylistsResponse
} from './types'

export function getLocale(args: { userCountry?: string | undefined }) {
  const navLang = (globalThis as any)?.navigator?.languages?.[0] || (globalThis as any)?.navigator?.language || ''
  const raw = String(navLang || '').trim()

  const normalize = (lang: string, region?: string) => {
    const l = (lang || '').toLowerCase()
    const r = (region || '').toUpperCase()
    if (!l) return null
    if (r) return `${l}_${r}`
    return null
  }

  if (raw) {
    const parts = raw.replace('-', '_').split('_')
    const l = parts[0]
    const r = parts[1]
    const loc = normalize(l, r || args.userCountry)
    if (loc) return loc
  }

  if (args.userCountry) return normalize('en', args.userCountry)
  return null
}

const is404 = (e: unknown) => /\bSpotify API error 404\b/i.test(String((e as any)?.message || e || ''))

export async function fetchFeatured(token: string, country?: string) {
  const locale = country ? getLocale({ userCountry: country }) : null
  const featuredPaths = [
    locale ? `/browse/featured-playlists?limit=30&locale=${encodeURIComponent(locale)}` : null,
    '/browse/featured-playlists?limit=30'
  ].filter(Boolean) as string[]

  for (const path of featuredPaths) {
    try {
      const res = await apiGet<SpotifyFeaturedPlaylists>(token, path)
      const items = res?.playlists?.items || []
      if (items.length) return items
    } catch (e) {
      if (is404(e)) break
    }
  }

  const searchQueries = ['discover weekly', 'release radar', 'daily mix', "today's top hits", 'top hits']
  for (const q of searchQueries) {
    try {
      const res = await apiGet<SpotifySearchPlaylistsResponse>(
        token,
        `/search?type=playlist&limit=30&market=from_token&q=${encodeURIComponent(q)}`
      )
      const items = res?.playlists?.items || []
      if (items.length) {
        const seen = new Set<string>()
        return items.filter((p) => {
          if (!p?.id) return false
          if (seen.has(p.id)) return false
          seen.add(p.id)
          return true
        })
      }
    } catch {
      // ignore
    }
  }

  return []
}
