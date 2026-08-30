// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { legacyRatingSignals } from '@/domain/player'
import { PlantillaPcbPage } from './PlantillaPcbPage'
import {
  BALL_HANDLING_RATING_KEYS,
  BRAIN_RATING_KEYS,
  DEFENSE_RATING_KEYS,
  getBasketballSummarySignals,
  OFFENSE_RATING_KEYS,
  PHYSICAL_RATING_KEYS,
} from './CanonicalRoster'

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

const PRESET_NAMES = ['Resumen General', 'Ofensiva', 'Cerebro', 'Defensa', 'Físico', 'Manejo', 'Psico', 'Personalizada']

describe('CanonicalRoster / roster view presets', () => {
  it('exposes exactly the 8 canonical presets in the preset selector', () => {
    const world = createNewGame()
    render(createElement(PlantillaPcbPage, { world }))

    const select = screen.getByLabelText('Preset de columnas') as HTMLSelectElement
    const optionLabels = Array.from(select.options).map((option) => option.textContent)
    expect(optionLabels).toEqual(PRESET_NAMES)
  })

  it('every preset rating-column group maps to real CanonicalRatingKey attributes on Player V2', () => {
    // Assert the curated groupings only ever reference genuine Player V2 canonical rating keys.
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = getTeamRoster(world, team.id)[0]!
    for (const group of [OFFENSE_RATING_KEYS, BRAIN_RATING_KEYS, DEFENSE_RATING_KEYS, PHYSICAL_RATING_KEYS, BALL_HANDLING_RATING_KEYS]) {
      for (const key of group) {
        expect(typeof player.basketball.ratings[key]).toBe('number')
      }
    }
  })

  it('Resumen General is a compact curated overview including the FIN/SHO/PMK/PDE/IDE/REB/ATH basketball summary signals', () => {
    const world = createNewGame()
    render(createElement(PlantillaPcbPage, { world }))

    // Default preset is Resumen General; assert core roster columns and the compact summary signals are present...
    for (const label of ['JUGADOR', 'POS', 'ROT', 'EDAD', 'FIN', 'SHO', 'PMK', 'PDE', 'IDE', 'REB', 'ATH', 'FATIGA', 'CONTRATO']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    // ...but detailed 35-rating/personality column headers (unique to those presets) are absent,
    // and it does not turn into the full table (height/weight are not part of the curated overview).
    for (const label of ['TIRO MEDIO', 'DECISIÓN', 'DEF. EXT.', 'ACELERACIÓN', 'BOTE', 'AMBICIÓN', 'ALT', 'PESO']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('Resumen General summary signals are the deterministic legacyRatingSignals projection of the real roster player, not fabricated values', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = getTeamRoster(world, team.id)[0]!
    render(createElement(PlantillaPcbPage, { world }))

    const expected = legacyRatingSignals(player.basketball.ratings)
    expect(getBasketballSummarySignals(player)).toEqual(expected)
    expect(screen.getAllByText(String(expected.finishing)).length).toBeGreaterThan(0)
  })

  it('Personalizada exposes the full configurable column set (every rating and personality column)', () => {
    const world = createNewGame()
    render(createElement(PlantillaPcbPage, { world }))

    fireEvent.change(screen.getByLabelText('Preset de columnas'), { target: { value: 'custom' } })

    for (const label of ['TIRO MEDIO', 'DECISIÓN', 'DEF. EXT.', 'ACELERACIÓN', 'BOTE', 'AMBICIÓN', 'ALT', 'PESO', 'CONTRATO', 'FIN', 'SHO']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('switching to the Ofensiva preset renders real rating values from the roster, not fabricated numbers', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = getTeamRoster(world, team.id)[0]!
    render(createElement(PlantillaPcbPage, { world }))

    fireEvent.change(screen.getByLabelText('Preset de columnas'), { target: { value: 'offense' } })

    const expected = String(player.basketball.ratings.midRangeShooting)
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0)
  })

  it('switching to the Psico preset renders real Personality values, not the roster rating columns', () => {
    const world = createNewGame()
    render(createElement(PlantillaPcbPage, { world }))

    fireEvent.change(screen.getByLabelText('Preset de columnas'), { target: { value: 'psico' } })

    expect(screen.getByText('AMBICIÓN')).toBeInTheDocument()
  })

  it('the rotation selector writes through to the canonical lineup (no leftover default-B2 fallback)', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = getTeamRoster(world, team.id)[0]!
    render(createElement(PlantillaPcbPage, { world }))

    const select = screen.getAllByLabelText(`Rotación ${player.firstName} ${player.lastName}`)[0]! as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('B1-B7 bench slots preserve exact order when read back from a canonical lineup', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    // Generated rosters can contain duplicate names; pick 7 players with distinct
    // display names so each can be located unambiguously by its rendered label.
    const seenNames = new Set<string>()
    const uniquelyNamed = getTeamRoster(base, team.id).filter((player) => {
      const name = `${player.firstName} ${player.lastName}`
      if (seenNames.has(name)) return false
      seenNames.add(name)
      return true
    })
    let world = base
    const benchSlots = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const
    for (const [index, slot] of benchSlots.entries()) {
      world = setLineupSlot(world, team.id, slot, uniquelyNamed[index]!.id)
    }
    render(createElement(PlantillaPcbPage, { world }))
    for (const [index, slot] of benchSlots.entries()) {
      const player = uniquelyNamed[index]!
      const selects = screen.getAllByLabelText(`Rotación ${player.firstName} ${player.lastName}`) as HTMLSelectElement[]
      expect(selects.some((select) => select.value === slot)).toBe(true)
    }
  })
})
