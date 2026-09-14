import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'

export interface WorldDbRuleRecordV1 {
  readonly id: string
  readonly scopeStructureNodeId?: string | null
  readonly type?: string
  readonly payload?: unknown
  readonly [key: string]: unknown
}

export interface WorldDbCompetitionRulesV1 {
  readonly pairing: readonly WorldDbRuleRecordV1[]
  readonly opponentScope: readonly WorldDbRuleRecordV1[]
  readonly hosting: readonly WorldDbRuleRecordV1[]
  readonly progressionRules: readonly WorldDbRuleRecordV1[]
  readonly progressionConditions: readonly WorldDbRuleRecordV1[]
  readonly progressionDestinations: readonly WorldDbRuleRecordV1[]
  readonly entrySelectionProcesses: readonly WorldDbRuleRecordV1[]
  readonly entrySelectionCriteria: readonly WorldDbRuleRecordV1[]
  readonly seedingSchemes: readonly WorldDbRuleRecordV1[]
  readonly seedingBasis: readonly WorldDbRuleRecordV1[]
  readonly contestFormats: readonly WorldDbRuleRecordV1[]
  readonly singleGameFormats: readonly WorldDbRuleRecordV1[]
  readonly seriesFormats: readonly WorldDbRuleRecordV1[]
  readonly seriesHostingPatterns: readonly WorldDbRuleRecordV1[]
  readonly standingSchemes: readonly WorldDbRuleRecordV1[]
  readonly standingTables: readonly WorldDbRuleRecordV1[]
  readonly standingMetricDefinitions: readonly WorldDbRuleRecordV1[]
  readonly standingPointsRules: readonly WorldDbRuleRecordV1[]
  readonly standingResultTreatmentRules: readonly WorldDbRuleRecordV1[]
  readonly standingNormalizationRules: readonly WorldDbRuleRecordV1[]
  readonly tiebreakerRulesets: readonly WorldDbRuleRecordV1[]
  readonly tiebreakerRules: readonly WorldDbRuleRecordV1[]
  readonly tiebreakerConditions: readonly WorldDbRuleRecordV1[]
  readonly tiebreakerActions: readonly WorldDbRuleRecordV1[]
  readonly initialScore: readonly WorldDbRuleRecordV1[]
  readonly rulesByNodeId: Readonly<Record<string, readonly WorldDbRuleRecordV1[]>>
}

const FAMILY_NAMES = [
  'pairing',
  'opponentScope',
  'hosting',
  'progressionRules',
  'progressionConditions',
  'progressionDestinations',
  'entrySelectionProcesses',
  'entrySelectionCriteria',
  'seedingSchemes',
  'seedingBasis',
  'contestFormats',
  'singleGameFormats',
  'seriesFormats',
  'seriesHostingPatterns',
  'standingSchemes',
  'standingTables',
  'standingMetricDefinitions',
  'standingPointsRules',
  'standingResultTreatmentRules',
  'standingNormalizationRules',
  'tiebreakerRulesets',
  'tiebreakerRules',
  'tiebreakerConditions',
  'tiebreakerActions',
  'initialScore',
] as const

type FamilyName = (typeof FAMILY_NAMES)[number]

export function createWorldDbCompetitionRulesV1(bundle: WorldDbCompetitionBundleV1): WorldDbCompetitionRulesV1 {
  const families = Object.fromEntries(
    FAMILY_NAMES.map((family) => [family, readFamily(bundle, family)]),
  ) as Record<FamilyName, readonly WorldDbRuleRecordV1[]>

  const rulesByNodeId: Record<string, WorldDbRuleRecordV1[]> = {}
  for (const family of FAMILY_NAMES) {
    for (const rule of families[family]) {
      if (typeof rule.scopeStructureNodeId === 'string') {
        ;(rulesByNodeId[rule.scopeStructureNodeId] ??= []).push(rule)
      }
    }
  }
  for (const rules of Object.values(rulesByNodeId)) Object.freeze(rules)

  return Object.freeze({
    ...families,
    rulesByNodeId: Object.freeze(rulesByNodeId),
  })
}

function readFamily(bundle: WorldDbCompetitionBundleV1, family: FamilyName): readonly WorldDbRuleRecordV1[] {
  const value = bundle.rulePayloads[family]
  if (value === undefined) return Object.freeze([])
  if (!Array.isArray(value)) throw new TypeError(`World DB rule family ${family} must be an array`)

  const records = value.map((item, index) => {
    if (!isRecord(item)) throw new TypeError(`World DB rule family ${family}[${index}] must be an object`)
    if (typeof item.id !== 'string' || item.id.length === 0) {
      throw new TypeError(`World DB rule family ${family}[${index}] must have a non-empty id`)
    }
    return Object.freeze({ ...item }) as WorldDbRuleRecordV1
  })
  return Object.freeze(records)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
