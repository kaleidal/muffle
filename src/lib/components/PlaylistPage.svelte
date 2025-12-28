<script lang="ts">
  import { fly, fade } from 'svelte/transition'
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { spotifyStore } from '../stores/spotify'
  import { playerStore } from '../stores/playerStore'
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

  let menu:
    | null
    | {
        x: number
        y: number
        track: PlaylistTrack
      } = null

  const closeMenu = () => {
    menu = null
  }

  onMount(() => {
    const onGlobal = () => closeMenu()
    window.addEventListener('click', onGlobal)
    window.addEventListener('blur', onGlobal)
    return () => {
      window.removeEventListener('click', onGlobal)
      window.removeEventListener('blur', onGlobal)
    }
  })

  onDestroy(() => closeMenu())

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
      const liked = playlistId === 'liked'
      const res = liked ? await spotifyStore.getLikedSongsView() : await spotifyStore.getPlaylistView(playlistId)
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
      const liked = playlistId === 'liked' || data.id === 'liked'
      if (liked) {
        const t = data.tracks[position]
        if (!t?.uri) return
        await spotifyStore.playTrackUri(t.uri)
        return
      }

      await spotifyStore.playPlaylistTrack(data.uri, position)
    } catch (e) {
      console.error('Play playlist track failed:', e)
    }
  }

  async function playPlaylist() {
    if (!data) return
    await playAt(0)
  }

  async function toggleShuffle() {
    try {
      const next = !get(playerStore).shuffle
      await spotifyStore.setShuffle(next)
    } catch (e) {
      console.error('Shuffle toggle failed:', e)
    }
  }

  function openTrackMenu(e: MouseEvent, t: PlaylistTrack) {
    e.preventDefault()
    e.stopPropagation()
    menu = { x: e.clientX, y: e.clientY, track: t }
  }
</script>

<div
  class="bg-[#141414] rounded-[40px] h-full px-8 py-6 flex flex-col overflow-hidden absolute inset-0"
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
          {:else if playlistId === 'liked'}
            <div class="w-full h-full bg-white/5 flex items-center justify-center">
              <svg width="40" height="40" viewBox="0 0 22 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 6.51615C1.00002 5.40335 1.33759 4.31674 1.96813 3.39982C2.59867 2.4829 3.49252 1.77881 4.53161 1.38055C5.5707 0.982294 6.70616 0.908598 7.78801 1.1692C8.86987 1.4298 9.84722 2.01243 10.591 2.84015C10.6434 2.89617 10.7067 2.94082 10.7771 2.97135C10.8474 3.00188 10.9233 3.01764 11 3.01764C11.0767 3.01764 11.1526 3.00188 11.2229 2.97135C11.2933 2.94082 11.3566 2.89617 11.409 2.84015C12.1504 2.00705 13.128 1.41952 14.2116 1.15575C15.2952 0.891989 16.4335 0.9645 17.4749 1.36364C18.5163 1.76277 19.4114 2.46961 20.0411 3.39006C20.6708 4.3105 21.0053 5.40091 21 6.51615C21 8.80615 19.5 10.5162 18 12.0162L12.508 17.3292C12.3217 17.5432 12.0919 17.7151 11.834 17.8335C11.5762 17.9518 11.296 18.014 11.0123 18.0158C10.7285 18.0176 10.4476 17.959 10.1883 17.8439C9.92893 17.7288 9.69703 17.5598 9.508 17.3482L4 12.0162C2.5 10.5162 1 8.81615 1 6.51615Z" fill="#D9D9D9" stroke="#D9D9D9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
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
        <p class="text-white/60 text-sm font-semibold tracking-wide truncate">{playlistId === 'liked' ? 'Library' : 'Playlist'}</p>
        <div class="flex items-center gap-4">
          <h2 class="text-white text-5xl font-extrabold tracking-tight leading-none truncate flex-1 min-w-0">{data.name}</h2>

          <button
            class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 transition-colors flex items-center justify-center bouncy-btn shrink-0"
            onclick={toggleShuffle}
            aria-label={$playerStore.shuffle ? 'Disable shuffle' : 'Enable shuffle'}
            aria-pressed={$playerStore.shuffle}
            title={$playerStore.shuffle ? 'Shuffle: on' : 'Shuffle: off'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class={`${$playerStore.shuffle ? 'text-white' : 'text-white/35'}`}>
                <path d="M18 14L22 18M22 18L18 22M22 18H15.959C15.3036 17.9933 14.6598 17.8257 14.0844 17.5118C13.509 17.1979 13.0195 16.7474 12.659 16.2L12.3 15.75M18 2L22 6M22 6L18 10M22 6L16.027 6C15.3805 5.99558 14.7426 6.14794 14.1679 6.44401C13.5931 6.74008 13.0987 7.17105 12.727 7.7L7.273 16.3C6.90127 16.829 6.40687 17.2599 5.83215 17.556C5.25742 17.8521 4.61949 18.0044 3.973 18H2M2 6H3.972C4.71746 5.99481 5.44954 6.19805 6.08564 6.58678C6.72174 6.9755 7.23655 7.53426 7.572 8.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
          </button>
        </div>
        <p class="text-white/50 text-sm font-semibold mt-2 truncate">{playlistId === 'liked' ? 'Saved tracks' : data.ownerName}</p>
      </div>
    </div>

    <div class="mt-6 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
      <div class="flex flex-col">
        {#each data.tracks as t, i (`${t.uri}-${i}`)}
          <button
            class="px-4 py-3 rounded-3xl hover:bg-white/5 transition-colors flex items-center gap-4 text-left group"
            onclick={() => playAt(i)}
            oncontextmenu={(e) => openTrackMenu(e, t)}
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

    {#if menu}
      <div
        class="fixed inset-0 z-60"
        role="button"
        tabindex="0"
        aria-label="Close menu"
        onclick={() => (menu = null)}
        onkeydown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') menu = null
        }}
      >
        <div
          class="absolute w-56 bg-[#141414] rounded-3xl p-3 shadow-xl border border-white/10 z-30"
          style={`left:${menu.x}px; top:${menu.y}px;`}
          role="dialog"
          tabindex="-1"
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => {
            if (e.key === 'Escape') menu = null
          }}
        >
          <p class="text-white/60 text-xs font-semibold px-2 pb-2">QUEUE</p>
          <div
            class="w-full text-left px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold bouncy-btn cursor-pointer"
            role="menuitem"
            tabindex="0"
            onclick={() => {
              const track = menu?.track
              if (track) spotifyStore.enqueueTrack(track as any)
              menu = null
            }}
            onkeydown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              const track = menu?.track
              if (track) spotifyStore.enqueueTrack(track as any)
              menu = null
            }}
          >
            Add to queue
          </div>
        </div>
      </div>
    {/if}
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
