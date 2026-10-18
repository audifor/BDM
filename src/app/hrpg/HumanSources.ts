import { HUMAN_SOURCE_KINDS, type HumanActor, type HumanFact, type HumanSource } from '@/domain/hrpg/HumanSimulation'
import { humanActorPersonId } from '@/domain/hrpg/validateHumanSimulationWorld'
import { staffAssignmentIndex, type GameWorld } from '@/domain/world'

const coach = (id: string): HumanActor => ({ kind: 'coach', id })
const staff = (id: string): HumanActor => ({ kind: 'staff', id })
const player = (id: string): HumanActor => ({ kind: 'player', id })
const financeIndexes = new WeakMap<object, ReadonlyMap<string, GameWorld['coachFinancesByCoachId'][keyof GameWorld['coachFinancesByCoachId']]['movements'][number]>>()
function financeMovement(world: GameWorld, coachId: string, movementId: string) {
  const movements = world.coachFinancesByCoachId[coachId as never]?.movements
  if (!movements) return undefined
  let index = financeIndexes.get(movements)
  if (!index) { index = new Map(movements.map(m => [m.id, m])); financeIndexes.set(movements, index) }
  return index.get(movementId)
}
const effectiveSourceIndexes = new WeakMap<object, ReadonlyMap<string, readonly HumanSource[]>>()
function effectiveSourcesOn<T extends { readonly id: string }>(kind: HumanSource['kind'], records: Readonly<Record<string, T>>, dateOf: (record: T) => string, date: string): readonly HumanSource[] {
  let index = effectiveSourceIndexes.get(records)
  if (!index) {
    const built = new Map<string, HumanSource[]>()
    for (const record of Object.values(records)) {
      const day = dateOf(record)
      const entries = built.get(day) ?? []
      entries.push({ kind, id: record.id })
      built.set(day, entries)
    }
    index = built
    effectiveSourceIndexes.set(records, index)
  }
  return index.get(date) ?? []
}

