import { expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { createGameWorld, updateGameWorld, updateGameWorldBatch, withSingleWorldValidation } from './GameWorld'
import { createValidGameWorldInput } from './testFixtures'
import { createScheduledTrainingSession } from '@/domain/training'

it('publishes nested canonical updates equivalently to sequential updates', () => {
  const initial = createGameWorld(createValidGameWorldInput())
  const target = addDays(initial.currentDate, 1)
  const expected = updateGameWorld(updateGameWorld(initial, { currentDate: target }), { currentDate: addDays(target, 1) })
  const actual = withSingleWorldValidation(initial, world => withSingleWorldValidation(world, nested => updateGameWorldBatch(nested, (base, update) => update(update(base, { currentDate: target }), { currentDate: addDays(target, 1) }))))
  expect(actual).toEqual(expected)
  expect(initial.currentDate).not.toBe(actual.currentDate)
})
it('rejects an invalid final world and restores standalone validation after throws', () => {
  const initial = createGameWorld(createValidGameWorldInput())
  const before = JSON.stringify(initial)
  expect(() => withSingleWorldValidation(initial, world => updateGameWorld(world, { countries: [] }))).toThrow()
  expect(JSON.stringify(initial)).toBe(before)
  expect(() => updateGameWorld(initial, { countries: [] })).toThrow()
  expect(() => withSingleWorldValidation(initial, () => { throw new Error('abort') })).toThrow('abort')
  expect(() => updateGameWorldBatch(initial, (world, update) => update(world, { countries: [] }))).toThrow()
})
it('validates new stimulus source links and forbids duplicate additions in a batch', () => {
  const initial = createGameWorld(createValidGameWorldInput())
  const event = { id: 'bad-evidence', sourceType: 'match' as const, sourceId: initial.games[Object.keys(initial.games)[0] as keyof typeof initial.games]!.id, date: initial.currentDate, playerId: Object.values(initial.players)[0]!.id, byRating: { stamina: 0.1 } }
  expect(() => withSingleWorldValidation(initial, world => updateGameWorld(world, { developmentStimulusEventAdditions: [event] }))).toThrow('does not match completed Match')
  expect(() => withSingleWorldValidation(initial, world => updateGameWorld(world, { developmentStimulusEventAdditions: [event, event] }))).toThrow('already exists')
  expect(Object.keys(initial.developmentStimulusEventsById)).toHaveLength(0)
})

it('rechecks unchanged completed training staff links after employment changes', () => {
  const input = createValidGameWorldInput()
  const team = input.teams[0]!
  const staffId = input.staffPeople![0]!.id
  const session = createScheduledTrainingSession({ id: 'historical-staff', teamId: team.id, date: input.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal', status: 'completed', assignedStaffPersonIds: [staffId] })
  const initial = createGameWorld({ ...input, scheduledTrainingSessionsById: { [session.id]: session } })
  expect(() => withSingleWorldValidation(initial, world => updateGameWorld(world, { staffEmploymentByStaffId: { [staffId]: { status: 'unemployed' } } }))).toThrow('not actively assigned')
  expect(() => updateGameWorld(initial, { teamStaffAssignments: [] })).toThrow('not actively assigned')
})


for (const validationMode of ['full', 'incremental'] as const) it(`rechecks training staff and new evidence with ${validationMode} publication`, () => {
  const input = createValidGameWorldInput()
  const team = input.teams[0]!
  const staffId = input.staffPeople![0]!.id
  const session = createScheduledTrainingSession({ id: 'historical-staff-scope', teamId: team.id, date: input.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal', status: 'completed', assignedStaffPersonIds: [staffId] })
  const initial = createGameWorld({ ...input, scheduledTrainingSessionsById: { [session.id]: session } })
  expect(() => withSingleWorldValidation(initial, world => updateGameWorld(world, { staffEmploymentByStaffId: { [staffId]: { status: 'unemployed' } } }), { validationMode })).toThrow('not actively assigned')
  const event = { id: 'scope-bad-evidence', sourceType: 'match' as const, sourceId: input.games[0]!.id, date: input.currentDate, playerId: input.players[0]!.id, byRating: { stamina: 0.1 } }
  expect(() => withSingleWorldValidation(initial, world => updateGameWorldBatch(world, (current, update) => update(update(current, { currentDate: addDays(current.currentDate, 1) }), { developmentStimulusEventAdditions: [event] })), { validationMode })).toThrow('does not match completed Match')
})
