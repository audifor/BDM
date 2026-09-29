import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createClubStrategicState } from '@/domain/clubStrategy'
import { createFinancialAccount, createFinancialTransaction } from '@/domain/finance/FinancialLedger'
import { createPayable } from '@/domain/finance/Treasury'
import { createPlayer } from '@/domain/player'
import { organizationIdForTeam, type TeamId } from '@/domain/ids'
import { createPersonality } from '@/domain/personality'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createGovernanceAuthorityGrant, createGovernanceBody, createGovernanceInstitution } from '@/domain/governance/Governance'
import { createGovernanceDecisionParticipationGrant } from '@/domain/governance/GovernanceDecision'
import { createGovernanceRequest, createGovernanceRequestEvent } from '@/domain/governance/GovernanceRequest'
import { assessClubNeeds } from '@/engine/clubNeeds'
import { assessGMDecisionContext, assessGMOptionAuthority, resolveGovernanceOptionPolicy } from './GMDecisionContextEngine'

describe('GM decision context', () => {
  let base: GameWorld
  beforeAll(() => { base = createNewGame() }, 120_000)

  function team(user = false) {
    return Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && (user ? candidate.coachId === base.userCoachId : candidate.coachId !== base.userCoachId) && candidate.rosterPlayerIds.length >= 5)!
  }

  function shortRoster(world: GameWorld, teamId: TeamId): GameWorld {
    return updateGameWorld(world, { teams: Object.values(world.teams).map((candidate) => candidate.id === teamId ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.slice(0, 4) } : candidate) })
  }

  function mode(world: GameWorld, teamId: TeamId, value: 'CONTEND' | 'DEVELOP' | 'SELL' | 'REBUILD' | 'SURVIVE' | 'COMPETE'): GameWorld {
    const state = world.clubStrategicStatesByTeamId[teamId]
    const fallback = { teamId, mode: value, horizon: 'NEAR_TERM' as const, financialPosture: 'HEALTHY' as const, riskTolerance: 'MODERATE' as const, developmentEmphasis: 50, retentionPosture: 'SELECTIVE' as const, acquisitionAggression: 'MODERATE' as const, sellingWillingness: 'LOW' as const, establishedOn: world.currentDate, lastReviewedOn: world.currentDate, transitionReason: 'INITIAL_ASSESSMENT' as const }
    return updateGameWorld(world, { clubStrategicStatesByTeamId: { ...world.clubStrategicStatesByTeamId, [teamId]: createClubStrategicState({ ...fallback, ...state, mode: value }) } })
  }

  it('uses the same derived, non-mutating engine for the user and AI clubs', () => {
    const ai = team(false)
    const user = team(true)
    const before = base.playerTransactionsById
    const beforeGovernanceEvents = base.governanceDecisionEventsById
    const beforeRequests = base.governanceRequestsById
    const beforeContracts = base.contractsById
    expect(assessGMDecisionContext(base, ai.id).teamId).toBe(ai.id)
    expect(assessGMDecisionContext(base, user.id).teamId).toBe(user.id)
    expect(assessGMDecisionContext(base, ai.id).needsAssessment.knowledgePerspective).toBe('ORGANIZATION_KNOWLEDGE')
    expect(assessGMDecisionContext(base, user.id).needsAssessment.knowledgePerspective).toBe('USER_ANALYTICS')
    const planningWorld = shortRoster(base, ai.id)
    const aiContext = assessGMDecisionContext(planningWorld, ai.id)
    expect(aiContext.options.map((option) => [option.kind, option.priority, option.planningEligibility, option.executionReadiness])).toEqual(assessGMDecisionContext(planningWorld, ai.id).options.map((option) => [option.kind, option.priority, option.planningEligibility, option.executionReadiness]))
    const acquisitionOptions = aiContext.options.filter((option) => option.kind === 'EXTERNAL_ACQUISITION')
    expect(acquisitionOptions.length).toBeGreaterThan(0)
    expect(acquisitionOptions.every((option) => option.planningEligibility === 'SELECTABLE' && option.executionReadiness === 'UNKNOWN_AUTHORITY')).toBe(true)
    expect(JSON.stringify(assessGMDecisionContext(base, ai.id))).not.toContain('Overall')
    expect(base.playerTransactionsById).toBe(before)
    expect(base.governanceDecisionEventsById).toBe(beforeGovernanceEvents)
    expect(base.governanceRequestsById).toBe(beforeRequests)
    expect(base.contractsById).toBe(beforeContracts)
    expect(base.delegationOutcomesById).toEqual({})
  })

  it('keeps organizational strategy primary and orders response options from inspectable factors', () => {
    const club = team(false)
    const contend = assessGMDecisionContext(mode(shortRoster(base, club.id), club.id, 'CONTEND'), club.id)
    const develop = assessGMDecisionContext(mode(shortRoster(base, club.id), club.id, 'DEVELOP'), club.id)
    const need = contend.needsAssessment.needs.find((item) => item.severity === 'HIGH' || item.severity === 'CRITICAL')
    expect(need).toBeDefined()
    if (!need) throw new Error('Expected a representative high-priority need in the seeded club')
    const options = (context: typeof contend) => context.options.filter((item) => item.needId === need.id)
    expect(options(contend).find((item) => item.kind === 'EXTERNAL_ACQUISITION')?.strategicAlignment).toBe('HIGH')
    expect(options(develop).find((item) => item.kind === 'INTERNAL_DEVELOPMENT')?.strategicAlignment).toBe('HIGH')
    expect(options(develop).find((item) => item.kind === 'INTERNAL_ROLE_REALLOCATION')?.feasibility).toBe('HIGH')
    expect(options(develop).map((item) => item.priority)).toEqual(options(develop).map((item) => item.priority).slice().sort((a, b) => a - b))
  })

  it('makes outgoing review strategically aligned when SELL strategy meets a genuine surplus', () => {
    const club = team(false)
    const ownIds = new Set(club.rosterPlayerIds)
    const players = Object.values(base.players).map((player) => ownIds.has(player.id)
      ? createPlayer({ ...player, basketball: { ...player.basketball, primaryPosition: 'SG', secondaryPositions: [] } })
      : player)
    const surplus = mode(updateGameWorld(base, { players }), club.id, 'SELL')
    const context = assessGMDecisionContext(surplus, club.id)
    const outgoing = context.options.find((option) => option.kind === 'OUTGOING_MARKET_REVIEW')
    expect(outgoing?.strategicAlignment).toBe('HIGH')
    expect(context.needsAssessment.needs.some((need) => need.kind === 'POSITION_SURPLUS')).toBe(true)
  })

  it('uses an explicit organizational fallback instead of inventing a GM', () => {
    const club = team(false)
    const short = shortRoster(base, club.id)
    const withoutAssignments = updateGameWorld(short, { responsibilities: Object.values(short.responsibilitiesById).filter((responsibility) => responsibility.teamId !== club.id) })
    const context = assessGMDecisionContext(withoutAssignments, club.id)
    expect(context.decisionMakerStatus).toBe('ORGANIZATIONAL_FALLBACK')
    expect(context.decisionParticipants).toEqual([])
    expect(context.options.some((option) => option.reasons.includes('NO_ASSIGNED_DECISION_MAKER'))).toBe(true)
  })

  it('uses assigned staff personality as a modest response signal', () => {
    const club = team(false)
    const source = Object.values(base.staffPeopleById)[0]!
    const staffId = `staff:bs9c:${club.id}` as typeof source.id
    const personId = `person:staff:bs9c:${club.id}` as never
    const staff = { ...source, id: staffId, personId }
    const assignment = { id: `assignment:bs9c:${club.id}` as never, staffPersonId: staffId, teamId: club.id, role: 'generalManager' as const, assignedOn: base.currentDate }
    const responsibility = { id: `responsibility:${club.id}:recommendSignings` as never, teamId: club.id, kind: 'recommendSignings' as const, mode: 'advisory' as const, holderStaffId: staffId }
    const traits = (ambition: number) => createPersonality({ values: { ambition, professionalism: 50, loyalty: 50, resilience: 50, temperament: 50, teamOrientation: 50, adaptability: 50, competitiveness: ambition } })
    const styled = (ambition: number) => {
      const withStaff = updateGameWorld(shortRoster(base, club.id), {
        staffPeople: [...Object.values(base.staffPeopleById), staff],
        teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), assignment],
        responsibilities: [...Object.values(base.responsibilitiesById).filter((item) => item.teamId !== club.id), responsibility],
      })
      return updateGameWorld(withStaff, { personalitiesByPersonId: { ...withStaff.personalitiesByPersonId, [staffId]: traits(ambition) } })
    }
    const high = assessGMDecisionContext(styled(90), club.id)
    const low = assessGMDecisionContext(styled(10), club.id)
    expect(high.decisionParticipants).toContainEqual(expect.objectContaining({ staffId, role: 'generalManager', ambition: 90, competitiveness: 90 }))
    expect(high.options.find((item) => item.kind === 'EXTERNAL_ACQUISITION')?.staffStyleAlignment).toBe('HIGH')
    expect(low.options.find((item) => item.kind === 'EXTERNAL_ACQUISITION')?.staffStyleAlignment).toBe('LOW')
    expect(high.options.some((item) => item.feasibility === 'LOW')).toBe(low.options.some((item) => item.feasibility === 'LOW'))
  })

  it('changes response readiness from organization knowledge only and never exposes external targets', () => {
    const club = team(false)
    const external = Object.values(base.players).find((player) => !base.teams[club.id]!.rosterPlayerIds.includes(player.id))!
    const short = shortRoster(base, club.id)
    const low = assessGMDecisionContext(short, club.id)
    const known = updateGameWorld(short, { organizationKnowledge: [{ organizationId: organizationIdForTeam(club.id), subjectPlayerId: external.id, dimensions: { shooting: { coverage: 0.9, confidence: 0.8, assessedAt: base.currentDate, provenance: 'scoutReport', estimate: 90, uncertainty: 1 } } }] })
    const high = assessGMDecisionContext(known, club.id)
    expect(low.externalKnowledgeReadiness).toBe('LOW')
    expect(high.externalKnowledgeReadiness).toBe('HIGH')
    expect(JSON.stringify(high.options)).not.toContain(external.id)
    expect(JSON.stringify(high.options)).not.toContain('90')
    const needId = low.needsAssessment.needs[0]?.id
    const lowOptions = low.options.filter((option) => option.needId === needId)
    expect(lowOptions.findIndex((option) => option.kind === 'SCOUTING_EXPANSION')).toBeLessThan(lowOptions.findIndex((option) => option.kind === 'EXTERNAL_ACQUISITION'))
  })

  it('keeps autonomous needs and response ordering unchanged when unknown external truth changes', () => {
    const club = team(false)
    const external = Object.values(base.players).find((player) => !base.teams[club.id]!.rosterPlayerIds.includes(player.id))!
    const before = assessGMDecisionContext(base, club.id)
    const altered = updateGameWorld(base, { players: Object.values(base.players).map((player) => player.id === external.id ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map((key) => [key, 0])) as typeof player.basketball.ratings } } : player) })
    const after = assessGMDecisionContext(altered, club.id)
    expect(after.externalKnowledgeReadiness).toBe(before.externalKnowledgeReadiness)
    expect(after.options.filter((item) => item.kind === 'EXTERNAL_ACQUISITION').every((item) => item.knowledgeReadiness === before.externalKnowledgeReadiness)).toBe(true)
    expect(after.needsAssessment.needs).toEqual(before.needsAssessment.needs)
    expect(after.options).toEqual(before.options)
  })

  it('preserves basketball needs under Finance V2 stress and reduces external feasibility', () => {
    const club = team(true)
    const cash = createFinancialAccount({ id: `bs9c-cash:${club.id}`, organizationId: club.organizationId, accountType: 'CASH', currencyCode: 'EUR' })
    const equity = createFinancialAccount({ id: `bs9c-equity:${club.id}`, organizationId: club.organizationId, accountType: 'EQUITY', currencyCode: 'EUR' })
    const amount = { currencyCode: 'EUR', minorUnits: 1_000 }
    const opening = createFinancialTransaction({ id: `bs9c-opening:${club.id}`, organizationId: club.organizationId, effectiveOn: base.currentDate, transactionType: 'OPENING_BALANCE', amount, postings: [{ accountId: cash.id, direction: 'DEBIT', amount }, { accountId: equity.id, direction: 'CREDIT', amount }], provenance: { kind: 'TEST', id: 'bs9c' } })
    const payable = createPayable({ id: `bs9c-payable:${club.id}`, organizationId: club.organizationId, amount: { currencyCode: 'EUR', minorUnits: 10_000 }, recognizedOn: base.currentDate, dueOn: addDays(base.currentDate, 10), counterparty: { kind: 'EXTERNAL', label: 'Supplier' }, provenance: { kind: 'TEST', id: 'bs9c' } })
    const short = shortRoster(base, club.id)
    const world = updateGameWorld(short, { financialAccounts: [cash, equity], financialTransactions: [opening], payables: [payable] })
    const context = assessGMDecisionContext(world, club.id)
    expect(context.needsAssessment.financialContext).toBe('STRESSED')
    expect(context.needsAssessment.needs.some((need) => need.kind === 'ROSTER_SIZE')).toBe(true)
    expect(context.options.filter((option) => option.kind === 'EXTERNAL_ACQUISITION').every((option) => option.feasibility === 'LOW')).toBe(true)
  })

  it('surfaces unresolved roster, strategy, or budget Governance requests as blockers', () => {
    const club = team(false)
    const institution = createGovernanceInstitution({ id: 'bs9c-institution', universe: 'PROFESSIONAL_CLUB', name: 'BS9C Club', teamIds: [club.id] })
    const staff = Object.values(base.staffPeopleById)[0]!
    const request = createGovernanceRequest({ id: 'bs9c-request', institutionId: institution.id, issuer: { kind: 'ACTOR', actor: { kind: 'COACH', id: club.coachId! } }, recipient: { kind: 'ACTOR', actor: { kind: 'STAFF', id: staff.id } }, category: 'ROSTER', summary: 'Pending roster review', origin: { kind: 'STANDALONE' } })
    const event = createGovernanceRequestEvent({ id: 'bs9c-request-issued', requestId: request.id, kind: 'ISSUED', effectiveOn: base.currentDate, actor: request.issuer })
    const accepted = createGovernanceRequestEvent({ id: 'bs9c-request-zaccepted', requestId: request.id, kind: 'ACCEPTED', effectiveOn: base.currentDate, actor: request.recipient })
    const short = shortRoster(base, club.id)
    const world = updateGameWorld(short, { governanceInstitutions: [institution], governanceRequests: [request], governanceRequestEvents: [event, accepted] })
    const pendingContext = assessGMDecisionContext(world, club.id)
    const pendingRosterOption = pendingContext.options.find((option) => option.blockers.includes('GOVERNANCE_REQUEST_OPEN:ROSTER'))
    expect(pendingRosterOption?.governancePolicy.status).toBe('UNKNOWN')
    expect(pendingRosterOption?.governancePolicy.pendingRequestIds).toContain(request.id)
    expect(pendingRosterOption?.planningEligibility).toBe('SELECTABLE')
    expect(pendingRosterOption?.executionReadiness).toBe('REQUIRES_APPROVAL')
    expect(pendingRosterOption?.blockers).toContain('GOVERNANCE_REQUEST_OPEN:ROSTER')
  })

  it('resolves explicit mapped budget authority while leaving unmapped families unknown', () => {
    const club = team(false)
    const userClub = team(true)
    const institution = createGovernanceInstitution({ id: 'bs9d-institution', universe: 'PROFESSIONAL_CLUB', name: 'BS9D Club', teamIds: [club.id, userClub.id] })
    const executive = createGovernanceBody({ id: 'bs9d-executive', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Executive' })
    const board = createGovernanceBody({ id: 'bs9d-board', institutionId: institution.id, kind: 'BOARD', name: 'Board' })
    const authority = createGovernanceAuthorityGrant({ id: 'bs9d-budget-authority', fromBodyId: board.id, toBodyId: executive.id, decision: 'BUDGET', grantedOn: base.currentDate })
    const participation = createGovernanceDecisionParticipationGrant({ id: 'bs9d-execute-budget', authorityGrantId: authority.id, bodyId: executive.id, edgeParticipant: 'DELEGATE', right: 'EXECUTE' })
    const world = updateGameWorld(base, { governanceInstitutions: [institution], governanceBodies: [executive, board], governanceAuthorityGrants: [authority], governanceDecisionParticipationGrants: [participation] })
    const before = world.governanceDecisionEventsById
    const budgetPolicy = resolveGovernanceOptionPolicy(world, club.id, 'FINANCIAL_CONTAINMENT', base.currentDate)
    expect(budgetPolicy).toMatchObject({ decisionType: 'BUDGET', status: 'AUTHORIZED', executorBodyIds: [executive.id], authorityGrantIds: [authority.id] })
    expect(assessGMOptionAuthority(budgetPolicy)).toEqual({ planningEligibility: 'SELECTABLE', executionReadiness: 'AUTHORIZED' })
    expect(resolveGovernanceOptionPolicy(world, userClub.id, 'FINANCIAL_CONTAINMENT', base.currentDate)).toEqual(budgetPolicy)
    expect(world.governanceDecisionEventsById).toBe(before)

    const approvalAuthority = createGovernanceAuthorityGrant({ id: 'bs9d-budget-approval', fromBodyId: board.id, toBodyId: executive.id, decision: 'BUDGET', grantedOn: base.currentDate })
    const approver = createGovernanceDecisionParticipationGrant({ id: 'bs9d-approve-budget', authorityGrantId: approvalAuthority.id, bodyId: board.id, edgeParticipant: 'DELEGATOR', right: 'APPROVE' })
    const approvalWorld = updateGameWorld(world, { governanceAuthorityGrants: [authority, approvalAuthority], governanceDecisionParticipationGrants: [participation, approver] })
    const approvalPolicy = resolveGovernanceOptionPolicy(approvalWorld, club.id, 'FINANCIAL_CONTAINMENT', base.currentDate)
    expect(approvalPolicy.status).toBe('REQUIRES_APPROVAL')
    expect(assessGMOptionAuthority(approvalPolicy)).toEqual({ planningEligibility: 'SELECTABLE', executionReadiness: 'REQUIRES_APPROVAL' })

    const missing = resolveGovernanceOptionPolicy(world, club.id, 'EXTERNAL_ACQUISITION', base.currentDate)
    expect(missing.status).toBe('UNKNOWN')
    expect(missing.decisionType).toBeUndefined()
    expect(assessGMOptionAuthority(missing)).toEqual({ planningEligibility: 'SELECTABLE', executionReadiness: 'UNKNOWN_AUTHORITY' })

    const explicitBlock = { ...missing, status: 'BLOCKED' as const }
    expect(assessGMOptionAuthority(explicitBlock)).toEqual({ planningEligibility: 'NOT_SELECTABLE', executionReadiness: 'BLOCKED' })
  })

  it('produces a stable option ordering for the same canonical world', () => {
    const club = team(false)
    expect(assessGMDecisionContext(base, club.id).options).toEqual(assessGMDecisionContext(base, club.id).options)
  })
})
