import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market'
import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { retentionNegotiationIdFor } from '@/domain/contract/ContractRetentionNegotiation'
import { agentIdFromString } from '@/domain/ids'
import { relationshipKey } from '@/domain/relationships'
import type { MarketReality } from '@/domain/market'
import { openUserContractRetention, submitUserContractRetentionOffer, withdrawUserContractRetention } from '@/app/contractRetention/ContractRetentionService'
import { assessRetentionEligibility, deriveRetentionPlayerResponse, expireStaleRetentionNegotiations, openRetentionNegotiation, respondToRetentionCounter, submitRetentionOffer, validateRetentionTermProposal } from './ContractRetentionEngine'

function fixture() {
  const base = createNewGame()
  const team = Object.values(base.teams).find((candidate) => candidate.coachId === base.userCoachId)!
  const contract = Object.values(base.contractsById).find((candidate) => candidate.teamId === team.id && team.rosterPlayerIds.includes(candidate.playerId))!
  const adjusted = { ...contract, term: { ...contract.term, expiresOn: addDays(base.currentDate, 90) } }
  const withoutRules = updateGameWorld(base, { contracts: Object.values(base.contractsById).map((candidate) => candidate.id === contract.id ? adjusted : candidate) })
  const templateRules = Object.values(base.salaryRulesBySeasonId)[0]!
  const world = { ...withoutRules, salaryRulesBySeasonId: { ...withoutRules.salaryRulesBySeasonId, [base.currentSeasonId]: { ...templateRules, seasonId: base.currentSeasonId } } }
  return { world, team, contract: adjusted }
}

function uncappedFixture() {
  const { world, team, contract } = fixture()
  const uncappedContract = {
    ...contract,
    compensation: {
      ...contract.compensation,
      years: contract.compensation.years?.map((year) => ({ ...year, capTreatment: { policy: 'NOT_APPLICABLE' as const } })),
    },
  }
  const contracts = Object.values(world.contractsById).map((item) => item.id === contract.id ? uncappedContract : item)
  const salaryRulesBySeasonId = Object.fromEntries(Object.entries(world.salaryRulesBySeasonId).map(([seasonId, rules]) => [
    seasonId,
    rules === undefined ? undefined : { ...rules, capModel: 'none' as const, capAccounting: 'NOT_APPLICABLE' as const },
  ]))
  return { world: { ...updateGameWorld(world, { contracts }), salaryRulesBySeasonId }, team, contract: uncappedContract }
}

function open(world: ReturnType<typeof fixture>['world'], teamId: ReturnType<typeof fixture>['team']['id'], contractId: ReturnType<typeof fixture>['contract']['id'], actionId = 'open:1') {
  return openRetentionNegotiation(world, { teamId, contractId, actionId })
}

