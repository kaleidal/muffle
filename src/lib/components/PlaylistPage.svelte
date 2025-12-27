<script lang="ts">
  import { fly, fade } from 'svelte/transition'
  import { spotifyStore } from '../stores/spotifyStore'
  import { bestImageUrl } from '../utils/spotifyImages'

  export let playlistId: string

  type PlaylistTrack = {
    id: string
    name: string
    artist: string
    album: string
    albumArt: string
    duration: number
    uri: string
  }

  type PlaylistView = {
    id: string
    name: string
    ownerName: string
    image: string
    uri: string
    tracks: PlaylistTrack[]
  }

  let loading = true
  let error: string | null = null
  let data: PlaylistView | null = null

  const formatTime = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const load = async () => {
    loading = true
    error = null
    data = null

    try {
      const res = await spotifyStore.getPlaylistView(playlistId)
      data = {
        id: res.id,
        name: res.name,
        ownerName: res.ownerName,
        image: bestImageUrl(res.images),
        uri: res.uri,
        tracks: res.tracks
      }
    } catch (e: any) {
      error = e?.message || 'Failed to load playlist'
    } finally {
      loading = false
    }
  }

  $: if (playlistId) {
    void load()
  }

  async function playAt(position: number) {
    if (!data) return
    try {
      await spotifyStore.playPlaylistTrack(data.uri, position)
    } catch (e) {
      console.error('Play playlist track failed:', e)
    }
  }

  async function playPlaylist() {
    if (!data) return
    await playAt(0)
  }

  async function shufflePlayPlaylist() {
    if (!data) return
    try {
      await spotifyStore.setShuffle(true)
      await playAt(0)
    } catch (e) {
      console.error('Shuffle play failed:', e)
    }
  }
</script>

<div
  class="bg-[#141414] rounded-[40px] h-full px-8 py-6 flex flex-col overflow-hidden"
  in:fly={{ x: 18, duration: 220 }}
  out:fade={{ duration: 140 }}
>
  {#if loading}
    <div class="flex-1 flex items-center justify-center text-white/50 text-sm font-semibold">Loading…</div>
  {:else if error}
    <div class="flex-1 flex items-center justify-center text-white/50 text-sm font-semibold">{error}</div>
  {:else if data}
    <div class="flex items-center gap-6 shrink-0">
      <div class="relative shrink-0 overflow-visible">
        <div class="w-28 h-28 rounded-3xl overflow-hidden bg-white/5">
          {#if data.image}
            <img src={data.image} alt={data.name} class="w-full h-full object-cover" />
          {/if}
        </div>

        <button
          class="absolute -right-2 -bottom-2 w-11 h-11 rounded-full bg-(--accent-primary) flex items-center justify-center bouncy-btn shadow-lg"
          aria-label="Play"
          onclick={playPlaylist}
        >
          <svg class="w-6 h-6 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </div>

      <div class="min-w-0">
        <p class="text-white/60 text-sm font-semibold tracking-wide truncate">Playlist</p>
        <div class="flex items-center gap-4">
          <h2 class="text-white text-5xl font-extrabold tracking-tight leading-none truncate flex-1 min-w-0">{data.name}</h2>

          <button
            class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 transition-colors flex items-center justify-center bouncy-btn shrink-0"
            onclick={shufflePlayPlaylist}
            aria-label="Shuffle and play"
            title="Shuffle"
          >
            <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 3h5v5h-2V6.41l-3.29 3.3-1.42-1.42L17.59 5H16V3z" />
              <path d="M4 6h4.59l8.7 8.7-1.41 1.41L7.76 8H4V6z" />
              <path d="M4 16h4.59l2.29-2.29 1.41 1.41L9.41 18H4v-2z" />
              <path d="M16 16h1.59l-2.3-2.29 1.42-1.41L19 14.59V13h2v5h-5v-2z" />
            </svg>
          </button>
        </div>
        <p class="text-white/50 text-sm font-semibold mt-2 truncate">{data.ownerName}</p>
      </div>
    </div>

    <div class="mt-6 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
      <div class="flex flex-col">
        {#each data.tracks as t, i (`${t.uri}-${i}`)}
          <button
            class="px-4 py-3 rounded-3xl hover:bg-white/5 transition-colors flex items-center gap-4 text-left group"
            onclick={() => playAt(i)}
            aria-label={`Play ${t.name}`}
          >
            <div class="w-10 text-white/40 text-sm font-semibold tabular-nums">{i + 1}</div>

            <div class="w-12 h-12 rounded-2xl overflow-hidden bg-white/5 shrink-0">
              {#if t.albumArt}
                <img src={t.albumArt} alt={t.album} class="w-full h-full object-cover" />
              {/if}
            </div>

            <div class="min-w-0 flex-1">
              <div class="text-white font-extrabold tracking-tight truncate">{t.name}</div>
              <div class="text-white/50 text-sm font-semibold truncate">{t.artist}</div>
            </div>

            <div class="text-white/40 text-sm font-semibold tabular-nums shrink-0">{formatTime(t.duration)}</div>
          </button>
        {/each}

        {#if data.tracks.length === 0}
          <div class="px-4 py-8 text-white/40 text-sm font-semibold">No tracks</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
