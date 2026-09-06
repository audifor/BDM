import { createSeededRandomSource, hashStringToSeed } from '@/engine/random'
import type { CourtFloorProfile, FloorPatternId } from './CourtFloorProfile'
import { varyWoodTone } from '../CourtColorUtils'

/**
 * Deterministic procedural floor texture — never Math.random.
 * Patterns: LONGITUDINAL / STAGGERED / HERRINGBONE / TWO_TONE (others fall back).
 */
export function generateFloorTexture(
  width: number,
  height: number,
  floor: CourtFloorProfile,
  cacheKey: string,
): HTMLCanvasElement {
  const w = Math.max(8, Math.floor(width))
  const h = Math.max(8, Math.floor(height))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx === null) return canvas

  const seed = hashStringToSeed(
    `ct-canon-floor-v1:${cacheKey}:${floor.material}:${floor.pattern}:${floor.baseTone}:${w}x${h}`,
  )
  const rng = createSeededRandomSource(seed)

  ctx.fillStyle = floor.baseTone
  ctx.fillRect(0, 0, w, h)

  const pattern: FloorPatternId =
    floor.pattern === 'TRANSVERSE' || floor.pattern === 'CUSTOM' ? 'LONGITUDINAL' : floor.pattern

  if (pattern === 'HERRINGBONE') {
    paintHerringbone(ctx, w, h, floor, rng)
  } else if (pattern === 'TWO_TONE') {
    paintLongitudinal(ctx, w, h, floor, rng, true)
  } else {
    paintLongitudinal(ctx, w, h, floor, rng, pattern === 'STAGGERED')
  }

  const sheen = ctx.createLinearGradient(0, 0, 0, h)
  sheen.addColorStop(0, `rgba(255,248,230,${0.05 + floor.gloss * 0.07})`)
  sheen.addColorStop(0.4, 'rgba(255,248,230,0)')
  sheen.addColorStop(1, `rgba(42,24,8,${0.04 + floor.gloss * 0.05})`)
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, w, h)

  return canvas
}

function paintLongitudinal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  floor: CourtFloorProfile,
  rng: { next: () => number },
  stagger: boolean,
): void {
  const baseRowH = Math.max(4, Math.round(h / 28))
  let y = 0
  let rowIndex = 0
  while (y < h + baseRowH) {
    const rowH = Math.max(4, Math.round(baseRowH * (0.85 + rng.next() * 0.35)))
    // TWO_TONE: darker stain on one half of the long axis (NBA broadcast look)
    const nominalPlankW = Math.max(24, Math.round(rowH * (floor.plankLengthM / floor.plankWidthM) * (0.9 + rng.next() * 0.25)))
    const staggerX = stagger && rowIndex % 2 !== 0 ? nominalPlankW * (0.28 + rng.next() * 0.35) : 0
    let x = -staggerX - rng.next() * nominalPlankW * 0.4
    while (x < w + nominalPlankW) {
      const plankW = Math.max(16, Math.round(nominalPlankW * (0.7 + rng.next() * 0.55)))
      const halfTint = floor.pattern === 'TWO_TONE' && x + plankW / 2 < w / 2
      const toneBase = halfTint ? varyWoodTone(floor.baseTone, 0.38) : varyWoodTone(floor.baseTone, 0.58)
      const tone = varyWoodTone(toneBase, 0.5 + (rng.next() - 0.5) * floor.toneVariation * 3.1)
      const rowTop = Math.floor(y)
      const rowBottom = Math.min(h, Math.floor(y + rowH))
      const px = Math.floor(x)
      const pw = Math.min(w - px, plankW)
      if (pw > 0 && rowBottom > rowTop) {
        ctx.fillStyle = tone
        ctx.fillRect(px, rowTop, pw, rowBottom - rowTop)
        drawGrain(ctx, px, rowTop, pw, rowH, floor, rng)
        if (px + pw < w) {
          ctx.fillStyle = `rgba(50,30,15,${0.06 + floor.seamStrength * 0.07})`
          ctx.fillRect(px + pw - 1, rowTop, 1, rowBottom - rowTop)
        }
      }
      x += plankW
    }
    if (y + rowH < h) {
      ctx.fillStyle = `rgba(50,30,15,${0.07 + floor.seamStrength * 0.06})`
      ctx.fillRect(0, Math.floor(y + rowH) - 1, w, 1)
    }
    y += rowH
    rowIndex += 1
  }
}

