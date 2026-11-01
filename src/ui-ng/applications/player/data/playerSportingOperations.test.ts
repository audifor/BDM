import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNcaaSimulatedGame, createNewGame } from '@/app/game'
import { ACB_QUICK_START_TEAM_KEY } from '@/data/acb2026'
import { releasePlayer } from '@/app/market/MarketService'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { discoverRecruitingTalentCandidate } from '@/engine/recruiting/RecruitingEngine'

import { buildPlayerSportingOperations } from './playerSportingOperations'

describe('player sporting operation entry points', () => {
  it('offers a direct professional signing only for a real FIBA free agent', () => {
    const initial = createAcbTestGame({ playableMarket: true, userTeamKey: ACB_QUICK_START_TEAM_KEY })
    const userTeam = getUserTeam(initial)!
    const contract = Object.values(initial.contractsById).find((candidate) => candidate.teamId === userTeam.id)!
    const active = updateGameWorld(initial, { currentDate: contract.term.startsOn })
    const releasablePlayerId = contract.playerId
    const world = releasePlayer(active, userTeam.id, releasablePlayerId)
    const freeAgent = Object.values(world.players).find((player) => buildPlayerSportingOperations(world, player.id).some((action) => action.kind === 'direct-signing'))

    expect(freeAgent).toBeDefined()
    expect(buildPlayerSportingOperations(world, freeAgent!.id)).toEqual([
      expect.objectContaining({ kind: 'direct-signing', enabled: true }),
    ])
  })

  it('offers a trade target from an NBA-like coached franchise', () => {
    const initial = createNewGame()
    const season = Object.values(initial.seasons).find((candidate) => initial.tradeRulesBySeasonId[candidate.id] !== undefined && initial.salaryRulesBySeasonId[candidate.id] !== undefined)!
    const teamId = initial.competitions[season.competitionId]!.participantTeamIds.find((id) => initial.teams[id]!.coachId !== undefined)!
    const world = updateGameWorld(initial, { userCoachId: initial.teams[teamId]!.coachId!, currentDate: season.startDate })
    const target = Object.values(world.teams)
      .find((candidate) => candidate.id !== teamId && candidate.rosterPlayerIds.length > 0 && Object.values(world.competitions).some((competition) => competition.ecosystemId === world.competitions[season.competitionId]!.ecosystemId && competition.participantTeamIds.includes(candidate.id)))!
    const actions = buildPlayerSportingOperations(world, target.rosterPlayerIds[0]!)

    expect(actions.some((action) => action.kind === 'trade' && action.enabled)).toBe(true)
  })

  it('routes NCAA candidates to recruiting or portal, never to professional market', () => {
    const initial = createNcaaSimulatedGame()
    const team = getUserTeam(initial)!
    const cycle = Object.values(initial.recruitingCyclesById).find((candidate) => candidate.status === 'open')!
    const discovered = discoverRecruitingTalentCandidate(initial, cycle.id, team.id)
    expect(discovered.ok).toBe(true)
    if (!discovered.ok) return
    const world = discovered.value
    const candidate = Object.values(world.recruitProfilesById).map((profile) => profile.playerId).find((playerId) => !team.rosterPlayerIds.includes(playerId) && buildPlayerSportingOperations(world, playerId).some((action) => action.kind === 'recruiting' || action.kind === 'portal'))

    expect(candidate).toBeDefined()
    expect(buildPlayerSportingOperations(world, candidate!).some((action) => action.kind === 'direct-signing')).toBe(false)
    expect(buildPlayerSportingOperations(world, candidate!).some((action) => action.kind === 'recruiting' || action.kind === 'portal')).toBe(true)
  })
})
