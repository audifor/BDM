// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { useGameStore } from '@/stores/gameStore'
import { TalentOperationsWorkspace } from './TalentOperationsWorkspace'

afterEach(cleanup)

describe('TalentOperationsWorkspace', () => {
  it('shows actionable pathway queues and navigates into the existing Scouting workspace', () => {
    const world = createNewGame()
    useGameStore.getState().replaceWorld(world)
    window.history.replaceState({}, '', '/?ui=ng&app=talent')

    render(<TalentOperationsWorkspace />)
    expect(screen.getByRole('heading', { name: 'Priority actions' })).toBeInTheDocument()
    expect(screen.getByText('No active or queued Scouting assignments.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Scouting' }))

    expect(new URL(window.location.href).searchParams.get('app')).toBe('scouting')
  })
})
