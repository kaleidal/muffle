import { writable } from 'svelte/store'

export type PageName = 'home' | 'playlist' | 'search' | 'lyrics' | 'settings' | 'entity'
export type EntityType = 'artist' | 'album' | 'show'

export type NavigationState = {
  page: PageName
  playlistId: string | null
  searchQuery: string
  entityType: EntityType | null
  entityId: string | null
}

const initial: NavigationState = {
  page: 'home',
  playlistId: null,
  searchQuery: '',
  entityType: null,
  entityId: null,
}

function createNavigationStore() {
  const { subscribe, update, set } = writable<NavigationState>(initial)
  const backStack: NavigationState[] = []
  const forwardStack: NavigationState[] = []
  let current = initial
  let lastNonLyrics: NavigationState | null = null

  const navigate = (change: (state: NavigationState) => NavigationState, remember = true) => {
    update((state) => {
      const next = change(state)
      if (remember && next !== state) {
        backStack.push(state)
        if (backStack.length > 40) backStack.shift()
        forwardStack.length = 0
      }
      current = next
      return next
    })
  }

  return {
    subscribe,

    goHome() {
      navigate((state) => ({ ...state, page: 'home', playlistId: null, searchQuery: '', entityType: null, entityId: null }))
    },

    openPlaylist(playlistId: string) {
      navigate((state) => ({ ...state, page: 'playlist', playlistId, searchQuery: '', entityType: null, entityId: null }))
    },

    openLikedSongs() {
      navigate((state) => ({ ...state, page: 'playlist', playlistId: 'liked', searchQuery: '', entityType: null, entityId: null }))
    },

    openSettings() {
      navigate((state) => ({ ...state, page: 'settings', searchQuery: '', playlistId: null, entityType: null, entityId: null }))
    },

    openEntity(entityType: EntityType, entityId: string) {
      navigate((state) => ({ ...state, page: 'entity', entityType, entityId, playlistId: null, searchQuery: '' }))
    },

    openLyrics() {
      navigate((state) => {
        if (state.page !== 'lyrics') lastNonLyrics = state
        return { ...state, page: 'lyrics', playlistId: null, searchQuery: '', entityType: null, entityId: null }
      })
    },

    closeLyrics() {
      navigate((state) => {
        if (state.page !== 'lyrics') return state
        return lastNonLyrics ?? { ...state, page: 'home', playlistId: null, searchQuery: '' }
      })
    },

    toggleLyrics() {
      navigate((state) => {
        if (state.page === 'lyrics') return lastNonLyrics ?? { ...state, page: 'home', playlistId: null, searchQuery: '' }
        lastNonLyrics = state
        return { ...state, page: 'lyrics', playlistId: null, searchQuery: '' }
      })
    },

    back() {
      const previous = backStack.pop()
      if (!previous) return
      forwardStack.push(current)
      current = previous
      set(previous)
    },

    forward() {
      const next = forwardStack.pop()
      if (!next) return
      backStack.push(current)
      current = next
      set(next)
    },

    setSearchQuery(query: string) {
      const remember = current.page !== 'search' && Boolean(query.trim())
      navigate((state) => {
        if (query.trim()) {
          if (state.page !== 'lyrics' && state.page !== 'search') lastNonLyrics = state
          return { ...state, page: 'search', playlistId: null, searchQuery: query }
        }
        if (state.page === 'search') return { ...state, page: 'home', searchQuery: '' }
        return { ...state, searchQuery: '' }
      }, remember)
    },
  }
}

export const navigationStore = createNavigationStore()
