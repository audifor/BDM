import { hashStringToSeed, createSeededRandomSource } from '@/engine/random'
import type { CourtConfiguration } from '../core/CourtConfiguration'
import type { CourtProjection } from '../CourtProjection'
import {
  buildArenaPerimeterLayout,
  type ArenaPerimeterLayout,
  type ArenaZoneRect,
} from './ArenaPerimeterLayout'
import type { ArenaCourtArchetype } from './ArenaCourtProfile'

export type ArenaPerimeterRenderOptions = {
  /** When false, caller has already cleared / may omit court — still draws perimeter. */
  readonly debugOutlineCourt?: boolean
  /** CT-ARENA FIX: court / runoff / camera / basket support bounds. */
  readonly debugCompositionBounds?: boolean
}

/**
 * CT-ARENA · perimeter composition.
 * LiveCourtStage is a camera crop — no giant outer arena slab.
 */
export function renderArenaPerimeter(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  config: CourtConfiguration,
  options: ArenaPerimeterRenderOptions = {},
): ArenaPerimeterLayout {
  const layout = buildArenaPerimeterLayout(projection, config.arena)
  const { canvasWidth, canvasHeight } = projection.viewport
  const accent = config.branding.palette.accent
  const paint = config.branding.palette.paint
  const label = (config.branding.scorerLabel || config.branding.centerMonogram || '').slice(0, 10)
  const rng = createSeededRandomSource(hashStringToSeed(`ct-arena-v3:${config.id}:${config.arena.archetype}`))

  // 01 dark arena continuation (no container polygon)
  drawArenaArchitecture(ctx, canvasWidth, canvasHeight, layout, config.arena.archetype)

  // 02 seating / bleachers / courtside (zonal — may crop at viewport)
  drawSeatingSystem(ctx, layout, config.arena.archetype, paint, accent, rng)

  // 03 immediate thin runoff only
  drawRunoff(ctx, layout, config.arena.archetype, paint, rng)

  // 04 compact basket support pads
  drawBasketZones(ctx, layout, config.arena.archetype, paint)

  // 05 media
  if (config.arena.mediaZones || config.arena.photographerPads) {
    drawMediaZones(ctx, layout, config.arena.archetype, config.arena.photographerPads)
  }

  drawLedBoards(ctx, layout, config.arena.archetype, config.arena.ledColor, config.arena.ledOpacity, label)
  drawTeamBench(ctx, layout.homeBenchZone, 'home', config.arena.archetype, paint, label, rng)
  drawTeamBench(ctx, layout.awayBenchZone, 'away', config.arena.archetype, accent, '', rng)
  drawScorerTable(ctx, layout.scorerTableZone, config.arena.archetype, config.arena.ledColor, label, accent)
  drawSubstitutionZone(ctx, layout.substitutionZone, config.arena.archetype)

  for (const t of layout.tunnelHints) drawTunnel(ctx, t)

  drawCourtContactShadow(ctx, layout)
  if (options.debugOutlineCourt) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 5])
    pathPoly(ctx, layout.courtCorners)
    ctx.stroke()
    ctx.restore()
  }
  if (options.debugCompositionBounds) {
    drawCompositionDebug(ctx, projection, layout)
  }

  return layout
}

function drawArenaArchitecture(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layout: ArenaPerimeterLayout,
  archetype: ArenaCourtArchetype,
): void {
  const gym = archetype === 'NCAA_SMALL_GYM' || archetype === 'YOUTH_GYM'
  // Continuación oscura del pabellón — sin silueta geométrica de contenedor
  const base = gym ? '#12100e' : '#05070c'
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  // Soft seating darkness (no hard outer frame)
  const bowl = ctx.createRadialGradient(w * 0.5, h * 0.42, h * 0.08, w * 0.5, h * 0.5, Math.max(w, h) * 0.72)
  bowl.addColorStop(0, 'rgba(0,0,0,0)')
  bowl.addColorStop(0.55, 'rgba(0,0,0,0.18)')
  bowl.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = bowl
  ctx.fillRect(0, 0, w, h)

  const ceil = ctx.createLinearGradient(0, 0, 0, h * 0.28)
  ceil.addColorStop(0, 'rgba(0,0,0,0.45)')
  ceil.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = ceil
  ctx.fillRect(0, 0, w, h * 0.32)

  // Subtle far rail only (zonal, not a slab edge)
  ctx.globalAlpha = 0.22
  ctx.strokeStyle = gym ? 'rgba(160,140,110,0.4)' : 'rgba(100,120,150,0.28)'
  ctx.lineWidth = 1.5
  const far = layout.seatingEdgeFar
  ctx.beginPath()
  ctx.moveTo(far.x, far.y + far.height * 0.75)
  ctx.lineTo(far.x + far.width, far.y + far.height * 0.75)
  ctx.stroke()
  ctx.restore()
}

