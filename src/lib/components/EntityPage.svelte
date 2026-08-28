<script lang="ts">
  import { onMount } from 'svelte'
  import { apiGet } from '../stores/spotify/api'
  import { image, type HomeAlbum, type HomeArtist, type HomeTrack } from '../stores/spotify/home'
  import { spotifyStore } from '../stores/spotify'
  import { navigationStore, type EntityType } from '../stores/navigationStore'

  type Episode = { id: string; name: string; uri: string; description?: string; duration_ms: number; images?: Array<{ url: string }> }
  type Show = { id: string; name: string; uri: string; publisher?: string; description?: string; images: Array<{ url: string }> }
  type Detail = {
    id: string
    name: string
    uri: string
    image: string
    subtitle: string
    description?: string
    tracks: HomeTrack[]
    albums: HomeAlbum[]
    related: HomeArtist[]
    episodes: Episode[]
  }

  let { type, id }: { type: EntityType; id: string } = $props()
  let detail = $state.raw<Detail | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)

  onMount(() => {
    void load()
  })

  async function load() {
    loading = true
    error = null
    try {
      detail = type === 'artist' ? await loadArtist(id) : type === 'album' ? await loadAlbum(id) : await loadShow(id)
    } catch (cause) {
      error = String((cause as Error)?.message || cause)
    } finally {
      loading = false
    }
  }

  async function loadArtist(artistId: string): Promise<Detail> {
    const [artist, tracks, albums, related] = await Promise.all([
      apiGet<HomeArtist & { followers?: { total?: number }; genres?: string[] }>('native', `/artists/${artistId}`),
      apiGet<{ tracks?: HomeTrack[] }>('native', `/artists/${artistId}/top-tracks`),
      apiGet<{ items?: HomeAlbum[] }>('native', `/artists/${artistId}/albums?include_groups=album,single,appears_on&limit=24`),
      apiGet<{ artists?: HomeArtist[] }>('native', `/artists/${artistId}/related-artists`),
    ])
    return {
      id: artist.id,
      name: artist.name,
      uri: artist.uri,
      image: image(artist.images),
      subtitle: artist.genres?.slice(0, 3).join(' · ') || `${(artist.followers?.total ?? 0).toLocaleString()} followers`,
      tracks: tracks.tracks ?? [],
      albums: albums.items ?? [],
      related: related.artists ?? [],
      episodes: [],
    }
  }

  async function loadAlbum(albumId: string): Promise<Detail> {
    const album = await apiGet<HomeAlbum & { tracks?: { items?: HomeTrack[] }; release_date?: string; total_tracks?: number }>('native', `/albums/${albumId}`)
    return {
      id: album.id,
      name: album.name,
      uri: album.uri,
      image: image(album.images),
      subtitle: `${album.artists.map((artist) => artist.name).join(', ')} · ${album.release_date?.slice(0, 4) || ''}`,
      tracks: (album.tracks?.items ?? []).map((track) => ({ ...track, album })),
      albums: [],
      related: [],
      episodes: [],
    }
  }

  async function loadShow(showId: string): Promise<Detail> {
    const [show, episodes] = await Promise.all([
      apiGet<Show>('native', `/shows/${showId}`),
      apiGet<{ items?: Episode[] }>('native', `/shows/${showId}/episodes?limit=50`),
    ])
    return {
      id: show.id,
      name: show.name,
      uri: show.uri,
      image: image(show.images),
      subtitle: show.publisher || 'Podcast',
      description: show.description,
      tracks: [],
      albums: [],
      related: [],
      episodes: episodes.items ?? [],
    }
  }

  function time(ms: number) {
    const minutes = Math.floor(ms / 60000)
    return minutes > 59 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`
  }
</script>

<section class="entity-page">
  {#if loading}
    <div class="loading"><div></div><span></span><span></span></div>
  {:else if error || !detail}
    <div class="empty"><h1>Couldn't open this page</h1><p>{error}</p><button onclick={() => navigationStore.goHome()}>Back home</button></div>
  {:else}
    <header style:--art={`url("${detail.image}")`}>
      <button class="back" onclick={() => navigationStore.goHome()} aria-label="Go home">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <img src={detail.image} alt={detail.name} class:artist-art={type === 'artist'} />
      <div class="header-copy">
        <h1>{detail.name}</h1>
        <p>{detail.subtitle}</p>
        <button class="play" onclick={() => spotifyStore.playContextUri(detail!.uri)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
          Play
        </button>
      </div>
    </header>

    <div class="body scrollbar-hide">
      {#if detail.description}
        <p class="description">{detail.description}</p>
      {/if}

      {#if detail.tracks.length}
        <section>
          <h2>{type === 'artist' ? 'Popular' : 'Tracks'}</h2>
          <div class="tracks">
            {#each detail.tracks as track, index (track.id)}
              <button onclick={() => spotifyStore.playTrackUri(track.uri)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {#if type === 'artist'}<img src={image(track.album.images)} alt={track.album.name} />{/if}
                <strong>{track.name}</strong>
                <small>{track.artists.map((artist) => artist.name).join(', ')}</small>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if detail.episodes.length}
        <section>
          <h2>Episodes</h2>
          <div class="episodes">
            {#each detail.episodes as episode (episode.id)}
              <article>
                <img src={image(episode.images, detail.image)} alt={episode.name} />
                <div><h3>{episode.name}</h3><p>{episode.description}</p><span>{time(episode.duration_ms)}</span></div>
                <button onclick={() => spotifyStore.playTrackUri(episode.uri)} aria-label={`Play ${episode.name}`}><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
              </article>
            {/each}
          </div>
        </section>
      {/if}

      {#if detail.albums.length}
        <section>
          <h2>Discography</h2>
          <div class="shelf">
            {#each detail.albums as album (album.id)}
              <button onclick={() => navigationStore.openEntity('album', album.id)}><img src={image(album.images)} alt={album.name}/><strong>{album.name}</strong><span>{album.artists.map((artist) => artist.name).join(', ')}</span></button>
            {/each}
          </div>
        </section>
      {/if}

      {#if detail.related.length}
        <section>
          <h2>Related artists</h2>
          <div class="shelf artists">
            {#each detail.related as artist (artist.id)}
              <button onclick={() => navigationStore.openEntity('artist', artist.id)}><img src={image(artist.images)} alt={artist.name}/><strong>{artist.name}</strong><span>Artist</span></button>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</section>

<style>
  .entity-page { position: absolute; inset: 0; overflow: hidden; border-radius: 2.5rem; background: #111; color: white; }
  header { position: relative; min-height: 20rem; display: grid; grid-template-columns: 12rem minmax(0,1fr); align-items: end; gap: 1.6rem; padding: 4rem 2.4rem 2rem; overflow: hidden; isolation: isolate; }
  header::before { content: ''; position: absolute; inset: 0; z-index: -2; background: linear-gradient(90deg,rgba(10,10,10,.85),rgba(10,10,10,.35)), var(--art) center/cover; filter: blur(34px) saturate(.72); transform: scale(1.15); }
  header::after { content: ''; position: absolute; inset: 35% 0 0; z-index: -1; background: linear-gradient(transparent,#111); }
  header > img { width: 12rem; aspect-ratio: 1; object-fit: cover; border-radius: 1.8rem; box-shadow: 0 1.5rem 4rem rgba(0,0,0,.42); }
  header > img.artist-art { border-radius: 42%; }
  .back { position: absolute; top: 1.4rem; left: 1.5rem; display: grid; place-items: center; width: 2.5rem; aspect-ratio: 1; border-radius: 50%; background: rgba(8,8,8,.56); color: white; backdrop-filter: blur(12px); }
  .back svg { width: 1.25rem; fill: none; stroke: currentColor; stroke-width: 2; }
  h1 { margin: .3rem 0 .35rem; font-size: clamp(2.5rem,5vw,5rem); line-height: .93; letter-spacing: -.06em; text-wrap: balance; }
  .header-copy p { margin: 0 0 1.2rem; color: rgba(255,255,255,.58); }
  .play, .empty button { display: inline-flex; align-items: center; gap: .45rem; padding: .72rem 1rem; border-radius: 999px; background: white; color: #080808; font-weight: 750; transition: transform .2s ease; }
  .play:hover { transform: scale(1.04); }
  .play svg { width: 1rem; fill: currentColor; }
  .body { position: absolute; inset: 20rem 0 0; overflow-y: auto; padding: 1.5rem 2.4rem 3rem; }
  section section { margin-top: 2rem; }
  section h2 { margin: 0 0 1rem; font-size: 1.3rem; letter-spacing: -.025em; }
  .description { max-width: 65ch; color: rgba(255,255,255,.55); line-height: 1.55; }
  .tracks { display: grid; }
  .tracks button { display: grid; grid-template-columns: 2rem auto minmax(10rem,1fr) minmax(8rem,.5fr); align-items: center; gap: .8rem; padding: .55rem .7rem; border-radius: 1rem; color: white; text-align: left; transition: background .18s ease, transform .18s ease; }
  .tracks button:hover { background: rgba(255,255,255,.06); transform: translateX(3px); }
  .tracks img { width: 3rem; aspect-ratio: 1; object-fit: cover; border-radius: .8rem; }
  .tracks span, .tracks small { color: rgba(255,255,255,.4); font-size: .76rem; }
  .tracks strong, .tracks small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .episodes { display: grid; gap: .6rem; }
  .episodes article { display: grid; grid-template-columns: 5rem minmax(0,1fr) 2.7rem; align-items: center; gap: 1rem; padding: .7rem; border-radius: 1.3rem; background: #181818; }
  .episodes img { width: 5rem; aspect-ratio: 1; object-fit: cover; border-radius: 1rem; }
  .episodes h3 { margin: 0; font-size: .92rem; }
  .episodes p { margin: .25rem 0; color: rgba(255,255,255,.4); font-size: .76rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .episodes span { color: rgba(255,255,255,.35); font-size: .72rem; }
  .episodes button { display: grid; place-items: center; width: 2.7rem; aspect-ratio: 1; border-radius: 50%; background: rgba(255,255,255,.1); color: white; }
  .episodes button:hover { background: white; color: #080808; }
  .episodes svg { width: 1rem; fill: currentColor; }
  .shelf { display: grid; grid-auto-flow: column; grid-auto-columns: 10rem; gap: .9rem; overflow-x: auto; padding-bottom: .7rem; }
  .shelf button { color: white; text-align: left; min-width: 0; }
  .shelf img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 1.4rem; transition: transform .25s ease; }
  .shelf.artists img { border-radius: 44%; }
  .shelf button:hover img { transform: translateY(-4px); }
  .shelf strong, .shelf span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .shelf strong { margin-top: .55rem; font-size: .84rem; }
  .shelf span { margin-top: .15rem; color: rgba(255,255,255,.4); font-size: .73rem; }
  .loading { height: 100%; display: grid; place-content: center; gap: .7rem; }
  .loading div { width: 9rem; aspect-ratio: 1; border-radius: 2rem; background: #1b1b1b; }
  .loading span { width: 14rem; height: 1rem; border-radius: 1rem; background: #1b1b1b; }
  .empty { height: 100%; display: grid; place-content: center; justify-items: start; }
  .empty h1 { margin: 0; }
  .empty p { color: rgba(255,255,255,.45); }
  @media (max-width: 760px) { header { grid-template-columns: 7rem minmax(0,1fr); min-height: 17rem; padding-inline: 1.5rem; } header > img { width: 7rem; } .body { inset-block-start: 17rem; padding-inline: 1.5rem; } .tracks button { grid-template-columns: 2rem minmax(0,1fr); } .tracks img, .tracks small { display: none; } }
</style>
