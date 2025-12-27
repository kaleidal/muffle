<script lang="ts">
  export let placeholder = 'Search'

  let query = ''
</script>

<div class="bg-[#141414] rounded-[40px] px-6 py-4 flex items-center gap-3">
  <svg class="w-5 h-5 text-white/50 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M10 4a6 6 0 104.472 10.01l3.759 3.76 1.414-1.415-3.76-3.759A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z"
    />
  </svg>

  <input
    class="w-full bg-transparent outline-none text-white placeholder:text-white/40 text-sm font-medium"
    bind:value={query}
    placeholder={placeholder}
    aria-label={placeholder}
    spellcheck="false"
    autocomplete="off"
  />
</div>
