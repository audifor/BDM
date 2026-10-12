// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { advanceGameDay, createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { StaffWorkspace } from '@/ui-ng/applications/staff/StaffWorkspace'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=staff')
  useGameStore.getState().resetGame()
})

function mountStaffWorkspace(world = createNewGame()) {
  useGameStore.getState().replaceWorld(world)
  const team = getUserTeam(world)!
  const view = render(
    <NgWorkspaceNavigationProvider>
      <StaffWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  return { ...view, world, team }
}

describe('StaffWorkspace', () => {
  it('shows an empty state when no world is loaded', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <StaffWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Staff' })).toBeInTheDocument()
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })

  it('opens the Staff tab by default and reaches the Assignments tab second', () => {
    mountStaffWorkspace()

    expect(screen.getByRole('button', { name: 'STAFF' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('heading', { name: 'STAFF ASSIGNMENTS' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ASSIGNMENT MATRIX' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ASIGNACIONES' }))

    expect(screen.getByRole('heading', { name: 'ASSIGNMENT MATRIX' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ASSIGNMENT INSPECTOR' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'STAFF POOL' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AUTO-ASSIGN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OPTIMIZE' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ NEW ASSIGNMENT' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Responsibilities' })).not.toBeInTheDocument()
  })

  it('renders the staff context header under the tab bar with the section label', () => {
    const { team } = mountStaffWorkspace()

    const tabsSlot = document.querySelector('.ng-application-workspace__tabs-slot')!
    const headerSlot = document.querySelector('.ng-application-workspace__tabs-header-slot')!
    expect(headerSlot).toBeInTheDocument()
    expect(tabsSlot.compareDocumentPosition(headerSlot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(headerSlot.textContent).toContain(team.name)
    expect(document.querySelector('.ng-application-workspace__header-slot')).toBeNull()
    expect(document.querySelector('.staff-workspace-header__app')!.textContent).toBe('STAFF')

    fireEvent.click(screen.getByRole('button', { name: 'ASIGNACIONES' }))
    expect(document.querySelector('.staff-workspace-header__app')!.textContent).toBe('ASIGNACIONES')
    expect(document.querySelector('.staff-workspace-header__actions')).not.toBeNull()
  })

  it('assigns a responsibility in two clicks from the matrix quick assign control', () => {
    mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'ASIGNACIONES' }))

    const quickAssign = screen.getAllByTitle('Quick assign')[0]!
    expect(quickAssign).toHaveTextContent('+ ASSIGN')
    fireEvent.click(quickAssign)

    const popover = screen.getByRole('listbox')
    expect(popover).toHaveTextContent('ASSIGN RESPONSIBILITY')
    const option = screen.getAllByRole('option')[0]!
    const holderName = option.querySelector('.sa-candidate__name')!.textContent!
    fireEvent.click(option)

    expect(screen.getByRole('status')).toHaveTextContent('Assignment updated')
    const world = useGameStore.getState().world!
    const holderNames = Object.values(world.responsibilitiesById)
      .filter((responsibility) => responsibility.holderStaffId !== undefined)
      .map((responsibility) => world.staffPeopleById[responsibility.holderStaffId!])
      .map((person) => `${person!.identity.firstName} ${person!.identity.lastName}`)
    expect(holderNames).toContain(holderName)
  })

  it('opts the head coach back in from the quick assign manager section', () => {
    mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'ASIGNACIONES' }))

    fireEvent.click(screen.getAllByTitle('Quick assign')[0]!)
    fireEvent.click(screen.getAllByRole('option')[0]!)
    expect(Object.values(useGameStore.getState().world!.responsibilitiesById).some((row) => row.holderStaffId !== undefined)).toBe(true)

    fireEvent.click(screen.getAllByTitle('Quick assign')[0]!)
    const managerOption = screen.getAllByRole('option').find((option) => option.textContent?.includes('YOU'))!
    fireEvent.click(managerOption)
    expect(Object.values(useGameStore.getState().world!.responsibilitiesById).filter((row) => row.holderStaffId !== undefined)).toHaveLength(0)
  })

  it('opens the inspector only when the responsibility itself is clicked', () => {
    mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'ASIGNACIONES' }))

    expect(screen.queryByRole('heading', { name: 'ASSIGNMENT INSPECTOR' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AUTO-ASSIGN' }))
    fireEvent.click(screen.getByRole('button', { name: 'PREVIEW' }))
    fireEvent.click(screen.getByRole('button', { name: /APPLY \d+ CHANGES/ }))

    fireEvent.click(screen.getAllByRole('button', { name: /Open inspector for/ })[0]!)
    expect(screen.getByRole('heading', { name: 'ASSIGNMENT INSPECTOR' })).toBeInTheDocument()
    expect(screen.getByText('ASSIGNMENT OPTIONS')).toBeInTheDocument()
  })

  it('shows the assigned holder in the inspector key matches', () => {
    mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'ASIGNACIONES' }))
    fireEvent.click(screen.getByRole('button', { name: 'AUTO-ASSIGN' }))
    fireEvent.click(screen.getByRole('button', { name: 'PREVIEW' }))
    fireEvent.click(screen.getByRole('button', { name: /APPLY \d+ CHANGES/ }))

    // The first matrix row is still vacant for `bestOverallFit`; open an assigned one instead.
    const assignedRow = [...document.querySelectorAll('.sa-row')].find((row) => row.querySelector('.sa-quick:not(.sa-quick--empty)') !== null)!
    const info = assignedRow.querySelector('.sa-row__info')!
    fireEvent.click(info)

    expect(screen.getByText('KEY MATCHES')).toBeInTheDocument()
    expect(screen.getByText('CURRENT ASSIGNMENT')).toBeInTheDocument()
    expect(screen.getByText('SUITABILITY')).toBeInTheDocument()
  })

  it('applies an auto-assign strategy through the canonical world', () => {
    mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'ASIGNACIONES' }))

    fireEvent.click(screen.getByRole('button', { name: 'AUTO-ASSIGN' }))
    expect(screen.getByRole('dialog', { name: 'AUTO-ASSIGN STAFF' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'PREVIEW' }))
    expect(screen.getByText('AUTO-ASSIGN PREVIEW')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /APPLY \d+ CHANGES/ }))

    expect(screen.getByRole('status').textContent).toMatch(/assignments applied/)
    const world = useGameStore.getState().world!
    expect(Object.values(world.responsibilitiesById).some((responsibility) => responsibility.holderStaffId !== undefined)).toBe(true)
  })

  it('scopes the section AUTO control to that section only', () => {
    mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'ASIGNACIONES' }))

    const scoutingHead = [...document.querySelectorAll('.sa-group__head')].find((head) => head.textContent?.startsWith('SCOUTING'))!
    fireEvent.click(scoutingHead.querySelector('.sa-group__auto')!)
    expect(screen.getByRole('dialog', { name: 'AUTO-ASSIGN · SCOUTING' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'PREVIEW' }))
    fireEvent.click(screen.getByRole('button', { name: /APPLY \d+ CHANGES/ }))

    const world = useGameStore.getState().world!
    const heldKinds = Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.holderStaffId !== undefined)
    expect(heldKinds.length).toBeGreaterThan(0)
    for (const responsibility of heldKinds) {
      expect(['assignScouts', 'prioritizeRegions', 'oppositionReport', 'prospectReport']).toContain(responsibility.kind)
    }
  })

  it('filters the matrix from the vacancies KPI', () => {
    mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'ASIGNACIONES' }))

    const before = screen.getAllByTitle('Quick assign').length
    fireEvent.click(screen.getByRole('button', { name: /VACANCIES/ }))
    expect(screen.getByRole('button', { name: 'CLEAR FILTER' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CLEAR FILTER' }))
    expect(screen.getAllByTitle('Quick assign')).toHaveLength(before)
  })

  it('shows real departments and navigates directly to decisions without fictitious vacancies',()=>{
    const {team}=mountStaffWorkspace()
    expect(screen.getByRole('heading',{name:'DIRIGE TU CUERPO TÉCNICO'})).toBeInTheDocument()
    expect(screen.getByLabelText('Departamentos de staff')).toBeInTheDocument()
    expect(screen.getByLabelText('Situación del cuerpo técnico')).toBeInTheDocument()
    expect(screen.getByText('Vacantes abiertas reales'.toUpperCase())).toBeInTheDocument()
    expect(screen.getByText((_,node)=>node?.classList.contains('staff-workspace-header__team')===true
      &&node.textContent===team.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:/ORGANIZAR EL TRABAJO/}))
    expect(screen.getByRole('heading',{name:'ASSIGNMENT MATRIX'})).toBeInTheDocument()
  })

  it('opens a real vacancy in the staff market through the canonical service',()=>{
    const {team}=mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button',{name:'MERCADO'}))
    expect(screen.getByRole('heading',{name:'CONSTRUIR TU EQUIPO'})).toBeInTheDocument()
    expect(screen.getByText('No hay vacantes abiertas. Los objetivos visuales por puesto no cuentan como vacantes.',{exact:false})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'+ ABRIR VACANTE'}))
    const world=useGameStore.getState().world!
    expect(Object.values(world.staffJobOpeningsById).some(job=>job.teamId===team.id&&job.status==='open')).toBe(true)
  })

  it('compares only staff with the same role and within a real competition edition',()=>{
    const {world,team}=mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button',{name:'COMPARATIVA'}))
    expect(screen.getByRole('heading',{name:'STAFF INTELLIGENCE'})).toBeInTheDocument()
    const comp=screen.getByLabelText('Competición de comparación')
    expect(comp.querySelectorAll('option').length).toBeGreaterThan(0)
    expect((comp as HTMLSelectElement).value).not.toBe('')
    expect(Object.values(world.seasons).some(season=>
      (season.participantTeamIds??world.competitions[season.competitionId]?.participantTeamIds??[]).includes(team.id))).toBe(true)
  })

  it('opens dynamics people from the canonical workspace tabs', () => {
    mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /^DINÁMICAS/ }))
    expect(screen.getByRole('button', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Units' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Conflicts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Career' })).toBeInTheDocument()
  })

  it('renders dynamics states as red-to-green tone dots instead of band text', () => {
    mountStaffWorkspace(advanceGameDay(createNewGame()))
    fireEvent.click(screen.getByRole('button', { name: /^DINÁMICAS/ }))
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
    expect(screen.queryByText('VERY SATISFIED')).not.toBeInTheDocument()
    expect(screen.queryByText('EXTREMELY SATISFIED')).not.toBeInTheDocument()
    expect(screen.queryByText('VERY DISSATISFIED')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Units' }))
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
    expect(screen.queryByText('VERY STRONG')).not.toBeInTheDocument()
    expect(screen.queryByText('VERY WEAK')).not.toBeInTheDocument()
  }, 30000)

  it('opens the individual staff dossier from a direct staff route', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === team.id)!
    const person = world.staffPeopleById[assignment.staffPersonId]!
    window.history.replaceState({}, '', `/?ui=ng&app=staff&staffId=${assignment.staffPersonId}`)
    mountStaffWorkspace(world)

    expect(new URL(window.location.href).searchParams.get('staffId')).toBe(assignment.staffPersonId)
    expect(
      screen.getByRole('heading', { name: `${person.identity.firstName}${person.identity.lastName}` }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attributes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contract' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByText('Role evaluation')).toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Staff' }))
    expect(screen.getByRole('menuitem', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'COACHING' })).toBeInTheDocument()
  })

  it('opens a staff dossier directly from the department leader on the Courtside overview', () => {
    const { world } = mountStaffWorkspace()
    const leader = document.querySelector<HTMLButtonElement>('.cs-staff-department__lead button')!
    expect(leader).not.toBeNull()
    const leaderName = leader.textContent!.replace(' ↗','')
    const staff = Object.values(world.staffPeopleById).find(person =>
      `${person.identity.firstName} ${person.identity.lastName}` === leaderName)!
    fireEvent.click(leader)
    expect(new URL(window.location.href).searchParams.get('staffId')).toBe(staff.id)
    expect(screen.getByRole('button', { name: 'Attributes' })).toBeInTheDocument()
    expect(screen.getByText('Role evaluation')).toBeInTheDocument()
  })
})

