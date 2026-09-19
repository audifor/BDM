import { describe, expect, it } from 'vitest'

import { completeMatch, createNewGame, prepareUserMatch } from '@/app/game'
import { addDays } from '@/domain/date'
import { injuryIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import type { PlayerId } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'

import {
  buildPlayerHistoryModel,
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

  it('builds the career arc, the contract ledger and the honours from records', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerHistoryModel(world, playerId)!

    // Every timeline event comes from a record and is selectable.
    for (const event of model.timeline) {
      expect(['debut', 'breakout', 'transfer', 'career-high', 'contract']).toContain(event.type)
      expect(event.title.length).toBeGreaterThan(0)
      expect(event.subtitle.length).toBeGreaterThan(0)
      expect(event.selectionId.length).toBeGreaterThan(0)
    }
    // The timeline is ordered oldest first, so it reads as an arc.
    for (let index = 0; index + 1 < model.timeline.length; index += 1) {
      expect(
        model.timeline[index]!.sortDate.localeCompare(model.timeline[index + 1]!.sortDate),
      ).toBeLessThanOrEqual(0)
    }

    expect(model.contractHistory.length).toBeGreaterThan(0)
    for (const row of model.contractHistory) {
      expect(row.salaryLabel.length).toBeGreaterThan(0)
      expect(['Signed', 'Extension']).toContain(row.statusLabel)
      expect(row.selectionId).toBe(`contract:${row.id}`)
    }

    // Honours are only what the records evidence; the note names what is not stored.
    expect(model.honours.every((honour) => honour.derived)).toBe(true)
    expect(model.honoursNote).toContain('not persisted')
    expect(
      model.honours.some((honour) => honour.id === 'games-threshold') ||
        model.careerTotals.games < 10,
    ).toBe(true)
    expect(model.transactions.every((row) => row.selectionId.startsWith('transaction:'))).toBe(true)
  })

  it('does not include development or rating progression events', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerHistoryModel(world, playerId)!

    expect(model!.items.some((item) => item.title.toLowerCase().includes('rating'))).toBe(false)
    expect(model!.items.some((item) => item.title.toLowerCase().includes('development'))).toBe(false)
    expect(model!.gaps.map((gap) => gap.label)).toContain('International career')
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

  it('opens the detail of a timeline event and of a performance milestone', () => {
    const base = createNewGame()
    const simulation = prepareUserMatch(base)
    const world = completeMatch(base, simulation)
    const playerId = simulation.squads.home[0]!
    const model = buildPlayerHistoryModel(world, playerId)!
    const line = world.matchStatLogsByGameId[simulation.gameId]!.playerLines.find(
      (entry) => entry.playerId === playerId,
    )!

    // The debut of the timeline and the career-high milestone both open a real box score.
    const debut = findHistoryInspectorDetail(world, playerId, model, 'timeline:debut')
    expect(debut?.kind).toBe('milestone')
    if (debut?.kind === 'milestone') {
      expect(debut.title).toBe('Debut')
      expect(debut.stats.map((stat) => stat.label)).toEqual(['PTS', 'REB', 'AST', 'STL', 'VAL'])
      expect(debut.stats.find((stat) => stat.label === 'PTS')?.value).toBe(String(line.stats.points))
      expect(debut.metadata.map((row) => row.label)).toEqual([
        'Competition',
        'Date',
        'Team',
        'Opponent',
        'Role',
        'Minutes',
      ])
      // No photograph is stored, and the panel says so instead of showing a stand-in.
      expect(debut.imageNote).toContain('No photograph')
      expect(debut.description).toContain('First recorded appearance')
    }

    const milestone = model.performanceMilestones.find(
      (row) => row.id === 'career-high-points',
    )
    const detail = findHistoryInspectorDetail(world, playerId, model, milestone?.selectionId ?? null)
    expect(detail?.kind).toBe('milestone')
    if (detail?.kind === 'milestone') {
      expect(detail.title).toBe('Career High')
      expect(detail.stats.find((stat) => stat.label === 'PTS')?.value).toBe(
        String(line.stats.points),
      )
    }

    expect(findHistoryInspectorDetail(world, playerId, model, 'performance:unknown')).toBeUndefined()
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
