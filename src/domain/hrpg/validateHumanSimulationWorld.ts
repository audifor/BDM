import type { GameWorld } from '@/domain/world/GameWorld'
import { HUMAN_LIMITS, readHumanSimulation, type HumanActor, type HumanSource } from './HumanSimulation'

const personIndexes = new WeakMap<object, ReadonlyMap<string, string>>()
const coachActorsByPerson = new WeakMap<object, ReadonlyMap<string, HumanActor>>()
export function humanActorsForPerson(world: GameWorld, personId: string): readonly HumanActor[] {
  let coaches = coachActorsByPerson.get(world.coaches)
  if (!coaches) {
    coaches = new Map(Object.values(world.coaches).map(coach => [coach.personId, { kind: 'coach' as const, id: coach.id }]))
    coachActorsByPerson.set(world.coaches, coaches)
  }
  const actor = coaches.get(personId)
  const refs = world.personsById[personId as keyof GameWorld['personsById']]?.profileRefs ?? []
  return [...(actor ? [actor] : []), ...refs.flatMap(ref => ref.kind === 'staff' || ref.kind === 'player' ? [{ kind: ref.kind, id: ref.profileId }] : [])]
}
export function humanActorPersonId(world: GameWorld, actor: HumanActor): string | undefined {
  const direct = actor.kind === 'coach' ? world.coaches[actor.id as keyof GameWorld['coaches']]?.personId
    : actor.kind === 'player' ? world.players[actor.id as keyof GameWorld['players']]?.personId
      : world.staffPeopleById[actor.id as keyof GameWorld['staffPeopleById']]?.personId
  if (direct) return direct
  // Legacy role profiles may omit personId. Resolve the actual Person profileRef;
  // never manufacture a Person identity from a string convention.
  let index = personIndexes.get(world.personsById)
  if (!index) {
    const built = new Map<string, string>()
    for (const person of Object.values(world.personsById)) for (const ref of person.profileRefs) built.set(`${ref.kind}:${ref.profileId}`, person.id)
    index = built
    personIndexes.set(world.personsById, index)
  }
  return index.get(`${actor.kind}:${actor.id}`)
}

export function validateHumanSimulationWorld(world: GameWorld): void {
  const state = readHumanSimulation(world.humanSimulation)
  if (state.observedThrough && state.observedThrough > world.currentDate) throw new TypeError('HRPG watermark is in the future')
  const activeByPerson = new Map<string, number>()
  for (const item of Object.values(state.situationsById)) {
    if (!humanSourceExists(world, item.source)) throw new TypeError('HRPG situation requires canonical source evidence')
    if (item.openedOn > world.currentDate || (item.resolution && item.resolution.resolvedOn > world.currentDate)) throw new TypeError('HRPG situation is in the future')
    if (item.status === 'open') {
      const personId = humanActorPersonId(world, item.actor)!
      const count = (activeByPerson.get(personId) ?? 0) + 1
      if (count > HUMAN_LIMITS.activePerActor) throw new TypeError('HRPG Person situation limit exceeded')
      activeByPerson.set(personId, count)
    }
    const participants = new Set<string>()
    for (const participant of item.participants) {
      const id = humanActorPersonId(world, participant)
      if (!id || !world.personsById[id as keyof GameWorld['personsById']]) throw new TypeError('HRPG participant requires a canonical Person')
      if (participants.has(id)) throw new TypeError('HRPG participants must be distinct people, not aliases')
      participants.add(id)
    }
  }
  for (const item of Object.values(state.knowledgeById)) {
    if (!humanSourceExists(world, item.source)) throw new TypeError('HRPG knowledge requires canonical source evidence')
    if (item.basis === 'public' && item.source.kind !== 'match') throw new TypeError('HRPG private source cannot be public knowledge')
    if (item.learnedOn > world.currentDate || !world.personsById[item.observerPersonId as keyof GameWorld['personsById']] ||
      (item.speakerPersonId && !world.personsById[item.speakerPersonId as keyof GameWorld['personsById']])) throw new TypeError('Invalid HRPG observer or speaker')
  }
}

function humanSourceExists(world: GameWorld, source: HumanSource): boolean {
  const collection = source.kind === 'lifeInbox' ? world.inboxItemsById : source.kind === 'match' ? world.games
    : source.kind === 'training' ? world.scheduledTrainingSessionsById : source.kind === 'staffRequest' ? world.staffCareerRequestsById
      : source.kind === 'staffPolitics' ? world.staffPoliticalActionsById : source.kind === 'coachOffer' ? world.coachJobOffersById
        : source.kind === 'contract' ? world.contractsById : source.kind === 'governance' ? world.governanceDecisionEventsById
          : source.kind === 'memory' ? world.memoriesById : undefined
  if (collection) return Object.hasOwn(collection, source.id)
  if (source.kind !== 'coachFinance') return false
  let pair: unknown
  try { pair = JSON.parse(source.id) } catch { return false }
  return Array.isArray(pair) && pair.length === 2 && pair.every(v => typeof v === 'string') &&
    !!world.coachFinancesByCoachId[pair[0] as never]?.movements.some(m => m.id === pair[1])
}
