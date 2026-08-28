<script lang="ts">
  import { onDestroy } from 'svelte'
  import { spotifyStore } from '../stores/spotify'
  import { navigationStore } from '../stores/navigationStore'
  import { native } from '../native'

  let open = $state(false)
  let anchorEl = $state<HTMLButtonElement | null>(null)
  let menuEl = $state<HTMLDivElement | null>(null)
  const showWindowControls = !/Mac/i.test(navigator.platform)

  const close = () => {
    open = false
  }

  const toggle = () => {
    open = !open
  }

  const openAccount = () => {
    void native.openExternal('https://www.spotify.com/account/')
    close()
  }

  const logout = () => {
    spotifyStore.logout()
    close()
  }

  const onDocPointerDown = (e: PointerEvent) => {
    if (!open) return
    const target = e.target as Node | null
    if (!target) return
    if (menuEl?.contains(target)) return
    if (anchorEl?.contains(target)) return
    close()
  }

  const onDocKeyDown = (e: KeyboardEvent) => {
    if (!open) return
    if (e.key === 'Escape') close()
  }

  globalThis.document?.addEventListener?.('pointerdown', onDocPointerDown)
  globalThis.document?.addEventListener?.('keydown', onDocKeyDown)

  onDestroy(() => {
    globalThis.document?.removeEventListener?.('pointerdown', onDocPointerDown)
    globalThis.document?.removeEventListener?.('keydown', onDocKeyDown)
  })
</script>

<div class="h-10 flex items-center justify-between px-4 pt-4 bg-[#050505] drag-region relative z-[100]">
  <div class="flex items-center gap-2 no-drag">
    {#if $spotifyStore.status === 'authenticated' && $spotifyStore.user}
      <div class="relative z-10">
        <button
          class="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-white/10 transition-colors"
          aria-label="Account menu"
          bind:this={anchorEl}
          onclick={toggle}
        >
          <div class="w-7 h-7 rounded-full bg-white/10 overflow-hidden">
            {#if $spotifyStore.user.images?.[0]?.url}
              <img src={$spotifyStore.user.images[0].url} alt="Profile" class="w-full h-full object-cover" />
            {/if}
          </div>

          <span class="text-white/60 text-xs font-semibold truncate max-w-48">{$spotifyStore.user.display_name}</span>

          <svg class="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </button>

        {#if open}
          <div
            class="absolute left-0 mt-2 w-56 bg-[#141414] rounded-3xl p-3 shadow-xl border border-white/10 z-50"
            bind:this={menuEl}
          >
            <button
              class="w-full text-left px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold transition-colors"
              onclick={() => {
                navigationStore.openSettings()
                close()
              }}
              aria-label="Settings"
            >
              Settings
            </button>

            <button
              class="w-full text-left px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold transition-colors mt-2"
              onclick={openAccount}
              aria-label="Spotify Account"
            >
              Account
            </button>

            <div class="h-px bg-white/10 my-2"></div>

            <button
              class="w-full text-left px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold transition-colors"
              onclick={logout}
              aria-label="Logout"
            >
              Logout
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <button
        class="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors text-xs font-semibold"
        onclick={() => spotifyStore.login()}
        aria-label="Connect Spotify"
      >
        Connect
      </button>
    {/if}
  </div>

  {#if showWindowControls}
  <div class="window-controls no-drag" aria-label="Window controls">
    <button onclick={() => native.window.minimize()} aria-label="Minimize window">
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8" /></svg>
    </button>
    <button onclick={() => native.window.toggleMaximize()} aria-label="Maximize window">
      <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1" /></svg>
    </button>
    <button class="close-window" onclick={() => native.window.close()} aria-label="Close window">
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9" /></svg>
    </button>
  </div>
  {/if}
</div>

<style>
  .window-controls { display: flex; align-items: center; align-self: stretch; margin-right: -1rem; margin-top: -1rem; }
  .window-controls button { display: grid; place-items: center; width: 2.8rem; height: 2.4rem; color: rgba(255,255,255,.55); transition: color .16s ease, background .16s ease; }
  .window-controls button:hover { color: white; background: rgba(255,255,255,.08); }
  .window-controls button.close-window:hover { background: #c84343; }
  .window-controls svg { width: .85rem; fill: none; stroke: currentColor; stroke-width: 1.35; }
</style>
