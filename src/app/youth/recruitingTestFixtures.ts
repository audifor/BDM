import { addDays } from '@/domain/date'
import { defaultRecruitingRules } from '@/domain/recruiting'
import { createFacilityUsageRight } from '@/domain/facilities'
import { updateGameWorld } from '@/domain/world'
import { youthFacilitiesFixture } from '@/app/youth/testFixtures'
import { materializeRecruitingTalentCandidate } from '@/engine/recruiting/RecruitingEngine'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
const save = (world: Parameters<typeof serializeGameWorldV4>[0]) => serializeGameWorldV4(world, '2032-10-01T00:00:00.000Z')
export function demonstrationFixture(ncaa = false) {
  const fixture = youthFacilitiesFixture()
  const ecosystemId = Object.values(fixture.world.ecosystems)[0]!.id
  let world = updateGameWorld(fixture.world, {
    ...(ncaa ? { ecosystems: Object.values(fixture.world.ecosystems).map(ecosystem => ecosystem.id === ecosystemId ? { ...ecosystem, kind: 'ncaaLike' as const, category: 'women' as const } : ecosystem) } : {}),
    recruitingCycles: [{ id: 't1:cycle', ecosystemId, sourceSeasonId: Object.values(fixture.world.seasons)[0]!.id, targetSeasonId: Object.values(fixture.world.seasons)[0]!.id,
      opensOn: fixture.world.currentDate, signingOn: addDays(fixture.world.currentDate, 40), closesOn: addDays(fixture.world.currentDate, 60), status: 'open', rules: defaultRecruitingRules,
      calendar: { version: 't1-test-v1', source: 'Explicit fixture', authority: 'testFixture', maximumOfficialVisitLodgingNights: 2,
        windows: [{ startsOn: fixture.world.currentDate, endsOn: addDays(fixture.world.currentDate, 60), period: 'contact' }] } }],
    facilityUsageRights: Object.values(fixture.world.facilityUsageRightsById).map(right => createFacilityUsageRight({ ...right, ...(right.teamId === fixture.youth.id ? { teamId: fixture.senior.id } : {}) })),
  })
  const result = materializeRecruitingTalentCandidate(world, 't1:cycle', 't:cohort', 2)
  if (!result.ok) throw new Error(result.reason)
  world = deserializeGameWorldV4(save(result.value))
  const recruit = Object.values(world.recruitProfilesById)[0]!
  return { ...fixture, world, recruit, selection: { componentId: fixture.component.id, capability: 'BASKETBALL_TRAINING' } as const }
}
