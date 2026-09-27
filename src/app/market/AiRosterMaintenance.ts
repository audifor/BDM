import { getFreeAgentMarketTerms, signFreeAgent } from './MarketService'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { canTeamAffordAdditionalSalary, getFreeAgents, type GameWorld } from '@/domain/world'
import type { WorldRepairReport } from '@/domain/repair'
import { getUserTeam } from '@/engine/calendar'
import type { TeamId } from '@/domain/ids'

export interface AiRosterMaintenanceResult {
  readonly world: GameWorld
  readonly unresolvedTeamIds: readonly TeamId[]
  readonly reports: readonly WorldRepairReport[]
}
export interface AiFreeAgentCandidate { readonly playerId: import('@/domain/ids').PlayerId; readonly annualSalary: number; readonly priorityScore: number; readonly desirability: number }

export function freeAgentDesirability(priorityScore: number, annualSalary: number): number { return priorityScore - annualSalary / 100_000 }

/** Bounded market ranking: talent is knowledge-derived while asking price stays objective. */
export function rankAiFreeAgentCandidates(world: GameWorld, teamId: TeamId): readonly AiFreeAgentCandidate[] {
  const team = world.teams[teamId]!
  const policy = world.organizationEvaluationPoliciesById[team.organizationId]
  return getFreeAgents(world).filter((player) => player.gender === team.gender).map((player) => {
    const terms = getFreeAgentMarketTerms(world, player.id)
    const value = deriveOrganizationPlayerValuation({ organizationId: team.organizationId, playerId: player.id, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'FREE_AGENCY', publicPosition: player.basketball.primaryPosition, policy })
    return { playerId: player.id, annualSalary: terms.annualSalary, priorityScore: value.priorityScore, desirability: freeAgentDesirability(value.priorityScore, terms.annualSalary) }
  }).sort((a, b) => b.desirability - a.desirability || a.annualSalary - b.annualSalary || a.playerId.localeCompare(b.playerId))
}

/** Deterministically signs affordable, same-gender free agents for AI teams up to five rostered players. */
export function maintainAiTeamMinimumRosters(world: GameWorld, teamIds?: readonly TeamId[]): AiRosterMaintenanceResult {
  const userId = getUserTeam(world)?.id
  const targets = teamIds === undefined ? undefined : new Set(teamIds)
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
    while (current.teams[initialTeam.id]!.rosterPlayerIds.length < 5) {
      const candidate = rankAiFreeAgentCandidates(current, initialTeam.id).find((item) => canTeamAffordAdditionalSalary(current, initialTeam.id, item.annualSalary))
      if (candidate === undefined) break
      current = signFreeAgent(current, initialTeam.id, candidate.playerId)
    }
    const afterCount = current.teams[initialTeam.id]!.rosterPlayerIds.length
    const restored = afterCount >= 5
    if (!restored) unresolvedTeamIds.push(initialTeam.id)
    reports.push(rosterReport(initialTeam.id, restored ? 'RECOVERABLE' : 'UNRECOVERABLE', beforeCount, afterCount, restored ? 'Signed only affordable same-gender free agents until the playable minimum was reached.' : 'No affordable eligible free agent could restore the playable minimum; no player was fabricated.', current !== beforeRepair, false, restored ? undefined : { code: 'AI_MINIMUM_ROSTER_UNRESOLVED', message: 'The AI team remains below five rostered players because no affordable same-gender free agent is available.' }))
  }
  return { world: current, unresolvedTeamIds: Object.freeze(unresolvedTeamIds), reports: Object.freeze(reports) }
}

function rosterReport(teamId: TeamId, classification: WorldRepairReport['classification'], before: number, after: number, action: string, changed: boolean, userActionRequired: boolean, diagnostic?: WorldRepairReport['diagnostics'][number]): WorldRepairReport {
  return { repairKind: 'MINIMUM_PLAYABLE_ROSTER', sourceDomain: 'MARKET', targetEntity: String(teamId), classification, previousStateSummary: `rostered=${before}; required=5`, actionApplied: action, resultingStateSummary: `rostered=${after}; required=5`, diagnostics: diagnostic === undefined ? [] : [diagnostic], worldChanged: changed, userActionRequired }
}
