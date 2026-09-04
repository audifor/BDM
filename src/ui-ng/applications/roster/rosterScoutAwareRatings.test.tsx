// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { organizationIdForTeam } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { exportGridCsv } from '@/ui/dataGrid/export'
import { CanonicalRoster } from '@/ui/pcb-migrated/plantilla/CanonicalRoster'
import {
  buildRosterRatingEvaluationLookup,
  organizationDimensionForCanonicalRating,
} from '@/ui-ng/applications/roster/rosterRatingPresentation'
import { scoutAwareRatingColumn } from '@/ui-ng/applications/roster/rosterScoutAwareColumns'

afterEach(cleanup)

describe('CanonicalRoster NG scout-aware ratings', () => {
  it('renders ? instead of raw ratings when organization knowledge is absent', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = getTeamRoster(world, team.id)[0]!
    const raw = String(player.basketball.ratings.midRangeShooting)

    render(
      createElement(CanonicalRoster, {
        team,
        variant: 'ng',
        world,
      }),
    )

    fireEvent.change(screen.getByLabelText('Preset de columnas'), { target: { value: 'offense' } })

    expect(screen.getAllByText('?').length).toBeGreaterThan(0)
    expect(screen.queryByText(raw)).not.toBeInTheDocument()
  })

  it('does not leak hidden exact ratings into title or aria attributes', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = getTeamRoster(world, team.id)[0]!
    const raw = String(player.basketball.ratings.midRangeShooting)

    const { container } = render(
      createElement(CanonicalRoster, {
        team,
        variant: 'ng',
        world,
      }),
    )

    fireEvent.change(screen.getByLabelText('Preset de columnas'), { target: { value: 'offense' } })

    expect(container.innerHTML).not.toContain(`title="${raw}"`)
    expect(container.innerHTML).not.toContain(`aria-label="${raw}"`)
    expect(container.textContent).not.toContain(raw)
  })

  it('renders exact evaluated values when organization knowledge permits EXACT mode', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const player = getTeamRoster(base, team.id)[0]!
    const world = updateGameWorld(base, {
      organizationKnowledge: [
        {
          organizationId: organizationIdForTeam(team.id),
          subjectPlayerId: player.id,
          dimensions: {
            shooting: {
              coverage: 1,
              confidence: 1,
              assessedAt: base.currentDate,
              provenance: 'scoutReport',
              estimate: 88,
              uncertainty: 1,
            },
          },
        },
      ],
    })

    render(
      createElement(CanonicalRoster, {
        team,
        variant: 'ng',
        world,
      }),
    )

    fireEvent.change(screen.getByLabelText('Preset de columnas'), { target: { value: 'offense' } })

    expect(screen.getAllByText('88').length).toBeGreaterThan(0)
  })

  it('CSV export for custom preset uses scout-aware export values', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const players = getTeamRoster(world, team.id).slice(0, 2)
    const lookup = buildRosterRatingEvaluationLookup(world, team.id)
    const column = scoutAwareRatingColumn(lookup, 'midRangeShooting', 'TIRO MEDIO')
    const csv = exportGridCsv([column], players)

    expect(csv.split('\n').slice(1).every((line) => line.includes('"?"'))).toBe(true)
    for (const player of players) {
      expect(csv).not.toContain(String(player.basketball.ratings.midRangeShooting))
    }
    expect(organizationDimensionForCanonicalRating('midRangeShooting')).toBe('shooting')
  })
})
