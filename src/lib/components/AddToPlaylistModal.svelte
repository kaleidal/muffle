<script lang="ts">
  import { fade, fly } from 'svelte/transition'
  import { spotifyStore } from '../stores/spotify'

  type AddableTrack = {
    id: string
    uri: string
    name: string
    artist: string
    albumArt: string
  }

  export let open: boolean
  export let track: AddableTrack | null
  export let onClose: () => void

  let filter = ''
  let busy = false
  let error: string | null = null

  let confirmTarget:
    | null
    | {
        id: string
        name: string
        kind: 'liked' | 'playlist'
      } = null

  type ContainsState = boolean | null | undefined
  let containsById: Record<string, ContainsState> = {}
  let checkingById: Record<string, boolean> = {}
  let lastTrackKey: string | null = null

  const close = () => {
    if (busy) return
    error = null
    filter = ''
    confirmTarget = null
    onClose()
  }

  $: visiblePlaylists =
    $spotifyStore.status === 'authenticated'
      ? ($spotifyStore.playlists || []).filter((p) => {
          const q = filter.trim().toLowerCase()
          if (!q) return true
          return (p.name || '').toLowerCase().includes(q)
        })
      : []

  const resetChecks = () => {
    containsById = {}
    checkingById = {}
  }

  const ensureChecked = async (id: string) => {
    if (!open || !track) return
    if (checkingById[id]) return
    if (Object.prototype.hasOwnProperty.call(containsById, id)) return

    checkingById = { ...checkingById, [id]: true }
    try {
      const present =
        id === 'liked'
          ? await spotifyStore.isTrackInLiked(track.id)
          : await spotifyStore.isTrackInPlaylist(id, track.uri)
      containsById = { ...containsById, [id]: !!present }
    } catch {
      containsById = { ...containsById, [id]: null }
    } finally {
      const { [id]: _removed, ...rest } = checkingById
      checkingById = rest
    }
  }

  $: if (open && track) {
    const k = `${track.id}:${track.uri}`
    if (k !== lastTrackKey) {
      lastTrackKey = k
      confirmTarget = null
      resetChecks()
      void ensureChecked('liked')
    }
  }

  $: if (open && track) {
    for (const p of visiblePlaylists.slice(0, 20)) {
      void ensureChecked(p.id)
    }
  }

  const beginConfirm = (args: { id: string; name: string; kind: 'liked' | 'playlist' }) => {
    if (busy) return
    confirmTarget = args
    error = null
  }

  const cancelConfirm = () => {
    if (busy) return
    confirmTarget = null
    error = null
  }

  async function addToLiked(force = false) {
    if (!track) return

    const known = containsById['liked']
    if (!force && known === true) {
      beginConfirm({ id: 'liked', name: 'Liked Songs', kind: 'liked' })
      return
    }

    busy = true
    error = null
    try {
      await spotifyStore.addTrackToLiked(track.id)
      close()
    } catch (e: any) {
      error = e?.message || 'Failed to add to Liked Songs'
    } finally {
      busy = false
    }
  }

  async function addToPlaylist(playlistId: string, playlistName: string, force = false) {
    if (!track) return

    const known = containsById[playlistId]
    if (!force && known === true) {
      beginConfirm({ id: playlistId, name: playlistName, kind: 'playlist' })
      return
    }

    busy = true
    error = null
    try {
      await spotifyStore.addTrackToPlaylist(playlistId, track.uri)
      close()
    } catch (e: any) {
      error = e?.message || 'Failed to add to playlist'
    } finally {
      busy = false
    }
  }

  const confirmAddAnyway = async () => {
    if (!track || !confirmTarget) return
    if (confirmTarget.kind === 'liked') return await addToLiked(true)
    return await addToPlaylist(confirmTarget.id, confirmTarget.name, true)
  }
</script>

