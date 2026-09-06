import { describe, expect, it } from 'vitest'
import type { Team } from '@/domain/team'
import type { CountryId, TeamId } from '@/domain/ids'
import { resolveCourtConfiguration } from '../core/CourtConfigurationResolver'
import { createCourtProjection } from '../CourtProjection'
import { rulesetToRegulation } from '../rules/CourtRuleset'
import { buildArenaPerimeterLayout } from './ArenaPerimeterLayout'
import { createArenaProfile } from './ArenaCourtProfile'

function team(id: string, name: string): Team {
  return {
    id: id as TeamId,
    name,
    gender: 'male',
    countryId: 'US' as CountryId,
    rosterPlayerIds: [],
  }
}

function layoutFor(archetype: 'NBA_PREMIUM' | 'NCAA_MAJOR' | 'EURO_PREMIUM' | 'NCAA_SMALL_GYM') {
  const cfg = resolveCourtConfiguration({
    homeTeam: team('arena-test', 'Arena Test'),
    arenaArchetype: archetype,
    rulesetId: archetype === 'NBA_PREMIUM' ? 'NBA' : archetype === 'NCAA_MAJOR' ? 'NCAA_M' : archetype === 'NCAA_SMALL_GYM' ? 'HIGH_SCHOOL' : 'FIBA',
  })
  const regulation = rulesetToRegulation(cfg.ruleset)
  const projection = createCourtProjection(1920, 1080, regulation, {
    courtWidthFill: cfg.arena.courtWidthFill,
    courtHeightFill: cfg.arena.courtHeightFill,
  })
  return { layout: buildArenaPerimeterLayout(projection, cfg.arena), cfg, projection }
}

describe('CT-ARENA ArenaPerimeterLayout', () => {
  it('derives zones from projected court — not canvas percentages alone', () => {
    const { layout, projection } = layoutFor('NBA_PREMIUM')
    expect(layout.courtCorners).toHaveLength(4)
    expect(layout.runoffOuter).toHaveLength(4)
    // runoff expands beyond court
    const courtLeft = Math.min(...layout.courtCorners.map((p) => p.x))
    const runoffLeft = Math.min(...layout.runoffOuter.map((p) => p.x))
    expect(runoffLeft).toBeLessThan(courtLeft)
    // scorer sits near near-sideline (below court in screen Y)
    const courtBottom = Math.max(...layout.courtCorners.map((p) => p.y))
    expect(layout.scorerTableZone.y).toBeGreaterThan(courtBottom - 5)
    expect(layout.homeBenchZone.width).toBeGreaterThan(0)
    expect(layout.basketSupportZoneLeft.x).toBeLessThan(courtLeft)
    void projection
  })

  it('NBA runoff is deeper than small gym', () => {
    const nba = layoutFor('NBA_PREMIUM').layout
    const gym = layoutFor('NCAA_SMALL_GYM').layout
    expect(nba.runoffDepthPx.near).toBeGreaterThan(gym.runoffDepthPx.near)
    expect(nba.runoffDepthPx.baseline).toBeGreaterThan(gym.runoffDepthPx.baseline)
    expect(nba.scorerTableZone.width).toBeGreaterThan(gym.scorerTableZone.width)
  })

  it('places scorer asymmetrically (not perfectly centered)', () => {
    const { layout, projection } = layoutFor('EURO_PREMIUM')
    const mid = projection.viewport.canvasWidth / 2
    const scorerMid = layout.scorerTableZone.x + layout.scorerTableZone.width / 2
    expect(Math.abs(scorerMid - mid)).toBeGreaterThan(8)
  })

  it('NBA has tunnels; small gym does not', () => {
    expect(layoutFor('NBA_PREMIUM').layout.tunnelHints.length).toBeGreaterThan(0)
    expect(layoutFor('NCAA_SMALL_GYM').layout.tunnelHints.length).toBe(0)
  })

  it('edge-to-edge: NBA court occupies ~88–94% of live-stage width at 1920', () => {
    const { layout, projection } = layoutFor('NBA_PREMIUM')
    const courtLeft = Math.min(...layout.courtCorners.map((p) => p.x))
    const courtRight = Math.max(...layout.courtCorners.map((p) => p.x))
    const fill = (courtRight - courtLeft) / projection.viewport.canvasWidth
    expect(fill).toBeGreaterThanOrEqual(0.88)
    expect(fill).toBeLessThanOrEqual(0.94)
    // Immediate runoff — not a giant framing slab
    expect(layout.runoffDepthPx.baseline).toBeLessThan(120)
    expect(layout.runoffDepthPx.near).toBeLessThan(100)
    // Basket pad must not dominate leftover width
    const sideGap = courtLeft
    expect(layout.basketSupportZoneLeft.width).toBeLessThanOrEqual(sideGap * 1.35 + 8)
  })

  it('arena archetypes expose distinct fills for composition', () => {
    const nba = createArenaProfile('NBA_PREMIUM', { apron: '#111', seat: '#000', led: '#0ff' })
    const gym = createArenaProfile('NCAA_SMALL_GYM', { apron: '#111', seat: '#000', led: '#0ff' })
    expect(nba.courtWidthFill).toBeLessThan(gym.courtWidthFill)
    expect(nba.courtWidthFill).toBeGreaterThanOrEqual(0.88)
    expect(nba.courtsideSeats).toBe(true)
    expect(gym.bleachersClose).toBe(true)
  })
})
