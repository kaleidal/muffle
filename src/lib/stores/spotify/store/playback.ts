import { get } from 'svelte/store'
import { playerStore } from '../../playerStore'
import { apiGet } from '../api'
import { mapToTrack } from '../mappers'
import type { SpotifyCurrentlyPlaying, SpotifyQueue } from '../types'

export function fetchPlaybackOnceFactory(args: { updateCurrent: (current: SpotifyCurrentlyPlaying) => void }) {
  return async function fetchPlaybackOnce(token: string) {
    const [current, queue] = await Promise.all([
      apiGet<SpotifyCurrentlyPlaying>(token, '/me/player/currently-playing'),
      apiGet<SpotifyQueue>(token, '/me/player/queue')
    ])

    args.updateCurrent(current)

    const prevPlayer = get(playerStore)

    const currentTrack = current?.item ? mapToTrack(current.item) : current?.is_playing ? prevPlayer.currentTrack : null
    const nextItem = queue?.queue?.[0] ?? null
    const nextTrack = nextItem ? mapToTrack(nextItem) : null
    const queueTracks = (queue?.queue ?? []).slice(0, 20).map(mapToTrack)

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
