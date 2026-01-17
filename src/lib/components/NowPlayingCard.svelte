<script lang="ts">
    import { get } from "svelte/store";
    import { playerStore } from "../stores/playerStore";
    import { spotifyStore, type SpotifyDevice } from "../stores/spotify";
    import { navigationStore } from "../stores/navigationStore";
    import AddToPlaylistModal from "./AddToPlaylistModal.svelte";

    let seeking = false;
    let seekValue = 0;
    let seekEl: HTMLInputElement | null = null;

    let showDevices = false;
    let devices: SpotifyDevice[] = [];
    let loadingDevices = false;

    let volumeChanging = false;
    let volumeValue = 0;
    let volumeEl: HTMLInputElement | null = null;

    let addOpen = false;
    let addTrack: {
        id: string;
        uri: string;
        name: string;
        artist: string;
        albumArt: string;
    } | null = null;

    $: librespotBlocking =
        $spotifyStore.librespot.available &&
        $spotifyStore.librespot.status === "starting";

    $: if (!seeking) seekValue = $playerStore.progress;
    $: if (!volumeChanging) volumeValue = $playerStore.volume;

    async function togglePlayback() {
        try {
            if (librespotBlocking) return;
            if ($playerStore.isPlaying) await spotifyStore.pause();
            else await spotifyStore.play();
        } catch (e) {
            console.error("Playback toggle failed:", e);
        }
    }

    async function skipNext() {
        try {
            if (librespotBlocking) return;
            await spotifyStore.next();
        } catch (e) {
            console.error("Skip next failed:", e);
        }
    }

    async function skipPrev() {
        try {
            if (librespotBlocking) return;
            await spotifyStore.previous();
        } catch (e) {
            console.error("Skip prev failed:", e);
        }
    }

    async function commitSeek() {
        seeking = false;
        try {
            if (librespotBlocking) return;
            await spotifyStore.seekToPercent(seekValue);
        } catch (e) {
            console.error("Seek failed:", e);
        }
    }

    async function commitVolume() {
        volumeChanging = false;
        try {
            if (librespotBlocking) return;
            await spotifyStore.setVolumePercent(volumeValue);
        } catch (e) {
            console.error("Volume set failed:", e);
        }
    }

    function beginSeek() {
        seeking = true;
    }

    async function endSeek(e: Event) {
        if (!seeking) return;
        await commitSeek();
    }

    async function toggleDevices() {
        showDevices = !showDevices;
        if (!showDevices) return;

        loadingDevices = true;
        try {
            await spotifyStore.ensureLibrespotReady().catch(() => {});
            devices = await spotifyStore.getDevices();
        } catch (e) {
            console.error("Get devices failed:", e);
            devices = [];
        } finally {
            loadingDevices = false;
        }
    }

    async function transfer(device: SpotifyDevice) {
        if (!device.id) return;
        try {
            await spotifyStore.transferToDevice(device.id, false);
            showDevices = false;
        } catch (e) {
            console.error("Transfer failed:", e);
        }
    }

    async function toggleShuffle() {
        try {
            if (librespotBlocking) return;
            const next = !get(playerStore).shuffle;
            await spotifyStore.setShuffle(next);
        } catch (e) {
            console.error("Shuffle toggle failed:", e);
        }
    }

    function openAddForCurrent(e?: MouseEvent) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const t = $playerStore.currentTrack;
        if (!t) return;
        addTrack = {
            id: t.id,
            uri: t.uri,
            name: t.name,
            artist: t.artist,
            albumArt: t.albumArt,
        };
        addOpen = true;
    }

    function toggleLyrics() {
        showDevices = false;
        navigationStore.toggleLyrics();
    }

    $: if (seekEl) {
        // Always set (including 0), otherwise the gradient can stick at the previous track's value.
        seekEl.style.setProperty(
            "--seek-percent",
            `${Math.max(0, Math.min(100, seekValue))}%`,
        );
    }

    $: if (volumeEl) {
        volumeEl.style.setProperty(
            "--seek-percent",
            `${Math.max(0, Math.min(100, volumeValue))}%`,
        );
    }
</script>

<div
    class={`bg-[#141414] rounded-[40px] px-8 py-6 flex flex-col gap-4 h-full relative overflow-visible transition-[padding] duration-300 ${$playerStore.expanded ? "justify-start" : "justify-center"} ${$playerStore.isTransitioning ? "reverb" : ""}`}
