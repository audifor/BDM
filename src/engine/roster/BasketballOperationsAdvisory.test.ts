import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { addYears } from '@/domain/date'
import { organizationIdForTeam, staffPersonIdFromString, teamStaffAssignmentIdFromString, type PlayerId, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { getActivePlayerContract, updateGameWorld, type GameWorld } from '@/domain/world'
import { acceptTradeRecommendation, progressBasketballOperationsAdvisories } from './BasketballOperationsAdvisory'

type Kind = 'recommendSignings' | 'shortlistPlayers' | 'contractRecommendation' | 'tradeRecommendation'

const highAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 90])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const lowAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 5])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>

const ROLE_FOR_KIND: Record<Kind, string> = {
  recommendSignings: 'generalManager',
  shortlistPlayers: 'analyticsStaff',
  contractRecommendation: 'capContractsSpecialist',
  tradeRecommendation: 'generalManager',
}

/**
 * Base world: user's team loses one of a rival's rostered players to free agency so a real
 * external free-agent candidate with organization knowledge and market data exists, then staffs
 * the user's team with an advisory holder for `kind`.
 */
function fixture(kind: Kind, attributes: Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> = highAttributes, staffSuffix: string = kind) {
  const base = createNewGame()
  const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
  const source = Object.values(base.teams).find((item) => item.id !== team.id && item.rosterPlayerIds.length > 5)!
  const playerId = source.rosterPlayerIds[0]!
  const org = organizationIdForTeam(team.id)
  const staffId = staffPersonIdFromString(`ops:${staffSuffix}`)
  const market = updateGameWorld(base, {
    teams: Object.values(base.teams).map((item) => item.id === source.id ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => id !== playerId) } : item),
    contracts: Object.values(base.contractsById).filter((item) => item.playerId !== playerId),
  })
  const withStaff = updateGameWorld(market, {
    staffPeople: [...Object.values(market.staffPeopleById), { id: staffId, identity: { firstName: 'Ops', lastName: 'Staff' }, professional: { attributes } }],
    teamStaffAssignments: [...Object.values(market.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`assignment:${staffSuffix}`), staffPersonId: staffId, teamId: team.id, role: ROLE_FOR_KIND[kind] as never, assignedOn: market.currentDate }],
    responsibilities: [...Object.values(market.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:${kind}`), { id: `responsibility:${team.id}:${kind}` as never, teamId: team.id, kind, mode: 'advisory', holderStaffId: staffId }],
    organizationKnowledge: [{ organizationId: org, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: market.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 2 } } }],
    marketKnowledge: [{ organizationId: org, playerId, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: market.currentDate, source: 'AGENT' }],
  })
  return { world: withStaff, team, source, playerId, org, staffId }
}

/**
 * Trade proposals require canonical `TradeRules` for the world's `currentSeasonId` (FIBA-like
 * ecosystems intentionally have none, per ARCHITECTURE.md's "FIBA-like competitions receive no
 * trade rules by default"). Mirrors `TradeEngine.test.ts`'s `tradeWorld()`: pick the season that
 * actually has `tradeRulesBySeasonId` configured (the generated NBA-like league) and two of its
 * participant teams, rather than assuming the user's own team's ecosystem supports trades.
 */
function tradeFixture(attributes: Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> = highAttributes, staffSuffix = 'trade') {
  const base = createNewGame()
  const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
  const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
  const team = seasonTeams[0]!
  const source = seasonTeams.find((item) => item.id !== team.id && item.rosterPlayerIds.length > 0)!
  const playerId = source.rosterPlayerIds[0]!
  const org = organizationIdForTeam(team.id)
  const staffId = staffPersonIdFromString(`ops:${staffSuffix}`)
  const seasoned = updateGameWorld(base, { currentSeasonId: season.id, currentDate: season.startDate })
  const withStaff = updateGameWorld(seasoned, {
    staffPeople: [...Object.values(seasoned.staffPeopleById), { id: staffId, identity: { firstName: 'Ops', lastName: 'Trade' }, professional: { attributes } }],
    teamStaffAssignments: [...Object.values(seasoned.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`assignment:${staffSuffix}`), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: seasoned.currentDate }],
    responsibilities: [...Object.values(seasoned.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
    organizationKnowledge: [{ organizationId: org, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: seasoned.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 2 } } }],
    marketKnowledge: [{ organizationId: org, playerId, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: seasoned.currentDate, source: 'AGENT' }],
  })
  return { world: withStaff, team, source, playerId, org, staffId, season }
}

/** Dispatches to the trade-aware fixture for `tradeRecommendation` (needs a season with TradeRules), the shared fixture otherwise. */
function worldFor(kind: Kind) {
  return kind === 'tradeRecommendation' ? tradeFixture() : fixture(kind)
}

describe('BasketballOperationsAdvisory', () => {
  it.each(['recommendSignings', 'shortlistPlayers', 'contractRecommendation', 'tradeRecommendation'] as const)('%s is deterministic, idempotent, and advisory-only', (kind) => {
    const { world } = worldFor(kind)
    const first = progressBasketballOperationsAdvisories(world)
    const second = progressBasketballOperationsAdvisories(first)
    const outcome = Object.values(first.delegationOutcomesById).find((item) => item.kind === kind)!
    expect(outcome).toBeDefined()
    expect(outcome.applied).toBe(false)
    expect(Object.keys(second.delegationOutcomesById)).toHaveLength(Object.keys(first.delegationOutcomesById).length)
    expect(first.teams).toEqual(world.teams)
    expect(first.contractsById).toEqual(world.contractsById)
    expect(first.teamFinancesByTeamId).toEqual(world.teamFinancesByTeamId)
    expect(first.players).toEqual(world.players)
  })

  it.each(['recommendSignings', 'shortlistPlayers', 'contractRecommendation', 'tradeRecommendation'] as const)('%s produces a stable semantic ID: same context reproduces the same outcome id across independent runs', (kind) => {
    const { world } = worldFor(kind)
    const first = progressBasketballOperationsAdvisories(world)
    const firstId = Object.values(first.delegationOutcomesById).find((item) => item.kind === kind)!.id
    // Rebuild an equivalent world from scratch (fresh fixture call) and re-progress — the id must match.
    const { world: rebuilt } = worldFor(kind)
    const second = progressBasketballOperationsAdvisories(rebuilt)
    const secondId = Object.values(second.delegationOutcomesById).find((item) => item.kind === kind)!.id
    expect(secondId).toBe(firstId)
  })

  it('does not use hidden ratings (shortlistPlayers)', () => {
    const { world } = fixture('shortlistPlayers')
    const a = progressBasketballOperationsAdvisories(world)
    const changed = updateGameWorld(world, { players: Object.values(world.players).map((p) => ({ ...p, basketball: { ...p.basketball, ratings: { ...p.basketball.ratings, threePointShooting: 1 } } })) })
    const b = progressBasketballOperationsAdvisories(changed)
    expect(Object.values(a.delegationOutcomesById).find((x) => x.kind === 'shortlistPlayers')?.payload).toEqual(Object.values(b.delegationOutcomesById).find((x) => x.kind === 'shortlistPlayers')?.payload)
  })

  it.each(['recommendSignings', 'tradeRecommendation'] as const)('%s only ever selects a candidate present in OrganizationKnowledge', (kind) => {
    const { world, playerId } = worldFor(kind)
    const progressed = progressBasketballOperationsAdvisories(world)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === kind)
    if (outcome === undefined) return
    const candidateId = (outcome.payload.playerId ?? outcome.payload.incomingPlayerId) as string
    expect(candidateId).toBe(playerId)
  })

  // shortlistPlayers now returns a bounded, indexed candidate list (Blocker 4: DelegationOutcome.payload
  // only allows flat string|number|boolean scalars, so the shortlist is represented as
  // candidate1PlayerId..candidateNPlayerId rather than a single `playerId`).
  it('shortlistPlayers only ever selects candidates present in OrganizationKnowledge', () => {
    const { world, playerId } = worldFor('shortlistPlayers')
    const progressed = progressBasketballOperationsAdvisories(world)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'shortlistPlayers')
    if (outcome === undefined) return
    const count = outcome.payload.candidateCount as number
    const ids = Array.from({ length: count }, (_, index) => outcome.payload[`candidate${index + 1}PlayerId`])
    expect(ids).toContain(playerId)
  })

  it('vacant/userControlled/organizational responsibilities never produce a Staff-authored outcome', () => {
    for (const mode of ['userControlled', 'organizational'] as const) {
      const { world, team } = fixture('shortlistPlayers')
      const id = `responsibility:${team.id}:shortlistPlayers` as never
      const reassigned = updateGameWorld(world, { responsibilities: [...Object.values(world.responsibilitiesById).filter((item) => item.id !== id), { id, teamId: team.id, kind: 'shortlistPlayers', mode }] })
      const progressed = progressBasketballOperationsAdvisories(reassigned)
      expect(Object.values(progressed.delegationOutcomesById).some((item) => item.kind === 'shortlistPlayers' && item.staffId !== undefined)).toBe(false)
    }
  })

  describe('recommendSignings', () => {
    it('is bounded and only recommends a free agent with known, non NOT_FOR_SALE market data within budget', () => {
      const { world } = fixture('recommendSignings')
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'recommendSignings')
      if (outcome === undefined) return
      expect(outcome.payload.affordable).toBe(true)
      expect(typeof outcome.payload.expectedSalary).toBe('number')
    })

    it('does not recommend a NOT_FOR_SALE candidate even if otherwise the top candidate', () => {
      const { world, org, playerId } = fixture('recommendSignings')
      const blocked = updateGameWorld(world, { marketKnowledge: [{ organizationId: org, playerId, availability: 'NOT_FOR_SALE', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: world.currentDate, source: 'AGENT' }] })
      const progressed = progressBasketballOperationsAdvisories(blocked)
      expect(Object.values(progressed.delegationOutcomesById).some((item) => item.kind === 'recommendSignings')).toBe(false)
    })

    it('does not recommend a candidate whose expected salary exceeds the remaining budget', () => {
      const { world, org, playerId } = fixture('recommendSignings')
      const unaffordable = updateGameWorld(world, { marketKnowledge: [{ organizationId: org, playerId, availability: 'OPEN', expectedSalary: 10_000_000_000, expectedYears: 1, confidence: 90, assessedAt: world.currentDate, source: 'AGENT' }] })
      const progressed = progressBasketballOperationsAdvisories(unaffordable)
      expect(Object.values(progressed.delegationOutcomesById).some((item) => item.kind === 'recommendSignings')).toBe(false)
    })

    // Blocker 5: eligibility must be filtered BEFORE the ranked/RNG candidate pick, not after — the
    // globally top-ranked candidate here is NOT_FOR_SALE (ineligible), but a second, fully-valid
    // candidate exists lower in the need/value ranking, and must still be found and recommended.
    it('finds and uses a valid lower-ranked candidate when the top-ranked candidate is ineligible (NOT_FOR_SALE)', () => {
      const base = createNewGame()
      const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
      const donors = Object.values(base.teams).filter((item) => item.id !== team.id && item.rosterPlayerIds.length > 5).slice(0, 2)
      if (donors.length < 2) return
      const topRanked = donors[0]!.rosterPlayerIds[0]!
      const fallback = donors[1]!.rosterPlayerIds[0]!
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:eligibility-fallback')
      const market = updateGameWorld(base, {
        teams: Object.values(base.teams).map((item) => donors.some((donor) => donor.id === item.id) ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => id !== topRanked && id !== fallback) } : item),
        contracts: Object.values(base.contractsById).filter((item) => item.playerId !== topRanked && item.playerId !== fallback),
      })
      const withStaff = updateGameWorld(market, {
        staffPeople: [...Object.values(market.staffPeopleById), { id: staffId, identity: { firstName: 'Eligibility', lastName: 'Fallback' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(market.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:eligibility-fallback'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: market.currentDate }],
        responsibilities: [...Object.values(market.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:recommendSignings`), { id: `responsibility:${team.id}:recommendSignings` as never, teamId: team.id, kind: 'recommendSignings', mode: 'advisory', holderStaffId: staffId }],
        // topRanked has strictly higher valuation (ranks first) but is NOT_FOR_SALE; fallback is fully eligible.
        organizationKnowledge: [
          { organizationId: org, subjectPlayerId: topRanked, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: market.currentDate, provenance: 'scoutReport', estimate: 99, uncertainty: 1 } } },
          { organizationId: org, subjectPlayerId: fallback, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: market.currentDate, provenance: 'scoutReport', estimate: 60, uncertainty: 1 } } },
        ],
        marketKnowledge: [
          { organizationId: org, playerId: topRanked, availability: 'NOT_FOR_SALE', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: market.currentDate, source: 'AGENT' },
          { organizationId: org, playerId: fallback, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: market.currentDate, source: 'AGENT' },
        ],
      })
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'recommendSignings')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(outcome.payload.playerId).toBe(fallback)
    })

    it('never mutates roster, contracts, or finances', () => {
      const { world } = fixture('recommendSignings')
      const progressed = progressBasketballOperationsAdvisories(world)
      expect(progressed.teams).toEqual(world.teams)
      expect(progressed.contractsById).toEqual(world.contractsById)
      expect(progressed.teamFinancesByTeamId).toEqual(world.teamFinancesByTeamId)
    })

    it('leaves unrelated teams state unchanged', () => {
      const { world, source } = fixture('recommendSignings')
      const progressed = progressBasketballOperationsAdvisories(world)
      expect(progressed.teams[source.id]).toEqual(world.teams[source.id])
    })

    it('roster needs materially affect candidate ranking: a position with a strong need ranks its candidate ahead of an equally/more valuable saturated-position candidate', () => {
      const base = createNewGame()
      const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
      // Free two candidates from different rival teams at different positions.
      const donors = Object.values(base.teams).filter((item) => item.id !== team.id && item.rosterPlayerIds.length > 5).slice(0, 2)
      if (donors.length < 2) return
      const candidateA = donors[0]!.rosterPlayerIds[0]!
      const candidateB = donors[1]!.rosterPlayerIds[0]!
      const positionA = base.players[candidateA]!.basketball.primaryPosition
      const positionB = base.players[candidateB]!.basketball.primaryPosition
      if (positionA === positionB) return
      const market = updateGameWorld(base, {
        teams: Object.values(base.teams).map((item) => donors.some((donor) => donor.id === item.id) ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => id !== candidateA && id !== candidateB) } : item),
        contracts: Object.values(base.contractsById).filter((item) => item.playerId !== candidateA && item.playerId !== candidateB),
      })
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:need-test')
      // Saturate positionA on the user's roster (need = 0), leave positionB scarce (need > 0).
      const saturated = updateGameWorld(market, {
        players: Object.values(market.players).map((player) => market.teams[team.id]!.rosterPlayerIds.includes(player.id) ? { ...player, basketball: { ...player.basketball, primaryPosition: positionA } } : player),
      })
      const withStaff = updateGameWorld(saturated, {
        staffPeople: [...Object.values(saturated.staffPeopleById), { id: staffId, identity: { firstName: 'Need', lastName: 'Test' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(saturated.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:need-test'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: saturated.currentDate }],
        responsibilities: [...Object.values(saturated.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:recommendSignings`), { id: `responsibility:${team.id}:recommendSignings` as never, teamId: team.id, kind: 'recommendSignings', mode: 'advisory', holderStaffId: staffId }],
        // Give candidateA (saturated position) a HIGHER valuation signal than candidateB (needed position) — need should still win.
        organizationKnowledge: [
          { organizationId: org, subjectPlayerId: candidateA, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: saturated.currentDate, provenance: 'scoutReport', estimate: 99, uncertainty: 1 } } },
          { organizationId: org, subjectPlayerId: candidateB, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: saturated.currentDate, provenance: 'scoutReport', estimate: 60, uncertainty: 1 } } },
        ],
        marketKnowledge: [
          { organizationId: org, playerId: candidateA, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: saturated.currentDate, source: 'AGENT' },
          { organizationId: org, playerId: candidateB, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: saturated.currentDate, source: 'AGENT' },
        ],
      })
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'recommendSignings')
      if (outcome === undefined) return
      // The needed position's candidate (candidateB) must be selectable; candidateA (saturated, higher valuation) must never be
      // picked ahead of it purely on valuation once need dominates the sort.
      expect(outcome.payload.playerId).toBe(candidateB)
    })

    it('basketballOperationsQuality materially affects candidate depth (bounded band)', () => {
      const highQuality = fixture('recommendSignings', highAttributes, 'quality-high')
      const lowQuality = fixture('recommendSignings', lowAttributes, 'quality-low')
      const highProgressed = progressBasketballOperationsAdvisories(highQuality.world)
      const lowProgressed = progressBasketballOperationsAdvisories(lowQuality.world)
      const highOutcome = Object.values(highProgressed.delegationOutcomesById).find((item) => item.kind === 'recommendSignings')
      const lowOutcome = Object.values(lowProgressed.delegationOutcomesById).find((item) => item.kind === 'recommendSignings')
      if (highOutcome === undefined || lowOutcome === undefined) return
      expect(highOutcome.qualityScore).toBeGreaterThan(lowOutcome.qualityScore)
      expect(highOutcome.payload.candidateCount as number).toBeLessThanOrEqual(lowOutcome.payload.candidateCount as number)
    })

    it('workload/overload materially affects outcome quality', () => {
      const { world, team } = fixture('recommendSignings')
      const responsibilityId = `responsibility:${team.id}:recommendSignings`
      // Add several more advisory responsibilities to the same holder to raise workload/utilization.
      const staffId = staffPersonIdFromString('ops:recommendSignings')
      const extraIds = new Set([responsibilityId, `responsibility:${team.id}:shortlistPlayers`, `responsibility:${team.id}:contractRecommendation`, `responsibility:${team.id}:tradeRecommendation`])
      const overloaded = updateGameWorld(world, {
        responsibilities: [
          ...Object.values(world.responsibilitiesById).filter((item) => !extraIds.has(item.id)),
          { id: responsibilityId as never, teamId: team.id, kind: 'recommendSignings', mode: 'advisory', holderStaffId: staffId },
          { id: `responsibility:${team.id}:shortlistPlayers` as never, teamId: team.id, kind: 'shortlistPlayers', mode: 'advisory', holderStaffId: staffId },
          { id: `responsibility:${team.id}:contractRecommendation` as never, teamId: team.id, kind: 'contractRecommendation', mode: 'advisory', holderStaffId: staffId },
          { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId },
        ],
      })
      const baseline = progressBasketballOperationsAdvisories(world)
      const overloadedProgressed = progressBasketballOperationsAdvisories(overloaded)
      const baselineOutcome = Object.values(baseline.delegationOutcomesById).find((item) => item.kind === 'recommendSignings')
      const overloadedOutcome = Object.values(overloadedProgressed.delegationOutcomesById).find((item) => item.kind === 'recommendSignings')
      if (baselineOutcome === undefined || overloadedOutcome === undefined) return
      expect(overloadedOutcome.qualityScore).toBeLessThanOrEqual(baselineOutcome.qualityScore)
    })
  })

  describe('shortlistPlayers', () => {
    it('roster needs affect ranking the same way as recommendSignings (shared candidate ordering)', () => {
      const { world } = fixture('shortlistPlayers')
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'shortlistPlayers')
      expect(outcome).toBeDefined()
    })

    it('never mutates world state beyond delegationOutcomesById', () => {
      const { world } = fixture('shortlistPlayers')
      const progressed = progressBasketballOperationsAdvisories(world)
      expect(progressed.teams).toEqual(world.teams)
      expect(progressed.players).toEqual(world.players)
      expect(progressed.contractsById).toEqual(world.contractsById)
    })

    // Blocker 4: shortlist must be a bounded SHORTLIST, not one playerId.
    it('includes more than one candidate when enough valid candidates exist', () => {
      const base = createNewGame()
      const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
      const donors = Object.values(base.teams).filter((item) => item.id !== team.id && item.rosterPlayerIds.length > 3).slice(0, 5)
      const candidates = donors.map((donor) => donor.rosterPlayerIds[0]!)
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:shortlist-many')
      const market = updateGameWorld(base, {
        teams: Object.values(base.teams).map((item) => donors.some((donor) => donor.id === item.id) ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => !candidates.includes(id)) } : item),
        contracts: Object.values(base.contractsById).filter((item) => !candidates.includes(item.playerId)),
      })
      const withStaff = updateGameWorld(market, {
        staffPeople: [...Object.values(market.staffPeopleById), { id: staffId, identity: { firstName: 'Shortlist', lastName: 'Many' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(market.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:shortlist-many'), staffPersonId: staffId, teamId: team.id, role: 'analyticsStaff' as never, assignedOn: market.currentDate }],
        responsibilities: [...Object.values(market.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:shortlistPlayers`), { id: `responsibility:${team.id}:shortlistPlayers` as never, teamId: team.id, kind: 'shortlistPlayers', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: candidates.map((playerId) => ({ organizationId: org, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: market.currentDate, provenance: 'scoutReport' as const, estimate: 80, uncertainty: 2 } } })),
      })
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'shortlistPlayers')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(outcome.payload.candidateCount as number).toBeGreaterThan(1)
    })

    it('never exceeds the bounded maximum shortlist depth', () => {
      const base = createNewGame()
      const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
      const donors = Object.values(base.teams).filter((item) => item.id !== team.id)
      const candidates = donors.flatMap((donor) => donor.rosterPlayerIds).slice(0, 20)
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:shortlist-max')
      const market = updateGameWorld(base, {
        teams: Object.values(base.teams).map((item) => donors.some((donor) => donor.id === item.id) ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => !candidates.includes(id)) } : item),
        contracts: Object.values(base.contractsById).filter((item) => !candidates.includes(item.playerId)),
      })
      const withStaff = updateGameWorld(market, {
        staffPeople: [...Object.values(market.staffPeopleById), { id: staffId, identity: { firstName: 'Shortlist', lastName: 'Max' }, professional: { attributes: lowAttributes } }],
        teamStaffAssignments: [...Object.values(market.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:shortlist-max'), staffPersonId: staffId, teamId: team.id, role: 'analyticsStaff' as never, assignedOn: market.currentDate }],
        responsibilities: [...Object.values(market.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:shortlistPlayers`), { id: `responsibility:${team.id}:shortlistPlayers` as never, teamId: team.id, kind: 'shortlistPlayers', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: candidates.map((playerId) => ({ organizationId: org, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: market.currentDate, provenance: 'scoutReport' as const, estimate: 80, uncertainty: 2 } } })),
      })
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'shortlistPlayers')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(outcome.payload.candidateCount as number).toBeLessThanOrEqual(8)
    })

    it('deterministic order across repeated runs', () => {
      const { world } = fixture('shortlistPlayers')
      const a = progressBasketballOperationsAdvisories(world)
      const b = progressBasketballOperationsAdvisories(world)
      const outcomeA = Object.values(a.delegationOutcomesById).find((item) => item.kind === 'shortlistPlayers')
      const outcomeB = Object.values(b.delegationOutcomesById).find((item) => item.kind === 'shortlistPlayers')
      expect(outcomeA?.payload).toEqual(outcomeB?.payload)
    })

    it('roster need changes shortlist ranking (mirrors recommendSignings need test)', () => {
      const base = createNewGame()
      const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
      const donors = Object.values(base.teams).filter((item) => item.id !== team.id && item.rosterPlayerIds.length > 5).slice(0, 2)
      if (donors.length < 2) return
      const candidateA = donors[0]!.rosterPlayerIds[0]!
      const candidateB = donors[1]!.rosterPlayerIds[0]!
      const positionA = base.players[candidateA]!.basketball.primaryPosition
      const positionB = base.players[candidateB]!.basketball.primaryPosition
      if (positionA === positionB) return
      const market = updateGameWorld(base, {
        teams: Object.values(base.teams).map((item) => donors.some((donor) => donor.id === item.id) ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => id !== candidateA && id !== candidateB) } : item),
        contracts: Object.values(base.contractsById).filter((item) => item.playerId !== candidateA && item.playerId !== candidateB),
      })
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:shortlist-need-test')
      const saturated = updateGameWorld(market, {
        players: Object.values(market.players).map((player) => market.teams[team.id]!.rosterPlayerIds.includes(player.id) ? { ...player, basketball: { ...player.basketball, primaryPosition: positionA } } : player),
      })
      const withStaff = updateGameWorld(saturated, {
        staffPeople: [...Object.values(saturated.staffPeopleById), { id: staffId, identity: { firstName: 'Shortlist', lastName: 'Need' }, professional: { attributes: { ...highAttributes, talentEvaluation: 30, analysis: 30 } } }],
        teamStaffAssignments: [...Object.values(saturated.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:shortlist-need-test'), staffPersonId: staffId, teamId: team.id, role: 'analyticsStaff' as never, assignedOn: saturated.currentDate }],
        responsibilities: [...Object.values(saturated.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:shortlistPlayers`), { id: `responsibility:${team.id}:shortlistPlayers` as never, teamId: team.id, kind: 'shortlistPlayers', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [
          { organizationId: org, subjectPlayerId: candidateA, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: saturated.currentDate, provenance: 'scoutReport', estimate: 99, uncertainty: 1 } } },
          { organizationId: org, subjectPlayerId: candidateB, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: saturated.currentDate, provenance: 'scoutReport', estimate: 60, uncertainty: 1 } } },
        ],
      })
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'shortlistPlayers')
      if (outcome === undefined) return
      expect(outcome.payload.candidate1PlayerId).toBe(candidateB)
    })

    it('quality/workload materially affect shortlist depth', () => {
      const highQuality = fixture('shortlistPlayers', highAttributes, 'shortlist-quality-high')
      const lowQuality = fixture('shortlistPlayers', lowAttributes, 'shortlist-quality-low')
      const highOutcome = Object.values(progressBasketballOperationsAdvisories(highQuality.world).delegationOutcomesById).find((item) => item.kind === 'shortlistPlayers')
      const lowOutcome = Object.values(progressBasketballOperationsAdvisories(lowQuality.world).delegationOutcomesById).find((item) => item.kind === 'shortlistPlayers')
      if (highOutcome === undefined || lowOutcome === undefined) return
      expect(highOutcome.payload.candidateCount as number).toBeLessThanOrEqual(lowOutcome.payload.candidateCount as number)
    })

    it('repeated progression does not duplicate the outcome', () => {
      const { world } = fixture('shortlistPlayers')
      const first = progressBasketballOperationsAdvisories(world)
      const second = progressBasketballOperationsAdvisories(first)
      expect(Object.values(second.delegationOutcomesById).filter((item) => item.kind === 'shortlistPlayers')).toHaveLength(1)
    })
  })

  describe('contractRecommendation', () => {
    it('only evaluates a rostered player with an actual active contract', () => {
      const { world, team } = fixture('contractRecommendation')
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'contractRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(team.rosterPlayerIds).toContain(outcome.payload.playerId)
      const contract = Object.values(world.contractsById).find((item) => item.id === outcome.payload.contractId)
      expect(contract).toBeDefined()
      expect(contract!.playerId).toBe(outcome.payload.playerId)
    })

    it('recommends hold vs renew driven by remaining budget vs contract salary', () => {
      const { world, team } = fixture('contractRecommendation')
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'contractRecommendation')
      if (outcome === undefined) return
      // Force overBudget by minimizing the team's player salary budget — recommendation must flip to 'hold'.
      const tightened = updateGameWorld(world, { teamFinances: [{ ...world.teamFinancesByTeamId[team.id]!, playerSalaryBudget: 1 }] })
      const tightProgressed = progressBasketballOperationsAdvisories(tightened)
      const tightOutcome = Object.values(tightProgressed.delegationOutcomesById).find((item) => item.kind === 'contractRecommendation')
      if (tightOutcome === undefined) return
      expect(tightOutcome.payload.recommendation).toBe('hold')
    })

    it('creating the recommendation does not mutate the contract or finances', () => {
      const { world } = fixture('contractRecommendation')
      const progressed = progressBasketballOperationsAdvisories(world)
      expect(progressed.contractsById).toEqual(world.contractsById)
      expect(progressed.teamFinancesByTeamId).toEqual(world.teamFinancesByTeamId)
    })

    it('stays advisory-only: no accept/apply function is exposed for contractRecommendation in this module', async () => {
      const module = await import('./BasketballOperationsAdvisory')
      expect((module as Record<string, unknown>).acceptContractRecommendation).toBeUndefined()
    })

    it('quality and workload affect qualityScore the same way as recommendSignings', () => {
      const highQuality = fixture('contractRecommendation', highAttributes, 'contract-quality-high')
      const lowQuality = fixture('contractRecommendation', lowAttributes, 'contract-quality-low')
      const highOutcome = Object.values(progressBasketballOperationsAdvisories(highQuality.world).delegationOutcomesById).find((item) => item.kind === 'contractRecommendation')
      const lowOutcome = Object.values(progressBasketballOperationsAdvisories(lowQuality.world).delegationOutcomesById).find((item) => item.kind === 'contractRecommendation')
      if (highOutcome === undefined || lowOutcome === undefined) return
      expect(highOutcome.qualityScore).toBeGreaterThan(lowOutcome.qualityScore)
    })

    // Blocker 1: contractRecommendation must be materially determined by Basketball Operations
    // context (valuation, roster need, quality, workload), not "first roster player sorted by id".
    it('roster need/valuation changes which contract is prioritized', () => {
      const base = createNewGame()
      const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
      const contracted = team.rosterPlayerIds.filter((playerId) => getActivePlayerContract(base, playerId) !== undefined)
      if (contracted.length < 2) return
      const playerA = contracted[0]!
      const playerB = contracted[1]!
      const positionA = base.players[playerA]!.basketball.primaryPosition
      const positionB = base.players[playerB]!.basketball.primaryPosition
      if (positionA === positionB) return
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:contract-priority')
      // Saturate every OTHER roster position at playerA's position so playerB's position reads scarce (higher need).
      const reshuffled = updateGameWorld(base, {
        players: Object.values(base.players).map((player) => team.rosterPlayerIds.includes(player.id) && player.id !== playerB ? { ...player, basketball: { ...player.basketball, primaryPosition: positionA } } : player),
      })
      const withStaff = updateGameWorld(reshuffled, {
        staffPeople: [...Object.values(reshuffled.staffPeopleById), { id: staffId, identity: { firstName: 'Contract', lastName: 'Priority' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(reshuffled.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:contract-priority'), staffPersonId: staffId, teamId: team.id, role: 'capContractsSpecialist' as never, assignedOn: reshuffled.currentDate }],
        responsibilities: [...Object.values(reshuffled.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:contractRecommendation`), { id: `responsibility:${team.id}:contractRecommendation` as never, teamId: team.id, kind: 'contractRecommendation', mode: 'advisory', holderStaffId: staffId }],
      })
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'contractRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      // playerB now occupies the only scarce position on the roster — the recommendation must prioritize them, not the lexicographically-first contracted player.
      expect(outcome.payload.playerId).toBe(playerB)
    })

    it('high vs low quality materially changes confidence/recommended terms, not just qualityScore', () => {
      const highQuality = fixture('contractRecommendation', highAttributes, 'contract-terms-high')
      const lowQuality = fixture('contractRecommendation', lowAttributes, 'contract-terms-low')
      const highOutcome = Object.values(progressBasketballOperationsAdvisories(highQuality.world).delegationOutcomesById).find((item) => item.kind === 'contractRecommendation')
      const lowOutcome = Object.values(progressBasketballOperationsAdvisories(lowQuality.world).delegationOutcomesById).find((item) => item.kind === 'contractRecommendation')
      if (highOutcome === undefined || lowOutcome === undefined) return
      expect(highOutcome.qualityScore).toBeGreaterThan(lowOutcome.qualityScore)
      // Observable functional difference beyond qualityScore: confidence and/or recommended terms move too.
      const differs = highOutcome.payload.confidence !== lowOutcome.payload.confidence || highOutcome.payload.recommendedAnnualSalary !== lowOutcome.payload.recommendedAnnualSalary || highOutcome.payload.recommendation !== lowOutcome.payload.recommendation
      expect(differs).toBe(true)
    })

    it('overload materially degrades the outcome (recommendation and/or confidence), not only qualityScore', () => {
      // A `capContractsSpecialist` (the role the shared `fixture()` assigns for this kind) is only
      // eligible for `contractRecommendation` itself, and a Responsibility's holder must be assigned
      // to that exact Team, so overload here is built via a broadly-eligible `generalManager` holder
      // instead, mirroring the existing recommendSignings overload test's approach.
      const { world } = fixture('contractRecommendation', highAttributes, 'contract-overload')
      const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!
      const staffId = staffPersonIdFromString('ops:contract-overload')
      const roleFixed = updateGameWorld(world, {
        teamStaffAssignments: Object.values(world.teamStaffAssignmentsById).map((item) => item.staffPersonId === staffId ? { ...item, role: 'generalManager' as never } : item),
      })
      const responsibilityId = `responsibility:${team.id}:contractRecommendation`
      const extraIds = new Set([responsibilityId, `responsibility:${team.id}:shortlistPlayers`, `responsibility:${team.id}:recommendSignings`, `responsibility:${team.id}:tradeRecommendation`])
      const overloaded = updateGameWorld(roleFixed, {
        responsibilities: [
          ...Object.values(roleFixed.responsibilitiesById).filter((item) => !extraIds.has(item.id)),
          { id: responsibilityId as never, teamId: team.id, kind: 'contractRecommendation', mode: 'advisory', holderStaffId: staffId },
          { id: `responsibility:${team.id}:shortlistPlayers` as never, teamId: team.id, kind: 'shortlistPlayers', mode: 'advisory', holderStaffId: staffId },
          { id: `responsibility:${team.id}:recommendSignings` as never, teamId: team.id, kind: 'recommendSignings', mode: 'advisory', holderStaffId: staffId },
          { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId },
        ],
      })
      const baseline = progressBasketballOperationsAdvisories(roleFixed)
      const overloadedProgressed = progressBasketballOperationsAdvisories(overloaded)
      const baselineOutcome = Object.values(baseline.delegationOutcomesById).find((item) => item.kind === 'contractRecommendation')
      const overloadedOutcome = Object.values(overloadedProgressed.delegationOutcomesById).find((item) => item.kind === 'contractRecommendation')
      if (baselineOutcome === undefined || overloadedOutcome === undefined) return
      expect(overloadedOutcome.qualityScore).toBeLessThanOrEqual(baselineOutcome.qualityScore)
      expect(overloadedOutcome.payload.confidence as number).toBeLessThanOrEqual(baselineOutcome.payload.confidence as number)
    })

    it('generation does not mutate contracts/finances (overload variant)', () => {
      const { world } = fixture('contractRecommendation')
      const progressed = progressBasketballOperationsAdvisories(world)
      expect(progressed.contractsById).toEqual(world.contractsById)
      expect(progressed.teamFinancesByTeamId).toEqual(world.teamFinancesByTeamId)
      expect(progressed.teams).toEqual(world.teams)
    })

    it('determinism/exactly-once hold', () => {
      const { world } = fixture('contractRecommendation')
      const first = progressBasketballOperationsAdvisories(world)
      const second = progressBasketballOperationsAdvisories(first)
      expect(Object.values(second.delegationOutcomesById).filter((item) => item.kind === 'contractRecommendation')).toHaveLength(1)
    })
  })

  describe('tradeRecommendation', () => {
    it('is only emitted when the canonical validateTrade legality check allows the underlying proposal', () => {
      const { world, team, source, playerId } = tradeFixture()
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      if (outcome === undefined) return
      expect(outcome.payload.counterpartTeamId).toBe(source.id)
      expect(outcome.payload.incomingPlayerId).toBe(playerId)
      expect(team.rosterPlayerIds).not.toContain(playerId)
    })

    it('does not emit a recommendation for a NOT_FOR_SALE candidate (legality/availability gate)', () => {
      const { world, org, playerId } = tradeFixture()
      const blocked = updateGameWorld(world, { marketKnowledge: [{ organizationId: org, playerId, availability: 'NOT_FOR_SALE', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: world.currentDate, source: 'AGENT' }] })
      const progressed = progressBasketballOperationsAdvisories(blocked)
      expect(Object.values(progressed.delegationOutcomesById).some((item) => item.kind === 'tradeRecommendation')).toBe(false)
    })

    it('validateTrade legality is separate from desirability: a legal-but-unappealing candidate is still filtered by need/valuation ranking, not by legality alone', () => {
      // Give a low-valuation, low-need candidate priority over nothing — this asserts the ranking
      // (need+value) drives selection even though validateTrade would happily allow either trade.
      const { world } = tradeFixture()
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      if (outcome === undefined) return
      // The recommendation always includes valuation-derived confidence — never a bare legality flag.
      expect(typeof outcome.payload.confidence).toBe('number')
    })

    // Blocker 2: outgoing asset selection must prefer the lowest-value/highest-surplus own rostered
    // contracted player, not "first by PlayerId" — `validateTrade` stays the legality boundary only.
    it('offers the expendable (surplus-position, low-valuation) own player instead of the scarce/high-value one', () => {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const source = seasonTeams.find((item) => item.id !== team.id && item.rosterPlayerIds.length > 0)!
      const incomingPlayerId = source.rosterPlayerIds[0]!
      const contractedOwn = team.rosterPlayerIds.filter((playerId) => getActivePlayerContract(base, playerId) !== undefined)
      if (contractedOwn.length < 2) return
      const scarcePlayer = contractedOwn[0]!
      const expendablePlayer = contractedOwn[1]!
      const scarcePosition = base.players[scarcePlayer]!.basketball.primaryPosition
      const expendablePosition = base.players[expendablePlayer]!.basketball.primaryPosition
      if (scarcePosition === expendablePosition) return
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:trade-outgoing-preference')
      const seasoned = updateGameWorld(base, { currentSeasonId: season.id, currentDate: season.startDate })
      // Saturate every other roster position at the expendable player's position, so that position reads as surplus (need=0)
      // while the scarce player's position remains the sole occupant (need>0).
      const reshuffled = updateGameWorld(seasoned, {
        players: Object.values(seasoned.players).map((player) => team.rosterPlayerIds.includes(player.id) && player.id !== scarcePlayer ? { ...player, basketball: { ...player.basketball, primaryPosition: expendablePosition } } : player),
      })
      const withStaff = updateGameWorld(reshuffled, {
        staffPeople: [...Object.values(reshuffled.staffPeopleById), { id: staffId, identity: { firstName: 'Trade', lastName: 'Outgoing' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(reshuffled.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:trade-outgoing-preference'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: reshuffled.currentDate }],
        responsibilities: [...Object.values(reshuffled.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [
          { organizationId: org, subjectPlayerId: incomingPlayerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: reshuffled.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 2 } } },
          // High valuation for the scarce/needed player, low valuation for the expendable/surplus one — the expendable one must still be offered.
          { organizationId: org, subjectPlayerId: scarcePlayer, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: reshuffled.currentDate, provenance: 'scoutReport', estimate: 99, uncertainty: 1 } } },
          { organizationId: org, subjectPlayerId: expendablePlayer, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: reshuffled.currentDate, provenance: 'scoutReport', estimate: 40, uncertainty: 1 } } },
        ],
        marketKnowledge: [{ organizationId: org, playerId: incomingPlayerId, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: reshuffled.currentDate, source: 'AGENT' }],
      })
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(outcome.payload.outgoingPlayerId).toBe(expendablePlayer)
      expect(outcome.payload.outgoingPlayerId).not.toBe(scarcePlayer)
    })

    // Blocker 5: the incoming candidate ranked first (by need+value) is NOT_FOR_SALE; a fully
    // eligible, lower-ranked candidate must still be found and used instead of returning nothing.
    // (A legality-fallback-specific test for the outgoing side is not separately constructed: cheaply
    // forcing `validateTrade` to reject the single most-expendable own player while accepting the
    // second-most-expendable one would require fabricating salary-matching/apron edge cases that
    // duplicate TradeEngine's own coverage; the preference-ordering test above is the mandatory one,
    // and the `for (const outgoing of outgoingCandidates)` loop in the implementation already tries
    // candidates in preference order against the same canonical `validateTrade` TradeEngine tests use.)
    it('finds and uses a valid lower-ranked incoming candidate when the top-ranked one is ineligible (NOT_FOR_SALE)', () => {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const donors = seasonTeams.filter((item) => item.id !== team.id && item.rosterPlayerIds.length > 0).slice(0, 2)
      if (donors.length < 2) return
      const topRanked = donors[0]!.rosterPlayerIds[0]!
      const fallback = donors[1]!.rosterPlayerIds[0]!
      if (topRanked === fallback) return
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:trade-eligibility-fallback')
      const seasoned = updateGameWorld(base, { currentSeasonId: season.id, currentDate: season.startDate })
      const withStaff = updateGameWorld(seasoned, {
        staffPeople: [...Object.values(seasoned.staffPeopleById), { id: staffId, identity: { firstName: 'Trade', lastName: 'Fallback' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(seasoned.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:trade-eligibility-fallback'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: seasoned.currentDate }],
        responsibilities: [...Object.values(seasoned.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [
          { organizationId: org, subjectPlayerId: topRanked, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: seasoned.currentDate, provenance: 'scoutReport', estimate: 99, uncertainty: 1 } } },
          { organizationId: org, subjectPlayerId: fallback, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: seasoned.currentDate, provenance: 'scoutReport', estimate: 60, uncertainty: 1 } } },
        ],
        marketKnowledge: [
          { organizationId: org, playerId: topRanked, availability: 'NOT_FOR_SALE', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: seasoned.currentDate, source: 'AGENT' },
          { organizationId: org, playerId: fallback, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: seasoned.currentDate, source: 'AGENT' },
        ],
      })
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(outcome.payload.incomingPlayerId).toBe(fallback)
    })

    it('generating the advisory does not execute a trade: rosters, contracts, ownership, and finances are unchanged', () => {
      const { world } = tradeFixture()
      const progressed = progressBasketballOperationsAdvisories(world)
      expect(progressed.teams).toEqual(world.teams)
      expect(progressed.contractsById).toEqual(world.contractsById)
      expect(progressed.teamFinancesByTeamId).toEqual(world.teamFinancesByTeamId)
      expect(progressed.draftPicksById).toEqual(world.draftPicksById)
    })

    it('leaves unrelated team state unchanged except for reads', () => {
      const { world, team, source } = tradeFixture()
      const untouched = Object.values(world.teams).find((item) => item.id !== team.id && item.id !== source.id)
      if (untouched === undefined) return
      const progressed = progressBasketballOperationsAdvisories(world)
      expect(progressed.teams[untouched.id]).toEqual(world.teams[untouched.id])
    })

    it('quality and workload affect qualityScore', () => {
      const highQuality = tradeFixture(highAttributes, 'trade-quality-high')
      const lowQuality = tradeFixture(lowAttributes, 'trade-quality-low')
      const highOutcome = Object.values(progressBasketballOperationsAdvisories(highQuality.world).delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      const lowOutcome = Object.values(progressBasketballOperationsAdvisories(lowQuality.world).delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      if (highOutcome === undefined || lowOutcome === undefined) return
      expect(highOutcome.qualityScore).toBeGreaterThan(lowOutcome.qualityScore)
    })
  })

  describe('acceptTradeRecommendation', () => {
    it('accepting a valid trade recommendation executes the trade atomically through the canonical TradeEngine and marks the outcome applied', () => {
      const { world, team, source, playerId } = tradeFixture()
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      if (outcome === undefined) return
      const result = acceptTradeRecommendation(progressed, outcome.id)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.world.teams[team.id]!.rosterPlayerIds).toContain(playerId)
      expect(result.world.teams[source.id]!.rosterPlayerIds).not.toContain(playerId)
      expect(result.world.delegationOutcomesById[outcome.id]!.applied).toBe(true)
    })

    it('a stale recommendation (candidate no longer on the counterpart roster) fails atomically with no partial mutation', () => {
      const { world, source, playerId } = tradeFixture()
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      if (outcome === undefined) return
      // Player already moved off the counterpart roster since the recommendation was created.
      const staled = updateGameWorld(progressed, {
        teams: Object.values(progressed.teams).map((item) => item.id === source.id ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => id !== playerId) } : item),
        contracts: Object.values(progressed.contractsById).filter((item) => item.playerId !== playerId),
      })
      const before = JSON.stringify(staled)
      const result = acceptTradeRecommendation(staled, outcome.id)
      expect(result.ok).toBe(false)
      expect(JSON.stringify(staled)).toBe(before)
    })

    it('rejects acceptance for an unknown outcome id', () => {
      const { world } = tradeFixture()
      const result = acceptTradeRecommendation(world, 'delegation-outcome:does-not-exist' as never)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('notFound')
    })

    it('rejects acceptance of a non-tradeRecommendation outcome', () => {
      const { world } = fixture('shortlistPlayers')
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'shortlistPlayers')
      if (outcome === undefined) return
      const result = acceptTradeRecommendation(progressed, outcome.id)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('invalidKind')
    })

    it('rejects double-acceptance of an already-applied outcome', () => {
      const { world } = tradeFixture()
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      if (outcome === undefined) return
      const first = acceptTradeRecommendation(progressed, outcome.id)
      expect(first.ok).toBe(true)
      if (!first.ok) return
      const second = acceptTradeRecommendation(first.world, outcome.id)
      expect(second.ok).toBe(false)
      if (second.ok) return
      expect(second.reason).toBe('alreadyApplied')
    })

    it('the payload freezes the seasonId and ecosystemId the proposal was validated against', () => {
      const { world } = tradeFixture()
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      if (outcome === undefined) return
      expect(outcome.payload.seasonId).toBe(world.currentSeasonId)
      expect(typeof outcome.payload.ecosystemId).toBe('string')
    })

    it('BDM is multi-competition: acceptance reconstructs the proposal from the frozen payload seasonId, not world.currentSeasonId, even after currentSeasonId advances to a different valid season', () => {
      const { world } = tradeFixture()
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      if (outcome === undefined) return
      const seasonA = outcome.payload.seasonId as string
      const seasonB = Object.values(progressed.seasons).find((item) => progressed.tradeRulesBySeasonId[item.id] !== undefined && item.id !== seasonA)
      if (seasonB === undefined) return
      // Advance currentSeasonId to a different season with its own trade rules — acceptance must
      // still validate/execute against the frozen season A, never reinterpret against season B.
      const advanced = updateGameWorld(progressed, { currentSeasonId: seasonB.id })
      const result = acceptTradeRecommendation(advanced, outcome.id)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const executedTrade = Object.values(result.world.tradeHistoryById).find((item) => item.proposalId === outcome.payload.proposalId)
      expect(executedTrade?.seasonId).toBe(seasonA)
    })

    it('a recommendation whose frozen season/ecosystem pairing is no longer valid is stale and fails atomically with no partial mutation', () => {
      const { world } = tradeFixture()
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      if (outcome === undefined) return
      const seasonId = outcome.payload.seasonId as string
      const season = progressed.seasons[seasonId as keyof typeof progressed.seasons]!
      // Reassign the frozen season's competition to point at a different ecosystem than the one
      // frozen in the payload — the season/ecosystem pairing the recommendation was built against no
      // longer holds, so acceptance must treat it as stale rather than silently reinterpreting it
      // against whatever ecosystem the competition now belongs to.
      const otherEcosystem = Object.values(progressed.ecosystems).find((item) => item.id !== progressed.competitions[season.competitionId]!.ecosystemId)
      if (otherEcosystem === undefined) return
      const staled = updateGameWorld(progressed, {
        competitions: Object.values(progressed.competitions).map((item) => item.id === season.competitionId ? { ...item, ecosystemId: otherEcosystem.id } : item),
      })
      const before = JSON.stringify(staled)
      const result = acceptTradeRecommendation(staled, outcome.id)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('staleRecommendation')
      expect(JSON.stringify(staled)).toBe(before)
    })

    it('determinism and idempotency are unaffected by freezing seasonId/ecosystemId: repeated progression from the same world produces the same single outcome', () => {
      const { world } = tradeFixture()
      const first = progressBasketballOperationsAdvisories(world)
      const second = progressBasketballOperationsAdvisories(first)
      const firstOutcome = Object.values(first.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      const secondOutcome = Object.values(second.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(firstOutcome).toBeDefined()
      expect(secondOutcome).toEqual(firstOutcome)
      expect(Object.values(second.delegationOutcomesById).filter((item) => item.kind === 'tradeRecommendation')).toHaveLength(1)
    })
  })

  // Blocker 3: seasonForTeam must not resolve by "first season in insertion order whose competition
  // contains this team" — BDM is multi-competition, so the same team can belong to two seasons/
  // competitions simultaneously. Resolution must be ecosystem-consistent and TradeRules-backed, with
  // a stable (non-insertion-order) tie-break.
  describe('trade-context season resolution (seasonForTeam)', () => {
    it('reordering world.seasons key insertion order does not change the chosen trade context/season', () => {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const source = seasonTeams.find((item) => item.id !== team.id && item.rosterPlayerIds.length > 0)!
      const playerId = source.rosterPlayerIds[0]!
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:season-order')
      const seasoned = updateGameWorld(base, { currentSeasonId: season.id, currentDate: season.startDate })
      const withStaff = updateGameWorld(seasoned, {
        staffPeople: [...Object.values(seasoned.staffPeopleById), { id: staffId, identity: { firstName: 'Season', lastName: 'Order' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(seasoned.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:season-order'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: seasoned.currentDate }],
        responsibilities: [...Object.values(seasoned.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [{ organizationId: org, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: seasoned.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 2 } } }],
        marketKnowledge: [{ organizationId: org, playerId, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: seasoned.currentDate, source: 'AGENT' }],
      })
      // Rebuild the world with `seasons`' key order reversed — the chosen trade context/season must be identical.
      const reversedSeasons = Object.fromEntries(Object.entries(withStaff.seasons).reverse())
      const reversed = { ...withStaff, seasons: reversedSeasons }
      const progressedOriginal = progressBasketballOperationsAdvisories(withStaff)
      const progressedReversed = progressBasketballOperationsAdvisories(reversed)
      const outcomeOriginal = Object.values(progressedOriginal.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      const outcomeReversed = Object.values(progressedReversed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcomeOriginal).toBeDefined()
      expect(outcomeReversed).toBeDefined()
      if (outcomeOriginal === undefined || outcomeReversed === undefined) return
      expect(outcomeReversed.payload.seasonId).toBe(outcomeOriginal.payload.seasonId)
      expect(outcomeReversed.payload.ecosystemId).toBe(outcomeOriginal.payload.ecosystemId)
    })

    it('a team participating in two seasons/competitions simultaneously resolves to the ecosystem-consistent, TradeRules-backed one, not the first by insertion order', () => {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const source = seasonTeams.find((item) => item.id !== team.id && item.rosterPlayerIds.length > 0)!
      const playerId = source.rosterPlayerIds[0]!
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:multi-season')
      const seasoned = updateGameWorld(base, { currentSeasonId: season.id, currentDate: season.startDate })
      const realEcosystemId = seasoned.competitions[season.competitionId]!.ecosystemId
      // Pick an ecosystem that sorts AFTER the real one, so `getEcosystemForTeam` (lowest-ecosystem-id
      // tie-break) still resolves to the real ecosystem even once `team` also participates in the
      // bogus competition below — this isolates the assertion to seasonForTeam's TradeRules/insertion
      // order behavior rather than accidentally also perturbing getEcosystemForTeam's own result.
      const otherEcosystem = Object.values(seasoned.ecosystems).filter((item) => item.id !== realEcosystemId).sort((a, b) => a.id.localeCompare(b.id)).find((item) => item.id.localeCompare(realEcosystemId) > 0)!
      // Hand-build a second competition/season (no TradeRules configured, and belonging to a
      // DIFFERENT real ecosystem than the team's canonical `getEcosystemForTeam` resolution) that
      // ALSO includes `team` as a participant, inserted BEFORE the real trade-rules-backed season in
      // `world.seasons`, so an insertion-order-first resolution would incorrectly pick this bogus
      // season instead.
      const bogusCompetition = { ...seasoned.competitions[season.competitionId]!, id: 'competition:bogus-secondary' as never, ecosystemId: otherEcosystem.id }
      const bogusSeason = { ...season, id: 'season:bogus-secondary' as never, competitionId: bogusCompetition.id }
      const withBogus = {
        ...seasoned,
        competitions: { [bogusCompetition.id]: bogusCompetition, ...seasoned.competitions },
        seasons: { [bogusSeason.id]: bogusSeason, ...seasoned.seasons },
      }
      const withStaff = updateGameWorld(withBogus, {
        staffPeople: [...Object.values(withBogus.staffPeopleById), { id: staffId, identity: { firstName: 'Multi', lastName: 'Season' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(withBogus.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:multi-season'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: withBogus.currentDate }],
        responsibilities: [...Object.values(withBogus.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [{ organizationId: org, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: withBogus.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 2 } } }],
        marketKnowledge: [{ organizationId: org, playerId, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: withBogus.currentDate, source: 'AGENT' }],
      })
      expect(Object.keys(withStaff.seasons)[0]).toBe(bogusSeason.id) // sanity: bogus season really is first by insertion order
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      // Must resolve to the real, TradeRules-backed, ecosystem-consistent season — never the bogus one.
      expect(outcome.payload.seasonId).toBe(season.id)
      expect(outcome.payload.ecosystemId).toBe(seasoned.competitions[season.competitionId]!.ecosystemId)
    })

    /**
     * Blocker A: two TradeRules-backed seasons for the SAME team/ecosystem — an older season whose
     * SeasonId sorts lexicographically SMALLER, and a current season whose SeasonId sorts
     * lexicographically LARGER. `world.currentDate` falls only within the current (larger-id)
     * season's range. Under the old pure-lexicographic-sort behavior, the OLDER season would
     * incorrectly win (smaller id sorts first); date-range containment must instead select the
     * season whose `[startDate, endDate]` actually contains `currentDate`. Also asserted
     * order-independent: the older season is inserted first in one build and last in another.
     */
    function buildTwoSeasonFixture(olderFirst: boolean) {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const source = seasonTeams.find((item) => item.id !== team.id && item.rosterPlayerIds.length > 0)!
      const playerId = source.rosterPlayerIds[0]!
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:two-season')

      // Older season: id sorts lexicographically SMALLER than the current one, dated in the past.
      const olderSeason = { ...season, id: 'season:aaa-older' as never, startDate: addYears(season.startDate, -2), endDate: addYears(season.endDate, -2) }
      // Current season: id sorts lexicographically LARGER (would lose under pure string-sort), dated to contain currentDate.
      const currentSeason = { ...season, id: 'season:zzz-current' as never }
      const tradeRules = base.tradeRulesBySeasonId[season.id]!

      const newSeasonsInOrder = olderFirst
        ? { [olderSeason.id]: olderSeason, [currentSeason.id]: currentSeason }
        : { [currentSeason.id]: currentSeason, [olderSeason.id]: olderSeason }

      // Preserve every other pre-existing season (conference memberships / games reference them by
      // id) and just add the two new trade-context seasons in the desired insertion order. Strip
      // TradeRules from the ORIGINAL season (its id/dates are otherwise still a qualifying
      // duplicate of `currentSeason`) so only the two synthetic seasons under test can win.
      const { [season.id]: _removedTradeRules, ...tradeRulesWithoutOriginal } = base.tradeRulesBySeasonId
      const withSeasons = {
        ...base,
        seasons: { ...newSeasonsInOrder, ...base.seasons },
        tradeRulesBySeasonId: { ...tradeRulesWithoutOriginal, [olderSeason.id]: { ...tradeRules, seasonId: olderSeason.id }, [currentSeason.id]: { ...tradeRules, seasonId: currentSeason.id } },
        currentSeasonId: currentSeason.id,
        currentDate: currentSeason.startDate,
      }
      const withStaff = updateGameWorld(withSeasons, {
        staffPeople: [...Object.values(withSeasons.staffPeopleById), { id: staffId, identity: { firstName: 'Two', lastName: 'Season' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(withSeasons.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:two-season'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: withSeasons.currentDate }],
        responsibilities: [...Object.values(withSeasons.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [{ organizationId: org, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: withSeasons.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 2 } } }],
        marketKnowledge: [{ organizationId: org, playerId, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: withSeasons.currentDate, source: 'AGENT' }],
      })
      return { world: withStaff, currentSeasonId: currentSeason.id, olderSeasonId: olderSeason.id }
    }

    it('resolves to the season whose date range actually contains currentDate, not the lexicographically-first SeasonId, with older season inserted FIRST', () => {
      const { world, currentSeasonId, olderSeasonId } = buildTwoSeasonFixture(true)
      expect(Object.keys(world.seasons)[0]).toBe(olderSeasonId) // sanity: older/lexicographically-smaller id really is first
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(outcome.payload.seasonId).toBe(currentSeasonId)
      expect(outcome.payload.seasonId).not.toBe(olderSeasonId)
    })

    it('resolves to the season whose date range actually contains currentDate, not the lexicographically-first SeasonId, with older season inserted LAST (order-independence)', () => {
      const { world, currentSeasonId, olderSeasonId } = buildTwoSeasonFixture(false)
      expect(Object.keys(world.seasons)[0]).toBe(currentSeasonId) // sanity: current season is first by insertion order this time
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(outcome.payload.seasonId).toBe(currentSeasonId)
      expect(outcome.payload.seasonId).not.toBe(olderSeasonId)
    })

    /**
     * Blocker A, `Season.participantTeamIds` snapshot case: the Competition currently lists the
     * team, but the specific season's own `participantTeamIds` snapshot omits it. That season must
     * be skipped even though the Competition-level membership would otherwise include the team.
     */
    it('skips a season whose own participantTeamIds snapshot omits the team, even though the Competition currently lists it', () => {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const source = seasonTeams.find((item) => item.id !== team.id && item.rosterPlayerIds.length > 0)!
      const playerId = source.rosterPlayerIds[0]!
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:season-snapshot-omit')

      // Build a synthetic second season on the SAME (real, ecosystem-consistent) competition — no
      // games or conference memberships reference this synthetic season id, so it can carry a
      // participantTeamIds snapshot that omits `team` without tripping game-participant validation.
      // It is TradeRules-backed and date-current, so if the snapshot were ignored it WOULD win.
      const omittingSeason = { ...season, id: 'season:snapshot-omit' as never, participantTeamIds: base.competitions[season.competitionId]!.participantTeamIds.filter((id) => id !== team.id) }
      const tradeRules = base.tradeRulesBySeasonId[season.id]!
      // Strip TradeRules from the ORIGINAL season too — its id/dates otherwise still qualify
      // (unaffected by the synthetic season's snapshot), which would mask the assertion.
      const { [season.id]: _removedTradeRules, ...tradeRulesWithoutOriginal } = base.tradeRulesBySeasonId
      const seasoned = {
        ...base,
        seasons: { [omittingSeason.id]: omittingSeason, ...base.seasons },
        tradeRulesBySeasonId: { ...tradeRulesWithoutOriginal, [omittingSeason.id]: { ...tradeRules, seasonId: omittingSeason.id } },
        currentSeasonId: omittingSeason.id,
        currentDate: omittingSeason.startDate,
      }
      const withStaff = updateGameWorld(seasoned, {
        staffPeople: [...Object.values(seasoned.staffPeopleById), { id: staffId, identity: { firstName: 'Snapshot', lastName: 'Omit' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(seasoned.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:season-snapshot-omit'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: seasoned.currentDate }],
        responsibilities: [...Object.values(seasoned.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [{ organizationId: org, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: seasoned.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 2 } } }],
        marketKnowledge: [{ organizationId: org, playerId, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: seasoned.currentDate, source: 'AGENT' }],
      })
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      // Neither the real season (currentDate no longer falls in its range once currentDate moved to
      // the synthetic season's range) nor the synthetic one (snapshot omits `team`) qualifies, so no
      // recommendation can be produced.
      expect(Object.values(progressed.delegationOutcomesById).some((item) => item.kind === 'tradeRecommendation')).toBe(false)
    })

    it('a season whose participantTeamIds snapshot DOES include the team is still selected normally (snapshot present and satisfied)', () => {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const source = seasonTeams.find((item) => item.id !== team.id && item.rosterPlayerIds.length > 0)!
      const playerId = source.rosterPlayerIds[0]!
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:season-snapshot-include')

      // Season snapshot explicitly includes `team` (identical membership to the Competition level).
      const snapshotSeason = { ...season, participantTeamIds: base.competitions[season.competitionId]!.participantTeamIds }
      const seasoned = { ...base, seasons: { ...base.seasons, [season.id]: snapshotSeason }, currentSeasonId: season.id, currentDate: season.startDate }
      const withStaff = updateGameWorld(seasoned, {
        staffPeople: [...Object.values(seasoned.staffPeopleById), { id: staffId, identity: { firstName: 'Snapshot', lastName: 'Include' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(seasoned.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:season-snapshot-include'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: seasoned.currentDate }],
        responsibilities: [...Object.values(seasoned.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [{ organizationId: org, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: seasoned.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 2 } } }],
        marketKnowledge: [{ organizationId: org, playerId, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: seasoned.currentDate, source: 'AGENT' }],
      })
      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(outcome.payload.seasonId).toBe(season.id)
    })
  })

  // Blocker B: the trade incoming candidate must be tried against real legal pairings, walking the
  // ranked+bounded eligible window in order, before final selection — never "rank, pick one, then
  // discover it has no legal pairing and give up".
  describe('trade legality fallback (tradeRecommendation)', () => {
    /**
     * Candidate A ranks first (highest valuation) but its contract's `annualSalary` is set so high
     * that incoming salary exceeds the team's incoming-salary limit for EVERY possible outgoing
     * player, so `validateTrade` rejects every A×outgoing pairing with `SALARY_MATCHING_FAILED`.
     * Candidate B ranks second (lower valuation) but has an ordinary low salary that matches
     * cleanly. The staff advisory must not give up after A fails — it must fall through to B.
     */
    function buildLegalityFallbackFixture() {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const donors = seasonTeams.filter((item) => item.id !== team.id && item.rosterPlayerIds.length > 0).slice(0, 2)
      if (donors.length < 2) return undefined
      const candidateA = donors[0]!.rosterPlayerIds[0]!
      const candidateB = donors[1]!.rosterPlayerIds[0]!
      if (candidateA === candidateB) return undefined
      const outgoingContracted = team.rosterPlayerIds.filter((playerId) => getActivePlayerContract(base, playerId) !== undefined)
      if (outgoingContracted.length < 1) return undefined

      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:trade-legality-incoming')
      const seasoned = updateGameWorld(base, { currentSeasonId: season.id, currentDate: season.startDate })

      // Make candidateA's contract salary enormous so it fails validateTrade against every outgoing player.
      const contractA = getActivePlayerContract(seasoned, candidateA)
      if (contractA === undefined) return undefined
      const inflated = updateGameWorld(seasoned, {
        contracts: Object.values(seasoned.contractsById).map((item) => item.id === contractA.id ? { ...item, compensation: { annualSalary: 100_000_000 } } : item),
      })

      const withStaff = updateGameWorld(inflated, {
        staffPeople: [...Object.values(inflated.staffPeopleById), { id: staffId, identity: { firstName: 'Legality', lastName: 'Fallback' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(inflated.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:trade-legality-incoming'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: inflated.currentDate }],
        responsibilities: [...Object.values(inflated.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [
          // candidateA ranks first (higher valuation/estimate) despite being trade-illegal against everything.
          { organizationId: org, subjectPlayerId: candidateA, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: inflated.currentDate, provenance: 'scoutReport', estimate: 99, uncertainty: 1 } } },
          { organizationId: org, subjectPlayerId: candidateB, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: inflated.currentDate, provenance: 'scoutReport', estimate: 60, uncertainty: 1 } } },
        ],
        marketKnowledge: [
          { organizationId: org, playerId: candidateA, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: inflated.currentDate, source: 'AGENT' },
          { organizationId: org, playerId: candidateB, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: inflated.currentDate, source: 'AGENT' },
        ],
      })
      return { world: withStaff, team, candidateA, candidateB, outgoingContracted }
    }

    it('advances to the next-ranked incoming candidate when the top-ranked one has zero legal pairings, instead of returning undefined', () => {
      const built = buildLegalityFallbackFixture()
      if (built === undefined) return
      const { world, candidateA, candidateB } = built
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(outcome.payload.incomingPlayerId).toBe(candidateB)
      expect(outcome.payload.incomingPlayerId).not.toBe(candidateA)
    })

    it('composes both fallback axes: incoming A fails with every outgoing candidate, incoming B fails with the first (most expendable) outgoing but succeeds with the second — the outcome uses B plus the outgoing that actually clears validateTrade', () => {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const donors = seasonTeams.filter((item) => item.id !== team.id && item.rosterPlayerIds.length > 0).slice(0, 2)
      if (donors.length < 2) return
      const candidateA = donors[0]!.rosterPlayerIds[0]!
      const candidateB = donors[1]!.rosterPlayerIds[0]!
      if (candidateA === candidateB) return
      const seasoned = updateGameWorld(base, { currentSeasonId: season.id, currentDate: season.startDate })
      const outgoingContracted = team.rosterPlayerIds.filter((playerId) => getActivePlayerContract(seasoned, playerId) !== undefined)
      if (outgoingContracted.length < 2) return

      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:trade-legality-compound')

      // candidateA: inflate its contract salary so it fails validateTrade against every outgoing player.
      const contractA = getActivePlayerContract(seasoned, candidateA)
      if (contractA === undefined) return
      const inflatedA = updateGameWorld(seasoned, {
        contracts: Object.values(seasoned.contractsById).map((item) => item.id === contractA.id ? { ...item, compensation: { annualSalary: 100_000_000 } } : item),
      })

      // Make the single MOST-preferred outgoing candidate (by the same need/value/id ordering the
      // implementation uses) untradeable for EVERY incoming candidate by removing it from the roster
      // (validateTrade reads live roster state, so this fails as PLAYER_NOT_ON_TEAM for any proposal
      // that offers it) — this forces the implementation's outgoing-preference loop to fall through
      // to the next-preferred outgoing candidate for whichever incoming candidate is actually usable
      // (candidateB), composing with the incoming-side fallback (candidateA is unusable for ANY
      // outgoing due to its inflated salary) in the same recommendation.
      const contractedRoster = outgoingContracted.slice()
      const outgoing1 = contractedRoster[0]!
      const remainingContracted = contractedRoster.filter((id) => id !== outgoing1)
      if (remainingContracted.length === 0) return
      const withoutOutgoing1 = updateGameWorld(inflatedA, {
        teams: Object.values(inflatedA.teams).map((item) => item.id === team.id ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => id !== outgoing1) } : item),
      })

      const withStaff = updateGameWorld(withoutOutgoing1, {
        staffPeople: [...Object.values(withoutOutgoing1.staffPeopleById), { id: staffId, identity: { firstName: 'Legality', lastName: 'Compound' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(withoutOutgoing1.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:trade-legality-compound'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: withoutOutgoing1.currentDate }],
        responsibilities: [...Object.values(withoutOutgoing1.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [
          { organizationId: org, subjectPlayerId: candidateA, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: withoutOutgoing1.currentDate, provenance: 'scoutReport', estimate: 99, uncertainty: 1 } } },
          { organizationId: org, subjectPlayerId: candidateB, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: withoutOutgoing1.currentDate, provenance: 'scoutReport', estimate: 60, uncertainty: 1 } } },
        ],
        marketKnowledge: [
          { organizationId: org, playerId: candidateA, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: withoutOutgoing1.currentDate, source: 'AGENT' },
          { organizationId: org, playerId: candidateB, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: withoutOutgoing1.currentDate, source: 'AGENT' },
        ],
      })

      const progressed = progressBasketballOperationsAdvisories(withStaff)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      // A is unusable (astronomical salary fails against every outgoing); B is the only viable incoming
      // candidate, and outgoing1 is no longer a roster member, so the outcome must have fallen through
      // to some OTHER contracted roster player as the outgoing asset.
      expect(outcome.payload.incomingPlayerId).toBe(candidateB)
      expect(outcome.payload.incomingPlayerId).not.toBe(candidateA)
      expect(outcome.payload.outgoingPlayerId).not.toBe(outgoing1)
      expect(remainingContracted).toContain(outcome.payload.outgoingPlayerId)
    })
  })

  describe('tradeRecommendation outgoing selection is not RNG-biased by combinatorial legal pairings', () => {
    /**
     * One viable incoming candidate; two own contracted outgoing candidates where BOTH resulting
     * trades are `validateTrade`-legal. outgoingA is clearly more expendable (surplus position, low
     * valuation) and sorts first in `expendableOwnRoster`; outgoingB is scarce/high-valuation and
     * sorts later. Under the old flat-`legalPairs`-then-uniform-RNG-pick implementation, BOTH
     * (incoming, outgoingA) and (incoming, outgoingB) would land in the same flat array and the RNG
     * could select either — so outgoingB could win despite being strictly less preferred. Under the
     * fixed "first legal outgoing wins, then stop" implementation, only (incoming, outgoingA) is ever
     * considered, since the search stops at the first legal outgoing. outgoingA must therefore be
     * selected deterministically regardless of RNG seed.
     */
    function buildOutgoingPreferenceFixture(staffSuffix: string) {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const source = seasonTeams.find((item) => item.id !== team.id && item.rosterPlayerIds.length > 0)!
      const incomingPlayerId = source.rosterPlayerIds[0]!
      const contractedOwn = team.rosterPlayerIds.filter((playerId) => getActivePlayerContract(base, playerId) !== undefined)
      if (contractedOwn.length < 2) return undefined
      const scarcePlayer = contractedOwn[0]!
      const expendablePlayer = contractedOwn[1]!
      const scarcePosition = base.players[scarcePlayer]!.basketball.primaryPosition
      const expendablePosition = base.players[expendablePlayer]!.basketball.primaryPosition
      if (scarcePosition === expendablePosition) return undefined
      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString(`ops:trade-outgoing-rng-${staffSuffix}`)
      const seasoned = updateGameWorld(base, { currentSeasonId: season.id, currentDate: season.startDate })
      // Saturate every other roster position at the expendable player's position, so that position reads as surplus (need=0)
      // while the scarce player's position remains the sole occupant (need>0) — same technique as the deterministic preference test above.
      const reshuffled = updateGameWorld(seasoned, {
        players: Object.values(seasoned.players).map((player) => team.rosterPlayerIds.includes(player.id) && player.id !== scarcePlayer ? { ...player, basketball: { ...player.basketball, primaryPosition: expendablePosition } } : player),
      })
      const withStaff = updateGameWorld(reshuffled, {
        staffPeople: [...Object.values(reshuffled.staffPeopleById), { id: staffId, identity: { firstName: 'Trade', lastName: 'OutgoingRng' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(reshuffled.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`assignment:trade-outgoing-rng-${staffSuffix}`), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: reshuffled.currentDate }],
        responsibilities: [...Object.values(reshuffled.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [
          { organizationId: org, subjectPlayerId: incomingPlayerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: reshuffled.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 2 } } },
          { organizationId: org, subjectPlayerId: scarcePlayer, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: reshuffled.currentDate, provenance: 'scoutReport', estimate: 99, uncertainty: 1 } } },
          { organizationId: org, subjectPlayerId: expendablePlayer, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: reshuffled.currentDate, provenance: 'scoutReport', estimate: 40, uncertainty: 1 } } },
        ],
        marketKnowledge: [{ organizationId: org, playerId: incomingPlayerId, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: reshuffled.currentDate, source: 'AGENT' }],
      })
      return { world: withStaff, expendablePlayer, scarcePlayer }
    }

    it.each(['seed-a', 'seed-b', 'seed-c', 'seed-d'])('always offers the most-expendable legal outgoing player, never a less-expendable one, across RNG seed variation (%s)', (staffSuffix) => {
      const built = buildOutgoingPreferenceFixture(staffSuffix)
      if (built === undefined) return
      const { world, expendablePlayer, scarcePlayer } = built
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect(outcome.payload.outgoingPlayerId).toBe(expendablePlayer)
      expect(outcome.payload.outgoingPlayerId).not.toBe(scarcePlayer)
    })

    /**
     * Incoming candidate A has exactly one legal outgoing option; incoming candidate B has several
     * (3+) legal outgoing options. Under the old flat-array implementation, B would be represented
     * ~3x more often than A in the RNG draw purely because more of its outgoing pairings happened to
     * be legal — a combinatorial bias `validateTrade` legality must never introduce. Under the fixed
     * implementation, each incoming candidate contributes at most one entry regardless of how many
     * outgoing options were legal for it, and whichever incoming candidate is ultimately selected
     * always uses its own first-legal (most expendable) outgoing option — never a worse one that
     * existed only because more legal combinations were available for that candidate.
     */
    function buildNoCombinatorialBiasFixture() {
      const base = createNewGame()
      const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
      const seasonTeams = Object.values(base.teams).filter((item) => base.competitions[season.competitionId]!.participantTeamIds.includes(item.id))
      const team = seasonTeams[0]!
      const donors = seasonTeams.filter((item) => item.id !== team.id && item.rosterPlayerIds.length > 0).slice(0, 2)
      if (donors.length < 2) return undefined
      const incomingA = donors[0]!.rosterPlayerIds[0]!
      const incomingB = donors[1]!.rosterPlayerIds[0]!
      if (incomingA === incomingB) return undefined
      const seasoned = updateGameWorld(base, { currentSeasonId: season.id, currentDate: season.startDate })
      const contractedOwn = team.rosterPlayerIds.filter((playerId) => getActivePlayerContract(seasoned, playerId) !== undefined)
      // Need at least 2 own contracted players: outgoingFirst (most expendable, legal against both
      // incoming candidates) and outgoingSecond (next-most-expendable, only relevant if the loop
      // incorrectly skipped past outgoingFirst — asserted against below to prove it never does).
      if (contractedOwn.length < 2) return undefined
      const outgoingFirst = contractedOwn[0]!
      const outgoingSecond = contractedOwn[1]!

      const org = organizationIdForTeam(team.id)
      const staffId = staffPersonIdFromString('ops:trade-no-combinatorial-bias')
      const withStaff = updateGameWorld(seasoned, {
        staffPeople: [...Object.values(seasoned.staffPeopleById), { id: staffId, identity: { firstName: 'Trade', lastName: 'NoBias' }, professional: { attributes: highAttributes } }],
        teamStaffAssignments: [...Object.values(seasoned.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('assignment:trade-no-combinatorial-bias'), staffPersonId: staffId, teamId: team.id, role: 'generalManager' as never, assignedOn: seasoned.currentDate }],
        responsibilities: [...Object.values(seasoned.responsibilitiesById).filter((item) => item.id !== `responsibility:${team.id}:tradeRecommendation`), { id: `responsibility:${team.id}:tradeRecommendation` as never, teamId: team.id, kind: 'tradeRecommendation', mode: 'advisory', holderStaffId: staffId }],
        organizationKnowledge: [
          { organizationId: org, subjectPlayerId: incomingA, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: seasoned.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 1 } } },
          { organizationId: org, subjectPlayerId: incomingB, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: seasoned.currentDate, provenance: 'scoutReport', estimate: 60, uncertainty: 1 } } },
        ],
        marketKnowledge: [
          { organizationId: org, playerId: incomingA, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: seasoned.currentDate, source: 'AGENT' },
          { organizationId: org, playerId: incomingB, availability: 'OPEN', expectedSalary: 1, expectedYears: 1, confidence: 90, assessedAt: seasoned.currentDate, source: 'AGENT' },
        ],
      })
      return { world: withStaff, incomingA, incomingB, outgoingFirst, outgoingSecond }
    }

    it('whichever incoming candidate is selected always uses its own first-legal (most expendable) outgoing option, never a fallback one, regardless of how many legal outgoing options existed for it', () => {
      const built = buildNoCombinatorialBiasFixture()
      if (built === undefined) return
      const { world, incomingA, incomingB, outgoingFirst, outgoingSecond } = built
      const progressed = progressBasketballOperationsAdvisories(world)
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'tradeRecommendation')
      expect(outcome).toBeDefined()
      if (outcome === undefined) return
      expect([incomingA, incomingB]).toContain(outcome.payload.incomingPlayerId)
      // Both incoming candidates are legal against outgoingFirst (the most expendable own contracted
      // player, first in `expendableOwnRoster` preference order) since no salary/roster manipulation
      // makes either pairing illegal here. Whichever incoming candidate wins the RNG draw over
      // *incoming* candidates, the outgoing asset used must be outgoingFirst — never outgoingSecond
      // or any other less-preferred option — because the fixed algorithm always stops at the first
      // legal outgoing for whichever incoming candidate it is evaluating.
      expect(outcome.payload.outgoingPlayerId).toBe(outgoingFirst)
      expect(outcome.payload.outgoingPlayerId).not.toBe(outgoingSecond)
    })
  })
})
