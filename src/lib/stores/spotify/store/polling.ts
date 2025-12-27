export function createPolling(args: { fetchTick: () => Promise<void> }) {
  let poll: ReturnType<typeof setInterval> | null = null

  const start = () => {
    if (poll) return
    poll = setInterval(() => {
      void args.fetchTick()
    }, 3000)
  }

  const stop = () => {
    if (poll) clearInterval(poll)
    poll = null
  }

  return { start, stop }
}
