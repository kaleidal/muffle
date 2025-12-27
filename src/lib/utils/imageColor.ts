const rgbCache = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()

function clampByte(n: number) {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(255, Math.round(n)))
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const v = hex.trim().replace(/^#/, '')
  if (v.length === 3) {
    const r = parseInt(v[0] + v[0], 16)
    const g = parseInt(v[1] + v[1], 16)
    const b = parseInt(v[2] + v[2], 16)
    if ([r, g, b].some((n) => Number.isNaN(n))) return null
    return { r, g, b }
  }
  if (v.length === 6) {
    const r = parseInt(v.slice(0, 2), 16)
    const g = parseInt(v.slice(2, 4), 16)
    const b = parseInt(v.slice(4, 6), 16)
    if ([r, g, b].some((n) => Number.isNaN(n))) return null
    return { r, g, b }
  }
  return null
}

export function cssVarHexToRgbTriplet(cssVarHex: string): string | null {
  const parsed = parseHex(cssVarHex)
  if (!parsed) return null
  return `${parsed.r} ${parsed.g} ${parsed.b}`
}

function enhance({ r, g, b }: { r: number; g: number; b: number }) {
  const max = Math.max(r, g, b)
  const boost = max < 140 ? 1.35 : 1.15
  return {
    r: clampByte(r * boost),
    g: clampByte(g * boost),
    b: clampByte(b * boost)
  }
}

async function dominantRgbFromUrl(url: string): Promise<string | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.src = url

    if (img.decode) {
      await img.decode()
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Image load failed'))
      })
    }

    const w = Math.max(8, Math.min(48, img.naturalWidth || 32))
    const h = Math.max(8, Math.min(48, img.naturalHeight || 32))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null

    ctx.drawImage(img, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)

    let rSum = 0
    let gSum = 0
    let bSum = 0
    let count = 0

    for (let i = 0; i < data.length; i += 16) {
      const a = data[i + 3]
      if (a < 20) continue
      rSum += data[i]
      gSum += data[i + 1]
      bSum += data[i + 2]
      count++
    }

    if (!count) return null

    const avg = enhance({ r: rSum / count, g: gSum / count, b: bSum / count })
    return `${avg.r} ${avg.g} ${avg.b}`
  } catch {
    return null
  }
}

export async function getDominantRgbTriplet(url: string): Promise<string | null> {
  if (!url) return null
  const cached = rgbCache.get(url)
  if (cached) return cached

  const inFlight = pending.get(url)
  if (inFlight) return await inFlight

  const p = (async () => {
    const res = await dominantRgbFromUrl(url)
    if (res) rgbCache.set(url, res)
    pending.delete(url)
    return res
  })()

  pending.set(url, p)
  return await p
}
