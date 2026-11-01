import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { applyUserCoachCreation } from '@/app/game/UserCoachCreator'
import { getUserHumanSituations } from '@/app/hrpg/HumanSimulationService'
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
    expect(model.items.every((item) => item.choices === undefined)).toBe(true)
  })

  it('projects real HRPG choices into the Hub without creating a second inbox', () => {
    const world = applyUserCoachCreation(createAcbTestGame({ userTeamKey: 'ucm' }), {
      firstName: 'Elena', lastName: 'Human', dateOfBirth: '1990-01-01', gender: 'female', nationalityCountryCode: 'ESP',
      background: 'rookie', ambition: 'firstTitle', coachingStyle: 'balanced', disposition: 'balanced', biography: 'F3 test coach.',
    })
    const sourceSituations = getUserHumanSituations(world).filter((item) => item.status === 'open' && item.choices.length > 0)
    const model = buildDirectorHubModel(world)
    const humanItems = model.items.filter((item) => item.id.startsWith('human-situation:'))

    expect(sourceSituations.length).toBeGreaterThan(0)
    expect(humanItems).toHaveLength(sourceSituations.length)
    expect(humanItems.every((item) => item.tier === 'A' && item.action === undefined && (item.choices?.length ?? 0) > 0)).toBe(true)
    expect(model.items.filter((item) => item.id.startsWith('human-situation:')).map((item) => item.id)).toEqual(
      sourceSituations.map((item) => `human-situation:${item.id}`),
    )
  })

  it('rebuilds the same projection after Save V4 round-trip because the hub stores no derived state', () => {
    const world = createNewGame()
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, '2026-11-01T10:00:00.000Z'))
    expect(buildDirectorHubModel(restored).items.map((item) => item.id)).toEqual(buildDirectorHubModel(world).items.map((item) => item.id))
  })
})
