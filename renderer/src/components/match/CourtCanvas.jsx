import React, { useRef, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Court aspect ratio: 94 ft × 50 ft
const COURT_RATIO = 94 / 50;

// Colours (match existing dark-theme palette)
const COL_COURT_BG = "#111214";
const COL_COURT_LINE = "rgba(148, 163, 184, 0.28)";
const COL_PAINT = "rgba(148, 163, 184, 0.06)";
const COL_HOME = "rgba(59, 130, 246, 0.85)";
const COL_AWAY = "rgba(239, 68, 68, 0.75)";
const COL_HOME_RING = "rgba(59, 130, 246, 0.35)";
const COL_AWAY_RING = "rgba(239, 68, 68, 0.30)";
const COL_BALL = "#f59e0b";
const COL_BALL_GLOW = "rgba(245, 158, 11, 0.45)";
const COL_TEXT = "#e2e8f0";
const COL_NAME_BG = "rgba(0, 0, 0, 0.55)";
const COL_SCORE_FLASH = "rgba(34, 197, 94, 0.6)";

// Player chip sizing (relative to canvas width)
const CHIP_RADIUS_RATIO = 0.018;
const BALL_RADIUS_RATIO = 0.009;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** Convert normalised (0-100) court position to canvas pixels. */
function toCanvas(nx, ny, w, h, padX, padY) {
  return [padX + (nx / 100) * w, padY + (ny / 100) * h];
}

// ---------------------------------------------------------------------------
// Court drawing (cached to offscreen canvas)
// ---------------------------------------------------------------------------

function drawCourt(ctx, cw, ch, padX, padY) {
  const w = cw;
  const h = ch;

  // Map court normalised coords to pixel coords
  const px = (nx, ny) => toCanvas(nx, ny, w, h, padX, padY);

  ctx.strokeStyle = COL_COURT_LINE;
  ctx.lineWidth = 1.2;
  ctx.fillStyle = COL_PAINT;

  // --- Outer boundary ---
  ctx.strokeRect(padX, padY, w, h);

  // --- Half-court line ---
  ctx.beginPath();
  const [hx, hy0] = px(50, 0);
  const [, hy1] = px(50, 100);
  ctx.moveTo(hx, hy0);
  ctx.lineTo(hx, hy1);
  ctx.stroke();

  // --- Center circle (radius ≈ 6 ft → 6/50 *100 = 12 y-units → 12% of h) ---
  const [cx, cy] = px(50, 50);
  const centerR = (6 / 50) * h;
  ctx.beginPath();
  ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
  ctx.stroke();

  // --- Paint / Key (left & right) ---
  // Paint: 16 ft wide (32% of 50 ft), 19 ft deep (≈20.2% of 94 ft)
  const paintW = (20.2 / 100) * w;      // x-extent
  const paintH = (32 / 100) * h;        // y-extent (half = 16%)
  const paintTop = (50 - 16) / 100 * h + padY;

  // Left paint
  ctx.fillRect(padX, paintTop, paintW, paintH);
  ctx.strokeRect(padX, paintTop, paintW, paintH);

  // Right paint
  const rpX = padX + w - paintW;
  ctx.fillRect(rpX, paintTop, paintW, paintH);
  ctx.strokeRect(rpX, paintTop, paintW, paintH);

  // --- Free-throw circles ---
  const ftR = (6 / 50) * h;
  // Left
  const [ftLx, ftLy] = px(20.2, 50);
  ctx.beginPath();
  ctx.arc(ftLx, ftLy, ftR, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(ftLx, ftLy, ftR, Math.PI / 2, -Math.PI / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Right
  const [ftRx, ftRy] = px(79.8, 50);
  ctx.beginPath();
  ctx.arc(ftRx, ftRy, ftR, Math.PI / 2, -Math.PI / 2);
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(ftRx, ftRy, ftR, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // --- 3-point arcs ---
  // 3-pt radius ≈ 23.75 ft.  Basket centre at 5.6% and 94.4% of court length.
  const threeR = (23.75 / 94) * w;
  const cornerDepth = (14 / 94) * w;   // corner 3 extends ~14 ft from baseline

  // Left 3-point arc
  const [bLx, bLy] = px(5.6, 50);
  const arcAngleL = Math.acos(cornerDepth / threeR);
  ctx.beginPath();
  ctx.arc(bLx, bLy, threeR, -arcAngleL, arcAngleL);
  ctx.stroke();
  // corner lines
  const [cL0x, cL0y] = px(0, 50 - (23.75 / 50) * 100 * 0.28);
  const [cL1x, cL1y] = px(cornerDepth / w * 100, 50 - (23.75 / 50) * 100 * 0.28);
  ctx.beginPath(); ctx.moveTo(padX, bLy - threeR * Math.sin(arcAngleL)); ctx.lineTo(padX + cornerDepth, bLy - threeR * Math.sin(arcAngleL)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(padX, bLy + threeR * Math.sin(arcAngleL)); ctx.lineTo(padX + cornerDepth, bLy + threeR * Math.sin(arcAngleL)); ctx.stroke();

  // Right 3-point arc
  const [bRx, bRy] = px(94.4, 50);
  ctx.beginPath();
  ctx.arc(bRx, bRy, threeR, Math.PI - arcAngleL, Math.PI + arcAngleL);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(padX + w, bRy - threeR * Math.sin(arcAngleL)); ctx.lineTo(padX + w - cornerDepth, bRy - threeR * Math.sin(arcAngleL)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(padX + w, bRy + threeR * Math.sin(arcAngleL)); ctx.lineTo(padX + w - cornerDepth, bRy + threeR * Math.sin(arcAngleL)); ctx.stroke();

  // --- Baskets (small circles) ---
  const rimR = 3;
  ctx.beginPath();
  ctx.arc(bLx, bLy, rimR, 0, Math.PI * 2);
  ctx.strokeStyle = COL_BALL;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bRx, bRy, rimR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = COL_COURT_LINE;

  // --- Restricted area (4 ft semi-circle) ---
  const raR = (4 / 94) * w;
  ctx.beginPath();
  ctx.arc(bLx, bLy, raR, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bRx, bRy, raR, Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CourtCanvas({
  homePlayers = [],
  awayPlayers = [],
  tickBuffer,          // useTickBuffer() return value
  possessionTeam,
  lastEvent,
  showNames = true,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const offscreenRef = useRef(null);
  const animRef = useRef(null);
  const scoreFlashRef = useRef(0);   // timestamp of last score for flash effect

  // Track last event for score flash
  useEffect(() => {
    if (lastEvent && (lastEvent.event === "3pt_make" || lastEvent.event === "2pt_make" || lastEvent.event === "putback_make")) {
      scoreFlashRef.current = performance.now();
    }
  }, [lastEvent]);

  // Build court offscreen canvas on mount / resize
  const buildOffscreen = useCallback((cw, ch) => {
    const pad = 8;
    const courtW = cw - pad * 2;
    const courtH = ch - pad * 2;
    const oc = document.createElement("canvas");
    oc.width = cw;
    oc.height = ch;
    const octx = oc.getContext("2d");

    // Background
    octx.fillStyle = COL_COURT_BG;
    octx.fillRect(0, 0, cw, ch);

    drawCourt(octx, courtW, courtH, pad, pad);
    offscreenRef.current = { canvas: oc, padX: pad, padY: pad, courtW, courtH };
  }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(w / COURT_RATIO);
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      buildOffscreen(canvas.width, canvas.height);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [buildOffscreen]);

  // ---------------------------------------------------------------------------
  // Animation loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let running = true;

    const frame = () => {
      if (!running) return;

      const cw = canvas.width;
      const ch = canvas.height;
      if (cw === 0 || ch === 0) {
        animRef.current = requestAnimationFrame(frame);
        return;
      }

      // 1. Draw cached court
      const oc = offscreenRef.current;
      if (oc) {
        ctx.drawImage(oc.canvas, 0, 0);
      } else {
        ctx.fillStyle = COL_COURT_BG;
        ctx.fillRect(0, 0, cw, ch);
      }

      const padX = oc ? oc.padX : 8;
      const padY = oc ? oc.padY : 8;
      const courtW = oc ? oc.courtW : cw - 16;
      const courtH = oc ? oc.courtH : ch - 16;

      const chipR = Math.max(8, cw * CHIP_RADIUS_RATIO);
      const ballR = Math.max(4, cw * BALL_RADIUS_RATIO);

      // 2. Get interpolated positions from tick buffer
      const interp = tickBuffer ? tickBuffer.consumeTick() : null;
      let positions = null; // [[x,y,hasBall,action], ...] len=10
      let ball = null;

      if (interp && interp.prev && interp.next) {
        const t = easeInOut(interp.t);
        positions = [];
        const prevP = interp.prev.p;
        const nextP = interp.next.p;
        for (let i = 0; i < Math.min(prevP.length, nextP.length); i++) {
          const prevE = prevP[i].length >= 5 ? Number(prevP[i][4] ?? 100) : 100;
          const nextE = nextP[i].length >= 5 ? Number(nextP[i][4] ?? prevE) : prevE;
          positions.push([
            lerp(prevP[i][0], nextP[i][0], t),
            lerp(prevP[i][1], nextP[i][1], t),
            nextP[i][2],
            nextP[i][3],
            lerp(prevE, nextE, t),
          ]);
        }
        // Ball interpolation
        const pb = interp.prev.b;
        const nb = interp.next.b;
        ball = {
          x: lerp(pb.x, nb.x, t),
          y: lerp(pb.y, nb.y, t),
          s: nb.s,
          h: nb.h,
        };
      }

      const hasPositions = positions && positions.length >= 10;
      if (!hasPositions) {
        positions = null;
        ball = null;
      }

      const px = (nx, ny) => toCanvas(nx, ny, courtW, courtH, padX, padY);

      // 4. Score flash effect
      const now = performance.now();
      const flashAge = now - scoreFlashRef.current;
      if (flashAge < 600) {
        const alpha = Math.max(0, 1 - flashAge / 600) * 0.4;
        ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`;
        ctx.fillRect(0, 0, cw, ch);
      }

      // 5. Draw players
      if (positions) {
        const homeJerseys = homePlayers.map((p) => {
          const d = p.data || p;
          return d.bio?.jersey_number ?? d.jersey_number ?? "";
        });
        const awayJerseys = awayPlayers.map((p) => {
          const d = p.data || p;
          return d.bio?.jersey_number ?? d.jersey_number ?? "";
        });

        for (let i = 0; i < 10; i++) {
          const isHome = i < 5;
          const slot = isHome ? i : i - 5;
          const [nx, ny, hasBall, action, energyRaw] = positions[i];
          const [cx, cy] = px(nx, ny);

          const col = isHome ? COL_HOME : COL_AWAY;
          const ringCol = isHome ? COL_HOME_RING : COL_AWAY_RING;
          const energy = Number.isFinite(Number(energyRaw)) ? Math.max(0, Math.min(100, Number(energyRaw))) : 100;
          const energy01 = energy / 100;
          const energyCol =
            energy01 >= 0.66 ? "rgba(34, 197, 94, 0.75)" :
            energy01 >= 0.35 ? "rgba(245, 158, 11, 0.75)" :
            "rgba(239, 68, 68, 0.75)";

          // Outer ring
          ctx.beginPath();
          ctx.arc(cx, cy, chipR + 3, 0, Math.PI * 2);
          ctx.fillStyle = ringCol;
          ctx.fill();

          // Energy ring (FM-like condition)
          ctx.beginPath();
          ctx.arc(cx, cy, chipR + 6, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, chipR + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * energy01);
          ctx.strokeStyle = energyCol;
          ctx.lineWidth = 3;
          ctx.stroke();

          // Main chip
          ctx.beginPath();
          ctx.arc(cx, cy, chipR, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();

          // Ball holder highlight
          if (hasBall) {
            ctx.beginPath();
            ctx.arc(cx, cy, chipR + 5, 0, Math.PI * 2);
            ctx.strokeStyle = COL_BALL;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Screen indicator
          if (action === "s") {
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
            ctx.fillRect(cx - chipR * 0.6, cy - chipR - 4, chipR * 1.2, 3);
          }

          // Jersey number
          const jersey = isHome ? homeJerseys[slot] : awayJerseys[slot];
          if (jersey !== "" && jersey != null) {
            ctx.fillStyle = COL_TEXT;
            ctx.font = `bold ${Math.max(9, chipR * 0.85)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(jersey), cx, cy + 0.5);
          }

          // Name label
          if (showNames) {
            const name = isHome
              ? (homePlayers[slot]?.name?.split(" ")[0] || "")
              : (awayPlayers[slot]?.name?.split(" ")[0] || "");
            if (name) {
              ctx.font = `${Math.max(8, chipR * 0.65)}px sans-serif`;
              const tw = ctx.measureText(name).width;
              ctx.fillStyle = COL_NAME_BG;
              ctx.fillRect(cx - tw / 2 - 2, cy + chipR + 2, tw + 4, chipR * 0.8);
              ctx.fillStyle = col;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillText(name, cx, cy + chipR + 3);
            }
          }
        }
      }

      // 6. Draw ball
      if (ball) {
        const [bx, by] = px(ball.x, ball.y);

        // Glow
        ctx.beginPath();
        ctx.arc(bx, by, ballR + 4, 0, Math.PI * 2);
        ctx.fillStyle = COL_BALL_GLOW;
        ctx.fill();

        // Ball
        ctx.beginPath();
        ctx.arc(bx, by, ballR, 0, Math.PI * 2);
        ctx.fillStyle = COL_BALL;
        ctx.fill();

        // Shot indicator
        if (ball.s === "shot") {
          ctx.beginPath();
          ctx.arc(bx, by, ballR + 8, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      animRef.current = requestAnimationFrame(frame);
    };

    animRef.current = requestAnimationFrame(frame);
    return () => {
      running = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [tickBuffer, homePlayers, awayPlayers, possessionTeam, showNames]);

  return (
    <div className="court-canvas-panel">
      <div className="court2d-header">Vista 2D</div>
      <div ref={containerRef} className="court-canvas-container">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export default CourtCanvas;