/** No invented actors: all fact adapters resolve existing canonical records. */
export function readHumanFact(world: GameWorld, source: HumanSource): HumanFact | undefined {
  if (!source || typeof source.id !== 'string' || !HUMAN_SOURCE_KINDS.includes(source.kind)) return undefined
  const collection = source.kind === 'lifeInbox' ? world.inboxItemsById : source.kind === 'match' ? world.games
    : source.kind === 'training' ? world.scheduledTrainingSessionsById : source.kind === 'staffRequest' ? world.staffCareerRequestsById
      : source.kind === 'staffPolitics' ? world.staffPoliticalActionsById : source.kind === 'coachOffer' ? world.coachJobOffersById
        : source.kind === 'contract' ? world.contractsById : source.kind === 'governance' ? world.governanceDecisionEventsById
          : source.kind === 'memory' ? world.memoriesById : undefined
  if (collection && !Object.hasOwn(collection, source.id)) return undefined
  let fact: HumanFact | undefined
  if (source.kind === 'lifeInbox') {
    const item = world.inboxItemsById[source.id]
    if (!item) return undefined
    const c = item.context
    const scenario = String(c.lifeScenario)
    const participants: HumanActor[] = [coach(item.coachId)]
    if (scenario === 'openingDebt') {
      if (world.coachRpgProfilesByCoachId[item.coachId as never]?.creatorOrigin?.background !== 'inDebt' ||
        !world.coachFinancesByCoachId[item.coachId as never]?.debts.some(d => d.id === `bs19b:starting-debt:${item.coachId}`)) return undefined
    } else if (scenario === 'firstStaffMeeting') {
      if (typeof c.assistantStaffId !== 'string' || !world.staffPeopleById[c.assistantStaffId as never]) return undefined
      participants.push(staff(c.assistantStaffId))
    } else if (scenario === 'staffRequestFollowUp' || scenario === 'staffPromise') {
      const request = world.staffCareerRequestsById[String(c.requestId)]
      if (!request || request.staffId !== c.staffId || request.teamId !== c.teamId) return undefined
      participants.push(staff(request.staffId))
    } else if (scenario === 'staffPoliticalLobby') {
      const action = world.staffPoliticalActionsById[String(c.politicalActionId)]
      if (!action || action.kind !== 'LOBBY' || action.target?.kind !== 'COACH' || action.target.id !== item.coachId ||
        action.actorIds.length !== 1 || action.actorIds[0] !== c.actorId) return undefined
      participants.push(staff(action.actorIds[0]!))
      // The subject is NOT a witness to a colleague's private lobbying.
    } else if (scenario === 'playerTrainingFeedback') {
      const evidence = world.developmentStimulusEventsById[String(c.evidenceId)]
      if (!evidence || evidence.playerId !== c.playerId || evidence.sourceId !== c.sessionId || evidence.sourceType !== 'training') return undefined
      participants.push(player(evidence.playerId))
    } else return undefined
    fact = { source, occurredOn: item.gameDate, topic: scenario, participants, public: false, ongoing: item.status !== 'archived',
      title: item.title, ...(typeof c.requestId === 'string' ? { causalKey: c.requestId }
        : typeof c.sourceRequestId === 'string' ? { causalKey: c.sourceRequestId } : {}) }
  } else if (source.kind === 'match') {
    const game = world.games[source.id as never]
    if (!game || game.status !== 'completed' || !game.result) return undefined
    const log = world.matchStatLogsByGameId[game.id]
    // Only actual logged participants are witnesses; current rosters are not historical evidence.
    const participants: HumanActor[] = log ? log.playerLines
      .filter(p => p.stats.secondsPlayed > 0).map(p => player(p.playerId)) : []
    if (!participants.length) return undefined
    fact = { source, occurredOn: game.date, topic: 'matchCompleted', participants, public: true,
      title: `${world.teams[game.homeTeamId]!.name} ${game.result.homeScore}–${game.result.awayScore} ${world.teams[game.awayTeamId]!.name}` }
  } else if (source.kind === 'training') {
    const session = world.scheduledTrainingSessionsById[source.id]
    if (!session || session.status !== 'completed' || session.scope !== 'individual' || !session.execution || !session.playerId) return undefined
    const participant = session.execution.participants.find(p => p.playerId === session.playerId && p.participation !== 'REST')
    const evidence = participant?.developmentStimulusEventId && world.developmentStimulusEventsById[participant.developmentStimulusEventId]
    if (!evidence || evidence.sourceId !== session.id || evidence.playerId !== session.playerId ||
      evidence.sourceType !== 'training' || evidence.date !== session.execution.completedOn) return undefined
    fact = { source, occurredOn: session.execution.completedOn, topic: 'trainingCompleted',
      participants: [player(session.playerId)], public: false, title: 'An individual training session was completed' }
  } else if (source.kind === 'staffRequest') {
    const request = world.staffCareerRequestsById[source.id]
    if (!request) return undefined
    const head = world.teams[request.teamId]?.coachId
    // The requesting person always knows their request. Current employer receives
    // OPEN requests only; do not disclose an old private request to a new coach.
    fact = { source, occurredOn: request.createdOn, topic: 'careerRequest',
      participants: [staff(request.staffId), ...(request.status === 'OPEN' && head ? [coach(head)] : [])],
      public: false, ongoing: request.status === 'OPEN', title: 'A staff member submitted a professional request', causalKey: request.id, stage: 'origin' }
  } else if (source.kind === 'staffPolitics') {
    const action = world.staffPoliticalActionsById[source.id]
    if (!action) return undefined
    const target = action.target?.kind === 'COACH' ? coach(action.target.id) : action.target?.kind === 'STAFF' ? staff(action.target.id) : undefined
    fact = { source, occurredOn: action.performedOn, topic: 'politicalAction',
      participants: [...action.actorIds.map(staff), ...(target ? [target] : [])], public: false,
      title: `A recorded staff political action: ${action.kind}`, causalKey: world.staffPoliticalCasesById[action.caseId]?.sourceId,
      stage: action.stance === 'OPPOSE' ? 'escalation' : 'development' }
  } else if (source.kind === 'coachFinance') {
    let pair: unknown
    try { pair = JSON.parse(source.id) } catch { return undefined }
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(v => typeof v === 'string')) return undefined
    const movement = financeMovement(world, pair[0], pair[1])
    if (!movement) return undefined
    fact = { source, occurredOn: movement.date, topic: 'personalFinance', participants: [coach(pair[0])],
      public: false, title: `Personal finance: ${movement.type}` }
  } else if (source.kind === 'coachOffer') {
    const offer = world.coachJobOffersById[source.id as never]
    if (!offer) return undefined
    fact = { source, occurredOn: offer.createdOn, topic: 'careerOffer', participants: [coach(offer.coachId)],
      public: false, ongoing: offer.status === 'pending', title: 'A documented head coach job offer', causalKey: offer.id }
  } else if (source.kind === 'contract') {
    const contract = world.contractsById[source.id as never]
    if (!contract) return undefined
    fact = { source, occurredOn: contract.term.startsOn, topic: 'playerContract', participants: [player(contract.playerId)],
      // Salary terms remain private; no permission is inferred from a roster announcement.
      public: false, title: 'A player contract takes effect' }
  } else if (source.kind === 'governance') {
    const event = world.governanceDecisionEventsById[source.id]
    const decision = event && world.governanceDecisionsById[event.decisionId]
    const body = world.governanceBodiesById[event?.bodyId ?? '']
    if (!event || !decision || !body) return undefined
    const participants = Object.values(world.governanceAppointmentsById)
      .filter(a => a.bodyId === body.id && a.startedOn <= event.effectiveOn && (!a.endedOn || a.endedOn >= event.effectiveOn) && a.actor.kind !== 'EXTERNAL')
      .map(a => a.actor.kind === 'COACH' ? coach(a.actor.id) : staff(a.actor.id))
    if (!participants.length) return undefined
    fact = { source, occurredOn: event.effectiveOn, topic: 'governanceAction', participants, public: false,
      title: `A recorded governance decision: ${event.kind}`, causalKey: decision.id }
  } else if (source.kind === 'memory') {
    const memory = world.memoriesById[source.id]
    if (!memory || (!memory.tags.includes('promise') && !memory.tags.includes('hrpg')) || !['coach', 'player', 'staff'].includes(memory.owner.kind)) return undefined
    const isPromise = memory.tags.includes('promise')
    fact = { source, occurredOn: memory.occurredOn, topic: isPromise ? 'rememberedCommitment' : 'humanRecollection',
      participants: [{ kind: memory.owner.kind as HumanActor['kind'], id: memory.owner.id }], public: false,
      title: isPromise ? `A remembered professional commitment: ${memory.type}` : `A remembered personal response: ${String(memory.context.actionId)}`,
      stage: memory.tags.includes('broken') ? 'crisis' : memory.tags.some(tag => ['fulfilled', 'remedied', 'cancelled'].includes(tag)) ? 'resolution'
        : memory.tags.includes('aftermath') ? 'aftermath' : 'development',
      ...(isPromise && memory.sourceId ? { causalKey: memory.sourceId } : typeof memory.context.causalKey === 'string' ? { causalKey: memory.context.causalKey } : {}) }
  }
  if (!fact) return undefined
  const personIds = new Set<string>()
  const participants = fact.participants.filter(actor => {
    const id = humanActorPersonId(world, actor)
    if (!id || personIds.has(id)) return false
    personIds.add(id)
    return true
  })
  return participants.length ? { ...fact, participants } : undefined
}

