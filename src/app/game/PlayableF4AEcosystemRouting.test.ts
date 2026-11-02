import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame, createNcaaSimulatedGame } from '@/app/game'
import { ACB_QUICK_START_TEAM_KEY } from '@/data/acb2026'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { resolveTradeSeasonAuthorityForTeam } from '@/engine/trade'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { isWorkspaceApplicable } from '@/ui-ng/system/startMenuCatalog'
import { resolveClubActiveSeasons, resolveGameCapabilities } from '@/ui/gameContext'

function saveRoundTrip<T extends ReturnType<typeof createNewGame>>(world: T): T {
  return deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-11-01T00:00:00Z')))) as T
}

describe('F4A ecosystem routing pilots', () => {
  it('A · FIBA-like ACB keeps professional market access without NBA/NCAA mechanisms and survives Save V4', () => {
    const world = createAcbTestGame({ userTeamKey: ACB_QUICK_START_TEAM_KEY, playableMarket: true })
    const team = getUserTeam(world)!
    const capabilities = resolveGameCapabilities(world)

    expect(world.ecosystems[world.competitions[world.seasons[world.currentSeasonId]!.competitionId]!.ecosystemId]!.kind).toBe('fibaLike')
    expect(capabilities.hasTrades).toBe(false)
    expect(capabilities.hasDraft).toBe(false)
    expect(capabilities.isNcaa).toBe(false)
    expect(isWorkspaceApplicable('market', capabilities)).toBe(true)
    expect(isWorkspaceApplicable('trades', capabilities)).toBe(false)
    expect(resolveTradeSeasonAuthorityForTeam(world, team.id)).toBeUndefined()
    expect(saveRoundTrip(world).userCoachId).toBe(world.userCoachId)
  })

  it('B · NBA-like routing follows the coached franchise, not the global season pointer', () => {
    const initial = createNewGame()
    const nbaSeason = Object.values(initial.seasons).find((season) => initial.tradeRulesBySeasonId[season.id] !== undefined && initial.salaryRulesBySeasonId[season.id] !== undefined)!
    const teamId = initial.competitions[nbaSeason.competitionId]!.participantTeamIds.find((id) => initial.teams[id]!.coachId !== undefined)!
    const world = updateGameWorld(initial, {
      userCoachId: initial.teams[teamId]!.coachId!,
      currentDate: nbaSeason.startDate,
      gmPlanStates: Object.values(initial.gmPlanStatesById).filter((plan) => plan.teamId !== teamId),
    })
    const capabilities = resolveGameCapabilities(world)

    expect(world.currentSeasonId).not.toBe(nbaSeason.id)
    expect(capabilities.hasTrades).toBe(true)
    expect(capabilities.hasSalaryCap).toBe(true)
    expect(capabilities.isNcaa).toBe(false)
    expect(resolveTradeSeasonAuthorityForTeam(world, teamId)).toBeDefined()
    expect(isWorkspaceApplicable('trades', capabilities)).toBe(true)
    expect(isWorkspaceApplicable('recruiting', capabilities)).toBe(false)
    expect(saveRoundTrip(world).teams[teamId]).toEqual(world.teams[teamId])
  })

  it('C · NCAA-like routing exposes recruiting/portal authority and keeps professional market tools out', () => {
    const world = createNcaaSimulatedGame()
    const capabilities = resolveGameCapabilities(world)
    const activeSeasons = resolveClubActiveSeasons(world)

    expect(activeSeasons.some((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.kind === 'ncaaLike')).toBe(true)
    expect(capabilities.isNcaa).toBe(true)
    expect(capabilities.hasTrades).toBe(false)
    expect(isWorkspaceApplicable('recruiting', capabilities)).toBe(true)
    expect(isWorkspaceApplicable('portal', capabilities)).toBe(true)
    expect(isWorkspaceApplicable('trades', capabilities)).toBe(false)
    expect(saveRoundTrip(world).userCoachId).toBe(world.userCoachId)
  })
})
