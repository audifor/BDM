/** Minimal, bounded team cohesion/tactical-familiarity value (0-100) driven by tactical training. */
export function clampTeamCohesion(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Team cohesion value must be finite')
  return Math.max(0, Math.min(100, value))
}
