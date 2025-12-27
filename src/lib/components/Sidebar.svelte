<script lang="ts">
  import { spotifyStore } from '../stores/spotify'
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
  <div class="h-full min-h-0 bg-[#141414] rounded-3xl p-3 flex flex-col items-center gap-3 overflow-hidden">
    <div class="w-full flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto scrollbar-hide pb-6">
      {#if $spotifyStore.status === 'authenticated'}
        <button
          class="relative aspect-square rounded-2xl overflow-hidden fluid-card group shrink-0 bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          aria-label="Liked Songs"
          title="Liked Songs"
          onclick={() => navigationStore.openLikedSongs()}
        >
          <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>

          <svg width="24" height="24" viewBox="0 0 22 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 6.51615C1.00002 5.40335 1.33759 4.31674 1.96813 3.39982C2.59867 2.4829 3.49252 1.77881 4.53161 1.38055C5.5707 0.982294 6.70616 0.908598 7.78801 1.1692C8.86987 1.4298 9.84722 2.01243 10.591 2.84015C10.6434 2.89617 10.7067 2.94082 10.7771 2.97135C10.8474 3.00188 10.9233 3.01764 11 3.01764C11.0767 3.01764 11.1526 3.00188 11.2229 2.97135C11.2933 2.94082 11.3566 2.89617 11.409 2.84015C12.1504 2.00705 13.128 1.41952 14.2116 1.15575C15.2952 0.891989 16.4335 0.9645 17.4749 1.36364C18.5163 1.76277 19.4114 2.46961 20.0411 3.39006C20.6708 4.3105 21.0053 5.40091 21 6.51615C21 8.80615 19.5 10.5162 18 12.0162L12.508 17.3292C12.3217 17.5432 12.0919 17.7151 11.834 17.8335C11.5762 17.9518 11.296 18.014 11.0123 18.0158C10.7285 18.0176 10.4476 17.959 10.1883 17.8439C9.92893 17.7288 9.69703 17.5598 9.508 17.3482L4 12.0162C2.5 10.5162 1 8.81615 1 6.51615Z" fill="#D9D9D9" stroke="#D9D9D9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      {/if}

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
