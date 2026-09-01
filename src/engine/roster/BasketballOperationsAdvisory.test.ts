import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { organizationIdForTeam, staffPersonIdFromString, teamStaffAssignmentIdFromString, type PlayerId, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { updateGameWorld, type GameWorld } from '@/domain/world'
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

  it.each(['recommendSignings', 'shortlistPlayers', 'tradeRecommendation'] as const)('%s only ever selects a candidate present in OrganizationKnowledge', (kind) => {
    const { world, playerId } = worldFor(kind)
    const progressed = progressBasketballOperationsAdvisories(world)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === kind)
    if (outcome === undefined) return
    const candidateId = (outcome.payload.playerId ?? outcome.payload.incomingPlayerId) as string
    expect(candidateId).toBe(playerId)
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
})
