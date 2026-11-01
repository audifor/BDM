import { getPendingFirstStaffMeeting } from '@/app/coachLife'
import { getGamePlan } from '@/app/game/TacticalPlanning'
import { getBoardSummary } from '@/engine/board'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { getTeamFinancialSnapshot } from '@/domain/world'
import { facilitiesUsedByTeamAt } from '@/domain/facilities'
import { responsibilityDefinition } from '@/domain/responsibility'
import { getTeamResponsibilities, getTeamStaffAssignments, type GameWorld } from '@/domain/world'
import type { ResponsibilityKind, ResponsibilityMode } from '@/domain/responsibility'

export interface CareerArrivalResponsibility {
  readonly kind: ResponsibilityKind
  readonly domain: string
  readonly mode: ResponsibilityMode
  readonly holderName: string | null
}

export interface CareerArrivalModel {
  readonly coachName: string
  readonly clubName: string
  readonly post: string
  readonly competitionName: string | null
  readonly seasonLabel: string | null
  readonly staffCount: number
  readonly facilityCount: number
  readonly financialStatus: string | null
  readonly openStaffVacancies: number
  readonly unassignedResponsibilities: number
  readonly objectives: readonly string[]
  readonly responsibilities: readonly CareerArrivalResponsibility[]
  readonly pendingMeeting: ReturnType<typeof getPendingFirstStaffMeeting>
  readonly nextFixture: {
    readonly date: string
    readonly opponentName: string
    readonly competitionName: string | null
    readonly gameId: string
    readonly planApplied: boolean
    readonly scoutingReady: boolean
  } | null
  readonly upcomingTrainingSessions: number
}

/**
 * F1 presentation read model. It composes the existing career authorities and
 * deliberately has no fallback values for club, objectives, scouting or plans.
 */
export function buildCareerArrivalModel(world: GameWorld): CareerArrivalModel | null {
  const coach = world.coaches[world.userCoachId]
  const coachStaff = coach === undefined ? undefined : world.staffPeopleById[coach.staffProfileId]
  const team = getUserTeam(world)
  if (coach === undefined || coachStaff === undefined || team === undefined) return null

  const season = world.seasons[world.currentSeasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  const board = getBoardSummary(world, team.id)
  const responsibilities = getTeamResponsibilities(world, team.id)
  const financial = world.teamFinancesByTeamId[team.id] === undefined ? null : getTeamFinancialSnapshot(world, team.id)
  const nextGame = getNextUserGame(world)
  const nextOpponentId = nextGame === undefined ? undefined : nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId
  const nextReport = nextGame === undefined
    ? undefined
    : Object.values(world.oppositionScoutingReportsById).find((report) => report.teamId === team.id && report.gameId === nextGame.id)
  const nextPlan = nextGame === undefined ? undefined : getGamePlan(world, nextGame.id, team.id)
  const responsibilityRows = responsibilities
    .filter((item) => item.mode !== 'organizational')
    .map((item) => {
      const holder = item.holderStaffId === undefined ? undefined : world.staffPeopleById[item.holderStaffId]
      return {
        kind: item.kind,
        domain: responsibilityDefinition(item.kind).domain,
        mode: item.mode,
        holderName: holder === undefined ? null : `${holder.identity.firstName} ${holder.identity.lastName}`,
      }
    })

  return {
    coachName: `${coachStaff.identity.firstName} ${coachStaff.identity.lastName}`,
    clubName: team.name,
    post: team.coachId === world.userCoachId && world.coachEmploymentByCoachId[world.userCoachId]?.status === 'employed' ? 'Head coach' : 'No active post',
    competitionName: competition?.name ?? null,
    seasonLabel: season?.label ?? season?.id ?? null,
    staffCount: getTeamStaffAssignments(world, team.id).filter((assignment) => world.staffEmploymentByStaffId[assignment.staffPersonId]?.status === 'employed').length,
    facilityCount: new Set(facilitiesUsedByTeamAt(Object.values(world.facilityTeamRelationshipsById), team.id, world.currentDate).map((relationship) => relationship.facilityId)).size,
    financialStatus: financial?.status ?? null,
    openStaffVacancies: Object.values(world.staffJobOpeningsById).filter((opening) => opening.teamId === team.id && opening.status === 'open').length,
    unassignedResponsibilities: responsibilities.filter((item) => item.mode === 'userControlled' || item.holderStaffId === undefined).length,
    objectives: board?.state.objectives.filter((objective) => objective.outcome === 'inProgress').map((objective) => objective.label) ?? [],
    responsibilities: responsibilityRows,
    pendingMeeting: getPendingFirstStaffMeeting(world),
    nextFixture: nextGame === undefined || nextOpponentId === undefined
      ? null
      : {
          date: nextGame.date,
          opponentName: world.teams[nextOpponentId]?.name ?? nextOpponentId,
          competitionName: world.competitions[nextGame.competitionId]?.name ?? null,
          gameId: nextGame.id,
          planApplied: nextPlan?.tacticalOverride !== undefined,
          scoutingReady: nextReport !== undefined,
        },
    upcomingTrainingSessions: Object.values(world.scheduledTrainingSessionsById).filter((session) => session.teamId === team.id && session.status === 'scheduled').length,
  }
}
