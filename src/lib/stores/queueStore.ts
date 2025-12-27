import { get, writable } from 'svelte/store'
import { playerStore, type Track } from './playerStore'

export type QueueEntry = {
  key: string
  track: Track
}

export type QueueContext = {
  tracks: Track[]
  order: number[]
  currentIndex: number
  shuffle: boolean
}

export type QueueState = {
  entries: QueueEntry[]
  history: Track[]
  context: QueueContext | null
  contextDirty: boolean
}

const createKey = (track: Track) => `${track.id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`

function shuffleIndices(indices: number[]) {
  const arr = [...indices]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function buildContextOrder(args: { length: number; startIndex: number; shuffle: boolean }) {
  const all = Array.from({ length: args.length }, (_, i) => i)
  const start = Math.max(0, Math.min(args.length - 1, args.startIndex | 0))
  const remaining = all.filter((i) => i !== start)
  const orderedRemaining = args.shuffle ? shuffleIndices(remaining) : remaining
  return [start, ...orderedRemaining]
}

function createQueueStore() {
  const { subscribe, update, set } = writable<QueueState>({
    entries: [],
    history: [],
    context: null,
    contextDirty: false
  })

  const syncPlayer = () => {
    const state = get({ subscribe })
    playerStore.setQueue(state.entries.map((e) => e.track))
    playerStore.setNextTrack(state.entries[0]?.track ?? null)
  }

  subscribe(() => syncPlayer())

  return {
    subscribe,

    clear() {
      set({ entries: [], history: [], context: null, contextDirty: false })
    },

    setSingleTrackMode() {
      update((s) => ({ ...s, entries: [], history: [], context: null, contextDirty: false }))
    },

    setPlaylistContext(tracks: Track[], startIndex: number, shuffle: boolean) {
      update(() => {
        const safeTracks = (tracks || []).filter((t) => t?.uri)
        if (safeTracks.length === 0) return { entries: [], history: [], context: null, contextDirty: false }

        const order = buildContextOrder({ length: safeTracks.length, startIndex, shuffle })
        const start = order[0]
        const upcoming = order.slice(1).map((idx) => ({ key: createKey(safeTracks[idx]), track: safeTracks[idx] }))

        return {
          entries: upcoming,
          history: [],
          context: { tracks: safeTracks, order, currentIndex: start, shuffle },
          contextDirty: false
        }
      })

      playerStore.setShuffle(!!shuffle)
    },

    enqueue(track: Track) {
      if (!track?.uri) return
      update((s) => ({ ...s, entries: [...s.entries, { key: createKey(track), track }] }))
    },

    reorder(fromIndex: number, toIndex: number) {
      update((s) => {
        const from = fromIndex | 0
        const to = toIndex | 0
        if (from < 0 || from >= s.entries.length) return s
        if (to < 0 || to >= s.entries.length) return s
        if (from === to) return s

        const next = [...s.entries]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)

        return { ...s, entries: next, contextDirty: true }
      })
    },

    consumeNext(current: Track | null): Track | null {
      let nextTrack: Track | null = null
      update((s) => {
        if (s.entries.length === 0) return s
        const [head, ...rest] = s.entries
        nextTrack = head.track

        const history = current ? [...s.history, current] : s.history
        return { ...s, entries: rest, history }
      })
      return nextTrack
    },

    consumePrev(current: Track | null): Track | null {
      let prevTrack: Track | null = null
      update((s) => {
        if (s.history.length === 0) return s

        const history = [...s.history]
        prevTrack = history.pop() ?? null

        const entries = current ? [{ key: createKey(current), track: current }, ...s.entries] : s.entries
        return { ...s, history, entries, contextDirty: true }
      })
      return prevTrack
    },

    syncToCurrent(current: Track | null) {
      if (!current) return
      update((s) => {
        const idx = s.entries.findIndex((e) => e.track.id === current.id)
        if (idx < 0) return s
        return { ...s, entries: s.entries.slice(idx + 1) }
      })
    }
  }
}

export const queueStore = createQueueStore()
