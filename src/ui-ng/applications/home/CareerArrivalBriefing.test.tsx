// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { applyUserCoachCreation } from '@/app/game/UserCoachCreator'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { useGameStore } from '@/stores/gameStore'
import { CareerArrivalBriefing } from './CareerArrivalBriefing'
import { buildCareerArrivalModel } from './careerArrivalModel'

const coach = {
  firstName: 'Elena', lastName: 'Arrival', dateOfBirth: '1990-01-01', gender: 'female', nationalityCountryCode: 'ESP',
  background: 'rookie', ambition: 'firstTitle', coachingStyle: 'balanced', disposition: 'balanced', biography: 'F1 arrival test coach.',
} as const

afterEach(cleanup)
beforeEach(() => useGameStore.getState().resetGame())

describe('CAREER-F1 arrival briefing', () => {
  it('reads the real club, Board, staff and first match from the career world', () => {
    const world = applyUserCoachCreation(createAcbTestGame({ userTeamKey: 'ucm' }), coach)
    const model = buildCareerArrivalModel(world)

    expect(model).not.toBeNull()
    expect(model).toMatchObject({ coachName: 'Elena Arrival', clubName: 'UCAM Murcia', post: 'Head coach', competitionName: 'Liga Endesa 2026/27 [TEST]' })
    expect(model!.pendingMeeting?.teamId).toBe('acb-team-ucm')
    expect(model!.responsibilities.every((item) => item.kind && item.mode)).toBe(true)
    expect(model!.objectives.length).toBeGreaterThan(0)
    expect(model!.nextFixture).not.toBeNull()
  })

  it('executes the first professional decision through the canonical CoachLife command and does not repeat after Save V4', () => {
    const world = applyUserCoachCreation(createAcbTestGame({ userTeamKey: 'ucm' }), coach)
    useGameStore.getState().replaceWorld(world)
    const model = buildCareerArrivalModel(world)!
    const view = render(<CareerArrivalBriefing model={model} />)

    expect(screen.getByRole('heading', { name: /you are now head coach/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ask for input' }))

    const after = useGameStore.getState().world!
    expect(buildCareerArrivalModel(after)!.pendingMeeting).toBeNull()
    expect(Object.values(after.memoriesById).some((memory) => memory.semanticKey.startsWith('life:first-staff-meeting:'))).toBe(true)
    view.rerender(<CareerArrivalBriefing model={buildCareerArrivalModel(after)!} />)
    expect(screen.queryByRole('region', { name: 'Career arrival briefing' })).not.toBeInTheDocument()

    const restored = deserializeGameWorldV4(serializeGameWorldV4(after, '2026-11-01T10:00:00.000Z'))
    expect(buildCareerArrivalModel(restored)!.pendingMeeting).toBeNull()
  })
})
