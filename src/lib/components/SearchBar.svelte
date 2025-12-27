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
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-white/50">
    <path d="M21 21L16.66 16.66M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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
