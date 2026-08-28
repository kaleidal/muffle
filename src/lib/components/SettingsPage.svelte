<script lang="ts">
  import { onMount } from 'svelte'
  import { native, type PlaybackAvailability } from '../native'

  type Settings = {
    deviceName: string
    bitrate: number
    normalisation: boolean
    autoplay: boolean
    gapless: boolean
    audioBackend: string | null
    audioDevice: string | null
    audioCache: boolean
    audioCacheMb: number
    accentFromArt: boolean
    keepPlayingInBackground: boolean
    webClientId: string | null
  }

  let settings = $state<Settings | null>(null)
  let playback = $state<PlaybackAvailability>({ state: 'unavailable' })
  let saving = $state(false)
  let saved = $state(false)
  let error = $state<string | null>(null)

  onMount(() => {
    const stop = native.onPlaybackStatus((state) => (playback = state))
    void Promise.all([native.getSettings<Settings>(), native.playbackStatus()]).then(([next, status]) => {
      settings = next
      playback = status.availability
    }).catch((cause) => (error = String((cause as Error)?.message || cause)))
    return stop
  })

  function toggle(key: 'normalisation' | 'autoplay' | 'gapless' | 'audioCache' | 'accentFromArt' | 'keepPlayingInBackground') {
    if (settings) settings[key] = !settings[key]
  }

  async function save() {
    if (!settings) return
    saving = true
    saved = false
    error = null
    try {
      await native.updateSettings(settings)
      saved = true
      window.setTimeout(() => (saved = false), 1800)
    } catch (cause) {
      error = String((cause as Error)?.message || cause)
    } finally {
      saving = false
    }
  }

  async function authorize() {
    error = null
    try {
      await native.authorizePlayback()
    } catch (cause) {
      error = String((cause as Error)?.message || cause)
    }
  }
</script>

