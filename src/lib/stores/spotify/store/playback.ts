import { get } from 'svelte/store'
import { playerStore } from '../../playerStore'
import { apiGet } from '../api'
import { mapToTrack } from '../mappers'
import type { SpotifyCurrentlyPlaying, SpotifyMePlayer, SpotifyQueue } from '../types'

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
      playerStore.setShuffle(playerRes.value.shuffle_state)
    }

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
