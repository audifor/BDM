import { getFreeAgentMarketTerms, signFreeAgent } from './MarketService'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { getFreeAgents, type GameWorld } from '@/domain/world'
import { evaluateTeamGameplayFinancialDecision, type GameplayFinancialDecision } from '@/domain/finance'
import type { WorldRepairReport } from '@/domain/repair'
import { getUserTeam } from '@/engine/calendar'
import type { TeamId } from '@/domain/ids'

export interface AiRosterMaintenanceResult {
  readonly world: GameWorld
  readonly unresolvedTeamIds: readonly TeamId[]
  readonly reports: readonly WorldRepairReport[]
}
export interface AiFreeAgentCandidate { readonly playerId: import('@/domain/ids').PlayerId; readonly annualSalary: number; readonly priorityScore: number; readonly desirability: number }

/** Truthful canonical attribution for a repair that canonical Finance blocked; never a generic "over budget". */
function canonicalFinanceBlockerSummary(decisions: readonly GameplayFinancialDecision[]): string {
  if (decisions.length === 0) return 'no eligible same-gender free agent is available'
  const outcomes = [...new Set(decisions.map((decision) => decision.outcome))].sort().join('|')
  const statuses = [...new Set(decisions.map((decision) => decision.status))].sort().join('|')
  return `${outcomes} / ${statuses}`
}

export function freeAgentDesirability(priorityScore: number, annualSalary: number): number { return priorityScore - annualSalary / 100_000 }

/** Deterministic candidate ranking used only to restore the minimum playable AI roster. */
export function rankAiFreeAgentCandidates(world: GameWorld, teamId: TeamId): readonly AiFreeAgentCandidate[] {
  const team = world.teams[teamId]!
  const policy = world.organizationEvaluationPoliciesById[team.organizationId]
  return getFreeAgents(world).filter((player) => player.gender === team.gender).map((player) => {
    const terms = getFreeAgentMarketTerms(world, player.id)
    const value = deriveOrganizationPlayerValuation({ organizationId: team.organizationId, playerId: player.id, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'FREE_AGENCY', publicPosition: player.basketball.primaryPosition, policy })
    return { playerId: player.id, annualSalary: terms.annualSalary, priorityScore: value.priorityScore, desirability: freeAgentDesirability(value.priorityScore, terms.annualSalary) }
  }).sort((a, b) => b.desirability - a.desirability || a.annualSalary - b.annualSalary || a.playerId.localeCompare(b.playerId))
}

/** WORLD_REPAIR-only signing for deficient AI teams, bounded by the five-player playable minimum. */
export function maintainAiTeamMinimumRosters(world: GameWorld, context: { readonly source: 'WORLD_REPAIR'; readonly teamIds?: readonly TeamId[] }): AiRosterMaintenanceResult {
  if (context.source !== 'WORLD_REPAIR') throw new Error('Minimum roster signing is restricted to WORLD_REPAIR')
  const userId = getUserTeam(world)?.id
  const targets = context.teamIds === undefined ? undefined : new Set(context.teamIds)
  let current = world
  const unresolvedTeamIds: TeamId[] = []
  const reports: WorldRepairReport[] = []
  const teams = Object.values(world.teams).filter((team) => targets === undefined || targets.has(team.id)).sort((a, b) => a.id.localeCompare(b.id))

  for (const initialTeam of teams) {
    const beforeCount = current.teams[initialTeam.id]!.rosterPlayerIds.length
    if (beforeCount >= 5) {
      reports.push(rosterReport(initialTeam.id, 'ALREADY_VALID', beforeCount, beforeCount, 'No action.', false, false))
      continue
    }
    if (initialTeam.id === userId) {
      unresolvedTeamIds.push(initialTeam.id)
      reports.push(rosterReport(initialTeam.id, 'RECOVERABLE', beforeCount, beforeCount, 'Left the user roster unchanged; manual signing remains the user’s decision.', false, true, { code: 'USER_ROSTER_REQUIRES_MANUAL_SIGNING', message: 'The user team has fewer than five rostered players and has a supported Market signing path.' }))
      continue
    }

    const beforeRepair = current
    let financeBlockers: readonly GameplayFinancialDecision[] = []
    while (current.teams[initialTeam.id]!.rosterPlayerIds.length < 5) {
      // Canonical Finance is the candidate filter, and the canonical outcome is preserved rather than
      // reduced to "over budget": an affordable candidate is one whose canonical decision allows the
      // signing right now.
      const evaluated = rankAiFreeAgentCandidates(current, initialTeam.id).map((item) => ({
        item,
        decision: evaluateTeamGameplayFinancialDecision(current, {
          teamId: initialTeam.id,
          action: 'PLAYER_SIGNING',
          legacyAnnualAmountMajorUnits: item.annualSalary,
          sourceAuthority: 'AI_MINIMUM_ROSTER_REPAIR',
          sourceEntityId: String(item.playerId),
        }),
      }))
      const candidate = evaluated.find((entry) => entry.decision.allowed)?.item
      if (candidate === undefined) {
        financeBlockers = evaluated.map((entry) => entry.decision)
        break
      }
      current = signFreeAgent(current, initialTeam.id, candidate.playerId, 'WORLD_REPAIR')
    }
    const afterCount = current.teams[initialTeam.id]!.rosterPlayerIds.length
    const restored = afterCount >= 5
    if (!restored) unresolvedTeamIds.push(initialTeam.id)
    reports.push(rosterReport(initialTeam.id, restored ? 'RECOVERABLE' : 'UNRECOVERABLE', beforeCount, afterCount, restored ? 'Signed only canonically affordable same-gender free agents until the playable minimum was reached.' : 'No canonically affordable eligible free agent could restore the playable minimum; no player was fabricated.', current !== beforeRepair, false, restored ? undefined : { code: 'AI_MINIMUM_ROSTER_UNRESOLVED', message: `The AI team remains below five rostered players because canonical Finance blocked every eligible same-gender free agent (${canonicalFinanceBlockerSummary(financeBlockers)}).` }))
  }
  return { world: current, unresolvedTeamIds: Object.freeze(unresolvedTeamIds), reports: Object.freeze(reports) }
}

function rosterReport(teamId: TeamId, classification: WorldRepairReport['classification'], before: number, after: number, action: string, changed: boolean, userActionRequired: boolean, diagnostic?: WorldRepairReport['diagnostics'][number]): WorldRepairReport {
  return { repairKind: 'MINIMUM_PLAYABLE_ROSTER', sourceDomain: 'WORLD_REPAIR', targetEntity: String(teamId), classification, previousStateSummary: `rostered=${before}; required=5`, actionApplied: action, resultingStateSummary: `rostered=${after}; required=5`, diagnostics: diagnostic === undefined ? [] : [diagnostic], worldChanged: changed, userActionRequired }
}
