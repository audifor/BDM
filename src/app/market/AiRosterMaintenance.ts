import { pendingBindingRosterPlayerIds } from '@/engine/recruiting/RecruitingRosterCommitments'
import { getFreeAgentMarketTerms, signFreeAgent } from './MarketService'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { canTeamAffordAdditionalSalary, getFreeAgents, isPlayerAvailable, type GameWorld } from '@/domain/world'
import type { WorldRepairReport } from '@/domain/repair'
import { getScheduledGamesToday, getUserTeam } from '@/engine/calendar'
import { enrollNcaaWalkOn, getNcaaIntakeContext, rankNcaaWalkOnCandidates } from '@/engine/recruiting/NcaaWalkOnIntake'
import { arriveSignedRecruits } from '@/engine/recruiting/RecruitingEngine'
import { getEligiblePlayersForCompetition, getAvailablePlayersForCompetition } from '@/engine/eligibility'
import type { TeamId } from '@/domain/ids'

export interface AiRosterMaintenanceResult {
  readonly world: GameWorld
  readonly unresolvedTeamIds: readonly TeamId[]
  readonly reports: readonly WorldRepairReport[]
}
export interface AiFreeAgentCandidate { readonly playerId: import('@/domain/ids').PlayerId; readonly annualSalary: number; readonly priorityScore: number; readonly desirability: number }
interface RankedAiFreeAgentPool { readonly candidates: readonly AiFreeAgentCandidate[]; readonly pendingCommitments: readonly AiFreeAgentCandidate[] }

export function freeAgentDesirability(priorityScore: number, annualSalary: number): number { return priorityScore - annualSalary / 100_000 }

/** Deterministic candidate ranking used only to restore the minimum playable AI roster. */
export function rankAiFreeAgentCandidates(world: GameWorld, teamId: TeamId): readonly AiFreeAgentCandidate[] {
  return rankAiFreeAgentPool(world, teamId).candidates
}

function rankAiFreeAgentPool(world: GameWorld, teamId: TeamId): RankedAiFreeAgentPool {
  const team = world.teams[teamId]!
  const policy = world.organizationEvaluationPoliciesById[team.organizationId]
  const pendingBindings = pendingBindingRosterPlayerIds(world)
  const candidates = getFreeAgents(world).filter((player) => player.gender === team.gender).map((player) => {
    const terms = getFreeAgentMarketTerms(world, player.id)
    const value = deriveOrganizationPlayerValuation({ organizationId: team.organizationId, playerId: player.id, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'FREE_AGENCY', publicPosition: player.basketball.primaryPosition, policy })
    return { playerId: player.id, annualSalary: terms.annualSalary, priorityScore: value.priorityScore, desirability: freeAgentDesirability(value.priorityScore, terms.annualSalary) }
  })
  const ordered = (items: readonly AiFreeAgentCandidate[]) => [...items].sort((a, b) => b.desirability - a.desirability || a.annualSalary - b.annualSalary || a.playerId.localeCompare(b.playerId))
  return {
    candidates: ordered(candidates.filter((candidate) => !pendingBindings.has(candidate.playerId))),
    pendingCommitments: ordered(candidates.filter((candidate) => pendingBindings.has(candidate.playerId))),
  }
}

