<script lang="ts">
  import { onMount } from 'svelte'
  import { apiGet } from '../stores/spotify/api'
  import { navigationStore, type EntityType } from '../stores/navigationStore'
  import { spotifyStore } from '../stores/spotify'
  import { image, type HomeAlbum, type HomeArtist, type HomePlaylist, type HomeShow, type HomeTrack } from '../stores/spotify/home'

  type Kind = 'playlists' | 'tracks' | 'albums' | 'artists' | 'podcasts'
  type Library = {
    playlists: HomePlaylist[]
    tracks: HomeTrack[]
    albums: HomeAlbum[]
    artists: HomeArtist[]
    podcasts: HomeShow[]
  }

  let kind = $state<Kind>('playlists')
  let query = $state('')
  let loading = $state(true)
  let error = $state<string | null>(null)
  let library = $state.raw<Library>({ playlists: [], tracks: [], albums: [], artists: [], podcasts: [] })

  const tabs: Array<{ id: Kind; label: string }> = [
    { id: 'playlists', label: 'Playlists' },
    { id: 'tracks', label: 'Songs' },
    { id: 'albums', label: 'Albums' },
    { id: 'artists', label: 'Artists' },
    { id: 'podcasts', label: 'Podcasts' },
  ]

  const visible = $derived(
    library[kind].filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),
  )

  onMount(() => {
    void load()
  })

  async function load() {
    loading = true
    error = null
    try {
      const [playlists, tracks, albums, artists, shows] = await Promise.all([
        apiGet<{ items?: HomePlaylist[] }>('native', '/me/playlists?limit=50'),
        apiGet<{ items?: Array<{ track?: HomeTrack }> }>('native', '/me/tracks?limit=50'),
        apiGet<{ items?: Array<{ album?: HomeAlbum }> }>('native', '/me/albums?limit=50'),
        apiGet<{ artists?: { items?: HomeArtist[] } }>('native', '/me/following?type=artist&limit=50'),
        apiGet<{ items?: Array<{ show?: HomeShow }> }>('native', '/me/shows?limit=50'),
      ])
      library = {
        playlists: playlists.items ?? [],
        tracks: (tracks.items ?? []).flatMap((item) => (item.track ? [item.track] : [])),
        albums: (albums.items ?? []).flatMap((item) => (item.album ? [item.album] : [])),
        artists: artists.artists?.items ?? [],
        podcasts: (shows.items ?? []).flatMap((item) => (item.show ? [item.show] : [])),
      }
    } catch (cause) {
      error = String((cause as Error)?.message || cause)
    } finally {
      loading = false
    }
  }

  function openEntity(type: EntityType, id: string) {
    navigationStore.openEntity(type, id)
  }
</script>

