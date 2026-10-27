import { expect, it } from 'vitest'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { worldDbV2ConnectionBlockers, worldDbV2FamilySignature } from './WorldDbV2Connection'
import additional from '@/data/worlddb-v2/additional-formats.json'

it('checks format contracts by data and does not silently turn fixed schedules into round robins', () => {
  const format = parseWorldCompetitionFormatDocument(additional[0])
  expect(worldDbV2ConnectionBlockers(format, 20)).toEqual([])
  const regular = format.variants[0]!.nodes[0]!
  const fixed = { ...format, variants: [{ ...format.variants[0]!, nodes: [{ ...regular, pairing: { ...regular.pairing!, type: 'FIXED_SCHEDULE' as const } }] }] }
  expect(worldDbV2ConnectionBlockers(fixed, 20).join(' ')).toContain('do not substitute ROUND_ROBIN')
  expect(worldDbV2ConnectionBlockers({ ...format, status: 'PARTIAL' }, 18).join(' ')).toMatch(/PARTIAL.*20 participants, PBM supplies 18/)
})
it('keeps group assignment and per-edition population mismatches explicit', () => {
  const format = parseWorldCompetitionFormatDocument(additional[0])
  const grouped = { ...format, variants: [{ ...format.variants[0]!, nodes: [format.variants[0]!.nodes[0]!, { ...format.variants[0]!.nodes[0]!, key: 'GROUP_B' }] }] }
  expect(worldDbV2ConnectionBlockers(grouped, 20).join(' ')).toContain('group/conference assignments')
})
it('groups execution capabilities independently of league identity and team count', () => {
  const format = parseWorldCompetitionFormatDocument(additional[0])
  expect(worldDbV2FamilySignature({ ...format, competitionId: 'another league', competitionSeasonId: 'another edition' })).toBe(worldDbV2FamilySignature(format))
  expect(worldDbV2FamilySignature(format)).toContain('bracket:ordinal-outcomes')
  expect(worldDbV2FamilySignature(format)).toContain('classification:CLASSIFICATION_POINTS_MINILEAGUE_2_1_V1')
})
it('does not borrow default tie-breaks for a new document without a linked classification policy', () => {
  const format = parseWorldCompetitionFormatDocument(additional[0])
  const unbound = { ...format, variants: [{ ...format.variants[0]!, seeding: undefined }] }
  expect(worldDbV2ConnectionBlockers(unbound, 20).join(' ')).toContain('does not authorize substituting default tie-breaks')
  expect(worldDbV2ConnectionBlockers(unbound, 20, true)).toEqual([])
})
