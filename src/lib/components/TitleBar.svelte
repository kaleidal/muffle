<script lang="ts">
  import { spotifyStore } from '../stores/spotifyStore'
</script>

<div class="h-10 flex items-center justify-between px-4 bg-[#0a0a0a] drag-region">
  <div class="flex items-center gap-3 no-drag">
    <span class="text-white font-semibold text-sm">Muffle</span>
  </div>
  
  <div class="flex items-center gap-2 no-drag">
    {#if $spotifyStore.status === 'authenticated' && $spotifyStore.user}
      <div class="flex items-center gap-2">
        <span class="text-white/60 text-xs font-semibold truncate max-w-48">{$spotifyStore.user.display_name}</span>
        <div class="w-7 h-7 rounded-full bg-white/10 overflow-hidden">
          {#if $spotifyStore.user.images?.[0]?.url}
            <img src={$spotifyStore.user.images[0].url} alt="Profile" class="w-full h-full object-cover" />
          {/if}
        </div>
      </div>
    {:else}
      <button
        class="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors text-xs font-semibold"
        onclick={() => spotifyStore.login()}
        aria-label="Connect Spotify"
      >
        Connect
      </button>
    {/if}
  </div>
</div>
