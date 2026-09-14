import type { WorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import type { WorldDbCompetitionRulesV1, WorldDbRuleRecordV1 } from './WorldDbCompetitionRules'

export type WorldDbEntrySelectionStatusV1 = 'ready' | 'pending'

export interface WorldDbEntrySelectionRequirementV1 {
  readonly processId: string
  readonly method: string
  readonly expectedTeamCount: number | null
  readonly payload: Readonly<Record<string, unknown>> | null
}

export interface WorldDbEntrySelectionResultV1 {
  readonly status: WorldDbEntrySelectionStatusV1
  readonly teamIds: readonly string[]
  readonly requirements: readonly WorldDbEntrySelectionRequirementV1[]
}

export interface ResolveWorldDbEntrySelectionV1Input {
  /** Standings are supplied in final rank order, best team first. */
  readonly standingTeamIdsByCompetitionSeasonId?: Readonly<Record<string, readonly string[]>>
  /** Institutional/manual selections such as committee, wildcard, host or license decisions. */
  readonly explicitTeamIdsByProcessId?: Readonly<Record<string, readonly string[]>>
  /** Required only when a season contains multiple selectable format variants/processes. */
  readonly processId?: string
}

/**
 * Resolves competition entrants without competition-specific branches.
 * Rank-based selection is deterministic from supplied standings. Institutional methods remain
 * explicit requirements unless the caller supplies their actual selected teams.
 */
export function resolveWorldDbEntrySelectionV1(
  runtime: WorldDbCompetitionRuntimeV1,
  rules: WorldDbCompetitionRulesV1,
  input: ResolveWorldDbEntrySelectionV1Input = {},
): WorldDbEntrySelectionResultV1 {
  const processes = selectProcesses(rules.entrySelectionProcesses, input.processId)

  if (processes.length === 0) {
    const directEntries = unique(runtime.bundle.entries
      .map((entry) => entry.teamId)
      .filter((teamId): teamId is string => typeof teamId === 'string' && teamId.length > 0))
    if (directEntries.length === 0) {
      return frozenResult('pending', [], [
        { processId: 'implicit:direct', method: 'DIRECT', expectedTeamCount: null, payload: null },
      ])
    }
    return frozenResult('ready', directEntries, [])
  }

  if (processes.length !== 1) {
    throw new Error(`World DB entry selection requires one process; found ${processes.length}. Supply processId explicitly.`)
  }

  const process = processes[0]!
  const processId = requireText(process.id, 'Entry selection process id')
  const method = requireText(process.method, `Entry selection process ${processId} method`)
  const payload = processPayload(processId, rules.entrySelectionCriteria)
  const expectedTeamCount = readExpectedTeamCount(payload)
  const explicit = input.explicitTeamIdsByProcessId?.[processId]

  if (explicit !== undefined) {
    const teamIds = validateExplicitSelection(explicit, expectedTeamCount, processId)
    return frozenResult('ready', teamIds, [])
  }

  switch (method) {
    case 'DIRECT': {
      const teamIds = unique(runtime.bundle.entries
        .map((entry) => entry.teamId)
        .filter((teamId): teamId is string => typeof teamId === 'string' && teamId.length > 0))
      if (teamIds.length === 0) return pending(processId, method, expectedTeamCount, payload)
      if (expectedTeamCount !== null && teamIds.length !== expectedTeamCount) {
        throw new Error(`DIRECT entry selection ${processId} expected ${expectedTeamCount} teams, found ${teamIds.length}`)
      }
      return frozenResult('ready', teamIds, [])
    }
    case 'RANK_BASED':
      return resolveRankBased(processId, payload, input.standingTeamIdsByCompetitionSeasonId)
    case 'QUALIFICATION':
    case 'WILDCARD':
    case 'LICENSE':
    case 'HOST':
    case 'COMMITTEE_SELECTION':
      return pending(processId, method, expectedTeamCount, payload)
    default:
      throw new Error(`Unsupported World DB entry selection method: ${method}`)
  }
}

function resolveRankBased(
  processId: string,
  payload: Readonly<Record<string, unknown>> | null,
  standings: Readonly<Record<string, readonly string[]>> | undefined,
): WorldDbEntrySelectionResultV1 {
  if (payload === null) throw new Error(`RANK_BASED entry selection ${processId} requires a payload`)
  const sourceCompetitionSeasonId = requireText(
    payload.source_competition_season_id,
    `RANK_BASED entry selection ${processId} source_competition_season_id`,
  )
  const rankedTeamIds = standings?.[sourceCompetitionSeasonId]
  const rankFrom = integerAtLeast(payload.rank_from, 1, `RANK_BASED entry selection ${processId} rank_from`)
  const rankTo = integerAtLeast(payload.rank_to, rankFrom, `RANK_BASED entry selection ${processId} rank_to`)
  const expectedCount = rankTo - rankFrom + 1
  const declaredCount = readExpectedTeamCount(payload)
  if (declaredCount !== null && declaredCount !== expectedCount) {
    throw new Error(`RANK_BASED entry selection ${processId} team_count ${declaredCount} conflicts with rank range ${expectedCount}`)
  }
  if (rankedTeamIds === undefined) return pending(processId, 'RANK_BASED', expectedCount, payload)
  const uniqueStandings = unique(rankedTeamIds.map((teamId) => requireText(teamId, 'Standing team id')))
  if (uniqueStandings.length !== rankedTeamIds.length) {
    throw new Error(`RANK_BASED standings ${sourceCompetitionSeasonId} contain duplicate teams`)
  }
  if (uniqueStandings.length < rankTo) {
    throw new Error(`RANK_BASED standings ${sourceCompetitionSeasonId} contain only ${uniqueStandings.length} teams; rank ${rankTo} is required`)
  }
  return frozenResult('ready', uniqueStandings.slice(rankFrom - 1, rankTo), [])
}

function processPayload(
  processId: string,
  criteria: readonly WorldDbRuleRecordV1[],
): Readonly<Record<string, unknown>> | null {
  const processCriteria = criteria
    .filter((criterion) => criterion.processId === processId)
    .sort((left, right) => numberOrZero(left.sequenceNo) - numberOrZero(right.sequenceNo))
  if (processCriteria.length === 0) return null
  if (processCriteria.length !== 1 || processCriteria[0]!.type !== 'PAYLOAD') {
    throw new Error(`Entry selection process ${processId} has unsupported criterion composition`)
  }
  return recordOrNull(processCriteria[0]!.payload, `Entry selection process ${processId} payload`)
}

function selectProcesses(
  processes: readonly WorldDbRuleRecordV1[],
  processId: string | undefined,
): readonly WorldDbRuleRecordV1[] {
  if (processId === undefined) return processes
  const id = requireText(processId, 'Entry selection processId')
  const selected = processes.filter((process) => process.id === id)
  if (selected.length === 0) throw new Error(`Entry selection process not found: ${id}`)
  return selected
}

function validateExplicitSelection(values: readonly string[], expectedCount: number | null, processId: string): readonly string[] {
  const teamIds = unique(values.map((teamId) => requireText(teamId, `Explicit entry selection ${processId} team id`)))
  if (teamIds.length !== values.length) throw new Error(`Explicit entry selection ${processId} contains duplicate teams`)
  if (expectedCount !== null && teamIds.length !== expectedCount) {
    throw new Error(`Explicit entry selection ${processId} expected ${expectedCount} teams, found ${teamIds.length}`)
  }
  return teamIds
}

function pending(
  processId: string,
  method: string,
  expectedTeamCount: number | null,
  payload: Readonly<Record<string, unknown>> | null,
): WorldDbEntrySelectionResultV1 {
  return frozenResult('pending', [], [{ processId, method, expectedTeamCount, payload }])
}

function frozenResult(
  status: WorldDbEntrySelectionStatusV1,
  teamIds: readonly string[],
  requirements: readonly WorldDbEntrySelectionRequirementV1[],
): WorldDbEntrySelectionResultV1 {
  return Object.freeze({
    status,
    teamIds: Object.freeze([...teamIds]),
    requirements: Object.freeze(requirements.map((requirement) => Object.freeze({ ...requirement }))),
  })
}

function readExpectedTeamCount(payload: Readonly<Record<string, unknown>> | null): number | null {
  if (payload === null || payload.team_count === undefined) return null
  return integerAtLeast(payload.team_count, 1, 'Entry selection team_count')
}

function integerAtLeast(value: unknown, minimum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be an integer >= ${minimum}`)
  }
  return value
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function recordOrNull(value: unknown, label: string): Readonly<Record<string, unknown>> | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Readonly<Record<string, unknown>>
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`)
  return value
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}
