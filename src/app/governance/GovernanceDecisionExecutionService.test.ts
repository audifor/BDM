import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV3, serializeGameWorldV3 } from '@/save/GameWorldSaveV3'
import { deriveGovernanceDecisionStatus } from '@/domain/governance'
import { createGovernanceManagerEvaluation, deriveGovernanceJobSecurityState } from '@/domain/governance'
import { executeGovernanceCoachFiringDecision } from './GovernanceDecisionExecutionService'

function fixture() {
  const base = createNewGame(), team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
  const institution = { id: 'institution', universe: 'PROFESSIONAL_CLUB' as const, name: 'Club', teamIds: [team.id] }
  const grants = [{ id: 'owner-board', fromBodyId: 'owner', toBodyId: 'board', decision: 'COACH_FIRING' as const, grantedOn: base.currentDate }, { id: 'board-exec', fromBodyId: 'board', toBodyId: 'exec', decision: 'COACH_FIRING' as const, grantedOn: base.currentDate }]
  const rights = [{ id: 'propose', authorityGrantId: 'board-exec', bodyId: 'exec', edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const }, { id: 'approve', authorityGrantId: 'owner-board', bodyId: 'board', edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const }, { id: 'execute', authorityGrantId: 'board-exec', bodyId: 'exec', edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const }]
  const decision = { id: 'fire', institutionId: institution.id, decisionType: 'COACH_FIRING' as const, proposedByBodyId: 'exec', proposedOn: base.currentDate, subject: { kind: 'COACH' as const, coachId: base.userCoachId } }
  const events = [{ id: '01', decisionId: 'fire', kind: 'PROPOSED' as const, bodyId: 'exec', effectiveOn: base.currentDate, authorityGrantIds: ['board-exec'] }, { id: '02', decisionId: 'fire', kind: 'APPROVED' as const, bodyId: 'board', effectiveOn: base.currentDate, authorityGrantIds: ['owner-board'] }]
  return updateGameWorld(base, { governanceInstitutions: [institution], governanceBodies: [{ id: 'owner', institutionId: institution.id, kind: 'OWNERSHIP', name: 'Owner' }, { id: 'board', institutionId: institution.id, kind: 'BOARD', name: 'Board' }, { id: 'exec', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Executive' }], governanceAuthorityGrants: grants, governanceDecisionParticipationGrants: rights, governanceDecisions: [decision], governanceDecisionEvents: events })
}
describe('executeGovernanceCoachFiringDecision', () => {
  it('fires only after formal approval and appends one execution event', () => {
    const world = fixture(), team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!, history = world.coachCareerHistoryByCoachId[world.userCoachId]!, unrelated = Object.values(world.coaches).find((coach) => coach.id !== world.userCoachId)!, result = executeGovernanceCoachFiringDecision(world, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: world.currentDate })
    expect(result.world.coachEmploymentByCoachId[world.userCoachId]!.status).toBe('unemployed'); expect(Object.values(result.world.teams).find((team) => team.id === result.teamId)!.coachId).toBeUndefined()
    expect(result.world.coaches[world.userCoachId]).toEqual(world.coaches[world.userCoachId]); expect(result.world.coaches[unrelated.id]).toEqual(unrelated)
    expect(result.world.coachCareerHistoryByCoachId[world.userCoachId]).toHaveLength(history.length + 1); expect(result.world.coachCareerHistoryByCoachId[world.userCoachId]!.at(-1)).toMatchObject({ kind: 'departure', teamId: team.id, reason: 'fired' })
    const executed = Object.values(result.world.governanceDecisionEventsById).filter((event) => event.kind === 'EXECUTED'); expect(executed).toEqual([expect.objectContaining({ decisionId: 'fire', bodyId: 'exec', effectiveOn: world.currentDate, authorityGrantIds: ['board-exec'] })])
    expect(() => executeGovernanceCoachFiringDecision(result.world, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: result.world.currentDate })).toThrow('already executed')
  })
  it('rejects a fabricated COACH_FIRING execution without canonical career history', () => {
    const world = fixture()
    expect(() => updateGameWorld(world, { governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), { id: '03', decisionId: 'fire', kind: 'EXECUTED', bodyId: 'exec', effectiveOn: world.currentDate, authorityGrantIds: ['board-exec'] }] })).toThrow('canonical coach firing effect')
  })
  it('does not partially mutate when required approval is absent', () => {
    const world = fixture(), pending = updateGameWorld(world, { governanceDecisionEvents: Object.values(world.governanceDecisionEventsById).filter((event) => event.kind !== 'APPROVED') }), before = structuredClone(pending)
    expect(() => executeGovernanceCoachFiringDecision(pending, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: pending.currentDate })).toThrow('required approvals')
    expect(pending).toEqual(before); expect(pending.coachEmploymentByCoachId[pending.userCoachId]!.status).toBe('employed')
  })
  it('requires the canonical current date', () => {
    const world = fixture()
    expect(() => executeGovernanceCoachFiringDecision(world, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: '1900-01-01' as never })).toThrow('current world date')
    expect(() => executeGovernanceCoachFiringDecision(world, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: '2999-01-01' as never })).toThrow('current world date')
  })
  it.each([
    ['REJECTED', 'board', 'owner-board'], ['WITHDRAWN', 'exec', 'board-exec'],
  ] as const)('leaves terminal %s decisions unchanged', (kind, bodyId, authorityGrantId) => {
    const world = fixture(), prior = Object.values(world.governanceDecisionEventsById).filter((event) => event.kind !== 'APPROVED'), terminal = updateGameWorld(world, { governanceDecisionEvents: [...prior, { id: '03', decisionId: 'fire', kind, bodyId, effectiveOn: world.currentDate, authorityGrantIds: [authorityGrantId] }] }), before = structuredClone(terminal)
    expect(() => executeGovernanceCoachFiringDecision(terminal, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: terminal.currentDate })).toThrow('terminal')
    expect(terminal).toEqual(before); expect(Object.values(terminal.governanceDecisionEventsById).some((event) => event.kind === 'EXECUTED')).toBe(false)
  })
  it('leaves a vetoed decision unchanged', () => {
    const world = fixture(), grants = [...Object.values(world.governanceAuthorityGrantsById), { id: 'owner-veto', fromBodyId: 'owner', toBodyId: 'board', decision: 'COACH_FIRING' as const, grantedOn: world.currentDate }], rights = [...Object.values(world.governanceDecisionParticipationGrantsById), { id: 'veto', authorityGrantId: 'owner-veto', bodyId: 'owner', edgeParticipant: 'DELEGATOR' as const, right: 'VETO' as const }]
    const vetoed = updateGameWorld(world, { governanceAuthorityGrants: grants, governanceDecisionParticipationGrants: rights, governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), { id: '03', decisionId: 'fire', kind: 'VETOED' as const, bodyId: 'owner', effectiveOn: world.currentDate, authorityGrantIds: ['owner-veto'] }] }), before = structuredClone(vetoed)
    expect(() => executeGovernanceCoachFiringDecision(vetoed, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: vetoed.currentDate })).toThrow('terminal'); expect(vetoed).toEqual(before)
  })
  it('round-trips an actual firing without allowing a second execution', () => {
    const world = fixture(), executed = executeGovernanceCoachFiringDecision(world, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: world.currentDate }).world, loaded = deserializeGameWorldV3(serializeGameWorldV3(executed, '2032-01-01T00:00:00.000Z'))
    expect(loaded.governanceDecisionsById.fire).toBeDefined(); expect(Object.values(loaded.governanceDecisionEventsById).filter((event) => event.kind === 'EXECUTED')).toHaveLength(1)
    expect(loaded.coachEmploymentByCoachId[loaded.userCoachId]!.status).toBe('unemployed'); expect(deriveGovernanceDecisionStatus(Object.values(loaded.governanceDecisionEventsById).filter((event) => event.decisionId === 'fire'), ['board'])).toBe('EXECUTED')
    expect(() => executeGovernanceCoachFiringDecision(loaded, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: loaded.currentDate })).toThrow('already executed')
  })
  it('permits formally delegated zero-approver execution after proposal', () => {
    const world = fixture(), delegated = updateGameWorld(world, { governanceDecisionParticipationGrants: Object.values(world.governanceDecisionParticipationGrantsById).filter((right) => right.right !== 'APPROVE'), governanceDecisionEvents: Object.values(world.governanceDecisionEventsById).filter((event) => event.kind !== 'APPROVED') })
    const result = executeGovernanceCoachFiringDecision(delegated, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: delegated.currentDate })
    expect(result.world.coachEmploymentByCoachId[delegated.userCoachId]!.status).toBe('unemployed'); expect(Object.values(result.world.governanceDecisionEventsById).filter((event) => event.kind === 'APPROVED')).toHaveLength(0)
  })
  it('enforces proposal-time ALL_OF approvals', () => {
    const world = fixture(), grants = [...Object.values(world.governanceAuthorityGrantsById), { id: 'owner-approve', fromBodyId: 'owner', toBodyId: 'board', decision: 'COACH_FIRING' as const, grantedOn: world.currentDate }], rights = [...Object.values(world.governanceDecisionParticipationGrantsById), { id: 'owner-approve-right', authorityGrantId: 'owner-approve', bodyId: 'owner', edgeParticipant: 'DELEGATOR' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const }]
    const incomplete = updateGameWorld(world, { governanceAuthorityGrants: grants, governanceDecisionParticipationGrants: rights }), before = structuredClone(incomplete)
    expect(() => executeGovernanceCoachFiringDecision(incomplete, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: incomplete.currentDate })).toThrow('required approvals'); expect(incomplete).toEqual(before)
    const complete = updateGameWorld(incomplete, { governanceDecisionEvents: [...Object.values(incomplete.governanceDecisionEventsById), { id: '03', decisionId: 'fire', kind: 'APPROVED' as const, bodyId: 'owner', effectiveOn: incomplete.currentDate, authorityGrantIds: ['owner-approve'] }] })
    expect(executeGovernanceCoachFiringDecision(complete, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: complete.currentDate }).world.coachEmploymentByCoachId[complete.userCoachId]!.status).toBe('unemployed')
  })
  it('keeps approver and executor rights separate', () => {
    const approved = fixture(), pending = updateGameWorld(approved, { governanceDecisionEvents: Object.values(approved.governanceDecisionEventsById).filter((event) => event.kind !== 'APPROVED') })
    expect(() => executeGovernanceCoachFiringDecision(approved, { decisionId: 'fire', executorBodyId: 'board', effectiveOn: approved.currentDate })).toThrow('Executor evidence is missing')
    expect(() => executeGovernanceCoachFiringDecision(pending, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: pending.currentDate })).toThrow('required approvals')
    expect(executeGovernanceCoachFiringDecision(approved, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: approved.currentDate }).world.coachEmploymentByCoachId[approved.userCoachId]!.status).toBe('unemployed')
  })
  it('uses proposal-time approvers but execution-time executor authority', () => {
    const dated = updateGameWorld(fixture(), { governanceInstitutions: [{ ...Object.values(fixture().governanceInstitutionsById)[0]!, id: 'institution' }], governanceAuthorityGrants: [
      { id: 'owner-board', fromBodyId: 'owner', toBodyId: 'board', decision: 'COACH_FIRING', grantedOn: '2032-09-01' as never },
      { id: 'board-exec', fromBodyId: 'board', toBodyId: 'exec', decision: 'COACH_FIRING', grantedOn: '2032-09-01' as never },
    ], governanceDecisions: [{ id: 'fire', institutionId: 'institution', decisionType: 'COACH_FIRING', proposedByBodyId: 'exec', proposedOn: '2032-09-01' as never, subject: { kind: 'COACH', coachId: fixture().userCoachId } }], governanceDecisionEvents: [
      { id: '01', decisionId: 'fire', kind: 'PROPOSED', bodyId: 'exec', effectiveOn: '2032-09-01' as never, authorityGrantIds: ['board-exec'] },
      { id: '02', decisionId: 'fire', kind: 'APPROVED', bodyId: 'board', effectiveOn: '2032-09-02' as never, authorityGrantIds: ['owner-board'] },
    ] })
    const revokedExecutor = updateGameWorld(dated, { governanceAuthorityGrants: Object.values(dated.governanceAuthorityGrantsById).map((grant) => grant.id === 'board-exec' ? { ...grant, revokedOn: '2032-09-30' as never } : grant) }), executorBefore = structuredClone(revokedExecutor)
    expect(() => executeGovernanceCoachFiringDecision(revokedExecutor, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: revokedExecutor.currentDate })).toThrow('Executor evidence is missing')
    expect(revokedExecutor).toEqual(executorBefore)
    const revokedApprover = updateGameWorld(dated, { governanceAuthorityGrants: Object.values(dated.governanceAuthorityGrantsById).map((grant) => grant.id === 'owner-board' ? { ...grant, revokedOn: '2032-09-30' as never } : grant) })
    expect(executeGovernanceCoachFiringDecision(revokedApprover, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: revokedApprover.currentDate }).world.coachEmploymentByCoachId[revokedApprover.userCoachId]!.status).toBe('unemployed')
    const newApprover = updateGameWorld(dated, { governanceAuthorityGrants: [...Object.values(dated.governanceAuthorityGrantsById), { id: 'owner-new', fromBodyId: 'owner', toBodyId: 'board', decision: 'COACH_FIRING', grantedOn: '2032-09-15' as never }], governanceDecisionParticipationGrants: [...Object.values(dated.governanceDecisionParticipationGrantsById), { id: 'new-approve', authorityGrantId: 'owner-new', bodyId: 'owner', edgeParticipant: 'DELEGATOR', right: 'APPROVE', approvalRequirement: 'ALL_OF' }] })
    expect(executeGovernanceCoachFiringDecision(newApprover, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: newApprover.currentDate }).world.coachEmploymentByCoachId[newApprover.userCoachId]!.status).toBe('unemployed')
  })
  it.each([
    ['foreign target', (world: ReturnType<typeof fixture>) => ({ ...world, governanceDecisionsById: { ...world.governanceDecisionsById, fire: { ...world.governanceDecisionsById.fire!, subject: { kind: 'COACH' as const, coachId: Object.values(world.teams).find((team) => team.id !== Object.values(world.governanceInstitutionsById)[0]!.teamIds[0])!.coachId! } } } })],
    ['unemployed target', (world: ReturnType<typeof fixture>) => ({ ...world, coachEmploymentByCoachId: { ...world.coachEmploymentByCoachId, [world.userCoachId]: { ...world.coachEmploymentByCoachId[world.userCoachId]!, status: 'unemployed' as const, teamId: undefined } } })],
    ['inconsistent assignment', (world: ReturnType<typeof fixture>) => ({ ...world, teams: { ...world.teams, [Object.values(world.governanceInstitutionsById)[0]!.teamIds[0]!]: { ...world.teams[Object.values(world.governanceInstitutionsById)[0]!.teamIds[0]!]!, coachId: undefined } } })],
    ['unauthorized executor', (world: ReturnType<typeof fixture>) => world],
  ] as const)('is atomic for %s rejection', (_name, change) => {
    const world = change(fixture()), before = structuredClone(world), executorBodyId = _name === 'unauthorized executor' ? 'owner' : 'exec'
    expect(() => executeGovernanceCoachFiringDecision(world, { decisionId: 'fire', executorBodyId, effectiveOn: world.currentDate })).toThrow()
    expect(world).toEqual(before)
    expect(world.coachEmploymentByCoachId).toEqual(before.coachEmploymentByCoachId)
    expect(world.teams).toEqual(before.teams)
    expect(world.coachCareerHistoryByCoachId).toEqual(before.coachCareerHistoryByCoachId)
    expect(world.governanceDecisionEventsById).toEqual(before.governanceDecisionEventsById)
  })
  it('chains a termination recommendation through a sourced firing without touching isolated systems', () => {
    const world = fixture(), institution = Object.values(world.governanceInstitutionsById)[0]!, evaluation = createGovernanceManagerEvaluation({ id: 'evaluation:termination', evaluationPeriodId: 'period:termination', evaluatorBodyId: 'board', evaluatedOn: world.currentDate, objectiveEvaluations: [], factors: [{ id: 'failure', kind: 'OBJECTIVE_ATTAINMENT', status: 'PRESENT', weight: 1, direction: 'POSITIVE', normalizedValue: .05, source: { kind: 'GOVERNANCE_BODY', bodyId: 'board' } }] })
    expect(deriveGovernanceJobSecurityState(evaluation)).toBe('TERMINATION_RECOMMENDED')
    const sourced = updateGameWorld(world, { governanceManagerEvaluationPeriods: [{ id: 'period:termination', institutionId: institution.id, universe: institution.universe, manager: { kind: 'COACH', id: world.userCoachId }, startedOn: world.currentDate }], governanceManagerEvaluations: [evaluation], governanceDecisions: [{ ...world.governanceDecisionsById.fire!, source: { kind: 'MANAGER_EVALUATION', evaluationId: evaluation.id } }] })
    const beforeBoard = structuredClone(sourced.boardStatesByTeamId), beforePolitics = structuredClone(sourced.staffPoliticalCasesById)
    const result = executeGovernanceCoachFiringDecision(sourced, { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: sourced.currentDate })
    expect(sourced.coachEmploymentByCoachId[sourced.userCoachId]!.status).toBe('employed'); expect(result.world.coachEmploymentByCoachId[result.world.userCoachId]!.status).toBe('unemployed')
    expect(result.world.governanceDecisionsById.fire!.source).toEqual({ kind: 'MANAGER_EVALUATION', evaluationId: evaluation.id }); expect(result.world.boardStatesByTeamId).toEqual(beforeBoard); expect(result.world.staffPoliticalCasesById).toEqual(beforePolitics)
  })
  it.each(['NCAA', 'FEDERATION'] as const)('executes under a distinct %s authority graph without universe branching', (universe) => {
    const world = fixture(), institution = { ...Object.values(world.governanceInstitutionsById)[0]!, universe }
    const graph = updateGameWorld(world, { governanceInstitutions: [institution], governanceBodies: [{ id: 'chancellor', institutionId: institution.id, kind: universe === 'NCAA' ? 'ATHLETIC_DEPARTMENT' : 'BOARD', name: 'Chancellor' }, { id: 'director', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Director' }], governanceAuthorityGrants: [{ id: 'chancellor-director', fromBodyId: 'chancellor', toBodyId: 'director', decision: 'COACH_FIRING', grantedOn: world.currentDate }], governanceDecisionParticipationGrants: [{ id: 'propose', authorityGrantId: 'chancellor-director', bodyId: 'director', edgeParticipant: 'DELEGATE', right: 'PROPOSE' }, { id: 'execute', authorityGrantId: 'chancellor-director', bodyId: 'director', edgeParticipant: 'DELEGATE', right: 'EXECUTE' }], governanceDecisions: [{ ...world.governanceDecisionsById.fire!, proposedByBodyId: 'director' }], governanceDecisionEvents: [{ id: '01', decisionId: 'fire', kind: 'PROPOSED', bodyId: 'director', effectiveOn: world.currentDate, authorityGrantIds: ['chancellor-director'] }] })
    expect(executeGovernanceCoachFiringDecision(graph, { decisionId: 'fire', executorBodyId: 'director', effectiveOn: graph.currentDate }).world.coachEmploymentByCoachId[graph.userCoachId]!.status).toBe('unemployed')
  })
  it('validates a firing from immutable departure history rather than current unemployment', () => {
    const executed = executeGovernanceCoachFiringDecision(fixture(), { decisionId: 'fire', executorBodyId: 'exec', effectiveOn: fixture().currentDate }).world
    const teamId = Object.values(executed.teams).find((team) => team.coachId === undefined)!.id, coachId = executed.userCoachId
    const rehired = updateGameWorld(executed, { teams: Object.values(executed.teams).map((team) => team.id === teamId ? { ...team, coachId } : team), coachEmploymentByCoachId: { ...executed.coachEmploymentByCoachId, [coachId]: { status: 'employed', teamId, startedOn: executed.currentDate } }, coachCareerHistoryByCoachId: { ...executed.coachCareerHistoryByCoachId, [coachId]: [...executed.coachCareerHistoryByCoachId[coachId]!, { kind: 'appointment', coachId, teamId, date: executed.currentDate, reason: 'hired' }] } } as never)
    expect(Object.values(rehired.governanceDecisionEventsById).some((event) => event.kind === 'EXECUTED')).toBe(true)
  })
})
