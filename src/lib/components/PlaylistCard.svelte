<script lang="ts">
    export let mix: { id: string; name: string; image?: string; type?: string };
    export let size: "sm" | "lg" = "sm";
    export let onSelect: (() => Promise<void> | void) | null = null;
    export let accentRgb: string | null = null;

    import { navigationStore } from "../stores/navigationStore";

    let loading = false;
    let clicked = false;

    $: sizeClass = size === "lg" ? "w-40" : "w-24";
    $: kind = (mix?.type as string) || "playlist";

    async function handleClick() {
        if (loading) return;

        clicked = true;

        if (onSelect) {
            loading = true;
            try {
                await onSelect();
            } finally {
                // Keep loading state briefly to show feedback
                setTimeout(() => {
                    loading = false;
                    clicked = false;
                }, 300);
            }
        } else {
            navigationStore.openPlaylist(mix.id);
            clicked = false;
        }
    }
</script>

<button
    {...$$restProps}
    class="relative shrink-0 group"
    class:opacity-70={loading || clicked}
    class:scale-95={clicked}
    style={accentRgb ? `--card-accent: ${accentRgb};` : undefined}
    aria-label={mix.name}
    disabled={loading}
    onclick={handleClick}
>
    <div
        class="{sizeClass} aspect-square rounded-2xl overflow-hidden fluid-card relative transition-transform duration-150"
    >
        {#if mix.image}
            <img
                src={mix.image}
                alt={mix.name}
                class="w-full h-full object-cover"
            />
        {:else}
            <div class="w-full h-full bg-white/5"></div>
        {/if}

        <!-- Loading overlay -->
        {#if loading}
            <div
                class="absolute inset-0 bg-black/40 flex items-center justify-center"
            >
                <div
                    class="loading-spinner w-6 h-6 border-2 border-white/30 border-t-white rounded-full"
                ></div>
            </div>
        {:else}
            <!-- Hover play button -->
            <div
                class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            >
                <div
                    class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg"
                >
                    <svg
                        class="w-6 h-6 text-black ml-0.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </div>
            </div>
        {/if}

        <!-- Click feedback overlay -->
        {#if clicked && !loading}
            <div class="absolute inset-0 bg-black/20 transition-opacity"></div>
        {/if}
    </div>
</button>

<style>
    .loading-spinner {
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    button {
        transition:
            transform 0.15s ease-out,
            opacity 0.15s ease-out;
    }
</style>
