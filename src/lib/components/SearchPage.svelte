<script lang="ts">
  import { fly, fade } from 'svelte/transition'
  import { onDestroy, onMount } from 'svelte'
  import { spotifyStore } from '../stores/spotify'

  export let query: string

  type SearchTrack = {
    id: string
    name: string
    artist: string
    album: string
    albumArt: string
    duration: number
    uri: string
  }

  let loading = false
  let error: string | null = null
  let results: SearchTrack[] = []

  let debounce: ReturnType<typeof setTimeout> | null = null

  let menu:
    | null
    | {
        x: number
        y: number
        track: SearchTrack
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

  const run = async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      results = []
      error = null
      loading = false
      return
    }

    loading = true
    error = null

    try {
      results = await spotifyStore.searchTracks(trimmed)
    } catch (e: any) {
      error = e?.message || 'Search failed'
      results = []
    } finally {
      loading = false
    }
  }

  $: {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      void run(query)
    }, 240)
  }

  async function playTrack(uri: string) {
    try {
      await spotifyStore.playTrackUri(uri)
    } catch (e) {
      console.error('Play track failed:', e)
    }
  }

  function openTrackMenu(e: MouseEvent, t: SearchTrack) {
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
  <div class="shrink-0">
    <p class="text-white/60 text-sm font-semibold tracking-wide">Search</p>
    <h2 class="text-white text-5xl font-extrabold tracking-tight leading-none truncate">{query.trim().length ? query : 'Type to search'}</h2>
  </div>

  <div class="mt-6 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
    {#if loading}
      <div class="px-4 py-8 text-white/40 text-sm font-semibold">Searching…</div>
    {:else if error}
      <div class="px-4 py-8 text-white/40 text-sm font-semibold">{error}</div>
    {:else if results.length}
      <div class="flex flex-col">
        {#each results as t, i (`${t.uri}-${i}`)}
          <button
            class="px-4 py-3 rounded-3xl hover:bg-white/5 transition-colors flex items-center gap-4 text-left"
            onclick={() => playTrack(t.uri)}
            oncontextmenu={(e) => openTrackMenu(e, t)}
            aria-label={`Play ${t.name}`}
          >
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
      </div>
    {:else if query.trim().length}
      <div class="px-4 py-8 text-white/40 text-sm font-semibold">No results</div>
    {:else}
      <div class="px-4 py-8 text-white/40 text-sm font-semibold">Start typing in the search bar</div>
    {/if}
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
