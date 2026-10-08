import { expect, it } from 'vitest'
import type { GameWorld } from '@/domain/world'
import { parseGameDate } from '@/domain/date'
import { documentedNcaaExits } from './NcaaExitAccounting'

function fixture() {
  const enrollment = { id: 'enrollment', playerId: 'player', teamId: 'team', ecosystemId: 'ncaa', startsOn: '2032-10-01', status: 'active' }
  const baseline = { currentDate: '2039-10-01', playerEnrollmentsById: { enrollment }, teams: { team: { rosterPlayerIds: ['player'] } } } as unknown as GameWorld
  const world = { ecosystems: { ncaa: { kind: 'ncaaLike' } }, playerEnrollmentsById: { enrollment: { ...enrollment, status: 'ended', endsOn: '2042-07-01' } }, collegeEligibilityAssessmentsById: {}, ecosystemTransitionsById: {}, playerTransactionsById: {}, players: { player: { careerEnd: { endedOn: '2042-07-01' } } } } as unknown as GameWorld
  return { baseline, world }
}
it('counts a source-confirmed legacy membership ending with the actual career exit', () => {
  const { world, baseline } = fixture()
  expect(documentedNcaaExits(world, baseline)).toEqual([{ enrollmentId: 'enrollment', playerId: 'player', endedOn: '2042-07-01', evidence: 'sourceMembershipAndExit' }])
})
it('counts an assessed admission without requiring startup membership', () => {
  const { world, baseline } = fixture()
  const assessed = { ...world, collegeEligibilityAssessmentsById: { assessment: { eligible: true, evidence: { enrollmentId: 'enrollment' } } } } as unknown as GameWorld
  expect(documentedNcaaExits(assessed, { ...baseline, teams: {} })).toHaveLength(1)
})
it('excludes immediate rejected admissions', () => {
  const { world, baseline } = fixture()
  const rejected = { ...world, playerEnrollmentsById: { enrollment: { ...world.playerEnrollmentsById.enrollment!, startsOn: parseGameDate('2042-07-01') } } }
  expect(documentedNcaaExits(rejected, baseline)).toEqual([])
})
it('requires membership and a matching exit event rather than inferring an admission', () => {
  const { world, baseline } = fixture()
  expect(() => documentedNcaaExits(world, { ...baseline, teams: {} })).toThrow('Unproven legacy NCAA membership')
  expect(() => documentedNcaaExits({ ...world, players: {} }, baseline)).toThrow('Unproven legacy NCAA exit')
})
it('rejects an enrollment that outlasts a documented departure', () => {
  const { world, baseline } = fixture()
  const stale = { ...world, ecosystemTransitionsById: { transition: { playerId: 'player', fromTeamId: 'team', fromEcosystemId: 'ncaa', effectiveDate: '2041-07-01' } } } as unknown as GameWorld
  expect(() => documentedNcaaExits(stale, baseline)).toThrow('outlasted its departure')
})
