import { initializeBoardState } from '@/engine/board'
import { createTalentCohort } from '@/domain/talent'
import { createTalentSupplyCohort } from '@/engine/world/TalentSupply'
import { createPlace } from '@/domain/facilities'
import { addDays } from '@/domain/date'
import { createGame } from '@/domain/game'
import { gameIdFromString } from '@/domain/ids'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { createSeason } from '@/domain/season'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createNewGame } from './createNewGame'

/** Creates a clearly simulated NCAA-like career for validating college-only game systems. */
export function createNcaaSimulatedGame(): GameWorld {
  let world = createNewGame()
  const season = Object.values(world.seasons).find((candidate) => {
    const competition = world.competitions[candidate.competitionId]
    return competition !== undefined
      && world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike'
      && world.ecosystems[competition.ecosystemId]?.category === 'men'
  })
  if (season === undefined) throw new Error('Simulated NCAA career requires a generated men\'s college season.')

  const competition = world.competitions[season.competitionId]!
  const program = competition.participantTeamIds
    .map((teamId) => world.teams[teamId]!)
    .find((team) => team.coachId !== undefined)
  if (program?.coachId === undefined) throw new Error('Simulated NCAA career requires a generated program with a Head Coach.')

  const cycleId = `recruiting:${competition.ecosystemId}:${season.id}`
  const sourceCycle = world.recruitingCyclesById[cycleId]
  if (sourceCycle === undefined) throw new Error('Simulated NCAA career requires its RecruitingCycle.')
  const championshipDate = season.endDate
  const simulatedSeasonEnd = addDays(championshipDate, 45)
  const simulatedFormat = parseWorldCompetitionFormatDocument({
    schema_version: '1.0',
    competition_id: competition.id,
    competition_season_id: `bdm-simulated:${season.id}`,
    season_label: season.label,
    status: 'COMPLETE',
    variants: [{ key: 'SIMULATED', is_real_variant: true, nodes: [{ key: 'FINAL', node_type: 'ROUND', role: 'FINAL', team_count: 2, contest: { format_type: 'SINGLE_GAME', requires_winner: true }, hosting: { rule_type: 'NEUTRAL', payload: {} } }], edges: [] }],
    sources: [{ url: 'https://bdm.invalid/simulated-ncaa-development', type: 'SECONDARY', scope: 'development simulation', notes: 'Simulated BDM championship fixture; not official NCAA data.' }],
  })
  const simulatedFinal = createGame({ id: gameIdFromString(`ncaa-simulated-final:${season.id}`), seasonId: season.id, competitionId: competition.id, date: championshipDate, homeTeamId: competition.participantTeamIds[0]!, awayTeamId: competition.participantTeamIds[1]!, neutralSite: true, status: 'scheduled', result: null, stakes: 'final', competitionStageKey: 'FINAL' })
  const signingPolicies = sourceCycle.institutionalSigningPolicies ?? competition.participantTeamIds.map((programTeamId) => ({ programTeamId, seasonId: season.id, finalAidSigningDate: addDays(simulatedSeasonEnd, 90), provenance: 'SIMULATED_CARRY_FORWARD' as const, basedOnSeasonId: season.id }))
  world = updateGameWorld(world, {
    currentDate: season.startDate,
    currentSeasonId: season.id,
    userCoachId: program.coachId,
    seasons: Object.values(world.seasons).map((candidate) => candidate.id === season.id ? createSeason({ ...candidate, endDate: simulatedSeasonEnd, worldCompetitionFormat: simulatedFormat }) : candidate),
    gmPlanStates: Object.values(world.gmPlanStatesById).filter((plan) => world.teams[plan.teamId]?.coachId !== program.coachId),
    games: [...Object.values(world.games).filter((game) => game.status !== 'scheduled' || game.date >= season.startDate), simulatedFinal],
    recruitingCycles: Object.values(world.recruitingCyclesById).map((cycle) => cycle.id === cycleId ? { ...cycle, status: 'open', institutionalSigningPolicies: signingPolicies } : cycle),
  })
  const country = Object.values(world.countries)[0]
  if (country === undefined) throw new Error('Simulated NCAA career requires a generated country for its TalentCohort origin.')
  const origin = createPlace({ id: `ncaa-simulated-intake-origin:${season.id}`, kind: 'CITY', name: 'Simulated College Intake Region', countryId: country.id })
  world = updateGameWorld(world, { places: [...Object.values(world.placesById), origin] })
  world = createTalentSupplyCohort(world, createTalentCohort({
    id: `ncaa-simulated-intake:${season.id}`,
    placeId: origin.id,
    birthYear: Number(season.startDate.slice(0, 4)) - 18,
    generationYear: Number(season.startDate.slice(0, 4)),
    gender: 'male',
    seed: 204546,
    inputVersion: 'bdm-ncaa-development-v1',
    inputs: { ageCohortPopulation: 20_000, basketballParticipationPerThousand: 60, accessOpportunityBasisPoints: 9_000 },
  }))
  return initializeBoardState(world, program.id)
}
