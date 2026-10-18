import { parseGameDate, type GameDate } from '@/domain/date'
import type { MemoryEntityRef } from '@/domain/memory'

/** References, never a second copy of Finance/Career/Training truth. */
export const HUMAN_SOURCE_KINDS = ['lifeInbox', 'match', 'training', 'staffRequest', 'staffPolitics', 'coachFinance', 'coachOffer', 'contract', 'governance', 'memory'] as const
export type HumanSourceKind = typeof HUMAN_SOURCE_KINDS[number]
export interface HumanSource { readonly kind: HumanSourceKind; readonly id: string }
export type HumanActor = MemoryEntityRef & { readonly kind: 'coach' | 'player' | 'staff' }
export interface HumanFact {
  readonly source: HumanSource
  readonly occurredOn: GameDate
  readonly topic: string
  readonly participants: readonly HumanActor[]
  readonly public: boolean
  readonly title: string
  /** A still-live canonical opportunity can be handed off from an old save. */
  readonly ongoing?: boolean
  /** Stable business identity, e.g. a career request across promise/lobby/breach. */
  readonly causalKey?: string
  readonly stage?: 'origin' | 'development' | 'escalation' | 'crisis' | 'resolution' | 'aftermath'
}
export interface HumanKnowledge {
  readonly id: string
  readonly source: HumanSource
  readonly observerPersonId: string
  readonly learnedOn: GameDate
  readonly basis: 'witnessed' | 'public' | 'report' | 'rumour'
  readonly speakerPersonId?: string
  /** An attributed assertion, NOT a replacement for source truth. */
  readonly claim?: string
}
export interface HumanSituation {
  readonly id: string
  readonly ruleId: string
  readonly source: HumanSource
  readonly actor: HumanActor
  readonly participants: readonly HumanActor[]
  readonly openedOn: GameDate
  readonly dueOn?: GameDate
  readonly phase: 'origin' | 'aftermath'
  readonly parentId?: string
  readonly causalKey?: string
  readonly status: 'open' | 'resolved' | 'expired'
  readonly resolution?: { readonly actionId: string; readonly resolvedOn: GameDate }
}
export interface HumanSimulationState {
  readonly situationsById: Readonly<Record<string, HumanSituation>>
  readonly knowledgeById: Readonly<Record<string, HumanKnowledge>>
  /** Admission watermark: loading old saves never invents historical interactions. */
  readonly observedThrough?: GameDate
}
export const EMPTY_HUMAN_SIMULATION: HumanSimulationState = Object.freeze({ situationsById: Object.freeze({}), knowledgeById: Object.freeze({}) })
export const HUMAN_LIMITS = { activePerActor: 4, activeTotal: 4096, retainedDays: 90, maxKnowledgePerSource: 32, maxChainDepth: 1 } as const
export const humanSourceKey = (source: HumanSource): string => JSON.stringify([source.kind, source.id])
export const humanKnowledgeId = (source: HumanSource, personId: string): string => JSON.stringify([source.kind, source.id, personId])

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid HRPG record')
  return value as Record<string, unknown>
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw new TypeError('Invalid HRPG string')
  return value
}
function source(value: unknown): HumanSource {
  const v = object(value)
  if (!HUMAN_SOURCE_KINDS.includes(v.kind as HumanSourceKind)) throw new TypeError('Invalid HRPG source')
  return { kind: v.kind as HumanSourceKind, id: string(v.id) }
}
function actor(value: unknown): HumanActor {
  const v = object(value)
  if (!['coach', 'player', 'staff'].includes(String(v.kind))) throw new TypeError('Invalid HRPG actor')
  return { kind: v.kind as HumanActor['kind'], id: string(v.id) }
}
/** Used at save and world boundaries. Explicit reconstruction drops unknown input fields. */
export function readHumanSimulation(value: unknown): HumanSimulationState {
  const v = object(value)
  const situationsById: Record<string, HumanSituation> = Object.create(null)
  for (const [key, raw] of Object.entries(object(v.situationsById))) {
    const s = object(raw)
    if (!Array.isArray(s.participants) || !s.participants.length || s.participants.length > 32 ||
      !['origin', 'aftermath'].includes(String(s.phase)) || !['open', 'resolved', 'expired'].includes(String(s.status))) throw new TypeError('Invalid HRPG situation')
    const resolution = s.resolution === undefined ? undefined : object(s.resolution)
    const item: HumanSituation = {
      id: string(s.id), ruleId: string(s.ruleId), source: source(s.source), actor: actor(s.actor),
      participants: s.participants.map(actor), openedOn: parseGameDate(string(s.openedOn)),
      ...(s.dueOn === undefined ? {} : { dueOn: parseGameDate(string(s.dueOn)) }),
      phase: s.phase as HumanSituation['phase'], status: s.status as HumanSituation['status'],
      ...(s.parentId === undefined ? {} : { parentId: string(s.parentId) }),
      ...(s.causalKey === undefined ? {} : { causalKey: string(s.causalKey) }),
      ...(resolution === undefined ? {} : { resolution: { actionId: string(resolution.actionId), resolvedOn: parseGameDate(string(resolution.resolvedOn)) } }),
    }
    if (key !== item.id || (item.dueOn && item.dueOn < item.openedOn) || (item.status === 'open') !== (resolution === undefined) ||
      (item.phase === 'aftermath' && (!item.parentId || !item.dueOn)) || !item.participants.some(p => p.id === item.actor.id && p.kind === item.actor.kind) ||
      new Set(item.participants.map(p => `${p.kind}:${p.id}`)).size !== item.participants.length ||
      (item.resolution && item.resolution.resolvedOn < item.openedOn)) throw new TypeError('Inconsistent HRPG situation')
    situationsById[key] = Object.freeze(item)
  }
  const knowledgeById: Record<string, HumanKnowledge> = Object.create(null)
  const perSource = new Map<string, number>()
  for (const [key, raw] of Object.entries(object(v.knowledgeById))) {
    const k = object(raw)
    if (!['witnessed', 'public', 'report', 'rumour'].includes(String(k.basis))) throw new TypeError('Invalid HRPG knowledge basis')
    const item: HumanKnowledge = {
      id: string(k.id), source: source(k.source), observerPersonId: string(k.observerPersonId),
      learnedOn: parseGameDate(string(k.learnedOn)), basis: k.basis as HumanKnowledge['basis'],
      ...(k.speakerPersonId === undefined ? {} : { speakerPersonId: string(k.speakerPersonId) }),
      ...(k.claim === undefined ? {} : { claim: string(k.claim) }),
    }
    if (key !== item.id || key !== humanKnowledgeId(item.source, item.observerPersonId) ||
      (['report', 'rumour'].includes(item.basis) && (!item.speakerPersonId || !item.claim)) || (item.claim?.length ?? 0) > 280) throw new TypeError('Inconsistent HRPG knowledge')
    const sourceKey = humanSourceKey(item.source)
    const count = (perSource.get(sourceKey) ?? 0) + 1
    if (count > HUMAN_LIMITS.maxKnowledgePerSource) throw new TypeError('HRPG knowledge limit exceeded')
    perSource.set(sourceKey, count)
    knowledgeById[key] = Object.freeze(item)
  }
  const activeByActor = new Map<string, number>()
  let active = 0
  for (const item of Object.values(situationsById)) {
    if (item.parentId) {
      const parent = situationsById[item.parentId]
      // Parents age out together with children; ancestry is otherwise mandatory.
      if (!parent || parent.phase !== 'origin' || item.phase !== 'aftermath' || parent.status !== 'resolved' ||
        parent.actor.id !== item.actor.id || humanSourceKey(parent.source) !== humanSourceKey(item.source)) throw new TypeError('Invalid HRPG ancestry')
    }
    if (item.status === 'open') {
      active++
      const count = (activeByActor.get(item.actor.id) ?? 0) + 1
      if (count > HUMAN_LIMITS.activePerActor) throw new TypeError('HRPG actor situation limit exceeded')
      activeByActor.set(item.actor.id, count)
    }
  }
  if (active > HUMAN_LIMITS.activeTotal) throw new TypeError('HRPG active situation limit exceeded')
  return Object.freeze({ situationsById: Object.freeze(situationsById), knowledgeById: Object.freeze(knowledgeById),
    ...(v.observedThrough === undefined ? {} : { observedThrough: parseGameDate(string(v.observedThrough)) }) })
}