<section class="settings-page">
  <header><h1>Make Muffle yours</h1></header>
  {#if !settings}
    <div class="loading"><span></span><span></span><span></span></div>
  {:else}
    <div class="settings-scroll scrollbar-hide">
      <section class="account section-block">
        <div><h2>Spotify connection</h2><p>Your library grant and local playback are separate, and both stay on this computer.</p></div>
        <div class="connection">
          <span class:ready={playback.state === 'ready'}></span>
          <div><strong>{playback.state === 'ready' ? 'Playing here is ready' : playback.state === 'connecting' ? 'Connecting this computer' : playback.state === 'authorizing' ? 'Waiting for Spotify' : 'Local playback is off'}</strong><small>{playback.state === 'ready' ? 'Muffle appears in Spotify Connect.' : 'Browsing and controlling other devices still work.'}</small></div>
          {#if playback.state !== 'ready'}<button onclick={authorize}>Enable playback here</button>{/if}
        </div>
      </section>

      <section class="section-block">
        <div class="section-title"><h2>Sound</h2><p>Changes restart Muffle's local Connect player.</p></div>
        <div class="setting-row">
          <div><strong>Streaming quality</strong><small>Spotify Premium supports up to 320 kbps.</small></div>
          <div class="segments" aria-label="Streaming quality">
            {#each [96, 160, 320] as bitrate (bitrate)}
              <button class:active={settings.bitrate === bitrate} onclick={() => settings && (settings.bitrate = bitrate)}>{bitrate}</button>
            {/each}
          </div>
        </div>
        <button class="setting-row toggle-row" onclick={() => toggle('normalisation')}>
          <span><strong>Volume normalisation</strong><small>Keep loudness steadier between releases.</small></span><span class="toggle" class:on={settings.normalisation}><i></i></span>
        </button>
        <button class="setting-row toggle-row" onclick={() => toggle('gapless')}>
          <span><strong>Gapless playback</strong><small>Let albums and mixes flow without silence.</small></span><span class="toggle" class:on={settings.gapless}><i></i></span>
        </button>
        <button class="setting-row toggle-row" onclick={() => toggle('autoplay')}>
          <span><strong>Autoplay</strong><small>Keep going with related music when the queue ends.</small></span><span class="toggle" class:on={settings.autoplay}><i></i></span>
        </button>
      </section>

      <section class="section-block">
        <div class="section-title"><h2>Storage and appearance</h2></div>
        <button class="setting-row toggle-row" onclick={() => toggle('audioCache')}>
          <span><strong>Audio cache</strong><small>Reuse recently streamed audio and reduce network traffic.</small></span><span class="toggle" class:on={settings.audioCache}><i></i></span>
        </button>
        {#if settings.audioCache}
          <div class="setting-row">
            <div><strong>Cache budget</strong><small>{settings.audioCacheMb} MB on disk</small></div>
            <div class="segments">
              {#each [256, 512, 1024, 2048] as size (size)}
                <button class:active={settings.audioCacheMb === size} onclick={() => settings && (settings.audioCacheMb = size)}>{size >= 1024 ? `${size / 1024} GB` : `${size} MB`}</button>
              {/each}
            </div>
          </div>
        {/if}
        <button class="setting-row toggle-row" onclick={() => toggle('accentFromArt')}>
          <span><strong>Colour from album art</strong><small>Tint the player with the current release.</small></span><span class="toggle" class:on={settings.accentFromArt}><i></i></span>
        </button>
        <button class="setting-row toggle-row" onclick={() => toggle('keepPlayingInBackground')}>
          <span><strong>Keep playing after close</strong><small>Leave Muffle in the tray while music continues. Applies after restarting Muffle.</small></span><span class="toggle" class:on={settings.keepPlayingInBackground}><i></i></span>
        </button>
      </section>

      <section class="section-block advanced">
        <div class="section-title"><h2>Connection details</h2><p>Use your own Spotify developer app if the shared grant is busy.</p></div>
        <label><span>Spotify client ID</span><input bind:value={settings.webClientId} placeholder="Use Muffle's shared client" /></label>
        <label><span>Connect device name</span><input bind:value={settings.deviceName} placeholder="Muffle" /></label>
        <label><span>Audio backend</span><input bind:value={settings.audioBackend} placeholder="Choose automatically" /></label>
        <label><span>Output device</span><input bind:value={settings.audioDevice} placeholder="System default" /></label>
      </section>

      <section class="section-block shortcuts">
        <div class="section-title"><h2>Keyboard</h2><p>Playback stays within reach while you browse.</p></div>
        <div class="shortcut-grid">
          {#each [['Space','Play or pause'], ['Shift + ← / →','Seek ten seconds'], ['Ctrl + ← / →','Previous or next'], ['Ctrl + ↑ / ↓','Volume'], ['M','Mute'], ['S','Shuffle'], ['R','Repeat'], ['Q','Queue'], ['L','Lyrics'], ['Ctrl + F or /','Search'], ['Alt + ← / →','Back or forward'], ['Ctrl + L','Liked Songs']] as shortcut (shortcut[0])}
            <div><kbd>{shortcut[0]}</kbd><span>{shortcut[1]}</span></div>
          {/each}
        </div>
      </section>
    </div>

    <footer>
      {#if error}<p>{error}</p>{:else if saved}<p class="saved">Saved</p>{/if}
      <button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Apply changes'}</button>
    </footer>
  {/if}
</section>

<style>
  .settings-page { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; padding: 2rem 2.35rem 1.5rem; border-radius: 2.5rem; background: #121212; color: white; }
  h1 { margin: 0 0 1.5rem; font-size: clamp(2.5rem,4.5vw,4.3rem); line-height: .95; letter-spacing: -.06em; }
  .settings-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 .2rem 2rem 0; }
  .section-block { padding: 1.5rem; border-radius: 1.8rem; background: #191919; }
  .section-block + .section-block { margin-top: .85rem; }
  h2 { margin: 0; font-size: 1.15rem; letter-spacing: -.025em; }
  .section-title { margin-bottom: .7rem; }
  .section-title p, .account > div:first-child p { margin: .3rem 0 0; color: rgba(255,255,255,.4); font-size: .8rem; }
  .account { display: grid; grid-template-columns: minmax(0,.8fr) minmax(24rem,1.2fr); gap: 2rem; align-items: center; }
  .connection { display: grid; grid-template-columns: .65rem minmax(0,1fr) auto; align-items: center; gap: .8rem; padding: .85rem; border-radius: 1.2rem; background: #222; }
  .connection > span { width: .65rem; aspect-ratio: 1; border-radius: 50%; background: #6b6b6b; }
  .connection > span.ready { background: #20bd61; box-shadow: 0 0 0 .3rem rgba(32,189,97,.1); }
  .connection div, .setting-row > div, .toggle-row > span:first-child { display: grid; min-width: 0; }
  .connection small, .setting-row small { margin-top: .16rem; color: rgba(255,255,255,.4); font-size: .74rem; }
  .connection button { padding: .62rem .8rem; border-radius: 999px; background: white; color: #090909; font-size: .76rem; font-weight: 750; }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 2rem; width: 100%; padding: .9rem 0; color: white; text-align: left; }
  .setting-row + .setting-row { border-top: 1px solid rgba(255,255,255,.055); }
  .toggle-row:hover strong { color: white; }
  .segments { display: flex; gap: .35rem; padding: .25rem; border-radius: 999px; background: #222; }
  .segments button { padding: .48rem .7rem; border-radius: 999px; background: transparent; color: rgba(255,255,255,.45); font-size: .73rem; font-weight: 700; transition: background .18s ease, color .18s ease; }
  .segments button.active { background: #efefef; color: #090909; }
  .toggle { position: relative; width: 2.8rem; height: 1.6rem; flex: none; border-radius: 999px; background: #303030; transition: background .22s ease; }
  .toggle i { position: absolute; width: 1.2rem; aspect-ratio: 1; top: .2rem; left: .22rem; border-radius: 50%; background: #aaa; transition: transform .24s cubic-bezier(.2,.8,.2,1), background .2s ease; }
  .toggle.on { background: #e8e8e8; }
  .toggle.on i { background: #111; transform: translateX(1.15rem); }
  .advanced { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .8rem 1rem; }
  .advanced .section-title { grid-column: 1 / -1; }
  .shortcut-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: .55rem; }
  .shortcut-grid div { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .65rem .7rem; border-radius: .85rem; background: #202020; color: rgba(255,255,255,.48); font-size: .72rem; }
  kbd { color: white; font: 650 .7rem/1.2 inherit; }
  label { display: grid; gap: .45rem; color: rgba(255,255,255,.5); font-size: .76rem; font-weight: 650; }
  label input { width: 100%; padding: .8rem .9rem; border: 0; outline: 0; border-radius: 1rem; background: #222; color: white; font: inherit; transition: box-shadow .2s ease, background .2s ease; }
  label input:focus { background: #272727; box-shadow: 0 0 0 2px rgba(255,255,255,.14); }
  label input::placeholder { color: rgba(255,255,255,.25); }
  footer { display: flex; justify-content: flex-end; align-items: center; gap: 1rem; min-height: 3.4rem; padding-top: .8rem; }
  footer p { margin: 0; color: #ef7777; font-size: .78rem; }
  footer p.saved { color: #67d890; }
  footer button { padding: .76rem 1rem; border-radius: 999px; background: white; color: #090909; font-weight: 750; transition: transform .2s ease; }
  footer button:hover { transform: scale(1.025); }
  footer button:disabled { opacity: .55; }
  .loading { display: grid; gap: .8rem; }
  .loading span { display: block; height: 8rem; border-radius: 1.8rem; background: #191919; }
  @media (max-width: 850px) { .settings-page { padding: 1.5rem; } .account, .advanced { grid-template-columns: 1fr; } .advanced .section-title { grid-column: auto; } .setting-row { align-items: flex-start; flex-direction: column; gap: .7rem; } .toggle-row { flex-direction: row; align-items: center; } .segments { max-width: 100%; overflow-x: auto; } .shortcut-grid { grid-template-columns: 1fr 1fr; } }
</style>
