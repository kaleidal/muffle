export function createPolling(args: { fetchTick: () => Promise<void> }) {
  let poll: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  const start = () => {
    if (poll) return
    poll = setInterval(() => {
      if (inFlight) return
      inFlight = true
      void args.fetchTick().finally(() => {
        inFlight = false
      })
    }, 3000)
  }

  const stop = () => {
    if (poll) clearInterval(poll)
    poll = null
    inFlight = false
  }

  return { start, stop }
}
