<script lang="ts">
  import { tick } from 'svelte'
  import { playerStore } from '../stores/playerStore'

  export let variant: 'peek' | 'toast' = 'peek'

  type PeekTrack = {
    albumArt: string
    album: string
  }

  type ToastTrack = {
    albumArt: string
    name: string
    artist: string
  }

  let peekEl: HTMLDivElement | null = null
  let imgEl: HTMLImageElement | null = null
  let latched: PeekTrack | null = null
  let active: PeekTrack | null = null
  let didAnimate = false

  let toastEl: HTMLDivElement | null = null
  let toastImgEl: HTMLImageElement | null = null
  let lastToastKey = -1

  $: toastActive =
    variant === 'toast' && $playerStore.nowPlayingToast
      ? {
          albumArt: $playerStore.nowPlayingToast.albumArt,
          name: $playerStore.nowPlayingToast.name,
          artist: $playerStore.nowPlayingToast.artist
        }
      : null

  $: if (variant === 'toast' && toastActive && $playerStore.nowPlayingToastKey !== lastToastKey) {
    lastToastKey = $playerStore.nowPlayingToastKey

    void (async () => {
      await tick()
      if (!toastEl || !toastImgEl) return

      const target = document.querySelector('[data-nowplaying-cover]') as HTMLElement | null

      const base = toastEl.getBoundingClientRect()
      const from = toastImgEl.getBoundingClientRect()

      const enter = {
        transform: 'translateX(-10px) scale(0.98)',
        opacity: 0
      }
      const shown = {
        transform: 'translate(0px, 0px) scale(1)',
        opacity: 1
      }

      if (!target) {
        toastEl.animate([enter, { ...shown, offset: 0.18 }, { transform: 'translateX(140px) scale(0.98)', opacity: 0 }], {
          duration: 1350,
          easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
          fill: 'forwards'
        })
        return
      }

      const to = target.getBoundingClientRect()
      const fromCx = from.left + from.width / 2
      const fromCy = from.top + from.height / 2
      const toCx = to.left + to.width / 2
      const toCy = to.top + to.height / 2

      const dx = toCx - fromCx
      const dy = toCy - fromCy
      const scale = to.width && from.width ? to.width / from.width : 1

      // Translate the whole pill based on the image center so it feels like it "flies into" the cover.
      // Also nudge by the pill's current offset relative to the image.
      const pillToImgCx = fromCx - (base.left + base.width / 2)
      const pillToImgCy = fromCy - (base.top + base.height / 2)

      toastEl.animate(
        [
          enter,
          { ...shown, offset: 0.18 },
          { transform: `translate(${dx - pillToImgCx}px, ${dy - pillToImgCy}px) scale(${scale})`, opacity: 0 }
        ],
        { duration: 1350, easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', fill: 'forwards' }
      )
    })()
  }

  // Latch the preview once it becomes eligible.
  // Keep it through the track-boundary gap until the transition finishes.
  $: if (variant === 'peek' && !latched && $playerStore.showNextPreview && $playerStore.nextTrack) {
    latched = { albumArt: $playerStore.nextTrack.albumArt, album: $playerStore.nextTrack.album }
  }

  $: active =
    variant !== 'peek'
      ? null
      : latched ??
        (($playerStore.peekLatched || $playerStore.showNextPreview) && $playerStore.nextTrack
          ? { albumArt: $playerStore.nextTrack.albumArt, album: $playerStore.nextTrack.album }
          : null)

  // Clear after transition completes.
  $: if (variant === 'peek' && !$playerStore.isTransitioning && !$playerStore.peekLatched) {
    didAnimate = false
    latched = null
  }

  // When transitioning, animate the peek cover into the Now Playing cover.
  $: if (variant === 'peek' && $playerStore.isTransitioning && !didAnimate) {
    void (async () => {
      didAnimate = true
      await tick()

      if (!peekEl || !imgEl) return
      const target = document.querySelector('[data-nowplaying-cover]') as HTMLElement | null
      if (!target) return

      const from = imgEl.getBoundingClientRect()
      const to = target.getBoundingClientRect()

      const fromCx = from.left + from.width / 2
      const fromCy = from.top + from.height / 2
      const toCx = to.left + to.width / 2
      const toCy = to.top + to.height / 2

      const dx = toCx - fromCx
      const dy = toCy - fromCy
      const scale = to.width && from.width ? to.width / from.width : 1

      // Animate the whole pill so it feels like it "clicks" into place.
      peekEl.animate(
        [
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.85}px, ${dy * 0.85}px) scale(${Math.max(0.9, scale * 1.06)})`, opacity: 1, offset: 0.75 },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 }
        ],
        { duration: 520, easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', fill: 'forwards' }
      )
    })()
  }
</script>

{#if variant === 'peek' && active}
  <div
    bind:this={peekEl}
    class="peek bg-[#141414] rounded-[40px] p-5 w-fit h-fit flex items-center justify-center relative {($playerStore.peekLatched || $playerStore.showNextPreview || $playerStore.isTransitioning) ? 'visible' : ''} {$playerStore.isTransitioning ? 'clicking' : ''}"
  >
    <div class="relative">
      <img
        bind:this={imgEl}
        src={active.albumArt}
        alt={active.album}
        class="w-20 h-20 rounded-[28px] object-cover shadow-xl"
      />
      <div class="absolute -left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
        <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  </div>
{/if}

{#if variant === 'toast' && toastActive}
  <div bind:this={toastEl} class="toast bg-[#141414] rounded-[40px] px-5 py-4 w-fit h-fit flex items-center gap-4 pointer-events-none">
    <div class="relative shrink-0">
      <img bind:this={toastImgEl} src={toastActive.albumArt} alt={toastActive.name} class="w-16 h-16 rounded-3xl object-cover shadow-xl" />
      <div class="absolute -left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>

    <div class="min-w-0">
      <p class="text-white/60 text-xs font-semibold tracking-wide">NOW PLAYING</p>
      <p class="text-white text-sm font-extrabold tracking-tight truncate max-w-64">{toastActive.name}</p>
      <p class="text-white/60 text-xs font-semibold truncate max-w-64">{toastActive.artist}</p>
    </div>
  </div>
{/if}

<style>
  .peek {
    opacity: 0;
    transform: translateX(-10px) scale(0.96);
    will-change: transform, opacity;
  }

  .peek.visible {
    animation: peek-in 240ms var(--spring-bounce) both;
  }

  /* When the track advances, make the left cover "click" into place */
  .peek.clicking {
    animation: none;
  }

  @keyframes peek-in {
    from {
      opacity: 0;
      transform: translateX(-10px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }

  .toast {
    will-change: transform, opacity;
  }
</style>
