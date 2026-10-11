import { describe, expect, it, vi } from 'vitest'
import { updateGameWorld } from '@/domain/world'
import { createGovernanceAppointment, createGovernanceAuthorityGrant } from '@/domain/governance'
import {
  openFacilityMaintenanceProposal, recordFacilityMaintenanceDecisionEvent, requestFacilityMaintenanceDecision, reserveAndContractFacilityMaintenance, selectFacilityMaintenanceOffer,
} from './FacilityMaintenanceCommands'
import { FM_BOARD, FM_EXECUTIVE, FM_INSTITUTION, FM_OPERATIONS, FM_OWNER, advance, approved, createFacilityMaintenanceScenario, must, requested } from './testFixtures'
import { buildFacilityMaintenanceOperationView } from './FacilityMaintenanceReadModel'
import { recordClubGovernanceDecisionEvent } from '@/app/governance/BoardGovernanceCommands'
import { createGovernanceDecision, createGovernanceDecisionEvent } from '@/domain/governance'

function selected(options: Parameters<typeof createFacilityMaintenanceScenario>[0] = {}) {
  const s = createFacilityMaintenanceScenario({ registerEvidence: true, ...options })
  const opened = openFacilityMaintenanceProposal(s.world, { teamId: s.teamId, needId: s.needId, interventionType: 'REPAIR' })
  const world = must(selectFacilityMaintenanceOffer(opened.world, { teamId: s.teamId, operationId: opened.operationId!, offerId: s.offerId }))
  return { s, world, operationId: opened.operationId! }
}

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

