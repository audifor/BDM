import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { resolveGameClockRules } from '@/domain/world'

describe('generated competitions play their own ecosystem game format (ME-LOCK1)', () => {
  it('gives NBA-like, NCAA-like and FIBA-like leagues their formats, by gender', () => {
    const world = createNewGame()
    const formats = Object.values(world.competitions).map((competition) => {
      const rules = resolveGameClockRules(world, competition.id)
      return { kind: world.ecosystems[competition.ecosystemId]!.kind, gender: competition.gender, periods: `${rules.periodCount}x${rules.periodSeconds / 60}`, shotClock: rules.shotClockSeconds, foulLimit: competition.rules.gameFormat.foulRules?.personalFoulLimit }
    })
    const of = (kind: string, gender: string) => formats.filter((item) => item.kind === kind && item.gender === gender)
    expect(of('nbaLike', 'male').every((item) => item.periods === '4x12' && item.foulLimit === 6)).toBe(true)
    expect(of('nbaLike', 'female').every((item) => item.periods === '4x10' && item.shotClock === 24)).toBe(true)
    expect(of('ncaaLike', 'male').every((item) => item.periods === '2x20' && item.shotClock === 30)).toBe(true)
    expect(of('ncaaLike', 'female').every((item) => item.periods === '4x10' && item.shotClock === 30)).toBe(true)
    expect(of('fibaLike', 'male').every((item) => item.periods === '4x10' && item.shotClock === 24 && item.foulLimit === 5)).toBe(true)
    for (const kind of ['nbaLike', 'ncaaLike', 'fibaLike']) for (const gender of ['male', 'female']) expect(of(kind, gender).length).toBeGreaterThan(0)
  })
})