function drawRunoff(
  ctx: CanvasRenderingContext2D,
  layout: ArenaPerimeterLayout,
  archetype: ArenaCourtArchetype,
  clubPaint: string,
  rng: { next: () => number },
): void {
  const gym = archetype === 'NCAA_SMALL_GYM' || archetype === 'YOUTH_GYM'
  // Thin immediate band only — never a framing trapezoid slab
  const base = gym ? '#2e2922' : archetype === 'NBA_PREMIUM' ? '#161b24' : '#1a2028'

  ctx.save()
  pathRing(ctx, layout.runoffOuter, layout.courtCorners)
  ctx.fillStyle = base
  ctx.fill('evenodd')

  ctx.clip('evenodd')
  ctx.globalAlpha = 0.05
  for (let i = 0; i < 48; i += 1) {
    ctx.fillStyle = rng.next() > 0.5 ? '#ffffff' : '#000000'
    const z = layout.nearSideline
    ctx.fillRect(z.x + rng.next() * z.width, z.y + rng.next() * Math.max(1, z.height), 2, 1.2)
  }
  ctx.restore()

  // Contact luminance step at parquet edge
  ctx.save()
  pathRing(ctx, layout.contactOuter, layout.courtCorners)
  ctx.fillStyle = gym ? 'rgba(58,50,40,0.9)' : 'rgba(32,40,50,0.85)'
  ctx.fill('evenodd')
  ctx.restore()

  // Local carpet accents near benches only (not a full ring)
  if (archetype === 'EURO_PREMIUM' || archetype === 'NCAA_MAJOR') {
    ctx.save()
    ctx.globalAlpha = archetype === 'EURO_PREMIUM' ? 0.2 : 0.12
    ctx.fillStyle = clubPaint
    const z = layout.nearSideline
    ctx.fillRect(z.x + z.width * 0.12, z.y + z.height * 0.35, z.width * 0.28, Math.max(3, z.height * 0.45))
    ctx.fillRect(z.x + z.width * 0.58, z.y + z.height * 0.35, z.width * 0.28, Math.max(3, z.height * 0.45))
    ctx.restore()
  }
}

function drawCompositionDebug(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  layout: ArenaPerimeterLayout,
): void {
  const { canvasWidth, canvasHeight, courtPixelWidth } = projection.viewport
  const courtLeft = Math.min(...layout.courtCorners.map((p) => p.x))
  const courtRight = Math.max(...layout.courtCorners.map((p) => p.x))
  const runoffLeft = Math.min(...layout.runoffOuter.map((p) => p.x))
  const runoffRight = Math.max(...layout.runoffOuter.map((p) => p.x))
  const fillPct = ((courtRight - courtLeft) / canvasWidth) * 100
  const runoffPct = ((runoffRight - runoffLeft) / canvasWidth) * 100

  ctx.save()
  ctx.lineWidth = 2
  ctx.setLineDash([])

  // camera viewport
  ctx.strokeStyle = 'rgba(255,255,0,0.85)'
  ctx.strokeRect(1, 1, canvasWidth - 2, canvasHeight - 2)

  // runoff bounds
  ctx.strokeStyle = 'rgba(0,220,255,0.9)'
  pathPoly(ctx, layout.runoffOuter)
  ctx.stroke()

  // court bounds
  ctx.strokeStyle = 'rgba(0,255,120,0.95)'
  pathPoly(ctx, layout.courtCorners)
  ctx.stroke()

  // basket support
  ctx.strokeStyle = 'rgba(255,80,80,0.95)'
  for (const z of [layout.basketSupportZoneLeft, layout.basketSupportZoneRight]) {
    ctx.strokeRect(z.x, z.y, z.width, z.height)
  }

  ctx.fillStyle = 'rgba(0,0,0,0.72)'
  ctx.fillRect(8, 8, 420, 78)
  ctx.fillStyle = '#e8ffe8'
  ctx.font = '600 12px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`court fill ${fillPct.toFixed(1)}%  (${Math.round(courtPixelWidth)}px / ${canvasWidth}px)`, 16, 14)
  ctx.fillStyle = '#c8f0ff'
  ctx.fillText(`runoff outer ${runoffPct.toFixed(1)}%  depth N/F/B ${Math.round(layout.runoffDepthPx.near)}/${Math.round(layout.runoffDepthPx.far)}/${Math.round(layout.runoffDepthPx.baseline)}px`, 16, 32)
  ctx.fillStyle = '#ffc8c8'
  ctx.fillText(`basket pad W ${Math.round(layout.basketSupportZoneLeft.width)}px  (must not drive stage width)`, 16, 50)
  ctx.fillStyle = '#ffffaa'
  ctx.fillText('yellow=viewport  cyan=runoff  green=court  red=basket', 16, 66)
  ctx.restore()
}

