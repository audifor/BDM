import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createGameDate } from '@/domain/date'
import { DEFAULT_FIBA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { defaultRecruitingRules } from '@/domain/recruiting'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { generateRecruitingPool } from '@/engine/recruiting'
import { RecruitingScreen } from './RecruitingScreen'

function fixture(controlled: boolean): GameWorld {
  const world = generateRecruitingPool(updateGameWorld(createGameWorld(createValidGameWorldInput()), { recruitingCycles: [{ id: 'cycle', ecosystemId: DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, sourceSeasonId: 'season-a' as never, targetSeasonId: 'season-a' as never, opensOn: createGameDate(2032, 10, 1), signingOn: createGameDate(2032, 10, 2), closesOn: createGameDate(2032, 10, 3), status: 'open', rules: { ...defaultRecruitingRules, poolSize: 2 } }] }), 'cycle')
  return controlled ? { ...world, ecosystems: { ...world.ecosystems, [DEFAULT_FIBA_LIKE_ECOSYSTEM_ID]: { ...world.ecosystems[DEFAULT_FIBA_LIKE_ECOSYSTEM_ID]!, kind: 'ncaaLike' } } } : world
}
const handlers = () => ({ onAddTarget: vi.fn(), onRemoveTarget: vi.fn(), onAction: vi.fn(() => null), onOffer: vi.fn(() => null) })

describe('RecruitingScreen', () => {
  it('renders recruits and the connected action controls for a controlled NCAA program', () => { const props = handlers(); const markup = renderToStaticMarkup(createElement(RecruitingScreen, { world: fixture(true), ...props })); expect(markup).toContain('RECRUITING CENTER'); expect(markup).toContain('TARGET'); expect(markup).toContain('CONTACT'); expect(markup).toContain('PITCH'); expect(markup).toContain('VISIT'); expect(markup).toContain('OFFER') })
  it('uses read-only presentation outside a controlled NCAA program', () => { const props = handlers(); const markup = renderToStaticMarkup(createElement(RecruitingScreen, { world: fixture(false), ...props })); expect(markup).toContain('Modo consulta'); expect(markup).not.toContain('>CONTACT<') })
})
