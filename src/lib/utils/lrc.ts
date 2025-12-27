export type LyricLine = {
  startMs: number
  text: string
}

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g

function parseMs(minStr: string, secStr: string, fracStr?: string) {
  const mins = Number(minStr)
  const secs = Number(secStr)
  const frac = fracStr ? Number(fracStr) : 0

  const fracMs = fracStr
    ? fracStr.length === 1
      ? frac * 100
      : fracStr.length === 2
        ? frac * 10
        : frac
    : 0

  return (mins * 60 + secs) * 1000 + fracMs
}

export function parseSyncedLyrics(lrc: string): LyricLine[] {
  const lines = lrc
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  const out: LyricLine[] = []

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue

    const times: number[] = []
    let match: RegExpExecArray | null

    TIMESTAMP_RE.lastIndex = 0
    while ((match = TIMESTAMP_RE.exec(rawLine)) !== null) {
      const ms = parseMs(match[1], match[2], match[3])
      if (!Number.isFinite(ms)) continue
      times.push(ms)
    }

    const text = rawLine.replace(TIMESTAMP_RE, '').trim()
    if (!times.length) continue

    for (const t of times) {
      out.push({ startMs: t, text })
    }
  }

  out.sort((a, b) => a.startMs - b.startMs)

  const deduped: LyricLine[] = []
  for (let i = 0; i < out.length; i++) {
    const prev = deduped[deduped.length - 1]
    const cur = out[i]
    if (prev && prev.startMs === cur.startMs && prev.text === cur.text) continue
    deduped.push(cur)
  }

  return deduped
}

export function findActiveLyricIndex(lines: LyricLine[], positionMs: number): number {
  if (!lines.length) return -1
  if (positionMs < lines[0].startMs) return -1

  let lo = 0
  let hi = lines.length - 1

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = lines[mid].startMs

    if (t === positionMs) {
      lo = mid
      break
    }

    if (t < positionMs) lo = mid + 1
    else hi = mid - 1
  }

  const idx = Math.max(0, lo - 1)
  return idx
}