function drawSeatingSystem(
  ctx: CanvasRenderingContext2D,
  layout: ArenaPerimeterLayout,
  archetype: ArenaCourtArchetype,
  paint: string,
  accent: string,
  rng: { next: () => number },
): void {
  if (archetype === 'NBA_PREMIUM') {
    drawNbaCourtside(ctx, layout, paint, accent)
    drawFarBowl(ctx, layout, '#121820')
  } else if (archetype === 'NCAA_MAJOR') {
    drawCollegeBleachers(ctx, layout, paint, accent, false)
  } else if (archetype === 'NCAA_SMALL_GYM' || archetype === 'YOUTH_GYM') {
    drawCollegeBleachers(ctx, layout, paint, accent, true)
    drawGymWall(ctx, layout)
  } else if (archetype === 'EURO_PREMIUM') {
    drawEuroCompactSeats(ctx, layout, paint)
    drawFarBowl(ctx, layout, '#10161e')
  } else {
    drawFarBowl(ctx, layout, '#12161c')
  }
  void rng
}

function drawNbaCourtside(
  ctx: CanvasRenderingContext2D,
  layout: ArenaPerimeterLayout,
  paint: string,
  accent: string,
): void {
  const z = layout.courtsideZone
  ctx.save()
  // Floor plate under seats
  ctx.fillStyle = '#151a22'
  ctx.fillRect(z.x, z.y, z.width, z.height)
  // Row 1 + 2 seat backs — may crop below viewport
  for (let row = 0; row < 2; row += 1) {
    const ry = z.y + 4 + row * (z.height * 0.42)
    const rh = z.height * 0.36
    const seats = Math.max(18, Math.floor(z.width / 11))
    for (let i = 0; i < seats; i += 1) {
      const sx = z.x + 6 + i * (z.width / seats)
      const sw = Math.max(6, z.width / seats - 3)
      // seat shell
      ctx.fillStyle = row === 0 ? '#1a2430' : '#161e28'
      roundRect(ctx, sx, ry, sw, rh, 1.5)
      ctx.fill()
      // back
      ctx.fillStyle = '#243040'
      ctx.fillRect(sx + 1, ry, sw - 2, rh * 0.35)
      // club accent stitch on every 4th seat
      if (i % 4 === 0) {
        ctx.fillStyle = paint
        ctx.globalAlpha = 0.55
        ctx.fillRect(sx + sw * 0.35, ry + 2, sw * 0.3, 2)
        ctx.globalAlpha = 1
      }
    }
  }
  // Accent rail
  ctx.fillStyle = accent
  ctx.globalAlpha = 0.35
  ctx.fillRect(z.x, z.y, z.width, 2)
  ctx.restore()
}

