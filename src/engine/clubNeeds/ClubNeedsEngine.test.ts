import { beforeAll, describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { createPlayer } from '@/domain/player'
import { PLAYER_TRUTH_RATING_KEYS, type PlayerTruthRatings } from '@/domain/player/PlayerTruthCatalog'
import { createDefaultTeamLineup } from '@/domain/tactics'
import { createFinancialAccount, createFinancialTransaction } from '@/domain/finance/FinancialLedger'
import { createPayable } from '@/domain/finance/Treasury'
import { createPlayerContract } from '@/domain/contract'
import { contractIdFromString, injuryIdFromString, type PlayerId, type TeamId } from '@/domain/ids'
import { createClubStrategicState } from '@/domain/clubStrategy'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { BasketballPosition } from '@/domain/primitives'
import { createNewGame } from '@/app/game'
import { calculatePlayerImpact } from '@/engine/team'
import { assessClubNeeds, type ClubNeedKind } from './ClubNeedsEngine'

describe('Club needs assessment', () => {
  let base: GameWorld
  beforeAll(() => { base = createNewGame() }, 120_000)

  it('uses one derived engine for user and AI clubs without changing game state', () => {
    const ai = Object.values(base.teams).find((team) => team.coachId !== undefined && team.coachId !== base.userCoachId)!
    const user = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    const beforeTeams = base.teams
    const beforeTransactions = base.playerTransactionsById
    expect(assessClubNeeds(base, ai.id)).toEqual(assessClubNeeds(base, ai.id))
    expect(assessClubNeeds(base, user.id).teamId).toBe(user.id)
    expect(base.teams).toBe(beforeTeams)
    expect(base.playerTransactionsById).toBe(beforeTransactions)
    expect(Object.values(assessClubNeeds(base, ai.id).needs).every((need) => !('playerOverall' in need) && !('teamOverall' in need))).toBe(true)
  })

  it('reports the established five-player minimum and a missing canonical position', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId === base.userCoachId && candidate.rosterPlayerIds.length >= 5)!
    const short = updateGameWorld(base, { teams: Object.values(base.teams).map((candidate) => candidate.id === team.id ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.slice(0, 4) } : candidate), lineupsByTeamId: { ...base.lineupsByTeamId, [team.id]: createDefaultTeamLineup(team.id) } })
    expect(assessClubNeeds(short, team.id).needs[0]?.kind).toBe('ROSTER_SIZE')
    expect(assessClubNeeds(short, team.id).needs[0]?.severity).toBe('CRITICAL')

    const noCenter = repositionRoster(base, team.id, 'SG')
    expect(findNeed(assessClubNeeds(noCenter, team.id).needs, 'POSITIONAL_DEPTH', 'PG')?.evidence[0]?.code).toBe('NO_ROSTER_COVERAGE')
  })

  it('distinguishes a weak named starter from a weak backup and lets strategy change fit', () => {
    const weakStarter = qualityScenario(base, 'CONTEND', 'PG', 5, 95)
    const starterNeed = findNeed(assessClubNeeds(weakStarter.world, weakStarter.teamId).needs, 'STARTER_QUALITY_GAP', 'PG')
    expect(starterNeed?.relatedPlayerIds).toContain(weakStarter.starterId)
    expect(starterNeed?.strategicFit).toBe('HIGH')

    const development = withMode(weakStarter.world, weakStarter.teamId, 'DEVELOP')
    expect(findNeed(assessClubNeeds(development, weakStarter.teamId).needs, 'STARTER_QUALITY_GAP', 'PG')?.strategicFit).toBe('LOW')

    const weakBench = qualityScenario(base, 'CONTEND', 'PG', 95, 5)
    expect(findNeed(assessClubNeeds(weakBench.world, weakBench.teamId).needs, 'BENCH_QUALITY_GAP', 'PG')?.relatedPlayerIds).toContain(weakBench.backupId)
    expect(findNeed(assessClubNeeds(weakBench.world, weakBench.teamId).needs, 'STARTER_QUALITY_GAP', 'PG')).toBeUndefined()
  })

  it('surfaces a real handling function gap from canonical ratings', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && candidate.rosterPlayerIds.length >= 5)!
    const players = Object.values(base.players).map((player) => {
      if (!base.teams[team.id]!.rosterPlayerIds.includes(player.id)) return player
      const ratings = { ...player.basketball.ratings, BALL_CONTROL: 20, PASSING_VISION: 20, PRESSURE_HANDLING: 20 } as PlayerTruthRatings
      return createPlayer({ ...player, basketball: { ...player.basketball, ratings } })
    })
    const world = updateGameWorld(base, { players })
    expect(findNeed(assessClubNeeds(world, team.id).needs, 'ROLE_GAP')?.targetRole).toBe('PRIMARY_HANDLING')
  })

  it('identifies key contract continuity and expiry clusters without taking action', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== base.userCoachId && candidate.rosterPlayerIds.length >= 5)!
    const ids = [...new Set(['PG', 'SG', 'SF'].map((position) => bestAt(base, team.id, position as BasketballPosition)))].filter((id): id is NonNullable<typeof id> => id !== undefined)
    expect(ids.length).toBeGreaterThanOrEqual(3)
    const contracts = ids.slice(0, 3).map((playerId, index) => createPlayerContract({ id: contractIdFromString(`club-needs-contract:${team.id}:${index}`), playerId, teamId: team.id, kind: 'standard', term: { startsOn: addDays(base.currentDate, -30), expiresOn: addDays(base.currentDate, 60 + index) }, compensation: { annualSalary: 1_000_000 } }))
    const world = updateGameWorld(base, { contracts: [...Object.values(base.contractsById), ...contracts] })
    const result = assessClubNeeds(world, team.id)
    expect(result.needs.filter((need) => need.kind === 'CONTRACT_CONTINUITY').length).toBeGreaterThanOrEqual(3)
    expect(findNeed(result.needs, 'CONTRACT_CLUSTER')?.deadline).toBe(addDays(base.currentDate, 60))
    expect(world.playerTransactionsById).toEqual(base.playerTransactionsById)
  })

  it('surfaces aging rebuild timelines and positional surplus as separate management facts', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== base.userCoachId && candidate.rosterPlayerIds.length >= 6)!
    const rebuilt = repositionRoster(base, team.id, 'SG')
    const teamPlayerIds = rebuilt.teams[team.id]!.rosterPlayerIds
    const persons = Object.values(rebuilt.personsById).map((person) => teamPlayerIds.some((id) => rebuilt.players[id]?.personId === person.id) ? { ...person, dateOfBirth: `${Number(base.currentDate.slice(0, 4)) - 36}-01-01` as never } : person)
    const aged = withMode(updateGameWorld(rebuilt, { persons }), team.id, 'REBUILD')
    expect(findNeed(assessClubNeeds(aged, team.id).needs, 'AGING_CORE')?.strategicFit).toBe('HIGH')
    expect(findNeed(assessClubNeeds(aged, team.id).needs, 'POSITION_SURPLUS', 'SG')).toBeDefined()
  })

  it('makes a young development opportunity strategic for DEVELOP and lower priority for CONTEND', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== base.userCoachId && candidate.rosterPlayerIds.length >= 5)!
    const rosterPeople = new Set(team.rosterPlayerIds.map((id) => base.players[id]?.personId).filter((id): id is NonNullable<typeof id> => id !== undefined))
    const persons = Object.values(base.personsById).map((person) => rosterPeople.has(person.id) ? { ...person, dateOfBirth: `${Number(base.currentDate.slice(0, 4)) - 21}-01-01` as never } : person)
    const young = updateGameWorld(base, { persons })
    const developNeed = findNeed(assessClubNeeds(withMode(young, team.id, 'DEVELOP'), team.id).needs, 'DEVELOPMENT_OPPORTUNITY')
    const contendNeed = findNeed(assessClubNeeds(withMode(young, team.id, 'CONTEND'), team.id).needs, 'DEVELOPMENT_OPPORTUNITY')
    expect(developNeed?.strategicFit).toBe('HIGH')
    expect(contendNeed?.strategicFit).toBe('LOW')
  })

  it('surfaces only competition eligibility constraints that BDM models', () => {
    const season = Object.values(base.seasons).find((candidate) => candidate.startDate <= base.currentDate && candidate.endDate >= base.currentDate)
    const ncaa = Object.values(base.ecosystems).find((ecosystem) => ecosystem.kind === 'ncaaLike')
    expect(season).toBeDefined()
    expect(ncaa).toBeDefined()
    const teamId = season!.participantTeamIds?.[0] ?? base.competitions[season!.competitionId]!.participantTeamIds[0]!
    const team = base.teams[teamId]!
    const competition = base.competitions[season!.competitionId]!
    const ncaaCompetition = { ...competition, ecosystemId: ncaa!.id }
    const profiles = team.rosterPlayerIds.filter((playerId) => !Object.values(base.eligibilityProfilesById).some((profile) => profile.playerId === playerId && profile.ecosystemId === ncaa!.id && profile.programTeamId === teamId)).map((playerId) => ({ id: `eligibility:${ncaa!.id}:${teamId}:${playerId}`, playerId, ecosystemId: ncaa!.id, programTeamId: teamId, seasonsUsed: 0, seasonRecordsBySeasonId: {} }))
    const restrictions = team.rosterPlayerIds.map((playerId, index) => ({ id: `club-needs-eligibility:${teamId}:${index}`, playerId, ecosystemId: ncaa!.id, reasonCode: 'TEST_RESTRICTION', startsAt: base.currentDate }))
    const world = updateGameWorld(base, { competitions: Object.values(base.competitions).map((item) => item.id === competition.id ? ncaaCompetition : item), eligibilityProfiles: [...Object.values(base.eligibilityProfilesById), ...profiles], eligibilityRestrictions: [...Object.values(base.eligibilityRestrictionsById), ...restrictions] })
    expect(findNeed(assessClubNeeds(world, teamId).needs, 'ELIGIBILITY_GAP')?.evidence[0]?.code).toBe('ACTIVE_COMPETITION_ELIGIBILITY_REDUCES_SQUAD')
  })

  it('keeps basketball needs when Finance V2 is stressed and reports finance as separate context', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId === base.userCoachId && candidate.rosterPlayerIds.length >= 5)!
    const cash = createFinancialAccount({ id: `club-needs-cash:${team.id}`, organizationId: team.organizationId, accountType: 'CASH', currencyCode: 'EUR' })
    const equity = createFinancialAccount({ id: `club-needs-equity:${team.id}`, organizationId: team.organizationId, accountType: 'EQUITY', currencyCode: 'EUR' })
    const amount = { currencyCode: 'EUR', minorUnits: 1_000 }
    const opening = createFinancialTransaction({ id: `club-needs-opening:${team.id}`, organizationId: team.organizationId, effectiveOn: base.currentDate, transactionType: 'OPENING_BALANCE', amount, postings: [{ accountId: cash.id, direction: 'DEBIT', amount }, { accountId: equity.id, direction: 'CREDIT', amount }], provenance: { kind: 'TEST', id: 'club-needs' } })
    const payable = createPayable({ id: `club-needs-payable:${team.id}`, organizationId: team.organizationId, amount: { currencyCode: 'EUR', minorUnits: 10_000 }, recognizedOn: base.currentDate, dueOn: addDays(base.currentDate, 10), counterparty: { kind: 'EXTERNAL', label: 'Supplier' }, provenance: { kind: 'TEST', id: 'club-needs' } })
    const world = updateGameWorld(repositionRoster(base, team.id, 'SG'), { financialAccounts: [cash, equity], financialTransactions: [opening], payables: [payable] })
    const needs = assessClubNeeds(world, team.id)
    expect(needs.financialContext).toBe('STRESSED')
    expect(findNeed(needs.needs, 'FINANCIAL_PRESSURE')?.strategicFit).toBe('HIGH')
    expect(needs.needs.some((need) => need.kind === 'POSITIONAL_DEPTH' || need.kind === 'ROLE_GAP' || need.kind === 'ROSTER_SIZE')).toBe(true)
    expect(needs.needs.filter((need) => need.kind !== 'ROSTER_SIZE').every((need) => need.financialContext === 'STRESSED')).toBe(true)
  })

  it('ignores short absences as permanent holes and marks meaningful injury cover temporary', () => {
    const team = Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && candidate.rosterPlayerIds.length >= 8)!
    const position = BASKETBALL_POSITION_WITH_TWO(base, team.id)
    const playerId = team.rosterPlayerIds.find((id) => canPlay(base, id, position) && !Object.values(base.injuriesById).some((injury) => injury.playerId === id && injury.expectedReturnDate > base.currentDate))!
    const shortInjury = createInjury({ id: injuryIdFromString(`club-needs-short:${team.id}`), playerId, kind: 'ankleSprain', severity: 'minor', injuredOn: base.currentDate, expectedReturnDate: addDays(base.currentDate, 7) })
    const shortWorld = updateGameWorld(base, { injuries: [...Object.values(base.injuriesById), shortInjury] })
    expect(findNeed(assessClubNeeds(shortWorld, team.id).needs, 'TEMPORARY_COVER', position)).toBeUndefined()

    const longInjury = createInjury({ ...shortInjury, id: injuryIdFromString(`club-needs-long:${team.id}`), severity: 'serious', expectedReturnDate: addDays(base.currentDate, 45) })
    const longWorld = updateGameWorld(base, { injuries: [...Object.values(base.injuriesById), longInjury] })
    expect(findNeed(assessClubNeeds(longWorld, team.id).needs, 'TEMPORARY_COVER', position)?.temporalScope).toBe('TEMPORARY')
  })
})

