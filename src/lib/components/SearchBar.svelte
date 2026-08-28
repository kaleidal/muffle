<script lang="ts">
  import { onMount } from 'svelte'
  import { navigationStore } from '../stores/navigationStore'

  let { placeholder = 'Search' }: { placeholder?: string } = $props()
  let focused = $state(false)
  let history = $state.raw<string[]>([])
  const query = $derived($navigationStore.searchQuery)

  onMount(() => {
    try {
      history = JSON.parse(localStorage.getItem('muffle_search_history') || '[]').filter((item: unknown) => typeof item === 'string').slice(0, 8)
    } catch {
      history = []
    }
  })

  function search(value: string) {
    navigationStore.setSearchQuery(value)
  }

  function remember(value: string) {
    const next = value.trim()
    if (!next) return
    history = [next, ...history.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(0, 8)
    localStorage.setItem('muffle_search_history', JSON.stringify(history))
  }

  function choose(value: string) {
    search(value)
    remember(value)
    focused = false
  }

  function clearHistory() {
    history = []
    localStorage.removeItem('muffle_search_history')
  }
</script>

<div class="search-shell">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M21 21L16.66 16.66M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 3 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>

  <input
    value={query}
    oninput={(event) => search(event.currentTarget.value)}
    onkeydown={(event) => {
      if (event.key === 'Enter') remember(event.currentTarget.value)
      if (event.key === 'Escape') event.currentTarget.blur()
    }}
    onfocus={() => (focused = true)}
    onblur={() => window.setTimeout(() => (focused = false), 100)}
    placeholder={placeholder}
    aria-label={placeholder}
    spellcheck="false"
    autocomplete="off"
  />

  {#if focused && !query && history.length}
    <div class="history">
      <div><strong>Recent searches</strong><button onmousedown={(event) => event.preventDefault()} onclick={clearHistory}>Clear</button></div>
      {#each history as item (item)}
        <button onmousedown={(event) => event.preventDefault()} onclick={() => choose(item)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5l3 2m6-3a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z"/></svg>
          <span>{item}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .search-shell { position: relative; height: 3.5rem; display: flex; align-items: center; gap: .75rem; padding: 0 1.5rem; border-radius: 2rem; background: #141414; color: rgba(255,255,255,.5); }
  .search-shell > svg { flex: none; }
  input { width: 100%; border: 0; outline: 0; background: transparent; color: white; font: inherit; font-weight: 550; }
  input::placeholder { color: rgba(255,255,255,.4); }
  .history { position: absolute; z-index: 80; inset: calc(100% + .5rem) 0 auto; padding: .65rem; border-radius: 1.4rem; background: #181818; color: white; box-shadow: 0 1.5rem 3rem rgba(0,0,0,.4); }
  .history > div { display: flex; align-items: center; justify-content: space-between; padding: .35rem .55rem .5rem; }
  .history > div strong { font-size: .78rem; }
  .history > div button { color: rgba(255,255,255,.45); font-size: .72rem; }
  .history > button { display: flex; align-items: center; gap: .7rem; width: 100%; padding: .6rem; border-radius: .9rem; color: rgba(255,255,255,.74); text-align: left; }
  .history > button:hover { background: rgba(255,255,255,.07); color: white; }
  .history > button svg { width: 1rem; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; }
  .history span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
