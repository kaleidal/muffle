export function createPolling(args: { fetchTick: () => Promise<void> }) {
  let poll: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  const POLL_INTERVAL = 4000

  const tick = () => {
    if (inFlight || globalThis.document?.hidden) return
    inFlight = true
    void args.fetchTick().finally(() => {
      inFlight = false
    })
  }

  const start = () => {
    if (poll) return
    tick()
    poll = setInterval(tick, POLL_INTERVAL)
  }

  const stop = () => {
    if (poll) clearInterval(poll)
    poll = null
    inFlight = false
  }

  return { start, stop }
}
