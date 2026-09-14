import { array, enumValue, jsonObject, record, requireUnique, text } from './WorldCompetitionFormatParserHelpers'
import type { JsonObject, WorldCompetitionSource } from './WorldCompetitionFormatTypes'

export const WORLD_COMPETITION_INITIAL_SCORE_SCHEMA_VERSION = '1.0' as const

export type WorldCompetitionInitialScoreRuleType = 'FIXED' | 'CLASSIFICATION_DIFFERENCE' | 'PARTICIPANT_ATTRIBUTE'
export type WorldCompetitionInitialScoreCompositionMode = 'ADDITIVE' | 'REPLACE' | 'MAXIMUM'

export interface WorldCompetitionInitialScoreRule {
  readonly key: string
  readonly variantKey: string
  readonly scopeNodeKey: string
  readonly ruleType: WorldCompetitionInitialScoreRuleType
  readonly priority: number
  readonly compositionMode: WorldCompetitionInitialScoreCompositionMode
  readonly payload: JsonObject
}

export interface WorldCompetitionInitialScoreDocument {
  readonly schemaVersion: typeof WORLD_COMPETITION_INITIAL_SCORE_SCHEMA_VERSION
  readonly competitionId: string
  readonly competitionSeasonId: string
  readonly rules: readonly WorldCompetitionInitialScoreRule[]
  readonly sources: readonly WorldCompetitionSource[]
}

export function parseWorldCompetitionInitialScoreDocument(value: unknown): WorldCompetitionInitialScoreDocument {
  const raw = record(value, 'competition initial score document')
  const schemaVersion = text(raw.schema_version, 'initial_score.schema_version')
  if (schemaVersion !== WORLD_COMPETITION_INITIAL_SCORE_SCHEMA_VERSION) throw new RangeError(`Unsupported initial score schema_version: ${schemaVersion}`)

  const rules = array(raw.rules, 'initial_score.rules').map((item) => {
    const rule = record(item, 'initial_score.rule')
    const priority = rule.priority === undefined ? 0 : positiveOrZeroInteger(rule.priority, 'initial_score.rule.priority')
    const ruleType = enumValue(rule.rule_type, ['FIXED', 'CLASSIFICATION_DIFFERENCE', 'PARTICIPANT_ATTRIBUTE'] as const, 'initial_score.rule.rule_type')
    const payload = jsonObject(rule.payload, 'initial_score.rule.payload')
    if (ruleType === 'CLASSIFICATION_DIFFERENCE') {
      const points = payload.points_per_level
      if (typeof points !== 'number' || !Number.isInteger(points) || points <= 0) throw new RangeError('CLASSIFICATION_DIFFERENCE requires positive integer points_per_level')
    }
    return Object.freeze({
      key: text(rule.key, 'initial_score.rule.key'),
      variantKey: text(rule.variant_key, 'initial_score.rule.variant_key'),
      scopeNodeKey: text(rule.scope_node_key, 'initial_score.rule.scope_node_key'),
      ruleType,
      priority,
      compositionMode: rule.composition_mode === undefined ? 'ADDITIVE' : enumValue(rule.composition_mode, ['ADDITIVE', 'REPLACE', 'MAXIMUM'] as const, 'initial_score.rule.composition_mode'),
      payload,
    })
  })
  if (rules.length === 0) throw new RangeError('Competition initial score document requires at least one rule')
  requireUnique(rules.map((rule) => rule.key), 'initial score rule key')

  const sources = array(raw.sources, 'initial_score.sources').map((item) => {
    const source = record(item, 'initial_score.source')
    const url = text(source.url, 'initial_score.source.url')
    if (!/^https?:\/\//.test(url)) throw new TypeError('initial_score.source.url must be http(s)')
    return Object.freeze({
      url,
      type: enumValue(source.type, ['OFFICIAL', 'PRIMARY', 'SECONDARY'] as const, 'initial_score.source.type'),
      ...(typeof source.scope === 'string' && source.scope.trim() !== '' ? { scope: source.scope } : {}),
      ...(typeof source.notes === 'string' && source.notes.trim() !== '' ? { notes: source.notes } : {}),
    })
  })
  if (sources.length === 0) throw new RangeError('Competition initial score document requires at least one source')

  return Object.freeze({
    schemaVersion: WORLD_COMPETITION_INITIAL_SCORE_SCHEMA_VERSION,
    competitionId: text(raw.competition_id, 'initial_score.competition_id'),
    competitionSeasonId: text(raw.competition_season_id, 'initial_score.competition_season_id'),
    rules: Object.freeze(rules),
    sources: Object.freeze(sources),
  })
}

function positiveOrZeroInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new RangeError(`${label} must be a non-negative integer`)
  return value as number
}
