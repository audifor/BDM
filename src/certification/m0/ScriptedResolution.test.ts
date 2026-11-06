import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { evaluateSimulationBreakpoints, type SimulationBreakpointInput } from '@/app/game/SimulationBreakpoints'
import { validateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { generateWorld } from '@/engine/world'
import { bootstrap, canonical, configuration, digest } from './M0Support'
import { deepFreeze, offerScenario, withDueInjury, withMedia } from './ResolutionScenarios'
import { isMandatory, KNOWN_BREAKPOINT_REASONS, M0_RESOLVERS, ScriptedResolutionSession, type ResolutionStep } from './ScriptedResolution'

const extension = (level: SimulationBreakpointInput['level'], reason = 'unknownMandatory'): SimulationBreakpointInput => ({
  level, reason, sourceKind: 'CERTIFICATION_DIAGNOSTIC', sourceId: `m0:${reason}`, ownership: { kind: 'SYSTEM' }, diagnostic: `M0 diagnostic: ${reason}`,
})

// Every intermediate world is frozen BEFORE crossing the resolution boundary.
function resolveFrozen(initial: GameWorld) {
  const session = new ScriptedResolutionSession()
  let world = initial
  const steps: ResolutionStep[] = []
  for (let count = 0; count < 64; count++) {
    const inputHash = digest(world)
    const step = session.step(deepFreeze(world))
    expect(digest(world)).toBe(inputHash)
    validateGameWorld(step.world)
    steps.push(step)
    world = step.world
    if (step.status !== 'RESOLVED') return { world, steps, status: step.status }
  }
  throw new Error('Scenario action limit reached')
}

describe('M0.2a scripted canonical resolution', () => {
  it('resolves userGame with the production Match Next action and preserves a frozen input', () => {
    const world = deepFreeze(bootstrap())
    const before = digest(world)
    const step = new ScriptedResolutionSession().step(world)
    expect(step.status).toBe('RESOLVED')
    expect(step.action?.operation).toBe('instantResult')
    const id = step.action!.breakpoint.sourceId as keyof GameWorld['games']
    expect(world.games[id]!.status).toBe('scheduled')
    expect(step.world.games[id]).toMatchObject({ status: 'completed', result: { homeScore: 99, awayScore: 89 } })
    expect(step.world.matchStatLogsByGameId[id]).toMatchObject({ resolution: 'FAST', finalScore: { home: 99, away: 89 } })
    expect(step.after.some(item => item.reason === 'userGame')).toBe(false)
    expect(digest(world)).toBe(before)
    validateGameWorld(step.world)
  })

  it('skips the real pending media opportunity without deleting its record', () => {
    const setup = withMedia(bootstrap())
    const world = deepFreeze(setup.world)
    const step = new ScriptedResolutionSession().step(world)
    expect(step.action?.operation).toBe('skipMediaOpportunity')
    expect(step.status).toBe('RESOLVED')
    expect(world.mediaOpportunitiesById[setup.opportunity.id]!.status).toBe('pending')
    expect(step.world.mediaOpportunitiesById[setup.opportunity.id]).toMatchObject({ ...setup.opportunity, status: 'skipped' })
    expect(step.world.mediaProfilesByCoachId[world.userCoachId]!.reservedCount).toBe(1)
    expect(step.after.some(item => item.sourceId === setup.opportunity.id)).toBe(false)
    expect(step.after.some(item => item.reason === 'userGame')).toBe(true)
    expect(step.mayAdvance).toBe(false)
    validateGameWorld(step.world)
  })

  it('declines a real offer and rejects its candidacy while preserving the existing club assignment', () => {
    const setup = offerScenario()
    const world = deepFreeze(setup.world)
    const step = new ScriptedResolutionSession().step(world)
    expect(step.action?.operation).toBe('declineCoachJobOffer')
    expect(step.status).toBe('RESOLVED')
    expect(step.world.coachJobOffersById[setup.offer.id]!.status).toBe('declined')
    expect(step.world.coachJobCandidaciesById[setup.candidacyId as keyof GameWorld['coachJobCandidaciesById']]!.status).toBe('rejected')
    expect(step.world.coachInterviewsByCandidacyId).toEqual(world.coachInterviewsByCandidacyId)
    expect(step.world.coachJobOpeningsById).toEqual(world.coachJobOpeningsById)
    expect(step.world.coachEmploymentByCoachId).toEqual(world.coachEmploymentByCoachId)
    expect(step.world.coachCareerHistoryByCoachId).toEqual(world.coachCareerHistoryByCoachId)
    expect(step.world.teams).toEqual(world.teams)
    expect(step.world.teamStaffAssignmentsById).toEqual(world.teamStaffAssignmentsById)
    expect(getUserTeam(step.world)?.id).toBe(getUserTeam(world)?.id)
    expect(step.after.some(item => item.reason === 'coachJobOffer')).toBe(false)
    validateGameWorld(step.world)
  })

  it.each(['ACTION_REQUIRED', 'BLOCKING'] as const)('fails closed for an unknown %s candidate before executing any known action', level => {
    const world = deepFreeze(bootstrap())
    const step = new ScriptedResolutionSession().step(world, { additionalCandidates: [extension(level)] })
    expect(step.status).toBe('BLOCKED')
    expect(step.action).toBeUndefined()
    expect(step.world).toBe(world)
    expect(step.before.some(item => item.reason === 'userGame')).toBe(true)
    expect(step.blockers[0]).toMatchObject({ level, reason: 'unknownMandatory', sourceKind: 'CERTIFICATION_DIAGNOSTIC',
      sourceId: 'm0:unknownMandatory', date: world.currentDate, cause: 'MISSING_RESOLVER', classification: 'UNKNOWN_EXTENSION', evidence: { worldHash: digest(world), userCoachId: world.userCoachId } })
    expect(step.mayAdvance).toBe(false)
  })

  it('recognizes a real unregistered mandatory RTP obligation and retains its canonical evidence', () => {
    const world = deepFreeze(withDueInjury(bootstrap()))
    const step = new ScriptedResolutionSession().step(world)
    expect(step.status).toBe('BLOCKED')
    expect(step.before.filter(isMandatory).map(item => item.reason)).toEqual(['userGame', 'returnToPlayReview'])
    expect(step.blockers[0]).toMatchObject({ reason: 'returnToPlayReview', sourceId: 'm0-rtp-due', cause: 'MISSING_RESOLVER', classification: 'KNOWN_REASON',
      evidence: { source: { id: 'm0-rtp-due', expectedReturnDate: world.currentDate } } })
    expect(step.action).toBeUndefined()
    expect(step.world).toBe(world)
  })

  it('retains IMPORTANT and INFO observations without resolving or blocking them', () => {
    // Existing generator before schedule attachment: a valid quiet world; extension diagnostics are read-only inputs.
    const world = deepFreeze(generateWorld(configuration))
    const step = new ScriptedResolutionSession().step(world, { additionalCandidates: [extension('INFO', 'infoNotice'), extension('IMPORTANT', 'importantNotice')] })
    expect(step.status).toBe('READY')
    expect(step.mayAdvance).toBe(true)
    expect(step.action).toBeUndefined()
    expect(step.after.map(item => item.level)).toEqual(['IMPORTANT', 'INFO'])
    expect(step.world).toBe(world)
  })

  it('processes all three obligations one at a time in production order, records generated obligations, and replays identically', () => {
    const a = withMedia(offerScenario().world).world
    const b = withMedia(offerScenario().world).world
    expect(canonical(a)).toBe(canonical(b))
    const first = resolveFrozen(a)
    const second = resolveFrozen(b)
    expect(first.status).toBe('READY')
    expect(second.status).toBe('READY')
    const actions = first.steps.flatMap(step => step.action ? [step.action] : [])
    expect(actions.slice(0, 3).map(action => action.breakpoint.reason)).toEqual(['coachJobOffer', 'mediaOpportunity', 'userGame'])
    expect(actions.map(action => action.operation)).toEqual(['declineCoachJobOffer', 'skipMediaOpportunity', 'instantResult', 'skipMediaOpportunity'])
    expect(actions[2]!.generatedMandatory).toMatchObject([{ reason: 'mediaOpportunity', sourceKind: 'MEDIA_OPPORTUNITY' }])
    expect(first.steps[0]!.before.filter(isMandatory)).toHaveLength(3)
    expect(first.steps[0]!.after.filter(isMandatory)).toHaveLength(2)
    expect(first.steps[1]!.after.filter(isMandatory)).toHaveLength(1)
    for (const step of first.steps.filter(step => step.action)) {
      expect(step.action!.status).toBe('RESOLVED')
      expect(step.action!.beforeHash).not.toBe(step.action!.afterHash)
      expect(step.after.some(item => item.reason === step.action!.breakpoint.reason && item.sourceId === step.action!.breakpoint.sourceId && isMandatory(item))).toBe(false)
    }
    expect(canonical(first.world)).toBe(canonical(second.world))
    expect(first.steps).toEqual(second.steps)
    expect(first.steps.at(-1)?.mayAdvance).toBe(true)
    console.log('M0.2a evidence', JSON.stringify({ initialHash: digest(a), finalHash: digest(first.world),
      steps: first.steps.map(step => ({ status: step.status, before: step.before.map(item => ({ reason: item.reason, sourceId: item.sourceId, level: item.level })),
        after: step.after.map(item => ({ reason: item.reason, sourceId: item.sourceId, level: item.level })), action: step.action })) }))
  })

  it('stops immediately on an ineffective action and caps repeated attempts at two', () => {
    const world = deepFreeze(withMedia(bootstrap()).world)
    // Fault injection at the registry boundary only; real canonical service effects are never mocked.
    const registry = { ...M0_RESOLVERS, mediaOpportunity: { ...M0_RESOLVERS.mediaOpportunity!, apply: (input: GameWorld) => input } }
    const session = new ScriptedResolutionSession({ registry })
    const run = session.run(world)
    expect(run.status).toBe('BLOCKED')
    expect(run.steps).toHaveLength(1)
    expect(run.steps[0]!.blockers[0]!.cause).toBe('NO_PROGRESS_OR_UNRESOLVED_OBLIGATION')
    expect(session.step(world).blockers[0]!.cause).toBe('NO_PROGRESS_OR_UNRESOLVED_OBLIGATION')
    expect(session.step(world).blockers[0]!.cause).toBe('BREAKPOINT_ATTEMPT_LIMIT')
  })

  it('records a thrown action failure without discarding the unresolved obligation', () => {
    const world = deepFreeze(withMedia(bootstrap()).world)
    const registry = { ...M0_RESOLVERS, mediaOpportunity: { ...M0_RESOLVERS.mediaOpportunity!, apply: () => { throw new Error('M0 deliberate resolver fault') } } }
    const step = new ScriptedResolutionSession({ registry }).step(world)
    expect(step.status).toBe('BLOCKED')
    expect(step.blockers[0]!.cause).toBe('CANONICAL_ACTION_FAILED: M0 deliberate resolver fault')
    expect(step.after).toEqual(step.before)
    expect(step.world).toBe(world)
  })

  it.each([{ maxActionsPerDay: 1 }, { maxActions: 1 }])('enforces configured action bounds %j', limits => {
    const world = deepFreeze(withMedia(offerScenario().world).world)
    const run = new ScriptedResolutionSession({ limits }).run(world)
    expect(run.status).toBe('BLOCKED')
    expect(run.steps).toHaveLength(2)
    expect(run.steps[0]!.action?.breakpoint.reason).toBe('coachJobOffer')
    expect(run.steps[1]!.action).toBeUndefined()
    expect(run.steps[1]!.blockers[0]!.cause).toBe('maxActions' in limits ? 'OVERALL_ACTION_LIMIT' : 'DAILY_ACTION_LIMIT')
    expect(run.mayAdvance).toBe(false)
  })

  it.each(['ownership', 'source', 'target'] as const)('rejects mismatched %s evidence before dispatch', mismatch => {
    const world = deepFreeze(bootstrap())
    const actual = evaluateSimulationBreakpoints(world).candidates.find(item => item.reason === 'userGame')!
    const forged = { ...actual, ...(mismatch === 'ownership' ? { ownership: { kind: 'SYSTEM' as const } }
      : mismatch === 'source' ? { sourceKind: 'WRONG_SOURCE' } : { actionTarget: { gameId: 'wrong-game' } }) }
    const step = new ScriptedResolutionSession().step(world, { additionalCandidates: [forged] })
    expect(step.status).toBe('BLOCKED')
    expect(step.action).toBeUndefined()
    expect(step.blockers[0]!.cause).toBe(mismatch === 'target' ? 'CANONICAL_PRECONDITION_FAILED' : 'SOURCE_OR_OWNERSHIP_MISMATCH')
    expect(step.world).toBe(world)
  })

  it('makes accidental direct canonical mutation throw at the frozen resolution boundary', () => {
    const world = deepFreeze(withMedia(bootstrap()).world)
    const opportunity = Object.values(world.mediaOpportunitiesById)[0]!
    expect(() => Object.assign(opportunity, { status: 'skipped' })).toThrow(TypeError)
    expect(opportunity.status).toBe('pending')
    expect(Object.isFrozen(world)).toBe(true)
    expect(Object.isFrozen(world.mediaOpportunitiesById)).toBe(true)
  })

  it('keeps the complete reason inventory aligned with the actual evaluator, including conditional reason names', () => {
    const source = ts.createSourceFile('SimulationBreakpoints.ts', readFileSync(new URL('../../app/game/SimulationBreakpoints.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
    const emitted = new Set<string>()
    const reasons = (expression: ts.Expression): void => {
      if (ts.isStringLiteral(expression)) emitted.add(expression.text)
      else if (ts.isConditionalExpression(expression)) { reasons(expression.whenTrue); reasons(expression.whenFalse) }
      else throw new Error(`Uninventoried reason expression: ${expression.getText(source)}`)
    }
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'reason') reasons(node.initializer)
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect([...emitted].sort()).toEqual([...KNOWN_BREAKPOINT_REASONS].sort())
    const inventory = readFileSync(new URL('../../../docs/certification/m0/M0_BREAKPOINT_INVENTORY.md', import.meta.url), 'utf8')
    for (const reason of emitted) expect(inventory).toContain(`### ${reason}`)
    expect(inventory).toContain('additionalCandidates')
  })
})
