// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { createInitialCoachRpgProfile } from '@/domain/coachRpg'
import type { CoachRpgOperationResult } from '@/engine/coach'
import { CoachDevelopmentWorkspace } from '@/ui-ng/applications/coach/CoachDevelopmentWorkspace'

afterEach(cleanup)

function renderBoard(reason: string) {
  const world = createNewGame()
  const fail = (): CoachRpgOperationResult => ({ ok: false, reason, world })
  return render(
    <CoachDevelopmentWorkspace onDevelopSkill={fail} onPurchasePerk={fail} rpg={createInitialCoachRpgProfile()} />,
  )
}

describe('CoachDevelopmentWorkspace', () => {
  it('renders the skills workstation and the perks column from canonical data', () => {
    renderBoard('insufficientDevelopmentPoints')

    expect(screen.getByRole('heading', { name: 'Skills' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Perks' })).toBeInTheDocument()
    expect(screen.getByText('Game Preparation')).toBeInTheDocument()
    expect(screen.getByText('Film Room Specialist')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Develop' })).toHaveLength(10)
    expect(screen.getAllByRole('button', { name: 'Purchase' })).toHaveLength(8)
    expect(screen.getByText(/avg rank 0/)).toBeInTheDocument()
    expect(screen.getByText('0 / 8 unlocked')).toBeInTheDocument()
    expect(screen.getByText('Total ranks')).toBeInTheDocument()
    expect(screen.getByText('0 / 30')).toBeInTheDocument()
    expect(screen.getByText('Career focus')).toBeInTheDocument()
    expect(screen.getByText('0 / 2')).toBeInTheDocument()
  })

  it('surfaces the canonical engine reason instead of swallowing it', () => {
    renderBoard('insufficientDevelopmentPoints')

    fireEvent.click(screen.getAllByRole('button', { name: 'Develop' })[0]!)
    expect(screen.getByRole('status')).toHaveTextContent('Not enough development points.')
  })

  it('reports perk failures with the perk-specific reason', () => {
    renderBoard('skillRequirementNotMet')

    fireEvent.click(screen.getAllByRole('button', { name: 'Purchase' })[0]!)
    expect(screen.getByRole('status')).toHaveTextContent('A prerequisite skill rank is not met.')
  })
})
