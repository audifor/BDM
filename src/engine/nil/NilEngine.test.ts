import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { acceptNilOpportunity, createNilOpportunity, ensureNcaaNil, marketabilityForPlayer, nilRecruitingAppeal, progressAiNil } from './NilEngine'

describe('NIL and collectives', () => {
  it('initializes deterministic NCAA-only profiles and collectives', () => { const world = createNewGame(), again = ensureNcaaNil(world); expect(again).toBe(world); expect(Object.values(world.nilProfilesById).every((p) => world.ecosystems[p.ecosystemId]!.kind === 'ncaaLike')).toBe(true); expect(Object.values(world.collectivesById)).not.toHaveLength(0); const profile = Object.values(world.nilProfilesById)[0]!; expect(marketabilityForPlayer(world, profile.playerId)).toBe(profile.marketability) })
  it('creates, accepts and closes NIL deals without salary contracts or payroll state', () => { const world = createNewGame(), profile = Object.values(world.nilProfilesById)[0]!, beforeContracts = Object.keys(world.contractsById); const created = createNilOpportunity(world, profile.playerId); expect(created.ok).toBe(true); if (!created.ok) return; const accepted = acceptNilOpportunity(created.value, Object.keys(created.value.nilOpportunitiesById)[0]!); expect(accepted.ok).toBe(true); if (!accepted.ok) return; expect(Object.values(accepted.value.nilDealsById)).toHaveLength(1); expect(Object.keys(accepted.value.contractsById)).toEqual(beforeContracts) })
  it('consumes collective resources and respects recruiting appeal configuration', () => { const world = createNewGame(), profile = Object.values(world.nilProfilesById)[0]!, collective = Object.values(world.collectivesById).find((c) => c.programTeamId === profile.programTeamId)!; const created = createNilOpportunity(world, profile.playerId, 'collectiveBacked', collective.id); expect(created.ok).toBe(true); if (!created.ok) return; const accepted = acceptNilOpportunity(created.value, Object.keys(created.value.nilOpportunitiesById)[0]!); expect(accepted.ok).toBe(true); if (!accepted.ok) return; expect(accepted.value.collectivesById[collective.id]!.resourcesRemaining).toBeLessThan(collective.resourcesRemaining); const configured = updateGameWorld(accepted.value, { nilRulesByEcosystemId: { ...accepted.value.nilRulesByEcosystemId, [profile.ecosystemId]: { ...accepted.value.nilRulesByEcosystemId[profile.ecosystemId]!, recruitingAppealFactor: 10 } } }); expect(nilRecruitingAppeal(configured, profile.programTeamId, profile.ecosystemId)).toBeGreaterThan(0) })
})


it('preserves every monthly NIL record and ordinal across failed creation and failed acceptance', () => {
  let world = createNewGame()
  const profiles = Object.values(world.nilProfilesById)
  world = updateGameWorld(world, {
    nilRulesByEcosystemId: { ...world.nilRulesByEcosystemId, [profiles[0]!.ecosystemId]: { ...world.nilRulesByEcosystemId[profiles[0]!.ecosystemId]!, enabled: false } },
    collectives: Object.values(world.collectivesById).map(item => ({ ...item, resourcesRemaining: 0 })),
  })
  const once = progressAiNil(world)
  expect(once).toEqual(referenceAiNil(world))
  expect(progressAiNil(once)).toEqual(referenceAiNil(once))
  expect(Object.values(once.nilOpportunitiesById).some(item => item.status === 'available')).toBe(true)
  expect(Object.keys(world.nilOpportunitiesById)).toEqual([])
})

