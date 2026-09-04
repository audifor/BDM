import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { injuryIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import type { PlayerId } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'

import {
  buildPlayerHistoryModel,
  filterHistoryItems,
  findHistoryInspectorDetail,
} from './buildPlayerHistoryModel'
import { buildPlayerWorkspaceModel, defaultPlayerIdForNg } from './buildPlayerWorkspaceModel'

function withInjury(
  world: ReturnType<typeof createNewGame>,
  playerId: PlayerId,
  input: {
    readonly id?: string
    readonly injuredOn?: string
    readonly expectedReturnDate?: string
  } = {},
) {
  const injury = createInjury({
    id: injuryIdFromString(input.id ?? 'injury-history-test'),
    playerId,
    kind: 'ankleSprain',
    severity: 'moderate',
    injuredOn: (input.injuredOn ?? world.currentDate) as never,
    expectedReturnDate: (input.expectedReturnDate ?? addDays(world.currentDate, 14)) as never,
  })

  return updateGameWorld(world, {
    injuries: [...Object.values(world.injuriesById), injury],
  })
}

describe('buildPlayerHistoryModel', () => {
  it('builds contract and season history from real persisted records', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerHistoryModel(world, playerId)

    expect(model).toBeDefined()
    expect(model!.summary.contractCount).toBeGreaterThan(0)
    expect(model!.items.some((item) => item.type === 'contract')).toBe(true)
    expect(model!.scope.scopeNote).toContain('persisted in this save')
    expect(model!.items.every((item) => item.source !== 'GAME_LOG_DERIVATION' || item.type === 'season')).toBe(true)
  })

  it('normalizes medical events without inventing transactions from roster state', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const injuredWorld = withInjury(world, playerId, {
      id: 'injury-history-1',
      injuredOn: addDays(world.currentDate, -10),
      expectedReturnDate: addDays(world.currentDate, 4),
    })
    const model = buildPlayerHistoryModel(injuredWorld, playerId)!

    expect(model.items.some((item) => item.type === 'medical')).toBe(true)
    expect(model.items.some((item) => item.type === 'transaction')).toBe(false)
    expect(model.items.some((item) => item.title.includes('Joined'))).toBe(false)
  })

  it('orders mixed exact-date and season-level events newest first', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const injuredWorld = withInjury(world, playerId)
    const model = buildPlayerHistoryModel(injuredWorld, playerId)!

    for (let index = 0; index < model.items.length - 1; index += 1) {
      expect(model.items[index]!.sortDate.localeCompare(model.items[index + 1]!.sortDate)).toBeGreaterThanOrEqual(0)
    }
  })

  it('filters history items by populated event families only', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerHistoryModel(withInjury(world, playerId), playerId)!

    expect(model.filters.some((filter) => filter.id === 'medical')).toBe(true)
    expect(filterHistoryItems(model.items, 'medical').every((item) => item.type === 'medical')).toBe(true)
    expect(filterHistoryItems(model.items, 'all')).toHaveLength(model.items.length)
  })

  it('does not include development or rating progression events', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerHistoryModel(world, playerId)!

    expect(model!.items.some((item) => item.title.toLowerCase().includes('rating'))).toBe(false)
    expect(model!.items.some((item) => item.title.toLowerCase().includes('development'))).toBe(false)
    expect(model!.scope.gapsNote).toContain('rating progression history')
  })

  it('transforms inspector detail for contract and medical selections', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const injuredWorld = withInjury(world, playerId)
    const model = buildPlayerHistoryModel(injuredWorld, playerId)!
    const contractItem = model.items.find((item) => item.type === 'contract')
    const medicalItem = model.items.find((item) => item.type === 'medical')

    expect(findHistoryInspectorDetail(injuredWorld, playerId, model, contractItem?.id ?? null)?.kind).toBe('contract')
    expect(findHistoryInspectorDetail(injuredWorld, playerId, model, medicalItem?.id ?? null)?.kind).toBe('medical')
  })

  it('connects history into the player workspace model', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const workspace = buildPlayerWorkspaceModel(world, playerId)

    expect(workspace?.history.items.length).toBeGreaterThan(0)
    expect(workspace?.history.defaultSelectedItemId).toBe(workspace?.history.items[0]?.id ?? null)
  })

  it('returns undefined for missing players without fabricating history', () => {
    expect(buildPlayerHistoryModel(createNewGame(), 'missing-player' as PlayerId)).toBeUndefined()
  })
})
