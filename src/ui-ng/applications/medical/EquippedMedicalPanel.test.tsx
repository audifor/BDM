// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { equippedMedicalFixture } from '@/app/game/testSupport/EquippedMedicalFixture'
import { equippedActs } from '@/engine/injury/EquippedRehabilitation'
import { advanceDay } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { EquippedMedicalPanel } from './EquippedMedicalPanel'

let f: ReturnType<typeof equippedMedicalFixture>
beforeAll(() => { f = equippedMedicalFixture() }, 30000)
beforeEach(() => { window.history.replaceState({}, '', '/?app=medical'); useGameStore.setState({ world: f.world }) })
afterEach(cleanup)
function Connected({ facility = false }: { facility?: boolean }) { const world = useGameStore(state => state.world)!; return <EquippedMedicalPanel world={world} teamId={f.team.id} {...(facility ? { facilityId: f.facility.id } : {})} /> }
describe('productive Medical and Facilities manager workflow', () => {
  it('indicates through an accredited clinician, schedules, executes through Calendar and shows reload truth', () => {
    render(<Connected />)
    fireEvent.change(screen.getByLabelText('Lesión en recuperación'), { target: { value: f.injury.id } })
    fireEvent.change(screen.getByLabelText('Profesional que indica'), { target: { value: f.staffId } })
    fireEvent.change(screen.getByLabelText('Equipamiento indicado'), { target: { value: 'fixture:equipped-rehab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar indicación clínica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar indicación clínica' }))
    expect(equippedActs(useGameStore.getState().world!)).toHaveLength(1)
    const id = equippedActs(useGameStore.getState().world!)[0]!.id
    fireEvent.click(screen.getByRole('button', { name: id }))
    fireEvent.change(screen.getByLabelText('Fecha Medical'), { target: { value: f.date } })
    fireEvent.change(screen.getByLabelText('Inicio Medical'), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('Final Medical'), { target: { value: '11:00' } })
    fireEvent.change(screen.getByLabelText('Profesional que realiza'), { target: { value: f.staffId } })
    fireEvent.change(screen.getByLabelText('Componente Medical'), { target: { value: f.component.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar / confirmar programación' }))
    expect(equippedActs(useGameStore.getState().world!)[0]?.physicalAllocations?.at(-1)?.status).toBe('CONFIRMED')
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar / confirmar programación' }))
    expect(equippedActs(useGameStore.getState().world!)[0]?.physicalAllocations).toHaveLength(1)
    expect(equippedActs(useGameStore.getState().world!)[0]?.fulfilledOn).toBeUndefined()
    act(() => useGameStore.setState({ world: advanceDay(useGameStore.getState().world!) }))
    expect(screen.getAllByText(/COMPLETED · MEDICAL_EXECUTED/).length).toBeGreaterThan(0)
    act(() => useGameStore.setState({ world: deserializeGameWorldV4(serializeGameWorldV4(useGameStore.getState().world!, '2026-10-10T00:00:00.000Z')) }))
    expect(equippedActs(useGameStore.getState().world!)[0]?.status).toBe('COMPLETED')
  })
  it('offers no clinical indication to advisory-only staff and never grants credentials', () => {
    const world = updateGameWorld(f.world, { staffPeople: Object.values(f.world.staffPeopleById).map(person => ({ ...person, professional: { attributes: person.professional.attributes } })) })
    useGameStore.setState({ world }); render(<Connected />)
    expect(screen.getByText(/Sin profesional con autorización clínica acreditada/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solicitar indicación clínica' })).toBeDisabled()
    expect(equippedActs(useGameStore.getState().world!)).toHaveLength(0)
  })
  it('cancellation has a real domain consequence and Facilities navigation identifies the act', () => {
    useGameStore.setState({ world: f.scheduled }); render(<Connected facility />)
    expect(screen.getByText(/MEDICAL · .*CONFIRMED/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Abrir actuación Medical ${f.indication.id}` }))
    expect(new URL(window.location.href).searchParams.get('app')).toBe('medical')
    expect(new URL(window.location.href).searchParams.get('requestId')).toBe(f.indication.id)
    fireEvent.click(screen.getByRole('button', { name: `Cancelar ${f.indication.id}` }))
    expect(equippedActs(useGameStore.getState().world!)[0]?.status).toBe('CANCELLED')
    act(() => useGameStore.setState({ world: advanceDay(useGameStore.getState().world!) }))
    expect(equippedActs(useGameStore.getState().world!)[0]?.fulfilledOn).toBeUndefined()
  })
})
