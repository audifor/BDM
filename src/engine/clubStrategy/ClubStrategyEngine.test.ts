import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createGame } from '@/domain/game'
import { createGovernanceExpectationPeriod, createGovernanceInstitution, createGovernanceObjective } from '@/domain/governance'
import type { SeasonId, TeamId } from '@/domain/ids'
import { createFinancialAccount, createFinancialTransaction } from '@/domain/finance/FinancialLedger'
import { createPayable } from '@/domain/finance/Treasury'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { assessClubStrategy, reviewClubStrategy } from './ClubStrategyEngine'

describe('Club strategy', () => {
  let base: GameWorld
  beforeAll(() => { base = createNewGame() }, 120_000)

  it('initializes direction for AI-controlled clubs and keeps the user club advisory', () => {
    const world = base
    const aiTeam = Object.values(world.teams).find((team) => team.coachId !== undefined && team.coachId !== world.userCoachId)!
    const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
    expect(world.clubStrategicStatesByTeamId[aiTeam.id]).toBeDefined()
    expect(world.clubStrategicStatesByTeamId[userTeam.id]).toBeUndefined()
    const assessment = assessClubStrategy(world, aiTeam.id)
    expect(assessment).toEqual(assessClubStrategy(world, aiTeam.id))
    expect('teamOverall' in assessment).toBe(false)
    expect(assessClubStrategy(world, userTeam.id).candidateMode).toBeDefined()
    expect(reviewClubStrategy(world, userTeam.id)).toBe(world)
  })

  it('holds the accepted direction through daily noise and allows a major-trigger review', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== base.userCoachId)!
    const original = base.clubStrategicStatesByTeamId[team.id]!
    const opposite = original.mode === 'COMPETE' ? 'DEVELOP' : 'COMPETE'
    const altered = updateGameWorld(base, { clubStrategicStatesByTeamId: { ...base.clubStrategicStatesByTeamId, [team.id]: { ...original, mode: opposite } } })
    const tomorrow = updateGameWorld(altered, { currentDate: addDays(altered.currentDate, 1) })
    expect(reviewClubStrategy(tomorrow, team.id)).toBe(tomorrow)
    const reviewed = reviewClubStrategy(tomorrow, team.id, { trigger: 'MAJOR_ROSTER_CHANGE' })
    expect(reviewed.clubStrategicStatesByTeamId[team.id]!.mode).toBe(assessClubStrategy(tomorrow, team.id).candidateMode)
    expect(reviewed.clubStrategicStatesByTeamId[team.id]!.lastReviewedOn).toBe(tomorrow.currentDate)
  })

  it('favors development for a young underperforming team, while strong Governance pressure shifts the candidate toward competition', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== base.userCoachId && candidate.rosterPlayerIds.length >= 5)!
    const season = Object.values(base.seasons).find((candidate) => candidate.startDate <= base.currentDate && candidate.endDate >= base.currentDate && (candidate.participantTeamIds ?? base.competitions[candidate.competitionId]!.participantTeamIds).includes(team.id))!
    const youngAndUnderperforming = youngLosingWorld(base, team.id, season.id)
    expect(assessClubStrategy(youngAndUnderperforming, team.id).candidateMode).toBe('DEVELOP')

    const institution = createGovernanceInstitution({ id: `strategy-institution:${team.id}`, universe: 'PROFESSIONAL_CLUB', name: 'Club Board', teamIds: [team.id] })
    const period = createGovernanceExpectationPeriod({ id: `strategy-period:${team.id}`, institutionId: institution.id, universe: institution.universe, startedOn: base.currentDate })
    const objective = createGovernanceObjective({ id: `strategy-objective:${team.id}`, expectationPeriodId: period.id, ownerInstitutionId: institution.id, family: 'SPORTING_RESULTS', horizon: 'SHORT', metric: 'WIN_PERCENTAGE', comparison: 'AT_LEAST', target: { kind: 'NUMERIC', value: 0.7 }, tolerance: 0, importance: 90, evaluationStartsOn: base.currentDate, evaluationEndsOn: '2033-06-30' as never })
    const governed = updateGameWorld(youngAndUnderperforming, { governanceInstitutions: [institution], governanceExpectationPeriods: [period], governanceObjectives: [objective] })
    expect(assessClubStrategy(governed, team.id).governancePressure).toBe('HIGH')
    expect(assessClubStrategy(governed, team.id).candidateMode).toBe('COMPETE')
  })

  it('uses Finance V2 liquidity shortfall to favor survival without calculating a separate finance score', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== base.userCoachId)!
    const organizationId = team.organizationId
    const cash = createFinancialAccount({ id: `strategy-cash:${team.id}`, organizationId, accountType: 'CASH', currencyCode: 'EUR' })
    const equity = createFinancialAccount({ id: `strategy-equity:${team.id}`, organizationId, accountType: 'EQUITY', currencyCode: 'EUR' })
    const amount = { currencyCode: 'EUR', minorUnits: 1_000 }
    const opening = createFinancialTransaction({ id: `strategy-opening:${team.id}`, organizationId, effectiveOn: base.currentDate, transactionType: 'OPENING_BALANCE', amount, postings: [{ accountId: cash.id, direction: 'DEBIT', amount }, { accountId: equity.id, direction: 'CREDIT', amount }], provenance: { kind: 'TEST', id: 'club-strategy' } })
    const payable = createPayable({ id: `strategy-payable:${team.id}`, organizationId, amount: { currencyCode: 'EUR', minorUnits: 10_000 }, recognizedOn: base.currentDate, dueOn: addDays(base.currentDate, 10), counterparty: { kind: 'EXTERNAL', label: 'Supplier' }, provenance: { kind: 'TEST', id: 'club-strategy' } })
    const stressed = updateGameWorld(base, { financialAccounts: [cash, equity], financialTransactions: [opening], payables: [payable] })
    expect(assessClubStrategy(stressed, team.id).financialPressure).toBe('HIGH')
    expect(assessClubStrategy(stressed, team.id).candidateMode).toBe('SURVIVE')
  })

  it('supports a strong short-term title window and keeps that accepted direction stable', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== base.userCoachId && candidate.rosterPlayerIds.length >= 5)!
    const season = Object.values(base.seasons).find((candidate) => candidate.startDate <= base.currentDate && candidate.endDate >= base.currentDate && (candidate.participantTeamIds ?? base.competitions[candidate.competitionId]!.participantTeamIds).includes(team.id))!
    const winningWorld = allWinsWorld(base, team.id, season.id)
    expect(assessClubStrategy(winningWorld, team.id).candidateMode).toBe('CONTEND')
    const reviewed = reviewClubStrategy(winningWorld, team.id, { trigger: 'COMPETITION_CHECKPOINT' })
    expect(reviewed.clubStrategicStatesByTeamId[team.id]!.mode).toBe('CONTEND')
    const tomorrow = updateGameWorld(reviewed, { currentDate: addDays(reviewed.currentDate, 1) })
    expect(reviewClubStrategy(tomorrow, team.id)).toBe(tomorrow)
    expect(reviewed.teams[team.id]!.rosterPlayerIds).toEqual(winningWorld.teams[team.id]!.rosterPlayerIds)
    expect(reviewed.playerTransactionsById).toEqual(winningWorld.playerTransactionsById)
  })
})

