<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { playerStore } from '../stores/playerStore'
  import { lyricsStore } from '../stores/lyricsStore'
  import { spotifyStore } from '../stores/spotify'
  import { findActiveLyricIndex } from '../utils/lrc'

  let scroller: HTMLDivElement | null = null
  let lineNodes: Array<HTMLElement | null> = []

  let bgUrl: string | null = null
  let bgKey = 0

  let lastTrackId: string | null = null
  let activeIndex = -1

  let activeDeviceId: string | null = null
  let webPlaybackDeviceId: string | null = null

  async function refreshActiveDevice() {
    try {
      webPlaybackDeviceId = spotifyStore.getWebPlaybackDeviceId?.() ?? null
      const devices = await spotifyStore.getDevices()
      activeDeviceId = (devices || []).find((d) => d.is_active && d.id)?.id ?? null
    } catch {
      activeDeviceId = null
    }
  }

  onMount(() => {
    void refreshActiveDevice()
    const id = window.setInterval(() => void refreshActiveDevice(), 2500)
    return () => window.clearInterval(id)
  })

  function collectLine(node: HTMLElement, idx: number) {
    lineNodes[idx] = node
    return {
      update(nextIdx: number) {
        lineNodes[nextIdx] = node
      },
      destroy() {
        if (lineNodes[idx] === node) lineNodes[idx] = null
      }
    }
  }

  function centerActiveLine(nextIndex: number) {
    if (!scroller) return
    const node = lineNodes[nextIndex]
    if (!node) return

    const target = node.offsetTop - scroller.clientHeight / 2 + node.clientHeight / 2
    scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }

  const unsub = playerStore.subscribe((state) => {
    const track = state.currentTrack

    if (!track) {
      lastTrackId = null
      bgUrl = null
      bgKey = 0
      lyricsStore.clear()
      return
    }

    if (track.id !== lastTrackId) {
      lastTrackId = track.id
      bgUrl = track.albumArt
      bgKey += 1
      void lyricsStore.loadForTrack(track)
      activeIndex = -1
      lineNodes = []
      if (scroller) scroller.scrollTo({ top: 0 })
    }
  })

  onDestroy(() => {
    unsub()
  })

  $: basePositionMs =
    $playerStore.currentTrack ? ($playerStore.progress / 100) * $playerStore.currentTrack.duration : 0

  $: isInAppPlayback = !!(activeDeviceId && webPlaybackDeviceId && activeDeviceId === webPlaybackDeviceId)
  $: connectCompMs = !$playerStore.isPlaying ? 0 : isInAppPlayback ? 0 : 80
  $: positionMs = Math.max(0, basePositionMs + connectCompMs)

  $: syncedLines = $lyricsStore.data?.syncedLines ?? []

  $: nextActive = syncedLines.length ? findActiveLyricIndex(syncedLines, positionMs) : -1

  $: if (nextActive !== activeIndex) {
    activeIndex = nextActive
    if (activeIndex >= 0) centerActiveLine(activeIndex)
  }

  $: driftSeed = $playerStore.currentTrack?.id ? [...$playerStore.currentTrack.id].reduce((a, c) => a + c.charCodeAt(0), 0) : 0
  $: driftDuration = 18 + (driftSeed % 11)
</script>

