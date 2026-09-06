import { describe, expect, it } from 'vitest'
import type { Team } from '@/domain/team'
import type { CountryId, TeamId } from '@/domain/ids'
import {
  FIBA_COURT_RULESET,
  NBA_COURT_RULESET,
  NCAA_MEN_COURT_RULESET,
  getCourtRuleset,
  rulesetToRegulation,
} from '../rules'
import {
  resolveArenaArchetype,
  resolveCourtConfiguration,
  resolveRulesetId,
} from './CourtConfigurationResolver'
import { createBasketSystem } from '../basket/BasketSystemProfile'
import { stanchionCourtX } from '../basket/BasketSystemRenderer'
import { resolveClubCourtIdentity, deriveCourtPalette } from '../branding/ClubCourtIdentityResolver'
import { createEventOverlay } from '../event/CourtEventOverlay'
import { createFloorProfile } from '../floor/CourtFloorProfile'
import { createArenaProfile } from '../arena/ArenaCourtProfile'

function team(id: string, name: string): Team {
  return {
    id: id as TeamId,
    name,
    gender: 'male',
    countryId: 'US' as CountryId,
    rosterPlayerIds: [],
  }
}

describe('CT-CANON rulesets', () => {
  it('defines coherent FIBA geometry in metres', () => {
    expect(FIBA_COURT_RULESET.length).toBe(28)
    expect(FIBA_COURT_RULESET.width).toBe(15)
    expect(FIBA_COURT_RULESET.threePointRadius).toBeCloseTo(6.75, 5)
    expect(FIBA_COURT_RULESET.hoopOffset).toBeGreaterThan(FIBA_COURT_RULESET.backboardOffset)
  })

  it('defines NBA geometry from feet without percentage hacks', () => {
    expect(NBA_COURT_RULESET.length).toBeCloseTo(28.6512, 3)
    expect(NBA_COURT_RULESET.width).toBeCloseTo(15.24, 3)
    expect(NBA_COURT_RULESET.threePointRadius).toBeGreaterThan(FIBA_COURT_RULESET.threePointRadius)
    expect(NBA_COURT_RULESET.keyWidth).toBeGreaterThan(NCAA_MEN_COURT_RULESET.keyWidth)
  })

  it('defines NCAA with narrower lane than NBA', () => {
    expect(NCAA_MEN_COURT_RULESET.keyWidth).toBeCloseTo(3.6576, 3)
    expect(NCAA_MEN_COURT_RULESET.threePointRadius).toBeLessThan(NBA_COURT_RULESET.threePointRadius)
  })

  it('maps ruleset → regulation for projection', () => {
    const reg = rulesetToRegulation(getCourtRuleset('NBA'))
    expect(reg.kind).toBe('nbaLike')
    expect(reg.length).toBe(NBA_COURT_RULESET.length)
  })
})

describe('CT-CANON configuration resolver', () => {
  it('resolves NBA ecosystem to NBA rules + premium arena', () => {
    expect(resolveRulesetId({ homeTeam: team('a', 'A'), ecosystemKind: 'nbaLike' })).toBe('NBA')
    expect(
      resolveArenaArchetype({ homeTeam: team('a', 'A'), ecosystemKind: 'nbaLike' }),
    ).toBe('NBA_PREMIUM')
  })

  it('resolves NCAA ecosystem to college rules + major arena', () => {
    expect(resolveRulesetId({ homeTeam: team('a', 'A'), ecosystemKind: 'ncaaLike' })).toBe('NCAA_M')
    expect(
      resolveArenaArchetype({ homeTeam: team('a', 'A'), ecosystemKind: 'ncaaLike' }),
    ).toBe('NCAA_MAJOR')
  })

  it('resolves FIBA default to euro standard/premium', () => {
    expect(resolveRulesetId({ homeTeam: team('a', 'A'), ecosystemKind: 'fibaLike' })).toBe('FIBA')
  })

  it('builds full configuration with club identity and no BDM', () => {
    const cfg = resolveCourtConfiguration({
      homeTeam: team('boston-celtics', 'Boston Celtics'),
      awayTeam: team('miami-heat', 'Miami Heat'),
      arenaArchetype: 'NBA_PREMIUM',
      rulesetId: 'NBA',
    })
    expect(cfg.ruleset.id).toBe('NBA')
    expect(cfg.arena.archetype).toBe('NBA_PREMIUM')
    expect(cfg.basketSystem.type).toBe('PRO_STANCHION')
    expect(cfg.branding.centerMonogram?.toUpperCase()).not.toBe('BDM')
    expect(cfg.branding.baselineHome.toUpperCase()).not.toContain('HOME CLUB')
    expect(cfg.branding.scorerLabel.toUpperCase()).not.toBe('BDM')
    expect(cfg.floor.material).toBe('MAPLE_NATURAL')
  })

  it('accepts season/installation hooks without requiring persistence', () => {
    const cfg = resolveCourtConfiguration({
      homeTeam: team('x', 'X Club'),
      seasonId: '2025-26',
      arenaInstallationId: 'arena-1',
      arenaArchetype: 'EURO_PREMIUM',
    })
    expect(cfg.seasonId).toBe('2025-26')
    expect(cfg.arenaInstallationId).toBe('arena-1')
  })

  it('attaches event overlay without mutating club branding permanently', () => {
    const overlay = createEventOverlay('PLAYOFFS')
    const cfg = resolveCourtConfiguration({
      homeTeam: team('x', 'X Club'),
      eventOverlay: overlay,
      arenaArchetype: 'EURO_PREMIUM',
    })
    expect(cfg.eventOverlay?.kind).toBe('PLAYOFFS')
    expect(cfg.branding.centerMonogram).toBeTruthy()
  })
})

