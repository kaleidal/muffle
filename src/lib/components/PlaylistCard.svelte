<script lang="ts">
  export let mix
  export let size: 'sm' | 'lg' = 'sm'
  export let onSelect: (() => void) | null = null
  export let accentRgb: string | null = null

  import { navigationStore } from '../stores/navigationStore'

  $: sizeClass = size === 'lg' ? 'w-40' : 'w-24'
  $: kind = (mix?.type as string) || 'playlist'
</script>

<button
  {...$$restProps}
  class="relative shrink-0 group"
  style={accentRgb ? `--card-accent: ${accentRgb};` : undefined}
  aria-label={mix.name}
  onclick={() => (onSelect ? onSelect() : navigationStore.openPlaylist(mix.id))}
>
  <div class="{sizeClass} aspect-square rounded-2xl overflow-hidden fluid-card relative">
    {#if mix.image}
      <img src={mix.image} alt={mix.name} class="w-full h-full object-cover" />
    {:else}
      <div class="w-full h-full bg-white/5"></div>
    {/if}

    <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
      <div class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
        <svg class="w-6 h-6 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  </div>
</button>
