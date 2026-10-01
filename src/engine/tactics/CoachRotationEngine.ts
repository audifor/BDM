import type { Player } from '@/domain/player'
import type { BasketballPosition } from '@/domain/primitives'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { TeamLineup, TeamRotationIntent } from '@/domain/tactics'
import type { StaffPerson } from '@/domain/staff'
import type { CoachRpgProfile } from '@/domain/coachRpg'
import type { MatchTacticalPlan } from '@/engine/match'

export const COACH_ROTATION_POSITIONS: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']

export interface CoachRotationPlan {
  readonly teamId: TeamId
  readonly startingLineup: readonly PlayerId[]
  readonly roleByPlayerId: Readonly<Partial<Record<PlayerId, BasketballPosition>>>
  readonly roleFitByPlayerId: Readonly<Partial<Record<PlayerId, Readonly<Partial<Record<BasketballPosition, number>>>>>>
  readonly expectedMinutesByPlayerId: Readonly<Partial<Record<PlayerId, number>>>
  readonly minutesByPeriod: Readonly<Record<PlayerId, readonly number[]>>
  readonly rotationInstructions: readonly { readonly period: number; readonly clockThresholdSeconds: number; readonly playerOutId: PlayerId; readonly playerInId: PlayerId }[]
  readonly rotationDepth: number
  /** Larger values indicate a coach who tolerates a little more fatigue before reacting. */
  readonly fatigueTolerance: number
  readonly diagnostics: {
    readonly lineupSource: 'SAVED_USER_LINEUP' | 'CONTEXTUAL_COACH_SELECTION'
    readonly coachId?: string
    readonly reasons: readonly string[]
  }
}

export interface CoachRotationInput {
  readonly teamId: TeamId
  readonly squad: readonly PlayerId[]
  readonly players: Readonly<Record<PlayerId, Player>>
  readonly fatigueByPlayerId: Readonly<Record<PlayerId, number>>
  readonly savedLineup: TeamLineup
  readonly rotationIntent?: TeamRotationIntent
  readonly respectSavedLineup: boolean
  readonly matchTactics: MatchTacticalPlan
  readonly opponentPlayers: readonly Player[]
  readonly coach?: { readonly id: string; readonly staff?: StaffPerson; readonly rpg?: CoachRpgProfile }
  readonly regulationPeriodMinutes: readonly number[]
}

const ROLE_RATINGS: Readonly<Record<BasketballPosition, readonly (keyof Player['basketball']['ratings'])[]>> = {
  PG: ['BALL_CONTROL', 'PASSING_ACCURACY', 'PASSING_VISION', 'DECISION_MAKING', 'PRESSURE_HANDLING', 'POINT_OF_ATTACK_DEFENSE', 'SPEED'],
  SG: ['THREE_POINT_STATIC', 'MOVEMENT_SHOOTING', 'OFF_BALL_MOVEMENT', 'POINT_OF_ATTACK_DEFENSE', 'LATERAL_DEFENSE', 'SPEED'],
  SF: ['THREE_POINT_STATIC', 'RIM_FINISHING', 'LATERAL_DEFENSE', 'DEFENSIVE_AWARENESS', 'DEFENSIVE_REBOUNDING', 'SPEED'],
  PF: ['RIM_FINISHING', 'STRENGTH', 'SCREENING', 'RIM_PROTECTION', 'OFFENSIVE_REBOUNDING', 'DEFENSIVE_REBOUNDING'],
  C: ['RIM_FINISHING', 'STRENGTH', 'RIM_PROTECTION', 'DEFENSIVE_REBOUNDING', 'OFFENSIVE_REBOUNDING', 'POST_DEFENSE'],
}