function drawEuroCompactSeats(ctx: CanvasRenderingContext2D, layout: ArenaPerimeterLayout, paint: string): void {
  const z = layout.courtsideZone
  ctx.save()
  ctx.fillStyle = '#171c24'
  ctx.fillRect(z.x, z.y + z.height * 0.25, z.width, z.height * 0.7)
  const seats = Math.max(14, Math.floor(z.width / 13))
  for (let i = 0; i < seats; i += 1) {
    const sx = z.x + 4 + i * (z.width / seats)
    ctx.fillStyle = '#222a36'
    roundRect(ctx, sx, z.y + z.height * 0.35, Math.max(5, z.width / seats - 4), z.height * 0.45, 1)
    ctx.fill()
  }
  // Sponsor carpet accents between seat blocks
  ctx.globalAlpha = 0.4
  ctx.fillStyle = paint
  ctx.fillRect(z.x + z.width * 0.2, z.y + z.height * 0.15, z.width * 0.15, 4)
  ctx.fillRect(z.x + z.width * 0.65, z.y + z.height * 0.15, z.width * 0.15, 4)
  ctx.restore()
}

function drawCollegeBleachers(
  ctx: CanvasRenderingContext2D,
  layout: ArenaPerimeterLayout,
  paint: string,
  accent: string,
  tight: boolean,
): void {
  const far = layout.seatingEdgeFar
  const near = layout.seatingEdgeNear
  const rows = tight ? 5 : 7
  ctx.save()
  // Far bleacher tiers
  for (let i = 0; i < rows; i += 1) {
    const t = i / rows
    const y = far.y + far.height * (0.15 + t * 0.75)
    const h = Math.max(5, far.height / (rows + 2))
    ctx.globalAlpha = 0.55 + t * 0.3
    ctx.fillStyle = i % 3 === 0 ? shade(paint, 0.55) : '#1a1e28'
    ctx.fillRect(far.x + i * 2, y, far.width - i * 4, h)
    ctx.strokeStyle = 'rgba(200,210,230,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(far.x + i * 2, y, far.width - i * 4, h)
  }
  // Near bleachers (small gym: very close)
  const nearRows = tight ? 4 : 3
  for (let i = 0; i < nearRows; i += 1) {
    const y = near.y + i * Math.max(5, near.height / (nearRows + 1))
    ctx.globalAlpha = 0.7
    ctx.fillStyle = '#1c2028'
    ctx.fillRect(near.x, y, near.width, Math.max(4, near.height / (nearRows + 2)))
  }
  // Soften NCAA student block — accent panel, not giant primary wash
  if (!tight) {
    ctx.globalAlpha = 0.4
    const stack = layout.leftBaseline
    ctx.fillStyle = '#1a1e28'
    ctx.fillRect(stack.x - stack.width * 0.45, stack.y + stack.height * 0.12, stack.width * 0.5, stack.height * 0.6)
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? shade(paint, 0.7) : '#222830'
      ctx.globalAlpha = 0.55
      ctx.fillRect(
        stack.x - stack.width * 0.4,
        stack.y + stack.height * 0.15 + i * ((stack.height * 0.55) / 8),
        stack.width * 0.4,
        stack.height * 0.06,
      )
    }
    ctx.globalAlpha = 0.5
    ctx.fillStyle = accent
    ctx.fillRect(stack.x - stack.width * 0.45, stack.y + stack.height * 0.12, 3, stack.height * 0.6)
  }
  ctx.restore()
}

function drawGymWall(ctx: CanvasRenderingContext2D, layout: ArenaPerimeterLayout): void {
  ctx.save()
  const left = layout.leftBaseline
  ctx.fillStyle = '#2e2820'
  ctx.fillRect(left.x - left.width * 0.8, left.y - 8, left.width * 0.75, left.height + 40)
  ctx.strokeStyle = 'rgba(180,160,120,0.25)'
  ctx.lineWidth = 2
  ctx.strokeRect(left.x - left.width * 0.8, left.y - 8, left.width * 0.75, left.height + 40)
  // Wall pads
  ctx.fillStyle = '#3a3228'
  for (let i = 0; i < 4; i += 1) {
    ctx.fillRect(left.x - left.width * 0.7, left.y + 20 + i * (left.height / 5), left.width * 0.45, left.height / 7)
  }
  ctx.restore()
}

function drawFarBowl(ctx: CanvasRenderingContext2D, layout: ArenaPerimeterLayout, color: string): void {
  const z = layout.seatingEdgeFar
  ctx.save()
  for (let i = 0; i < 4; i += 1) {
    ctx.globalAlpha = 0.35 + i * 0.1
    ctx.fillStyle = shade(color, 1 + i * 0.15)
    ctx.fillRect(z.x - i * 6, z.y + i * 7, z.width + i * 12, Math.max(6, z.height / 5))
  }
  ctx.restore()
}

