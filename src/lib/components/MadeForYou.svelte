<script lang="ts">
  import PlaylistCard from './PlaylistCard.svelte'
  import { spotifyStore } from '../stores/spotifyStore'
  import { bestImageUrl } from '../utils/spotifyImages'

  $: displayName = $spotifyStore.user?.display_name || 'You'

  $: curated = (() => {
    if ($spotifyStore.status !== 'authenticated') return []

    const featured = $spotifyStore.featuredPlaylists || []
    const mine = $spotifyStore.playlists || []

    const isMadeForYou = (name: string) => /discover weekly|release radar|daily mix|on repeat|repeat rewind|time capsule/i.test(name)
    const isSpotifyOwned = (p: any) => (p?.owner?.display_name || '').toLowerCase() === 'spotify'

    const mixes = mine.filter((p) => isMadeForYou(p.name) || isSpotifyOwned(p))

    // Prefer user's Spotify-generated mixes first; then featured.
    // Do NOT fall back to user's personal playlists (show placeholders instead).
    const preferred = mixes.length ? mixes : featured.length ? featured : []
    return preferred.slice(0, 12).map((p) => ({
      id: p.id,
      name: p.name,
      image: bestImageUrl(p.images),
      type: 'playlist'
    }))
  })()
</script>

<div class="bg-[#141414] rounded-[40px] h-full px-8 py-6 flex flex-col">
  <div class="space-y-5">
    <div>
      <p class="text-white/60 text-sm font-semibold tracking-wide">Made for</p>
      <div class="flex items-baseline gap-4">
        <h2 class="text-white text-5xl font-extrabold tracking-tight leading-none">{displayName}</h2>
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

    <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
      {#if curated.length}
        {#each curated as mix}
          <PlaylistCard {mix} />
        {/each}
      {:else}
        {#each Array.from({ length: 6 }, (_, i) => i) as i}
          <div class="w-24 aspect-square rounded-2xl bg-white/5"></div>
        {/each}
      {/if}
    </div>
  </div>
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
