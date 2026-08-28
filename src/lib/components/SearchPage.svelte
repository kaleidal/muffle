<script lang="ts">
  import { onDestroy } from 'svelte'
  import { searchSpotify, type SearchResults } from '../stores/spotify/search'
  import { image, type HomeTrack } from '../stores/spotify/home'
  import { spotifyStore } from '../stores/spotify'
  import { navigationStore } from '../stores/navigationStore'
  import AddToPlaylistModal from './AddToPlaylistModal.svelte'
  import { mapToPlayableTrack, type PlayableTrack } from '../stores/spotify/mappers'

  let { query }: { query: string } = $props()
  let loading = $state(false)
  let error = $state<string | null>(null)
  let results = $state.raw<SearchResults | null>(null)
  let request = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let addOpen = $state(false)
  let addTrack = $state.raw<PlayableTrack | null>(null)

  $effect(() => {
    const value = query.trim()
    if (timer) clearTimeout(timer)
    if (!value) {
      results = null
      loading = false
      return
    }
    timer = setTimeout(() => void run(value), 220)
  })

  onDestroy(() => {
    if (timer) clearTimeout(timer)
  })

  async function run(value: string) {
    const serial = ++request
    loading = true
    error = null
    try {
      const next = await searchSpotify(value)
      if (serial === request) results = next
    } catch (cause) {
      if (serial === request) error = String((cause as Error)?.message || cause)
    } finally {
      if (serial === request) loading = false
    }
  }

  function artists(track: HomeTrack) {
    return track.artists.map((artist) => artist.name).join(', ')
  }
</script>

