<script lang="ts">
  import { onDestroy } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import PlaylistCard from './PlaylistCard.svelte'
  import { spotifyStore } from '../stores/spotify'
  import { bestImageUrl } from '../utils/spotifyImages'

  type CategorySection = {
    id: string
    name: string
    iconUrl: string
    playlists: Array<{ id: string; name: string; images?: { url: string }[] }>
  }

  $: displayName = $spotifyStore.user?.display_name || 'You'

  let loading = false
  let error: string | null = null
  let sections: CategorySection[] = []

  let lastStatus: string | null = null
  let inFlight: Promise<void> | null = null

  const load = async () => {
    if ($spotifyStore.status !== 'authenticated') return
    if (inFlight) return await inFlight
    loading = true
    error = null

    inFlight = (async () => {
      try {
        const res = await spotifyStore.getHomeCategorySections({ limit: 5, playlistsPerCategory: 12 })
        sections = (res || []) as CategorySection[]
      } catch (e: any) {
        error = e?.message || 'Failed to load categories'
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

  onDestroy(() => {
    inFlight = null
  })
</script>

<div
  class="bg-[#141414] rounded-[40px] h-full px-10 py-8 flex flex-col absolute inset-0"
  in:fly={{ x: 18, duration: 220 }}
  out:fade={{ duration: 140 }}
>
  <div class="space-y-5">
    <div>
      <p class="text-white/60 text-xl font-semibold tracking-wide">hello,</p>
      <div class="flex items-baseline gap-4">
        <h2 class="text-white text-8xl font-extrabold tracking-tight leading-none">{displayName}</h2>
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

    {#if $spotifyStore.status === 'authenticated'}
      {#if loading}
        <div class="text-white/50 text-sm font-semibold">Loading…</div>
      {:else if error}
        <div class="text-white/50 text-sm font-semibold">{error}</div>
      {:else}
        <div class="space-y-6">
          {#each sections as section (section.id)}
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                {#if section.iconUrl}
                  <img src={section.iconUrl} alt={section.name} class="w-6 h-6 rounded-lg object-cover" />
                {/if}
                <p class="text-white/60 text-sm font-semibold tracking-wide">{section.name}</p>
              </div>

              <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {#each section.playlists as p (p.id)}
                  <PlaylistCard
                    mix={{ id: p.id, name: p.name, image: bestImageUrl(p.images), type: 'playlist' }}
                    size="lg"
                  />
                {/each}
              </div>
            </div>
          {/each}

          {#if sections.length === 0}
            <div class="text-white/50 text-sm font-semibold">No categories</div>
          {/if}
        </div>
      {/if}
    {/if}
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
