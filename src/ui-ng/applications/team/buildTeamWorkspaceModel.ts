import { compareGameDates } from '@/domain/date'
import type { CompetitionId, GameId, SeasonId, StaffPersonId, TeamId } from '@/domain/ids'
import type { Season } from '@/domain/season'
import type { StaffRoleId } from '@/domain/staff'
import type { Team } from '@/domain/team'
import type { GameWorld } from '@/domain/world'
import { getCompetitionsForTeam, getEcosystemForTeam } from '@/domain/world/queries'
import { getUserTeam } from '@/engine/calendar'
import { calculateStandings } from '@/engine/competition/standings'
import { getTeamStaffPresentation, STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { formatGameDateLabel, teamShortCode } from '@/ui-ng/applications/player/data/presentationHelpers'

/** People roles that form the leadership surface of a team, in display order. */
const KEY_PERSON_ROLE_ORDER: readonly StaffRoleId[] = [
  'generalManager',
  'assistantGeneralManager',
  'directorOfBasketballOperations',
  'sportingDirector',
  'capContractsSpecialist',
  'analyticsStaff',
  'headScout',
  'regionalScout',
  'advanceScout',
  'proScout',
  'internationalScout',
  'collegeScout',
  'associateCoach',
  'assistantCoach',
  'offensiveSpecialist',
  'defensiveSpecialist',
  'playerDevelopmentCoach',
  'shootingCoach',
  'skillsCoach',
  'bigManCoach',
  'strengthConditioningCoach',
  'performanceCoach',
  'loadManagementSpecialist',
  'developmentSpecialist',
  'teamDoctor',
  'physiotherapist',
  'rehabilitationSpecialist',
  'sportsScientist',
  'recruitingCoordinator',
  'positionalRecruiter',
]

const MAX_KEY_PEOPLE = 8
const MAX_RECENT_RESULTS = 6
const MAX_FORM_RESULTS = 5

export interface TeamPersonRow {
  readonly staffPersonId: StaffPersonId
  readonly name: string
  readonly roleLabel: string
}

export interface TeamHeadCoachInfo {
  readonly coachId: string
  readonly name: string
  readonly isUserCoach: boolean
}

export interface TeamCompetitionRow {
  readonly competitionId: CompetitionId
  readonly name: string
  readonly seasonId: SeasonId
  readonly seasonLabel: string
  readonly isCurrentSeason: boolean
  readonly position?: number
  readonly wins?: number
  readonly losses?: number
  readonly conferenceName?: string
}

export interface TeamRecentResultRow {
  readonly gameId: GameId
  readonly dateLabel: string
  readonly opponentTeamId: TeamId
  readonly opponentName: string
  readonly isHome: boolean
  readonly outcome: 'win' | 'loss'
  readonly scoreLabel: string
  readonly competitionName: string
}

export interface TeamHonourRow {
  readonly competitionName: string
  readonly seasonLabel: string
  readonly completedOnLabel: string
}

export interface TeamWorkspaceModel {
  readonly teamId: TeamId
  readonly teamName: string
  readonly shortCode: string
  readonly countryName: string | null
  readonly countryCode: string | null
  readonly genderLabel: string
  readonly ecosystemName: string | null
  readonly headCoach: TeamHeadCoachInfo | null
  readonly rosterCount: number
  readonly staffCount: number
  readonly isUserTeam: boolean
  readonly competitions: readonly TeamCompetitionRow[]
  readonly people: readonly TeamPersonRow[]
  readonly recentResults: readonly TeamRecentResultRow[]
  readonly recentForm: readonly ('win' | 'loss')[]
  readonly honours: readonly TeamHonourRow[]
}

function genderLabel(gender: Team['gender']): string {
  return gender === 'male' ? 'Men' : 'Women'
}

function findCompetitionSeason(world: GameWorld, competitionId: CompetitionId): Season | undefined {
  const seasons = Object.values(world.seasons)
    .filter((season) => season.competitionId === competitionId)
    .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id))
  if (seasons.length === 0) return undefined
  const current = seasons.find((season) => season.id === world.currentSeasonId)
  if (current !== undefined) return current
  const liveAtWorldDate = seasons.find((season) => {
    const started = compareGameDates(season.startDate, world.currentDate) <= 0
    const notFinished = compareGameDates(world.currentDate, season.endDate) <= 0
    return started && notFinished
  })
  return liveAtWorldDate ?? seasons[seasons.length - 1]
}

