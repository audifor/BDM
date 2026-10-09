import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from './MarketService'
import { updateGameWorld } from '@/domain/world'
import { freeAgentDesirability, maintainAiTeamMinimumRosters } from './AiRosterMaintenance'
import { addDays } from '@/domain/date'
import { addYears, createGameDate } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { contractIdFromString, injuryIdFromString, seasonIdFromString } from '@/domain/ids'
import { createPlayerContract } from '@/domain/contract'
import { createPlayerRights } from '@/domain/trade'
import { defaultRecruitingRules, recruitingRulesetForSeason } from '@/domain/recruiting'
import { getFreeAgents } from '@/domain/world'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'
import { arriveSignedRecruits, generateLegacyFixtureRecruitingPool, makeRecruitingOffer, resolveRecruitingCommitments, signCommittedRecruit } from '@/engine/recruiting/RecruitingEngine'
import { signFreeAgent } from './MarketService'
import { rankAiFreeAgentCandidates } from './AiRosterMaintenance'

describe('AI roster maintenance', () => {
  it('reserves signed future recruits and active rights while keeping genuine free agents eligible', () => {
    let world = createNewGame()
    const season = Object.values(world.seasons).find(item => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
    const competition = world.competitions[season.competitionId]!
    const ecosystem = world.ecosystems[competition.ecosystemId]!
    const year = Number(season.startDate.slice(0, 4))
    const signingDay = Array.from({ length: 14 }, (_, index) => index + 1).filter(day => new Date(Date.UTC(year, 10, day)).getUTCDay() === 3)[1]!
    world = updateGameWorld(world, { currentDate: createGameDate(year, 11, signingDay), currentSeasonId: season.id })
    const cycle = { id: 'world-repair-pending-signing-cycle', ecosystemId: ecosystem.id, sourceSeasonId: season.id, targetSeasonId: season.id, opensOn: world.currentDate, signingOn: world.currentDate, closesOn: season.endDate, status: 'open' as const, rules: { ...defaultRecruitingRules, poolSize: 1, commitmentThreshold: 1 }, calendar: recruitingRulesetForSeason(ecosystem.category, year) }
    world = updateGameWorld(world, { recruitingCycles: [...Object.values(world.recruitingCyclesById), cycle] })
    world = generateLegacyFixtureRecruitingPool(world, cycle.id)
    let recruit = Object.values(world.recruitProfilesById).find(profile => profile.cycleId === cycle.id)!
    world = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map(profile => profile.id === recruit.id ? { ...profile, education: { highSchoolGraduationYear: year } } : profile) })
    recruit = world.recruitProfilesById[recruit.id]!
    const offer = makeRecruitingOffer(world, cycle.id, recruit.id, competition.participantTeamIds[0]!)
    if (!offer.ok) throw new Error(`recruit offer failed: ${offer.reason}`)
    const committed = resolveRecruitingCommitments(offer.value, cycle.id)
    const signing = signCommittedRecruit(committed, cycle.id, recruit.id)
    if (!signing.ok) throw new Error(`recruit signing failed: ${signing.reason}`)
    world = signing.value
    const pendingPlayer = world.players[recruit.playerId]!
    const aiTeam = Object.values(world.teams).find(team => team.gender === pendingPlayer.gender && team.coachId !== world.userCoachId && Object.values(world.competitions).some(candidate => candidate.participantTeamIds.includes(team.id) && world.ecosystems[candidate.ecosystemId]?.kind !== 'ncaaLike'))!
    const donorTeams = Object.values(world.teams).filter(team => team.id !== aiTeam.id && team.id !== competition.participantTeamIds[0] && team.gender === pendingPlayer.gender && team.rosterPlayerIds.length > 0)
    const genuineFreeAgentId = donorTeams[0]!.rosterPlayerIds[0]!
    const activeContractPlayerId = donorTeams[1]!.rosterPlayerIds[0]!
    const scheduledContractPlayerId = donorTeams[2]!.rosterPlayerIds[0]!
    const rightsPlayerId = donorTeams[3]!.rosterPlayerIds[0]!
    world = releasePlayer(world, donorTeams[0]!.id, genuineFreeAgentId)
    world = releasePlayer(world, donorTeams[1]!.id, activeContractPlayerId)
    world = signFreeAgent(world, donorTeams[0]!.id, activeContractPlayerId)
    world = releasePlayer(world, donorTeams[2]!.id, scheduledContractPlayerId)
    world = releasePlayer(world, donorTeams[3]!.id, rightsPlayerId)
    const scheduledOn = addDays(world.currentDate, 30)
    const scheduledContract = createPlayerContract({ id: contractIdFromString('contract:world-repair-scheduled-candidate'), playerId: scheduledContractPlayerId, teamId: aiTeam.id, kind: 'standard', term: { startsOn: scheduledOn, expiresOn: addYears(scheduledOn, 1) }, compensation: { annualSalary: 100_000 } })
    const professionalCompetition = Object.values(world.competitions).find(candidate => candidate.participantTeamIds.includes(aiTeam.id))!
    const activeRights = createPlayerRights({ id: 'draft-rights:world-repair-candidate', playerId: rightsPlayerId, ecosystemId: professionalCompetition.ecosystemId, ownerTeamId: aiTeam.id, rightsType: 'draft', acquiredAt: world.currentDate, status: 'active' })
    world = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), scheduledContract], playerRights: [...Object.values(world.playerRightsById), activeRights] })

    const candidates = rankAiFreeAgentCandidates(world, aiTeam.id)
    expect(candidates.some(candidate => candidate.playerId === pendingPlayer.id)).toBe(false)
    expect(candidates.some(candidate => candidate.playerId === genuineFreeAgentId)).toBe(true)
    expect(candidates.some(candidate => candidate.playerId === rightsPlayerId)).toBe(false)
    const placeholderId = seasonIdFromString(`${season.id}:pending-successor`)
    const placeholderWorld = updateGameWorld(world, {
      recruitingCycles: Object.values(world.recruitingCyclesById).map(item => item.id === cycle.id ? { ...item, targetSeasonId: placeholderId } : item),
      recruitSignings: Object.values(world.recruitSigningsById).map(item => item.cycleId === cycle.id ? { ...item, targetSeasonId: placeholderId } : item),
    })
    expect(placeholderWorld.seasons[placeholderId]).toBeUndefined()
    expect(rankAiFreeAgentCandidates(placeholderWorld, aiTeam.id).some(candidate => candidate.playerId === pendingPlayer.id)).toBe(false)
    expect(getFreeAgents(world).some(player => player.id === activeContractPlayerId)).toBe(false)
    expect(getFreeAgents(world).some(player => player.id === scheduledContractPlayerId)).toBe(false)

    const shortWorld = updateGameWorld(world, {
      teams: Object.values(world.teams).map(team => team.id === aiTeam.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 4) } : team),
      teamFinances: Object.values(world.teamFinancesByTeamId).map(finance => finance.teamId === aiTeam.id ? { ...finance, playerSalaryBudget: 100_000_000 } : finance),
    })
    const repaired = maintainAiTeamMinimumRosters(shortWorld, { source: 'WORLD_REPAIR', teamIds: [aiTeam.id] })
    expect(repaired.world.teams[aiTeam.id]!.rosterPlayerIds).not.toContain(pendingPlayer.id)
    expect(Object.values(repaired.world.playerTransactionsById).some(transaction => transaction.playerId === pendingPlayer.id && transaction.kind === 'signedFreeAgent' && transaction.provenance === 'WORLD_REPAIR')).toBe(false)
    expect(repaired.reports.some(report => report.diagnostics.some(diagnostic => diagnostic.code === 'PENDING_BINDING_ROSTER_COMMITMENT' && diagnostic.message.includes(pendingPlayer.id)))).toBe(true)
    expect(repaired.world.recruitProfilesById[recruit.id]!.status).toBe('incoming')

    const atArrival = updateGameWorld(repaired.world, { currentDate: season.startDate, currentSeasonId: season.id })
    const arrived = arriveSignedRecruits(atArrival)
    const rosterOwners = Object.values(arrived.teams).filter(team => team.rosterPlayerIds.includes(pendingPlayer.id))
    expect(arrived.recruitProfilesById[recruit.id]!.status).toBe('arrived')
    expect(rosterOwners.map(team => team.id)).toEqual([competition.participantTeamIds.find(teamId => arrived.teams[teamId]!.rosterPlayerIds.includes(pendingPlayer.id))])
    expect(rosterOwners).toHaveLength(1)
    expect(rosterOwners[0]!.id).toBe(Object.values(arrived.recruitSigningsById).find(item => item.recruitId === recruit.id)!.programTeamId)
    expect(arrived.players[pendingPlayer.id]!.personId).toBe(pendingPlayer.personId)
  })

  it('reports NCAA shortages when no existing Player can legally enroll', () => {
    const base = createNewGame()
    const competition = Object.values(base.competitions).find(item => base.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')!
    const college = base.teams[competition.participantTeamIds[0]!]!
    const donor = Object.values(base.teams).find(team => !competition.participantTeamIds.includes(team.id) && team.gender === college.gender)!
    const released = releasePlayer(base, donor.id, donor.rosterPlayerIds[0]!)
    const short = updateGameWorld(released, {
      teams: Object.values(released.teams).map(team => team.id === college.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 4) } : team),
      teamFinances: Object.values(released.teamFinancesByTeamId).map(finance => finance.teamId === college.id ? { ...finance, playerSalaryBudget: 100_000_000 } : finance),
    })
    const result = maintainAiTeamMinimumRosters(short, { source: 'WORLD_REPAIR', teamIds: [college.id] })
    expect(result.world).toBe(short)
    expect(result.unresolvedTeamIds).toEqual([college.id])
    expect(result.reports[0]?.diagnostics[0]?.code).toBe('NCAA_NO_ELIGIBLE_EXISTING_INTAKE')
  })
  it('signs one available Player when a scheduled professional team has five rostered but four available', () => {
    const base = createNewGame()
    const user = Object.values(base.teams).find(team => team.coachId === base.userCoachId)!
    const game = Object.values(base.games).sort((a, b) => a.date.localeCompare(b.date))[0]!
    const ai = base.teams[game.homeTeamId === user.id ? game.awayTeamId : game.homeTeamId]!
    const donor = Object.values(base.teams).find(team => team.id !== user.id && team.id !== ai.id && team.gender === ai.gender)!
    const released = releasePlayer(base, donor.id, donor.rosterPlayerIds[0]!)
    const injury = createInjury({ id: injuryIdFromString('injury:minimum-available-roster'), playerId: ai.rosterPlayerIds[0]!, kind: 'ankleSprain', severity: 'minor', injuredOn: game.date, expectedReturnDate: addDays(game.date, 7) })
    const short = updateGameWorld(released, {
      currentDate: game.date,
      teams: Object.values(released.teams).map(team => team.id === ai.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 5) } : team),
      injuries: [injury],
      teamFinances: Object.values(released.teamFinancesByTeamId).map(finance => finance.teamId === ai.id ? { ...finance, playerSalaryBudget: 100_000_000 } : finance),
    })
    expect(getAvailablePlayersForCompetition(short, ai.id, game.competitionId, game.seasonId, game.date)).toHaveLength(4)
    const result = maintainAiTeamMinimumRosters(short, { source: 'WORLD_REPAIR', teamIds: [ai.id] })
    expect(result.world.teams[ai.id]!.rosterPlayerIds).toHaveLength(6)
    expect(getAvailablePlayersForCompetition(result.world, ai.id, game.competitionId, game.seasonId, game.date)).toHaveLength(5)
    expect(result.world.injuriesById[injury.id]).toEqual(short.injuriesById[injury.id])
    expect(Object.keys(result.world.players)).toEqual(Object.keys(short.players))
    expect(maintainAiTeamMinimumRosters(result.world, { source: 'WORLD_REPAIR', teamIds: [ai.id] }).world).toBe(result.world)
  })
  it('repairs an AI minimum from affordable free agents deterministically and idempotently', () => {
    const base = createNewGame()
    const user = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    const ai = Object.values(base.teams).find((team) => team.id !== user.id)!
    const donor = Object.values(base.teams).find((team) => team.id !== user.id && team.id !== ai.id)!
    const released = releasePlayer(base, donor.id, donor.rosterPlayerIds[0]!)
    const short = updateGameWorld(released, {
      teams: Object.values(released.teams).map((team) => team.id === ai.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 4) } : team),
      teamFinances: Object.values(released.teamFinancesByTeamId).map((finance) => finance.teamId === ai.id ? { ...finance, playerSalaryBudget: 100_000_000 } : finance),
    })

    const result = maintainAiTeamMinimumRosters(short, { source: 'WORLD_REPAIR', teamIds: [ai.id] })
    expect(result.world.teams[ai.id]!.rosterPlayerIds).toHaveLength(5)
    expect(result.world.teams[ai.id]!.rosterPlayerIds).toContain(released.players[donor.rosterPlayerIds[0]!]!.id)
    expect(result.world.teams[user.id]!.rosterPlayerIds).toEqual(short.teams[user.id]!.rosterPlayerIds)
    expect(result.unresolvedTeamIds).toEqual([])
    expect(result.reports.find((report) => report.targetEntity === ai.id)).toMatchObject({ classification: 'RECOVERABLE', sourceDomain: 'WORLD_REPAIR', worldChanged: true, userActionRequired: false })
    expect(Object.values(result.world.playerTransactionsById).filter((transaction) => transaction.toTeamId === ai.id && transaction.kind === 'signedFreeAgent')).toEqual([expect.objectContaining({ provenance: 'WORLD_REPAIR' })])

    const repeated = maintainAiTeamMinimumRosters(result.world, { source: 'WORLD_REPAIR', teamIds: [ai.id] })
    expect(repeated.world).toEqual(result.world)
    expect(repeated.world.teams[ai.id]!.rosterPlayerIds).toHaveLength(5)
  })

  it('never auto-fills a user roster and reports manual Market action', () => {
    const world = createNewGame()
    const user = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
    const short = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === user.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 4) } : team) })
    const result = maintainAiTeamMinimumRosters(short, { source: 'WORLD_REPAIR', teamIds: [user.id] })

    expect(result.world.teams[user.id]!.rosterPlayerIds).toEqual(short.teams[user.id]!.rosterPlayerIds)
    expect(result.unresolvedTeamIds).toContain(user.id)
    expect(result.reports.find((report) => report.targetEntity === user.id)).toMatchObject({ classification: 'RECOVERABLE', worldChanged: false, userActionRequired: true })
  })

  it('reports an AI shortage unresolved when no free agent exists and creates no players', () => {
    const world = createNewGame()
    const ai = Object.values(world.teams)[1]!
    const short = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === ai.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 3) } : team) })
    const playerIds = Object.keys(short.players)
    const result = maintainAiTeamMinimumRosters(short, { source: 'WORLD_REPAIR', teamIds: [ai.id] })

    expect(result.unresolvedTeamIds).toContain(ai.id)
    expect(result.world.teams[ai.id]!.rosterPlayerIds).toHaveLength(3)
    expect(Object.keys(result.world.players)).toEqual(playerIds)
    expect(result.reports.find((report) => report.targetEntity === ai.id)).toMatchObject({ classification: 'UNRECOVERABLE', worldChanged: false, userActionRequired: false })
  })

  it('keeps contract cost objective and separate from talent valuation', () => {
    expect(freeAgentDesirability(70, 500_000)).toBeGreaterThan(freeAgentDesirability(70, 2_000_000))
  })
})
