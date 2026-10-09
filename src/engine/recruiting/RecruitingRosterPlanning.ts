import { calculateAge } from '@/domain/player'
import { PLAYER_CAREER_AGE_LIMIT } from '@/engine/career/PlayerCareerLifecycle'
import { addYears } from '@/domain/date'
import { nbaDraftRulesForYear } from '@/domain/draft'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { RecruitProfile } from '@/domain/recruiting'
import type { GameWorld } from '@/domain/world'
import { advisePlayerCareerPathway } from '@/engine/career/ProfessionalPathwayDecision'
import { assessCollegeEligibility } from '@/engine/eligibility/EligibilityEngine'
import { getPlayerContractStatus } from '@/domain/contract'
import { assessNbaDraftEligibility } from '@/engine/draft/DraftEligibility'

/** Forecast the incoming class through its first Draft; never move or retain Players. */
export function getRecruitingPlanningRoster(world: GameWorld, teamId: TeamId, cycleId?: string): readonly PlayerId[] {
  const roster = world.teams[teamId]?.rosterPlayerIds ?? []
  const cycle = cycleId === undefined ? undefined : world.recruitingCyclesById[cycleId]
  const sourceSeason = cycle && world.seasons[cycle.sourceSeasonId]
  const ecosystem = cycle && world.ecosystems[cycle.ecosystemId]
  if (!sourceSeason || ecosystem?.kind !== 'ncaaLike') return roster
  const professional = Object.values(world.ecosystems).find(item => item.kind === 'nbaLike' && item.category === ecosystem.category && item.draftRules !== undefined)
  if (!professional) return roster
  const target = world.seasons[cycle!.targetSeasonId]
  const horizon = nbaDraftRulesForYear(Number((target?.endDate ?? addYears(sourceSeason.endDate, 1)).slice(0, 4)), professional.draftRules!.rounds)
  const season = Object.values(world.seasons).filter(item => item.competitionId === sourceSeason.competitionId && item.startDate <= world.currentDate).sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? sourceSeason
  return roster.filter(playerId => {
    if (world.players[playerId]?.careerEnd !== undefined || calculateAge(world.players[playerId]!.bio.dateOfBirth, target?.startDate ?? addYears(sourceSeason.startDate, 1)) > PLAYER_CAREER_AGE_LIMIT) return false
    if (Object.values(world.playerRightsById).some(right => right.playerId === playerId && right.status === 'active' && (right.expiresAt === undefined || right.expiresAt >= world.currentDate))) return false
    if (Object.values(world.contractsById).some(contract => contract.playerId === playerId && ['active', 'scheduled'].includes(getPlayerContractStatus(contract, world.currentDate)))) return false
    if (Object.values(world.recruitSigningsById).some(signing => signing.playerId === playerId && signing.programTeamId !== teamId && world.recruitProfilesById[signing.recruitId]?.status === 'incoming')) return false
    const currentEligibility = assessCollegeEligibility(world, { playerId, teamId, ecosystemId: ecosystem.id })
    const clockStart = currentEligibility?.evidence.eligibilityClockStart
    const clockPeriod = currentEligibility && world.collegeRulesetsById[currentEligibility.rulesetId]?.eligibilityClock?.periodYears
    if (clockStart && clockPeriod && (target?.startDate ?? addYears(sourceSeason.startDate, 1)) >= addYears(clockStart, clockPeriod)) return false
    const eligibility = assessCollegeEligibility(world, { playerId, teamId, ecosystemId: ecosystem.id, onDate: target?.startDate ?? addYears(sourceSeason.startDate, 1) })
    if (eligibility?.reasons.some(reason => reason === 'ELIGIBILITY_CLOCK_EXPIRED' || reason === 'PARTICIPATION_LIMIT_REACHED')) return false
    if (!assessNbaDraftEligibility(world, playerId, { scheduledOn: horizon.draftDate!, rules: horizon }).automatic) return true
    const decision = advisePlayerCareerPathway(world, playerId, teamId, season.id, horizon.draftDate!).decision
    return decision === 'stayCollege' || decision === 'withdrawDraft' || decision === 'enterPortal'
  })
}

/** Shared program context for prospect choice, visits and factual negotiation replies. */
export function getRecruitingRoleOpportunity(world: GameWorld, recruit: RecruitProfile, teamId: TeamId, planningRoster?: readonly PlayerId[]): number {
  const roster = planningRoster ?? getRecruitingPlanningRoster(world, teamId, recruit.origin === 'transfer' ? undefined : recruit.cycleId)
  const count = roster.filter(id => world.players[id]?.basketball.primaryPosition === recruit.position).length
  return Math.max(10, 90 - count * 22)
}