{#if open && track}
  <div class="fixed inset-0 z-70">
    <button
      type="button"
      class="absolute inset-0 bg-black/60"
      aria-label="Close"
      onclick={close}
      transition:fade={{ duration: 140 }}
      disabled={busy}
    ></button>

    <div class="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
      <div
        class="w-full max-w-lg bg-[#141414] rounded-4xl p-6 shadow-xl pointer-events-auto"
        in:fly={{ y: 10, duration: 180 }}
        out:fade={{ duration: 120 }}
        role="dialog"
        aria-modal="true"
        aria-label="Add to playlist"
        tabindex="-1"
        onkeydown={(e) => {
          if (e.key === 'Escape') close()
        }}
      >
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl overflow-hidden bg-white/5 shrink-0">
            {#if track.albumArt}
              <img src={track.albumArt} alt={track.name} class="w-full h-full object-cover" />
            {/if}
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-white font-extrabold tracking-tight truncate">Add to playlist</div>
            <div class="text-white/50 text-sm font-semibold truncate">{track.name} • {track.artist}</div>
          </div>
          <button
            type="button"
            class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
            aria-label="Close"
            onclick={close}
            disabled={busy}
          >
            <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.3 5.71 12 12.01l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.72 2.88 18.3 9.18 12 2.88 5.7 4.3 4.29l6.29 6.3 6.3-6.3z" />
            </svg>
          </button>
        </div>

        <div class="mt-5">
          {#if !confirmTarget}
            <input
              class="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 transition-colors rounded-2xl px-4 py-3 text-white/90 outline-none font-semibold"
              placeholder="Search playlists"
              bind:value={filter}
              disabled={busy}
            />
          {/if}
        </div>

        {#if error}
          <div class="mt-3 text-white/60 text-sm font-semibold">{error}</div>
        {/if}

        {#if confirmTarget}
          <div class="mt-4 rounded-3xl bg-white/5 p-4">
            <div class="text-white font-extrabold tracking-tight">Already in playlist</div>
            <div class="mt-1 text-white/60 text-sm font-semibold">
              This track is already in <span class="text-white/90">{confirmTarget.name}</span>. Add it again?
            </div>

            <div class="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                class="h-10 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white/90 font-extrabold tracking-tight bouncy-btn"
                onclick={cancelConfirm}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                class="h-10 px-4 rounded-2xl bg-(--accent-primary) text-black font-extrabold tracking-tight bouncy-btn"
                onclick={confirmAddAnyway}
                disabled={busy}
              >
                Add anyway
              </button>
            </div>
          </div>
        {:else}
          <div class="mt-4 max-h-72 overflow-y-auto scrollbar-hide">
            <button
              type="button"
              class="w-full text-left px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-between"
              onclick={() => addToLiked(false)}
              disabled={busy}
            >
              <div class="min-w-0">
                <div class="text-white font-extrabold tracking-tight truncate">Liked Songs</div>
                <div class="text-white/50 text-sm font-semibold truncate">Save to your library</div>
              </div>

              {#if checkingById['liked']}
                <div class="text-white/35 text-xs font-semibold">Checking…</div>
              {:else if containsById['liked'] === true}
                <div class="text-white/45 text-xs font-extrabold tracking-tight">Added</div>
              {/if}
            </button>

            <div class="mt-3 flex flex-col gap-2">
              {#each visiblePlaylists as p (p.id)}
                <button
                  type="button"
                  class="w-full text-left px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-3"
                  onclick={() => addToPlaylist(p.id, p.name, false)}
                  disabled={busy}
                >
                  <div class="w-10 h-10 rounded-xl overflow-hidden bg-white/5 shrink-0">
                    {#if p.images?.[0]?.url}
                      <img src={p.images[0].url} alt={p.name} class="w-full h-full object-cover" />
                    {/if}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-white font-extrabold tracking-tight truncate">{p.name}</div>
                  </div>

                  {#if checkingById[p.id]}
                    <div class="text-white/35 text-xs font-semibold shrink-0">Checking…</div>
                  {:else if containsById[p.id] === true}
                    <div class="text-white/45 text-xs font-extrabold tracking-tight shrink-0">Added</div>
                  {/if}
                </button>
              {/each}

              {#if $spotifyStore.status === 'authenticated' && visiblePlaylists.length === 0}
                <div class="px-2 py-4 text-white/45 text-sm font-semibold">No playlists found</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
