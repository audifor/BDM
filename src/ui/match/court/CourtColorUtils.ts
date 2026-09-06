/** Presentation-only color transforms for court surfaces. Does not mutate club brand tokens. */

export type CourtRgb = { readonly r: number; readonly g: number; readonly b: number }
export type CourtHsl = { readonly h: number; readonly s: number; readonly l: number }

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function parseCssColor(input: string): CourtRgb | null {
  const value = input.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)
  if (hex !== null) {
    const raw = hex[1]!
    const full =
      raw.length === 3
        ? raw
            .split('')
            .map((c) => c + c)
            .join('')
        : raw
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    }
  }

  const hsl = /^hsla?\(\s*([-\d.]+)\s*[,\s]\s*([-\d.]+)%\s*[,\s]\s*([-\d.]+)%(?:\s*[\/,]\s*([-\d.]+%?))?\s*\)$/i.exec(
    value.replace(/\s+/g, ' '),
  )
  if (hsl !== null) {
    return hslToRgb({
      h: ((Number(hsl[1]) % 360) + 360) % 360,
      s: Number(hsl[2]) / 100,
      l: Number(hsl[3]) / 100,
    })
  }

  const rgb = /^rgba?\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)(?:\s*,\s*([-\d.]+))?\s*\)$/i.exec(value)
  if (rgb !== null) {
    return {
      r: Math.round(Number(rgb[1])),
      g: Math.round(Number(rgb[2])),
      b: Math.round(Number(rgb[3])),
    }
  }

  return null
}

export function rgbToHsl({ r, g, b }: CourtRgb): CourtHsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h: h * 360, s, l }
}

export function hslToRgb({ h, s, l }: CourtHsl): CourtRgb {
  const hh = (((h % 360) + 360) % 360) / 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = (t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return {
    r: Math.round(hue2rgb(hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(hh) * 255),
    b: Math.round(hue2rgb(hh - 1 / 3) * 255),
  }
}

export function rgbToCss({ r, g, b }: CourtRgb, alpha = 1): string {
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`
}

export function adjustHsl(
  color: string,
  deltas: { readonly h?: number; readonly s?: number; readonly l?: number },
): string {
  const rgb = parseCssColor(color)
  if (rgb === null) return color
  const hsl = rgbToHsl(rgb)
  return rgbToCss(
    hslToRgb({
      h: hsl.h + (deltas.h ?? 0),
      s: clamp01(hsl.s + (deltas.s ?? 0)),
      l: clamp01(hsl.l + (deltas.l ?? 0)),
    }),
  )
}

/**
 * Convert a vivid club brand color into a painted-court surface color.
 * Keeps hue identity readable (not near-black / navy-generic).
 */
export function normalizeCourtColor(brandColor: string): string {
  const rgb = parseCssColor(brandColor)
  if (rgb === null) return '#1a3848'
  const hsl = rgbToHsl(rgb)
  return rgbToCss(
    hslToRgb({
      h: hsl.h,
      s: clamp01(Math.max(0.38, Math.min(0.72, hsl.s * 1.05))),
      l: clamp01(Math.min(0.4, Math.max(0.24, hsl.l * 0.55 + 0.14))),
    }),
  )
}

/**
 * Convert club color into out-of-bounds / padding arena surround.
 * Darker than key paint but still clearly club-hued.
 */
export function normalizeArenaColor(brandColor: string): string {
  const rgb = parseCssColor(brandColor)
  if (rgb === null) return '#102028'
  const hsl = rgbToHsl(rgb)
  return rgbToCss(
    hslToRgb({
      h: hsl.h,
      s: clamp01(Math.max(0.3, Math.min(0.58, hsl.s * 0.9))),
      l: clamp01(Math.min(0.22, Math.max(0.11, hsl.l * 0.42 + 0.08))),
    }),
  )
}

/** Subtle deterministic plank variation from a maple base. */
export function varyWoodTone(
  baseColor: string,
  sample: number,
): string {
  const t = sample * 2 - 1
  return adjustHsl(baseColor, {
    h: t * 3.2,
    s: t * 0.035,
    l: t * 0.048,
  })
}

export function buildStaticCacheKey(parts: readonly string[]): string {
  return parts.join('|')
}
