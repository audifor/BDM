import { addDays, type GameDate } from '@/domain/date'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { isTrainingStaffRoleEligible, type StaffRoleId } from '@/domain/staff'
import type { LineupSlot } from '@/domain/tactics'
import { trainingDefinitionById, type TrainingIntensity } from '@/domain/training'
import { getTeamRoster, isPlayerAvailable, type GameWorld } from '@/domain/world'
import { trainingStaffSuitabilityScore } from '@/engine/training/ScheduledTrainingEngine'
import { getUserMatchReadiness } from '../UserMatchReadiness'
import type { F2DayContext, F2Policy } from './PlayableF2Support'

/**
 * The two management policies of the F2 comparison. Every decision is a call to a `gameStore` action, i.e. the command the Courtside
 * Training, Staff, Roster and Tactics screens run; nothing here writes to the world directly.
 */

/** Best-suited employed staff member of the user's club for a definition (the Training > Staff picker, ranked by suitability). */
export function bestTrainingStaff(world: GameWorld, teamId: TeamId, definitionId: string, date: GameDate): StaffPersonId | undefined {
  const definition = trainingDefinitionById(definitionId)
  const probe = { id: 'probe', teamId, date, startTime: '00:00', durationMinutes: 60, scope: 'team', definitionId, intensity: 'normal', status: 'scheduled' } as const
  const ids = new Set(Object.values(world.teamStaffAssignmentsById).filter((a) => a.teamId === teamId && isTrainingStaffRoleEligible(a.role, definition.category, definition.id)).map((a) => a.staffPersonId))
  return [...ids].filter((id) => world.staffEmploymentByStaffId[id]?.status === 'employed')
    .map((id) => ({ id, score: trainingStaffSuitabilityScore(world, probe, id, definition) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0]?.id
}

export function staffWithRole(world: GameWorld, teamId: TeamId, role: StaffRoleId): StaffPersonId | undefined {
  return Object.values(world.teamStaffAssignmentsById).filter((a) => a.teamId === teamId && a.role === role && world.staffEmploymentByStaffId[a.staffPersonId]?.status === 'employed').map((a) => a.staffPersonId).sort()[0]
}

export const isoWeekday = (date: GameDate): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}
export const teamPlaysOn = (world: GameWorld, teamId: TeamId, date: GameDate): boolean => Object.values(world.games).some((g) => g.date === date && (g.homeTeamId === teamId || g.awayTeamId === teamId))

/** A · gestión automática: the initial configuration is kept and no command is issued. */
export const automaticPolicy: F2Policy = { id: 'A', decide: () => {} }

interface WeekSlot { readonly offset: number; readonly moduleId: string; readonly intensity: TrainingIntensity }
const WEEK_ODD: readonly WeekSlot[] = [
  { offset: 1, moduleId: 'defensiveSystem', intensity: 'normal' },
  { offset: 2, moduleId: 'threePoint', intensity: 'normal' },
  { offset: 3, moduleId: 'offensiveSystem', intensity: 'light' },
  { offset: 4, moduleId: 'activeRecovery', intensity: 'light' },
]
const WEEK_EVEN: readonly WeekSlot[] = [
  { offset: 1, moduleId: 'pickAndRollDefense', intensity: 'normal' },
  { offset: 2, moduleId: 'conditioning', intensity: 'high' },
  { offset: 3, moduleId: 'transition', intensity: 'light' },
  { offset: 4, moduleId: 'lowLoadRecovery', intensity: 'light' },
]

/**
 * B · gestión activa. Each Sunday the coach plans the following week on the Training screen (module, intensity and executing staff
 * for each day; a free rest day before the game) and sets an individual objective; on day 1 the individual-development decision is
 * delegated to the staff (Staff > Assignments). On each game eve the coach reads the Roster/Match readiness and saves the lineup,
 * resting the most tired starter when a rested player of the same position is available (Roster/Tactics screens).
 */
export interface ManagedOptions {
  /** Plan the weekly sessions and the individual objective (Training screen). */
  readonly training?: boolean
  /** Delegate the individual-development decision (Staff > Assignments). */
  readonly delegation?: boolean
  /** Save the lineup on each game eve, resting the most tired starter (Roster/Tactics). */
  readonly lineup?: boolean
  /** Fill every bench slot (B1..B7) instead of only the coach's own rotation players. */
  readonly wideBench?: boolean
  /** A deliberately bad rotation decision: start the five weakest available players. */
  readonly weakLineup?: boolean
}

export function managedPolicy(options: ManagedOptions = {}): F2Policy {
  const { training = true, delegation = true, lineup = true, wideBench = false, weakLineup = false } = options
  return {
    id: training && delegation && lineup && !wideBench && !weakLineup ? 'B' : `B[${[training && 'training', delegation && 'delegation', lineup && 'lineup', wideBench && 'wideBench', weakLineup && 'weakLineup'].filter(Boolean).join('+')}]`,
    decide(context) {
      const { day, date, world, store, teamId, record } = context
      if (delegation && day === 1) {
        const developer = staffWithRole(world, teamId, 'playerDevelopmentCoach') ?? staffWithRole(world, teamId, 'developmentSpecialist') ?? staffWithRole(world, teamId, 'assistantCoach')
        if (developer !== undefined) {
          store.setStaffResponsibility({ teamId, kind: 'assignIndividualDevelopment', mode: 'delegated', holderStaffId: developer })
          record('setStaffResponsibility', `assignIndividualDevelopment delegated -> ${developer}`)
        }
      }
      if (training && isoWeekday(date) === 7) planWeek(context, Math.floor((day - 1) / 7) % 2 === 0 ? WEEK_ODD : WEEK_EVEN)
      if (lineup && teamPlaysOn(world, teamId, addDays(date, 1))) (weakLineup ? prepareWeakMatch(context) : prepareMatch(context, wideBench))
    },
  }
}

function planWeek({ world, store, teamId, date: sunday, record }: F2DayContext, template: readonly WeekSlot[]): void {
  for (const slot of template) {
    const date = addDays(sunday, slot.offset)
    if (teamPlaysOn(world, teamId, date)) continue
    const definition = trainingDefinitionById(slot.moduleId)
    const staff = bestTrainingStaff(world, teamId, slot.moduleId, date)
    store.scheduleTeamModuleSession({ moduleId: slot.moduleId, date, startTime: '10:00', durationMinutes: definition.durationMinutes, sessionId: `f2-team:${date}`, intensity: slot.intensity, ...(staff === undefined ? {} : { assignedStaffPersonIds: [staff] }) })
    record('scheduleTeamModuleSession', `${date} ${slot.moduleId} ${slot.intensity} staff=${staff ?? '-'}`)
  }
  // Individual objective: the least-developed shooter of the roster works on three-point shooting on Tuesday (the delegated developer picks the content).
  const tuesday = addDays(sunday, 2)
  const target = getTeamRoster(world, teamId).filter((player) => isPlayerAvailable(world, player.id, tuesday))
    .sort((a, b) => a.basketball.ratings.threePointShooting - b.basketball.ratings.threePointShooting || a.id.localeCompare(b.id))[0]
  if (target !== undefined && !teamPlaysOn(world, teamId, tuesday)) {
    store.assignTrainingModuleToPlayer({ playerId: target.id, moduleId: 'threePoint', date: tuesday, startTime: '12:30', sessionId: `f2-ind:${tuesday}:${target.id}` })
    record('assignTrainingModuleToPlayer', `${tuesday} ${target.id} threePoint`)
  }
}

const SLOT_BY_POSITION = ['PG', 'SG', 'SF', 'PF', 'C'] as const
const BENCH_SLOTS: readonly LineupSlot[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']

function prepareMatch({ world, store, record }: F2DayContext, wideBench: boolean): void {
  const readiness = getUserMatchReadiness(world)
  if (readiness === undefined || readiness.blockedReason !== undefined) return
  const fatigueOf = (id: string) => world.careerFatigueByPlayerId[id] ?? 0
  const positionOf = (id: string) => world.players[id as keyof typeof world.players]!.basketball.primaryPosition
  const starters = [...readiness.starters]
  // Only the coach's own rotation players (role BENCH) fill bench slots: saving the lineup must not widen the rotation by itself.
  const benchPool = readiness.players.filter((player) => player.role === 'BENCH' || (wideBench && player.role === 'RESERVE'))
  const tired = [...starters].sort((a, b) => fatigueOf(b) - fatigueOf(a) || a.localeCompare(b))[0]!
  const fresh = benchPool.filter((player) => player.position === positionOf(tired) && fatigueOf(player.playerId) + 6 <= fatigueOf(tired))
    .sort((a, b) => fatigueOf(a.playerId) - fatigueOf(b.playerId) || a.playerId.localeCompare(b.playerId))[0]
  const lineup = starters.map((id) => (fresh !== undefined && id === tired ? fresh.playerId : id))
  lineup.forEach((id, index) => store.setLineupSlot(SLOT_BY_POSITION[index]!, id))
  // Bench order: the coach's own expected-minutes order, with the rested starter first off the bench.
  const expected = (id: string) => readiness.players.find((player) => player.playerId === id)?.expectedMinutes ?? 0
  const bench = [...(fresh === undefined ? [] : [tired]), ...benchPool.map((player) => player.playerId).filter((id) => !lineup.includes(id)).sort((a, b) => expected(b) - expected(a) || a.localeCompare(b))].slice(0, BENCH_SLOTS.length)
  bench.forEach((id, index) => store.setLineupSlot(BENCH_SLOTS[index]!, id as never))
  record('setLineupSlot', `starters=${lineup.map((id) => `${positionOf(id)}:${id.slice(-6)}`).join(',')} bench=${bench.map((id) => id.slice(-6)).join(',')}${fresh === undefined ? '' : ` (rested ${tired.slice(-6)} fatigue ${fatigueOf(tired).toFixed(1)})`}`)
}

/** O · exceso de carga: a deliberately bad decision, high-intensity strength work every day of the week before the game. */
export const overloadPolicy: F2Policy = {
  id: 'O',
  decide({ date, world, store, teamId, record }) {
    if (isoWeekday(date) !== 7) return
    for (let offset = 1; offset <= 5; offset += 1) {
      const target = addDays(date, offset)
      if (teamPlaysOn(world, teamId, target)) continue
      store.scheduleTeamModuleSession({ moduleId: 'strength', date: target, startTime: '10:00', durationMinutes: trainingDefinitionById('strength').durationMinutes, sessionId: `f2-overload:${target}`, intensity: 'high' })
      record('scheduleTeamModuleSession', `${target} strength high`)
    }
  },
}

/** Starts the five weakest available players (by the sum of their canonical ratings) and benches the rest in descending order. */
function prepareWeakMatch({ world, store, teamId, record }: F2DayContext): void {
  const strength = (id: string) => Object.values(world.players[id as keyof typeof world.players]!.basketball.ratings).reduce((sum, value) => sum + value, 0)
  const available = getTeamRoster(world, teamId).filter((player) => isPlayerAvailable(world, player.id, addDays(world.currentDate, 1))).map((player) => player.id)
    .sort((a, b) => strength(a) - strength(b) || a.localeCompare(b))
  const starters = available.slice(0, 5)
  const bench = available.slice(5).sort((a, b) => strength(b) - strength(a) || a.localeCompare(b)).slice(0, BENCH_SLOTS.length)
  starters.forEach((id, index) => store.setLineupSlot(SLOT_BY_POSITION[index]!, id))
  bench.forEach((id, index) => store.setLineupSlot(BENCH_SLOTS[index]!, id))
  record('setLineupSlot', `weak starters=${starters.map((id) => id.slice(-6)).join(',')}`)
}