/** One deterministic, game-contextual authority for the starting five and planned rotation. */
export function createCoachRotationPlan(input: CoachRotationInput): CoachRotationPlan {
  const available = [...new Set(input.squad)].filter((id) => input.players[id] !== undefined).sort((a, b) => String(a).localeCompare(String(b)))
  if (available.length < 5) throw new RangeError('Coach requires five available players')
  const roleFitByPlayerId = deriveRoleFits(input, available)
  const anchored = new Map<BasketballPosition, PlayerId>()
  if (input.respectSavedLineup) {
    for (const position of COACH_ROTATION_POSITIONS) {
      const playerId = input.savedLineup.starters[position]
      if (playerId !== undefined && available.includes(playerId)) anchored.set(position, playerId)
    }
  }
  const saved = input.respectSavedLineup ? COACH_ROTATION_POSITIONS.map((position) => input.savedLineup.starters[position]) : []
  const validSaved = saved.length === 5 && saved.every((playerId): playerId is PlayerId => playerId !== undefined && available.includes(playerId)) && new Set(saved).size === 5
  const startingLineup = validSaved
    ? saved as PlayerId[]
    : selectContextualLineup(input, available, roleFitByPlayerId, anchored)
  const roleByPlayerId: Partial<Record<PlayerId, BasketballPosition>> = {}
  for (const [index, position] of COACH_ROTATION_POSITIONS.entries()) {
    const assigned = input.respectSavedLineup && validSaved ? input.savedLineup.starters[position] : startingLineup[index]
    if (assigned !== undefined) roleByPlayerId[assigned] = position
  }
  for (const playerId of available) {
    if (roleByPlayerId[playerId] !== undefined) continue
    roleByPlayerId[playerId] = [...COACH_ROTATION_POSITIONS].sort((a, b) => (roleFitByPlayerId[playerId]?.[b] ?? 0) - (roleFitByPlayerId[playerId]?.[a] ?? 0) || COACH_ROTATION_POSITIONS.indexOf(a) - COACH_ROTATION_POSITIONS.indexOf(b))[0]
  }

  const rotationOrder = available.map((playerId) => ({
    playerId,
    fit: roleByPlayerId[playerId] === undefined
      ? Math.max(...COACH_ROTATION_POSITIONS.map((position) => roleFitByPlayerId[playerId]?.[position] ?? 0))
      : roleFitByPlayerId[playerId]?.[roleByPlayerId[playerId]!] ?? 0,
  })).sort((a, b) => b.fit - a.fit || String(a.playerId).localeCompare(String(b.playerId)))
  const shortRotation = input.coach?.rpg?.professionalTraits.some((trait) => String(trait) === 'shortRotationCoach') ?? false
  const strongDepth = rotationOrder.filter((item) => item.fit >= 52).length
  const rotationDepth = Math.min(available.length, Math.max(7, Math.min(shortRotation ? 8 : 10, strongDepth || 8)))
  const minuteTargets = validMinuteIntent(input.rotationIntent?.minutesByPeriod, available, input.regulationPeriodMinutes)
    ? input.rotationIntent!.minutesByPeriod as Readonly<Record<PlayerId, readonly number[]>>
    : allocateMinuteTargets(rotationOrder.slice(0, rotationDepth).map((item) => item.playerId), startingLineup, roleFitByPlayerId, input.regulationPeriodMinutes)
  const rotationInstructions = (input.rotationIntent?.instructions ?? []).filter((instruction) => instruction.period >= 1
    && instruction.period <= input.regulationPeriodMinutes.length
    && Number.isInteger(instruction.period)
    && Number.isFinite(instruction.clockThresholdSeconds)
    && instruction.clockThresholdSeconds >= 0
    && instruction.clockThresholdSeconds <= input.regulationPeriodMinutes[instruction.period - 1]! * 60
    && instruction.playerOutId !== instruction.playerInId
    && available.includes(instruction.playerOutId)
    && available.includes(instruction.playerInId))
  const expectedMinutesByPlayerId: Partial<Record<PlayerId, number>> = {}
  for (const [playerId, byPeriod] of Object.entries(minuteTargets) as [PlayerId, readonly number[]][]) {
    expectedMinutesByPlayerId[playerId] = byPeriod.reduce((sum, minutes) => sum + minutes, 0)
  }
  const adaptability = input.coach?.staff?.professional.attributes.adaptability ?? 50
  const fatigueTolerance = clamp(0.94 + (adaptability - 50) / 1000 + (shortRotation ? 0.04 : 0), 0.82, 1.12)
  const reasons = validSaved
    ? ['Kept the user-saved starting five.', 'Rotation targets adapt to available depth and player condition.']
    : ['Selected a role-balanced five from available players.', 'Compared ball handling, spacing, defense, size, rebounding, tactics, opponent context, and fatigue.']
  return {
    teamId: input.teamId,
    startingLineup,
    roleByPlayerId,
    roleFitByPlayerId,
    expectedMinutesByPlayerId,
    minutesByPeriod: minuteTargets,
    rotationInstructions,
    rotationDepth,
    fatigueTolerance,
    diagnostics: { lineupSource: validSaved ? 'SAVED_USER_LINEUP' : 'CONTEXTUAL_COACH_SELECTION', ...(input.coach === undefined ? {} : { coachId: input.coach.id }), reasons },
  }
}

