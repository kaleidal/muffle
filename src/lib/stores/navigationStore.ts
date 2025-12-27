import { writable } from 'svelte/store'

export type PageName = 'home' | 'playlist' | 'search' | 'lyrics'

export type NavigationState = {
  page: PageName
  playlistId: string | null
  searchQuery: string
}

function createNavigationStore() {
  const { subscribe, update } = writable<NavigationState>({
    page: 'home',
    playlistId: null,
    searchQuery: ''
  })

  let lastNonLyrics: NavigationState | null = null

  return {
    subscribe,

    goHome() {
      update((s) => ({ ...s, page: 'home', playlistId: null, searchQuery: '' }))
    },

    openPlaylist(playlistId: string) {
      update((s) => ({ ...s, page: 'playlist', playlistId, searchQuery: '' }))
    },

    openLikedSongs() {
      update((s) => ({ ...s, page: 'playlist', playlistId: 'liked', searchQuery: '' }))
    },

    openLyrics() {
      update((s) => {
        if (s.page !== 'lyrics') lastNonLyrics = s
        return { ...s, page: 'lyrics', playlistId: null, searchQuery: '' }
      })
    },

    closeLyrics() {
      update((s) => {
        if (s.page !== 'lyrics') return s
        if (lastNonLyrics) return lastNonLyrics
        return { ...s, page: 'home', playlistId: null, searchQuery: '' }
      })
    },

    toggleLyrics() {
      update((s) => {
        if (s.page === 'lyrics') {
          if (lastNonLyrics) return lastNonLyrics
          return { ...s, page: 'home', playlistId: null, searchQuery: '' }
        }

        lastNonLyrics = s
        return { ...s, page: 'lyrics', playlistId: null, searchQuery: '' }
      })
    },

    setSearchQuery(query: string) {
      const q = query
      update((s) => {
        if (q.trim().length) {
          if (s.page !== 'lyrics') lastNonLyrics = s
          return { ...s, page: 'search', playlistId: null, searchQuery: q }
        }

        // Clearing search returns to home (unless you explicitly navigated elsewhere).
        if (s.page === 'search') {
          return { ...s, page: 'home', searchQuery: '' }
        }

        return { ...s, searchQuery: '' }
      })
    }
  }
}

export const navigationStore = createNavigationStore()
