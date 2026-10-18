// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { useGameStore } from '@/stores/gameStore'
import { updateGameWorld } from '@/domain/world'
import { createFacilityComponentConditionRecord } from '@/domain/facilities'
import { youthFacilitiesFixture, acceptedYouthTrainingFixture } from '@/app/youth/testFixtures'
import { executeScheduledTrainingSessions } from '@/engine/training/ScheduledTrainingEngine'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { TalentOperationsWorkspace } from './TalentOperationsWorkspace'

afterEach(cleanup)

it('shows configured youth infrastructure and scoped rights in Talent, then navigates without writing world state', () => {
  const { world } = youthFacilitiesFixture()
  useGameStore.getState().replaceWorld(world)
  window.history.replaceState({}, '', '/?ui=ng&app=talent')
  const before = serializeGameWorldV4(useGameStore.getState().world!, '2032-10-01T00:00:00.000Z')
  render(<TalentOperationsWorkspace />)
  expect(screen.getByRole('heading', { name: 'Youth facilities and Training' })).toBeInTheDocument()
  expect(screen.getByText('Configured U18 (U18)')).toBeInTheDocument()
  expect(screen.getByText(/Organization right; does not grant Team access/)).toBeInTheDocument()
  expect(screen.getByText(/Youth Team right: SHARED/)).toBeInTheDocument()
  expect(screen.getByText(/operational capacity unknown/)).toBeInTheDocument()
  expect(screen.queryByText(/bonus|potential boost|recruiting boost/i)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open Facilities' }))
  expect(new URL(window.location.href).searchParams.get('app')).toBe('facilities')
  expect(serializeGameWorldV4(useGameStore.getState().world!, '2032-10-01T00:00:00.000Z')).toEqual(before)
})

it('shows missing associated physical data as unknown, not a failed intake or zero academy quota', () => {
  const fixture = youthFacilitiesFixture()
  const unknown = updateGameWorld(fixture.world, { facilities: [], facilityComponents: [], facilityComponentConditionRecords: [], facilityUsageRights: [] })
  useGameStore.getState().replaceWorld(unknown)
  render(<TalentOperationsWorkspace />)
  expect(screen.getByText(/Associated infrastructure is unknown/)).toBeInTheDocument()
  expect(screen.getByText(/Missing information alone does not restrict intake or Training/)).toBeInTheDocument()
  expect(screen.queryByText(/intake blocked|academy quota|no players can/i)).not.toBeInTheDocument()
})

it('shows an actual blocked youth Training attempt after reload, without claiming a Talent supply consequence', () => {
  const fixture = acceptedYouthTrainingFixture()
  const blocked = updateGameWorld(fixture.world, { currentDate: fixture.date, facilityComponentConditionRecords: Object.values(fixture.world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability: 'OUT_OF_SERVICE' })) })
  const executed = executeScheduledTrainingSessions(blocked)
  const loaded = deserializeGameWorldV4(serializeGameWorldV4(executed, '2032-10-01T00:00:00.000Z'))
  useGameStore.getState().replaceWorld(loaded)
  render(<TalentOperationsWorkspace />)
  expect(screen.getByRole('heading', { name: 'Recorded Training attempts' })).toBeInTheDocument()
  expect(screen.getByText(/Session not executed: no development stimulus/)).toBeInTheDocument()
  expect(screen.getByText(/Intake and registration follow existing talent rules/)).toBeInTheDocument()
  expect(screen.getByText(/threePoint: scheduled/)).toBeInTheDocument()
  expect(screen.queryByText(/Talent consumer LIVE|intake blocked/i)).not.toBeInTheDocument()
})
