import type { CourtConfiguration } from '../core/CourtConfiguration'
import type { CourtProjection } from '../CourtProjection'
import { projectMetres } from '../CourtProjection'
import { adjustHsl } from '../CourtColorUtils'

/**
 * Basket system — hoop on court, backboard at baseline association,
 * stanchion/padding mostly OUTSIDE the playable baseline.
 */
export function renderBasketSystems(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  config: CourtConfiguration,
): void {
  const r = projection.regulation
  const basket = config.basketSystem
  const ruleset = config.ruleset

  for (const side of ['left', 'right'] as const) {
    const towardCenter = side === 'left' ? 1 : -1
    const hoopX = side === 'left' ? r.hoopOffset : r.length - r.hoopOffset
    const boardX = side === 'left' ? ruleset.backboardOffset : r.length - ruleset.backboardOffset
    // Stanchion centre in court metres: outside baseline
    const stanchionCourtX = side === 'left' ? -basket.supportDepthM : r.length + basket.supportDepthM

    const hoop = projection.project({ x: hoopX, y: r.width / 2 })
    const board = projection.project({ x: boardX, y: r.width / 2 })
    const stanchion = projection.project({ x: stanchionCourtX, y: r.width / 2 })

    const boardHalf = projectMetres(r.backboardWidth / 2, projection, r.width / 2) * (0.95 + basket.visualMass * 0.2)
    const boardT = Math.max(3, projectMetres(0.08 + basket.visualMass * 0.04, projection, r.width / 2))
    const rimR = projectMetres(r.rimRadius, projection, r.width / 2) * 1.12
    const padW = Math.max(8, projectMetres(basket.paddingWidthM, projection, r.width / 2))
    const padH = Math.max(boardHalf * 0.7, projectMetres(basket.paddingHeightM * 0.45, projection, r.width / 2))

    ctx.save()

    // Contact shadow on runoff / apron
    ctx.fillStyle = `rgba(0,0,0,${0.22 + basket.shadowStrength * 0.25})`
    ctx.beginPath()
    ctx.ellipse(
      stanchion.x + towardCenter * 2,
      stanchion.y + padH * 0.15,
      padW * (1.6 + basket.visualMass),
      padH * 0.35,
      0,
      0,
      Math.PI * 2,
    )
    ctx.fill()

    // Base / stanchion block — OUTSIDE baseline
    const baseW = padW * (1.1 + basket.visualMass * 0.6)
    const baseH = padH * (0.55 + basket.visualMass * 0.35)
    ctx.fillStyle = basket.type === 'SMALL_GYM' || basket.type === 'WALL_MOUNTED' ? '#2a3038' : 'rgba(8,10,14,0.96)'
    ctx.fillRect(stanchion.x - baseW / 2, stanchion.y - baseH / 2, baseW, baseH)

    // Support arm from stanchion toward backboard (mostly outside / at edge)
    const armY = stanchion.y
    ctx.strokeStyle = 'rgba(40,48,58,0.95)'
    ctx.lineWidth = Math.max(3, padW * 0.22 * basket.visualMass)
    ctx.beginPath()
    ctx.moveTo(stanchion.x + towardCenter * (baseW * 0.35), armY)
    ctx.lineTo(board.x - towardCenter * boardT, armY)
    ctx.stroke()

    // Padding
    const padGrad = ctx.createLinearGradient(stanchion.x - padW / 2, 0, stanchion.x + padW / 2, 0)
    padGrad.addColorStop(0, adjustHsl(basket.paddingColor, { l: -0.06 }))
    padGrad.addColorStop(0.5, adjustHsl(basket.paddingColor, { l: 0.08 }))
    padGrad.addColorStop(1, adjustHsl(basket.paddingColor, { l: -0.1 }))
    ctx.fillStyle = padGrad
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = 1
    ctx.fillRect(stanchion.x - padW / 2, stanchion.y - padH / 2, padW, padH)
    ctx.strokeRect(stanchion.x - padW / 2, stanchion.y - padH / 2, padW, padH)

    if (basket.brandingZone && basket.paddingMark) {
      ctx.globalAlpha = 0.55
      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.font = `800 ${Math.max(7, padW * 0.4)}px "GT America Standard", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(basket.paddingMark.toUpperCase().slice(0, 2), stanchion.x, stanchion.y)
      ctx.globalAlpha = 1
    }

    // Backboard
    const boardGrad = ctx.createLinearGradient(board.x - boardT, board.y, board.x + boardT, board.y)
    if (basket.backboardStyle === 'pro_glass') {
      boardGrad.addColorStop(0, 'rgba(36,42,50,0.98)')
      boardGrad.addColorStop(0.45, 'rgba(90,100,112,0.75)')
      boardGrad.addColorStop(1, 'rgba(28,32,40,0.98)')
    } else if (basket.backboardStyle === 'college') {
      boardGrad.addColorStop(0, 'rgba(48,48,52,0.98)')
      boardGrad.addColorStop(0.5, 'rgba(72,72,78,0.9)')
      boardGrad.addColorStop(1, 'rgba(40,40,44,0.98)')
    } else {
      boardGrad.addColorStop(0, 'rgba(55,55,58,0.98)')
      boardGrad.addColorStop(1, 'rgba(40,40,42,0.98)')
    }
    ctx.fillStyle = boardGrad
    ctx.strokeStyle = 'rgba(230,238,246,0.7)'
    ctx.lineWidth = 1.4
    ctx.fillRect(board.x - boardT / 2, board.y - boardHalf, boardT, boardHalf * 2)
    ctx.strokeRect(board.x - boardT / 2, board.y - boardHalf, boardT, boardHalf * 2)
    if (basket.backboardStyle !== 'basic') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1.1
      ctx.strokeRect(board.x - boardT * 0.18, board.y - boardHalf * 0.3, boardT * 0.36, boardHalf * 0.6)
    }

    // Rim — invades court
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(hoop.x + 1, hoop.y + 2, rimR * 1.05, rimR * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e85a2a'
    ctx.strokeStyle = '#ffd0a8'
    ctx.lineWidth = Math.max(1.6, projectMetres(0.032, projection, r.width / 2))
    ctx.beginPath()
    ctx.arc(hoop.x, hoop.y, rimR, 0, Math.PI * 2)
    ctx.arc(hoop.x, hoop.y, rimR * 0.48, 0, Math.PI * 2, true)
    ctx.fill('evenodd')
    ctx.beginPath()
    ctx.arc(hoop.x, hoop.y, rimR, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(235,240,246,0.35)'
    ctx.lineWidth = 0.8
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath()
      ctx.moveTo(hoop.x + i * rimR * 0.3, hoop.y + rimR * 0.2)
      ctx.lineTo(hoop.x + i * rimR * 0.1, hoop.y + rimR * 1.45)
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** Assert helpers for tests — stanchion court-X is outside [0, length]. */
export function stanchionCourtX(
  side: 'left' | 'right',
  courtLength: number,
  supportDepthM: number,
): number {
  return side === 'left' ? -supportDepthM : courtLength + supportDepthM
}