function validMinuteIntent(
  intent: Readonly<Record<PlayerId, readonly number[]>> | undefined,
  squad: readonly PlayerId[],
  periodMinutes: readonly number[],
): boolean {
  if (intent === undefined || periodMinutes.length === 0 || Object.keys(intent).some((id) => !squad.includes(id as PlayerId))) return false
  return periodMinutes.every((periodLength, periodIndex) => {
    if (!Number.isInteger(periodLength) || periodLength <= 0) return false
    const minutes = squad.map((playerId) => intent[playerId]?.[periodIndex] ?? 0)
    return minutes.every((value) => Number.isInteger(value) && value >= 0 && value <= periodLength)
      && squad.reduce((sum, playerId) => sum + (intent[playerId]?.[periodIndex] ?? 0), 0) === periodLength * 5
  })
}

export function selectContextualStartingFive(input: Omit<CoachRotationInput, 'regulationPeriodMinutes'>): readonly PlayerId[] {
  const available = [...new Set(input.squad)].filter((id) => input.players[id] !== undefined).sort((a, b) => String(a).localeCompare(String(b)))
  if (available.length < 5) throw new RangeError('Coach requires five available players')
  return selectContextualLineup(input, available, deriveRoleFits(input, available), new Map())
}

function deriveRoleFits(input: Omit<CoachRotationInput, 'regulationPeriodMinutes'> | CoachRotationInput, available: readonly PlayerId[]): Partial<Record<PlayerId, Partial<Record<BasketballPosition, number>>>> {
  const opponentPerimeter = average(input.opponentPlayers.map((player) => avg([player.basketball.ratings.THREE_POINT_STATIC, player.basketball.ratings.DRIVE_CREATION, player.basketball.ratings.PASSING_VISION])))
  const opponentInterior = average(input.opponentPlayers.map((player) => avg([player.basketball.ratings.RIM_FINISHING, player.basketball.ratings.RIM_PROTECTION, player.basketball.ratings.STRENGTH, player.basketball.ratings.OFFENSIVE_REBOUNDING])))
  const tacticsKnowledge = input.coach?.staff?.professional.attributes.tacticalKnowledge ?? 50
  const tacticalFactor = 0.5 + tacticsKnowledge / 200
  return Object.fromEntries(available.map((playerId) => {
    const player = input.players[playerId]!
    const fatiguePenalty = Math.max(0, Math.min(100, input.fatigueByPlayerId[playerId] ?? 0)) * 0.065
    const fits = Object.fromEntries(COACH_ROTATION_POSITIONS.map((position) => {
      const ratings = player.basketball.ratings
      const base = avg(ROLE_RATINGS[position].map((key) => ratings[key]))
      const positional = player.basketball.primaryPosition === position ? 6
        : player.basketball.secondaryPositions?.includes(position) ? 2
          : -6
      const perimeterTactic = (input.matchTactics.defense.perimeter - input.matchTactics.defense.interior) * tacticalFactor
      const perimeterAdjustment = ['PG', 'SG', 'SF'].includes(position)
        ? perimeterTactic * (avg([ratings.POINT_OF_ATTACK_DEFENSE, ratings.LATERAL_DEFENSE]) - 50) / 40
        : 0
      const interiorTactic = -perimeterTactic
      const interiorAdjustment = ['PF', 'C'].includes(position)
        ? interiorTactic * (avg([ratings.RIM_PROTECTION, ratings.POST_DEFENSE, ratings.DEFENSIVE_REBOUNDING]) - 50) / 40
        : 0
      const spacingAdjustment = input.matchTactics.shotProfile.threePoint * tacticalFactor * (ratings.THREE_POINT_STATIC - 50) / 35
      const opponentAdjustment = (['PG', 'SG', 'SF'].includes(position) ? opponentPerimeter : opponentInterior) > 70
        ? (['PG', 'SG', 'SF'].includes(position) ? avg([ratings.POINT_OF_ATTACK_DEFENSE, ratings.LATERAL_DEFENSE]) : avg([ratings.RIM_PROTECTION, ratings.POST_DEFENSE])) * 0.035
        : 0
      const playerFit = base + positional + perimeterAdjustment + interiorAdjustment + spacingAdjustment + opponentAdjustment - fatiguePenalty
      return [position, playerFit]
    })) as Partial<Record<BasketballPosition, number>>
    return [playerId, fits]
  })) as Partial<Record<PlayerId, Partial<Record<BasketballPosition, number>>>>
}

