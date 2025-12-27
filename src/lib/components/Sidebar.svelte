<script lang="ts">
  import { spotifyStore } from '../stores/spotifyStore'
  import { bestImageUrl } from '../utils/spotifyImages'
  import { navigationStore } from '../stores/navigationStore'

  $: playlistItems =
    $spotifyStore.status === 'authenticated' && $spotifyStore.playlists.length
      ? $spotifyStore.playlists.map((p) => ({
          id: p.id,
          name: p.name,
          image: bestImageUrl(p.images)
        }))
      : []

  const placeholders = Array.from({ length: 10 }, (_, i) => i)
</script>

<aside class="w-24 shrink-0 h-full min-h-0">
  <div class="h-full min-h-0 bg-[#141414] rounded-[40px] p-3 flex flex-col items-center gap-3 overflow-hidden">
    <div class="w-full flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto scrollbar-hide pb-6">
      {#if playlistItems.length}
        {#each playlistItems as playlist}
          <button
            class="relative aspect-square rounded-2xl overflow-hidden fluid-card group shrink-0"
            aria-label={playlist.name}
            onclick={() => navigationStore.openPlaylist(playlist.id)}
          >
            <img src={playlist.image} alt={playlist.name} class="w-full h-full object-contain bg-white/5" />

            <div class="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </button>
        {/each}
      {:else}
        {#each placeholders as i}
          <div class="aspect-square rounded-2xl bg-white/5 shrink-0"></div>
        {/each}
      {/if}
    </div>
  </div>
</aside>