describe('BS17E-A Governance: real rights, never implicit authority', () => {
  it('shows INSTITUTIONAL_AUTHORITY_UNVERIFIED and starts nothing when the club has no institution', () => {
    const { s, world, operationId } = selected({ withGovernance: false })
    const request = requestFacilityMaintenanceDecision(world, { teamId: s.teamId, operationId })
    expect(request).toMatchObject({ status: 'BLOCKED', reasons: ['INSTITUTIONAL_AUTHORITY_UNVERIFIED'] })
    expect(buildFacilityMaintenanceOperationView(world, s.teamId, operationId)!.governance.state).toBe('INSTITUTIONAL_AUTHORITY_UNVERIFIED')
    expect(reserveAndContractFacilityMaintenance(world, { teamId: s.teamId, operationId }).status).toBe('BLOCKED')
  })

  it('does not grant authority because the user controls the club: a body without PROPOSE cannot propose', () => {
    const { s, world, operationId } = selected()
    const outsider = requestFacilityMaintenanceDecision(world, { teamId: s.teamId, operationId, initiator: { kind: 'EXTERNAL', id: 'external:fm:outsider' } })
    expect(outsider).toMatchObject({ status: 'BLOCKED', reasons: ['INITIATOR_HAS_NO_PROPOSER_APPOINTMENT'] })
    const stranger = requestFacilityMaintenanceDecision(world, { teamId: s.teamId, operationId, initiator: { kind: 'COACH', id: 'coach:somebody-else' } })
    expect(stranger.reasons).toEqual(['INITIATOR_HAS_NO_PROPOSER_APPOINTMENT'])
    expect(Object.values(world.governanceDecisionsById)).toHaveLength(0)
  })

  it('refuses an approver that is appointed to a body with no APPROVE right', () => {
    const flow = requested(createFacilityMaintenanceScenario({ registerEvidence: true }))
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const wrongBody = recordFacilityMaintenanceDecisionEvent(flow.world, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'APPROVED', bodyId: FM_OPERATIONS, actor: { kind: 'EXTERNAL', id: 'external:fm:outsider' } })
    expect(wrongBody).toMatchObject({ status: 'BLOCKED', reasons: ['ACTOR_NOT_APPOINTED_WITH_RIGHT'] })
    const executiveCannotApprove = recordFacilityMaintenanceDecisionEvent(flow.world, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'APPROVED', bodyId: FM_EXECUTIVE })
    expect(executiveCannotApprove.reasons).toEqual(['ACTOR_NOT_APPOINTED_WITH_RIGHT'])
  })

  it('records an authorized approval with the supporting grants, and a second approval by the same body is a no-op', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = approved(s)
    const events = Object.values(flow.world.governanceDecisionEventsById).filter((event) => event.decisionId === flow.decisionId)
    expect(events.map((event) => event.kind).sort()).toEqual(['APPROVED', 'PROPOSED'])
    expect(events.every((event) => event.authorityGrantIds.length > 0)).toBe(true)
    const again = recordFacilityMaintenanceDecisionEvent(flow.world, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD })
    expect(again).toMatchObject({ status: 'NO_CHANGE', reasons: ['APPROVAL_ALREADY_RECORDED'] })
    expect(again.world).toBe(flow.world)
  })

  it('never approves automatically: contracting without approval is refused, and a rejection ends the decision', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = requested(s)
    expect(reserveAndContractFacilityMaintenance(flow.world, { teamId: s.teamId, operationId: flow.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['DECISION_NOT_APPROVED'] })
    const rejected = must(recordFacilityMaintenanceDecisionEvent(flow.world, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'REJECTED', bodyId: FM_BOARD }))
    expect(buildFacilityMaintenanceOperationView(rejected, s.teamId, flow.operationId)!.governance.state).toBe('REJECTED')
    expect(reserveAndContractFacilityMaintenance(rejected, { teamId: s.teamId, operationId: flow.operationId }).reasons).toEqual(['DECISION_NOT_APPROVED'])
    expect(recordFacilityMaintenanceDecisionEvent(rejected, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD }).reasons).toEqual(['DECISION_ALREADY_TERMINAL'])
    expect(Object.values(rejected.financialReservationsById).filter((r) => r.sourceAuthority === 'FACILITY')).toHaveLength(0)
  })

  it('honours a veto from a body holding VETO and refuses it from a body that does not', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true, withBoardVeto: true })
    const flow = requested(s)
    const vetoed = must(recordFacilityMaintenanceDecisionEvent(flow.world, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'VETOED', bodyId: FM_BOARD }))
    expect(buildFacilityMaintenanceOperationView(vetoed, s.teamId, flow.operationId)!.governance.state).toBe('VETOED')
    expect(reserveAndContractFacilityMaintenance(vetoed, { teamId: s.teamId, operationId: flow.operationId }).status).toBe('BLOCKED')
    const plain = createFacilityMaintenanceScenario({ registerEvidence: true })
    const plainFlow = requested(plain)
    expect(recordFacilityMaintenanceDecisionEvent(plainFlow.world, { teamId: plain.teamId, decisionId: plainFlow.decisionId!, kind: 'VETOED', bodyId: FM_BOARD }).reasons).toEqual(['ACTOR_NOT_APPOINTED_WITH_RIGHT'])
  })

  it('treats a revoked grant as no authority at the date of the event', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = requested(s)
    const revoked = createGovernanceAuthorityGrant({ ...flow.world.governanceAuthorityGrantsById['authority:fm:owner-board']!, revokedOn: '2020-01-01' as never })
    const world = updateGameWorld(flow.world, { governanceAuthorityGrants: Object.values(flow.world.governanceAuthorityGrantsById).map((grant) => grant.id === revoked.id ? revoked : grant) })
    expect(recordFacilityMaintenanceDecisionEvent(world, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD }).status).toBe('BLOCKED')
  })

  it('treats an expired appointment as no authority', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = requested(s)
    const ended = createGovernanceAppointment({ ...flow.world.governanceAppointmentsById['appointment:fm:user-board']!, endedOn: '2020-01-01' as never })
    const world = updateGameWorld(flow.world, { governanceAppointments: Object.values(flow.world.governanceAppointmentsById).map((item) => item.id === ended.id ? ended : item) })
    expect(recordFacilityMaintenanceDecisionEvent(world, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD }).reasons).toEqual(['ACTOR_NOT_APPOINTED_WITH_RIGHT'])
    expect(buildFacilityMaintenanceOperationView(world, s.teamId, flow.operationId)!.actions.find((a) => a.id === 'APPROVE')?.enabled).toBe(false)
  })

  it('requires the EXECUTE right to accept the contract, even after a complete approval', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = approved(s)
    const noExecutor = updateGameWorld(flow.world, { governanceDecisionParticipationGrants: Object.values(flow.world.governanceDecisionParticipationGrantsById).filter((grant) => grant.right !== 'EXECUTE') })
    expect(reserveAndContractFacilityMaintenance(noExecutor, { teamId: s.teamId, operationId: flow.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['EXECUTE_RIGHT_UNVERIFIED'] })
    const stranger = reserveAndContractFacilityMaintenance(flow.world, { teamId: s.teamId, operationId: flow.operationId, actor: { kind: 'EXTERNAL', id: 'external:fm:outsider' } })
    expect(stranger.reasons).toEqual(['EXECUTE_RIGHT_UNVERIFIED'])
    expect(Object.values(noExecutor.financialReservationsById).filter((r) => r.sourceAuthority === 'FACILITY')).toHaveLength(0)
  })

  it('applies the identical rights to an AI actor: the same commands, an appointed STAFF actor, no bypass', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const aiActor = { kind: 'STAFF' as const, id: 'staff:fm:ai-executive' }
    const withAi = updateGameWorld(s.world, { governanceAppointments: [...Object.values(s.world.governanceAppointmentsById), createGovernanceAppointment({ id: 'appointment:fm:ai-executive', bodyId: FM_EXECUTIVE, actor: aiActor, role: 'GENERAL_MANAGER', startedOn: '2000-01-01' as never })] })
    const opened = openFacilityMaintenanceProposal(withAi, { teamId: s.teamId, needId: s.needId, interventionType: 'REPAIR', actor: aiActor })
    const selectedWorld = must(selectFacilityMaintenanceOffer(opened.world, { teamId: s.teamId, operationId: opened.operationId!, offerId: s.offerId }))
    let world = selectedWorld
    const request = requestFacilityMaintenanceDecision(world, { teamId: s.teamId, operationId: opened.operationId!, initiator: aiActor })
    expect(request.status).toBe('APPLIED')
    world = request.world
    // The AI executive holds no APPROVE right: it cannot approve its own proposal.
    expect(recordFacilityMaintenanceDecisionEvent(world, { teamId: s.teamId, decisionId: request.decisionId!, kind: 'APPROVED', bodyId: FM_EXECUTIVE, actor: aiActor }).reasons).toEqual(['ACTOR_NOT_APPOINTED_WITH_RIGHT'])
    world = must(recordFacilityMaintenanceDecisionEvent(world, { teamId: s.teamId, decisionId: request.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD }))
    expect(reserveAndContractFacilityMaintenance(world, { teamId: s.teamId, operationId: opened.operationId!, actor: aiActor }).status).toBe('APPLIED')
    // An unappointed AI actor is refused exactly like an unappointed human.
    expect(requestFacilityMaintenanceDecision(selectedWorld, { teamId: s.teamId, operationId: opened.operationId!, initiator: { kind: 'STAFF', id: 'staff:fm:unappointed' } }).reasons).toEqual(['INITIATOR_HAS_NO_PROPOSER_APPOINTMENT'])
  })

  it('refuses to approve against an offer that expired before the approval', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true, offerValidDays: 2 })
    const flow = requested(s)
    const late = advance(flow.world, 3)
    expect(recordFacilityMaintenanceDecisionEvent(late, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD })).toMatchObject({ status: 'BLOCKED', reasons: ['OFFER_EXPIRED'] })
  })

  it('does not let the owner body or an unrelated institution decision be used through the maintenance commands', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = requested(s)
    expect(recordFacilityMaintenanceDecisionEvent(flow.world, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'APPROVED', bodyId: FM_OWNER }).reasons).toEqual(['ACTOR_NOT_APPOINTED_WITH_RIGHT'])
    expect(recordFacilityMaintenanceDecisionEvent(flow.world, { teamId: s.teamId, decisionId: 'decision:nope', kind: 'APPROVED', bodyId: FM_BOARD }).reasons).toEqual(['DECISION_NOT_FOUND'])
    expect(FM_INSTITUTION).toBe('institution:fm')
  })

  it('lets the Board surface record the approval through the same canonical command, and refuses a FACILITIES decision that is not a maintenance operation', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = requested(s)
    const approvedByBoard = recordClubGovernanceDecisionEvent(flow.world, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD })
    expect(approvedByBoard.status).toBe('APPLIED')
    expect(buildFacilityMaintenanceOperationView(approvedByBoard.world, s.teamId, flow.operationId)!.governance.state).toBe('APPROVED')
    const stray = createGovernanceDecision({ id: 'decision:fm:stray', institutionId: FM_INSTITUTION, decisionType: 'FACILITIES', proposedByBodyId: FM_EXECUTIVE, proposedOn: s.world.currentDate, subject: { kind: 'FACILITY', facilityId: s.facilityId } })
    const proposed = createGovernanceDecisionEvent({ id: 'event:fm:stray:proposed', decisionId: stray.id, kind: 'PROPOSED', bodyId: FM_EXECUTIVE, effectiveOn: s.world.currentDate, authorityGrantIds: ['authority:fm:owner-executive'] })
    const withStray = updateGameWorld(s.world, { governanceDecisions: [stray], governanceDecisionEvents: [proposed] })
    const refused = recordClubGovernanceDecisionEvent(withStray, { teamId: s.teamId, decisionId: stray.id, kind: 'APPROVED', bodyId: FM_BOARD })
    expect(refused.status).toBe('BLOCKED')
    expect(refused.canonicalReasons).toContain('BLOCKED')
  })
})
