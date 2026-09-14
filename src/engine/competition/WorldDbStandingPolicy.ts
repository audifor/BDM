import type { WorldDbCompetitionRulesV1, WorldDbRuleRecordV1 } from './WorldDbCompetitionRules'

export interface WorldDbTiebreakerRulePolicyV1 {
  readonly rule: WorldDbRuleRecordV1
  readonly conditions: readonly WorldDbRuleRecordV1[]
  readonly actions: readonly WorldDbRuleRecordV1[]
}

export interface WorldDbTiebreakerRulesetPolicyV1 {
  readonly ruleset: WorldDbRuleRecordV1
  readonly rules: readonly WorldDbTiebreakerRulePolicyV1[]
}

export interface WorldDbStandingPolicyV1 {
  readonly table: WorldDbRuleRecordV1
  readonly scheme: WorldDbRuleRecordV1
  readonly metricDefinitions: readonly WorldDbRuleRecordV1[]
  readonly pointsRules: readonly WorldDbRuleRecordV1[]
  readonly resultTreatmentRules: readonly WorldDbRuleRecordV1[]
  readonly normalizationRules: readonly WorldDbRuleRecordV1[]
  readonly tiebreakerRulesets: readonly WorldDbTiebreakerRulesetPolicyV1[]
}

/**
 * Reconstructs the canonical B04 standing-policy graph for one structure node.
 *
 * This function validates references and ordering only. Criterion strings, conditions and actions
 * remain opaque until a dedicated runtime interpreter explicitly supports them.
 */
export function resolveWorldDbStandingPolicyForNodeV1(
  rules: WorldDbCompetitionRulesV1,
  structureNodeId: string,
): WorldDbStandingPolicyV1 | null {
  if (structureNodeId.length === 0) throw new TypeError('structureNodeId must be non-empty')

  const tables = rules.standingTables.filter((row) => row.scopeStructureNodeId === structureNodeId)
  if (tables.length === 0) return null
  if (tables.length > 1) throw new Error(`Structure node ${structureNodeId} has multiple standing tables`)

  const table = tables[0]!
  const schemeId = requireTextField(table, 'schemeId')
  const scheme = requireUniqueById(rules.standingSchemes, schemeId, 'standing scheme')

  const metricDefinitions = filterByTextField(rules.standingMetricDefinitions, 'schemeId', schemeId)
  const pointsRules = sortByPriority(filterByTextField(rules.standingPointsRules, 'schemeId', schemeId))
  const resultTreatmentRules = sortByPriority(filterByTextField(rules.standingResultTreatmentRules, 'schemeId', schemeId))
  const normalizationRules = sortByPriority(filterByTextField(rules.standingNormalizationRules, 'schemeId', schemeId))

  const rulesets = filterByTextField(rules.tiebreakerRulesets, 'schemeId', schemeId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((ruleset) => {
      const rawRules = filterByTextField(rules.tiebreakerRules, 'rulesetId', ruleset.id)
      const seenSequence = new Set<number>()
      const orderedRules = rawRules
        .map((rule) => {
          const sequenceNo = requireIntegerField(rule, 'sequenceNo')
          if (seenSequence.has(sequenceNo)) throw new Error(`Tiebreaker ruleset ${ruleset.id} has duplicate sequence ${sequenceNo}`)
          seenSequence.add(sequenceNo)
          return { rule, sequenceNo }
        })
        .sort((left, right) => left.sequenceNo - right.sequenceNo || left.rule.id.localeCompare(right.rule.id))
        .map(({ rule }) => Object.freeze({
          rule,
          conditions: Object.freeze(filterByTextField(rules.tiebreakerConditions, 'ruleId', rule.id).sort(byId)),
          actions: Object.freeze(filterByTextField(rules.tiebreakerActions, 'ruleId', rule.id).sort(byId)),
        }))

      return Object.freeze({ ruleset, rules: Object.freeze(orderedRules) })
    })

  validateNoDanglingTiebreakRows(rules, new Set(rulesets.map((item) => item.ruleset.id)))

  return Object.freeze({
    table,
    scheme,
    metricDefinitions: Object.freeze([...metricDefinitions].sort(byId)),
    pointsRules: Object.freeze(pointsRules),
    resultTreatmentRules: Object.freeze(resultTreatmentRules),
    normalizationRules: Object.freeze(normalizationRules),
    tiebreakerRulesets: Object.freeze(rulesets),
  })
}

function validateNoDanglingTiebreakRows(rules: WorldDbCompetitionRulesV1, selectedRulesetIds: ReadonlySet<string>): void {
  const allRulesetIds = new Set(rules.tiebreakerRulesets.map((row) => row.id))
  const allRuleIds = new Set(rules.tiebreakerRules.map((row) => row.id))

  for (const rule of rules.tiebreakerRules) {
    const rulesetId = requireTextField(rule, 'rulesetId')
    if (!allRulesetIds.has(rulesetId)) throw new Error(`Tiebreaker rule ${rule.id} references unknown ruleset ${rulesetId}`)
  }
  for (const row of [...rules.tiebreakerConditions, ...rules.tiebreakerActions]) {
    const ruleId = requireTextField(row, 'ruleId')
    if (!allRuleIds.has(ruleId)) throw new Error(`Tiebreaker row ${row.id} references unknown rule ${ruleId}`)
  }

  // Selected rulesets may legitimately be empty. This check exists only to force relation parsing
  // for the selected policy without pretending one ruleset is globally preferred.
  for (const id of selectedRulesetIds) {
    if (!allRulesetIds.has(id)) throw new Error(`Selected tiebreaker ruleset does not exist: ${id}`)
  }
}

function requireUniqueById(rows: readonly WorldDbRuleRecordV1[], id: string, label: string): WorldDbRuleRecordV1 {
  const matches = rows.filter((row) => row.id === id)
  if (matches.length !== 1) throw new Error(`${label} ${id} must exist exactly once; found ${matches.length}`)
  return matches[0]!
}

function filterByTextField(rows: readonly WorldDbRuleRecordV1[], field: string, expected: string): WorldDbRuleRecordV1[] {
  return rows.filter((row) => row[field] === expected)
}

function requireTextField(row: WorldDbRuleRecordV1, field: string): string {
  const value = row[field]
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`World DB rule ${row.id} field ${field} must be non-empty text`)
  return value
}

function requireIntegerField(row: WorldDbRuleRecordV1, field: string): number {
  const value = row[field]
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new TypeError(`World DB rule ${row.id} field ${field} must be an integer`)
  return value
}

function sortByPriority(rows: WorldDbRuleRecordV1[]): WorldDbRuleRecordV1[] {
  return rows.sort((left, right) => {
    const leftPriority = typeof left.priority === 'number' ? left.priority : 0
    const rightPriority = typeof right.priority === 'number' ? right.priority : 0
    return leftPriority - rightPriority || left.id.localeCompare(right.id)
  })
}

function byId(left: WorldDbRuleRecordV1, right: WorldDbRuleRecordV1): number {
  return left.id.localeCompare(right.id)
}