describe('BS11C2 retention negotiation', () => {
  it('allows an active, integrity-valid user contract inside its separately configured window', () => {
    const { world, team, contract } = fixture()
    expect(assessRetentionEligibility(world, team.id, contract.id)).toMatchObject({ eligible: true, retentionWindowDays: 365, daysUntilExpiry: 90, proposedEffectiveDate: contract.term.expiresOn })
  })

  it('rejects contracts outside the configured retention window and expired contracts', () => {
    const { world, team, contract } = fixture()
    const farExpiry = { ...contract, term: { ...contract.term, expiresOn: addDays(world.currentDate, 366) } }
    const farWorld = updateGameWorld(world, { contracts: Object.values(world.contractsById).map((item) => item.id === contract.id ? farExpiry : item) })
    expect(assessRetentionEligibility(farWorld, team.id, contract.id).reasons).toContain('RETENTION_WINDOW_CLOSED')
    const expiredWorld = updateGameWorld(world, { currentDate: contract.term.expiresOn })
    expect(assessRetentionEligibility(expiredWorld, team.id, contract.id).reasons).toContain('CONTRACT_NOT_ACTIVE')
  })

  it('fails closed for non-user clubs, ambiguous integrity and NCAA-only participation', () => {
    const { world, team, contract } = fixture()
    const aiTeam = Object.values(world.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== world.userCoachId)!
    expect(assessRetentionEligibility(world, aiTeam.id, contract.id).reasons).toContain('TEAM_NOT_USER_CONTROLLED')
    const duplicate = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), { ...contract, id: `${contract.id}:duplicate` as typeof contract.id }] })
    expect(assessRetentionEligibility(duplicate, team.id, contract.id).reasons).toContain('CONTRACT_NOT_UNIQUE')
    const otherTeam = Object.values(world.teams).find((candidate) => candidate.id !== team.id)!
    const mismatch = updateGameWorld(world, { contracts: Object.values(world.contractsById).map((item) => item.id === contract.id ? { ...item, teamId: otherTeam.id } : item) })
    expect(assessRetentionEligibility(mismatch, team.id, contract.id).reasons).toContain('INTEGRITY_INVALID')
    const ncaaEcosystems = Object.fromEntries(Object.values(world.ecosystems).map((ecosystem) => [ecosystem.id, { ...ecosystem, kind: 'ncaaLike' as const }]))
    expect(assessRetentionEligibility({ ...world, ecosystems: ncaaEcosystems }, team.id, contract.id).reasons).toContain('NOT_PROFESSIONAL_ECOSYSTEM')
  })

  it('fails closed when effective-date SalaryRules cannot be resolved', () => {
    const { world, team, contract } = fixture()
    const withoutEffectiveRules = { ...world, salaryRulesBySeasonId: {} }
    const started = open(withoutEffectiveRules, team.id, contract.id)
    if (!started.ok) throw new Error(started.reason)
    expect(submitRetentionOffer(started.world, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 0, actionId: 'no-effective-rules', terms: { salary: contract.compensation.annualSalary, years: 1 } })).toMatchObject({ ok: false, reason: 'EFFECTIVE_CONTRACT_RULES_UNAVAILABLE' })
  })

  it('is idempotent for open and offer commands and keeps a distinct identity per predecessor', () => {
    const { world, team, contract } = fixture()
    const first = open(world, team.id, contract.id)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(open(first.world, team.id, contract.id).world).toBe(first.world)
    const terms = { salary: contract.compensation.annualSalary, years: 1 }
    const submitted = submitRetentionOffer(first.world, { teamId: team.id, negotiationId: first.negotiation.id, expectedRound: 0, actionId: 'offer:1', terms })
    expect(submitted.ok).toBe(true)
    if (!submitted.ok) return
    expect(submitRetentionOffer(submitted.world, { teamId: team.id, negotiationId: first.negotiation.id, expectedRound: 0, actionId: 'offer:1', terms }).world).toBe(submitted.world)
    expect(retentionNegotiationIdFor(team.id, contract.playerId, contract.id, 'same-action'))
      .not.toBe(retentionNegotiationIdFor(team.id, contract.playerId, `${contract.id}:new`, 'same-action'))
  })

  it('uses the active contract salary and returns deterministic ACCEPT, COUNTER and REJECT bands', () => {
    const { world, team, contract } = fixture()
    const identity = { teamId: team.id, playerId: contract.playerId, predecessorContractId: contract.id }
    const target = contract.compensation.annualSalary
    expect(deriveRetentionPlayerResponse(world, identity, { salary: Math.ceil(target * 0.95), years: 1 }).response.outcome).toBe('ACCEPTED')
    expect(deriveRetentionPlayerResponse(world, identity, { salary: Math.ceil(target * 0.9), years: 1 }).response.outcome).toBe('COUNTERED')
    expect(deriveRetentionPlayerResponse(world, identity, { salary: Math.floor(target * 0.7), years: 1 }).response.outcome).toBe('REJECTED')
    expect(deriveRetentionPlayerResponse(world, identity, { salary: Math.ceil(target * 0.9), years: 1 })).toEqual(deriveRetentionPlayerResponse(world, identity, { salary: Math.ceil(target * 0.9), years: 1 }))
    const knowledge = updateGameWorld(world, { marketKnowledge: [...world.marketKnowledge, { organizationId: team.organizationId, playerId: contract.playerId, expectedSalary: target * 100, confidence: 100, assessedAt: world.currentDate, source: 'MEDIA' }] })
    expect(deriveRetentionPlayerResponse(knowledge, identity, { salary: Math.ceil(target * 0.9), years: 1 })).toEqual(deriveRetentionPlayerResponse(world, identity, { salary: Math.ceil(target * 0.9), years: 1 }))
    const alteredReality: MarketReality = { playerId: contract.playerId, availability: 'OPEN', expectedSalary: target * 100, expectedYears: 20, playerWillingness: 100, sellerWillingness: 100, competition: 100 }
    const hiddenWorld = { ...world, marketRealityByPlayerId: { ...world.marketRealityByPlayerId, [contract.playerId]: alteredReality } }
    expect(deriveRetentionPlayerResponse(hiddenWorld, identity, { salary: Math.ceil(target * 0.9), years: 1 })).toEqual(deriveRetentionPlayerResponse(world, identity, { salary: Math.ceil(target * 0.9), years: 1 }))
  })

  it('validates structured option families, year bounds, duplicate control, and guarantees', () => {
    const { world, team, contract } = fixture()
    const validate = (terms: Parameters<typeof validateRetentionTermProposal>[3]) => validateRetentionTermProposal(world, team.id, contract.term.expiresOn, terms)
    for (const [type, decisionAuthority] of [['TEAM', 'TEAM'], ['PLAYER', 'PLAYER'], ['MUTUAL', 'BOTH']] as const) {
      expect(validate({ salary: 1_000_000, years: 2, options: [{ year: 2, type, decisionAuthority }], guarantees: [{ year: 1, guaranteedAmount: 1_000_000 }, { year: 2, guaranteedAmount: 500_000 }] }).status).toBe('VALID_NONBINDING_PROPOSAL')
    }
    expect(validate({ salary: 1_000_000, years: 2, options: [{ year: 3, type: 'PLAYER', decisionAuthority: 'PLAYER' }] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 2, options: [{ year: 2, type: 'TEAM', decisionAuthority: 'TEAM' }, { year: 2, type: 'PLAYER', decisionAuthority: 'PLAYER' }] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 2, options: [{ year: 1, type: 'MUTUAL', decisionAuthority: 'PLAYER' } as never] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 2, guarantees: [{ year: 2, guaranteedAmount: 1_000_001 }] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 2, guarantees: [{ year: 1, guaranteedAmount: 0 }, { year: 1, guaranteedAmount: 1 }] }).status).toBe('STRUCTURAL_INVALIDITY')
  })

  it('uses a small deterministic security adjustment for options and guarantees', () => {
    const { world, team, contract } = fixture()
    const identity = { teamId: team.id, playerId: contract.playerId, predecessorContractId: contract.id }
    const salary = Math.floor(contract.compensation.annualSalary * 0.92)
    const secure = deriveRetentionPlayerResponse(world, identity, { salary, years: 1, options: [{ year: 1, type: 'PLAYER', decisionAuthority: 'PLAYER' }], guarantees: [{ year: 1, guaranteedAmount: salary }] })
    const lessSecure = deriveRetentionPlayerResponse(world, identity, { salary, years: 1, options: [{ year: 1, type: 'TEAM', decisionAuthority: 'TEAM' }], guarantees: [{ year: 1, guaranteedAmount: 0 }] })
    expect(secure.response.outcome).toBe('ACCEPTED')
    expect(secure.response.reasonCodes).toEqual(expect.arrayContaining(['PLAYER_OPTION_INCREASES_SECURITY', 'GUARANTEE_INCREASES_SECURITY']))
    expect(lessSecure.response.outcome).toBe('COUNTERED')
    expect(lessSecure.response.reasonCodes).toEqual(expect.arrayContaining(['TEAM_OPTION_REDUCES_SECURITY', 'GUARANTEE_REDUCES_SECURITY']))
    expect(secure).toEqual(deriveRetentionPlayerResponse(world, identity, { salary, years: 1, options: [{ year: 1, type: 'PLAYER', decisionAuthority: 'PLAYER' }], guarantees: [{ year: 1, guaranteedAmount: salary }] }))
  })

  it('uses only recorded role promises, player morale, and the direct player-to-coach relationship as preference inputs', () => {
    const { world, team, contract } = fixture()
    const identity = { teamId: team.id, playerId: contract.playerId, predecessorContractId: contract.id }
    const salary = contract.compensation.annualSalary
    const neutral = deriveRetentionPlayerResponse(world, identity, { salary, years: 1, role: 'STARTER' })
    const rolePromiseId = 'retention-preference-role-promise'
    const withRolePromise = {
      ...world,
      rolePromisesById: { ...world.rolePromisesById, [rolePromiseId]: { id: rolePromiseId, playerId: contract.playerId, teamOrganizationId: team.organizationId, role: 'ROTATION' as const, acceptedOn: world.currentDate, status: 'ACTIVE' as const } },
    }
    const improvedRole = deriveRetentionPlayerResponse(withRolePromise, identity, { salary, years: 1, role: 'STARTER' })
    const mismatchedRole = deriveRetentionPlayerResponse(withRolePromise, identity, { salary, years: 1, role: 'DEPTH' })
    expect(improvedRole.factors.roleOpportunity).toBeGreaterThan(neutral.factors.roleOpportunity)
    expect(improvedRole.response.reasonCodes).toContain('ROLE_IMPROVEMENT')
    expect(mismatchedRole.factors.roleOpportunity).toBeLessThan(neutral.factors.roleOpportunity)
    expect(mismatchedRole.response.reasonCodes).toContain('ROLE_BELOW_EXPECTATION')

    const lowMoraleWorld = { ...world, moraleByPersonId: { ...world.moraleByPersonId, [contract.playerId]: { personId: contract.playerId, value: 10, events: [] } } }
    const lowMorale = deriveRetentionPlayerResponse(lowMoraleWorld, identity, { salary, years: 1 })
    expect(lowMorale.factors.morale).toBeLessThan(neutral.factors.morale)
    expect(lowMorale.response.reasonCodes).toContain('LOW_MORALE')

    const coach = world.coaches[team.coachId!]!
    const playerPersonId = world.players[contract.playerId]!.personId ?? contract.playerId
    const relationId = relationshipKey(playerPersonId, coach.personId)
    const withRelationship = { ...world, relationshipsByKey: { ...world.relationshipsByKey, [relationId]: { sourceId: playerPersonId, targetId: coach.personId, value: 80, events: [] } } }
    const positiveRelationship = deriveRetentionPlayerResponse(withRelationship, identity, { salary, years: 1 })
    expect(positiveRelationship.factors.relationship).toBeGreaterThan(neutral.factors.relationship)
    expect(positiveRelationship.response.reasonCodes).toContain('POSITIVE_COACH_RELATIONSHIP')
    const adverseContext = {
      ...withRolePromise,
      moraleByPersonId: { ...withRolePromise.moraleByPersonId, [contract.playerId]: { personId: contract.playerId, value: 0, events: [] } },
      relationshipsByKey: { ...withRolePromise.relationshipsByKey, [relationId]: { sourceId: playerPersonId, targetId: coach.personId, value: -100, events: [] } },
    }
    const boundarySalary = Math.ceil(contract.compensation.annualSalary * 0.95)
    const roleMismatchResponse = deriveRetentionPlayerResponse(adverseContext, identity, { salary: boundarySalary, years: 1, role: 'DEPTH' })
    const roleImprovementResponse = deriveRetentionPlayerResponse(adverseContext, identity, { salary: boundarySalary, years: 1, role: 'STARTER' })
    expect(roleMismatchResponse.response.outcome).toBe('REJECTED')
    expect(roleImprovementResponse.response.outcome).toBe('ACCEPTED')
    expect(deriveRetentionPlayerResponse(world, identity, { salary, years: 1 })).toEqual(deriveRetentionPlayerResponse(world, identity, { salary, years: 1 }))
  })

  it('accepts structured games-played incentives but rejects malformed, unsupported and out-of-term triggers', () => {
    const { world, team, contract } = fixture()
    const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id))!
    const validate = (terms: Parameters<typeof validateRetentionTermProposal>[3]) => validateRetentionTermProposal(world, team.id, contract.term.expiresOn, terms)
    const supported = { type: 'GAMES_PLAYED' as const, competitionId: competition.id, contractYear: 1, minimumGamesPlayed: 50, amount: 75_000 }
    expect(validate({ salary: 1_000_000, years: 1, incentives: [supported] }).status).toBe('VALID_NONBINDING_PROPOSAL')
    expect(validate({ salary: 1_000_000, years: 1, incentives: [supported, { ...supported, minimumGamesPlayed: 60 }] }).status).toBe('VALID_NONBINDING_PROPOSAL')
    expect(validate({ salary: 1_000_000, years: 1, incentives: [{ ...supported, amount: -1 }] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 1, incentives: [{ ...supported, type: 'CHAMPIONSHIP' } as never] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 1, incentives: [{ ...supported, contractYear: 2 }] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 1, incentives: [{ ...supported, minimumGamesPlayed: 0 }] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 1, incentives: [{ ...supported, competitionId: 'missing' as typeof competition.id }] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 1, incentives: [supported, supported] }).status).toBe('STRUCTURAL_INVALIDITY')
  })

  it('accepts only the explicitly supported future player trade-consent clause', () => {
    const { world, team, contract } = fixture()
    const validate = (terms: Parameters<typeof validateRetentionTermProposal>[3]) => validateRetentionTermProposal(world, team.id, contract.term.expiresOn, terms)
    const consent = { type: 'TRADE_CONSENT_REQUIRED' as const, decisionAuthority: 'PLAYER' as const }
    expect(validate({ salary: 1_000_000, years: 1, clauses: [consent] }).status).toBe('VALID_NONBINDING_PROPOSAL')
    expect(validate({ salary: 1_000_000, years: 1, clauses: [{ ...consent, decisionAuthority: 'AGENT' } as never] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 1, clauses: [{ type: 'BUYOUT', decisionAuthority: 'PLAYER' } as never] }).status).toBe('STRUCTURAL_INVALIDITY')
    expect(validate({ salary: 1_000_000, years: 1, clauses: [consent, consent] }).status).toBe('STRUCTURAL_INVALIDITY')
  })

  it('adds future player control to deterministic response and a single bounded consent counter', () => {
    const { world, team, contract } = fixture()
    const identity = { teamId: team.id, playerId: contract.playerId, predecessorContractId: contract.id }
    const salary = Math.floor(contract.compensation.annualSalary * 0.9)
    const plain = deriveRetentionPlayerResponse(world, identity, { salary, years: 1 })
    const protectedOffer = deriveRetentionPlayerResponse(world, identity, { salary, years: 1, clauses: [{ type: 'TRADE_CONSENT_REQUIRED', decisionAuthority: 'PLAYER' }] })
    expect(protectedOffer.compositeScore).toBeGreaterThan(plain.compositeScore)
    expect(protectedOffer.response.reasonCodes).toContain('TRADE_CONSENT_ADDS_PLAYER_CONTROL')
    const started = open(world, team.id, contract.id)
    if (!started.ok) throw new Error(started.reason)
    const countered = submitRetentionOffer(started.world, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 0, actionId: 'consent-counter', terms: { salary, years: 1 } })
    if (!countered.ok) throw new Error(countered.reason)
    expect(countered.negotiation.rounds[0]!.playerResponse.counterTerms).toMatchObject({ clauses: [{ type: 'TRADE_CONSENT_REQUIRED', decisionAuthority: 'PLAYER' }] })
    expect(countered.negotiation.rounds[0]!.offer).not.toHaveProperty('clauses')
    expect(Object.isFrozen(countered.negotiation.rounds[0]!.playerResponse.counterTerms!.clauses)).toBe(true)
    const revised = submitRetentionOffer(countered.world, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 1, actionId: 'consent-revision', terms: { salary: contract.compensation.annualSalary, years: 1, clauses: [{ type: 'TRADE_CONSENT_REQUIRED', decisionAuthority: 'PLAYER' }] } })
    if (!revised.ok) throw new Error(revised.reason)
    expect(revised.negotiation.rounds[0]!.offer).not.toHaveProperty('clauses')
    expect(revised.negotiation.rounds[1]!.offer.clauses).toEqual([{ type: 'TRADE_CONSENT_REQUIRED', decisionAuthority: 'PLAYER' }])
  })

  it('values incentives conservatively as contingent compensation and counters only their amount', () => {
    const { world, team, contract } = fixture()
    const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id))!
    const identity = { teamId: team.id, playerId: contract.playerId, predecessorContractId: contract.id }
    const salary = Math.floor(contract.compensation.annualSalary * 0.9)
    const incentive = { type: 'GAMES_PLAYED' as const, competitionId: competition.id, contractYear: 1, minimumGamesPlayed: 50, amount: 100_000 }
    const plain = deriveRetentionPlayerResponse(world, identity, { salary, years: 1 })
    const contingent = deriveRetentionPlayerResponse(world, identity, { salary, years: 1, incentives: [incentive] })
    expect(contingent.compositeScore).toBeGreaterThan(plain.compositeScore)
    expect(contingent.response.reasonCodes).toContain('INCENTIVE_ADDS_CONTINGENT_VALUE')
    expect(contingent.response.outcome).toBe('COUNTERED')
    expect(contingent.response.counterTerms?.salary).toBeGreaterThan(salary)

    const started = open(world, team.id, contract.id)
    if (!started.ok) throw new Error(started.reason)
    const countered = submitRetentionOffer(started.world, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 0, actionId: 'incentive-counter', terms: { salary, years: 1, incentives: [incentive] } })
    if (!countered.ok) throw new Error(countered.reason)
    expect(countered.negotiation.rounds[0]!.playerResponse.counterTerms).toMatchObject({ salary: expect.any(Number), incentives: [{ ...incentive, amount: 110_000 }] })
    expect(countered.negotiation.rounds[0]!.offer.salary).toBe(salary)
    expect(countered.negotiation.rounds[0]!.offer.incentives).toEqual([incentive])
    expect(countered.negotiation.rounds[0]!.offer).not.toHaveProperty('guarantees')
    expect(Object.isFrozen(countered.negotiation.rounds[0]!.offer.incentives)).toBe(true)
    expect(Object.isFrozen(countered.negotiation.rounds[0]!.offer.incentives![0])).toBe(true)
    const revisedIncentive = { ...incentive, amount: 125_000 }
    const revised = submitRetentionOffer(countered.world, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 1, actionId: 'incentive-revision', terms: { salary: contract.compensation.annualSalary, years: 1, incentives: [revisedIncentive] } })
    if (!revised.ok) throw new Error(revised.reason)
    expect(revised.negotiation.rounds[0]!.offer.incentives).toEqual([incentive])
    expect(revised.negotiation.rounds[1]!.offer.incentives).toEqual([revisedIncentive])
  })

  it('reuses canonical Agent authority only when a real representation and Agent are present', () => {
    const { world, team, contract } = fixture()
    const agentId = agentIdFromString('retention-test-agent')
    const agentWorld = {
      ...world,
      agentsById: { ...world.agentsById, [agentId]: { id: agentId, name: 'Test Agent', reputation: 50, abilities: { negotiation: 90, marketKnowledge: 50, network: 50, clientManagement: 50, mediaInfluence: 50 }, personality: { aggressiveness: 90, loyalty: 50, opportunism: 90, patience: 50, discretion: 50 } } },
      playerRepresentations: [...world.playerRepresentations, { playerId: contract.playerId, agentId, trust: 50, startedOn: world.currentDate }],
    }
    const response = deriveRetentionPlayerResponse(agentWorld, { teamId: team.id, playerId: contract.playerId, predecessorContractId: contract.id }, { salary: Math.floor(contract.compensation.annualSalary * 0.9), years: 1 }).response
    expect(response).toMatchObject({ outcome: 'COUNTERED', origin: 'AGENT', reasonCodes: expect.arrayContaining(['AGENT_PUSHING_HIGHER_TERMS']) })
    expect(response.counterTerms!.salary).toBeGreaterThan(contract.compensation.annualSalary)
  })

  it('accepts terms without creating contracts, roster changes, Finance or Governance state', () => {
    const { world, team, contract } = uncappedFixture()
    const started = open(world, team.id, contract.id)
    if (!started.ok) throw new Error(started.reason)
    const before = { contracts: world.contractsById, roster: team.rosterPlayerIds, finance: world.financialCommitmentsById, governance: world.governanceDecisionsById }
    const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id))!
    const acceptedIncentive = { type: 'GAMES_PLAYED' as const, competitionId: competition.id, contractYear: 2, minimumGamesPlayed: 50, amount: 75_000 }
    const acceptedClause = { type: 'TRADE_CONSENT_REQUIRED' as const, decisionAuthority: 'PLAYER' as const }
    const accepted = submitRetentionOffer(started.world, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 0, actionId: 'accept:1', terms: { salary: contract.compensation.annualSalary, years: 2, agentFee: 25_000, agentFeePayer: 'CLUB', options: [{ year: 2, type: 'PLAYER', decisionAuthority: 'PLAYER' }], guarantees: [{ year: 1, guaranteedAmount: contract.compensation.annualSalary }, { year: 2, guaranteedAmount: Math.floor(contract.compensation.annualSalary / 2) }], incentives: [acceptedIncentive], clauses: [acceptedClause] } })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.negotiation).toMatchObject({ status: 'ACCEPTED', acceptedTerms: { agentFeePayer: 'CLUB' } })
    expect(accepted.negotiation.acceptedTerms).toMatchObject({ options: [{ year: 2, type: 'PLAYER', decisionAuthority: 'PLAYER' }], guarantees: [{ year: 1, guaranteedAmount: contract.compensation.annualSalary }, { year: 2, guaranteedAmount: Math.floor(contract.compensation.annualSalary / 2) }], incentives: [acceptedIncentive], clauses: [acceptedClause] })
    expect(accepted.world.contractsById).toEqual(before.contracts)
    expect(accepted.world.teams[team.id]!.rosterPlayerIds).toEqual(before.roster)
    expect(accepted.world.financialCommitmentsById).toEqual(before.finance)
    expect(accepted.world.governanceDecisionsById).toEqual(before.governance)
    const releasedWithProposal = releasePlayer(accepted.world, team.id, contract.playerId)
    expect(releasedWithProposal.contractsById[contract.id]!.termination?.reason).toBe('released')
    expect(releasedWithProposal.teams[team.id]!.rosterPlayerIds).not.toContain(contract.playerId)
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(accepted.world, '2032-10-01T00:00:00.000Z'))))
    expect(restored.retentionNegotiationsById[accepted.negotiation.id]!.acceptedTerms).toEqual(accepted.negotiation.acceptedTerms)
    const salaryOnlyStart = open(world, team.id, contract.id, 'legacy-open')
    if (!salaryOnlyStart.ok) throw new Error(salaryOnlyStart.reason)
    const salaryOnly = submitRetentionOffer(salaryOnlyStart.world, { teamId: team.id, negotiationId: salaryOnlyStart.negotiation.id, expectedRound: 0, actionId: 'legacy-salary-only', terms: { salary: contract.compensation.annualSalary, years: 1 } })
    if (!salaryOnly.ok) throw new Error(salaryOnly.reason)
    const salaryOnlyRestored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(salaryOnly.world, '2032-10-01T00:00:00.000Z'))))
    expect(salaryOnlyRestored.retentionNegotiationsById[salaryOnly.negotiation.id]!.acceptedTerms).toEqual({ salary: contract.compensation.annualSalary, years: 1 })
  })

  it('records a player counter and an explicit club acceptance without binding the terms', () => {
    const { world, team, contract } = fixture()
    const started = open(world, team.id, contract.id)
    if (!started.ok) throw new Error(started.reason)
    const countered = submitRetentionOffer(started.world, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 0, actionId: 'counter:1', terms: { salary: Math.floor(contract.compensation.annualSalary * 0.9), years: 1 } })
    if (!countered.ok) throw new Error(countered.reason)
    expect(countered.negotiation.status).toBe('PLAYER_COUNTERED')
    expect(countered.negotiation.rounds).toHaveLength(1)
    expect(countered.negotiation.rounds[0]!.playerResponse.counterTerms).toBeDefined()
    const accepted = respondToRetentionCounter(countered.world, { teamId: team.id, negotiationId: countered.negotiation.id, expectedRound: 1, actionId: 'accept-counter:1', action: 'ACCEPT_COUNTER' })
    if (!accepted.ok) throw new Error(accepted.reason)
    expect(accepted.negotiation).toMatchObject({ status: 'ACCEPTED', acceptedTerms: countered.negotiation.currentTerms })
    expect(accepted.negotiation.rounds[0]!.clubAction?.kind).toBe('ACCEPT_COUNTER')
    expect(accepted.world.contractsById[contract.id]!.term.expiresOn).toBe(contract.term.expiresOn)
  })

  it('records a revised offer as a single next immutable round', () => {
    const { world, team, contract } = fixture()
    const started = open(world, team.id, contract.id)
    if (!started.ok) throw new Error(started.reason)
    const originalTerms = { salary: Math.floor(contract.compensation.annualSalary * 0.9), years: 1, options: [{ year: 1, type: 'TEAM' as const, decisionAuthority: 'TEAM' as const }], guarantees: [{ year: 1, guaranteedAmount: Math.floor(contract.compensation.annualSalary * 0.45) }] }
    const countered = submitRetentionOffer(started.world, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 0, actionId: 'revision-counter', terms: originalTerms })
    if (!countered.ok) throw new Error(countered.reason)
    expect(countered.negotiation.rounds[0]!.playerResponse.counterTerms).toMatchObject({ options: [{ year: 1, type: 'PLAYER', decisionAuthority: 'PLAYER' }], guarantees: [{ year: 1, guaranteedAmount: originalTerms.guarantees[0]!.guaranteedAmount }] })
    const revised = submitRetentionOffer(countered.world, { teamId: team.id, negotiationId: countered.negotiation.id, expectedRound: 1, actionId: 'revision-offer', terms: { salary: contract.compensation.annualSalary, years: 1 } })
    if (!revised.ok) throw new Error(revised.reason)
    expect(revised.negotiation.rounds).toHaveLength(2)
    expect(revised.negotiation.rounds[0]!.offer).toEqual(originalTerms)
    expect(revised.negotiation.rounds[0]!.clubAction).toMatchObject({ kind: 'REVISE_OFFER', revisedTerms: { salary: contract.compensation.annualSalary } })
    expect(revised.negotiation.rounds[1]!.round).toBe(2)
  })

  it('can counter a partial guarantee when no option clause requires the bounded counter change', () => {
    const { world, team, contract } = fixture()
    const started = open(world, team.id, contract.id)
    if (!started.ok) throw new Error(started.reason)
    const countered = submitRetentionOffer(started.world, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 0, actionId: 'guarantee-counter', terms: { salary: Math.floor(contract.compensation.annualSalary * 0.9), years: 1, guarantees: [{ year: 1, guaranteedAmount: Math.floor(contract.compensation.annualSalary * 0.5) }] } })
    if (!countered.ok) throw new Error(countered.reason)
    expect(countered.negotiation.rounds[0]!.playerResponse.counterTerms!.guarantees).toEqual([{ year: 1, guaranteedAmount: countered.negotiation.rounds[0]!.playerResponse.counterTerms!.salary }])
  })

  it('starts cooldown when a response rejects the offered economic band', () => {
    const { world, team, contract } = fixture()
    const started = open(world, team.id, contract.id)
    if (!started.ok) throw new Error(started.reason)
    const rejected = submitRetentionOffer(started.world, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 0, actionId: 'reject:1', terms: { salary: Math.max(1, Math.floor(contract.compensation.annualSalary * 0.7)), years: 1 } })
    if (!rejected.ok) throw new Error(rejected.reason)
    expect(rejected.negotiation).toMatchObject({ status: 'REJECTED', closedOn: world.currentDate, reopenOn: addDays(world.currentDate, 3) })
    expect(assessRetentionEligibility(rejected.world, team.id, contract.id).reasons).toContain('COOLDOWN_ACTIVE')
  })

  it('enforces three calendar days after withdrawal and restores cooldown through Save V4', () => {
    const { world, team, contract } = fixture()
    const started = open(world, team.id, contract.id)
    if (!started.ok) throw new Error(started.reason)
    const withdrawn = withdrawUserContractRetention(started.world, { teamId: team.id, negotiationId: started.negotiation.id, actionId: 'withdraw:1' })
    if (!withdrawn.ok) throw new Error(withdrawn.reason)
    expect(withdrawUserContractRetention(withdrawn.world, { teamId: team.id, negotiationId: started.negotiation.id, actionId: 'withdraw:1' }).world).toBe(withdrawn.world)
    expect(withdrawn.negotiation.reopenOn).toBe(addDays(world.currentDate, 3))
    const saved = serializeGameWorldV4(withdrawn.world, '2032-10-01T00:00:00.000Z')
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))
    expect(restored.retentionNegotiationsById[withdrawn.negotiation.id]!.reopenOn).toBe(withdrawn.negotiation.reopenOn)
    const { retentionNegotiations: _retentionNegotiations, ...legacyPayload } = saved.payload
    expect(deserializeGameWorldV4({ ...saved, payload: legacyPayload }).retentionNegotiationsById).toEqual({})
    expect(assessRetentionEligibility(restored, team.id, contract.id).reasons).toContain('COOLDOWN_ACTIVE')
    const reopened = updateGameWorld(restored, { currentDate: withdrawn.negotiation.reopenOn! })
    expect(assessRetentionEligibility(reopened, team.id, contract.id).eligible).toBe(true)
  })

  it('invalidates nonbinding negotiations when the predecessor is released', () => {
    const { world, team, contract } = uncappedFixture()
    const started = open(world, team.id, contract.id)
    if (!started.ok) throw new Error(started.reason)
    const released = releasePlayer(started.world, team.id, contract.playerId)
    const expired = expireStaleRetentionNegotiations(released)
    expect(expired.retentionNegotiationsById[started.negotiation.id]).toMatchObject({ status: 'EXPIRED', terminalReason: 'PREDECESSOR_RELEASED' })
    expect(submitRetentionOffer(expired, { teamId: team.id, negotiationId: started.negotiation.id, expectedRound: 0, actionId: 'stale:1', terms: { salary: contract.compensation.annualSalary, years: 1 } })).toMatchObject({ ok: false, reason: 'STALE_NEGOTIATION' })
  })

  it('uses the existing user-club boundary and never exposes AI-club initiation through the service', () => {
    const { world, team, contract } = fixture()
    const aiTeam = Object.values(world.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== world.userCoachId)!
    const unauthorized = openUserContractRetention(world, { teamId: aiTeam.id, contractId: contract.id, actionId: 'ai:1' })
    expect(unauthorized).toMatchObject({ ok: false, reason: 'TEAM_NOT_USER_CONTROLLED', world })
    expect(openUserContractRetention(world, { teamId: team.id, contractId: contract.id, actionId: 'user:1' }).ok).toBe(true)
  })
})