<section class="search-page">
  <header>
    <h1>{query.trim() || 'Find something'}</h1>
  </header>

  <div class="results scrollbar-hide">
    {#if loading}
      <div class="loading-grid">{#each Array(10) as _, index (index)}<div></div>{/each}</div>
    {:else if error}
      <div class="empty"><h2>Search failed</h2><p>{error}</p></div>
    {:else if results}
      {#if results.tracks.length}
        <section class="songs">
          <h2>Songs</h2>
          <div>
            {#each results.tracks.slice(0, 6) as track, index (track.id)}
              <div class="song-row" role="button" tabindex="0" onclick={() => spotifyStore.playTrackUri(track.uri)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') void spotifyStore.playTrackUri(track.uri) }}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <img src={image(track.album.images)} alt={track.album.name} />
                <span class="song-copy"><strong>{track.name}</strong><small>{artists(track)}</small></span>
                <small>{track.album.name}</small>
                <span class="song-actions">
                  <button onclick={(event) => { event.stopPropagation(); void spotifyStore.enqueueUri(track.uri) }} aria-label={`Add ${track.name} to queue`} title="Add to queue">+</button>
                  <button onclick={(event) => { event.stopPropagation(); addTrack = mapToPlayableTrack(track); addOpen = true }} aria-label={`Add ${track.name} to a playlist`} title="Add to playlist">•••</button>
                </span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if results.artists.length}
        <section>
          <h2>Artists</h2>
          <div class="people shelf">
            {#each results.artists as artist (artist.id)}
              <button onclick={() => navigationStore.openEntity('artist', artist.id)}><img src={image(artist.images)} alt={artist.name}/><strong>{artist.name}</strong><span>Artist</span></button>
            {/each}
          </div>
        </section>
      {/if}

      {#if results.albums.length}
        <section>
          <h2>Albums</h2>
          <div class="shelf">
            {#each results.albums as album (album.id)}
              <button onclick={() => navigationStore.openEntity('album', album.id)}><img src={image(album.images)} alt={album.name}/><strong>{album.name}</strong><span>{album.artists.map((artist) => artist.name).join(', ')}</span></button>
            {/each}
          </div>
        </section>
      {/if}

      {#if results.playlists.length}
        <section>
          <h2>Playlists</h2>
          <div class="shelf">
            {#each results.playlists as playlist (playlist.id)}
              <button onclick={() => navigationStore.openPlaylist(playlist.id)}><img src={image(playlist.images)} alt={playlist.name}/><strong>{playlist.name}</strong><span>{playlist.owner?.display_name || 'Playlist'}</span></button>
            {/each}
          </div>
        </section>
      {/if}

      {#if results.shows.length}
        <section>
          <h2>Podcasts</h2>
          <div class="shelf">
            {#each results.shows as show (show.id)}
              <button onclick={() => navigationStore.openEntity('show', show.id)}><img src={image(show.images)} alt={show.name}/><strong>{show.name}</strong><span>{show.publisher || 'Podcast'}</span></button>
            {/each}
          </div>
        </section>
      {/if}

      {#if results.episodes.length}
        <section>
          <h2>Episodes</h2>
          <div class="episode-results">
            {#each results.episodes as episode (episode.id)}
              <button onclick={() => spotifyStore.playTrackUri(episode.uri)}>
                <img src={image(episode.images)} alt={episode.name} />
                <span><strong>{episode.name}</strong><small>{episode.show?.name || 'Podcast episode'}</small></span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if !results.tracks.length && !results.artists.length && !results.albums.length && !results.playlists.length && !results.shows.length && !results.episodes.length}
        <div class="empty"><h2>No matches</h2><p>Try a title, artist, album, playlist, or podcast.</p></div>
      {/if}
    {:else}
      <div class="empty"><h2>Search all of Spotify</h2><p>Songs, artists, albums, playlists, podcasts, and episodes.</p></div>
    {/if}
  </div>
</section>

<AddToPlaylistModal open={addOpen} track={addTrack} onClose={() => { addOpen = false; addTrack = null }} />

<style>
  .search-page { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; padding: 2rem 2.3rem; border-radius: 2.5rem; background: #121212; color: white; }
  h1 { margin: 0 0 1.5rem; font-size: clamp(2.5rem,5vw,4.5rem); line-height: .95; letter-spacing: -.06em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .results { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 2rem; }
  section + section { margin-top: 2.2rem; }
  h2 { margin: 0 0 .9rem; font-size: 1.3rem; letter-spacing: -.025em; }
  .songs > div { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .5rem; }
  .song-row { display: grid; grid-template-columns: 1.7rem 3.5rem minmax(0,1fr) minmax(5rem,.55fr) auto; align-items: center; gap: .75rem; min-width: 0; padding: .55rem; border-radius: 1.1rem; color: white; text-align: left; transition: background .18s ease, transform .18s ease; cursor: pointer; }
  .song-row:hover { background: rgba(255,255,255,.06); transform: translateX(3px); }
  .song-row > span:first-child, .song-row > small { color: rgba(255,255,255,.35); font-size: .72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .songs img { width: 3.5rem; aspect-ratio: 1; object-fit: cover; border-radius: .9rem; }
  .song-copy { min-width: 0; display: grid; }
  .song-copy strong, .song-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song-copy small { color: rgba(255,255,255,.4); font-size: .73rem; }
  .song-actions { display: flex; gap: .3rem; opacity: .3; transition: opacity .18s ease; }
  .song-row:hover .song-actions { opacity: 1; }
  .song-actions button { display: grid; place-items: center; width: 2rem; aspect-ratio: 1; border-radius: 50%; background: rgba(255,255,255,.08); color: white; font-weight: 800; }
  .song-actions button:hover { background: white; color: #090909; }
  .shelf { display: grid; grid-auto-flow: column; grid-auto-columns: 10rem; gap: .9rem; overflow-x: auto; padding-bottom: .5rem; }
  .shelf button { min-width: 0; color: white; text-align: left; }
  .shelf img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 1.4rem; transition: transform .25s ease; }
  .shelf.people img { border-radius: 50%; }
  .shelf button:hover img { transform: translateY(-5px) scale(1.01); }
  .shelf strong, .shelf span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .shelf strong { margin-top: .6rem; font-size: .85rem; }
  .shelf span { margin-top: .15rem; color: rgba(255,255,255,.4); font-size: .73rem; }
  .episode-results { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .55rem; }
  .episode-results button { display: grid; grid-template-columns: 3.6rem minmax(0,1fr) 2.2rem; align-items: center; gap: .8rem; padding: .55rem; border-radius: 1.1rem; color: white; text-align: left; transition: background .18s ease; }
  .episode-results button:hover { background: rgba(255,255,255,.06); }
  .episode-results img { width: 3.6rem; aspect-ratio: 1; object-fit: cover; border-radius: .9rem; }
  .episode-results span { min-width: 0; display: grid; }
  .episode-results strong, .episode-results small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .episode-results small { color: rgba(255,255,255,.4); }
  .episode-results svg { width: 1rem; fill: currentColor; opacity: .35; }
  .loading-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 1rem; }
  .loading-grid div { aspect-ratio: 1; border-radius: 1.4rem; background: #1c1c1c; animation: breathe 1.5s ease infinite; }
  .empty { min-height: 18rem; display: grid; place-content: center; justify-items: center; text-align: center; }
  .empty h2 { margin: 0; font-size: 1.8rem; letter-spacing: -.04em; }
  .empty p { color: rgba(255,255,255,.42); }
  @keyframes breathe { 50% { background: #222; } }
  @media (max-width: 1120px) { .songs > div, .episode-results { grid-template-columns: 1fr; } }
  @media (max-width: 760px) { .search-page { padding: 1.5rem; } .song-row { grid-template-columns: 1.7rem 3.5rem minmax(0,1fr) auto; } .song-row > small { display: none; } }
</style>
