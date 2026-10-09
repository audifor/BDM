import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { createFacilityClubScenario } from '@/app/facilities/testFixtures'
import { createFacilityComponent, createFacilityComponentConditionRecord, createFacilityUsageRight } from '@/domain/facilities'
import { createScheduledTrainingSession } from '@/domain/training'
import { addDays } from '@/domain/date'
import { getUserTeam } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'
import { scheduleTrainingSession } from '@/engine/training/ScheduledTrainingEngine'
import { useGameStore } from '@/stores/gameStore'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { TrainingWorkspace } from './TrainingWorkspace'
import { FacilitiesWorkspace } from '@/ui-ng/applications/facilities/FacilitiesWorkspace'

afterEach(() => { cleanup(); useGameStore.getState().resetGame() })
it('uses the reachable Training manager flow to select, confirm, reload, reprogram, release and cancel without financial writes', () => {
  const f = createFacilityClubScenario(), team = getUserTeam(f.world)!
  const source = Object.values(f.world.facilityComponentsById).find(component => component.type === 'PRACTICE_COURT')!
  const component = createFacilityComponent({ ...source, id: 'ui:c1-court', specification: { kind: 'CAPACITY', amount: 10, unit: 'SIMULTANEOUS_PLAYERS' } })
  const physical = updateGameWorld(f.world, { facilityComponents: [...Object.values(f.world.facilityComponentsById), component],
    facilityComponentConditionRecords: [...Object.values(f.world.facilityComponentConditionRecordsById), createFacilityComponentConditionRecord({ id: 'ui:c1-condition', componentId: component.id, effectiveFrom: f.world.currentDate, serviceability: 'FULL', physicalCondition: 80 })],
    facilityUsageRights: [...Object.values(f.world.facilityUsageRightsById), createFacilityUsageRight({ id: 'ui:c1-right', facilityId: component.facilityId, componentIds: [component.id], teamId: team.id, purpose: 'OTHER', exclusivity: 'SHARED', validFrom: f.world.currentDate })],
  })
  const world = scheduleTrainingSession(physical,
    createScheduledTrainingSession({ id: 'ui:c1', teamId: team.id, date: addDays(f.world.currentDate, 1), startTime: '10:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' }))
  useGameStore.getState().replaceWorld(world)
  render(<NgWorkspaceNavigationProvider><TrainingWorkspace /></NgWorkspaceNavigationProvider>)
  const panel = within(screen.getByRole('article', { name: 'Physical resource ui:c1' }))
  const original = useGameStore.getState().world!
  for (const checkbox of panel.getAllByRole('checkbox').slice(0, 8)) fireEvent.click(checkbox)
  fireEvent.click(panel.getByRole('button', { name: 'Apply participants' }))
  fireEvent.change(panel.getByRole('combobox'), { target: { value: component.id } })
  fireEvent.click(panel.getByRole('button', { name: 'Request resource' }))
  expect(useGameStore.getState().world!.scheduledTrainingSessionsById['ui:c1']?.physicalAllocations?.[0]?.status).toBe('PENDING')
  fireEvent.click(panel.getByRole('button', { name: 'Confirm resource' }))
  expect(useGameStore.getState().world!.scheduledTrainingSessionsById['ui:c1']?.physicalAllocations?.[0]).toMatchObject({ status: 'CONFIRMED', demand: 8 })
  const reserved = useGameStore.getState().world!
  useGameStore.getState().replaceWorld(deserializeGameWorldV4(serializeGameWorldV4(reserved, '2032-10-01T00:00:00.000Z')))
  fireEvent.change(panel.getByLabelText('Start ui:c1'), { target: { value: '12:00' } })
  fireEvent.click(panel.getByRole('button', { name: 'Reprogram session' }))
  const moved = useGameStore.getState().world!
  expect(moved.scheduledTrainingSessionsById['ui:c1']?.startTime).toBe('12:00')
  expect(moved.scheduledTrainingSessionsById['ui:c1']?.physicalAllocations?.filter(item => item.status === 'CONFIRMED')).toHaveLength(1)
  const refreshed = within(screen.getByRole('article', { name: 'Physical resource ui:c1' }))
  fireEvent.click(refreshed.getByRole('button', { name: 'Open selected Facility' }))
  expect(useGameStore.getState().focusedFacilityId).toBe(component.facilityId)
  expect(moved.financialTransactionsById).toEqual(original.financialTransactionsById)
  fireEvent.click(refreshed.getByRole('button', { name: /^Release / }))
  expect(useGameStore.getState().world!.scheduledTrainingSessionsById['ui:c1']?.physicalAllocations?.every(item => item.status === 'RELEASED')).toBe(true)
  fireEvent.click(refreshed.getByRole('button', { name: 'Cancel session and release' }))
  expect(useGameStore.getState().world!.scheduledTrainingSessionsById['ui:c1']?.status).toBe('cancelled')
  cleanup()
  render(<NgWorkspaceNavigationProvider><FacilitiesWorkspace /></NgWorkspaceNavigationProvider>)
  expect(screen.getByRole('region', { name: 'Training physical reservations' })).toBeInTheDocument()
})