function drawBasketZones(
  ctx: CanvasRenderingContext2D,
  layout: ArenaPerimeterLayout,
  archetype: ArenaCourtArchetype,
  paint: string,
): void {
  for (const z of [layout.basketSupportZoneLeft, layout.basketSupportZoneRight]) {
    ctx.save()
    // Painted concrete / runway under stanchion
    ctx.fillStyle = archetype === 'NBA_PREMIUM' ? '#141820' : '#1a1e24'
    ctx.fillRect(z.x, z.y, z.width, z.height)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.strokeRect(z.x, z.y, z.width, z.height)
    // Local club carpet under padding footprint
    ctx.globalAlpha = 0.35
    ctx.fillStyle = paint
    ctx.fillRect(z.x + z.width * 0.25, z.y + z.height * 0.3, z.width * 0.5, z.height * 0.4)
    ctx.restore()
  }
}

function drawMediaZones(
  ctx: CanvasRenderingContext2D,
  layout: ArenaPerimeterLayout,
  archetype: ArenaCourtArchetype,
  photo: boolean,
): void {
  if (archetype === 'NCAA_SMALL_GYM' || archetype === 'YOUTH_GYM') return
  for (const z of [layout.mediaZoneLeft, layout.mediaZoneRight]) {
    if (z.width < 4) continue
    ctx.save()
    ctx.fillStyle = '#10141a'
    roundRect(ctx, z.x, z.y, z.width, z.height, 2)
    ctx.fill()
    if (photo) {
      ctx.fillStyle = '#1a222c'
      const n = archetype === 'NBA_PREMIUM' ? 5 : 3
      for (let i = 0; i < n; i += 1) {
        // photographer silhouette blocks
        roundRect(ctx, z.x + 4 + i * (z.width / n), z.y + 2, Math.max(4, z.width / n - 5), z.height - 4, 1)
        ctx.fill()
        // camera nub
        ctx.fillStyle = '#2a3444'
        ctx.fillRect(z.x + 6 + i * (z.width / n), z.y + z.height * 0.35, 4, 3)
        ctx.fillStyle = '#1a222c'
      }
      // equipment case
      ctx.fillStyle = '#0c1016'
      ctx.fillRect(z.x + z.width * 0.7, z.y + z.height + 2, z.width * 0.25, 5)
    }
    ctx.restore()
  }
}

