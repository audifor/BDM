import type { PlayerId, TeamId } from '@/domain/ids'
import { emitEvent, findLastEvent } from '../events'
import type { MatchNextEvent, MatchState, ScreenCoverage } from '../state'
import { clamp, tacticalIntent, type OffensiveIdentity } from './TacticalIdentity'
import { eventCount } from '../execution/EventLog'

/**
 * BT5.27: what a bench remembers of this game. Small and bounded: per play family the possessions run and the points they produced,
 * per ball-screen coverage the possessions it defended and the points it conceded (and how), and who started the last possessions.
 * Nothing per play, no history of events.
 */
export interface OutcomeRecord { readonly n: number; readonly points: number }

export interface TacticalAdjustment {
  readonly coverage?: ScreenCoverage
  readonly offense?: Partial<OffensiveIdentity>
  readonly reason: string
  readonly atT: number
}

export interface TeamTacticalMemory {
  readonly offense: Readonly<Record<string, OutcomeRecord>>
  readonly defense: Readonly<Record<string, OutcomeRecord>>
  /** Shots conceded after a ball screen, by how they were created, per coverage (what a drop gives is not what a switch gives). */
  readonly conceded: Readonly<Record<string, number>>
  readonly allDefense: OutcomeRecord
  readonly recentInitiators: readonly PlayerId[]
  readonly adjustment: TacticalAdjustment | null
  readonly adjustments: number
  readonly lastAdjustmentT: number
  /** BT6.29: coverages the bench has left, with what each conceded when it was left (the reason, kept so a benign stretch does not undo it). */
  readonly abandoned?: Readonly<Record<string, number>>
  /** BT6.28: the coverage records when the last change was made: a new coverage is judged on what happened since, not on its old sample. */
  readonly defenseAtAdjust?: Readonly<Record<string, OutcomeRecord>>
}

export interface TacticsState {
  readonly home: TeamTacticalMemory
  readonly away: TeamTacticalMemory
  /** Possessions being followed: the family called, the coverages the defense used, the points so far. */
  readonly open: readonly { readonly possessionId: string; readonly offenseTeamId: TeamId; readonly family: string | null; readonly coverages: readonly ScreenCoverage[]; readonly points: number }[]
  readonly processedSequence: number
}

export function emptyTeamMemory(): TeamTacticalMemory {
  return { offense: {}, defense: {}, conceded: {}, allDefense: { n: 0, points: 0 }, recentInitiators: [], adjustment: null, adjustments: 0, lastAdjustmentT: -1e9 }
}

export function initialTacticsState(): TacticsState {
  return { home: emptyTeamMemory(), away: emptyTeamMemory(), open: [], processedSequence: 0 }
}

const RECENT_INITIATORS = 6
/** No adjustment before this much evidence: a bench does not react to one possession. */
const MIN_COVERAGE_SAMPLE = 6
const MIN_FAMILY_SAMPLE = 7
const ADJUSTMENT_COOLDOWN_TICKS = 1500
/** BT6.28: extra possessions a coverage the bench chose during the game needs before it is judged a failure too (confidence in the change). */
const ADOPTED_EXTRA_SAMPLE = 4
const MAX_ADJUSTMENTS = 3

const add = (record: OutcomeRecord | undefined, points: number): OutcomeRecord => ({ n: (record?.n ?? 0) + 1, points: (record?.points ?? 0) + points })

/** Follows the canonical events since the last call; reviews the plan of a team when one of its possessions (on either end) has ended. */
export function reconcileTacticalMemory(input: MatchState): MatchState {
  if (!input.autonomousActions) return input
  let tactics = input.tactics ?? initialTacticsState()
  const count = eventCount(input)
  const last = input.events[count - 1]
  if (last === undefined || last.sequence <= tactics.processedSequence) return input.tactics === undefined ? { ...input, tactics } : input
  let start = count - 1
  while (start > 0 && input.events[start - 1]!.sequence > tactics.processedSequence) start -= 1
  let state: MatchState = input
  const reviews: TeamId[] = []
  for (let index = start; index < count; index += 1) {
    const event = input.events[index]!
    tactics = follow(state, tactics, event, reviews)
  }
  tactics = { ...tactics, processedSequence: last.sequence }
  state = { ...state, tactics }
  for (const teamId of reviews) state = review(state, teamId)
  return state
}

function side(state: MatchState, teamId: TeamId | undefined): 'home' | 'away' {
  return teamId === state.homeTeamId ? 'home' : 'away'
}

