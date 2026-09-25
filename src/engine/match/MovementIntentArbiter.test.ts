import { describe, expect, it } from 'vitest'

import { playerIdFromString } from '@/domain/ids'

import { arbitrateMovementIntentSet, movementIntentMetrics, type ActiveMovementIntent, type MovementIntentProposal } from './MovementIntentArbiter'

const player = playerIdFromString('movement-player')
const targetA = { x: 2, y: 3 }
const targetB = { x: 8, y: 4 }
const proposal = (source: MovementIntentProposal['source'], target = targetA, priority = 10, key = `${source}:${player}`): MovementIntentProposal => ({ key, playerId: player, source, target, priority })
const resolve = (proposals: readonly MovementIntentProposal[], current?: ActiveMovementIntent, step = 1) => arbitrateMovementIntentSet({ proposals, currentByPlayerId: current === undefined ? {} : { [player]: current }, step })[player]!

describe('movement intent arbitration', () => {
  it('keeps one primary authority and rejects fallback spacing while a cut remains valid', () => {
    const current = { ...proposal('cut', targetA, 40), startedAtStep: 2 }
    const result = resolve([proposal('baseSpacing', targetB), proposal('cut', targetA, 40)], current, 3)
    expect(result.active).toMatchObject({ source: 'cut', target: targetA, startedAtStep: 2 })
    expect(result.rejected).toContainEqual({ proposal: expect.objectContaining({ source: 'baseSpacing' }), reason: 'lowerPriority' })
  })

  it.each(['drive', 'screen'] as const)('keeps an active %s responsibility through fallback proposals', (source) => {
    const current = { ...proposal(source, targetA, 60), startedAtStep: 2 }
    const result = resolve([proposal('baseSpacing', targetB), proposal(source, targetB, 60)], current, 3)
    expect(result.active).toMatchObject({ source, target: targetB, startedAtStep: 2 })
    expect(result.why).toBe('currentIntentRemainsValid')
  })

  it('updates a target without starting a new intent or changing authority', () => {
    const current = { ...proposal('onBallContainment', targetA, 50, 'contain:defender:handler'), startedAtStep: 4 }
    const result = resolve([proposal('onBallContainment', targetB, 50, current.key), proposal('baseSpacing', targetA)], current, 5)
    expect(result.active).toMatchObject({ key: current.key, source: 'onBallContainment', target: targetB, startedAtStep: 4 })
    expect(result.lifecycle).toBe('ACTIVE')
  })

  it('allows a stronger semantic responsibility to interrupt the current intent', () => {
    const current = { ...proposal('onBallContainment', targetA, 50), startedAtStep: 1 }
    const result = resolve([proposal('screenCoverage', targetB, 90)], current, 2)
    expect(result.active).toMatchObject({ source: 'screenCoverage', target: targetB, startedAtStep: 2 })
    expect(result.lifecycle).toBe('INTERRUPTED')
  })

  it('lets screen coverage take precedence over generic on-ball containment', () => {
    const current = { ...proposal('onBallContainment', targetA, 50), startedAtStep: 1 }
    const result = resolve([proposal('onBallContainment', targetA, 50), proposal('screenCoverage', targetB, 90)], current, 2)
    expect(result.active).toMatchObject({ source: 'screenCoverage', target: targetB })
    expect(result.why).toBe('higherPriorityIntent')
  })

  it('drops an old ball-owner responsibility and starts the new effective containment intent', () => {
    const current = { ...proposal('onBallContainment', targetA, 50, 'onBallContainment:defender:old-handler'), startedAtStep: 1 }
    const result = resolve([proposal('onBallContainment', targetB, 50, 'onBallContainment:defender:new-handler'), proposal('baseSpacing', targetA)], current, 2)
    expect(result.active).toMatchObject({ key: 'onBallContainment:defender:new-handler', target: targetB, startedAtStep: 2 })
    expect(result.lifecycle).toBe('INTERRUPTED')
  })

  it('clears possession-bound intent when the possession context resets', () => {
    const current = { ...proposal('cut', targetA, 40), startedAtStep: 1 }
    const result = resolve([proposal('baseSpacing', targetB)], undefined, 2)
    expect(current.source).toBe('cut')
    expect(result.active).toMatchObject({ source: 'baseSpacing', target: targetB, startedAtStep: 2 })
    expect(result.lifecycle).toBe('START')
  })

  it('returns the same decision regardless of proposal insertion order', () => {
    const current = { ...proposal('screen', targetA, 60), startedAtStep: 1 }
    const candidates = [proposal('baseSpacing', targetB), proposal('screenCoverage', targetB, 90), proposal('screen', targetA, 60)]
    expect(resolve(candidates, current, 2)).toEqual(resolve([...candidates].reverse(), current, 2))
  })

  it('records switches, A-B-A oscillations, and diagnostic target jumps without affecting gameplay', () => {
    const a = { ...proposal('baseSpacing', targetA), startedAtStep: 1 }
    const b = { ...proposal('cut', targetB, 40), startedAtStep: 2 }
    const metrics = movementIntentMetrics([[a], [b], [a]], 5)
    expect(metrics.intentSwitchesByPlayerId[player]).toBe(2)
    expect(metrics.authoritySwitchesByPlayerId[player]).toBe(2)
    expect(metrics.abaOscillationsByPlayerId[player]).toBe(1)
    expect(metrics.largeTargetJumpsByPlayerId[player]).toBe(2)
  })
})
