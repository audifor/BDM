// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { applyUserCoachCreation } from '@/app/game/UserCoachCreator'
import { getUserHumanSituations } from '@/app/hrpg/HumanSimulationService'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { useGameStore } from '@/stores/gameStore'
import { DirectorHubPanel } from './DirectorHubPanel'

const coach = {
  firstName: 'Elena', lastName: 'Hub', dateOfBirth: '1990-01-01', gender: 'female', nationalityCountryCode: 'ESP',
  background: 'rookie', ambition: 'firstTitle', coachingStyle: 'balanced', disposition: 'balanced', biography: 'F3 Hub test coach.',
} as const

afterEach(cleanup)
beforeEach(() => useGameStore.getState().resetGame())

describe('CAREER-F3 human experience in Director Hub', () => {
  it('executes a real HRPG choice through the store and preserves it in Save V4', () => {
    const starting = applyUserCoachCreation(createAcbTestGame({ userTeamKey: 'ucm' }), coach)
    useGameStore.getState().replaceWorld(starting)
    const situation = getUserHumanSituations(starting).find((item) => item.status === 'open' && item.choices.length > 0)
    expect(situation).toBeDefined()

    render(<DirectorHubPanel />)
    fireEvent.click(screen.getByRole('button', { name: situation!.choices[0]!.label }))

    const after = useGameStore.getState().world!
    expect(after.humanSimulation.situationsById[situation!.id]?.status).toBe('resolved')
    expect(screen.getByRole('status')).toHaveTextContent('Decisión profesional aplicada')

    const restored = deserializeGameWorldV4(serializeGameWorldV4(after, '2026-11-01T10:00:00.000Z'))
    expect(restored.humanSimulation.situationsById[situation!.id]?.resolution?.actionId).toBe(situation!.choices[0]!.id)
  })
})