function follow(state: MatchState, tactics: TacticsState, event: MatchNextEvent, reviews: TeamId[]): TacticsState {
  const open = (id: string | undefined) => tactics.open.find((item) => item.possessionId === id)
  const replace = (id: string, patch: Partial<TacticsState['open'][number]>): TacticsState => ({ ...tactics, open: tactics.open.map((item) => item.possessionId === id ? { ...item, ...patch } : item) })
  switch (event.type) {
    case 'possessionStart':
      if (event.possessionId === undefined || event.teamId === undefined) return tactics
      return { ...tactics, open: [...tactics.open.filter((item) => item.possessionId !== event.possessionId).slice(-3), { possessionId: event.possessionId, offenseTeamId: event.teamId, family: null, coverages: [], points: 0 }] }
    case 'playCalled': {
      const item = open(event.possessionId)
      if (item === undefined || event.teamId === undefined) return tactics
      const key = side(state, event.teamId)
      const recentInitiators = event.playerId === undefined ? tactics[key].recentInitiators : [...tactics[key].recentInitiators, event.playerId].slice(-RECENT_INITIATORS)
      const next = replace(item.possessionId, { family: item.family ?? event.playFamily ?? null })
      return { ...next, [key]: { ...next[key], recentInitiators } }
    }
    case 'screenSet': {
      const item = open(event.possessionId)
      if (item === undefined || event.screenCoverage === undefined) return tactics
      return replace(item.possessionId, { coverages: [...item.coverages, event.screenCoverage as ScreenCoverage] })
    }
    case 'shotMade': case 'freeThrowMade': {
      const item = open(event.possessionId)
      if (item === undefined || event.points === undefined) return tactics
      const next = replace(item.possessionId, { points: item.points + event.points })
      // How the shot after a screen was created is what a bench sees: who scored on its coverage.
      if (event.type === 'shotMade' && item.coverages.length > 0) {
        const created = findLastEvent(state, (candidate) => candidate.type === 'shotReleased' && candidate.shooterPlayerId === event.shooterPlayerId)?.shotCreation ?? 'OTHER'
        const defenseKey = item.offenseTeamId === state.homeTeamId ? 'away' : 'home'
        const coverage = item.coverages[item.coverages.length - 1]!
        const label = `${coverage}:${created}`
        return { ...next, [defenseKey]: { ...next[defenseKey], conceded: { ...next[defenseKey].conceded, [label]: (next[defenseKey].conceded[label] ?? 0) + event.points } } }
      }
      return next
    }
    case 'possessionEnd': {
      const item = open(event.possessionId)
      if (item === undefined) return tactics
      const offenseKey = side(state, item.offenseTeamId)
      const defenseKey = offenseKey === 'home' ? 'away' : 'home'
      const offense = item.family === null ? tactics[offenseKey].offense : { ...tactics[offenseKey].offense, [item.family]: add(tactics[offenseKey].offense[item.family], item.points) }
      const coverage = item.coverages[0]
      const defense = coverage === undefined ? tactics[defenseKey].defense : { ...tactics[defenseKey].defense, [coverage]: add(tactics[defenseKey].defense[coverage], item.points) }
      reviews.push(item.offenseTeamId, item.offenseTeamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId)
      // Free throws can come after the possession closed: the record stays open briefly (it is dropped when four newer ones exist).
      return {
        ...tactics,
        [offenseKey]: { ...tactics[offenseKey], offense },
        [defenseKey]: { ...tactics[defenseKey], defense, allDefense: add(tactics[defenseKey].allDefense, item.points) },
        open: tactics.open.filter((candidate) => candidate.possessionId !== item.possessionId),
      }
    }
    default:
      return tactics
  }
}

/**
 * BT5.26: the in-game adjustment. A coverage that keeps conceding (enough possessions, clearly above what the team concedes overall)
 * is changed to the one that answers what it concedes; a family that keeps failing is run less, one that keeps scoring more. How
 * much evidence is enough depends on the coach (adaptability, knowledge); there is a cooldown and a cap.
 */
