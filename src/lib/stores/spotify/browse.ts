import { apiGet } from './api'
import type {
  SpotifyCategoriesResponse,
  SpotifyCategoryPlaylists,
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

export async function fetchBrowseCategories(token: string, limit = 5, locale?: string | null) {
  return await fetchBrowseCategoriesV2(token, { limit, locale })
}

export async function fetchBrowseCategoriesV2(
  token: string,
  args: { limit?: number; country?: string | null; locale?: string | null }
) {
  const limit = args.limit ?? 5
  const qs = new URLSearchParams({
    limit: String(Math.max(1, Math.min(50, limit)))
  })

  if (args.country) qs.set('country', args.country)
  if (args.locale) qs.set('locale', args.locale)

  try {
    const res = await apiGet<SpotifyCategoriesResponse>(token, `/browse/categories?${qs.toString()}`)
    return (res?.categories?.items || []).filter((c) => c?.id)
  } catch (e) {
    if (!is404(e)) throw e

    const fallback = new URLSearchParams({
      limit: String(Math.max(1, Math.min(50, limit)))
    })
    if (args.country) fallback.set('country', args.country)

    const res = await apiGet<SpotifyCategoriesResponse>(token, `/browse/categories?${fallback.toString()}`)
    return (res?.categories?.items || []).filter((c) => c?.id)
  }
}

export async function fetchCategoryPlaylists(token: string, categoryId: string, limit = 12, country?: string | null) {
  const qs = new URLSearchParams({
    limit: String(Math.max(1, Math.min(50, limit)))
  })
  if (country) qs.set('country', country)
  const res = await apiGet<SpotifyCategoryPlaylists>(
    token,
    `/browse/categories/${encodeURIComponent(categoryId)}/playlists?${qs.toString()}`
  )
  return res?.playlists?.items || []
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

  const categoriesPaths = [
    country ? `/browse/categories?limit=50&country=${encodeURIComponent(country)}` : null,
    '/browse/categories?limit=50'
  ].filter(Boolean) as string[]

  let categoryIds: string[] = []
  for (const path of categoriesPaths) {
    try {
      const res = await apiGet<SpotifyCategoriesResponse>(token, path)
      const ids = res?.categories?.items?.map((c) => c.id).filter(Boolean) || []
      if (ids.length) {
        categoryIds = ids.includes('toplists') ? ['toplists', ...ids.filter((id) => id !== 'toplists')] : ids
        break
      }
    } catch (e) {
      if (is404(e)) {
        categoryIds = []
        break
      }
    }
  }

  if (categoryIds.length) {
    let consecutive404 = 0

    for (const categoryId of categoryIds.slice(0, 10)) {
      const playlistPaths = [
        country
          ? `/browse/categories/${encodeURIComponent(categoryId)}/playlists?limit=30&country=${encodeURIComponent(country)}`
          : null,
        `/browse/categories/${encodeURIComponent(categoryId)}/playlists?limit=30`
      ].filter(Boolean) as string[]

      for (const path of playlistPaths) {
        try {
          const res = await apiGet<SpotifyCategoryPlaylists>(token, path)
          const items = res?.playlists?.items || []
          if (items.length) return items
        } catch (e) {
          if (is404(e)) {
            consecutive404 += 1
            if (consecutive404 >= 3) break
          }
        }
      }

      if (consecutive404 >= 3) break
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
