import { get } from 'svelte/store'
import { playerStore } from '../../playerStore'
import { apiGet } from '../api'
import { mapToTrack } from '../mappers'
import type { SpotifyCurrentlyPlaying, SpotifyMePlayer, SpotifyQueue } from '../types'

function sanitizeQueue(args: { currentTrackId: string | null; incoming: NonNullable<SpotifyQueue['queue']> }) {
  const mapped = (args.incoming || []).map(mapToTrack).filter((t) => t?.id && t?.uri)

  const withoutCurrent = args.currentTrackId ? mapped.filter((t) => t.id !== args.currentTrackId) : mapped

  const collapsed: typeof withoutCurrent = []
  for (const t of withoutCurrent) {
    const prev = collapsed[collapsed.length - 1]
    if (prev && prev.id === t.id) continue
    collapsed.push(t)
    if (collapsed.length >= 20) break
  }

  return collapsed
}

export function fetchPlaybackOnceFactory(args: { updateCurrent: (current: SpotifyCurrentlyPlaying) => void }) {
  return async function fetchPlaybackOnce(token: string) {
    const [currentRes, queueRes, playerRes] = await Promise.allSettled([
      apiGet<SpotifyCurrentlyPlaying>(token, '/me/player/currently-playing'),
      apiGet<SpotifyQueue>(token, '/me/player/queue'),
      apiGet<SpotifyMePlayer>(token, '/me/player')
    ])

    const current = currentRes.status === 'fulfilled' ? currentRes.value : ({ is_playing: false, progress_ms: 0, item: null } as any)
    const queue = queueRes.status === 'fulfilled' ? queueRes.value : ({ currently_playing: null, queue: [] } as any)

    if (playerRes.status === 'fulfilled' && typeof playerRes.value?.shuffle_state === 'boolean') {
      playerStore.setShuffleFromServer(playerRes.value.shuffle_state)
    }

    args.updateCurrent(current)

    const prevPlayer = get(playerStore)

    const currentTrack = current?.item ? mapToTrack(current.item) : current?.is_playing ? prevPlayer.currentTrack : null
    const queueTracks = sanitizeQueue({ currentTrackId: currentTrack?.id ?? null, incoming: queue?.queue ?? [] })
    const nextTrack = queueTracks[0] ?? null

    const progressPct =
      current?.item && current.item.duration_ms
        ? (current.progress_ms / current.item.duration_ms) * 100
        : prevPlayer.progress

    playerStore.setPlaybackState({
      current: currentTrack,
      next: nextTrack,
      queue: queueTracks,
      isPlaying: current?.is_playing ?? prevPlayer.isPlaying,
      progressPct
    })
  }
}
