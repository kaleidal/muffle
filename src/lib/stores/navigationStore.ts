import { writable } from 'svelte/store'

export type PageName = 'home' | 'playlist' | 'search'

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

    setSearchQuery(query: string) {
      const q = query
      update((s) => {
        if (q.trim().length) {
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
