/**
 * Fictional club crests for CT-CANON visual preview only.
 * Not production assets — demonstrates centerMark wiring.
 */

export type FictionalCrestStyle = 'celtics' | 'duke' | 'zaragoza' | 'hawks'

export function createFictionalClubCrest(
  style: FictionalCrestStyle,
  size = 512,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) return canvas

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.46

  switch (style) {
    case 'celtics':
      drawCelticsCrest(ctx, cx, cy, r)
      break
    case 'duke':
      drawDukeCrest(ctx, cx, cy, r)
      break
    case 'zaragoza':
      drawZaragozaCrest(ctx, cx, cy, r)
      break
    case 'hawks':
      drawHawksCrest(ctx, cx, cy, r)
      break
  }
  return canvas
}

function drawCelticsCrest(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  // Outer gold ring
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#c4a035'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2)
  ctx.fillStyle = '#0d5c2e'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2)
  ctx.strokeStyle = '#f0d878'
  ctx.lineWidth = r * 0.04
  ctx.stroke()

  // Shamrock (3 lobes)
  ctx.fillStyle = '#f5e6a8'
  for (const a of [-Math.PI / 2, -Math.PI / 2 + 2.1, -Math.PI / 2 - 2.1]) {
    const lx = cx + Math.cos(a) * r * 0.22
    const ly = cy + Math.sin(a) * r * 0.18 - r * 0.02
    ctx.beginPath()
    ctx.ellipse(lx, ly, r * 0.2, r * 0.16, a, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillRect(cx - r * 0.04, cy + r * 0.05, r * 0.08, r * 0.28)

  ctx.fillStyle = '#f5e6a8'
  ctx.font = `800 ${r * 0.28}px "GT America Standard", Impact, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('BC', cx, cy + r * 0.52)

  ctx.font = `700 ${r * 0.11}px "GT America Standard", sans-serif`
  ctx.fillStyle = '#c4a035'
  ctx.fillText('BOSTON', cx, cy - r * 0.55)
}

function drawDukeCrest(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  // Shield
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.92)
  ctx.lineTo(cx + r * 0.72, cy - r * 0.55)
  ctx.lineTo(cx + r * 0.68, cy + r * 0.25)
  ctx.quadraticCurveTo(cx + r * 0.2, cy + r * 0.95, cx, cy + r * 0.98)
  ctx.quadraticCurveTo(cx - r * 0.2, cy + r * 0.95, cx - r * 0.68, cy + r * 0.25)
  ctx.lineTo(cx - r * 0.72, cy - r * 0.55)
  ctx.closePath()
  ctx.fillStyle = '#003087'
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = r * 0.05
  ctx.stroke()

  // Inner panel
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.72)
  ctx.lineTo(cx + r * 0.52, cy - r * 0.42)
  ctx.lineTo(cx + r * 0.48, cy + r * 0.15)
  ctx.quadraticCurveTo(cx + r * 0.12, cy + r * 0.72, cx, cy + r * 0.75)
  ctx.quadraticCurveTo(cx - r * 0.12, cy + r * 0.72, cx - r * 0.48, cy + r * 0.15)
  ctx.lineTo(cx - r * 0.52, cy - r * 0.42)
  ctx.closePath()
  ctx.fillStyle = '#001f5b'
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = `900 ${r * 0.85}px "GT America Standard", Georgia, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('D', cx, cy - r * 0.02)

  ctx.font = `700 ${r * 0.12}px "GT America Standard", sans-serif`
  ctx.fillStyle = '#9ec5ff'
  ctx.fillText('BLUE DEVILS', cx, cy + r * 0.48)
}

function drawZaragozaCrest(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  // Circular Iberian crest
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#8b1a1a'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2)
  ctx.fillStyle = '#f2d48a'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2)
  ctx.fillStyle = '#6e1212'
  ctx.fill()

  // Lion-ish mark (simplified geometric)
  ctx.fillStyle = '#f2d48a'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.18, cy + r * 0.25)
  ctx.lineTo(cx - r * 0.08, cy - r * 0.35)
  ctx.lineTo(cx + r * 0.22, cy - r * 0.15)
  ctx.lineTo(cx + r * 0.05, cy + r * 0.08)
  ctx.lineTo(cx + r * 0.28, cy + r * 0.32)
  ctx.lineTo(cx - r * 0.05, cy + r * 0.18)
  ctx.closePath()
  ctx.fill()

  // Crown hint
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.28, cy - r * 0.42)
  ctx.lineTo(cx - r * 0.18, cy - r * 0.62)
  ctx.lineTo(cx, cy - r * 0.48)
  ctx.lineTo(cx + r * 0.18, cy - r * 0.62)
  ctx.lineTo(cx + r * 0.28, cy - r * 0.42)
  ctx.closePath()
  ctx.fillStyle = '#f2d48a'
  ctx.fill()

  ctx.fillStyle = '#f2d48a'
  ctx.font = `800 ${r * 0.32}px "GT America Standard", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('CZ', cx, cy + r * 0.52)

  ctx.font = `700 ${r * 0.1}px "GT America Standard", sans-serif`
  ctx.fillText('ZARAGOZA', cx, cy + r * 0.72)
}

function drawHawksCrest(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  // Simple school seal
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#5c3a1e'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2)
  ctx.fillStyle = '#e8d5b0'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2)
  ctx.fillStyle = '#3d2614'
  ctx.fill()

  // Wing / hawk silhouette
  ctx.fillStyle = '#e8d5b0'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.55, cy + r * 0.05)
  ctx.quadraticCurveTo(cx - r * 0.1, cy - r * 0.45, cx + r * 0.05, cy - r * 0.1)
  ctx.quadraticCurveTo(cx + r * 0.35, cy - r * 0.35, cx + r * 0.55, cy + r * 0.08)
  ctx.quadraticCurveTo(cx + r * 0.15, cy - r * 0.05, cx, cy + r * 0.2)
  ctx.quadraticCurveTo(cx - r * 0.2, cy + r * 0.05, cx - r * 0.55, cy + r * 0.05)
  ctx.fill()

  // Beak
  ctx.beginPath()
  ctx.moveTo(cx + r * 0.02, cy - r * 0.08)
  ctx.lineTo(cx + r * 0.22, cy + r * 0.02)
  ctx.lineTo(cx + r * 0.02, cy + r * 0.08)
  ctx.closePath()
  ctx.fillStyle = '#d4a24a'
  ctx.fill()

  ctx.fillStyle = '#e8d5b0'
  ctx.font = `800 ${r * 0.26}px "GT America Standard", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('RH', cx, cy + r * 0.48)

  ctx.font = `700 ${r * 0.1}px "GT America Standard", sans-serif`
  ctx.fillText('HAWKS', cx, cy + r * 0.68)
}

export function crestStyleForScenario(scenarioId: string): FictionalCrestStyle {
  if (scenarioId.includes('boston') || scenarioId.includes('celtic')) return 'celtics'
  if (scenarioId.includes('duke')) return 'duke'
  if (scenarioId.includes('zaragoza') || scenarioId.includes('casademont')) return 'zaragoza'
  return 'hawks'
}
