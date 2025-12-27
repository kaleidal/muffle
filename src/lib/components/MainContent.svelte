<script lang="ts">
  import MadeForYou from './MadeForYou.svelte'
  import NowPlayingCard from './NowPlayingCard.svelte'
  import RightPanel from './RightPanel.svelte'
</script>

<main class="flex-1 flex flex-col gap-4 overflow-hidden">
  <!-- Playlists section at top -->
  <MadeForYou />

  <!-- Bottom row: Now Playing (left) + Right Panel (right) -->
  <div class="flex flex-row w-full gap-4 h-50">
    <NowPlayingCard />
    <RightPanel />
  </div>
</main>

<style>
  main {
    scrollbar-gutter: stable;
  }
</style>