function paintHerringbone(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  floor: CourtFloorProfile,
  rng: { next: () => number },
): void {
  const tile = Math.max(10, Math.round(h / 22))
  for (let row = -1; row < Math.ceil(h / tile) + 1; row += 1) {
    for (let col = -1; col < Math.ceil(w / tile) + 1; col += 1) {
      const x = col * tile
      const y = row * tile
      const flip = (row + col) % 2 === 0
      const tone = varyWoodTone(floor.baseTone, 0.5 + (rng.next() - 0.5) * floor.toneVariation * 2.8)
      ctx.save()
      ctx.translate(x + tile / 2, y + tile / 2)
      ctx.rotate(flip ? Math.PI / 4 : -Math.PI / 4)
      ctx.fillStyle = tone
      ctx.fillRect(-tile * 0.7, -tile * 0.22, tile * 1.4, tile * 0.44)
      ctx.fillStyle = `rgba(50,30,15,${0.05 + floor.seamStrength * 0.08})`
      ctx.fillRect(-tile * 0.7, -tile * 0.22, tile * 1.4, 1)
      ctx.restore()
    }
  }
}

function drawGrain(
  ctx: CanvasRenderingContext2D,
  px: number,
  rowTop: number,
  pw: number,
  rowH: number,
  floor: CourtFloorProfile,
  rng: { next: () => number },
): void {
  const micro = (rng.next() - 0.5) * floor.microContrast
  if (Math.abs(micro) > 0.01) {
    ctx.fillStyle =
      micro > 0
        ? `rgba(255,242,214,${Math.abs(micro) * 0.58})`
        : `rgba(70,42,16,${Math.abs(micro) * 0.5})`
    ctx.fillRect(px, rowTop, pw, Math.min(rowH, 64))
  }
  const grainCount = 1 + Math.floor(rng.next() * 2 + floor.grainStrength * 1.8)
  for (let g = 0; g < grainCount; g += 1) {
    const gy = rowTop + 1.2 + rng.next() * Math.max(1, rowH - 2.5)
    ctx.strokeStyle = `rgba(110,72,32,${floor.grainStrength * (0.035 + rng.next() * 0.05)})`
    ctx.lineWidth = 1
    ctx.beginPath()
    let gx = px
    let gyCursor = gy
    ctx.moveTo(gx, gyCursor)
    while (gx < px + pw) {
      const nx = gx + 12 + rng.next() * 22
      gyCursor = gy + (rng.next() - 0.5) * 0.9
      ctx.lineTo(Math.min(px + pw, nx), gyCursor)
      gx = nx
    }
    ctx.stroke()
  }
}

export function floorTextureFingerprint(
  width: number,
  height: number,
  floor: CourtFloorProfile,
  cacheKey: string,
): string {
  const canvas = generateFloorTexture(width, height, floor, cacheKey)
  const ctx = canvas.getContext('2d')
  if (ctx === null) return 'nocanvas'
  const sample = ctx.getImageData(0, 0, Math.min(8, canvas.width), Math.min(8, canvas.height)).data
  let hash = 0x811c_9dc5
  for (let i = 0; i < sample.length; i += 1) {
    hash ^= sample[i]!
    hash = Math.imul(hash, 0x0100_0193) >>> 0
  }
  return hash.toString(16)
}

/** @deprecated name — use generateFloorTexture */
export const generateParquetTexture = generateFloorTexture
export const parquetFingerprint = floorTextureFingerprint