function drawTeamBench(
  ctx: CanvasRenderingContext2D,
  zone: ArenaZoneRect,
  side: 'home' | 'away',
  archetype: ArenaCourtArchetype,
  accent: string,
  signage: string,
  rng: { next: () => number },
): void {
  const seats = archetype === 'NBA_PREMIUM' ? 11 : archetype === 'NCAA_SMALL_GYM' ? 5 : 8
  const rows = archetype === 'NBA_PREMIUM' ? 2 : 1
  ctx.save()
  // Floor plate / technical area
  ctx.fillStyle = '#12161c'
  roundRect(ctx, zone.x, zone.y, zone.width, zone.height, 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.stroke()

  // Court-facing floor line
  ctx.strokeStyle = 'rgba(220,230,240,0.3)'
  ctx.beginPath()
  ctx.moveTo(zone.x + 2, zone.y)
  ctx.lineTo(zone.x + zone.width - 2, zone.y)
  ctx.stroke()

  for (let row = 0; row < rows; row += 1) {
    const rowY = zone.y + 3 + row * (zone.height / rows)
    const rowH = zone.height / rows - 4
    for (let i = 0; i < seats; i += 1) {
      const cw = Math.max(8, (zone.width - 8) / seats - 2)
      const cx = zone.x + 4 + i * ((zone.width - 8) / seats)
      ctx.fillStyle = row === 0 ? '#1e2834' : '#182028'
      roundRect(ctx, cx, rowY, cw, rowH * 0.85, 1)
      ctx.fill()
      // chair back (toward camera = bottom of zone)
      ctx.fillStyle = '#2a3648'
      ctx.fillRect(cx + 1, rowY + rowH * 0.55, cw - 2, rowH * 0.3)
      if (rng.next() > 0.4) {
        ctx.globalAlpha = 0.4
        ctx.fillStyle = '#0c1016'
        roundRect(ctx, cx + cw * 0.2, rowY + 2, cw * 0.55, rowH * 0.45, 1)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
  }

  // Signage on outer edge
  if (signage !== '') {
    ctx.globalAlpha = 0.8
    ctx.fillStyle = accent
    ctx.fillRect(zone.x + 4, zone.y + zone.height - 5, Math.min(48, zone.width * 0.35), 3)
    ctx.fillStyle = 'rgba(230,240,255,0.8)'
    ctx.font = `700 ${Math.max(8, zone.height * 0.22)}px "GT America Standard", sans-serif`
    ctx.textAlign = side === 'home' ? 'left' : 'right'
    ctx.textBaseline = 'bottom'
    const tx = side === 'home' ? zone.x + 6 : zone.x + zone.width - 6
    ctx.fillText(signage.toUpperCase().slice(0, 10), tx, zone.y + zone.height - 7)
  }
  ctx.restore()
}

function drawLedBoards(
  ctx: CanvasRenderingContext2D,
  layout: ArenaPerimeterLayout,
  archetype: ArenaCourtArchetype,
  ledColor: string,
  opacity: number,
  label: string,
): void {
  const count =
    archetype === 'EURO_PREMIUM' ? 6 : archetype === 'NBA_PREMIUM' ? 4 : archetype === 'NCAA_MAJOR' ? 3 : 0
  if (count === 0) return

  const z = layout.nearSideline
  const moduleW = z.width / (count + 0.5)
  const y = z.y + Math.max(2, z.height * 0.02)
  const h = Math.max(10, Math.min(22, z.height * 0.22))

  for (let i = 0; i < count; i += 1) {
    const x = z.x + moduleW * 0.25 + i * moduleW
    const w = moduleW * 0.85
    ctx.save()
    // frame
    ctx.fillStyle = '#0a0c10'
    roundRect(ctx, x, y, w, h, 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = 1
    ctx.stroke()
    // illuminated face
    ctx.globalAlpha = Math.min(0.85, opacity + 0.15)
    const face = ctx.createLinearGradient(x, y, x, y + h)
    face.addColorStop(0, shade(ledColor, 1.4))
    face.addColorStop(1, shade(ledColor, 0.7))
    ctx.fillStyle = face
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4)
    // content
    ctx.globalAlpha = 0.85
    ctx.fillStyle = 'rgba(10,12,16,0.85)'
    ctx.font = `700 ${Math.max(7, h * 0.45)}px "GT America Standard", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const text =
      i === 0
        ? label || 'HOME'
        : archetype === 'EURO_PREMIUM'
          ? ['ACME', 'LED', 'SPONSOR', 'LIVE', 'BET', 'TV'][i] ?? 'ADS'
          : i === 1
            ? 'LIVE'
            : i === 2
              ? 'GAME'
              : 'ADS'
    ctx.fillText(text.toUpperCase().slice(0, 8), x + w / 2, y + h / 2)
    ctx.restore()
  }
}

function drawScorerTable(
  ctx: CanvasRenderingContext2D,
  zone: ArenaZoneRect,
  archetype: ArenaCourtArchetype,
  ledColor: string,
  label: string,
  accent: string,
): void {
  ctx.save()
  // Desk body — may extend past lower viewport
  ctx.fillStyle = archetype === 'NCAA_SMALL_GYM' ? '#2a241c' : '#141820'
  roundRect(ctx, zone.x, zone.y, zone.width, zone.height, 3)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 1.2
  ctx.stroke()

  // Front LED / panel
  if (archetype !== 'NCAA_SMALL_GYM' && archetype !== 'YOUTH_GYM') {
    ctx.fillStyle = ledColor
    ctx.globalAlpha = 0.75
    ctx.fillRect(zone.x + 6, zone.y + 3, zone.width - 12, Math.max(3, zone.height * 0.18))
    ctx.globalAlpha = 1
  }

  // Monitors
  const monitors = archetype === 'NBA_PREMIUM' ? 5 : archetype === 'EURO_PREMIUM' ? 4 : 3
  for (let i = 0; i < monitors; i += 1) {
    const mw = zone.width / (monitors + 1.5)
    const mx = zone.x + mw * 0.6 + i * mw
    ctx.fillStyle = '#0a0e14'
    roundRect(ctx, mx, zone.y + zone.height * 0.32, mw * 0.7, zone.height * 0.4, 1)
    ctx.fill()
    ctx.fillStyle = shade(ledColor, 0.5)
    ctx.globalAlpha = 0.35
    ctx.fillRect(mx + 2, zone.y + zone.height * 0.36, mw * 0.7 - 4, zone.height * 0.28)
    ctx.globalAlpha = 1
  }

  // Chairs behind table (toward camera)
  const chairs = archetype === 'NBA_PREMIUM' ? 6 : 4
  for (let i = 0; i < chairs; i += 1) {
    const cx = zone.x + zone.width * (0.12 + i * (0.76 / chairs))
    ctx.fillStyle = '#1a222c'
    roundRect(ctx, cx, zone.y + zone.height + 2, 9, 8, 1)
    ctx.fill()
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#0c1016'
    roundRect(ctx, cx + 1, zone.y + zone.height + 1, 7, 5, 1)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // Label
  if (label !== '' && label.toUpperCase() !== 'BDM') {
    ctx.fillStyle = 'rgba(230,238,248,0.85)'
    ctx.font = `700 ${Math.max(9, zone.height * 0.28)}px "GT America Standard", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label.toUpperCase(), zone.x + zone.width / 2, zone.y + zone.height * 0.78)
  }

  // Accent corner
  ctx.fillStyle = accent
  ctx.globalAlpha = 0.5
  ctx.fillRect(zone.x + 4, zone.y + zone.height - 4, 18, 2)
  ctx.restore()
}

function drawSubstitutionZone(ctx: CanvasRenderingContext2D, zone: ArenaZoneRect, archetype: ArenaCourtArchetype): void {
  if (archetype === 'NCAA_SMALL_GYM' || archetype === 'YOUTH_GYM') return
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.strokeStyle = 'rgba(220,230,240,0.5)'
  ctx.setLineDash([4, 3])
  ctx.strokeRect(zone.x, zone.y, zone.width, zone.height)
  ctx.restore()
}

function drawTunnel(ctx: CanvasRenderingContext2D, zone: ArenaZoneRect): void {
  ctx.save()
  ctx.fillStyle = '#03050a'
  roundRect(ctx, zone.x, zone.y, zone.width, zone.height, 3)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,140,170,0.25)'
  ctx.stroke()
  // Inner depth
  ctx.fillStyle = '#000'
  ctx.fillRect(zone.x + zone.width * 0.2, zone.y + zone.height * 0.15, zone.width * 0.6, zone.height * 0.7)
  ctx.restore()
}

function drawCourtContactShadow(ctx: CanvasRenderingContext2D, layout: ArenaPerimeterLayout): void {
  ctx.save()
  pathPoly(ctx, layout.courtCorners)
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 5
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 2
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

function pathRing(
  ctx: CanvasRenderingContext2D,
  outer: readonly { readonly x: number; readonly y: number }[],
  inner: readonly { readonly x: number; readonly y: number }[],
): void {
  ctx.beginPath()
  ctx.moveTo(outer[0]!.x, outer[0]!.y)
  for (let i = 1; i < outer.length; i += 1) ctx.lineTo(outer[i]!.x, outer[i]!.y)
  ctx.closePath()
  ctx.moveTo(inner[0]!.x, inner[0]!.y)
  for (let i = inner.length - 1; i >= 0; i -= 1) ctx.lineTo(inner[i]!.x, inner[i]!.y)
  ctx.closePath()
}

function pathPoly(ctx: CanvasRenderingContext2D, pts: readonly { readonly x: number; readonly y: number }[]): void {
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]!.x, pts[i]!.y)
  ctx.closePath()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function shade(css: string, factor: number): string {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(css)
  if (m) {
    return `rgb(${Math.min(255, Math.round(Number(m[1]) * factor))},${Math.min(255, Math.round(Number(m[2]) * factor))},${Math.min(255, Math.round(Number(m[3]) * factor))})`
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(css.trim())
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16)
    return `rgb(${Math.min(255, Math.round(((n >> 16) & 255) * factor))},${Math.min(255, Math.round(((n >> 8) & 255) * factor))},${Math.min(255, Math.round((n & 255) * factor))})`
  }
  // hsl brand colors — approximate darken via overlay
  return css
}
