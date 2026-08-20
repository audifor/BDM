import { createGameDate } from '@/domain/date'
import { addDays } from '@/domain/date'
import { createCompetition, defaultLeagueCompetitionRules } from '@/domain/competition'
import { competitionIdFromString, seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { generateNcaaLikeSchedule, generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { generateWorld } from '@/engine/world'
import { ensurePlayerKnowledge } from '@/engine/world'
import { ensureNcaaEligibility } from '@/engine/eligibility'
import { ensureNcaaAcademics } from '@/engine/academic'
import { ensureNcaaNil } from '@/engine/nil'
import { ensureNcaaBoosters } from '@/engine/boosters'
import { ensureNcaaEnforcement } from '@/engine/enforcement'
import type { CoachRpgPreset } from '@/domain/coachRpg'
import { createCoachJobOpeningForTeam } from '@/app/coachCareer'

export const PROTOTYPE_GAME_CONFIGURATION = {
  seed: 12_345,
  gender: 'male',
  startDate: createGameDate(2032, 10, 1),
} as const

/** Creates the fixed, deterministic career used by the first playable prototype. */
export function createNewGame(options: { readonly coachRpgPreset?: CoachRpgPreset } = {}): GameWorld {
  const men = createSingleNewGame(options, 'male')
  const women = namespaceWorld(createSingleNewGame({}, 'female'), 'women-')
  let world = mergeIndependentWorlds(men, women)
  for (const team of Object.values(world.teams).filter((team) => team.coachId === undefined)) world = createCoachJobOpeningForTeam(world, { teamId: team.id }).world
  return world
}

function createSingleNewGame(options: { readonly coachRpgPreset?: CoachRpgPreset }, gender: 'male' | 'female'): GameWorld {
  const generatedWorld = generateWorld({ ...PROTOTYPE_GAME_CONFIGURATION, gender, startDate: gender === 'male' ? PROTOTYPE_GAME_CONFIGURATION.startDate : addDays(PROTOTYPE_GAME_CONFIGURATION.startDate, 7), userCoachRpgPreset: options.coachRpgPreset, includeNbaLike: true, includeNcaaLike: true, starterVacancyTeamIndexes: [1, 9] })
  const season = generatedWorld.seasons[generatedWorld.currentSeasonId]

  if (season === undefined) {
    throw new Error('Prototype world generation did not create a Season')
  }

  const secondaryCompetition = createCompetition({ id: competitionIdFromString('generated-competition-0002'), name: 'Virelia Challenger League', gender, participantTeamIds: Object.values(generatedWorld.teams).slice(0, 4).map((team) => team.id), rules: defaultLeagueCompetitionRules })
  const secondarySeason = createSeason({ id: seasonIdFromString('generated-season-0002'), competitionId: secondaryCompetition.id, label: season.label, startDate: addDays(season.startDate, 60), endDate: season.endDate })
  const competitions = [...Object.values(generatedWorld.competitions), secondaryCompetition]
  const seasons = [...Object.values(generatedWorld.seasons), secondarySeason]
  const staged = createGameWorld({ currentDate: generatedWorld.currentDate, currentSeasonId: generatedWorld.currentSeasonId, userCoachId: generatedWorld.userCoachId, countries: Object.values(generatedWorld.countries), coaches: Object.values(generatedWorld.coaches), players: Object.values(generatedWorld.players), teams: Object.values(generatedWorld.teams), competitions, ecosystems: Object.values(generatedWorld.ecosystems), conferences: Object.values(generatedWorld.conferencesById), conferenceMemberships: generatedWorld.conferenceMemberships, seasons, games: [], injuries: Object.values(generatedWorld.injuriesById), contracts: Object.values(generatedWorld.contractsById), teamFinances: Object.values(generatedWorld.teamFinancesByTeamId), playerTransactions: Object.values(generatedWorld.playerTransactionsById), playerKnowledge: Object.values(generatedWorld.playerKnowledgeById), staffPeople: Object.values(generatedWorld.staffPeopleById), teamStaffAssignments: Object.values(generatedWorld.teamStaffAssignmentsById), coachProfessionalProfilesByCoachId: generatedWorld.coachProfessionalProfilesByCoachId, coachRpgProfilesByCoachId: generatedWorld.coachRpgProfilesByCoachId, coachReputationProfilesByCoachId: generatedWorld.coachReputationProfilesByCoachId, coachEmploymentByCoachId: generatedWorld.coachEmploymentByCoachId, coachCareerHistoryByCoachId: generatedWorld.coachCareerHistoryByCoachId, coachJobOpeningsById: generatedWorld.coachJobOpeningsById, coachJobCandidaciesById: generatedWorld.coachJobCandidaciesById, coachInterviewsByCandidacyId: generatedWorld.coachInterviewsByCandidacyId, coachJobOffersById: generatedWorld.coachJobOffersById, relationshipsByKey: generatedWorld.relationshipsByKey, salaryRulesBySeasonId: generatedWorld.salaryRulesBySeasonId, tradeRulesBySeasonId: generatedWorld.tradeRulesBySeasonId })
  const games = Object.values(staged.seasons).flatMap((candidate) => staged.ecosystems[staged.competitions[candidate.competitionId]!.ecosystemId]!.kind === 'ncaaLike' ? generateNcaaLikeSchedule(staged, candidate.id) : generateRoundRobinSchedule({ world: staged, seasonId: candidate.id }))

  return ensureNcaaEnforcement(ensureNcaaBoosters(ensureNcaaNil(ensureNcaaAcademics(ensureNcaaEligibility(ensurePlayerKnowledge(createGameWorld({
    currentDate: generatedWorld.currentDate,
    currentSeasonId: generatedWorld.currentSeasonId,
    userCoachId: generatedWorld.userCoachId,
    countries: Object.values(generatedWorld.countries),
    coaches: Object.values(generatedWorld.coaches),
    players: Object.values(generatedWorld.players),
    teams: Object.values(generatedWorld.teams),
    competitions, ecosystems: Object.values(generatedWorld.ecosystems), conferences: Object.values(generatedWorld.conferencesById), conferenceMemberships: generatedWorld.conferenceMemberships,
    seasons,
    games,
    injuries: Object.values(generatedWorld.injuriesById),
    contracts: Object.values(generatedWorld.contractsById),
    teamFinances: Object.values(generatedWorld.teamFinancesByTeamId),
    playerTransactions: Object.values(generatedWorld.playerTransactionsById),
    playerKnowledge: Object.values(generatedWorld.playerKnowledgeById),
    staffPeople: Object.values(generatedWorld.staffPeopleById), teamStaffAssignments: Object.values(generatedWorld.teamStaffAssignmentsById),
    coachProfessionalProfilesByCoachId: generatedWorld.coachProfessionalProfilesByCoachId,
    coachRpgProfilesByCoachId: generatedWorld.coachRpgProfilesByCoachId, coachReputationProfilesByCoachId: generatedWorld.coachReputationProfilesByCoachId, coachEmploymentByCoachId: generatedWorld.coachEmploymentByCoachId, coachCareerHistoryByCoachId: generatedWorld.coachCareerHistoryByCoachId, coachJobOpeningsById: generatedWorld.coachJobOpeningsById, coachJobCandidaciesById: generatedWorld.coachJobCandidaciesById, coachInterviewsByCandidacyId: generatedWorld.coachInterviewsByCandidacyId, coachJobOffersById: generatedWorld.coachJobOffersById, relationshipsByKey: generatedWorld.relationshipsByKey, salaryRulesBySeasonId: generatedWorld.salaryRulesBySeasonId, tradeRulesBySeasonId: generatedWorld.tradeRulesBySeasonId,
  })))))))
}

function namespaceWorld(world: GameWorld, prefix: string): GameWorld {
  const serialized = JSON.stringify(world).replaceAll('generated-staff-', '__staff__').replaceAll('generated-', prefix).replaceAll('__staff__', 'generated-staff-')
  return JSON.parse(serialized) as GameWorld
}

function mergeIndependentWorlds(primary: GameWorld, secondary: GameWorld): GameWorld {
  const merged: Record<string, unknown> = { ...primary }
  for (const [key, value] of Object.entries(secondary)) {
    if (key === 'schemaVersion' || key === 'currentDate' || key === 'currentSeasonId' || key === 'userCoachId') continue
    const current = primary[key as keyof GameWorld]
    if (Array.isArray(value)) merged[key] = [...(current as readonly unknown[]), ...value]
    else if (typeof value === 'object' && value !== null) merged[key] = { ...(current as object), ...value }
  }
  return updateGameWorld(merged as unknown as GameWorld, {})
}
