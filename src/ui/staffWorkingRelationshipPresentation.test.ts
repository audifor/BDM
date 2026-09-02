import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { applyRelationshipEventToWorld, type GameWorld } from '@/domain/world'
import { explainWorkingRelationship, deriveWorkingRelationshipState, deriveWorkingRelationshipTrend } from './staffWorkingRelationshipPresentation'

function baseWorld(): GameWorld { return createNewGame() }

describe('explainWorkingRelationship', () => {
  it('returns undefined when no profile exists (never fabricates a relationship)', () => {
    const world = baseWorld()
    const player = Object.values(world.players)[0]!
    expect(explainWorkingRelationship(world, world.userCoachId, player.id)).toBeUndefined()
  })

  it('never exposes raw -100..100 numbers — only qualitative bands', () => {
    const world = baseWorld()
    const player = Object.values(world.players)[0]!
    const withEvent = applyRelationshipEventToWorld(world, world.userCoachId, player.id, { id: 'e1', gameDate: world.currentDate, source: 'professionalInteraction', delta: 5, context: {}, dimensionDeltas: { trust: 40, professionalRespect: 45 } })
    const explanation = explainWorkingRelationship(withEvent, world.userCoachId, player.id)!
    for (const facet of explanation.facets) expect(typeof facet.band).toBe('string')
    expect(typeof explanation.state).toBe('string')
  })

  it('trend is derived from recent events, not persisted', () => {
    const world = baseWorld()
    const player = Object.values(world.players)[0]!
    const improving = applyRelationshipEventToWorld(world, world.userCoachId, player.id, { id: 'e1', gameDate: world.currentDate, source: 'professionalInteraction', delta: 10, context: {}, dimensionDeltas: { trust: 10 } })
    expect(deriveWorkingRelationshipTrend(improving.relationshipsByKey[`${world.userCoachId}->${player.id}`])).toBe('IMPROVING')
  })

  it('a single small isolated event does not flip trend to WORSENING', () => {
    const world = baseWorld()
    const player = Object.values(world.players)[0]!
    const tiny = applyRelationshipEventToWorld(world, world.userCoachId, player.id, { id: 'e1', gameDate: world.currentDate, source: 'professionalInteraction', delta: -1, context: {} })
    expect(deriveWorkingRelationshipTrend(tiny.relationshipsByKey[`${world.userCoachId}->${player.id}`])).toBe('STABLE')
  })

  it('neutral/missing facets never generate false concerns', () => {
    const world = baseWorld()
    const player = Object.values(world.players)[0]!
    const withEvent = applyRelationshipEventToWorld(world, world.userCoachId, player.id, { id: 'e1', gameDate: world.currentDate, source: 'professionalInteraction', delta: 5, context: {}, dimensionDeltas: { trust: 40 } })
    const explanation = explainWorkingRelationship(withEvent, world.userCoachId, player.id)!
    expect(explanation.concerns).toEqual([])
  })

  it('strengths/concerns come from real facet values, not fabricated strings', () => {
    const world = baseWorld()
    const player = Object.values(world.players)[0]!
    const withEvent = applyRelationshipEventToWorld(world, world.userCoachId, player.id, { id: 'e1', gameDate: world.currentDate, source: 'professionalInteraction', delta: -10, context: {}, dimensionDeltas: { trust: -40, communicationQuality: -30 } })
    const explanation = explainWorkingRelationship(withEvent, world.userCoachId, player.id)!
    expect(explanation.concerns.length).toBeGreaterThan(0)
    expect(explanation.strengths).toEqual([])
  })

  it('recent interactions describe real events (with a known event kind label when tagged, generic fallback otherwise)', () => {
    const world = baseWorld()
    const player = Object.values(world.players)[0]!
    const withEvent = applyRelationshipEventToWorld(world, world.userCoachId, player.id, { id: 'e1', gameDate: world.currentDate, source: 'professionalInteraction', delta: 5, context: { eventKind: 'responsibilityGranted' }, dimensionDeltas: { trust: 5 } })
    const explanation = explainWorkingRelationship(withEvent, world.userCoachId, player.id)!
    expect(explanation.recentInteractions[0]).toContain('Responsibility')
  })

  it('directional: A->B explanation is independent from B->A', () => {
    const world = baseWorld()
    const player = Object.values(world.players)[0]!
    const withEvent = applyRelationshipEventToWorld(world, world.userCoachId, player.id, { id: 'e1', gameDate: world.currentDate, source: 'professionalInteraction', delta: 20, context: {}, dimensionDeltas: { trust: 40 } })
    expect(explainWorkingRelationship(withEvent, world.userCoachId, player.id)).toBeDefined()
    expect(explainWorkingRelationship(withEvent, player.id, world.userCoachId)).toBeUndefined()
  })
})

describe('deriveWorkingRelationshipState', () => {
  it('a profile with no events is PROFESSIONAL, not a plain alias of value', () => {
    expect(deriveWorkingRelationshipState({ sourceId: 'a', targetId: 'b', value: 0, events: [] })).toBe('PROFESSIONAL')
  })
  it('strongly negative trust/respect derives POOR', () => {
    expect(deriveWorkingRelationshipState({ sourceId: 'a', targetId: 'b', value: -50, events: [{ id: 'x', gameDate: '2032-01-01' as never, source: 'professionalInteraction', delta: -50, context: {} }], dimensions: { trust: -50, professionalRespect: -50, communicationQuality: 0, collaboration: 0, personalCloseness: 0, perceivedSupport: 0, reliability: 0, professionalAlignment: 0 } })).toBe('POOR')
  })
})
