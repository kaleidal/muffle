<script lang="ts">
  import { playerStore } from '../stores/playerStore'
  import { spotifyStore, type SpotifyDevice } from '../stores/spotifyStore'

  let seeking = false
  let seekValue = 0

  let showDevices = false
  let devices: SpotifyDevice[] = []
  let loadingDevices = false

  $: if (!seeking) seekValue = $playerStore.progress

  async function togglePlayback() {
    try {
      if ($playerStore.isPlaying) await spotifyStore.pause()
      else await spotifyStore.play()
    } catch (e) {
      console.error('Playback toggle failed:', e)
    }
  }

  async function skipNext() {
    try {
      await spotifyStore.next()
    } catch (e) {
      console.error('Skip next failed:', e)
    }
  }

  async function skipPrev() {
    try {
      await spotifyStore.previous()
    } catch (e) {
      console.error('Skip prev failed:', e)
    }
  }

  async function commitSeek() {
    seeking = false
    try {
      await spotifyStore.seekToPercent(seekValue)
    } catch (e) {
      console.error('Seek failed:', e)
    }
  }

  function beginSeek() {
    seeking = true
  }

  async function endSeek(e: Event) {
    if (!seeking) return
    await commitSeek()
  }

  async function toggleDevices() {
    showDevices = !showDevices
    if (!showDevices) return

    loadingDevices = true
    try {
      devices = await spotifyStore.getDevices()
    } catch (e) {
      console.error('Get devices failed:', e)
      devices = []
    } finally {
      loadingDevices = false
    }
  }

  async function enableInAppPlayback() {
    loadingDevices = true
    try {
      await spotifyStore.ensureWebPlaybackReady()
      devices = await spotifyStore.getDevices()
    } catch (e) {
      console.error('Enable in-app playback failed:', e)
    } finally {
      loadingDevices = false
    }
  }

  async function transfer(device: SpotifyDevice) {
    if (!device.id) return
    try {
      await spotifyStore.transferToDevice(device.id, false)
      showDevices = false
    } catch (e) {
      console.error('Transfer failed:', e)
    }
  }

  $: seekValue && (() => {
    const percent = (seekValue - 0) / (100 - 0) * 100
    document.documentElement.style.setProperty('--seek-percent', `${percent}%`)
  })()
</script>

<div class="bg-[#141414] rounded-[40px] px-8 py-6 flex flex-col justify-center gap-4 h-full relative overflow-visible {$playerStore.isTransitioning ? 'reverb' : ''}">
  {#if $playerStore.currentTrack}
    <div class="flex items-center gap-5">
      <div class="relative shrink-0">
        <img
          data-nowplaying-cover
          src={$playerStore.currentTrack.albumArt}
          alt={$playerStore.currentTrack.album}
          class="w-20 h-20 rounded-2xl object-cover shadow-xl"
        />

        <button
          class="absolute -right-2 -bottom-2 w-11 h-11 rounded-full bg-(--accent-primary) flex items-center justify-center bouncy-btn shadow-lg"
          aria-label={$playerStore.isPlaying ? 'Pause' : 'Play'}
          onclick={togglePlayback}
        >
          {#if $playerStore.isPlaying}
            <svg class="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          {:else}
            <svg class="w-6 h-6 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          {/if}
        </button>
      </div>

      <div class="min-w-0 flex-1">
        <p class="text-white/60 text-sm font-medium truncate">{$playerStore.currentTrack.artist}</p>

        <div class="flex items-center gap-3">
          <h3 class="text-white text-3xl font-extrabold tracking-tight truncate flex-1 min-w-0">{$playerStore.currentTrack.name}</h3>

          <div class="flex items-center gap-2 shrink-0">
            <div class="relative">
              <button
                class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
                aria-label="Devices"
                onclick={toggleDevices}
              >
                <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4 6h16v10H4z" opacity="0.85" />
                  <path d="M8 20h8v-2H8z" />
                </svg>
              </button>

              {#if showDevices}
                <div class="absolute right-0 bottom-10 w-56 bg-[#141414] rounded-3xl p-3 shadow-xl border border-white/10 z-30">
                  <p class="text-white/60 text-xs font-semibold px-2 pb-2">DEVICES</p>

                  <button
                    class="w-full text-left px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold bouncy-btn"
                    onclick={enableInAppPlayback}
                    disabled={loadingDevices}
                    aria-label="Enable in-app playback"
                  >
                    Enable in-app playback
                  </button>

                  {#if loadingDevices}
                    <div class="px-2 py-2 text-white/50 text-sm">Loading…</div>
                  {:else if devices.length === 0}
                    <div class="px-2 py-2 text-white/50 text-sm">No devices</div>
                  {:else}
                    <div class="flex flex-col">
                      {#each devices as d (d.id)}
                        <button
                          class="px-2 py-2 rounded-2xl hover:bg-white/10 text-left flex items-center justify-between"
                          onclick={() => transfer(d)}
                          disabled={!d.id}
                        >
                          <div class="min-w-0">
                            <div class="text-white text-sm font-semibold truncate">{d.name}</div>
                            <div class="text-white/50 text-xs truncate">{d.type}</div>
                          </div>
                          {#if d.is_active}
                            <div class="w-2 h-2 rounded-full bg-(--accent-primary)"></div>
                          {/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <button
              class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
              aria-label="Previous"
              onclick={skipPrev}
            >
              <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6z" />
                <path d="M20 6v12l-10-6z" />
              </svg>
            </button>

            <button
              class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
              aria-label="Next"
              onclick={skipNext}
            >
              <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 6h2v12h-2z" />
                <path d="M6 6v12l10-6z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="mt-3">
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            class="w-full h-1.5 rounded-full bg-white/10 accent-(--accent-primary) cursor-pointer outline-0 border-none "
            bind:value={seekValue}
            onpointerdown={beginSeek}
            oninput={() => {
              seeking = true
            }}
            onpointerup={endSeek}
            onchange={endSeek}
            aria-label="Seek"
          />
        </div>
      </div>
    </div>

  {:else}
    <div class="flex items-center gap-5">
      <div class="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center">
        <svg class="w-8 h-8 text-white/30" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
      </div>
      <div class="min-w-0">
        <p class="text-white/60 text-sm font-medium">Nothing playing</p>
        <h3 class="text-white text-2xl font-extrabold tracking-tight">Play something on Spotify</h3>
      </div>
    </div>
  {/if}
</div>

<style>
input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 9999px;
  background: linear-gradient(
    to right,
    var(--accent-primary) 0%,
    var(--accent-primary) var(--seek-percent, 0%),
    rgba(255,255,255,0.06) var(--seek-percent, 0%),
    rgba(255,255,255,0.06) 100%
  );
}

/* track so it’s transparent, we use background above */
input[type='range']::-webkit-slider-runnable-track {
  -webkit-appearance: none;
  background: transparent;
}

/* thumb like you had */
input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: var(--accent-primary);
  margin-top: -4px;
}

</style>
