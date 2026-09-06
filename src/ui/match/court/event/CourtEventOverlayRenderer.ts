import type { CourtConfiguration } from '../core/CourtConfiguration'
import type { CourtProjection } from '../CourtProjection'
import { projectMetres } from '../CourtProjection'

/** Temporary competition/event marks — does not mutate club identity permanently. */
export function renderCourtEventOverlay(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  config: CourtConfiguration,
): void {
  const event = config.eventOverlay
  if (event === undefined || event.kind === 'NONE') return

  const r = projection.regulation
  const mid = projection.project({ x: r.length / 2, y: r.width / 2 })

  if (event.centerSecondaryMark) {
    ctx.save()
    ctx.globalAlpha = event.opacity * 0.55
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.2
    const rr = projectMetres(r.circleRadius * 1.35, projection, r.width / 2)
    ctx.beginPath()
    ctx.arc(mid.x, mid.y, rr, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = `700 ${Math.max(8, rr * 0.18)}px "GT America Standard", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(event.centerSecondaryMark.toUpperCase().slice(0, 14), mid.x, mid.y + rr * 0.72)
    ctx.restore()
  }

  for (let i = 0; i < event.sponsorSlots.length; i += 1) {
    const slot = event.sponsorSlots[i]!
    if (slot.trim() === '') continue
    const x = r.length * (0.2 + i * 0.2)
    const p = projection.project({ x, y: r.width * 0.97 })
    ctx.save()
    ctx.globalAlpha = event.opacity * 0.4
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = `600 ${Math.max(7, projectMetres(0.22, projection))}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(slot.toUpperCase().slice(0, 12), p.x, p.y)
    ctx.restore()
  }
}