function selectContextualLineup(
  input: Omit<CoachRotationInput, 'regulationPeriodMinutes'> | CoachRotationInput,
  available: readonly PlayerId[],
  fits: Partial<Record<PlayerId, Partial<Record<BasketballPosition, number>>>>,
  anchored: ReadonlyMap<BasketballPosition, PlayerId>,
): PlayerId[] {
  let best: PlayerId[] | undefined
  let bestScore = Number.NEGATIVE_INFINITY
  const current: PlayerId[] = []
  const visit = (slot: number) => {
    if (slot === COACH_ROTATION_POSITIONS.length) {
      const score = scoreLineup(current, fits, input.players)
      const key = current.join('|')
      const bestKey = best?.join('|') ?? ''
      if (score > bestScore || (score === bestScore && key < bestKey)) { best = [...current]; bestScore = score }
      return
    }
    const position = COACH_ROTATION_POSITIONS[slot]!
    const fixed = anchored.get(position)
    const candidates = fixed === undefined ? available.filter((id) => !current.includes(id)) : [fixed]
    for (const playerId of candidates) {
      if (current.includes(playerId)) continue
      current.push(playerId)
      visit(slot + 1)
      current.pop()
    }
  }
  visit(0)
  if (best === undefined) throw new RangeError('Unable to find five distinct players for the coaching plan')
  return best
}

function scoreLineup(lineup: readonly PlayerId[], fits: Partial<Record<PlayerId, Partial<Record<BasketballPosition, number>>>>, players: Readonly<Record<PlayerId, Player>>): number {
  const fitTotal = lineup.reduce((sum, playerId, index) => sum + (fits[playerId]?.[COACH_ROTATION_POSITIONS[index]!] ?? 0), 0)
  const selected = lineup.map((id) => players[id]!)
  const handlers = selected.filter((player) => avg([player.basketball.ratings.BALL_CONTROL, player.basketball.ratings.PASSING_VISION, player.basketball.ratings.PRESSURE_HANDLING]) >= 63).length
  const spacers = selected.filter((player) => avg([player.basketball.ratings.THREE_POINT_STATIC, player.basketball.ratings.MOVEMENT_SHOOTING, player.basketball.ratings.SPACING]) >= 62).length
  const reboundAndInterior = Math.max(...selected.map((player) => avg([player.basketball.ratings.RIM_PROTECTION, player.basketball.ratings.DEFENSIVE_REBOUNDING, player.basketball.ratings.STRENGTH])))
  const perimeterDefense = selected.map((player) => avg([player.basketball.ratings.POINT_OF_ATTACK_DEFENSE, player.basketball.ratings.LATERAL_DEFENSE])).sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0) / 3
  return fitTotal + Math.min(0, handlers - 2) * 3 + Math.min(0, spacers - 2) * 2 + reboundAndInterior * 0.06 + perimeterDefense * 0.035
}

function allocateMinuteTargets(
  rotation: readonly PlayerId[],
  starters: readonly PlayerId[],
  fits: CoachRotationPlan['roleFitByPlayerId'],
  periodMinutes: readonly number[],
): Record<PlayerId, readonly number[]> {
  const targets = Object.fromEntries(rotation.map((id) => [id, [] as number[]])) as Record<PlayerId, number[]>
  for (const periodLength of periodMinutes) {
    const rawWeights = rotation.map((playerId, index) => {
      const starter = starters.includes(playerId)
      const fit = Math.max(...Object.values(fits[playerId] ?? { PG: 50 }))
      const rankWeight = index < 5 ? 1.22 : [0.55, 0.45, 0.34, 0.23, 0.14][index - 5] ?? 0.08
      return { playerId, weight: rankWeight * (starter ? 1.06 : 1) * (0.9 + fit / 500) }
    })
    const total = rawWeights.reduce((sum, item) => sum + item.weight, 0)
    const raw = rawWeights.map(({ playerId, weight }) => ({ playerId, exact: periodLength * 5 * weight / total }))
    const floorTotal = raw.reduce((sum, item) => sum + Math.floor(item.exact), 0)
    const remainder = periodLength * 5 - floorTotal
    const order = [...raw].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || String(a.playerId).localeCompare(String(b.playerId)))
    const extra = new Set(order.slice(0, remainder).map((item) => item.playerId))
    for (const item of raw) targets[item.playerId]!.push(Math.floor(item.exact) + Number(extra.has(item.playerId)))
  }
  return targets
}

function avg(values: readonly number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length }
function average(values: readonly number[]): number { return values.length === 0 ? 50 : avg(values) }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
