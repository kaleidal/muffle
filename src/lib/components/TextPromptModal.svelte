<script lang="ts">
  import { fade, fly } from 'svelte/transition'

  export let open: boolean
  export let title: string
  export let placeholder: string
  export let initialValue: string = ''
  export let confirmText: string = 'Save'
  export let busy: boolean = false
  export let error: string | null = null
  export let onCancel: () => void
  export let onConfirm: (value: string) => void | Promise<void>

  let value = ''
  let inputEl: HTMLInputElement | null = null
  let wasOpen = false

  $: if (open && !wasOpen) {
    value = initialValue
    queueMicrotask(() => inputEl?.focus())
  }

  $: wasOpen = open

  const close = () => {
    if (busy) return
    onCancel()
  }

  const submit = async () => {
    if (busy) return
    await onConfirm(value)
  }
</script>

{#if open}
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
        class="w-full max-w-md bg-[#141414] rounded-4xl p-6 shadow-xl pointer-events-auto"
        in:fly={{ y: 10, duration: 180 }}
        out:fade={{ duration: 120 }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabindex="-1"
        onkeydown={(e) => {
          if (e.key === 'Escape') close()
        }}
      >
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="text-white font-extrabold tracking-tight truncate">{title}</div>
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
          <input
            bind:this={inputEl}
            class="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 transition-colors rounded-2xl px-4 py-3 text-white/90 outline-none font-semibold"
            {placeholder}
            bind:value
            disabled={busy}
          />
        </div>

        {#if error}
          <div class="mt-3 text-white/60 text-sm font-semibold">{error}</div>
        {/if}

        <div class="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            class="h-10 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white/90 font-extrabold tracking-tight bouncy-btn"
            onclick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            class="h-10 px-4 rounded-2xl bg-(--accent-primary) text-black font-extrabold tracking-tight bouncy-btn"
            onclick={submit}
            disabled={busy}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
