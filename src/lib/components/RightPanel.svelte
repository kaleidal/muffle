<script lang="ts">
  import { playerStore } from '../stores/playerStore'
</script>

<div class="bg-[#141414] grow rounded-[40px] h-full px-6 py-5 flex flex-col">
  <p class="text-white/60 text-xs font-semibold uppercase tracking-wide mb-3">Up Next</p>
  
  <div class="flex-1 flex flex-col gap-2 overflow-y-auto scrollbar-hide">
    {#if $playerStore.queue.length}
      {#each $playerStore.queue.slice(0, 5) as track, i}
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
