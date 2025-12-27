<script lang="ts">
  import Sidebar from './lib/components/Sidebar.svelte'
  import TitleBar from './lib/components/TitleBar.svelte'
  import LoginScreen from './lib/components/LoginScreen.svelte'
  import { playerStore } from './lib/stores/playerStore'
  import { spotifyStore } from './lib/stores/spotify'
  import { navigationStore } from './lib/stores/navigationStore'
  import MadeForYou from './lib/components/MadeForYou.svelte'
  import SearchBar from './lib/components/SearchBar.svelte'
  import NextUpPeek from './lib/components/NextUpPeek.svelte'
  import NowPlayingCard from './lib/components/NowPlayingCard.svelte'
  import RightPanel from './lib/components/RightPanel.svelte'
  import PlaylistPage from './lib/components/PlaylistPage.svelte'
  import SearchPage from './lib/components/SearchPage.svelte'

  try {
    spotifyStore.init()
  } catch (error) {
    console.error('Failed to initialize Spotify store:', error)
  }
</script>

<div class="app-container h-screen flex flex-col bg-(--bg-primary) overflow-hidden">
  <TitleBar />

  <div class="flex-1 min-h-0 p-8 pt-4 overflow-visible">
    {#if $spotifyStore.status !== 'authenticated'}
      <LoginScreen />
    {:else}
      <div class="h-full min-h-0 w-full flex flex-col gap-6 overflow-visible">
        <div class="flex flex-row gap-4 flex-1 min-h-0 overflow-visible">
          <Sidebar />
          <div class="flex-1 min-w-0 min-h-0 overflow-visible flex flex-col gap-4">
            <div class="shrink-0">
              <div class="flex items-center gap-3">
                <button
                  class="group w-14 h-14 rounded-full bg-[#141414] hover:bg-white/10 transition-colors flex items-center justify-center bouncy-btn shrink-0"
                  aria-label="Home"
                  title="Home"
                  onclick={() => navigationStore.goHome()}
                >
                  <svg
                    class="w-8 h-8 transition-colors {$navigationStore.page === 'home' ? 'text-white' : 'text-white/50 group-hover:text-white'}"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3l9-8z" />
                  </svg>
                </button>

                <div class="flex-1 min-w-0">
                  <SearchBar />
                </div>
              </div>
            </div>
            <div class="flex-1 min-h-0 overflow-visible relative">
              {#if $navigationStore.page === 'home'}
                <MadeForYou />
              {:else if $navigationStore.page === 'playlist' && $navigationStore.playlistId}
                <PlaylistPage playlistId={$navigationStore.playlistId} />
              {:else if $navigationStore.page === 'search'}
                <SearchPage query={$navigationStore.searchQuery} />
              {:else}
                <MadeForYou />
              {/if}
            </div>
          </div>
        </div>

        <div class="flex flex-row w-full gap-4 h-37.5 shrink-0 items-stretch overflow-visible">
          {#if $playerStore.peekLatched || $playerStore.showNextPreview || $playerStore.isTransitioning || $playerStore.nowPlayingToast}
            <div class="shrink-0 flex items-center relative">
              {#if $playerStore.peekLatched || $playerStore.showNextPreview || $playerStore.isTransitioning}
                <NextUpPeek variant="peek" />
              {:else if $playerStore.nowPlayingToast}
                <NextUpPeek variant="toast" />
              {/if}
            </div>
          {/if}
 
          <div class="flex-1 min-w-0">
            <NowPlayingCard />
          </div>

          <div class="flex-1 min-w-0">
            <RightPanel />
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .app-container {
    border-radius: 24px;
    overflow: hidden;
  }
</style>
