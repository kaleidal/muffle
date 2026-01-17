export function createPolling(args: { fetchTick: () => Promise<void> }) {
  let poll: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  const POLL_INTERVAL = 2500

  const start = () => {
    if (poll) return
    poll = setInterval(() => {
      if (inFlight) return
      inFlight = true
      void args.fetchTick().finally(() => {
        inFlight = false
      })
    }, POLL_INTERVAL)
  }

  const stop = () => {
    if (poll) clearInterval(poll)
    poll = null
    inFlight = false
  }

  return { start, stop }
}
