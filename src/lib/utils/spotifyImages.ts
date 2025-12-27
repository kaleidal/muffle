export function bestImageUrl(images?: { url: string; width?: number; height?: number }[], fallback = '') {
  if (!images || images.length === 0) return fallback
  return images[0]?.url || fallback
}