describe('CT-CANON basket placement', () => {
  it('places stanchion outside the playable baseline', () => {
    const basket = createBasketSystem('PRO_STANCHION', '#123456', 'BC')
    const left = stanchionCourtX('left', NBA_COURT_RULESET.length, basket.supportDepthM)
    const right = stanchionCourtX('right', NBA_COURT_RULESET.length, basket.supportDepthM)
    expect(left).toBeLessThan(0)
    expect(right).toBeGreaterThan(NBA_COURT_RULESET.length)
    expect(basket.supportDepthM).toBeGreaterThan(1)
  })

  it('uses smaller support depth for small gym vs pro', () => {
    const pro = createBasketSystem('PRO_STANCHION', '#000')
    const gym = createBasketSystem('SMALL_GYM', '#000')
    expect(pro.supportDepthM).toBeGreaterThan(gym.supportDepthM)
    expect(pro.visualMass).toBeGreaterThan(gym.visualMass)
  })
})

describe('CT-CANON floor / arena / club', () => {
  it('resolves distinct floor profiles by archetype', () => {
    const nba = resolveCourtConfiguration({
      homeTeam: team('a', 'A'),
      arenaArchetype: 'NBA_PREMIUM',
      rulesetId: 'NBA',
    })
    const gym = resolveCourtConfiguration({
      homeTeam: team('a', 'A'),
      arenaArchetype: 'NCAA_SMALL_GYM',
      rulesetId: 'NCAA_M',
    })
    const euro = resolveCourtConfiguration({
      homeTeam: team('a', 'A'),
      arenaArchetype: 'EURO_PREMIUM',
      rulesetId: 'FIBA',
    })
    expect(nba.floor.pattern).not.toBe(gym.floor.pattern)
    expect(euro.floor.material).toBe('MAPLE_GOLD')
    expect(gym.floor.pattern).toBe('LONGITUDINAL')
  })

  it('derives presentation palette without mutating brand', () => {
    const palette = deriveCourtPalette('#cc0000', '#ffcc00')
    expect(palette.brand).toBe('#cc0000')
    expect(palette.paint).not.toBe('#cc0000')
    expect(palette.accent).toBe('#ffcc00')
  })

  it('club branding never falls back to BDM', () => {
    const branding = resolveClubCourtIdentity(team('zaragoza', 'Casademont Zaragoza'))
    expect(branding.centerMonogram?.toUpperCase()).not.toBe('BDM')
    expect(branding.scorerLabel.toUpperCase()).not.toBe('BDM')
    expect(branding.baselineHome).toMatch(/CASADEMONT|ZARAGOZA/i)
  })

  it('arena archetypes differ in runoff and basket defaults', () => {
    const nba = createArenaProfile('NBA_PREMIUM', { apron: '#111', seat: '#000', led: '#0ff' })
    const small = createArenaProfile('NCAA_SMALL_GYM', { apron: '#111', seat: '#000', led: '#0ff' })
    expect(nba.runoffScale).toBeGreaterThan(small.runoffScale)
    expect(nba.courtWidthFill).toBeLessThan(small.courtWidthFill)
    expect(nba.defaultBasketType).toBe('PRO_STANCHION')
    expect(small.defaultBasketType).toBe('SMALL_GYM')
    expect(nba.courtsideSeats).toBe(true)
    expect(small.bleachersClose).toBe(true)
  })

  it('floor factory supports materials and patterns', () => {
    const floor = createFloorProfile('MAPLE_GOLD', 'HERRINGBONE', {
      stainZones: [{ kind: 'CENTER_CIRCLE', toneDelta: -0.1, opacity: 0.3 }],
    })
    expect(floor.material).toBe('MAPLE_GOLD')
    expect(floor.pattern).toBe('HERRINGBONE')
    expect(floor.stainZones).toHaveLength(1)
  })
})