function toCompetitionRows(world: GameWorld, teamId: TeamId): readonly TeamCompetitionRow[] {
  const competitions = [...getCompetitionsForTeam(world, teamId)].sort((left, right) =>
    left.id.localeCompare(right.id),
  )
  const rows = competitions
    .map((competition) => {
      const season = findCompetitionSeason(world, competition.id)
      if (season === undefined) return null
      const standingsLine = calculateStandings(world, season.id).find((entry) => entry.teamId === teamId)
      const membership = world.conferenceMemberships.find(
        (candidate) => candidate.teamId === teamId && candidate.seasonId === season.id,
      )
      const conferenceName =
        membership === undefined ? undefined : world.conferencesById[membership.conferenceId]?.name
      return {
        competitionId: competition.id,
        name: competition.name,
        seasonId: season.id,
        seasonLabel: season.label,
        isCurrentSeason: season.id === world.currentSeasonId,
        ...(standingsLine === undefined
          ? {}
          : {
              position: standingsLine.position,
              wins: standingsLine.wins,
              losses: standingsLine.losses,
            }),
        ...(conferenceName === undefined ? {} : { conferenceName }),
      }
    })
    .filter((row): row is TeamCompetitionRow => row !== null)
  rows.sort((left, right) => {
    if (left.isCurrentSeason !== right.isCurrentSeason) return left.isCurrentSeason ? -1 : 1
    return left.name.localeCompare(right.name)
  })
  return rows
}

function toPeopleRows(world: GameWorld, teamId: TeamId): readonly TeamPersonRow[] {
  const rank = new Map(KEY_PERSON_ROLE_ORDER.map((role, index) => [role, index]))
  return [...getTeamStaffPresentation(world, teamId)]
    .map((item) => ({ item, rank: rank.get(item.role) ?? KEY_PERSON_ROLE_ORDER.length }))
    .sort((left, right) => left.rank - right.rank || left.item.name.localeCompare(right.item.name))
    .slice(0, MAX_KEY_PEOPLE)
    .map(({ item }) => ({
      staffPersonId: item.staffPersonId,
      name: item.name,
      roleLabel: STAFF_ROLE_LABELS[item.role] ?? item.role,
    }))
}

function toRecentResults(world: GameWorld, teamId: TeamId): readonly TeamRecentResultRow[] {
  const completed = Object.values(world.games)
    .filter(
      (game): game is Extract<typeof game, { readonly status: 'completed' }> =>
        game.status === 'completed' &&
        (game.homeTeamId === teamId || game.awayTeamId === teamId) &&
        game.result !== null,
    )
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
  return completed.slice(0, MAX_RECENT_RESULTS).map((game) => {
    const isHome = game.homeTeamId === teamId
    const ownScore = isHome ? game.result.homeScore : game.result.awayScore
    const rivalScore = isHome ? game.result.awayScore : game.result.homeScore
    const opponentId = isHome ? game.awayTeamId : game.homeTeamId
    return {
      gameId: game.id,
      dateLabel: formatGameDateLabel(game.date),
      opponentTeamId: opponentId,
      opponentName: world.teams[opponentId]?.name ?? opponentId,
      isHome,
      outcome: ownScore >= rivalScore ? 'win' : 'loss',
      scoreLabel: `${ownScore}–${rivalScore}`,
      competitionName: world.competitions[game.competitionId]?.name ?? game.competitionId,
    }
  })
}

function toHonours(world: GameWorld, teamId: TeamId): readonly TeamHonourRow[] {
  return Object.values(world.seasonHistoryBySeasonId)
    .filter((record) => record.championTeamId === teamId)
    .sort((left, right) => right.completedOn.localeCompare(left.completedOn))
    .map((record) => ({
      competitionName: world.competitions[record.competitionId]?.name ?? record.competitionId,
      seasonLabel: world.seasons[record.seasonId]?.label ?? record.seasonId,
      completedOnLabel: formatGameDateLabel(record.completedOn),
    }))
}

/**
 * Pure presentation model for the Team dossier. Returns null only when the team
 * is not part of the world; every derived surface stays empty when its system
 * has no data instead of inventing placeholders.
 */
export function buildTeamWorkspaceModel(world: GameWorld, teamId: TeamId): TeamWorkspaceModel | null {
  const team = world.teams[teamId]
  if (team === undefined) return null
  const country = world.countries[team.countryId]
  const ecosystem = getEcosystemForTeam(world, teamId)
  const coach = team.coachId === undefined ? undefined : world.coaches[team.coachId]
  const staff = getTeamStaffPresentation(world, teamId)
  const userTeamId = getUserTeam(world)?.id
  const recentResults = toRecentResults(world, team.id)

  return {
    teamId: team.id,
    teamName: team.name,
    shortCode: teamShortCode(team.name),
    countryName: country?.name ?? null,
    countryCode: country?.code ?? null,
    genderLabel: genderLabel(team.gender),
    ecosystemName: ecosystem?.name ?? null,
    headCoach:
      coach === undefined
        ? null
        : {
            coachId: coach.id,
            name: `${coach.firstName} ${coach.lastName}`,
            isUserCoach: coach.id === world.userCoachId,
          },
    rosterCount: team.rosterPlayerIds.length,
    staffCount: staff.length,
    isUserTeam: userTeamId !== undefined && userTeamId === team.id,
    competitions: toCompetitionRows(world, team.id),
    people: toPeopleRows(world, team.id),
    recentResults,
    recentForm: recentResults.slice(0, MAX_FORM_RESULTS).map((result) => result.outcome),
    honours: toHonours(world, team.id),
  }
}