<div class="relative h-full w-full rounded-[40px] overflow-hidden bg-(--bg-secondary)">
  <div class="absolute inset-0 pointer-events-none">
    {#if bgUrl}
      {#key bgKey}
        <img
          src={bgUrl}
          alt=""
          class="lyrics-bg"
          style={`animation-duration:${driftDuration}s`}
        />
      {/key}
    {/if}

    <div class="absolute inset-0 bg-linear-to-b from-black/55 via-black/55 to-black/85"></div>
  </div>

  <div class="relative h-full flex flex-col">
    <div class="px-10 pt-8 pb-3 flex items-center justify-between">
      <div class="min-w-0">
        <div class="text-white/50 text-xs font-semibold uppercase tracking-wide">Lyrics</div>
        {#if $playerStore.currentTrack}
          <div class="text-white font-extrabold tracking-tight truncate">
            {$playerStore.currentTrack.name}
          </div>
        {/if}
      </div>

      {#if $lyricsStore.status === 'loading'}
        <div class="text-white/40 text-xs font-semibold">Loading…</div>
      {:else if $lyricsStore.status === 'error'}
        <div class="text-white/40 text-xs font-semibold">Unavailable</div>
      {:else if $lyricsStore.data?.instrumental}
        <div class="text-white/40 text-xs font-semibold">Instrumental</div>
      {/if}
    </div>

    {#if !$playerStore.currentTrack}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-white/30 text-sm">Nothing playing</p>
      </div>

    {:else if $lyricsStore.status === 'error'}
      <div class="flex-1 flex items-center justify-center text-center px-10">
        <p class="text-white/40 text-sm">{$lyricsStore.error}</p>
      </div>

    {:else if $lyricsStore.status === 'ready' && !$lyricsStore.data}
      <div class="flex-1 flex items-center justify-center text-center px-10">
        <p class="text-white/30 text-sm">No lyrics found</p>
      </div>

    {:else if $lyricsStore.status === 'ready' && $lyricsStore.data?.instrumental}
      <div class="flex-1 flex items-center justify-center text-center px-10">
        <p class="text-white/30 text-sm">Instrumental</p>
      </div>

    {:else if syncedLines.length}
      <div bind:this={scroller} class="flex-1 overflow-y-auto scrollbar-hide px-10">
        <div class="lyrics-pad">
          {#each syncedLines as line, i (line.startMs)}
            <div
              use:collectLine={i}
              class={`lyrics-line ${i === activeIndex ? 'is-active' : ''} ${activeIndex >= 0 && i < activeIndex ? 'is-past' : ''}`}
            >
              {line.text || '…'}
            </div>
          {/each}
        </div>
      </div>

    {:else if $lyricsStore.status === 'ready' && $lyricsStore.data?.plainLyrics}
      <div class="flex-1 overflow-y-auto scrollbar-hide px-10">
        <div class="lyrics-pad whitespace-pre-wrap text-white/70 text-xl font-semibold leading-snug">
          {$lyricsStore.data.plainLyrics}
        </div>
      </div>

    {:else}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-white/30 text-sm">Loading…</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .lyrics-bg {
    position: absolute;
    inset: -25%;
    width: 150%;
    height: 150%;
    object-fit: cover;
    transform: scale(1.45);
    filter: blur(58px) saturate(1.2) brightness(0.85);
    opacity: 0.95;
    animation-name: lyrics-drift;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    animation-direction: alternate;
  }

  @keyframes lyrics-drift {
    0% {
      transform: translate3d(-4%, -2%, 0) scale(1.45);
    }
    35% {
      transform: translate3d(4%, -6%, 0) scale(1.5);
    }
    70% {
      transform: translate3d(7%, 4%, 0) scale(1.48);
    }
    100% {
      transform: translate3d(-3%, 7%, 0) scale(1.52);
    }
  }

  .lyrics-pad {
    padding: 18vh 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .lyrics-line {
    font-size: clamp(2.0rem, 3.3vw, 4.2rem);
    font-weight: 900;
    line-height: 1.06;
    letter-spacing: -0.02em;
    color: rgba(255, 255, 255, 0.45);
    opacity: 0.85;
    transform: translate3d(0, 0, 0) scale(0.995);
    transition:
      opacity 0.35s var(--spring-smooth),
      transform 0.35s var(--spring-smooth),
      color 0.35s var(--spring-smooth),
      filter 0.35s var(--spring-smooth);
    will-change: transform;
  }

  .lyrics-line.is-past {
    opacity: 0.35;
    color: rgba(255, 255, 255, 0.3);
    filter: blur(0.4px);
  }

  .lyrics-line.is-active {
    opacity: 1;
    color: rgba(255, 255, 255, 0.98);
    transform: translate3d(0, 0, 0) scale(1.04);
    filter: blur(0);
  }

  :global(.lyrics-pad.whitespace-pre-wrap) {
    font-size: clamp(1.6rem, 2.3vw, 2.4rem);
    line-height: 1.4;
  }
</style>
