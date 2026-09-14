import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { createWorldDbCompetitionRulesV1, type WorldDbRuleRecordV1 } from './WorldDbCompetitionRules'

export interface WorldDbPhysicalMatchPolicyV1 {
  /** Optional competition season whose physical matches may also realize fixtures in this season. */
  readonly sharedCompetitionSeasonId: string | null
  /** Season-level authoring policy keyed by declared phase/node key. Values remain opaque. */
  readonly sharedMatchPolicyByPhaseKey: Readonly<Record<string, string>>
  /** Node-scoped physical-match context. Values remain opaque until an execution adapter supports them. */
  readonly physicalMatchContextByNodeId: Readonly<Record<string, string>>
}

/**
 * Projects the physical-match identity hints carried by canonical B04 rule payloads.
 *
 * This layer intentionally does not interpret vocabulary such as SHARED_WITH_* or CUP_ONLY.
 * It only validates and joins the declarative policy so a later B04 -> B12 materializer can decide
 * whether one physical Game should realize fixtures from more than one competition season.
 */
export function projectWorldDbPhysicalMatchPolicyV1(
  bundle: WorldDbCompetitionBundleV1,
): WorldDbPhysicalMatchPolicyV1 {
  const rules = createWorldDbCompetitionRulesV1(bundle)
  let sharedCompetitionSeasonId: string | null = null
  const sharedMatchPolicyByPhaseKey: Record<string, string> = {}
  const physicalMatchContextByNodeId: Record<string, string> = {}

  for (const criterion of rules.entrySelectionCriteria) {
    const payload = optionalRecord(criterion.payload, `Entry selection criterion ${criterion.id} payload`)
    if (payload === null) continue

    const declaredSharedSeason = payload.shared_competition_season_id
    if (declaredSharedSeason !== undefined) {
      const value = requireText(declaredSharedSeason, `Entry selection criterion ${criterion.id} shared_competition_season_id`)
      if (value === bundle.competitionSeason.competitionSeasonId) {
        throw new Error(`Shared competition season cannot reference itself: ${value}`)
      }
      if (sharedCompetitionSeasonId !== null && sharedCompetitionSeasonId !== value) {
        throw new Error(`Conflicting shared competition seasons: ${sharedCompetitionSeasonId} vs ${value}`)
      }
      sharedCompetitionSeasonId = value
    }

    const declaredPolicy = payload.shared_match_policy
    if (declaredPolicy !== undefined) {
      const policy = requireRecord(declaredPolicy, `Entry selection criterion ${criterion.id} shared_match_policy`)
      for (const [phaseKey, rawContext] of Object.entries(policy)) {
        const key = requireText(phaseKey, `Entry selection criterion ${criterion.id} shared-match phase key`)
        const context = requireText(rawContext, `Entry selection criterion ${criterion.id} shared-match context for ${key}`)
        mergeUnique(sharedMatchPolicyByPhaseKey, key, context, 'shared-match phase policy')
      }
    }
  }

  for (const rule of [...rules.pairing, ...rules.opponentScope, ...rules.hosting]) {
    projectNodePhysicalContext(rule, physicalMatchContextByNodeId)
  }

  if (Object.keys(sharedMatchPolicyByPhaseKey).length > 0 && sharedCompetitionSeasonId === null) {
    throw new Error('Shared match policy requires shared_competition_season_id')
  }

  return Object.freeze({
    sharedCompetitionSeasonId,
    sharedMatchPolicyByPhaseKey: Object.freeze(sharedMatchPolicyByPhaseKey),
    physicalMatchContextByNodeId: Object.freeze(physicalMatchContextByNodeId),
  })
}

function projectNodePhysicalContext(
  rule: WorldDbRuleRecordV1,
  target: Record<string, string>,
): void {
  if (typeof rule.scopeStructureNodeId !== 'string') return
  const payload = optionalRecord(rule.payload, `Rule ${rule.id} payload`)
  if (payload === null || payload.physical_match_context === undefined) return
  const context = requireText(payload.physical_match_context, `Rule ${rule.id} physical_match_context`)
  mergeUnique(target, rule.scopeStructureNodeId, context, 'physical-match node context')
}

function mergeUnique(target: Record<string, string>, key: string, value: string, label: string): void {
  const previous = target[key]
  if (previous !== undefined && previous !== value) {
    throw new Error(`Conflicting ${label} for ${key}: ${previous} vs ${value}`)
  }
  target[key] = value
}

function optionalRecord(value: unknown, label: string): Record<string, unknown> | null {
  if (value === undefined || value === null) return null
  return requireRecord(value, label)
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value
}
