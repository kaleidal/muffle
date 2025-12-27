<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import PlaylistCard from './PlaylistCard.svelte'
  import { spotifyStore } from '../stores/spotify'
  import { cssVarHexToRgbTriplet, getDominantRgbTriplet } from '../utils/imageColor'

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

  let baseRgb = '255 255 255'
  let heroRgb = baseRgb
  let lastHeroImage: string | null = null
  let heroReq = 0

  $: [heroR, heroG, heroB] = heroRgb.split(' ').map((n) => Number(n) || 0)

  const setHeroFromImage = async (image: string | undefined | null) => {
    const src = image || null
    if (!src) return
    if (src === lastHeroImage) return
    lastHeroImage = src

    const req = ++heroReq
    const rgb = await getDominantRgbTriplet(src)
    if (req !== heroReq) return
    if (rgb) heroRgb = rgb
  }

  const clearHero = () => {
    lastHeroImage = null
    heroRgb = baseRgb
  }

  let scrollerEl: HTMLDivElement | null = null
  let heroPlaceholderEl: HTMLButtonElement | null = null
  let overlayActive = false
  let overlayClosing = false
  let overlayCloseTimer: ReturnType<typeof setTimeout> | null = null
  let overlayRect: { top: number; left: number; width: number; height: number } | null = null
  let overlayRaf: number | null = null

  const updateOverlayRect = () => {
    if (!heroPlaceholderEl) return
    const r = heroPlaceholderEl.getBoundingClientRect()
    overlayRect = { top: r.top, left: r.left, width: r.width, height: r.height }
  }

  const startOverlayTracking = () => {
    if (overlayRaf != null) return
    const tick = () => {
      if (!overlayActive) {
        overlayRaf = null
        return
      }
      updateOverlayRect()
      overlayRaf = requestAnimationFrame(tick)
    }
    overlayRaf = requestAnimationFrame(tick)
  }

  const stopOverlayTracking = () => {
    overlayActive = false
    if (overlayRaf != null) {
      cancelAnimationFrame(overlayRaf)
      overlayRaf = null
    }
  }

  const onHeroEnter = () => {
    if (overlayCloseTimer) {
      clearTimeout(overlayCloseTimer)
      overlayCloseTimer = null
    }
    overlayClosing = false
    overlayActive = true
    updateOverlayRect()
    startOverlayTracking()
  }

  const onHeroLeave = () => {
    overlayClosing = true
    if (overlayCloseTimer) clearTimeout(overlayCloseTimer)
    overlayCloseTimer = setTimeout(() => {
      overlayCloseTimer = null
      overlayClosing = false
      stopOverlayTracking()
      clearHero()
    }, 260)
  }

  let loading = false
  let error: string | null = null
  let sections: HomeSection[] = []

  let lastStatus: string | null = null
  let inFlight: Promise<void> | null = null

  let lastDataSig: string | null = null

  let rowEls: Record<string, HTMLDivElement | null> = {}
  let rowHasOverflow: Record<string, boolean> = {}
  let measureQueued = false

  let cardAccent: Record<string, string> = {}
  let warmSig: string | null = null

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
    stopOverlayTracking()
    if (overlayCloseTimer) clearTimeout(overlayCloseTimer)
  })

  onMount(() => {
    try {
      const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary')
      const parsed = cssVarHexToRgbTriplet(hex)
      if (parsed) baseRgb = parsed
    } catch {
      // ignore
    }
    heroRgb = baseRgb
  })

  afterUpdate(() => {
    if (measureQueued) return
    measureQueued = true
    requestAnimationFrame(() => {
      measureQueued = false
      measureAllRows()
    })
  })

  const warmAccents = async () => {
    const sig = sections
      .flatMap((s) => s.cards)
      .slice(0, 10)
      .map((c) => c.image)
      .join('|')

    if (!sig || sig === warmSig) return
    warmSig = sig

    const imgs = sections
      .flatMap((s) => s.cards)
      .map((c) => c.image)
      .filter(Boolean)
      .slice(0, 10)

    await Promise.all(
      imgs.map(async (img) => {
        if (cardAccent[img]) return
        const rgb = await getDominantRgbTriplet(img)
        if (!rgb) return
        cardAccent = { ...cardAccent, [img]: rgb }
      })
    )
  }

  $: if (sections.length) {
    void warmAccents()
  }

  $: continueSection = sections.find((s) => s.id === 'continue')
  $: heroCard = continueSection?.cards?.[0] || null
  $: renderSections = heroCard ? sections.filter((s) => s.id !== 'continue') : sections
</script>

<div
  class="bg-(--bg-secondary) rounded-[40px] h-full px-10 py-8 flex flex-col absolute inset-0"
  in:fly={{ x: 18, duration: 220 }}
  out:fade={{ duration: 140 }}
