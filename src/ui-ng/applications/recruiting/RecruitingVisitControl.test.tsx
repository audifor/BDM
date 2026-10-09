// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useGameStore } from '@/stores/gameStore'
import { demonstrationFixture } from '@/app/youth/recruitingTestFixtures'
import { createFacilityComponentConditionRecord } from '@/domain/facilities'
import { updateGameWorld } from '@/domain/world'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { RecruitingWorkspace } from './RecruitingWorkspace'

afterEach(cleanup)
beforeEach(() => { window.history.replaceState({}, '', '/?ui=ng&app=recruiting'); useGameStore.getState().resetGame() })
const payload = () => serializeGameWorldV4(useGameStore.getState().world!, '2032-10-01T00:00:00.000Z')
function selectDemo() {
  fireEvent.click(screen.getByRole('button', { name: 'Visit' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Optional facility demonstration' }), { target: { value: 't:court|BASKETBALL_TRAINING' } })
}

it('manager selection and confirmation produce a real BS15 visit, persisted demonstration and visible executed result', () => {
  const fixture = demonstrationFixture(true)
  useGameStore.getState().replaceWorld(fixture.world)
  render(<RecruitingWorkspace />)
  const before = payload()
  selectDemo()
  expect(payload()).toEqual(before)
  expect(screen.getByText(/preview is not an executed activity/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm visit' }))
  const visited = useGameStore.getState().world!
  expect(Object.keys(visited.recruitingVisitsById)).toHaveLength(1)
  expect(Object.values(visited.recruitingVisitsById)[0]?.facilityDemonstration?.attempts[0]?.result).toBe('COMPLETED')
  expect(screen.getByText(/COMPLETED; VERIFIED_AVAILABLE/)).toBeInTheDocument()
  expect(visited.players).toEqual(fixture.world.players)
  expect(screen.queryByText(/interest\s+\d+%|potential bonus/i)).not.toBeInTheDocument()
  const loaded = deserializeGameWorldV4(payload())
  act(() => useGameStore.getState().replaceWorld(loaded))
  expect(screen.getByText(/COMPLETED; VERIFIED_AVAILABLE/)).toBeInTheDocument()
})
it('canceling a selected but unconfirmed visit writes no event; Facilities navigation writes no simulation state', () => {
  useGameStore.getState().replaceWorld(demonstrationFixture(true).world)
  render(<RecruitingWorkspace />)
  const before = payload()
  selectDemo()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel visit' }))
  expect(payload()).toEqual(before)
  expect(screen.queryByRole('button', { name: 'Confirm visit' })).not.toBeInTheDocument()
  expect(Object.keys(useGameStore.getState().world!.recruitingVisitsById)).toHaveLength(0)
  selectDemo()
  fireEvent.click(screen.getByRole('button', { name: 'Open Facilities' }))
  expect(new URL(window.location.href).searchParams.get('app')).toBe('facilities')
  expect(payload()).toEqual(before)
})
it('outage affects only the demonstration; an explicit manager restoration retry completes the same visit activity', () => {
  const fixture = demonstrationFixture(true)
  const blocked = updateGameWorld(fixture.world, { facilityComponentConditionRecords: Object.values(fixture.world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability: 'OUT_OF_SERVICE' })) })
  useGameStore.getState().replaceWorld(blocked)
  render(<RecruitingWorkspace />)
  selectDemo()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm visit' }))
  expect(screen.getByText(/NOT_EXECUTED; VERIFIED_UNAVAILABLE/)).toBeInTheDocument()
  expect(Object.keys(useGameStore.getState().world!.recruitingVisitsById)).toHaveLength(1)
  const world = useGameStore.getState().world!
  act(() => useGameStore.getState().replaceWorld(updateGameWorld(world, { facilityComponentConditionRecords: Object.values(world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability: 'FULL' })) })))
  fireEvent.click(screen.getByRole('button', { name: /Retry demonstration:/ }))
  expect(screen.getByText(/COMPLETED; VERIFIED_AVAILABLE/)).toBeInTheDocument()
  expect(Object.keys(useGameStore.getState().world!.recruitingVisitsById)).toHaveLength(1)
  expect(screen.queryByRole('button', { name: /Retry demonstration:/ })).not.toBeInTheDocument()
})
it('visit without demonstration is optional and unknown context never creates a verified completion', () => {
  const fixture = demonstrationFixture(true)
  useGameStore.getState().replaceWorld(updateGameWorld(fixture.world, { facilities: [], facilityComponents: [], facilityComponentConditionRecords: [], facilityUsageRights: [] }))
  render(<RecruitingWorkspace />)
  fireEvent.click(screen.getByRole('button', { name: 'Visit' }))
  expect(screen.getByText(/Physical context is unknown/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm visit' }))
  expect(Object.values(useGameStore.getState().world!.recruitingVisitsById)[0]).not.toHaveProperty('facilityDemonstration')
  expect(screen.queryByText(/COMPLETED; VERIFIED_AVAILABLE/)).not.toBeInTheDocument()
})