function referenceAiNil(input: ReturnType<typeof createNewGame>) {
  let current = input
  const userTeam = Object.values(input.teams).find(item => item.coachId === input.userCoachId)?.id
  for (const profile of Object.values(input.nilProfilesById).filter(item => item.programTeamId !== userTeam).sort((a,b) => b.marketability-a.marketability || a.playerId.localeCompare(b.playerId))) {
    const collective = Object.values(current.collectivesById).find(item => item.programTeamId === profile.programTeamId)
    const created = createNilOpportunity(current, profile.playerId, collective ? 'collectiveBacked' : 'localEndorsement', collective?.id)
    if (created.ok) {
      const id = Object.values(created.value.nilOpportunitiesById).at(-1)!.id
      const accepted = acceptNilOpportunity(created.value,id)
      current = accepted.ok ? accepted.value : created.value
    }
  }
  return current
}

it('keeps ordered monthly acceptance, active-deal limits and input immutability equivalent to per-command publication', () => {
  const base = createNewGame()
  const world = updateGameWorld(base, { nilProfiles: Object.values(base.nilProfilesById).slice(0,3), collectives: Object.values(base.collectivesById).map(item => ({ ...item, resourceCapacity: 10_000, resourcesRemaining: 10_000 })) })
  const before = Object.values(world.collectivesById).map(item => ({ ...item }))
  const once = progressAiNil(world)
  expect(once).toEqual(referenceAiNil(world))
  expect(Object.keys(once.nilDealsById).length).toBeGreaterThan(0)
  const twice = progressAiNil(once)
  expect(twice).toEqual(referenceAiNil(once))
  const limited = progressAiNil(twice)
  expect(limited).toEqual(referenceAiNil(twice))
  expect(Object.keys(limited.nilDealsById)).toEqual(Object.keys(twice.nilDealsById))
  expect(Object.values(limited.nilOpportunitiesById).some(item => item.status === 'available')).toBe(true)
  expect(Object.values(world.collectivesById)).toEqual(before)
  expect(Object.keys(world.nilOpportunitiesById)).toEqual([])
  expect(Object.keys(world.nilDealsById)).toEqual([])
})


it('rejects a sparse ledger opportunity collision without overwriting historical records', () => {
  const base = createNewGame(), profile = Object.values(base.nilProfilesById)[0]!
  const collective = Object.values(base.collectivesById).find(item => item.programTeamId === profile.programTeamId)!
  const created = createNilOpportunity(base,profile.playerId,'collectiveBacked',collective.id)
  if (!created.ok) throw new Error(created.reason)
  const first = created.value.nilOpportunitiesById[created.opportunityId]!
  const existing = { ...first, id: first.id.replace(/:1$/,':2') }
  const world = updateGameWorld(base,{ nilProfiles: [profile], nilOpportunities: [existing] })
  const message = `Duplicate nilOpportunities ID: ${existing.id}`
  expect(() => referenceAiNil(world)).toThrow(message)
  expect(() => progressAiNil(world)).toThrow(message)
  expect(Object.values(world.nilOpportunitiesById)).toEqual([existing])
})

it('rejects a pre-existing deal ID collision without publishing staged changes', () => {
  const base = createNewGame(), profile = Object.values(base.nilProfilesById)[0]!
  const collective = Object.values(base.collectivesById).find(item => item.programTeamId === profile.programTeamId)!
  const created = createNilOpportunity(base,profile.playerId,'collectiveBacked',collective.id)
  if (!created.ok) throw new Error(created.reason)
  const accepted = acceptNilOpportunity(created.value,created.opportunityId)
  if (!accepted.ok) throw new Error(accepted.reason)
  const deal = Object.values(accepted.value.nilDealsById)[0]!
  const existing = { ...deal, id: deal.id.replace(/:1$/,':2') }
  const world = updateGameWorld(accepted.value,{ nilProfiles: [profile], nilDeals: [existing] })
  const before = Object.values(world.nilOpportunitiesById)
  const message = `Duplicate nilDeals ID: ${existing.id}`
  expect(() => referenceAiNil(world)).toThrow(message)
  expect(() => progressAiNil(world)).toThrow(message)
  expect(Object.values(world.nilDealsById)).toEqual([existing])
  expect(Object.values(world.nilOpportunitiesById)).toEqual(before)
})
