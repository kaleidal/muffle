<script lang="ts">
  export let mix

  import { navigationStore } from '../stores/navigationStore'
</script>

<button class="relative shrink-0 group" aria-label={mix.name} onclick={() => navigationStore.openPlaylist(mix.id)}>
  <div class="w-24 aspect-square rounded-2xl overflow-hidden fluid-card relative">
    {#if mix.image}
      <img src={mix.image} alt={mix.name} class="w-full h-full object-cover" />
    {:else}
      <div class="w-full h-full bg-white/5"></div>
    {/if}
    
    <!-- Play indicator dot -->
    <div class="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#4C3AEF] opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-[#4C3AEF]/50"></div>
    
    <!-- Hover overlay (details) -->
    <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"></div>
  </div>
</button>
