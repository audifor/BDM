import { describe, expect, it } from 'vitest'
import { addYears } from '@/domain/date'
import { gameIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { createContractServiceTimeCredit } from '@/domain/contract/ContractServiceTime'
import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import { serializeGameWorldV1, deserializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { materializeBindingContractCompensation } from './BindingContractCompensation'
import { buildContractServiceTimeCreditsForCompletedSeason, contractServiceTimeCreditId, getContractServiceTime } from './ContractServiceTime'
import { rollForwardSalaryRules } from '@/app/game/startNextSeason'
import { createNewGame } from '@/app/game/createNewGame'

let cachedClubs: ReturnType<typeof buildGeneratedClubs> | undefined
function buildGeneratedClubs() {
  const world = createNewGame()
  const nbaSeason = Object.values(world.seasons).find((season) => world.salaryRulesBySeasonId[season.id] !== undefined)!
  const nbaTeam = world.teams[world.competitions[nbaSeason.competitionId]!.participantTeamIds[0]!]!
  const nbaPlayer = world.players[nbaTeam.rosterPlayerIds[0]!]!
  const fibaCompetition = Object.values(world.competitions).find((competition) => world.ecosystems[competition.ecosystemId]?.kind === 'fibaLike')!
  const fibaSeason = Object.values(world.seasons).find((season) => season.competitionId === fibaCompetition.id)!
  const fibaTeam = world.teams[fibaCompetition.participantTeamIds[0]!]!
  const fibaPlayer = world.players[fibaTeam.rosterPlayerIds[0]!]!
  return { world, nbaSeason, nbaTeam, nbaPlayer, fibaSeason, fibaTeam, fibaPlayer }
}
function generatedClubs() { return cachedClubs ??= buildGeneratedClubs() }

describe('BS11D0 binding preconditions', () => {
  it('stores deterministic NBA generated baselines and keeps known zero distinct from missing', () => {
    const { world, nbaSeason, nbaPlayer } = generatedClubs()
    const rules = world.salaryRulesBySeasonId[nbaSeason.id]!
    const baseline = Object.values(world.contractServiceTimeBaselinesById).find((item) => item.playerId === nbaPlayer.id)!
    expect(getContractServiceTime(world, nbaPlayer.id, rules, world.currentDate).status).toBe('KNOWN')
    const zeroWorld = updateGameWorld(world, { contractServiceTimeBaselines: Object.values(world.contractServiceTimeBaselinesById).map((item) => item.id === baseline.id ? { ...item, seasons: 0 } : item) })
    expect(getContractServiceTime(zeroWorld, nbaPlayer.id, rules, world.currentDate)).toMatchObject({ status: 'KNOWN', seasons: 0 })
    const missingWorld = updateGameWorld(world, { contractServiceTimeBaselines: Object.values(world.contractServiceTimeBaselinesById).filter((item) => item.id !== baseline.id) })
    expect(getContractServiceTime(missingWorld, nbaPlayer.id, rules, world.currentDate)).toMatchObject({ status: 'UNKNOWN', reason: 'BASELINE_UNAVAILABLE' })
  })

  it('credits a completed qualifying appearance once, ignores zero minutes, and deduplicates a second competition in the jurisdiction/year', () => {
    const { world, nbaSeason, nbaTeam, nbaPlayer } = generatedClubs()
    const gameId = gameIdFromString('bs11d0-service-credit-game')
    const fakeWorld = {
      ...world,
      games: { ...world.games, [gameId]: { id: gameId, seasonId: nbaSeason.id, competitionId: nbaSeason.competitionId, date: nbaSeason.endDate, homeTeamId: nbaTeam.id, awayTeamId: world.competitions[nbaSeason.competitionId]!.participantTeamIds.find((id) => id !== nbaTeam.id)!, status: 'completed', result: { homeScore: 80, awayScore: 70 }, stakes: 'regular' } },
      matchStatLogsByGameId: { ...world.matchStatLogsByGameId, [gameId]: { gameId, competitionId: nbaSeason.competitionId, seasonId: nbaSeason.id, gameDate: nbaSeason.endDate, homeTeamId: nbaTeam.id, awayTeamId: world.competitions[nbaSeason.competitionId]!.participantTeamIds.find((id) => id !== nbaTeam.id)!, finalScore: { home: 80, away: 70 }, playerLines: [{ playerId: nbaPlayer.id, teamId: nbaTeam.id, opponentTeamId: world.competitions[nbaSeason.competitionId]!.participantTeamIds.find((id) => id !== nbaTeam.id)!, isHome: true, started: true, stats: { secondsPlayed: 1, points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, twoPointMade: 0, twoPointAttempted: 0, threePointMade: 0, threePointAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, foulsCommitted: 0, plusMinus: 0 } }] } },
      seasonHistoryBySeasonId: { ...world.seasonHistoryBySeasonId, [nbaSeason.id]: { seasonId: nbaSeason.id, competitionId: nbaSeason.competitionId, completedOn: nbaSeason.endDate, championTeamId: nbaTeam.id, finalStandings: [] } },
    } as unknown as GameWorld
    const credits = buildContractServiceTimeCreditsForCompletedSeason(fakeWorld, nbaSeason.id)
    expect(credits).toHaveLength(1)
    expect(credits[0]!.qualifyingGameIds).toEqual([gameId])
    const noBaseline = { ...fakeWorld, contractServiceTimeBaselinesById: {} } as GameWorld
    expect(buildContractServiceTimeCreditsForCompletedSeason(noBaseline, nbaSeason.id)).toHaveLength(1)
    expect(getContractServiceTime(noBaseline, nbaPlayer.id, world.salaryRulesBySeasonId[nbaSeason.id]!, nbaSeason.endDate)).toMatchObject({ status: 'UNKNOWN' })
    const noAppearance = { ...fakeWorld, matchStatLogsByGameId: { ...fakeWorld.matchStatLogsByGameId, [gameId]: { ...fakeWorld.matchStatLogsByGameId[gameId]!, playerLines: fakeWorld.matchStatLogsByGameId[gameId]!.playerLines.map((line) => ({ ...line, stats: { ...line.stats, secondsPlayed: 0 } })) } } } as GameWorld
    expect(buildContractServiceTimeCreditsForCompletedSeason(noAppearance, nbaSeason.id)).toEqual([])
    const existing = createContractServiceTimeCredit({ ...credits[0]!, id: contractServiceTimeCreditId(nbaPlayer.id, credits[0]!.jurisdictionId, credits[0]!.serviceYear), serviceYear: Number(nbaSeason.startDate.slice(0, 4)) })
    const secondCompetitionAlreadyCredited = { ...fakeWorld, contractServiceTimeCreditsById: { [existing.id]: existing } } as GameWorld
    expect(buildContractServiceTimeCreditsForCompletedSeason(secondCompetitionAlreadyCredited, nbaSeason.id)).toEqual([])
  })

  it('materializes ordinary NBA salary with BASE_SALARY cap treatment and per-year guarantee', () => {
    const { world, nbaSeason, nbaTeam, nbaPlayer } = generatedClubs()
    const before = JSON.stringify(world)
    const result = materializeBindingContractCompensation(world, nbaPlayer, nbaTeam, { salary: 1_000_000, years: 2, guarantees: [{ year: 1, guaranteedAmount: 500_000 }] }, { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) }, world.salaryRulesBySeasonId[nbaSeason.id])
    expect(result.status).toBe('VALID')
    if (result.status !== 'VALID') return
    expect(result.years).toEqual([
      { year: 1, cashSalary: 1_000_000, guaranteedAmount: 500_000, capTreatment: { policy: 'BASE_SALARY', capHit: 1_000_000 } },
      { year: 2, cashSalary: 1_000_000, guaranteedAmount: 0, capTreatment: { policy: 'BASE_SALARY', capHit: 1_000_000 } },
    ])
    expect(JSON.stringify(world)).toBe(before)
  })

  it('materializes FIBA salary without a numeric cap hit and rejects incentives explicitly', () => {
    const { world, fibaSeason, fibaTeam, fibaPlayer } = generatedClubs()
    const dates = { startsOn: fibaSeason.startDate, expiresOn: addYears(fibaSeason.startDate, 2) }
    const result = materializeBindingContractCompensation(world, fibaPlayer, fibaTeam, { salary: 100_000, years: 2 }, dates)
    expect(result).toMatchObject({ status: 'VALID', serviceTimeStatus: 'NOT_REQUIRED' })
    if (result.status === 'VALID') expect(result.years[0]).not.toHaveProperty('capHit')
    expect(materializeBindingContractCompensation(world, fibaPlayer, fibaTeam, { salary: 100_000, years: 2, incentives: [{ type: 'GAMES_PLAYED', competitionId: fibaSeason.competitionId, contractYear: 1, minimumGamesPlayed: 10, amount: 1_000 }] }, dates)).toEqual({ status: 'UNSUPPORTED_BINDING_TERM' })
  })

  it('fails closed when required NBA rules are missing and rejects illegal minimum salary or contract length', () => {
    const { world, nbaSeason, nbaTeam, nbaPlayer } = generatedClubs()
    const dates = { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) }
    expect(materializeBindingContractCompensation(world, nbaPlayer, nbaTeam, { salary: 1_000_000, years: 2 }, dates)).toEqual({ status: 'RULES_UNAVAILABLE' })
    const minimum = materializeBindingContractCompensation(world, nbaPlayer, nbaTeam, { salary: 500_000, years: 2 }, dates, world.salaryRulesBySeasonId[nbaSeason.id]!)
    expect(minimum).toMatchObject({ status: 'ILLEGAL_SALARY', reasons: expect.arrayContaining(['PLAYER_MINIMUM_NOT_MET']) })
    expect(materializeBindingContractCompensation(world, nbaPlayer, nbaTeam, { salary: 1_000_000, years: 5 }, { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 5) }, world.salaryRulesBySeasonId[nbaSeason.id]!)).toEqual({ status: 'ILLEGAL_TERM' })
  })

  it('produces the same compensation on repeated materialization and supports only salary-only agreements', () => {
    const { world, nbaSeason, nbaTeam, nbaPlayer } = generatedClubs()
    const terms = { salary: 1_000_000, years: 2, guarantees: [{ year: 1, guaranteedAmount: 200_000 }] }
    const dates = { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) }
    const rules = world.salaryRulesBySeasonId[nbaSeason.id]!
    expect(materializeBindingContractCompensation(world, nbaPlayer, nbaTeam, terms, dates, rules)).toEqual(materializeBindingContractCompensation(world, nbaPlayer, nbaTeam, terms, dates, rules))
  })

  it('inherits SalaryRules as a separate successor-season snapshot and persists service-time records', () => {
    const { world, nbaSeason } = generatedClubs()
    const successor = createSeason({ id: 'bs11d0-next-season' as never, competitionId: nbaSeason.competitionId, label: 'Next season', startDate: addYears(nbaSeason.startDate, 1), endDate: addYears(nbaSeason.endDate, 1), participantTeamIds: nbaSeason.participantTeamIds })
    const withSuccessor = updateGameWorld(world, { seasons: [...Object.values(world.seasons), successor] })
    const inherited = rollForwardSalaryRules(withSuccessor, [[nbaSeason, successor]])
    expect(inherited.salaryRulesBySeasonId[successor.id]).toEqual({ ...world.salaryRulesBySeasonId[nbaSeason.id]!, seasonId: successor.id })
    expect(inherited.salaryRulesBySeasonId[successor.id]).not.toBe(inherited.salaryRulesBySeasonId[nbaSeason.id])
    const replacementRules = { ...world.salaryRulesBySeasonId[nbaSeason.id]!, seasonId: successor.id, capAccounting: 'EXPLICIT_SCHEDULE' as const }
    const withOverride = updateGameWorld(withSuccessor, { salaryRulesBySeasonId: { ...withSuccessor.salaryRulesBySeasonId, [successor.id]: replacementRules } })
    expect(rollForwardSalaryRules(withOverride, [[nbaSeason, successor]]).salaryRulesBySeasonId[successor.id]).toBe(replacementRules)
    const withoutPredecessorRules = updateGameWorld(withSuccessor, { salaryRulesBySeasonId: {} })
    expect(rollForwardSalaryRules(withoutPredecessorRules, [[nbaSeason, successor]]).salaryRulesBySeasonId[successor.id]).toBeUndefined()
    const roundTrip = deserializeGameWorldV1(serializeGameWorldV1(world, '2032-01-01T00:00:00.000Z'))
    expect(roundTrip.contractServiceTimeBaselinesById).toEqual(world.contractServiceTimeBaselinesById)
    expect(roundTrip.salaryRulesBySeasonId).toEqual(world.salaryRulesBySeasonId)
  })

  it('fails closed for capped rules lacking explicit cap-accounting policy and for invalid salary', () => {
    const { world, nbaSeason, nbaTeam, nbaPlayer } = generatedClubs()
    const rules = { ...world.salaryRulesBySeasonId[nbaSeason.id]!, capAccounting: undefined }
    expect(materializeBindingContractCompensation(world, nbaPlayer, nbaTeam, { salary: 1_000_000, years: 2 }, { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) }, rules)).toEqual({ status: 'CAP_TREATMENT_UNAVAILABLE' })
    expect(materializeBindingContractCompensation(world, nbaPlayer, nbaTeam, { salary: 0, years: 2 }, { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) }, world.salaryRulesBySeasonId[nbaSeason.id])).toEqual({ status: 'ILLEGAL_SALARY' })
    expect(materializeBindingContractCompensation(world, nbaPlayer, nbaTeam, { salary: 1_000_000, years: 2 }, { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) }, { ...world.salaryRulesBySeasonId[nbaSeason.id]!, capAccounting: 'EXPLICIT_SCHEDULE' })).toEqual({ status: 'CAP_TREATMENT_UNAVAILABLE' })
    const rookieWorld = updateGameWorld(world, {
      drafts: [{ id: 'bs11d0-explicit-draft', ecosystemId: world.competitions[nbaSeason.competitionId]!.ecosystemId, sourceSeasonId: nbaSeason.id, rules: { rounds: 1, orderMethod: 'reverseStandings', scheduledAfterDays: 0 }, scheduledOn: nbaSeason.startDate, status: 'scheduled', prospectPlayerIds: [nbaPlayer.id] }],
      draftPicks: [{ id: 'bs11d0-explicit-pick', draftId: 'bs11d0-explicit-draft', round: 1, order: 1, originalTeamId: nbaTeam.id, ownerTeamId: nbaTeam.id, selection: { playerId: nbaPlayer.id, teamId: nbaTeam.id } }],
    })
    const explicitRules = { ...world.salaryRulesBySeasonId[nbaSeason.id]!, capAccounting: 'EXPLICIT_SCHEDULE' as const, rookieScale: { ...world.salaryRulesBySeasonId[nbaSeason.id]!.rookieScale!, entries: world.salaryRulesBySeasonId[nbaSeason.id]!.rookieScale!.entries.map((entry) => entry.pickOrder === 1 ? { ...entry, capHit: 7_500_000 } : entry) } }
    const explicit = materializeBindingContractCompensation(rookieWorld, nbaPlayer, nbaTeam, { salary: 8_000_000, years: 2 }, { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) }, explicitRules)
    expect(explicit).toMatchObject({ status: 'VALID' })
    if (explicit.status === 'VALID') expect(explicit.years[0]!.capTreatment).toEqual({ policy: 'EXPLICIT_SCHEDULE', capHit: 7_500_000 })
  })
})
