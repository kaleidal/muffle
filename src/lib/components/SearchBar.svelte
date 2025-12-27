<script lang="ts">
  export let placeholder = 'Search'

  import { navigationStore } from '../stores/navigationStore'

  let query = ''

  $: query = $navigationStore.searchQuery

  function onInput(e: Event) {
    navigationStore.setSearchQuery((e.target as HTMLInputElement).value)
  }
</script>

<div class="bg-[#141414] rounded-[40px] h-14 px-6 flex items-center gap-3">
  <svg class="w-7 h-7 text-white/50 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M10 4a6 6 0 104.472 10.01l3.759 3.76 1.414-1.415-3.76-3.759A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z"
    />
  </svg>

  <input
    class="w-full bg-transparent outline-none text-white placeholder:text-white/40 text-md font-medium"
    value={query}
    oninput={onInput}
    placeholder={placeholder}
    aria-label={placeholder}
    spellcheck="false"
    autocomplete="off"
  />
</div>
