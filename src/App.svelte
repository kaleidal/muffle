<script lang="ts">
    import Sidebar from "./lib/components/Sidebar.svelte";
    import TitleBar from "./lib/components/TitleBar.svelte";
    import LoginScreen from "./lib/components/LoginScreen.svelte";
    import { playerStore } from "./lib/stores/playerStore";
    import { spotifyStore } from "./lib/stores/spotify";
    import { navigationStore } from "./lib/stores/navigationStore";
    import MadeForYou from "./lib/components/MadeForYou.svelte";
    import SearchBar from "./lib/components/SearchBar.svelte";
    import NextUpPeek from "./lib/components/NextUpPeek.svelte";
    import NowPlayingCard from "./lib/components/NowPlayingCard.svelte";
    import RightPanel from "./lib/components/RightPanel.svelte";
    import PlaylistPage from "./lib/components/PlaylistPage.svelte";
    import SearchPage from "./lib/components/SearchPage.svelte";
    import LyricsPage from "./lib/components/LyricsPage.svelte";

    try {
        spotifyStore.init();
    } catch (error) {
        console.error("Failed to initialize Spotify store:", error);
    }
</script>

<div class="app-shell h-screen bg-(--bg-primary)">
    <div class="app-container h-full flex flex-col">
        <TitleBar />

        <div class="flex-1 min-h-0 p-8 pt-4 overflow-visible">
            {#if $spotifyStore.status !== "authenticated"}
                <LoginScreen />
            {:else}
                <div
                    class="h-full min-h-0 w-full flex flex-col gap-6 overflow-visible"
                >
                    <div
                        class="flex flex-row gap-4 flex-1 min-h-0 overflow-visible"
                    >
                        <Sidebar />
                        <div
                            class="flex-1 min-w-0 min-h-0 overflow-visible flex flex-col gap-4"
                        >
                            <div class="shrink-0">
                                <div class="flex items-center gap-3">
                                    <button
                                        class="group w-14 h-14 rounded-full bg-[#141414] hover:bg-white/10 transition-colors flex items-center justify-center bouncy-btn shrink-0"
                                        aria-label="Home"
                                        title="Home"
                                        onclick={() => navigationStore.goHome()}
                                    >
                                        <svg
                                            width="24"
                                            height="24"
                                            viewBox="0 0 20 21"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="transition-colors {$navigationStore.page ===
                                            'home'
                                                ? 'text-white'
                                                : 'text-white/50 group-hover:text-white'}"
                                        >
                                            <path
                                                d="M13 20.0005V12.0005C13 11.7353 12.8946 11.4809 12.7071 11.2934C12.5196 11.1058 12.2652 11.0005 12 11.0005H8C7.73478 11.0005 7.48043 11.1058 7.29289 11.2934C7.10536 11.4809 7 11.7353 7 12.0005V20.0005M1 9.00048C0.99993 8.70955 1.06333 8.4221 1.18579 8.1582C1.30824 7.89429 1.4868 7.66028 1.709 7.47248L8.709 1.47248C9.06999 1.16739 9.52736 1 10 1C10.4726 1 10.93 1.16739 11.291 1.47248L18.291 7.47248C18.5132 7.66028 18.6918 7.89429 18.8142 8.1582C18.9367 8.4221 19.0001 8.70955 19 9.00048V18.0005C19 18.5309 18.7893 19.0396 18.4142 19.4147C18.0391 19.7898 17.5304 20.0005 17 20.0005H3C2.46957 20.0005 1.96086 19.7898 1.58579 19.4147C1.21071 19.0396 1 18.5309 1 18.0005V9.00048Z"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            />
                                        </svg>
                                    </button>

                                    <div class="flex-1 min-w-0">
                                        <SearchBar />
                                    </div>
                                </div>
                            </div>
                            <div
                                class="flex-1 min-h-0 overflow-visible relative"
                            >
                                {#if $navigationStore.page === "home"}
                                    <MadeForYou />
                                {:else if $navigationStore.page === "lyrics"}
                                    <LyricsPage />
                                {:else if $navigationStore.page === "playlist" && $navigationStore.playlistId}
                                    <PlaylistPage
                                        playlistId={$navigationStore.playlistId}
                                    />
                                {:else if $navigationStore.page === "search"}
                                    <SearchPage
                                        query={$navigationStore.searchQuery}
                                    />
                                {:else}
                                    <MadeForYou />
                                {/if}
                            </div>
                        </div>
                    </div>

                    <div
                        class={`flex flex-row w-full gap-4 shrink-0 items-stretch overflow-visible transition-[height] duration-300 ease-out ${$playerStore.expanded ? "h-90" : "h-37.5"}`}
                    >
                        {#if $playerStore.peekLatched || $playerStore.showNextPreview || $playerStore.isTransitioning}
                            <div class="shrink-0 flex items-center relative">
                                <NextUpPeek />
                            </div>
                        {/if}

                        <div class="flex-1 min-w-0">
                            <NowPlayingCard />
                        </div>

                        <div class="flex-1 min-w-0">
                            <RightPanel />
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .app-shell {
        border-radius: 24px;
        overflow: hidden;
    }

    .app-container {
        overflow: visible;
    }
</style>
