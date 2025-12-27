<script lang="ts">
  import { afterUpdate, onDestroy } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import PlaylistCard from './PlaylistCard.svelte'
  import { spotifyStore } from '../stores/spotify'

  type HomeCard = {
    id: string
    name: string
    image: string
    kind: 'playlist' | 'track' | 'artist' | 'mix'
    uri?: string
  }

  type HomeSection = {
    id: string
    name: string
    cards: HomeCard[]
  }

  $: displayName = $spotifyStore.user?.display_name || 'You'

  let loading = false
  let error: string | null = null
  let sections: HomeSection[] = []

  let lastStatus: string | null = null
  let inFlight: Promise<void> | null = null

  let lastDataSig: string | null = null

  let rowEls: Record<string, HTMLDivElement | null> = {}
  let rowHasOverflow: Record<string, boolean> = {}
  let measureQueued = false

  const measureOverflow = (id: string, el: HTMLDivElement) => {
    rowHasOverflow[id] = el.scrollWidth > el.clientWidth + 1
  }

  const measureAllRows = () => {
    for (const [id, el] of Object.entries(rowEls)) {
      if (el) measureOverflow(id, el)
    }
  }

  const registerRow = (node: HTMLDivElement, id: string) => {
    rowEls[id] = node

    const measure = () => measureOverflow(id, node)
    queueMicrotask(measure)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(node)
    }

    return {
      destroy() {
        if (rowEls[id] === node) delete rowEls[id]
        if (rowHasOverflow[id] != null) delete rowHasOverflow[id]
        ro?.disconnect()
      }
    }
  }

  const scrollRow = (id: string, dir: -1 | 1) => {
    const el = rowEls[id]
    if (!el) return
    const amount = Math.max(240, Math.floor(el.clientWidth * 0.85))
    el.scrollBy({ left: dir * amount, behavior: 'smooth' })
  }

  const load = async () => {
    if ($spotifyStore.status !== 'authenticated') return
    if (inFlight) return await inFlight
    loading = true
    error = null

    inFlight = (async () => {
      try {
        const res = await spotifyStore.getHomeSections()
        sections = (res || []) as HomeSection[]
      } catch (e: any) {
        error = e?.message || 'Failed to load home'
        sections = []
      } finally {
        loading = false
        inFlight = null
      }
    })()

    await inFlight
  }

  $: {
    const status = $spotifyStore.status
    if (status !== lastStatus) {
      lastStatus = status

      if (status === 'authenticated') {
        void load()
      } else {
        inFlight = null
        sections = []
        error = null
        loading = false
      }
    }
  }

  $: if ($spotifyStore.status === 'authenticated') {
    const sig = `${$spotifyStore.playlists.length}:${$spotifyStore.topArtists.length}`
    if (lastDataSig === null) lastDataSig = sig

    const hasYourPlaylists = sections.some((s) => s.id === 'your_playlists')
    const hasTopArtists = sections.some((s) => s.id === 'top_artists')
    const onlyTopTracks = sections.length === 1 && sections[0]?.id === 'top_tracks'

    const dataArrived = sig !== lastDataSig && ($spotifyStore.playlists.length > 0 || $spotifyStore.topArtists.length > 0)

    if (!loading && !inFlight && sections.length && (onlyTopTracks || !hasYourPlaylists || !hasTopArtists) && dataArrived) {
      lastDataSig = sig
      void load()
    } else if (sig !== lastDataSig) {
      lastDataSig = sig
    }
  }

  onDestroy(() => {
    inFlight = null
  })

  afterUpdate(() => {
    if (measureQueued) return
    measureQueued = true
    requestAnimationFrame(() => {
      measureQueued = false
      measureAllRows()
    })
  })
</script>

<div
  class="bg-[#141414] rounded-[40px] h-full px-10 py-8 flex flex-col absolute inset-0"
  in:fly={{ x: 18, duration: 220 }}
  out:fade={{ duration: 140 }}
>
  <div class="shrink-0">
    <div class="space-y-2">
      <p class="text-white/60 text-xl font-normal tracking-wide">hello,</p>
      <div class="flex items-baseline gap-4">
        <h2 class="text-white text-8xl font-extrabold tracking-tight leading-none">{displayName}</h2>
        {#if $spotifyStore.status !== 'authenticated'}
          <button
            class="no-drag px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 transition-colors text-sm font-semibold"
            onclick={() => spotifyStore.login()}
            aria-label="Connect Spotify"
          >
            Connect Spotify
          </button>
        {/if}
      </div>
    </div>
  </div>

  {#if $spotifyStore.status === 'authenticated'}
    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-6 pt-4 pb-4">
      {#if loading}
        <div class="text-white/50 text-sm font-semibold">Loading…</div>
      {:else if error}
        <div class="text-white/50 text-sm font-semibold">{error}</div>
      {:else}
        <div class="space-y-8">
          {#each sections as section (section.id)}
            <div class="space-y-3">
              <div class="flex items-center justify-between gap-4">
                <p class="text-white/60 text-sm font-semibold tracking-wide">{section.name}</p>

                {#if rowHasOverflow[section.id]}
                  <div class="flex items-center gap-2 shrink-0">
                    <button
                      class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 transition-colors flex items-center justify-center"
                      aria-label={`Scroll ${section.name} left`}
                      onclick={() => scrollRow(section.id, -1)}
                    >
                      <svg class="w-5 h-5 text-white/80" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                      </svg>
                    </button>
                    <button
                      class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 transition-colors flex items-center justify-center"
                      aria-label={`Scroll ${section.name} right`}
                      onclick={() => scrollRow(section.id, 1)}
                    >
                      <svg class="w-5 h-5 text-white/80" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m8.59 16.59 1.41 1.41 6-6-6-6-1.41 1.41L13.17 12z" />
                      </svg>
                    </button>
                  </div>
                {/if}
              </div>

              <div
                class="flex gap-4 overflow-x-auto overflow-y-visible py-3 scrollbar-hide"
                use:registerRow={section.id}
              >
                {#each section.cards as c (c.id)}
                  <PlaylistCard
                    mix={{ id: c.id, name: c.name, image: c.image, type: c.kind }}
                    size="lg"
                    onSelect={async () => {
                      if (c.kind === 'playlist' && c.uri) return await spotifyStore.playContextUri(c.uri)
                      if (c.kind === 'track' && c.uri) return await spotifyStore.playTrackUri(c.uri)
                      if (c.kind === 'artist' && c.uri) return await spotifyStore.playContextUri(c.uri)
                      if (c.kind === 'mix') return await spotifyStore.playMix(c.id)
                    }}
                  />
                {/each}
              </div>
            </div>
          {/each}

          {#if sections.length === 0}
            <div class="text-white/50 text-sm font-semibold">Nothing yet</div>
          {/if}
        </div>
      {/if}
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
