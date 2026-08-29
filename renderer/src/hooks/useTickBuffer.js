import { useCallback, useRef, useMemo } from "react";

/**
 * Ring-buffer hook that stores position-tick frames streamed from the backend
 * and exposes an interpolation helper consumed by the CourtCanvas render loop.
 *
 * Usage:
 *   const tb = useTickBuffer(speed);      // speed: 1 | 2 | 4
 *   tb.pushTick(frame);                   // called on "match.tick" event
 *   const interp = tb.consumeTick();      // called every rAF frame
 *   tb.reset();                           // on match end / reset
 */

const MAX_BUFFER = 60;

// Continuous match engine tick cadence (ms).
// 1x aims to be real-time at 100ms/tick; higher speeds accelerate by emitting ticks more frequently.
const SPEED_INTERVAL = {
  1: 100,
  2: 50,
  4: 25,
};

export function useTickBuffer(speed = 1) {
  const bufferRef = useRef([]);
  const lastConsumeRef = useRef(0);

  const tickIntervalMs = useMemo(
    () => SPEED_INTERVAL[speed] || 100,
    [speed],
  );

  /** Push a new tick frame into the ring buffer. */
  const pushTick = useCallback((frame) => {
    if (!frame) return;
    const buf = bufferRef.current;
    const last = buf[buf.length - 1];
    if (
      last &&
      typeof frame.t === "number" &&
      typeof last.t === "number" &&
      frame.t < last.t
    ) {
      // New possession: reset buffer to avoid cross-court interpolation.
      bufferRef.current = [];
      lastConsumeRef.current = 0;
    }
    bufferRef.current.push(frame);
    if (bufferRef.current.length > MAX_BUFFER) {
      bufferRef.current.splice(0, bufferRef.current.length - MAX_BUFFER);
    }
  }, []);

  /**
   * Called every requestAnimationFrame.
   * Returns { prev, next, t } where t ∈ [0,1] is the interpolation fraction
   * between the two surrounding tick frames.
   * Returns null when there are not enough frames to interpolate.
   */
  const consumeTick = useCallback(() => {
    const buf = bufferRef.current;
    if (buf.length < 2) return null;

    const now = performance.now();
    if (lastConsumeRef.current === 0) {
      lastConsumeRef.current = now;
    }

    const elapsed = now - lastConsumeRef.current;
    if (elapsed >= tickIntervalMs) {
      // Advance: drop the oldest frame
      buf.shift();
      lastConsumeRef.current = now;
    }

    if (buf.length < 2) return null;

    const t = Math.min(
      1,
      Math.max(0, (now - lastConsumeRef.current) / tickIntervalMs),
    );
    return { prev: buf[0], next: buf[1], t };
  }, [tickIntervalMs]);

  /** Clear all buffered frames (e.g. on match reset). */
  const reset = useCallback(() => {
    bufferRef.current = [];
    lastConsumeRef.current = 0;
  }, []);

  return { pushTick, consumeTick, reset, tickIntervalMs };
}

export default useTickBuffer;
