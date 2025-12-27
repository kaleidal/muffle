<script lang="ts">
  import Sidebar from './lib/components/Sidebar.svelte'
  import MainContent from './lib/components/MainContent.svelte'
  import TitleBar from './lib/components/TitleBar.svelte'
  import LoginScreen from './lib/components/LoginScreen.svelte'
  import { playerStore } from './lib/stores/playerStore'
  import { spotifyStore } from './lib/stores/spotifyStore'
  import MadeForYou from './lib/components/MadeForYou.svelte'
  import SearchBar from './lib/components/SearchBar.svelte'
  import NextUpPeek from './lib/components/NextUpPeek.svelte'
  import NowPlayingCard from './lib/components/NowPlayingCard.svelte'
  import RightPanel from './lib/components/RightPanel.svelte'

  spotifyStore.init()
</script>

<div class="app-container h-screen flex flex-col bg-[#050505] overflow-hidden">
  <TitleBar />

  <div class="flex-1 min-h-0 p-8 pt-6 overflow-visible">
    {#if $spotifyStore.status !== 'authenticated'}
      <LoginScreen />
    {:else}
      <div class="h-full min-h-0 w-full flex flex-col gap-6 overflow-visible">
        <div class="flex flex-row gap-4 flex-1 min-h-0 overflow-visible">
          <Sidebar />
          <div class="flex-1 min-w-0 min-h-0 overflow-visible flex flex-col gap-4">
            <div class="shrink-0">
              <SearchBar />
            </div>
            <div class="flex-1 min-h-0 overflow-visible">
              <MadeForYou />
            </div>
          </div>
        </div>

        <div class="flex flex-row w-full gap-4 h-37.5 shrink-0 items-stretch overflow-visible">
          {#if $playerStore.peekLatched}
            <div class="shrink-0 flex items-center">
              <NextUpPeek />
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
