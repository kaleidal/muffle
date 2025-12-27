<script lang="ts">
  export let mix
  export let size: 'sm' | 'lg' = 'sm'

  import { navigationStore } from '../stores/navigationStore'

  $: sizeClass = size === 'lg' ? 'w-40' : 'w-24'
</script>

<button class="relative shrink-0 group" aria-label={mix.name} onclick={() => navigationStore.openPlaylist(mix.id)}>
  <div class="{sizeClass} aspect-square rounded-2xl overflow-hidden fluid-card relative">
    {#if mix.image}
      <img src={mix.image} alt={mix.name} class="w-full h-full object-cover" />
    {:else}
      <div class="w-full h-full bg-white/5"></div>
    {/if}
    
    <!-- Hover overlay (details) -->
    <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"></div>
  </div>
</button>