/** Select changed collections once per world transition, never once per person.
 * Only recent facts enter HRPG; loading does not replay a lifetime of history.
 */
export function collectHumanSources(before: GameWorld, after: GameWorld): readonly HumanSource[] {
  const result: HumanSource[] = []
  function changed<T>(kind: HumanSource['kind'], old: Readonly<Record<string, T>>, next: Readonly<Record<string, T>>, id: (item: T) => string) {
    if (old === next) return
    for (const item of Object.values(next)) if (old[id(item)] !== item) result.push({ kind, id: id(item) })
  }
  changed('lifeInbox', before.inboxItemsById, after.inboxItemsById, i => i.id)
  changed('match', before.games, after.games, i => i.id)
  changed('training', before.scheduledTrainingSessionsById, after.scheduledTrainingSessionsById, i => i.id)
  changed('staffRequest', before.staffCareerRequestsById, after.staffCareerRequestsById, i => i.id)
  changed('staffPolitics', before.staffPoliticalActionsById, after.staffPoliticalActionsById, i => i.id)
  changed('coachOffer', before.coachJobOffersById, after.coachJobOffersById, i => i.id)
  changed('contract', before.contractsById, after.contractsById, i => i.id)
  changed('governance', before.governanceDecisionEventsById, after.governanceDecisionEventsById, i => i.id)
  changed('memory', before.memoriesById, after.memoriesById, i => i.id)
  if (before.currentDate !== after.currentDate) {
    result.push(...effectiveSourcesOn('contract', after.contractsById, contract => contract.term.startsOn, after.currentDate))
    result.push(...effectiveSourcesOn('governance', after.governanceDecisionEventsById, event => event.effectiveOn, after.currentDate))
  }
  if (before.coachFinancesByCoachId !== after.coachFinancesByCoachId) for (const [coachId, profile] of Object.entries(after.coachFinancesByCoachId)) {
    const previous = before.coachFinancesByCoachId[coachId as never]
    if (previous === profile || previous?.movements === profile.movements) continue
    const ids = new Set(previous?.movements.map(m => m.id))
    for (const movement of profile.movements) if (!ids.has(movement.id)) result.push({ kind: 'coachFinance', id: JSON.stringify([coachId, movement.id]) })
  }
  return result.filter(ref => {
    const fact = readHumanFact(after, ref)
    return fact && fact.occurredOn >= before.currentDate && fact.occurredOn <= after.currentDate
  })
}

