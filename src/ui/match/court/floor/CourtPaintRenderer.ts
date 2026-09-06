import type { CourtConfiguration } from '../core/CourtConfiguration'
import type { CourtPointM } from '../CourtGeometry'
import {
  freeThrowArcPoints,
  sampleCirclePoints,
  threePointPath,
} from '../CourtMarkingsGeometry'
import {
  fillCourtPath,
  projectMetres,
  strokeCourtPath,
  type CourtProjection,
} from '../CourtProjection'

/**
 * Paint as a material layer — grain/bleed preserved, not a digital flat fill.
 */
export function renderCourtPaint(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  config: CourtConfiguration,
): void {
  const r = projection.regulation
  const keyTop = (r.width - r.keyWidth) / 2
  const keyBot = keyTop + r.keyWidth
  const bleed = config.floor.paintMaterial.woodBleed
  const paintColor = config.branding.palette.paint
  const centerColor = config.branding.palette.center
  const restricted = config.branding.palette.restricted

  const paintPoly = (points: readonly CourtPointM[], color: string) => {
    ctx.save()
    ctx.globalAlpha = 0.28 + (1 - bleed) * 0.24
    ctx.fillStyle = color
    fillCourtPath(ctx, projection, points)
    ctx.globalAlpha = 0.16 + bleed * 0.38
    ctx.globalCompositeOperation = 'destination-out'
    fillCourtPath(ctx, projection, points)
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = 0.14 + (1 - bleed) * 0.18
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = color
    fillCourtPath(ctx, projection, points)
    ctx.restore()
  }

  paintPoly(
    [
      { x: 0, y: keyTop },
      { x: r.keyDepth, y: keyTop },
      { x: r.keyDepth, y: keyBot },
      { x: 0, y: keyBot },
    ],
    paintColor,
  )
  paintPoly(
    [
      { x: r.length - r.keyDepth, y: keyTop },
      { x: r.length, y: keyTop },
      { x: r.length, y: keyBot },
      { x: r.length - r.keyDepth, y: keyBot },
    ],
    paintColor,
  )
  paintPoly(sampleCirclePoints({ x: r.length / 2, y: r.width / 2 }, r.circleRadius, 64), centerColor)

  const restrR = 'restrictedAreaRadius' in config.ruleset ? config.ruleset.restrictedAreaRadius : r.circleRadius * 0.7
  for (const hoopX of [r.hoopOffset, r.length - r.hoopOffset]) {
    ctx.save()
    ctx.globalAlpha = 0.22
    ctx.fillStyle = restricted
    fillCourtPath(ctx, projection, sampleCirclePoints({ x: hoopX, y: r.width / 2 }, restrR, 48))
    ctx.restore()
  }

  drawRegulatoryLines(ctx, projection, config)
}

function drawRegulatoryLines(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  config: CourtConfiguration,
): void {
  const r = projection.regulation
  const midY = r.width / 2
  const stroke = Math.max(1.3, projectMetres(0.05, projection, midY))
  const soft = config.floor.paintMaterial.woodBleed

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(255,255,255,${0.16 + soft * 0.08})`
  ctx.lineWidth = stroke + 0.9
  strokeGeometry(ctx, projection, false)

  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = stroke
  ctx.globalAlpha = 0.92
  strokeGeometry(ctx, projection, true)
  ctx.restore()
}

function strokeGeometry(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  includeDashed: boolean,
): void {
  const r = projection.regulation
  strokeCourtPath(
    ctx,
    projection,
    [
      { x: 0, y: 0 },
      { x: r.length, y: 0 },
      { x: r.length, y: r.width },
      { x: 0, y: r.width },
    ],
    true,
  )
  strokeCourtPath(ctx, projection, [
    { x: r.length / 2, y: 0 },
    { x: r.length / 2, y: r.width },
  ])
  strokeCourtPath(ctx, projection, sampleCirclePoints({ x: r.length / 2, y: r.width / 2 }, r.circleRadius, 64), true)

  const keyTop = (r.width - r.keyWidth) / 2
  const keyBot = keyTop + r.keyWidth
  strokeCourtPath(ctx, projection, [
    { x: 0, y: keyTop },
    { x: r.keyDepth, y: keyTop },
    { x: r.keyDepth, y: keyBot },
    { x: 0, y: keyBot },
  ])
  strokeCourtPath(ctx, projection, [
    { x: r.length, y: keyTop },
    { x: r.length - r.keyDepth, y: keyTop },
    { x: r.length - r.keyDepth, y: keyBot },
    { x: r.length, y: keyBot },
  ])

  if (includeDashed) {
    ctx.setLineDash([
      projectMetres(0.18, projection, r.width / 2),
      projectMetres(0.12, projection, r.width / 2),
    ])
  }
  strokeCourtPath(ctx, projection, freeThrowArcPoints(r, 'left', 36))
  strokeCourtPath(ctx, projection, freeThrowArcPoints(r, 'right', 36))
  ctx.setLineDash([])

  for (const side of ['left', 'right'] as const) {
    const path = threePointPath(r, side, 56)
    strokeCourtPath(ctx, projection, path.topLine)
    strokeCourtPath(ctx, projection, path.bottomLine)
    strokeCourtPath(ctx, projection, path.arc)
  }
}
