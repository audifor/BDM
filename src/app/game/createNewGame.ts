import { createGameDate } from '@/domain/date'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { generateWorld } from '@/engine/world'
import { ensurePlayerKnowledge } from '@/engine/world'
import type { CoachRpgPreset } from '@/domain/coachRpg'

export const PROTOTYPE_GAME_CONFIGURATION = {
  seed: 12_345,
  gender: 'male',
  startDate: createGameDate(2032, 10, 1),
} as const

/** Creates the fixed, deterministic career used by the first playable prototype. */
export function createNewGame(options: { readonly coachRpgPreset?: CoachRpgPreset } = {}): GameWorld {
  const generatedWorld = generateWorld({ ...PROTOTYPE_GAME_CONFIGURATION, userCoachRpgPreset: options.coachRpgPreset })
  const season = generatedWorld.seasons[generatedWorld.currentSeasonId]

  if (season === undefined) {
    throw new Error('Prototype world generation did not create a Season')
  }

  const games = generateRoundRobinSchedule({ world: generatedWorld, seasonId: season.id })

  return ensurePlayerKnowledge(createGameWorld({
    currentDate: generatedWorld.currentDate,
    currentSeasonId: generatedWorld.currentSeasonId,
    userCoachId: generatedWorld.userCoachId,
    countries: Object.values(generatedWorld.countries),
    coaches: Object.values(generatedWorld.coaches),
    players: Object.values(generatedWorld.players),
    teams: Object.values(generatedWorld.teams),
    competitions: Object.values(generatedWorld.competitions),
    seasons: Object.values(generatedWorld.seasons),
    games,
    injuries: Object.values(generatedWorld.injuriesById),
    contracts: Object.values(generatedWorld.contractsById),
    teamFinances: Object.values(generatedWorld.teamFinancesByTeamId),
    playerTransactions: Object.values(generatedWorld.playerTransactionsById),
    playerKnowledge: Object.values(generatedWorld.playerKnowledgeById),
    staffPeople: Object.values(generatedWorld.staffPeopleById), teamStaffAssignments: Object.values(generatedWorld.teamStaffAssignmentsById),
    coachProfessionalProfilesByCoachId: generatedWorld.coachProfessionalProfilesByCoachId,
    coachRpgProfilesByCoachId: generatedWorld.coachRpgProfilesByCoachId,
  }))
}