<section class="library-page">
  <header>
    <div>
      <h1>Everything you kept</h1>
    </div>
    <label class="filter">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/></svg>
      <input bind:value={query} placeholder="Filter library" aria-label="Filter library" />
    </label>
  </header>

  <nav aria-label="Library sections">
    {#each tabs as tab (tab.id)}
      <button class:active={kind === tab.id} onclick={() => (kind = tab.id)}>{tab.label}</button>
    {/each}
  </nav>

  <div class="content scrollbar-hide">
    {#if loading}
      <div class="grid">
        {#each Array(12) as _, index (index)}<div class="placeholder"></div>{/each}
      </div>
    {:else if error}
      <div class="empty"><h2>Library unavailable</h2><p>{error}</p><button onclick={load}>Try again</button></div>
    {:else if visible.length === 0}
      <div class="empty"><h2>Nothing here yet</h2><p>{query ? 'Try a different filter.' : 'Save something in Spotify and it will appear here.'}</p></div>
    {:else if kind === 'tracks'}
      <div class="track-list">
        {#each visible as item, index (item.id)}
          {@const track = item as HomeTrack}
          <button onclick={() => spotifyStore.playTrackUri(track.uri)}>
            <span class="number">{String(index + 1).padStart(2, '0')}</span>
            <img src={image(track.album.images)} alt={track.album.name} />
            <span class="copy"><strong>{track.name}</strong><small>{track.artists.map((artist) => artist.name).join(', ')}</small></span>
            <span class="album-name">{track.album.name}</span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="grid">
        {#each visible as item (item.id)}
          <button
            class="library-item"
            onclick={() => {
              if (kind === 'playlists') navigationStore.openPlaylist(item.id)
              else openEntity(kind === 'podcasts' ? 'show' : kind.slice(0, -1) as EntityType, item.id)
            }}
          >
            <img
              class:round={kind === 'artists'}
              src={image((item as HomeAlbum | HomeArtist | HomePlaylist | HomeShow).images)}
              alt={item.name}
            />
            <strong>{item.name}</strong>
            <span>
              {kind === 'albums'
                ? (item as HomeAlbum).artists.map((artist) => artist.name).join(', ')
                : kind === 'podcasts'
                  ? (item as HomeShow).publisher || 'Podcast'
                  : kind === 'playlists'
                    ? (item as HomePlaylist).owner?.display_name || 'Playlist'
                    : 'Artist'}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .library-page { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; padding: 2rem 2.25rem; border-radius: 2.5rem; background: #121212; color: white; }
  header { display: flex; justify-content: space-between; align-items: end; gap: 2rem; }
  h1 { margin: 0; font-size: clamp(2.3rem,4vw,4rem); line-height: .95; letter-spacing: -.055em; }
  .filter { display: flex; align-items: center; gap: .6rem; width: min(19rem,36%); padding: .75rem 1rem; border-radius: 999px; background: #1f1f1f; transition: background .2s ease, box-shadow .2s ease; }
  .filter:focus-within { background: #252525; box-shadow: 0 0 0 2px rgba(255,255,255,.13); }
  .filter svg { width: 1.1rem; fill: none; stroke: rgba(255,255,255,.42); stroke-width: 2; }
  .filter input { width: 100%; border: 0; outline: 0; background: transparent; color: white; font: inherit; }
  .filter input::placeholder { color: rgba(255,255,255,.35); }
  nav { display: flex; gap: .45rem; margin: 1.7rem 0 1.4rem; overflow-x: auto; }
  nav button { padding: .62rem .9rem; border-radius: 999px; background: #202020; color: rgba(255,255,255,.56); font-size: .82rem; font-weight: 700; transition: background .2s ease, color .2s ease, transform .2s ease; }
  nav button:hover { color: white; transform: translateY(-1px); }
  nav button.active { background: #f1f1f1; color: #090909; }
  .content { flex: 1; min-height: 0; overflow-y: auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(8.7rem,1fr)); gap: 1.3rem 1rem; padding-bottom: 2rem; }
  .library-item { min-width: 0; color: white; text-align: left; }
  .library-item img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 1.45rem; background: #1c1c1c; transition: transform .26s cubic-bezier(.2,.8,.2,1), border-radius .26s ease; }
  .library-item img.round { border-radius: 50%; }
  .library-item:hover img { transform: translateY(-5px) scale(1.015); }
  .library-item strong, .library-item span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .library-item strong { margin-top: .65rem; font-size: .87rem; }
  .library-item span { margin-top: .15rem; color: rgba(255,255,255,.4); font-size: .75rem; }
  .track-list { display: grid; padding-bottom: 2rem; }
  .track-list button { display: grid; grid-template-columns: 2rem 3.4rem minmax(0,1fr) minmax(5rem,.65fr); align-items: center; gap: .85rem; padding: .55rem .7rem; border-radius: 1rem; color: white; text-align: left; transition: background .18s ease, transform .18s ease; }
  .track-list button:hover { background: rgba(255,255,255,.055); transform: translateX(3px); }
  .track-list img { width: 3.4rem; aspect-ratio: 1; object-fit: cover; border-radius: .9rem; }
  .number { color: rgba(255,255,255,.28); font-size: .72rem; font-variant-numeric: tabular-nums; }
  .copy { display: grid; min-width: 0; }
  .copy strong, .copy small, .album-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .copy small, .album-name { color: rgba(255,255,255,.4); font-size: .76rem; }
  .placeholder { aspect-ratio: 1; border-radius: 1.45rem; background: #1b1b1b; animation: breathe 1.5s ease infinite; }
  .empty { min-height: 18rem; display: grid; place-content: center; justify-items: center; text-align: center; }
  .empty h2 { margin: 0; font-size: 1.8rem; letter-spacing: -.04em; }
  .empty p { margin: .4rem 0 1rem; color: rgba(255,255,255,.42); }
  .empty button { padding: .7rem 1rem; border-radius: 999px; background: white; color: #090909; font-weight: 700; }
  @keyframes breathe { 50% { background: #222; } }
  @media (max-width: 760px) { .library-page { padding: 1.5rem; } header { align-items: stretch; flex-direction: column; gap: 1rem; } .filter { width: 100%; } .album-name { display: none; } .track-list button { grid-template-columns: 2rem 3.4rem minmax(0,1fr); } }
</style>
