<script lang="ts">
  import { onMount } from 'svelte'
  import { spotifyStore } from '../stores/spotify'
  import { image, loadHome, type HomeData, type HomeTrack } from '../stores/spotify/home'

  let data = $state.raw<HomeData | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let playingId = $state<string | null>(null)

  const firstName = $derived($spotifyStore.user?.display_name?.split(/\s+/)[0] || 'you')
  const hero = $derived(data?.recent[0] ?? data?.topTracks[0] ?? null)
  const quickPicks = $derived((data?.recent ?? []).slice(1, 7))

  onMount(() => {
    void refresh()
  })

  async function refresh() {
    if ($spotifyStore.status !== 'authenticated') return
    loading = true
    error = null
    try {
      data = await loadHome('native')
    } catch (cause) {
      error = String((cause as Error)?.message || cause)
    } finally {
      loading = false
    }
  }

  async function playTrack(track: HomeTrack) {
    playingId = track.id
    try {
      await spotifyStore.playTrackUri(track.uri)
    } finally {
      window.setTimeout(() => {
        if (playingId === track.id) playingId = null
      }, 500)
    }
  }

  function artistNames(track: HomeTrack) {
    return track.artists.map((artist) => artist.name).join(', ')
  }
</script>

<section class="home-stage h-full overflow-y-auto scrollbar-hide rounded-[40px] bg-[#101010]">
  {#if loading}
    <div class="home-skeleton" aria-label="Loading your music">
      <div class="skeleton hero-skeleton"></div>
      <div class="skeleton-row">
        {#each Array(6) as _, index (index)}
          <div class="skeleton pick-skeleton"></div>
        {/each}
      </div>
    </div>
  {:else if error}
    <div class="empty-state">
      <h1>Spotify went quiet for a moment</h1>
      <p>{error}</p>
      <button class="light-button" onclick={refresh}>Try again</button>
    </div>
  {:else if data}
    <div class="home-content">
      <header class="intro">
        <h1>{firstName}</h1>
      </header>

      {#if hero}
        <article class="hero" style:--hero-art={`url("${image(hero.album.images)}")`}>
          <div class="hero-copy">
            <span>Pick up where you left off</span>
            <h2>{hero.name}</h2>
            <p>{artistNames(hero)}</p>
            <button class="hero-play" onclick={() => playTrack(hero)} aria-label={`Play ${hero.name}`}>
              {#if playingId === hero.id}
                <span class="pulse-dot"></span>
              {:else}
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              {/if}
              Play now
            </button>
          </div>
          <div class="hero-artwork">
            {#each data.recent.slice(0, 3) as track, index (track.id)}
              <img
                src={image(track.album.images)}
                alt={track.album.name}
                style:--stack-index={index}
              />
            {/each}
          </div>
        </article>
      {/if}

      {#if quickPicks.length}
        <section class="quick-section">
          <div class="section-heading">
            <h2>Back in rotation</h2>
          </div>
          <div class="quick-grid">
            {#each quickPicks as track (track.id)}
              <button class="quick-pick" onclick={() => playTrack(track)}>
                <img src={image(track.album.images)} alt={track.album.name} />
                <span class="quick-copy">
                  <strong>{track.name}</strong>
                  <small>{artistNames(track)}</small>
                </span>
                <span class="quick-play" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <div class="editorial-grid">
        {#if data.topTracks.length}
          <section class="chart">
            <div class="section-heading">
              <h2>On repeat</h2>
            </div>
            <div class="track-list">
              {#each data.topTracks.slice(0, 7) as track, index (track.id)}
                <button class="track-row" onclick={() => playTrack(track)}>
                  <span class="rank">{String(index + 1).padStart(2, '0')}</span>
                  <img src={image(track.album.images)} alt={track.album.name} />
                  <span class="track-copy">
                    <strong>{track.name}</strong>
                    <small>{artistNames(track)}</small>
                  </span>
                  <span class="duration">{Math.floor(track.duration_ms / 60000)}:{String(Math.floor(track.duration_ms / 1000) % 60).padStart(2, '0')}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if data.topArtists.length}
          <section class="artist-field">
            <div class="section-heading">
              <h2>Your orbit</h2>
            </div>
            <div class="artist-cloud">
              {#each data.topArtists.slice(0, 9) as artist, index (artist.id)}
                <div class="artist" style:--artist-index={index}>
                  <img src={image(artist.images)} alt={artist.name} />
                  <span>{artist.name}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}
      </div>

      {#if data.recommendations.length}
        <section class="discovery">
          <div class="section-heading">
            <h2>A little left turn</h2>
          </div>
          <div class="discovery-flow">
            {#each data.recommendations.slice(0, 10) as track, index (track.id)}
              <button class:feature={index === 0 || index === 6} onclick={() => playTrack(track)}>
                <img src={image(track.album.images)} alt={track.album.name} />
                <span><strong>{track.name}</strong><small>{artistNames(track)}</small></span>
                <i aria-hidden="true">{String(index + 1).padStart(2, '0')}</i>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if data.albums.length}
        <section class="album-shelf">
          <div class="section-heading">
            <h2>Albums you kept</h2>
          </div>
          <div class="album-strip scrollbar-hide">
            {#each data.albums as album (album.id)}
              <button onclick={() => spotifyStore.playContextUri(album.uri)} class="album">
                <img src={image(album.images)} alt={album.name} />
                <strong>{album.name}</strong>
                <span>{album.artists.map((artist) => artist.name).join(', ')}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if data.shows.length}
        <section class="shows lower-section">
          <div class="section-heading">
            <h2>Saved for later</h2>
          </div>
          <div class="show-stack">
            {#each data.shows.slice(0, 5) as show (show.id)}
              <button onclick={() => spotifyStore.playContextUri(show.uri)}>
                <img src={image(show.images)} alt={show.name} />
                <span><strong>{show.name}</strong><small>{show.publisher || 'Podcast'}</small></span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</section>

<style>
  .home-stage { color: white; }
  .home-content { padding: 2rem 2.5rem 4rem; }
  .intro h1 { margin: 0 0 1.5rem; font-size: clamp(2.5rem, 5vw, 4.7rem); line-height: .95; letter-spacing: -.06em; }
  .hero { position: relative; min-height: 21rem; display: grid; grid-template-columns: minmax(0,1fr) minmax(18rem,.72fr); overflow: hidden; border-radius: 2.25rem; background: #162219; isolation: isolate; }
  .hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(12,20,14,.98) 5%, rgba(12,20,14,.77) 48%, rgba(12,20,14,.12)), var(--hero-art); background-position: center; background-size: cover; filter: saturate(.85); z-index: -2; }
  .hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg,rgba(8,12,9,.58),rgba(8,12,9,.12) 65%,transparent); z-index: -1; }
  .hero-copy { align-self: end; padding: 2.7rem; max-width: 36rem; }
  .hero-copy > span { color: rgba(255,255,255,.65); font-size: .86rem; font-weight: 650; }
  .hero h2 { margin: .35rem 0 .2rem; font-size: clamp(2.3rem,4.4vw,4.6rem); line-height: .94; letter-spacing: -.055em; text-wrap: balance; }
  .hero p { margin: 0 0 1.5rem; color: rgba(255,255,255,.68); font-weight: 550; }
  .hero-play, .light-button { display: inline-flex; align-items: center; gap: .55rem; padding: .8rem 1.1rem; border-radius: 999px; background: #f5f5f5; color: #080808; font-weight: 750; transition: transform .2s ease, background .2s ease; }
  .hero-play:hover, .light-button:hover { transform: scale(1.035); background: white; }
  .hero-play:active, .light-button:active { transform: scale(.97); }
  .hero-play svg { width: 1.15rem; fill: currentColor; }
  .pulse-dot { width: .7rem; height: .7rem; border-radius: 50%; background: #17b95a; animation: pulse 1s ease infinite; }
  .hero-artwork { position: relative; min-height: 21rem; }
  .hero-artwork img { position: absolute; width: 14.5rem; aspect-ratio: 1; object-fit: cover; border-radius: 2rem; right: calc(2rem + var(--stack-index) * 4.8rem); top: calc(3.2rem + var(--stack-index) * 1.25rem); transform: rotate(calc((var(--stack-index) - 1) * 7deg)); box-shadow: 0 1.8rem 4rem rgba(0,0,0,.44); }
  .section-heading { margin-bottom: 1.05rem; }
  .section-heading h2 { margin: 0; font-size: 1.35rem; letter-spacing: -.025em; }
  .quick-section, .editorial-grid, .discovery, .album-shelf, .lower-section { margin-top: 2.25rem; }
  .quick-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: .75rem; }
  .quick-pick { display: grid; grid-template-columns: 4.2rem minmax(0,1fr) 2.6rem; align-items: center; gap: .85rem; padding: .55rem .7rem .55rem .55rem; border-radius: 1.35rem; background: #191919; color: white; text-align: left; transition: transform .2s ease, background .2s ease; }
  .quick-pick:hover { transform: translateY(-2px); background: #222; }
  .quick-pick img { width: 4.2rem; aspect-ratio: 1; object-fit: cover; border-radius: 1rem; }
  .quick-copy { min-width: 0; display: grid; gap: .2rem; }
  .quick-copy strong, .quick-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .quick-copy strong { font-size: .91rem; }
  .quick-copy small { color: rgba(255,255,255,.46); }
  .quick-play { display: grid; place-items: center; width: 2.35rem; aspect-ratio: 1; border-radius: 50%; background: rgba(255,255,255,.1); opacity: .35; transition: opacity .2s ease, background .2s ease; }
  .quick-pick:hover .quick-play { opacity: 1; background: #f3f3f3; color: #090909; }
  .quick-play svg { width: 1rem; fill: currentColor; }
  .editorial-grid { display: grid; grid-template-columns: minmax(0,1.12fr) minmax(20rem,.88fr); gap: 1rem; }
  .chart, .artist-field, .shows { padding: 1.5rem; border-radius: 2rem; background: #171717; }
  .track-list { display: grid; }
  .track-row { display: grid; grid-template-columns: 2.2rem 3rem minmax(0,1fr) auto; align-items: center; gap: .75rem; padding: .6rem .4rem; border-radius: 1rem; color: white; text-align: left; transition: background .18s ease, transform .18s ease; }
  .track-row:hover { background: rgba(255,255,255,.07); transform: translateX(3px); }
  .rank, .duration { color: rgba(255,255,255,.33); font-size: .76rem; font-variant-numeric: tabular-nums; }
  .track-row img { width: 3rem; aspect-ratio: 1; object-fit: cover; border-radius: .8rem; }
  .track-copy { display: grid; min-width: 0; }
  .track-copy strong, .track-copy small { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .track-copy strong { font-size: .88rem; }
  .track-copy small { color: rgba(255,255,255,.42); font-size: .75rem; }
  .artist-field { overflow: hidden; background: #191716; }
  .artist-cloud { min-height: 26rem; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); align-content: space-around; gap: 1.2rem .5rem; }
  .artist { display: grid; justify-items: center; gap: .45rem; }
  .artist:nth-child(2), .artist:nth-child(5), .artist:nth-child(8) { transform: translateY(1.1rem); }
  .artist img { width: min(7.2rem,100%); aspect-ratio: 1; object-fit: cover; border-radius: 38%; box-shadow: 0 1rem 2.4rem rgba(0,0,0,.3); transition: transform .3s cubic-bezier(.2,.8,.2,1), border-radius .3s ease; }
  .artist:hover img { transform: translateY(-5px) rotate(-2deg); border-radius: 50%; }
  .artist span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .75rem; font-weight: 650; color: rgba(255,255,255,.72); }
  .discovery-flow { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); grid-auto-rows: 7rem; gap: .65rem; }
  .discovery-flow button { position: relative; grid-column: span 2; display: grid; grid-template-columns: 5.7rem minmax(0,1fr); align-items: end; gap: .85rem; overflow: hidden; padding: .65rem; border-radius: 1.4rem; background: #191919; color: white; text-align: left; }
  .discovery-flow button.feature { grid-column: span 3; grid-row: span 2; grid-template-columns: 9.5rem minmax(0,1fr); }
  .discovery-flow img { width: 5.7rem; aspect-ratio: 1; border-radius: 1rem; object-fit: cover; transition: transform .28s cubic-bezier(.2,.8,.2,1); }
  .discovery-flow .feature img { width: 9.5rem; }
  .discovery-flow button:hover img { transform: rotate(-2deg) scale(1.035); }
  .discovery-flow span { min-width: 0; display: grid; gap: .2rem; padding-bottom: .25rem; }
  .discovery-flow strong, .discovery-flow small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .discovery-flow small { color: rgba(255,255,255,.42); }
  .discovery-flow i { position: absolute; right: .7rem; top: .55rem; color: rgba(255,255,255,.18); font-size: .7rem; font-style: normal; font-variant-numeric: tabular-nums; }
  .album-strip { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(9rem, 12rem); gap: .9rem; overflow-x: auto; padding-bottom: .5rem; }
  .album { color: white; text-align: left; min-width: 0; }
  .album img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 1.55rem; transition: transform .28s cubic-bezier(.2,.8,.2,1); }
  .album:hover img { transform: translateY(-5px) scale(1.015); }
  .album strong, .album span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .album strong { margin-top: .65rem; font-size: .86rem; }
  .album span { margin-top: .15rem; color: rgba(255,255,255,.4); font-size: .75rem; }
  .show-stack { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .5rem; }
  .show-stack button { display: grid; grid-template-columns: 3.7rem minmax(0,1fr) 1.2rem; gap: .8rem; align-items: center; padding: .55rem; color: white; text-align: left; border-radius: 1rem; transition: background .2s ease; }
  .show-stack button:hover { background: rgba(255,255,255,.06); }
  .show-stack img { width: 3.7rem; aspect-ratio: 1; object-fit: cover; border-radius: 1rem; }
  .show-stack span { display: grid; min-width: 0; }
  .show-stack strong, .show-stack small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .show-stack small { color: rgba(255,255,255,.4); margin-top: .16rem; }
  .show-stack svg { width: 1.1rem; fill: none; stroke: rgba(255,255,255,.42); stroke-width: 2; }
  .home-skeleton { padding: 5rem 2.5rem; }
  .skeleton { background: #191919; animation: breathe 1.5s ease-in-out infinite; }
  .hero-skeleton { height: 21rem; border-radius: 2.25rem; }
  .skeleton-row { display: grid; grid-template-columns: repeat(3,1fr); gap: .75rem; margin-top: 2rem; }
  .pick-skeleton { height: 5rem; border-radius: 1.35rem; }
  .empty-state { min-height: 100%; display: grid; place-content: center; justify-items: start; padding: 3rem; }
  .empty-state h1 { margin: 0 0 .5rem; font-size: 2.5rem; letter-spacing: -.05em; }
  .empty-state p { max-width: 34rem; margin: 0 0 1.5rem; color: rgba(255,255,255,.5); }
  @keyframes breathe { 50% { background: #202020; } }
  @keyframes pulse { 50% { transform: scale(.65); opacity: .55; } }
  @media (max-width: 1120px) {
    .quick-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .editorial-grid { grid-template-columns: 1fr; }
    .discovery-flow { grid-template-columns: repeat(4,minmax(0,1fr)); }
    .discovery-flow button.feature { grid-column: span 4; }
    .artist-cloud { min-height: 22rem; }
  }
  @media (max-width: 820px) {
    .home-content { padding: 1.4rem 1.25rem 3rem; }
    .hero { grid-template-columns: 1fr; min-height: 19rem; }
    .hero-copy { padding: 2rem; }
    .hero-artwork { display: none; }
    .quick-grid { grid-template-columns: 1fr; }
    .section-heading { align-items: flex-start; flex-direction: column; gap: .25rem; }
    .show-stack { grid-template-columns: 1fr; }
    .discovery-flow { grid-template-columns: 1fr; grid-auto-rows: auto; }
    .discovery-flow button, .discovery-flow button.feature { grid-column: auto; grid-row: auto; grid-template-columns: 4.5rem minmax(0,1fr); }
    .discovery-flow img, .discovery-flow .feature img { width: 4.5rem; }
  }
</style>
