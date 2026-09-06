import type { CourtConfiguration } from '../core/CourtConfiguration'
import type { CourtProjection } from '../CourtProjection'
import { parseCssColor } from '../CourtColorUtils'

export function renderCourtLighting(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  config: CourtConfiguration,
): void {
  const { originX, originY, courtPixelWidth, courtPixelHeight, canvasWidth, canvasHeight } = projection.viewport
  const lighting = config.arena.lighting
  const gloss = Math.min(1, config.floor.gloss + lighting.glossBoost)
  const vignette = lighting.vignetteStrength
  const c = projection.courtCorners

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(c[0]!.x, c[0]!.y)
  for (let i = 1; i < c.length; i += 1) ctx.lineTo(c[i]!.x, c[i]!.y)
  ctx.closePath()
  ctx.clip()

  const overhead = ctx.createRadialGradient(
    originX + courtPixelWidth * 0.5,
    originY + courtPixelHeight * 0.4,
    courtPixelHeight * 0.02,
    originX + courtPixelWidth * 0.5,
    originY + courtPixelHeight * 0.46,
    courtPixelWidth * 0.78,
  )
  const oh = lighting.overheadStrength
  overhead.addColorStop(0, `rgba(255, 252, 240, ${(0.2 + gloss * 0.22) * oh})`)
  overhead.addColorStop(0.28, `rgba(255, 244, 220, ${(0.09 + gloss * 0.1) * oh})`)
  overhead.addColorStop(0.65, `rgba(255, 236, 200, ${(0.03 + gloss * 0.04) * oh})`)
  overhead.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = overhead
  ctx.fillRect(originX - 6, originY - 6, courtPixelWidth + 12, courtPixelHeight + 12)

  ctx.globalCompositeOperation = 'soft-light'
  for (let i = 0; i < 5; i += 1) {
    const t = (i + 0.5) / 5
    const sx = originX + courtPixelWidth * (0.12 + t * 0.72)
    const half = 28 + gloss * 36
    const strip = ctx.createLinearGradient(sx - half, originY, sx + half, originY)
    strip.addColorStop(0, 'rgba(255,255,255,0)')
    strip.addColorStop(0.5, `rgba(255,248,230,${0.35 + gloss * 0.35})`)
    strip.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = strip
    ctx.fillRect(sx - half, originY, half * 2, courtPixelHeight)
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.restore()

  // LED contamination wash (Euro premium)
  if (lighting.ledContamination > 0.01) {
    const led = parseCssColor(config.arena.ledColor)
    if (led) {
      ctx.save()
      ctx.globalAlpha = lighting.ledContamination * 0.35
      const wash = ctx.createLinearGradient(0, canvasHeight * 0.7, 0, canvasHeight)
      wash.addColorStop(0, 'transparent')
      wash.addColorStop(1, `rgba(${led.r},${led.g},${led.b},0.5)`)
      ctx.fillStyle = wash
      ctx.fillRect(0, canvasHeight * 0.65, canvasWidth, canvasHeight * 0.35)
      ctx.restore()
    }
  }

  // Ambient vignette outside court
  if (vignette > 0.01) {
    const g = ctx.createRadialGradient(
      canvasWidth / 2,
      canvasHeight / 2,
      Math.min(canvasWidth, canvasHeight) * 0.25,
      canvasWidth / 2,
      canvasHeight / 2,
      Math.max(canvasWidth, canvasHeight) * 0.72,
    )
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${vignette})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  }

  if (lighting.ambientTintStrength > 0.01) {
    ctx.save()
    ctx.globalAlpha = lighting.ambientTintStrength
    ctx.fillStyle = lighting.ambientTint
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
    ctx.restore()
  }
}
