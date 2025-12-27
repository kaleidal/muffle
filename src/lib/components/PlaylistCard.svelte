<script lang="ts">
  export let mix
</script>

<button class="relative shrink-0 group" aria-label={mix.name}>
  <div class="w-24 aspect-square rounded-2xl overflow-hidden fluid-card relative">
    {#if mix.image}
      <img src={mix.image} alt={mix.name} class="w-full h-full object-cover" />
    {:else}
      <div class="w-full h-full bg-white/5"></div>
    {/if}
    
    <!-- Play indicator dot -->
    <div class="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#4C3AEF] opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-[#4C3AEF]/50"></div>
    
    <!-- Hover overlay -->
    <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
      <div class="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform">
        <svg class="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </div>
    </div>
  </div>
</button>