>
    {#if $playerStore.currentTrack}
        {#if $playerStore.expanded}
            <div class="w-full flex flex-col gap-3">
                <div class="w-full flex items-start gap-5">
                    <div
                        class={`relative shrink-0 shadow-xl transition-all duration-300 ease-out overflow-visible ${
                            $playerStore.expanded
                                ? "w-56 h-56 rounded-3xl"
                                : "w-20 h-20 rounded-2xl"
                        }`}
                    >
                        <img
                            data-nowplaying-cover
                            src={$playerStore.currentTrack.albumArt}
                            alt={$playerStore.currentTrack.album}
                            class={`absolute inset-0 w-full h-full object-cover ${$playerStore.expanded ? "rounded-3xl" : "rounded-2xl"}`}
                        />

                        <button
                            class={`absolute -right-2 -bottom-2 w-11 h-11 rounded-full bg-(--accent-primary) flex items-center justify-center bouncy-btn shadow-lg transition-all duration-300 ease-out ${
                                $playerStore.expanded
                                    ? "opacity-0 scale-90 pointer-events-none"
                                    : "opacity-100 scale-100"
                            }`}
                            aria-label={$playerStore.isPlaying
                                ? "Pause"
                                : "Play"}
                            onclick={togglePlayback}
                        >
                            {#if $playerStore.isPlaying}
                                <svg
                                    class="w-6 h-6 text-black"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                </svg>
                            {:else}
                                <svg
                                    class="w-6 h-6 text-black ml-0.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            {/if}
                        </button>
                    </div>

                    <div
                        class={`min-w-0 flex-1 text-left ${$playerStore.expanded ? "pt-2" : ""}`}
                    >
                        <p
                            class="text-white/60 text-sm font-semibold tracking-wide truncate"
                        >
                            NOW PLAYING
                        </p>
                        <h3
                            class="text-white text-4xl font-extrabold tracking-tight leading-tight truncate"
                        >
                            {$playerStore.currentTrack.name}
                        </h3>
                        <p
                            class="text-white/60 text-base font-semibold truncate"
                        >
                            {$playerStore.currentTrack.artist}
                        </p>
                        <p
                            class="text-white/35 text-sm font-semibold truncate mt-1"
                        >
                            {$playerStore.currentTrack.album}
                        </p>
                        {#if librespotBlocking}
                            <p
                                class="text-white/45 text-sm font-semibold truncate mt-2"
                            >
                                Starting librespot…
                            </p>
                        {/if}
                    </div>
                </div>

                <div class="flex items-center w-full">
                    <input
                        bind:this={seekEl}
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        class="seek-slider w-full cursor-pointer outline-0 border-none bg-transparent"
                        bind:value={seekValue}
                        onpointerdown={beginSeek}
                        oninput={() => {
                            seeking = true;
                        }}
                        onpointerup={endSeek}
                        onchange={endSeek}
                        disabled={librespotBlocking}
                        aria-label="Seek"
                    />
                </div>

                <div class="flex items-center justify-between gap-4">
                    <div class="flex items-center gap-2">
                        <div class="relative">
                            <button
                                class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
                                aria-label="Devices"
                                onclick={toggleDevices}
                                disabled={librespotBlocking}
                            >
                                <svg
                                    class="w-4 h-4 text-white"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M4 6h16v10H4z" opacity="0.85" />
                                    <path d="M8 20h8v-2H8z" />
                                </svg>
                            </button>

                            {#if showDevices}
                                <div
                                    class="absolute left-0 bottom-11 w-56 bg-[#141414] rounded-3xl p-3 shadow-xl border border-white/10 z-30"
                                >
                                    <p
                                        class="text-white/60 text-xs font-semibold px-2 pb-2"
                                    >
                                        DEVICES
                                    </p>

                                    {#if loadingDevices}
                                        <div
                                            class="px-2 py-2 text-white/50 text-sm"
                                        >
                                            Loading…
                                        </div>
                                    {:else if devices.length === 0}
                                        <div
                                            class="px-2 py-2 text-white/50 text-sm"
                                        >
                                            No devices
                                        </div>
                                    {:else}
                                        <div class="flex flex-col">
                                            {#each devices as d (d.id)}
                                                <button
                                                    class="px-2 py-2 rounded-2xl hover:bg-white/10 text-left flex items-center justify-between"
                                                    onclick={() => transfer(d)}
                                                    disabled={!d.id}
                                                >
                                                    <div class="min-w-0">
                                                        <div
                                                            class="text-white text-sm font-semibold truncate"
                                                        >
                                                            {d.name}
                                                        </div>
                                                        <div
                                                            class="text-white/50 text-xs truncate"
                                                        >
                                                            {d.type}
                                                        </div>
                                                    </div>
                                                    {#if d.is_active}
                                                        <div
                                                            class="w-2 h-2 rounded-full bg-(--accent-primary)"
                                                        ></div>
                                                    {/if}
                                                </button>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>

                        <button
                            class={`h-9 w-9 rounded-full flex items-center justify-center bouncy-btn text-xs font-extrabold tracking-wide transition-colors ${$navigationStore.page === "lyrics" ? "bg-white/20 text-white" : "bg-white/10 hover:bg-white/20 text-white/90"}`}
                            aria-label="Lyrics"
                            onclick={toggleLyrics}
                            title="Lyrics"
                            disabled={librespotBlocking}
                        >
                            <svg
                                width="13"
                                height="13"
                                viewBox="0 0 19 23"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M7.1871 6.601L1.1931 14.791C1.05206 14.9837 0.984615 15.2204 1.00296 15.4585C1.0213 15.6966 1.12422 15.9202 1.2931 16.089L2.1101 16.907C2.28145 17.0782 2.50909 17.1813 2.75076 17.1973C2.99242 17.2133 3.23168 17.1411 3.4241 16.994L11.2771 11M12.6871 20.174C11.6871 19.5 10.5591 19 9.1871 19C7.1291 19 5.2591 21.356 3.1871 21C1.1151 20.644 0.412101 17.631 1.6871 16.5M17.1871 6C17.1871 8.76142 14.9485 11 12.1871 11C9.42568 11 7.1871 8.76142 7.1871 6C7.1871 3.23858 9.42568 1 12.1871 1C14.9485 1 17.1871 3.23858 17.1871 6Z"
                                    stroke="white"
                                    fill="white"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </button>

                        <button
                            class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center bouncy-btn"
                            onclick={toggleShuffle}
                            aria-label={$playerStore.shuffle
                                ? "Disable shuffle"
                                : "Enable shuffle"}
                            aria-pressed={$playerStore.shuffle}
                            title={$playerStore.shuffle
                                ? "Shuffle: on"
                                : "Shuffle: off"}
                            disabled={librespotBlocking}
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                class={`${$playerStore.shuffle ? "text-white" : "text-white/35"}`}
                            >
                                <path
                                    d="M18 14L22 18M22 18L18 22M22 18H15.959C15.3036 17.9933 14.6598 17.8257 14.0844 17.5118C13.509 17.1979 13.0195 16.7474 12.659 16.2L12.3 15.75M18 2L22 6M22 6L18 10M22 6L16.027 6C15.3805 5.99558 14.7426 6.14794 14.1679 6.44401C13.5931 6.74008 13.0987 7.17105 12.727 7.7L7.273 16.3C6.90127 16.829 6.40687 17.2599 5.83215 17.556C5.25742 17.8521 4.61949 18.0044 3.973 18H2M2 6H3.972C4.71746 5.99481 5.44954 6.19805 6.08564 6.58678C6.72174 6.9755 7.23655 7.53426 7.572 8.2"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </button>

                        <button
                            class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
                            aria-label="Add to playlist"
                            onclick={openAddForCurrent}
                            title="Add to playlist"
                            disabled={librespotBlocking}
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M8 12H16M12 8V16M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
                                    stroke="white"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </button>

                        <div class="w-28">
                            <input
                                bind:this={volumeEl}
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                class="volume-slider w-full cursor-pointer outline-0 border-none bg-transparent"
                                bind:value={volumeValue}
                                onpointerdown={() => {
                                    volumeChanging = true;
                                }}
                                oninput={() => {
                                    volumeChanging = true;
                                    playerStore.setVolume(volumeValue);
                                }}
                                onpointerup={commitVolume}
                                onchange={commitVolume}
                                disabled={librespotBlocking}
                                aria-label="Volume"
                            />
                        </div>
                    </div>

                    <div class="flex items-center gap-3">
                        <button
                            class="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
                            aria-label="Previous"
                            onclick={skipPrev}
                            disabled={librespotBlocking}
                        >
                            <svg
                                class="w-5 h-5 text-white"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M6 6h2v12H6z" />
                                <path d="M20 6v12l-10-6z" />
                            </svg>
                        </button>

                        <button
                            class="w-14 h-14 rounded-full bg-(--accent-primary) flex items-center justify-center bouncy-btn shadow-lg"
                            aria-label={$playerStore.isPlaying
                                ? "Pause"
                                : "Play"}
                            onclick={togglePlayback}
                            disabled={librespotBlocking}
                        >
                            {#if $playerStore.isPlaying}
                                <svg
                                    class="w-7 h-7 text-black"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                </svg>
                            {:else}
                                <svg
                                    class="w-7 h-7 text-black ml-0.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            {/if}
                        </button>

                        <button
                            class="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
                            aria-label="Next"
                            onclick={skipNext}
                            disabled={librespotBlocking}
                        >
                            <svg
                                class="w-5 h-5 text-white"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M16 6h2v12h-2z" />
                                <path d="M6 6v12l10-6z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        {:else}
            <div class="w-full flex items-start gap-5">
                <div
                    class={`relative shrink-0 shadow-xl transition-all duration-300 ease-out overflow-visible ${
                        $playerStore.expanded
                            ? "w-56 h-56 rounded-3xl"
                            : "w-20 h-20 rounded-2xl"
                    }`}
                >
                    <img
                        data-nowplaying-cover
                        src={$playerStore.currentTrack.albumArt}
                        alt={$playerStore.currentTrack.album}
                        class={`absolute inset-0 w-full h-full object-cover ${$playerStore.expanded ? "rounded-3xl" : "rounded-2xl"}`}
                    />

                    <button
                        class={`absolute -right-2 -bottom-2 w-11 h-11 rounded-full bg-(--accent-primary) flex items-center justify-center bouncy-btn shadow-lg transition-all duration-300 ease-out ${
                            $playerStore.expanded
                                ? "opacity-0 scale-90 pointer-events-none"
                                : "opacity-100 scale-100"
                        }`}
                        aria-label={$playerStore.isPlaying ? "Pause" : "Play"}
                        onclick={togglePlayback}
                    >
                        {#if $playerStore.isPlaying}
                            <svg
                                class="w-6 h-6 text-black"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                            </svg>
                        {:else}
                            <svg
                                class="w-6 h-6 text-black ml-0.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        {/if}
                    </button>
                </div>

                <div class="min-w-0 flex-1 flex flex-col gap-2 w-full">
                    <div class="min-w-0 text-left">
                        <p class="text-white/60 text-sm font-medium truncate">
                            {$playerStore.currentTrack.artist}
                        </p>
                    </div>

                    <div class="w-full flex items-center justify-between gap-4">
                        <div class="min-w-0">
                            <h3
                                class="text-white text-3xl font-extrabold tracking-tight truncate"
                            >
                                {$playerStore.currentTrack.name}
                            </h3>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <button
                                class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
                                aria-label="Add to playlist"
                                onclick={openAddForCurrent}
                                disabled={librespotBlocking}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M8 12H16M12 8V16M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
                                        stroke="white"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    />
                                </svg>
                            </button>

                            <button
                                class={`h-8 w-8 px-3 rounded-full flex items-center justify-center bouncy-btn text-xs font-extrabold tracking-wide transition-colors ${$navigationStore.page === "lyrics" ? "bg-white/20 text-white" : "bg-white/10 hover:bg-white/20 text-white/90"}`}
                                aria-label="Lyrics"
                                onclick={toggleLyrics}
                                title="Lyrics"
                                disabled={librespotBlocking}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 19 23"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M7.1871 6.601L1.1931 14.791C1.05206 14.9837 0.984615 15.2204 1.00296 15.4585C1.0213 15.6966 1.12422 15.9202 1.2931 16.089L2.1101 16.907C2.28145 17.0782 2.50909 17.1813 2.75076 17.1973C2.99242 17.2133 3.23168 17.1411 3.4241 16.994L11.2771 11M12.6871 20.174C11.6871 19.5 10.5591 19 9.1871 19C7.1291 19 5.2591 21.356 3.1871 21C1.1151 20.644 0.412101 17.631 1.6871 16.5M17.1871 6C17.1871 8.76142 14.9485 11 12.1871 11C9.42568 11 7.1871 8.76142 7.1871 6C7.1871 3.23858 9.42568 1 12.1871 1C14.9485 1 17.1871 3.23858 17.1871 6Z"
                                        stroke="white"
                                        fill="white"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    />
                                </svg>
                            </button>

                            <button
                                class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
                                aria-label="Previous"
                                onclick={skipPrev}
                                disabled={librespotBlocking}
                            >
                                <svg
                                    class="w-4 h-4 text-white"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M6 6h2v12H6z" />
                                    <path d="M20 6v12l-10-6z" />
                                </svg>
                            </button>

                            <button
                                class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center bouncy-btn"
                                aria-label="Next"
                                onclick={skipNext}
                                disabled={librespotBlocking}
                            >
                                <svg
                                    class="w-4 h-4 text-white"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M16 6h2v12h-2z" />
                                    <path d="M6 6v12l10-6z" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div class="flex items-center w-full">
                        <input
                            bind:this={seekEl}
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            class="seek-slider w-full cursor-pointer outline-0 border-none bg-transparent"
                            bind:value={seekValue}
                            onpointerdown={beginSeek}
                            oninput={() => {
                                seeking = true;
                            }}
                            disabled={librespotBlocking}
                            onpointerup={endSeek}
                            onchange={endSeek}
                            aria-label="Seek"
                        />
                    </div>

                    {#if librespotBlocking}
                        <p class="text-white/45 text-sm font-semibold truncate">
                            Starting librespot…
                        </p>
                    {/if}
                </div>
            </div>
        {/if}
    {:else}
        <div class="flex items-center gap-5">
            {#if $playerStore.isQueueLoading}
                <div
                    class="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center"
                >
                    <div
                        class="loading-spinner w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full"
                    ></div>
                </div>
                <div class="min-w-0">
                    <p class="text-white/60 text-sm font-medium">Loading</p>
                    <h3
                        class="text-white text-2xl font-extrabold tracking-tight"
                    >
                        Getting your music ready…
                    </h3>
                </div>
            {:else}
                <div
                    class="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center"
                >
                    <svg
                        class="w-8 h-8 text-white/30"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
                        />
                    </svg>
                </div>
                <div class="min-w-0">
                    <p class="text-white/60 text-sm font-medium">
                        Nothing playing
                    </p>
                    <h3
                        class="text-white text-2xl font-extrabold tracking-tight"
                    >
                        {librespotBlocking
                            ? "Starting librespot…"
                            : "Play something on Spotify"}
                    </h3>
                </div>
            {/if}
        </div>
    {/if}
</div>

<AddToPlaylistModal
    open={addOpen}
    track={addTrack}
    onClose={() => {
        addOpen = false;
        addTrack = null;
    }}
/>

<style>
    input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        display: block;
        background: transparent;
        padding: 0;
        margin: 0;
    }

    /* track so it’s transparent, we use background above */
    .seek-slider::-webkit-slider-runnable-track {
        -webkit-appearance: none;
        border-radius: 9999px;
        background: linear-gradient(
            to right,
            var(--accent-primary) 0%,
            var(--accent-primary) var(--seek-percent, 0%),
            rgba(255, 255, 255, 0.06) var(--seek-percent, 0%),
            rgba(255, 255, 255, 0.06) 100%
        );
        height: 6px;
    }

    .volume-slider::-webkit-slider-runnable-track {
        -webkit-appearance: none;
        border-radius: 9999px;
        background: linear-gradient(
            to right,
            rgba(255, 255, 255, 0.92) 0%,
            rgba(255, 255, 255, 0.92) var(--seek-percent, 0%),
            rgba(255, 255, 255, 0.06) var(--seek-percent, 0%),
            rgba(255, 255, 255, 0.06) 100%
        );
        height: 6px;
    }

    /* thumb */
    .seek-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 9999px;
        background: var(--accent-primary);
        margin-top: -4px;
    }

    .volume-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.92);
        margin-top: -4px;
    }

    input[type="range"]::-moz-range-track {
        height: 6px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.06);
    }

    .seek-slider::-moz-range-progress {
        height: 6px;
        border-radius: 9999px;
        background: var(--accent-primary);
    }

    .volume-slider::-moz-range-progress {
        height: 6px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.92);
    }

    .seek-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border: none;
        border-radius: 9999px;
        background: var(--accent-primary);
    }

    .volume-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border: none;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.92);
    }

    .loading-spinner {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
</style>
