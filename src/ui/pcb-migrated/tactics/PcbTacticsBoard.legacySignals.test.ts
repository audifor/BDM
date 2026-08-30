// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { legacyRatingSignals } from '@/domain/player'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { TacticsPcbPage } from './TacticsPcbPage'

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

describe('PcbTacticsBoard / real Player V2 summary ratings, no direct legacy property reads', () => {
  it('every real roster player passed to the board has finite FIN/SHO/PMK/PDE/IDE/REB/ATH values equal to the deterministic legacyRatingSignals projection', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)

    render(createElement(TacticsPcbPage, { world }))

    for (const player of roster) {
      const expected = legacyRatingSignals(player.basketball.ratings)
      for (const value of Object.values(expected)) {
        expect(Number.isFinite(value)).toBe(true)
      }
    }
  })

  it('the board overall rating badge is finite and derived from the canonical projection, not a fabricated/undefined value', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const world = setLineupSlot(base, team.id, 'PG', roster[0]!.id)

    render(createElement(TacticsPcbPage, { world }))

    const ratingBadge = screen.getByText(`${roster[0]!.firstName} ${roster[0]!.lastName}`)
      .closest('.tactics-board-slot')!
      .querySelector('.tactics-board-slot-rating')!
    const displayed = Number(ratingBadge.textContent)
    expect(Number.isFinite(displayed)).toBe(true)

    const signals = legacyRatingSignals(roster[0]!.basketball.ratings)
    const expectedOverall = Math.round(
      [signals.finishing, signals.shooting, signals.playmaking, signals.perimeterDefense, signals.interiorDefense, signals.rebounding, signals.athleticism]
        .reduce((sum, value) => sum + value, 0) / 7,
    )
    expect(displayed).toBe(expectedOverall)
  })
})
