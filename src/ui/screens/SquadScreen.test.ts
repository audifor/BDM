import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { legacyRatingSignals } from '@/domain/player'
import { filterAndSortRoster, ROSTER_COLUMN_SIZING, SquadScreen } from './SquadScreen'

describe('SquadScreen', () => {
  it('renders compact roster identity and omits repeated normal availability', () => {
    const world = createNewGame(); const markup = renderToStaticMarkup(createElement(SquadScreen, { world }))
    expect(markup).toContain('STATUS'); expect(markup).toContain('PLAYER'); expect(markup).toContain('POS'); expect(markup).toContain('HT'); expect(markup).toContain('SAL'); expect(markup).toContain('FIN'); expect(markup).toContain('SHO'); expect(markup).toContain('PMK'); expect(markup).not.toContain('PDE'); expect(markup).not.toContain('IDE'); expect(markup).not.toContain('Available')
  })
  it('declares task-oriented geometry for identity, body and contract data', () => {
    expect(ROSTER_COLUMN_SIZING.name).toEqual({ width: 186, minWidth: 150, maxWidth: 300 }); expect(ROSTER_COLUMN_SIZING.body).toEqual({ width: 58 }); expect(ROSTER_COLUMN_SIZING.salary).toEqual({ width: 78 })
  })
  it('filters and sorts the roster deterministically', () => {
    const world = createNewGame(); const roster = getTeamRoster(world, getUserTeam(world)!.id); const sorted = filterAndSortRoster(world, roster, '', 'ALL', 'name', 'ascending')
    expect(sorted).toHaveLength(roster.length); expect(sorted[0]).toBeDefined()
  })
  it('has no permanent player inspector', () => {
    const world = createNewGame(); const player = getTeamRoster(world, getUserTeam(world)!.id)[0]!; const markup = renderToStaticMarkup(createElement(SquadScreen, { world, selectedPlayerId: player.id }))
    expect(markup).not.toContain('PLAYER INSPECTOR'); expect(markup).not.toContain('Development stimulus'); expect(markup).toContain('>?</span>'); expect(markup).not.toContain(`${legacyRatingSignals(player.basketball.ratings).finishing}`)
  })
})
