import { expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { updateGameWorld } from '@/domain/world'
import { parseGameDate } from '@/domain/date'
import { createTalentCohort } from '@/domain/talent'
import { generateRecruitingPool, discoverRecruitingTalentCandidate } from './RecruitingEngine'
import { materializeTalentCandidate } from '@/engine/world/TalentSupply'
import { endPlayerCareer } from '@/engine/career/PlayerCareerLifecycle'

it('uses newer annual birth cohorts ahead of an unexhausted old cohort for pool and discovery', () => {
  const base = createNewGame({ seed: 15015 })
  const source = Object.values(base.talentCohortsById)[0]!
  const cycle = Object.values(base.recruitingCyclesById).find(item => base.ecosystems[item.ecosystemId]?.category === 'men')!
  const old = createTalentCohort({ ...source, id: 'aaa-old-supply', gender: 'male', birthYear: 2014, generationYear: 2032 })
  const recent = createTalentCohort({ ...source, id: 'zzz-recent-supply', gender: 'male', birthYear: 2019, generationYear: 2037 })
  let world = updateGameWorld(base, { currentDate: parseGameDate('2037-10-01'), talentCohorts: [old, recent], recruitProfiles: [], recruitingCycles: Object.values(base.recruitingCyclesById).map(item => item.id === cycle.id ? { ...item, status: 'open' as const } : item) })
  const retired = materializeTalentCandidate(world, old.id, 1, 'RECRUITING_POOL')
  world = endPlayerCareer(retired.world, retired.player.id)
  const supplied = generateRecruitingPool(world, cycle.id)
  const profiles = Object.values(supplied.recruitProfilesById).filter(item => item.cycleId === cycle.id)
  expect(profiles.length).toBeGreaterThan(0)
  expect(profiles.some(item => item.playerId === retired.player.id)).toBe(false)
  expect(profiles.every(item => supplied.players[item.playerId]!.bio.dateOfBirth.startsWith('2019-'))).toBe(true)
  const discovered = discoverRecruitingTalentCandidate(world, cycle.id)
  expect(discovered.ok).toBe(true)
  if (discovered.ok) {
    const fresh = Object.values(discovered.value.recruitProfilesById).find(item => item.cycleId === cycle.id)!
    expect(discovered.value.players[fresh.playerId]!.bio.dateOfBirth.startsWith('2019-')).toBe(true)
  }
  expect(world.players[retired.player.id]!.bio.dateOfBirth).toBe(retired.player.bio.dateOfBirth)
}, 60_000)
