/**
 * BT4E/F/J: shot ecology from the event stream. For every released shot: its zone and creation type (labels the engine emits), what
 * happened to it (made, blocked, shooting foul) and what it earned, including the free throws of its foul.
 */
import type { MatchNextEvent } from '@/engine/match-next'

export interface ShotRow {
  readonly zone: string
  readonly creation: string
  readonly points: number
  readonly shooter: string
  readonly made: boolean
  readonly blocked: boolean
  readonly fouled: boolean
  readonly andOne: boolean
  readonly freeThrowPoints: number
  readonly distance: number
  readonly probability: number
  readonly contest: number
}

export function shotRows(events: readonly MatchNextEvent[]): readonly ShotRow[] {
  const rows: ShotRow[] = []
  for (let index = 0; index < events.length; index += 1) {
    const shot = events[index]!
    if (shot.type !== 'shotReleased') continue
    const shooter = String(shot.shooterPlayerId)
    let made = false
    let blocked = false
    let foul: MatchNextEvent | undefined
    for (let next = index + 1; next < events.length; next += 1) {
      const event = events[next]!
      if (event.t > shot.t + 9) break
      if (event.type === 'shotMade' && String(event.shooterPlayerId) === shooter) made = true
      if (event.type === 'shotBlocked' && String(event.shooterPlayerId) === shooter && event.t <= shot.t + 1) blocked = true
      if (event.type === 'foul' && event.foulType === 'SHOOTING' && String(event.victimPlayerId) === shooter && event.t >= shot.t - 1) foul = event
    }
    let freeThrowPoints = 0
    if (foul !== undefined) {
      const total = foul.freeThrowsAwarded ?? 0
      let counted = 0
      for (let next = index + 1; next < events.length && counted < total; next += 1) {
        const event = events[next]!
        if (event.t > foul.t + 200) break
        if ((event.type === 'freeThrowMade' || event.type === 'freeThrowMissed') && String(event.shooterPlayerId) === shooter && event.t >= foul.t) {
          counted += 1
          if (event.type === 'freeThrowMade') freeThrowPoints += 1
        }
      }
    }
    rows.push({
      zone: shot.shotZone ?? '?', creation: shot.shotCreation ?? '?', points: shot.points ?? 2, shooter, made, blocked, fouled: foul !== undefined,
      andOne: foul?.foulResolution === 'AND_ONE', freeThrowPoints, distance: shot.shotDistanceMeters ?? 0, probability: shot.shotProbability ?? 0, contest: shot.contestScore ?? 0,
    })
  }
  return rows
}

export interface EcologyCell { readonly n: number; readonly share: number; readonly fgPct: number; readonly blockedPct: number; readonly fouledPct: number; readonly ftPerShot: number; readonly pointsPerShot: number; readonly meanProbability: number; readonly meanContest: number }

export function summarizeRows(rows: readonly ShotRow[], total = rows.length): EcologyCell {
  const n = rows.length
  const r = (v: number): number => Number(v.toFixed(3))
  const div = (v: number): number => (n === 0 ? 0 : v / n)
  const fieldPoints = rows.reduce((a, row) => a + (row.made ? row.points : 0), 0)
  const ftPoints = rows.reduce((a, row) => a + row.freeThrowPoints, 0)
  return {
    n, share: r(n / Math.max(1, total)), fgPct: r(div(rows.filter((row) => row.made).length)), blockedPct: r(div(rows.filter((row) => row.blocked).length)), fouledPct: r(div(rows.filter((row) => row.fouled).length)),
    ftPerShot: r(div(rows.reduce((a, row) => a + (row.fouled ? 1 : 0), 0))), pointsPerShot: r(div(fieldPoints + ftPoints)), meanProbability: r(div(rows.reduce((a, row) => a + row.probability, 0))), meanContest: r(div(rows.reduce((a, row) => a + row.contest, 0))),
  }
}

export function ecologyTables(rows: readonly ShotRow[], zones: readonly string[], creations: readonly string[]): { byZone: Record<string, EcologyCell>; byCreation: Record<string, EcologyCell>; zoneByCreation: Record<string, Record<string, number>> } {
  const byZone = Object.fromEntries(zones.map((z) => [z, summarizeRows(rows.filter((row) => row.zone === z), rows.length)]))
  const byCreation = Object.fromEntries(creations.map((c) => [c, summarizeRows(rows.filter((row) => row.creation === c), rows.length)]))
  const zoneByCreation = Object.fromEntries(creations.map((c) => [c, Object.fromEntries(zones.map((z) => [z, rows.filter((row) => row.creation === c && row.zone === z).length]))]))
  return { byZone, byCreation, zoneByCreation }
}