/** WORLD_REPAIR-only signing for deficient AI teams, bounded by the five-player playable minimum. */
export function maintainAiTeamMinimumRosters(world: GameWorld, context: { readonly source: 'WORLD_REPAIR'; readonly teamIds?: readonly TeamId[] }): AiRosterMaintenanceResult {
  if (context.source !== 'WORLD_REPAIR') throw new Error('Minimum roster signing is restricted to WORLD_REPAIR')
  const userId = getUserTeam(world)?.id
  const targets = context.teamIds === undefined ? undefined : new Set(context.teamIds)
  const scheduledGames = getScheduledGamesToday(world)
  const collegeTeamIds = new Set(Object.values(world.competitions).filter(competition => world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike').flatMap(competition => competition.participantTeamIds))
  let current = world
  const unresolvedTeamIds: TeamId[] = []
  const reports: WorldRepairReport[] = []
  const teams = Object.values(world.teams).filter((team) => targets === undefined || targets.has(team.id)).sort((a, b) => a.id.localeCompare(b.id))

  for (const initialTeam of teams) {
    const scheduledGame = scheduledGames.find(game => (game.homeTeamId === initialTeam.id || game.awayTeamId === initialTeam.id))
    const collegeContext = collegeTeamIds.has(initialTeam.id) ? getNcaaIntakeContext(current, initialTeam.id) : undefined
    const collegeCompetition = collegeContext?.competition
    const collegeSeason = collegeContext?.season
    const countBasis = scheduledGame === undefined ? 'rostered' : 'available'
    const minimumCount = (snapshot: GameWorld) => scheduledGame === undefined
      ? collegeCompetition && collegeSeason ? getEligiblePlayersForCompetition(snapshot, initialTeam.id, collegeCompetition.id, collegeSeason.id, snapshot.currentDate).length : snapshot.teams[initialTeam.id]!.rosterPlayerIds.length
      : getAvailablePlayersForCompetition(snapshot, initialTeam.id, scheduledGame.competitionId, scheduledGame.seasonId, scheduledGame.date).length
    const beforeCount = minimumCount(current)
    if (beforeCount >= 5) {
      reports.push(rosterReport(initialTeam.id, 'ALREADY_VALID', beforeCount, beforeCount, 'No action.', false, false, undefined, countBasis))
      continue
    }
    if (collegeTeamIds.has(initialTeam.id) && initialTeam.id !== userId) {
      const beforeRepair = current
      current = arriveSignedRecruits(current)
      // Match the established seven-player college rotation; only enter this safety
      // path after normal arrivals leave the program below its playable minimum.
      if (minimumCount(current) < 5) {
        const rejected = new Set<string>()
        while (minimumCount(current) < 7) {
          const candidate = rankNcaaWalkOnCandidates(current, initialTeam.id).find(id => !rejected.has(id) && (scheduledGame === undefined || isPlayerAvailable(current, id, scheduledGame.date)))
          if (!candidate) break
          rejected.add(candidate)
          current = enrollNcaaWalkOn(current, initialTeam.id, candidate, 'WORLD_REPAIR')
        }
      }
      const afterCount = minimumCount(current)
      const restored = afterCount >= 5
      if (!restored) unresolvedTeamIds.push(initialTeam.id)
      reports.push(rosterReport(initialTeam.id, restored ? 'RECOVERABLE' : 'UNRECOVERABLE', beforeCount, afterCount, 'Processed normal arrivals, then canonical no-aid walk-on admission from existing eligible Players.', current !== beforeRepair, false, restored ? undefined : { code: 'NCAA_NO_ELIGIBLE_EXISTING_INTAKE', message: 'No legally available existing Player passed the canonical college admission assessment.' }, countBasis))
      continue
    }
    if (initialTeam.id === userId) {
      unresolvedTeamIds.push(initialTeam.id)
      reports.push(rosterReport(initialTeam.id, 'RECOVERABLE', beforeCount, beforeCount, 'Left the user roster unchanged; manual signing remains the user’s decision.', false, true, { code: 'USER_ROSTER_REQUIRES_MANUAL_SIGNING', message: `The user team has fewer than five ${countBasis} players and has a supported Market signing path.` }, countBasis))
      continue
    }

    const beforeRepair = current
    const rejectedCommitments = new Set<string>()
    while (minimumCount(current) < 5) {
      const pool = rankAiFreeAgentPool(current, initialTeam.id)
      for (const item of pool.pendingCommitments) {
        if (rejectedCommitments.has(item.playerId) || (scheduledGame !== undefined && !isPlayerAvailable(current, item.playerId, scheduledGame.date)) || !canTeamAffordAdditionalSalary(current, initialTeam.id, item.annualSalary)) continue
        rejectedCommitments.add(item.playerId)
        reports.push({ repairKind: 'MINIMUM_ROSTER_CANDIDATE', sourceDomain: 'WORLD_REPAIR', targetEntity: item.playerId, classification: 'NOT_APPLICABLE', previousStateSummary: `Player has a binding future roster commitment; Team ${initialTeam.id} is below five players.`, actionApplied: 'Skipped this Player as an AI roster-repair candidate.', resultingStateSummary: 'Pending destination commitment remains unchanged.', diagnostics: [{ code: 'PENDING_BINDING_ROSTER_COMMITMENT', message: `Player ${item.playerId} is reserved by a valid pending recruiting signing or active Player rights and cannot be signed by WORLD_REPAIR for ${initialTeam.id}.` }], worldChanged: false, userActionRequired: false })
      }
      const candidate = pool.candidates.find((item) => (scheduledGame === undefined || isPlayerAvailable(current, item.playerId, scheduledGame.date)) && canTeamAffordAdditionalSalary(current, initialTeam.id, item.annualSalary))
      if (candidate === undefined) break
      current = signFreeAgent(current, initialTeam.id, candidate.playerId, 'WORLD_REPAIR')
    }
    const afterCount = minimumCount(current)
    const restored = afterCount >= 5
    if (!restored) unresolvedTeamIds.push(initialTeam.id)
    reports.push(rosterReport(initialTeam.id, restored ? 'RECOVERABLE' : 'UNRECOVERABLE', beforeCount, afterCount, restored ? 'Signed only affordable same-gender free agents until the playable minimum was reached.' : 'No affordable eligible free agent could restore the playable minimum; no player was fabricated.', current !== beforeRepair, false, restored ? undefined : { code: 'AI_MINIMUM_ROSTER_UNRESOLVED', message: `The AI team remains below five ${countBasis} players because no affordable same-gender free agent is available.` }, countBasis))
  }
  return { world: current, unresolvedTeamIds: Object.freeze(unresolvedTeamIds), reports: Object.freeze(reports) }
}

function rosterReport(teamId: TeamId, classification: WorldRepairReport['classification'], before: number, after: number, action: string, changed: boolean, userActionRequired: boolean, diagnostic?: WorldRepairReport['diagnostics'][number], countBasis: 'rostered' | 'available' = 'rostered'): WorldRepairReport {
  return { repairKind: 'MINIMUM_PLAYABLE_ROSTER', sourceDomain: 'WORLD_REPAIR', targetEntity: String(teamId), classification, previousStateSummary: `${countBasis}=${before}; required=5`, actionApplied: action, resultingStateSummary: `${countBasis}=${after}; required=5`, diagnostics: diagnostic === undefined ? [] : [diagnostic], worldChanged: changed, userActionRequired }
}