function findNeed(needs: readonly ReturnType<typeof assessClubNeeds>['needs'][number][], kind: ClubNeedKind, position?: BasketballPosition) {
  return needs.find((need) => need.kind === kind && (position === undefined || need.targetPosition === position))
}

function withMode(world: GameWorld, teamId: TeamId, mode: 'CONTEND' | 'DEVELOP' | 'REBUILD'): GameWorld {
  const state = world.clubStrategicStatesByTeamId[teamId]
  return updateGameWorld(world, { clubStrategicStatesByTeamId: { ...world.clubStrategicStatesByTeamId, [teamId]: createClubStrategicState({ ...state, mode }) } })
}

function repositionRoster(world: GameWorld, teamId: TeamId, position: BasketballPosition): GameWorld {
  const rosterIds = new Set(world.teams[teamId]!.rosterPlayerIds)
  const players = Object.values(world.players).map((player) => rosterIds.has(player.id) ? createPlayer({ ...player, basketball: { ...player.basketball, primaryPosition: position, secondaryPositions: [] } }) : player)
  return updateGameWorld(world, { players, lineupsByTeamId: { ...world.lineupsByTeamId, [teamId]: createDefaultTeamLineup(teamId) } })
}

function qualityScenario(world: GameWorld, mode: 'CONTEND' | 'DEVELOP', position: BasketballPosition, starterQuality: number, backupQuality: number): { readonly world: GameWorld; readonly teamId: TeamId; readonly starterId: import('@/domain/ids').PlayerId; readonly backupId: import('@/domain/ids').PlayerId } {
  const team = Object.values(world.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== world.userCoachId && candidate.rosterPlayerIds.length >= 5)!
  const [starterId, backupId] = team.rosterPlayerIds.slice(0, 2)
  const ratingsAt = (quality: number): PlayerTruthRatings => Object.fromEntries(PLAYER_TRUTH_RATING_KEYS.map((key) => [key, quality])) as PlayerTruthRatings
  const players = Object.values(world.players).map((player) => {
    const quality = player.id === starterId ? starterQuality : player.id === backupId ? backupQuality : 60
    const primaryPosition = player.id === starterId || player.id === backupId ? position : player.basketball.primaryPosition
    return createPlayer({ ...player, basketball: { ...player.basketball, primaryPosition, secondaryPositions: player.id === starterId || player.id === backupId ? [] : player.basketball.secondaryPositions, ratings: ratingsAt(quality) } })
  })
  const lineup = { ...createDefaultTeamLineup(team.id), starters: { [position]: starterId } }
  const changed = updateGameWorld(world, { players, lineupsByTeamId: { ...world.lineupsByTeamId, [team.id]: lineup } })
  const strategic = withMode(changed, team.id, mode)
  return { world: strategic, teamId: team.id, starterId: starterId!, backupId: backupId! }
}

function bestAt(world: GameWorld, teamId: TeamId, position: BasketballPosition): import('@/domain/ids').PlayerId | undefined {
  return world.teams[teamId]!.rosterPlayerIds.filter((id) => world.players[id]!.basketball.primaryPosition === position).sort((a, b) => calculateImpact(world, b) - calculateImpact(world, a) || a.localeCompare(b))[0]
}
function calculateImpact(world: GameWorld, playerId: import('@/domain/ids').PlayerId): number { return calculatePlayerImpact(world.players[playerId]!) }
function canPlay(world: GameWorld, playerId: import('@/domain/ids').PlayerId, position: BasketballPosition): boolean { const player = world.players[playerId]!; return player.basketball.primaryPosition === position || player.basketball.secondaryPositions?.includes(position) === true }
function BASKETBALL_POSITION_WITH_TWO(world: GameWorld, teamId: TeamId): BasketballPosition { return (['PG', 'SG', 'SF', 'PF', 'C'] as const).find((position) => world.teams[teamId]!.rosterPlayerIds.filter((id) => canPlay(world, id, position)).length >= 2)! }