function youngLosingWorld(world: GameWorld, teamId: TeamId, seasonId: SeasonId): GameWorld {
  const team = world.teams[teamId]!
  const playerPersonIds = new Set(team.rosterPlayerIds.map((playerId) => world.players[playerId]!.personId).filter((id): id is NonNullable<typeof id> => id !== undefined))
  const persons = Object.values(world.personsById).map((person) => playerPersonIds.has(person.id) ? { ...person, dateOfBirth: `${Number(world.currentDate.slice(0, 4)) - 22}-01-01` as never } : person)
  const games = Object.values(world.games).map((game) => {
    if (game.seasonId !== seasonId) return game
    const targetIsHome = game.homeTeamId === teamId
    const targetIsAway = game.awayTeamId === teamId
    const homeScore = targetIsHome ? 60 : 80
    const awayScore = targetIsAway ? 60 : 70
    return createGame({ ...game, status: 'completed', result: { homeScore, awayScore } })
  })
  return updateGameWorld(world, { persons, games })
}

function allWinsWorld(world: GameWorld, teamId: TeamId, seasonId: SeasonId): GameWorld {
  const games = Object.values(world.games).map((game) => {
    if (game.seasonId !== seasonId) return game
    const teamIsHome = game.homeTeamId === teamId
    const teamIsAway = game.awayTeamId === teamId
    const homeScore = teamIsHome ? 90 : 80
    const awayScore = teamIsAway ? 90 : 70
    return createGame({ ...game, status: 'completed', result: { homeScore, awayScore } })
  })
  return updateGameWorld(world, { games })
}
