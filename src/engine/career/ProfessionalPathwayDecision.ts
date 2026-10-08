import type { PlayerId, SeasonId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { calculateAge } from '@/domain/player'
import type { GameDate } from '@/domain/date'
import { getPlayerSeasonStats, calculatePlayerStatAverages } from '@/engine/stats/PlayerHistory'
import { assessCollegeContinuation } from '@/engine/eligibility/CollegeContinuationAssessment'
export type DraftOutlookBand = 'lottery' | 'firstRound' | 'secondRound' | 'borderline' | 'likelyUndrafted'

export type PlayerCareerDecision = 'stayCollege' | 'enterPortal' | 'testDraft' | 'withdrawDraft' | 'remainInDraft' | 'directProfessional'
export interface PlayerCareerAdvice { readonly decision: PlayerCareerDecision; readonly outlook: DraftOutlookBand; readonly reasons: readonly string[]; readonly alternatives: readonly PlayerCareerDecision[] }
export interface CareerPathwayDecisionContext { readonly stayPressure: number; readonly leavePressure: number; readonly role: number; readonly trust: number; readonly collegeSupport: number; readonly compensationImportance: number; readonly seasonsRemaining: number; readonly professionalImportance: number; readonly outlook: DraftOutlookBand; readonly age: number; readonly seriouslyConsideringPortal: boolean; readonly isDeclared: boolean; readonly canWithdraw: boolean }

/** Stable decision policy with inputs exposed for bounded, evidence-led career tests. */
export function chooseCareerPathwayFromContext(context: CareerPathwayDecisionContext): PlayerCareerDecision {
  const outlookValue = context.outlook === 'lottery' ? 3 : context.outlook === 'firstRound' ? 2 : context.outlook === 'secondRound' ? 1 : 0
  const stayScore = context.stayPressure + context.role * 2 + context.trust * 2 + context.collegeSupport + context.compensationImportance * 0.15 + Math.max(0, context.seasonsRemaining - 1) * 0.8
  const leaveScore = context.leavePressure + (1 - context.role) * 2 + (1 - context.trust) * 2 + context.professionalImportance * 0.25 + outlookValue + Math.max(0, context.age - 20) * 0.35
  if (context.isDeclared) return stayScore >= leaveScore && context.canWithdraw ? 'withdrawDraft' : 'remainInDraft'
  if (stayScore >= leaveScore) return 'stayCollege'
  if (context.seriouslyConsideringPortal && (1 - context.role) + (1 - context.trust) > 1.2) return 'enterPortal'
  return 'testDraft'
}

/** A broad player-facing outlook from public production, deliberately separate from team scouting boards. */
export function estimatePlayerDraftOutlook(world: GameWorld, playerId: PlayerId, seasonId: SeasonId = world.currentSeasonId, ageOnDate: GameDate = world.currentDate): { readonly band: DraftOutlookBand; readonly reasons: readonly string[] } {
  const player = world.players[playerId]
  if (!player) return { band: 'likelyUndrafted', reasons: ['Player record is unavailable.'] }
  const seasonStats = getPlayerSeasonStats(world, playerId, seasonId)
  const stats = calculatePlayerStatAverages(seasonStats)
  const production = stats.ppg + stats.rpg * 0.55 + stats.apg * 0.75 + stats.spg * 0.3 + stats.bpg * 0.25
  const age = calculateAge(player.bio.dateOfBirth, ageOnDate)
  const ageContext = age >= 21 ? 1.5 : age <= 19 ? 1 : 0
  const score = production + ageContext
  const band: DraftOutlookBand = score >= 24 ? 'lottery' : score >= 18 ? 'firstRound' : score >= 12 ? 'secondRound' : score >= 7 ? 'borderline' : 'likelyUndrafted'
  const reasons = seasonStats.gamesPlayed === 0
    ? ['There is little completed-season production to support a confident projection.']
    : [`Recorded production supports a broad ${band} outlook; it is an estimate, not a team promise.`, `Age ${age} and this season's public production inform the estimate.`]
  return { band, reasons }
}

/** Uses continuation context, recruiting preferences, role, trust, eligibility and compensation to explain a player choice. */
export function advisePlayerCareerPathway(world: GameWorld, playerId: PlayerId, teamId: TeamId, seasonId: SeasonId = world.currentSeasonId, ageOnDate: GameDate = world.currentDate): PlayerCareerAdvice {
  const player = world.players[playerId]
  if (!player) return { decision: 'directProfessional', outlook: 'likelyUndrafted', reasons: ['Player record is unavailable.'], alternatives: [] }
  const outlook = estimatePlayerDraftOutlook(world, playerId, seasonId, ageOnDate)
  const continuation = assessCollegeContinuation(world, playerId, teamId, seasonId)
  const recruitingProfile = Object.values(world.recruitProfilesById).filter((profile) => profile.playerId === playerId).sort((a, b) => b.id.localeCompare(a.id))[0]
  const preferences = recruitingProfile?.recruitingRpg?.preferenceProfile
  const professionalImportance = preferences?.importance.professionalPathway ?? 5
  const compensationImportance = preferences?.compensationSecurityImportance ?? 5
  const activeEnrollment = Object.values(world.playerEnrollmentsById).find((item) => item.playerId === playerId && item.status === 'active' && item.teamId === teamId)
  const ruleset = activeEnrollment === undefined ? undefined : Object.values(world.collegeRulesetsById).find((item) => item.ecosystemId === activeEnrollment.ecosystemId && item.effectiveFrom <= world.currentDate && (item.effectiveTo === undefined || item.effectiveTo >= world.currentDate))
  const eligibilityProfile = Object.values(world.eligibilityProfilesById).find((item) => item.playerId === playerId && item.ecosystemId === activeEnrollment?.ecosystemId)
  const seasonsRemaining = ruleset === undefined || eligibilityProfile === undefined ? 0 : Math.max(0, ruleset.maximumEligibilitySeasons - eligibilityProfile.seasonsUsed)
  const reasons: string[] = [...outlook.reasons]
  if (!continuation) return { decision: 'directProfessional', outlook: outlook.band, reasons: [...reasons, 'No active college continuation context is available; a professional pathway can be considered directly.'], alternatives: ['testDraft'] }
  const role = continuation.experience.gamesPlayed === 0 ? 0.5 : continuation.experience.gamesStarted / continuation.experience.gamesPlayed
  const trust = Math.max(0, Math.min(1, (continuation.relationshipTrust ?? 50) / 100))
  const collegeSupport = Math.min(3, continuation.compensationContext.athleticsAidMinorUnits / 1_000_000 + continuation.compensationContext.institutionalBenefitsMinorUnits / 2_000_000 + continuation.compensationContext.activeNilDeals * 0.5)
  const activeDraftEntry = Object.values(world.draftsById).flatMap((draft) => (draft.entries ?? []).map((entry) => ({ draft, entry }))).find(({ entry }) => entry.playerId === playerId && (entry.status === 'declaredEarlyEntry' || entry.status === 'finalPool'))
  const canWithdraw = activeDraftEntry === undefined || activeDraftEntry.draft.rules.finalWithdrawalDeadline === undefined || world.currentDate <= activeDraftEntry.draft.rules.finalWithdrawalDeadline
  const decision = chooseCareerPathwayFromContext({ stayPressure: continuation.stayPressure, leavePressure: continuation.leavePressure, role, trust, collegeSupport, compensationImportance, seasonsRemaining, professionalImportance, outlook: outlook.band, age: calculateAge(player.bio.dateOfBirth, ageOnDate), seriouslyConsideringPortal: continuation.tone === 'seriouslyConsideringPortal', isDeclared: activeDraftEntry !== undefined, canWithdraw })
  reasons.push(...(decision === 'stayCollege' || decision === 'withdrawDraft' ? continuation.stayReasons : continuation.leaveReasons))
  if (outlook.band === 'secondRound' || outlook.band === 'borderline') reasons.push('The professional outlook is uncertain, so role, trust, compensation and remaining college eligibility may outweigh testing the market now.')
  if (activeDraftEntry !== undefined) {
    const canReturnToCollege = activeDraftEntry.draft.rules.collegeWithdrawalDeadline === undefined || world.currentDate <= activeDraftEntry.draft.rules.collegeWithdrawalDeadline
    reasons.push(decision === 'withdrawDraft' ? canReturnToCollege ? 'The current college context favors returning, and both applicable Draft deadlines permit withdrawal.' : 'The college context favors returning, but the NCAA return deadline has passed; withdrawal will not restore eligibility.' : canWithdraw ? 'The current role, trust, compensation and professional outlook support remaining in the Draft.' : 'The NBA withdrawal deadline has passed, so the Player must remain in the Draft.')
    return { decision, outlook: outlook.band, reasons, alternatives: canWithdraw ? ['withdrawDraft', 'remainInDraft'] : ['remainInDraft'] }
  }
  const alternatives: PlayerCareerDecision[] = decision === 'stayCollege' ? ['enterPortal', 'testDraft'] : decision === 'enterPortal' ? ['stayCollege', 'testDraft'] : ['withdrawDraft', 'remainInDraft']
  return { decision, outlook: outlook.band, reasons: reasons.length > 0 ? reasons : ['The available role, trust, compensation and pathway evidence supports this option.'], alternatives }
}