>
  <div class="absolute inset-0 rounded-[40px] overflow-hidden pointer-events-none">
    <div
      class="absolute inset-x-0 top-0 h-80 hero-bg"
      style={`--hero-r: ${heroR}; --hero-g: ${heroG}; --hero-b: ${heroB};`}
    ></div>
  </div>

  <div class="relative z-10 flex flex-col h-full">
    <div class="shrink-0">
      <div class="flex items-end justify-between gap-6 relative">
        <div class="min-w-0">
          <p class="text-white/60 text-sm font-semibold tracking-wide">Home</p>
          <h2 class="text-white text-6xl font-extrabold tracking-tight leading-none truncate">{displayName}</h2>
        </div>

        {#if $spotifyStore.status !== 'authenticated'}
          <button
            class="no-drag px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 transition-colors text-sm font-semibold shrink-0"
            onclick={() => spotifyStore.login()}
            aria-label="Connect Spotify"
          >
            Connect Spotify
          </button>
        {/if}
      </div>
    </div>

  {#if $spotifyStore.status === 'authenticated'}
    {#if overlayActive && overlayRect && heroCard}
      <button
        class="fixed z-60 rounded-3xl overflow-hidden bg-white/5 hover:bg-white/8 transition-colors flex items-center gap-5 p-5 fluid-card"
        style={`top:${overlayRect.top}px; left:${overlayRect.left}px; width:${overlayRect.width}px; height:${overlayRect.height}px; --card-accent: ${cardAccent[heroCard.image] || heroRgb};`}
        onclick={async () => {
          if (heroCard.kind === 'playlist' && heroCard.uri) return await spotifyStore.playContextUri(heroCard.uri)
          if (heroCard.kind === 'track' && heroCard.uri) return await spotifyStore.playTrackUri(heroCard.uri)
          if (heroCard.kind === 'artist' && heroCard.uri) return await spotifyStore.playContextUri(heroCard.uri)
        }}
        onmouseenter={() => {
          void setHeroFromImage(heroCard.image)
          onHeroEnter()
        }}
        onmouseleave={() => onHeroLeave()}
        aria-label={`Play ${heroCard.name}`}
      >
        <div class="w-20 h-20 rounded-3xl overflow-hidden bg-white/5 shrink-0 relative">
          {#if heroCard.image}
            <img src={heroCard.image} alt={heroCard.name} class="w-full h-full object-cover" />
          {/if}
        </div>

        <div class="min-w-0 flex-1">
          <p class="text-white/60 text-sm font-semibold tracking-wide truncate">Continue listening</p>
          <div class="text-white text-2xl font-extrabold tracking-tight truncate">{heroCard.name}</div>
        </div>

        <div class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shrink-0">
          <svg class="w-6 h-6 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </button>
    {/if}

    <div bind:this={scrollerEl} class="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-6 pb-6 relative">
      {#if heroCard}
        <div class="pt-3 pb-5 overflow-visible">
          <button
            bind:this={heroPlaceholderEl}
            class="w-full rounded-3xl overflow-hidden bg-white/5 hover:bg-white/8 transition-colors flex items-center gap-5 p-5"
            style={overlayActive ? 'opacity:0; pointer-events:none;' : undefined}
            onclick={async () => {
              if (heroCard.kind === 'playlist' && heroCard.uri) return await spotifyStore.playContextUri(heroCard.uri)
              if (heroCard.kind === 'track' && heroCard.uri) return await spotifyStore.playTrackUri(heroCard.uri)
              if (heroCard.kind === 'artist' && heroCard.uri) return await spotifyStore.playContextUri(heroCard.uri)
            }}
            onmouseenter={() => {
              void setHeroFromImage(heroCard.image)
              onHeroEnter()
            }}
            onmouseleave={() => onHeroLeave()}
            aria-label={`Play ${heroCard.name}`}
          >
            <div class="w-20 h-20 rounded-3xl overflow-hidden bg-white/5 shrink-0 relative">
              {#if heroCard.image}
                <img src={heroCard.image} alt={heroCard.name} class="w-full h-full object-cover" />
              {/if}
            </div>

            <div class="min-w-0 flex-1">
              <p class="text-white/60 text-sm font-semibold tracking-wide truncate">Continue listening</p>
              <div class="text-white text-2xl font-extrabold tracking-tight truncate">{heroCard.name}</div>
            </div>

            <div class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shrink-0">
              <svg class="w-6 h-6 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        </div>
      {/if}

      {#if loading}
        <div class="text-white/50 text-sm font-semibold">Loading…</div>
      {:else if error}
        <div class="text-white/50 text-sm font-semibold">{error}</div>
      {:else}
        <div class="space-y-10">
          {#each renderSections as section (section.id)}
            <div class="space-y-3">
              <div class="flex items-center justify-between gap-4">
                <p class="text-white/85 text-base font-extrabold tracking-tight">{section.name}</p>

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
                    accentRgb={cardAccent[c.image] || null}
                    onmouseenter={() => void setHeroFromImage(c.image)}
                    onmouseleave={() => clearHero()}
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
</div>

<style>
  @property --hero-r {
    syntax: '<number>';
    inherits: true;
    initial-value: 255;
  }
  @property --hero-g {
    syntax: '<number>';
    inherits: true;
    initial-value: 255;
  }
  @property --hero-b {
    syntax: '<number>';
    inherits: true;
    initial-value: 255;
  }

  .hero-bg {
    transition: --hero-r 260ms var(--liquid-ease), --hero-g 260ms var(--liquid-ease), --hero-b 260ms var(--liquid-ease);
    background:
      radial-gradient(800px circle at 0% 0%, rgb(var(--hero-r) var(--hero-g) var(--hero-b) / 0.40) 0%, transparent 60%),
      radial-gradient(700px circle at 65% 0%, rgb(var(--hero-r) var(--hero-g) var(--hero-b) / 0.18) 0%, transparent 58%),
      linear-gradient(180deg, rgb(var(--hero-r) var(--hero-g) var(--hero-b) / 0.14) 0%, transparent 70%);

    -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 55%, rgba(0, 0, 0, 0) 100%);
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 55%, rgba(0, 0, 0, 0) 100%);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: 100% 100%;
    mask-size: 100% 100%;
  }

  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
