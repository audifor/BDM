import { requestTrainingPhysicalAllocation, releaseTrainingPhysicalAllocation } from '@/engine/facilities/PhysicalAllocationEngine'
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
import { executeScheduledTrainingSessions, scheduleTrainingSession } from '@/engine/training/ScheduledTrainingEngine'
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

it('shows occupied unreserved Training as blocked after reload and allows legitimate manager rescheduling', () => {
  const f = createFacilityClubScenario(), team = getUserTeam(f.world)!
  const other = Object.values(f.world.teams).find(item => item.id !== team.id && item.rosterPlayerIds.length > 0)!
  const source = f.world.facilityComponentsById[f.courtComponentId]!
  const component = createFacilityComponent({ ...source, id: 'ui:fix-court', specification: { kind: 'CAPACITY', amount: 10, unit: 'SIMULTANEOUS_PLAYERS' } })
  const date = addDays(f.world.currentDate, 1)
  const session = createScheduledTrainingSession({ id: 'ui:fix-own', teamId: team.id, date, startTime: '10:00', durationMinutes: 60, scope: 'team', selectedPlayerIds: team.rosterPlayerIds.slice(0, 8), definitionId: 'threePoint', intensity: 'normal' })
  const reserved = createScheduledTrainingSession({ id: 'ui:fix-other', teamId: other.id, date, startTime: '10:30', durationMinutes: 60, scope: 'individual', playerId: other.rosterPlayerIds[0]!, definitionId: 'threePoint', intensity: 'normal' })
  let world = updateGameWorld(f.world, { facilityComponents: [...Object.values(f.world.facilityComponentsById), component],
    facilityComponentConditionRecords: [...Object.values(f.world.facilityComponentConditionRecordsById), createFacilityComponentConditionRecord({ id: 'ui:fix-condition', componentId: component.id, effectiveFrom: f.world.currentDate, serviceability: 'FULL', physicalCondition: 80 })],
    facilityUsageRights: [...Object.values(f.world.facilityUsageRightsById).map(right => right.facilityId === component.facilityId ? createFacilityUsageRight({ ...right, exclusivity: 'SHARED' }) : right), ...[team, other].map(item => createFacilityUsageRight({ id: `ui:fix-right:${item.id}`, facilityId: component.facilityId, componentIds: [component.id], teamId: item.id, purpose: 'OTHER', exclusivity: 'SHARED', validFrom: f.world.currentDate }))],
    scheduledTrainingSessionsById: { [session.id]: session, [reserved.id]: reserved } })
  world = requestTrainingPhysicalAllocation(world, { sessionId: session.id, componentId: component.id, requestId: 'own', confirm: true })
  world = releaseTrainingPhysicalAllocation(world, session.id, world.scheduledTrainingSessionsById[session.id]!.physicalAllocations![0]!.id)
  world = requestTrainingPhysicalAllocation(world, { sessionId: reserved.id, componentId: component.id, requestId: 'other', confirm: true })
  const blocked = executeScheduledTrainingSessions(updateGameWorld(world, { currentDate: date }))
  useGameStore.getState().replaceWorld(deserializeGameWorldV4(serializeGameWorldV4(blocked, '2032-10-01T00:00:00.000Z')))
  render(<NgWorkspaceNavigationProvider><TrainingWorkspace /></NgWorkspaceNavigationProvider>)
  expect(screen.getAllByText(/RESOURCE_OCCUPIED/).length).toBeGreaterThan(0)
  expect(screen.getByText(/Session not executed/)).toBeInTheDocument()
  expect(useGameStore.getState().world!.scheduledTrainingSessionsById[session.id]?.execution).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Reschedule for tomorrow' }))
  const moved = useGameStore.getState().world!
  expect(moved.scheduledTrainingSessionsById[session.id]?.date).toBe(addDays(date, 1))
  const output = executeScheduledTrainingSessions(updateGameWorld(moved, { currentDate: addDays(date, 1) }))
  expect(output.scheduledTrainingSessionsById[session.id]?.status).toBe('completed')
  expect(executeScheduledTrainingSessions(output)).toEqual(output)
})
