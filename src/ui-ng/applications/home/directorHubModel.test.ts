import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import type { GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { buildDirectorHubModel } from './directorHubModel'

describe('CAREER-F2 director hub projection', () => {
  it('composes the real next match and quiet-state context without inventing recommendations', () => {
    const world = createNewGame()
    const model = buildDirectorHubModel(world)

    expect(model.nextMatch).toBeDefined()
    expect(model.staffActivity).toEqual(expect.objectContaining({ pending: 0 }))
    expect(model.items.some((item) => item.tier === 'D' && item.id === 'director-context')).toBe(true)
    expect(model.items.filter((item) => item.tier === 'B')).toHaveLength(0)
  })

  it('handles a world with no scheduled next game using the canonical empty state', () => {
    const source = createNewGame()
    const world = { ...source, games: {} } as GameWorld
    const model = buildDirectorHubModel(world)

    expect(model.nextMatch).toBeUndefined()
    expect(model.items.find((item) => item.id === 'director-context')).toMatchObject({
      tier: 'D',
      title: 'Sin próximo partido programado',
    })
  })

  it('does not expose a second decision queue: only existing breakpoint or advisory records become actionable', () => {
    const model = buildDirectorHubModel(createNewGame())
    expect(model.items.every((item) => item.action === undefined || item.action.type === 'navigate' || item.action.type === 'continue')).toBe(true)
  })

  it('rebuilds the same projection after Save V4 round-trip because the hub stores no derived state', () => {
    const world = createNewGame()
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, '2026-11-01T10:00:00.000Z'))
    expect(buildDirectorHubModel(restored).items.map((item) => item.id)).toEqual(buildDirectorHubModel(world).items.map((item) => item.id))
  })
})