function review(state: MatchState, teamId: TeamId): MatchState {
  const key = side(state, teamId)
  const tactics = state.tactics!
  const memory = tactics[key]
  if (memory.adjustments >= MAX_ADJUSTMENTS || state.t - memory.lastAdjustmentT < ADJUSTMENT_COOLDOWN_TICKS) return state
  const intent = tacticalIntent(state, teamId)
  const adaptability = intent.coach.adaptability / 100
  const knowledge = intent.coach.tacticalKnowledge / 100
  if (adaptability < 0.15) return state
  // Less evidence is needed by an adaptable, knowledgeable coach; a stubborn one waits for a pattern nobody can miss.
  const sampleNeeded = Math.round(MIN_COVERAGE_SAMPLE + (1 - adaptability) * 4)
  const margin = 0.45 - 0.25 * knowledge - 0.1 * adaptability
  const baseline = Math.max(0.95, memory.allDefense.n === 0 ? 1 : memory.allDefense.points / memory.allDefense.n)
  const current = intent.defense.coverage
  // BT6.28: judged on the possessions since it was adopted; a coverage the bench chose in the game needs more evidence to be dropped again.
  const total = memory.defense[current]
  const before = memory.defenseAtAdjust?.[current]
  const record = total === undefined ? undefined : { n: total.n - (before?.n ?? 0), points: total.points - (before?.points ?? 0) }
  const needed = sampleNeeded + (memory.adjustment?.coverage === current ? ADOPTED_EXTRA_SAMPLE : 0)
  if (record !== undefined && record.n >= needed && record.points / record.n > baseline + margin + 0.6 / Math.sqrt(record.n)) {
    const ppp = record.points / record.n
    const next = answerTo(current, memory.conceded, intent.roster.switchability)
    // BT6.29 hysteresis: going back to a coverage the bench left needs the current one to be clearly worse than that one was.
    const left = memory.abandoned?.[next]
    const worthGoingBack = left === undefined || ppp > left + margin
    if (next !== current && worthGoingBack) {
      const reason = `${current} conceded ${ppp.toFixed(2)} points per possession over ${record.n} (team ${baseline.toFixed(2)}): change to ${next}`
      const abandoned = { ...(memory.abandoned ?? {}), [current]: Number(ppp.toFixed(3)) }
      return adjust(state, teamId, { ...(memory.adjustment ?? {}), coverage: next, reason, atT: state.t }, { abandoned, defenseAtAdjust: { ...memory.defense } })
    }
  }
  const familySample = Math.round(MIN_FAMILY_SAMPLE + (1 - adaptability) * 4)
  const offenseBaseline = totalPpp(memory.offense)
  for (const [family, item] of Object.entries(memory.offense).sort(([a], [b]) => a.localeCompare(b))) {
    if (item.n < familySample) continue
    const ppp = item.points / item.n
    const dimension = FAMILY_DIMENSION[family]
    if (dimension === undefined) continue
    const current = memory.adjustment?.offense?.[dimension.key] ?? 0
    if (ppp < offenseBaseline - margin - 0.7 / Math.sqrt(item.n) && Math.abs(current) < 0.01) {
      const reason = `${family} produced ${ppp.toFixed(2)} points per possession over ${item.n} (offense ${offenseBaseline.toFixed(2)}): run it less`
      return adjust(state, teamId, { ...(memory.adjustment ?? {}), offense: { ...(memory.adjustment?.offense ?? {}), [dimension.key]: -dimension.step }, reason, atT: state.t })
    }
    if (ppp > offenseBaseline + margin + 0.7 / Math.sqrt(item.n) && Math.abs(current) < 0.01) {
      const reason = `${family} produced ${ppp.toFixed(2)} points per possession over ${item.n} (offense ${offenseBaseline.toFixed(2)}): go back to it`
      return adjust(state, teamId, { ...(memory.adjustment ?? {}), offense: { ...(memory.adjustment?.offense ?? {}), [dimension.key]: dimension.step }, reason, atT: state.t })
    }
  }
  return state
}

const FAMILY_DIMENSION: Readonly<Record<string, { readonly key: keyof OffensiveIdentity; readonly step: number }>> = {
  BALL_SCREEN: { key: 'ballScreen', step: 0.3 },
  ISOLATION: { key: 'isolation', step: 0.3 },
  POST: { key: 'interior', step: 0.4 },
  MOVEMENT: { key: 'offBall', step: 0.3 },
  CIRCULATION: { key: 'ballMovement', step: 0.4 },
}

function totalPpp(records: Readonly<Record<string, OutcomeRecord>>): number {
  const values = Object.values(records)
  const n = values.reduce((sum, item) => sum + item.n, 0)
  return n === 0 ? 1 : values.reduce((sum, item) => sum + item.points, 0) / n
}

/** The coverage that answers what the current one concedes: pull-ups against a drop, mismatches against a switch, the short roll against a trap. */
function answerTo(current: ScreenCoverage, conceded: Readonly<Record<string, number>>, switchability: number): ScreenCoverage {
  const by = (label: string): number => conceded[`${current}:${label}`] ?? 0
  if (current === 'drop') return by('PR_HANDLER') + by('PULL_UP') >= by('PR_ROLLER') ? (switchability >= 0.45 ? 'switch' : 'hedge') : 'hedge'
  if (current === 'switch') return 'drop'
  if (current === 'blitz') return 'hedge'
  return by('PR_ROLLER') + by('KICK_OUT') > by('PR_HANDLER') ? 'drop' : clamp(switchability, 0, 1) >= 0.5 ? 'switch' : 'drop'
}

function adjust(state: MatchState, teamId: TeamId, adjustment: TacticalAdjustment, coverageMemory: Pick<TeamTacticalMemory, 'abandoned' | 'defenseAtAdjust'> = {}): MatchState {
  const key = side(state, teamId)
  const tactics = state.tactics!
  const memory = tactics[key]
  const next: MatchState = { ...state, tactics: { ...tactics, [key]: { ...memory, ...coverageMemory, adjustment, adjustments: memory.adjustments + 1, lastAdjustmentT: state.t } } }
  return emitEvent(next, 'tacticalAdjustment', { teamId, tacticalReason: adjustment.reason, ...(adjustment.coverage === undefined ? {} : { screenCoverage: adjustment.coverage }) })
}
