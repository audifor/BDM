// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { createNcaaSimulatedGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import { RecruitingWorkspace } from '@/ui-ng/applications/recruiting/RecruitingWorkspace'
import { WorkspaceHost } from '@/ui-ng/workspace/WorkspaceHost'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=recruiting')
  useGameStore.getState().resetGame()
})

describe('RecruitingWorkspace', () => {
  it('does not invent a college board for a non-NCAA career', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    render(
      <NgWorkspaceNavigationProvider>
        <RecruitingWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByText(UNAVAILABLE_SECTION_MESSAGE)).toBeInTheDocument()
  })

  it('shows the unavailable workspace screen when a FIBA career opens recruiting', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    render(
      <NgWorkspaceNavigationProvider>
        <WorkspaceHost />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByText(UNAVAILABLE_SECTION_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recruiting' })).toBeInTheDocument()
  })

  it('shows the discovered prospect, separate coach relationships, known priorities, and an active concern response', () => {
    useGameStore.getState().replaceWorld(createNcaaSimulatedGame())
    const cycle = Object.values(useGameStore.getState().world!.recruitingCyclesById).find((item) => item.status === 'open')!
    expect(useGameStore.getState().discoverRecruitingTalent(cycle.id)).toBeNull()
    const profile = Object.values(useGameStore.getState().world!.recruitProfilesById).find((item) => item.cycleId === cycle.id)!
    expect(useGameStore.getState().performRecruitingAction(cycle.id, profile.id, 'contact')).toBeNull()

    render(
      <NgWorkspaceNavigationProvider>
        <RecruitingWorkspace />
      </NgWorkspaceNavigationProvider>,
    )

    expect(screen.getByText(/Recruiter:/)).toHaveTextContent('Head Coach:')
    expect(screen.getByText('playingTime')).toBeInTheDocument()
    expect(screen.queryByText(/interest\s+\d+%/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Discuss concerns' }))
    expect(screen.getAllByText(/Prospect concern:/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Explain concern' }))
    expect(screen.getByText('Action completed.')).toBeInTheDocument()
  })

  it('closes actions for prospects whose RecruitingCycle has rolled over', () => {
    const initialWorld = createNcaaSimulatedGame()
    useGameStore.getState().replaceWorld(initialWorld)
    let world = initialWorld
    const cycle = Object.values(world.recruitingCyclesById).find((item) => item.status === 'open')!
    expect(useGameStore.getState().discoverRecruitingTalent(cycle.id)).toBeNull()
    world = useGameStore.getState().world!
    const profile = Object.values(world.recruitProfilesById).find((item) => item.cycleId === cycle.id)!
    const successor = { ...cycle, id: `${cycle.id}:successor`, sourceSeasonId: 'successor-season' as never, targetSeasonId: 'successor-season' as never }
    world = updateGameWorld(world, { recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status: 'completed' as const } : item).concat(successor) })
    useGameStore.getState().replaceWorld(world)

    render(<NgWorkspaceNavigationProvider><RecruitingWorkspace /></NgWorkspaceNavigationProvider>)

    expect(screen.getByText('Recruiting closed for this cycle.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Contact' })).not.toBeInTheDocument()
    const player = world.players[profile.playerId]!
    expect(screen.getByRole('button', { name: `${player.firstName} ${player.lastName}` })).toBeInTheDocument()
  })

  it('shows only the signing action during the signing phase for its own verbal commitment', () => {
    let world = createNcaaSimulatedGame()
    useGameStore.getState().replaceWorld(world)
    const cycle = Object.values(world.recruitingCyclesById).find((item) => item.status === 'open')!
    expect(useGameStore.getState().discoverRecruitingTalent(cycle.id)).toBeNull()
    world = useGameStore.getState().world!
    const profile = Object.values(world.recruitProfilesById).find((item) => item.cycleId === cycle.id)!
    const programTeamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!.id
    world = updateGameWorld(world, {
      recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status: 'signing' as const } : item),
      recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.id === profile.id ? { ...item, status: 'committed' as const } : item),
      recruitingCommitments: [{ id: `commitment:${cycle.id}:${profile.id}`, cycleId: cycle.id, recruitId: profile.id, programTeamId, offerId: `offer:${cycle.id}:${profile.id}:${programTeamId}`, committedOn: world.currentDate }],
    })
    useGameStore.getState().replaceWorld(world)

    render(<NgWorkspaceNavigationProvider><RecruitingWorkspace /></NgWorkspaceNavigationProvider>)

    expect(screen.getByRole('button', { name: /^Sign$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Contact' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Offer' })).not.toBeInTheDocument()
  })

  it('shows permission and Staff capacity reasons and hides actions after formal signing', () => {
    let world = createNcaaSimulatedGame()
    const cycle = Object.values(world.recruitingCyclesById).find((item) => item.status === 'open')!
    const shutdownCycle = { ...cycle, calendar: { ...cycle.calendar!, windows: [{ startsOn: world.currentDate, endsOn: world.currentDate, period: 'shutdown' as const }] } }
    world = updateGameWorld(world, { recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycle.id ? shutdownCycle : item) })
    useGameStore.getState().replaceWorld(world)
    expect(useGameStore.getState().discoverRecruitingTalent(cycle.id)).toBeNull()
    render(<NgWorkspaceNavigationProvider><RecruitingWorkspace /></NgWorkspaceNavigationProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }))
    expect(screen.getByText('Recruiting is fully shut down for this period.')).toBeInTheDocument()

    const openWorld = createNcaaSimulatedGame()
    const openCycle = Object.values(openWorld.recruitingCyclesById).find((item) => item.status === 'open')!
    useGameStore.getState().resetGame()
    useGameStore.getState().replaceWorld(openWorld)
    expect(useGameStore.getState().discoverRecruitingTalent(openCycle.id)).toBeNull()
    const discovered = Object.values(useGameStore.getState().world!.recruitProfilesById).find((item) => item.cycleId === openCycle.id)!
    const current = useGameStore.getState().world!
    const competition = Object.values(current.competitions).find((item) => item.ecosystemId === openCycle.ecosystemId)!
    const program = competition.participantTeamIds.find((teamId) => current.teams[teamId]?.coachId === current.userCoachId)!
    const assignedStaff = Object.values(current.teamStaffAssignmentsById).find((item) => item.teamId === program)!
    const capacityWorld = updateGameWorld(current, { recruitingActionHistory: [...Object.values(current.recruitingActionHistoryById), { id: 'ui-staff-capacity', cycleId: openCycle.id, recruitId: discovered.id, programTeamId: program, kind: 'pitch' as const, date: current.currentDate, cost: openCycle.rules.staffDailyCapacity ?? 6, effect: 0, staffPersonId: assignedStaff.staffPersonId, offCampus: false }] })
    useGameStore.getState().replaceWorld(capacityWorld)
    cleanup()
    render(<NgWorkspaceNavigationProvider><RecruitingWorkspace /></NgWorkspaceNavigationProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }))
    expect(screen.getByText('This Staff member has reached today’s Recruiting activity limit.')).toBeInTheDocument()

    const signedWorld = updateGameWorld(useGameStore.getState().world!, { recruitProfiles: Object.values(useGameStore.getState().world!.recruitProfilesById).map((item) => item.id === discovered.id ? { ...item, status: 'incoming' as const } : item) })
    useGameStore.getState().replaceWorld(signedWorld)
    cleanup()
    render(<NgWorkspaceNavigationProvider><RecruitingWorkspace /></NgWorkspaceNavigationProvider>)
    expect(screen.getByText('incoming')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Contact' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discuss concerns' })).not.toBeInTheDocument()
  })
})
