import { describe, expect, it } from 'vitest'

import { createNcaaSimulatedGame } from './createNcaaSimulatedGame'
import { addDays } from '@/domain/date'
import { createGame } from '@/domain/game'
import { canPerformRecruitingAction } from '@/engine/recruiting/RecruitingPermission'
import { resolveBasketballChampionshipDate } from '@/engine/recruiting/RecruitingEngine'
import { advanceDay } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'
import { simulateUntilDate } from './simulateUntilDate'
import { discoverRecruitingTalentCandidate } from '@/engine/recruiting/RecruitingEngine'

describe('simulated NCAA development career', () => {
  it('opens an NCAA men’s RecruitingCycle and controls a participating program', () => {
    const world = createNcaaSimulatedGame()
    const season = world.seasons[world.currentSeasonId]!
    const competition = world.competitions[season.competitionId]!
    const ecosystem = world.ecosystems[competition.ecosystemId]!
    const program = competition.participantTeamIds.find((teamId) => world.teams[teamId]?.coachId === world.userCoachId)
    const cycle = Object.values(world.recruitingCyclesById).find((item) => item.sourceSeasonId === season.id)

    expect(ecosystem).toMatchObject({ kind: 'ncaaLike', category: 'men' })
    expect(program).toBeDefined()
    expect(cycle).toMatchObject({ status: 'open', sourceSeasonId: season.id })
    expect(cycle?.institutionalSigningPolicies).toContainEqual(expect.objectContaining({ programTeamId: program, seasonId: season.id, provenance: 'SIMULATED_CARRY_FORWARD', basedOnSeasonId: season.id }))
    const year = Number(season.startDate.slice(0, 4))
    expect(cycle?.calendar).toMatchObject({ provenance: 'SIMULATED_CARRY_FORWARD', derivedSeason: `${year}-${String(year + 1).slice(-2)}` })
    expect(season.worldCompetitionFormat?.variants[0]?.nodes.some((node) => node.role === 'FINAL')).toBe(true)
    const simulatedFinal = Object.values(world.games).find((game) => game.seasonId === season.id && game.competitionStageKey === 'FINAL' && game.stakes === 'final')
    expect(simulatedFinal).toMatchObject({ date: addDays(season.endDate, -45), status: 'scheduled' })
    expect(Object.values(world.games).some((game) => game.status === 'scheduled' && game.date < world.currentDate)).toBe(false)
  })

  it('signs an AI verbal commitment when the regular signing window opens between monthly AI cadences', () => {
    let world = createNcaaSimulatedGame()
    const season = world.seasons[world.currentSeasonId]!
    const competition = world.competitions[season.competitionId]!
    const userProgramTeamId = competition.participantTeamIds.find((teamId) => world.teams[teamId]?.coachId === world.userCoachId)!
    const aiProgramTeamId = competition.participantTeamIds.find((teamId) => teamId !== userProgramTeamId)!
    const cycle = Object.values(world.recruitingCyclesById).find((item) => item.sourceSeasonId === season.id)!
    const finalFixture = Object.values(world.games).find((game) => game.seasonId === season.id && game.competitionStageKey === 'FINAL')!
    const completedFinal = createGame({ ...finalFixture, status: 'completed', result: { homeScore: 78, awayScore: 71 } })
    const discovered = discoverRecruitingTalentCandidate(world, cycle.id, aiProgramTeamId)
    expect(discovered.ok).toBe(true)
    if (!discovered.ok) return
    world = discovered.value
    const profile = Object.values(world.recruitProfilesById).find((item) => item.cycleId === cycle.id)!
    world = updateGameWorld(world, { games: [completedFinal] })
    const institutionalSigningEndOn = cycle.institutionalSigningPolicies?.find((item) => item.programTeamId === aiProgramTeamId)?.finalAidSigningDate
    const championshipDate = resolveBasketballChampionshipDate(world, cycle)
    expect(championshipDate).toBe(finalFixture.date)
    expect(institutionalSigningEndOn).toBeDefined()
    const signingDate = Array.from({ length: 60 }, (_, index) => addDays(finalFixture.date, index + 1)).find((date) => date.slice(-2) !== '01' && canPerformRecruitingAction({ date, isNCAA: true, calendar: cycle.calendar, category: 'men', prospectGroup: profile.prospectGroup, action: 'sign', basketballChampionshipDate: championshipDate, institutionalRegularSigningEndOn: institutionalSigningEndOn }).allowed)
    expect(signingDate).toBeDefined()
    if (signingDate === undefined) return
    const commitment = { id: `commitment:${cycle.id}:${profile.id}`, cycleId: cycle.id, recruitId: profile.id, programTeamId: aiProgramTeamId, offerId: `offer:${cycle.id}:${profile.id}:${aiProgramTeamId}`, committedOn: addDays(signingDate, -1) }
    const offer = { id: commitment.offerId, cycleId: cycle.id, recruitId: profile.id, programTeamId: aiProgramTeamId, status: 'committed' as const, madeOn: commitment.committedOn }
    world = updateGameWorld(world, {
      currentDate: addDays(signingDate, -1),
      recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status: 'signing' as const, rules: { ...item.rules, commitmentThreshold: -100 } } : item),
      recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.id === profile.id ? { ...item, status: 'committed' as const } : item),
      recruitingCommitments: [commitment],
      recruitingOffers: [offer],
    })

    const signed = advanceDay(world)

    expect(signed.currentDate).toBe(signingDate)
    expect(signed.recruitProfilesById[profile.id]?.status).toBe('incoming')
    expect(signed.recruitSigningsById[`signing:${cycle.id}:${profile.id}`]?.signedOn).toBe(signingDate)
  })

  it('advances the simulated NCAA career through an explicit date without requiring official future data', () => {
    const world = createNcaaSimulatedGame()
    const target = addDays(world.currentDate, 1)
    const result = simulateUntilDate(world, target)

    expect(result).toMatchObject({ finalDate: target, daysAdvanced: 1, stopReason: { type: 'arrived' } })
  })

  it('simulates through monthly AI recruiting and both NCAA cycles without losing profiles', { timeout: 180_000 }, () => {
    const world = createNcaaSimulatedGame()
    const cycle = Object.values(world.recruitingCyclesById).find((item) => item.status === 'open')!
    const program = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!.id
    const discovered = discoverRecruitingTalentCandidate(world, cycle.id, program)
    expect(discovered.ok).toBe(true)
    if (!discovered.ok) return
    const result = simulateUntilDate(discovered.value, '2033-02-02' as never)
    const ncaaCycles = Object.values(result.world.recruitingCyclesById).filter((cycle) => result.world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike')

    expect(result.finalDate).toBe('2033-02-02')
    expect(result.stopReason).toEqual({ type: 'arrived' })
    expect(ncaaCycles.every((cycle) => Object.values(result.world.recruitProfilesById).some((profile) => profile.cycleId === cycle.id))).toBe(true)
  })
})
