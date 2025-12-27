<script lang="ts">
  import { tick } from 'svelte'
  import { playerStore } from '../stores/playerStore'

  type PeekTrack = {
    albumArt: string
    album: string
  }

  let peekEl: HTMLDivElement | null = null
  let imgEl: HTMLImageElement | null = null
  let latched: PeekTrack | null = null
  let active: PeekTrack | null = null
  let didAnimate = false

  $: if ($playerStore.showNextPreview && $playerStore.nextTrack) {
    latched = { albumArt: $playerStore.nextTrack.albumArt, album: $playerStore.nextTrack.album }
  }

  $: active =
    latched ??
    ($playerStore.showNextPreview && $playerStore.nextTrack
      ? { albumArt: $playerStore.nextTrack.albumArt, album: $playerStore.nextTrack.album }
      : null)

  // Clear after transition completes.
  $: if (!$playerStore.isTransitioning && !$playerStore.showNextPreview) {
    didAnimate = false
    latched = null
  }

  // When transitioning, animate the peek cover into the Now Playing cover.
  $: if ($playerStore.isTransitioning && !didAnimate) {
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

{#if active}
  <div
    bind:this={peekEl}
    class="peek bg-[#141414] rounded-[40px] p-5 w-fit h-fit flex items-center justify-center relative {($playerStore.showNextPreview || $playerStore.isTransitioning) ? 'visible' : ''} {$playerStore.isTransitioning ? 'clicking' : ''}"
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
</style>
