<script lang="ts">
  import { playerStore } from '../stores/playerStore'

  function toggleExpanded() {
    playerStore.toggleExpanded()
  }
</script>

<div class="bg-[#141414] grow rounded-[40px] h-full px-6 py-5 flex flex-col">
  <div class="flex items-center justify-between gap-3 mb-3">
    <p class="text-white/60 text-xs font-semibold uppercase tracking-wide">Up Next</p>

    <button
      class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn shrink-0"
      aria-label={$playerStore.expanded ? 'Collapse player' : 'Expand player'}
      title={$playerStore.expanded ? 'Collapse' : 'Expand'}
      onclick={toggleExpanded}
    >
      {#if $playerStore.expanded}
        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.41 9.41 12 14l4.59-4.59L18 10.83l-6 6-6-6z" />
        </svg>
      {:else}
        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.41 14.59 12 10l4.59 4.59L18 13.17l-6-6-6 6z" />
        </svg>
      {/if}
    </button>
  </div>
  
  <div class="flex-1 flex flex-col gap-2 overflow-y-auto scrollbar-hide">
    {#if $playerStore.queue.length}
      {#each $playerStore.queue.slice(0, $playerStore.expanded ? 20 : 5) as track, i}
        <div class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors">
          <img src={track.albumArt} alt={track.album} class="w-10 h-10 rounded-lg object-cover" />
          <div class="min-w-0 flex-1">
            <p class="text-white text-sm font-medium truncate">{track.name}</p>
            <p class="text-white/50 text-xs truncate">{track.artist}</p>
          </div>
        </div>
      {/each}
    {:else}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-white/30 text-sm">Queue is empty</p>
      </div>
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
