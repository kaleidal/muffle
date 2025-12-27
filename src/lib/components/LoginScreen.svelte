<script lang="ts">
  import { spotifyStore } from '../stores/spotifyStore'
</script>

<div class="h-full w-full flex items-center justify-center">
  <div class="w-full max-w-190 bg-[#141414] rounded-[48px] px-12 py-12">
    <div class="space-y-6">
      <div>
        <p class="text-white/60 text-sm font-semibold tracking-wide">Welcome to</p>
        <h1 class="text-white text-6xl font-extrabold tracking-tight leading-none">Muffle</h1>
      </div>

      <p class="text-white/60 text-lg max-w-[46ch]">
        Connect Spotify to load your library, playlists, and what you’re currently playing.
      </p>

      {#if $spotifyStore.error}
        <div class="text-red-200/90 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-sm">
          {$spotifyStore.error}
        </div>
      {/if}

      <div class="pt-2">
        <button
          class="no-drag px-6 py-3 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
          onclick={() => spotifyStore.login()}
          aria-label="Connect Spotify"
        >
          {#if $spotifyStore.status === 'authenticating'}
            Connecting…
          {:else}
            Connect Spotify
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>
