import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { ensureTransferPortalRuleset } from './TransferPortalRulesLifecycle'

describe('Transfer Portal ruleset lifecycle', () => {
  it('carries the latest supported authority into 2045-46 with simulated provenance', () => {
    let world = createNewGame()
    const ncaaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
    const future = { ...ncaaSeason, id: 'season:ncaa:2045-46' as never, label: '2045-46', startDate: parseGameDate('2045-10-01'), endDate: parseGameDate('2046-04-30') }
    world = updateGameWorld(world, { seasons: [...Object.values(world.seasons), future] })
    const priorRuleset = Object.values(world.transferPortalRulesetsById).filter((ruleset) => ruleset.ecosystemId === world.competitions[future.competitionId]!.ecosystemId).sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0]!
    world = ensureTransferPortalRuleset(world, future.id)
    const ruleset = world.transferPortalRulesetsById[`transfer:${world.competitions[future.competitionId]!.ecosystemId}:${future.id}`]!
    expect(ruleset).toMatchObject({ version: '2045-46.carry-forward.1', provenance: 'SIMULATED_CARRY_FORWARD', basedOnRulesetId: priorRuleset.id, basketballNotificationDays: 15 })
    expect(world.transferPortalRulesetsById[priorRuleset.id]!.provenance).toBe('SIMULATED_CARRY_FORWARD')
    expect(ensureTransferPortalRuleset(world, future.id)).toBe(world)
  })
})