/** Only current coworkers have an established communication route in this version. */
export function canHumansCommunicate(world: GameWorld, firstPersonId: string, secondPersonId: string): boolean {
  if (firstPersonId === secondPersonId) return false
  const first = teamsForPerson(world, firstPersonId)
  return teamsForPerson(world, secondPersonId).some(teamId => first.includes(teamId))
}

const personTeams = new WeakMap<object, { readonly staff: object; readonly teams: ReadonlyMap<string, readonly string[]> }>()
function teamsForPerson(world: GameWorld, personId: string): readonly string[] {
  let index = personTeams.get(world.teams)
  if (!index || index.staff !== world.teamStaffAssignmentsById) {
    const map = new Map<string, string[]>()
    const add = (person: string | undefined, teamId: string) => { if (person) map.set(person, [...(map.get(person) ?? []), teamId]) }
    for (const team of Object.values(world.teams)) {
      if (team.coachId) add(world.coaches[team.coachId]?.personId, team.id)
      for (const id of team.rosterPlayerIds) add(humanActorPersonId(world, player(id)), team.id)
      for (const assignment of staffAssignmentIndex(world.teamStaffAssignmentsById).byTeam.get(team.id) ?? []) add(humanActorPersonId(world, staff(assignment.staffPersonId)), team.id)
    }
    index = { staff: world.teamStaffAssignmentsById, teams: map }
    personTeams.set(world.teams, index)
  }
  return index.teams.get(personId) ?? []
}
