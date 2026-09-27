import type { Player, PlayerTruthRatings } from '@/domain/player'
import { getAvailableRosterPlayers, getTeam, getTeamLineup, type GameWorld } from '@/domain/world'
import type { GameDate } from '@/domain/date'
import type { PlayerId, TeamId } from '@/domain/ids'
import { BASKETBALL_POSITIONS } from '@/domain/primitives'
import { getLineupAssignments, validateTeamLineup } from '@/domain/tactics'
import type { WorldRepairReport } from '@/domain/repair'
import type { TeamStrength } from '@/engine/match'
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
/** Rating keys read directly for roster-evaluation purposes (starter ranking, team strength). */
const IMPACT_RATING_KEYS = ['RIM_FINISHING', 'CONTACT_FINISHING', 'SHORT_MIDRANGE', 'LONG_MIDRANGE', 'THREE_POINT_STATIC', 'FREE_THROW', 'DRIVE_CREATION', 'PASSING_VISION', 'BALL_CONTROL', 'POINT_OF_ATTACK_DEFENSE', 'LATERAL_DEFENSE', 'RIM_PROTECTION', 'OFFENSIVE_REBOUNDING', 'DEFENSIVE_REBOUNDING', 'SPEED', 'AGILITY'] as const satisfies readonly (keyof PlayerTruthRatings)[]

/** Contextual roster-evaluation aggregate scoped to starter ranking and team-strength display. */
export function calculatePlayerImpact(player: Player): number { const r = player.basketball.ratings; return IMPACT_RATING_KEYS.reduce((sum, key) => sum + r[key], 0) / IMPACT_RATING_KEYS.length }

export function selectStartingFive(world: GameWorld, teamId: TeamId, onDate: GameDate = world.currentDate, allowedPlayerIds?: readonly PlayerId[]): readonly PlayerId[] {
  const allowed = allowedPlayerIds === undefined ? undefined : new Set(allowedPlayerIds)
  const roster = getAvailableRosterPlayers(world, teamId, onDate).filter((player) => allowed === undefined || allowed.has(player.id))
  if (roster.length < 5) throw new Error('Insufficient available players')
  const selected: PlayerId[] = []
  for (const position of POSITIONS) {
    const candidates = roster.filter((player) => player.basketball.primaryPosition === position && !selected.includes(player.id))
    const pool = candidates.length ? candidates : roster.filter((player) => !selected.includes(player.id))
    const chosen = [...pool].sort((a, b) => calculatePlayerImpact(b) - calculatePlayerImpact(a) || a.id.localeCompare(b.id))[0]
    if (chosen) selected.push(chosen.id)
  }
  return selected
}

/** Existing caller surface; repair evidence is available from resolveStartingFiveWithRepair. */
export function resolveStartingFive(world: GameWorld, teamId: TeamId, onDate: GameDate = world.currentDate, allowedPlayerIds?: readonly PlayerId[]): readonly PlayerId[] {
  return resolveStartingFiveWithRepair(world, teamId, onDate, allowedPlayerIds).playerIds
}

/** Preserves usable saved starters and fills only unavailable/empty slots from the legal squad. */
export function resolveStartingFiveWithRepair(world: GameWorld, teamId: TeamId, onDate: GameDate = world.currentDate, allowedPlayerIds?: readonly PlayerId[]): { readonly playerIds: readonly PlayerId[]; readonly report: WorldRepairReport } {
  const team = getTeam(world, teamId)
  const available = new Set(allowedPlayerIds ?? getAvailableRosterPlayers(world, teamId, onDate).map((player) => player.id))
  if (available.size < 5) throw new RangeError('Insufficient available players')
  const lineup = getTeamLineup(world, teamId)
  validateTeamLineup(lineup, team.rosterPlayerIds)
  if (lineup.teamId !== teamId) throw new RangeError(`Lineup belongs to a different team: ${lineup.teamId}`)

  const assignments = getLineupAssignments(lineup)
  const explicitStarters = BASKETBALL_POSITIONS.map((position) => lineup.starters[position])
  const validStarters = explicitStarters.filter((playerId): playerId is PlayerId => playerId !== undefined && available.has(playerId))
  if (validStarters.length === 5 && new Set(validStarters).size === 5) {
    return { playerIds: validStarters, report: lineupReport(teamId, 'ALREADY_VALID', onDate, validStarters, validStarters, 'None; the saved starting five is eligible and available.') }
  }

  if (assignments.length === 0) {
    const playerIds = selectStartingFive(world, teamId, onDate, allowedPlayerIds)
    return { playerIds, report: lineupReport(teamId, 'ALREADY_VALID', onDate, [], playerIds, 'Used the existing deterministic default lineup authority.') }
  }

  const selected: PlayerId[] = []
  for (const position of BASKETBALL_POSITIONS) {
    const saved = lineup.starters[position]
    if (saved !== undefined && available.has(saved)) {
      selected.push(saved)
      continue
    }
    const candidates = [...available].filter((id) => !selected.includes(id)).map((id) => world.players[id]!)
    const positional = candidates.filter((player) => player.basketball.primaryPosition === position)
    const pool = positional.length > 0 ? positional : candidates
    const chosen = [...pool].sort((a, b) => calculatePlayerImpact(b) - calculatePlayerImpact(a) || a.id.localeCompare(b.id))[0]
    if (chosen === undefined) throw new RangeError(`No eligible player can fill lineup slot ${position}`)
    selected.push(chosen.id)
  }
  return { playerIds: selected, report: lineupReport(teamId, 'RECOVERABLE', onDate, explicitStarters.filter((id): id is PlayerId => id !== undefined), selected, 'Preserved available saved starters and deterministically filled only unavailable or empty slots.') }
}

export function calculateTeamStrength(world: GameWorld, teamId: TeamId, onDate: GameDate = world.currentDate, allowedPlayerIds?: readonly PlayerId[]): TeamStrength {
  const starters = resolveStartingFive(world, teamId, onDate, allowedPlayerIds)
  return { teamId, value: starters.reduce((sum, id) => sum + calculatePlayerImpact(world.players[id]!), 0) / 5 }
}

function lineupReport(teamId: TeamId, classification: WorldRepairReport['classification'], date: GameDate, previous: readonly PlayerId[], next: readonly PlayerId[], actionApplied: string): WorldRepairReport {
  return { repairKind: 'MATCH_LINEUP', sourceDomain: 'TEAM_LINEUP', targetEntity: String(teamId), classification, previousStateSummary: `date=${date}; starters=${previous.join(',') || 'default'}`, actionApplied, resultingStateSummary: `date=${date}; starters=${next.join(',')}`, diagnostics: classification === 'RECOVERABLE' ? [{ code: 'LINEUP_FILLED_FROM_ELIGIBLE_ROSTER', message: 'The saved lineup contained an unavailable or empty starter slot; available saved starters were preserved.' }] : [], worldChanged: false, userActionRequired: false }
}
