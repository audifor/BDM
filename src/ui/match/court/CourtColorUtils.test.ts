import { describe, expect, it } from 'vitest'
import {
  adjustHsl,
  buildStaticCacheKey,
  normalizeArenaColor,
  normalizeCourtColor,
  parseCssColor,
  varyWoodTone,
} from './CourtColorUtils'
import { resolveCourtConfiguration } from './core/CourtConfigurationResolver'
import { CourtRenderer } from './CourtRenderer'
import type { Team } from '@/domain/team'
import type { CountryId, TeamId } from '@/domain/ids'

function team(id: string, name: string): Team {
  return {
    id: id as TeamId,
    name,
    gender: 'male',
    countryId: 'ES' as CountryId,
    rosterPlayerIds: [],
  }
}

describe('CourtColorUtils', () => {
  it('parses hsl brand colors from deriveTeamColors', () => {
    const rgb = parseCssColor('hsl(210 48% 34%)')
    expect(rgb).not.toBeNull()
    expect(rgb!.r).toBeGreaterThan(0)
  })

  it('normalizes vivid brand red into dark court paint', () => {
    const court = normalizeCourtColor('#ff0000')
    const arena = normalizeArenaColor('#ff0000')
    expect(court).not.toBe('#ff0000')
    expect(arena).not.toBe('#ff0000')
    const courtRgb = parseCssColor(court)!
    const arenaRgb = parseCssColor(arena)!
    const courtL = courtRgb.r + courtRgb.g + courtRgb.b
    const arenaL = arenaRgb.r + arenaRgb.g + arenaRgb.b
    expect(arenaL).toBeLessThan(courtL)
  })

  it('varies wood tones slightly around maple base', () => {
    const a = varyWoodTone('#c9a56c', 0.2)
    const b = varyWoodTone('#c9a56c', 0.8)
    expect(a).not.toBe(b)
    expect(adjustHsl('#c9a56c', { l: 0.03 })).not.toBe('#c9a56c')
  })

  it('builds stable static cache keys', () => {
    expect(buildStaticCacheKey(['a', 'b'])).toBe('a|b')
  })
})

describe('CourtRenderer cache', () => {
  it('includes configuration identity in cache key', () => {
    const renderer = new CourtRenderer()
    const fakeTarget = { width: 200, height: 100 } as HTMLCanvasElement
    const a = resolveCourtConfiguration({
      homeTeam: team('club-a', 'Club A'),
      arenaArchetype: 'EURO_PREMIUM',
      rulesetId: 'FIBA',
    })
    const b = resolveCourtConfiguration({
      homeTeam: team('club-b', 'Club B'),
      arenaArchetype: 'NBA_PREMIUM',
      rulesetId: 'NBA',
    })
    const keyA = renderer.getStaticCacheKeyForTest(fakeTarget, a)
    const keyB = renderer.getStaticCacheKeyForTest(fakeTarget, b)
    expect(keyA).not.toBe(keyB)
    expect(keyA).toContain('ct-arena-v3-edge')
  })
})
