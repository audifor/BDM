import { expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { playerIdFromString } from '@/domain/ids'
import { createGameWorld, updateGameWorld } from './GameWorld'
import { createValidGameWorldInput } from './testFixtures'

it('preserves immutable scouting knowledge across unrelated updates and validates replacements and new links', () => {
  const base = createGameWorld(createValidGameWorldInput())
  const team = Object.values(base.teams)[0]!
  const record = { organizationId: team.organizationId, subjectPlayerId: team.rosterPlayerIds[0]!, dimensions: { shooting: { coverage: 0.6, confidence: 0.7, assessedAt: base.currentDate, provenance: 'scoutReport' as const, estimate: 65, evidenceIds: ['evidence:old-a', 'evidence:old-b'] } } }
  const world = updateGameWorld(base, { organizationKnowledge: [record] })
  const next = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
  expect(next.organizationKnowledge).toBe(world.organizationKnowledge)
  expect(next.organizationKnowledge[0]).toEqual(record)
  const replacement = { ...record, dimensions: { shooting: { ...record.dimensions.shooting, confidence: 0.8 } } }
  expect(updateGameWorld(next, { organizationKnowledge: [replacement] }).organizationKnowledge[0]).toEqual(replacement)
  expect(() => updateGameWorld(next, { organizationKnowledge: [{ ...replacement, dimensions: { shooting: { ...replacement.dimensions.shooting, coverage: -1 } } }] })).toThrow('Organization knowledge finding is invalid')
  expect(() => updateGameWorld(next, { organizationKnowledge: [...next.organizationKnowledge, { ...record, subjectPlayerId: playerIdFromString('missing-scouted-player') }] })).toThrow('Organization knowledge subject Player')
})
