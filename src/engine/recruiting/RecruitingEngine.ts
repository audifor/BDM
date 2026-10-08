import { getRecruitingPeriod, RECRUITING_PREFERENCE_DIMENSIONS, type RecruitingBoardEntry, type RecruitingCycle, type RecruitingEvaluationEvent, type RecruitingInterest, type RecruitingOffer, type RecruitProfile, type RecruitingPreferenceDimension, type RecruitingNegotiationTopic, type RecruitingProgramResponseKind, type RecruitingRpgState, type RecruitingStaffDesignation } from '@/domain/recruiting'
import type { GameDate } from '@/domain/date'
import { organizationIdForTeam, type PlayerId, type StaffPersonId, type TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { calculateStaffWorkload, updateGameWorld } from '@/domain/world'
import { createOrganizationPlayerAwareness } from '@/domain/scouting'
import { createTeam } from '@/domain/team'
import { createPlayer, type PlayerPathwayRecord, type PlayerPathwaySource } from '@/domain/player'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { addYears, createGameDate } from '@/domain/date'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { generateCanonicalDevelopmentProfile, generateCanonicalRatings } from '@/engine/world/CanonicalPlayerTruthGenerator'
import { deriveCollegeEligibilityClock, resolveCollegeRuleset, assessCollegeEligibility, canRecruitTransferPlayer, endPlayerEnrollment, enrollPlayer, initializeEligibility, recordCollegeEligibilityAssessment } from '@/engine/eligibility'
import { initializeAcademicProfile } from '@/engine/academic'
import { initializeNilProfile } from '@/engine/nil'
import { materializeTalentCandidates } from '@/engine/world/TalentSupply'
import { canPerformRecruitingAction } from './RecruitingPermission'
import { openAiRecruitingNegotiation, respondToRecruitingConcern } from './RecruitingNegotiationEngine'
import { recruitingStaffActionBlock, recruitingStaffActors, recordRecruitingStaffAction } from './RecruitingStaffAuthority'
import { isStaffActivityRestricted } from '@/engine/enforcement/EnforcementRemedies'
import { availableInstitutionBenefitsRoom } from '@/domain/collegeCompensation'
import { getRecruitingPlanningRoster, getRecruitingRoleOpportunity } from './RecruitingRosterPlanning'
export { getRecruitingPlanningRoster } from './RecruitingRosterPlanning'
export type RecruitingResult<T>={ok:true;value:T}|{ok:false;reason:string}
export function setBoard(entries:readonly RecruitingBoardEntry[],entry:RecruitingBoardEntry){return[...entries.filter(x=>x.programTeamId!==entry.programTeamId||x.recruitId!==entry.recruitId),entry]}

/** Adds an already rostered, authorized Portal Player to an existing BS15E recruiting cycle. */
export function addTransferRecruitToCycle(world: GameWorld, cycleId: string, portalEntryId: string): RecruitingResult<GameWorld> {
  const entry = world.transferPortalEntriesById[portalEntryId]
  const cycle = world.recruitingCyclesById[cycleId]
  if (!entry || entry.status !== 'authorized' || !cycle || cycle.status !== 'open' || cycle.ecosystemId !== entry.ecosystemId) return { ok: false, reason: 'TRANSFER_PORTAL_AUTHORIZATION_REQUIRED' }
  const cycleSeason = world.seasons[cycle.sourceSeasonId]
  const cycleCompetition = cycleSeason === undefined ? undefined : world.competitions[cycleSeason.competitionId]
  const programTeamIds = cycleCompetition?.participantTeamIds.filter((teamId) => teamId !== entry.sourceTeamId) ?? []
  if (!programTeamIds.some((teamId) => canRecruitTransferPlayer(world, entry.playerId, teamId))) return { ok: false, reason: 'TRANSFER_DESTINATION_UNAVAILABLE' }
  const existing = Object.values(world.recruitProfilesById).find((profile) => profile.transferPortalEntryId === entry.id)
  if (existing !== undefined) return existing.cycleId === cycleId ? { ok: true, value: world } : { ok: false, reason: 'TRANSFER_ALREADY_IN_RECRUITING' }
  if (Object.values(world.recruitProfilesById).some((profile) => profile.playerId === entry.playerId && profile.status !== 'arrived' && profile.status !== 'unsigned' && profile.status !== 'ineligible')) return { ok: false, reason: 'PLAYER_ALREADY_IN_RECRUITING' }
  const player = world.players[entry.playerId]
  if (!player || !world.teams[entry.sourceTeamId]?.rosterPlayerIds.includes(entry.playerId)) return { ok: false, reason: 'TRANSFER_SOURCE_ROSTER_MISMATCH' }
  const priorProfile = Object.values(world.recruitProfilesById).filter((profile) => profile.playerId === player.id).sort((a, b) => b.id.localeCompare(a.id))[0]
  const random = new SeededRandomSource(hashStringToSeed(`transfer-recruiting:${entry.id}`))
  const recruitingRpg = priorProfile?.recruitingRpg ?? createRecruitingRpg(random, programTeamIds)
  const cycleProfiles = Object.values(world.recruitProfilesById).filter((profile) => profile.cycleId === cycleId && profile.status === 'open')
  const positionRank = cycleProfiles.filter((profile) => profile.position === player.basketball.primaryPosition).length + 1
  const recruit: RecruitProfile = {
    id: `transfer-recruit:${entry.id}`, playerId: player.id, cycleId, origin: 'transfer', transferPortalEntryId: entry.id,
    position: player.basketball.primaryPosition, publicRank: cycleProfiles.length + 1, positionRank, tier: 'rotation',
    preferences: { opportunity: random.nextInt(1, 10), development: random.nextInt(1, 10), competing: random.nextInt(1, 10), coach: random.nextInt(1, 10) },
    recruitingRpg, status: 'open',
  }
  return { ok: true, value: updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById), recruit] }) }
}
export function act(cycle:RecruitingCycle,recruit:RecruitProfile|undefined,interests:readonly RecruitingInterest[],program:TeamId,kind:'contact'|'pitch'|'visit',capacity:number):RecruitingResult<{interests:readonly RecruitingInterest[];capacity:number}>{if(cycle.status!=='open')return{ok:false,reason:'RECRUITING_NOT_OPEN'};if(!recruit||recruit.cycleId!==cycle.id)return{ok:false,reason:'INVALID_RECRUIT'};const cost=cycle.rules.costs[kind];if(capacity<cost)return{ok:false,reason:'INSUFFICIENT_RECRUITING_CAPACITY'};const before=interests.find(x=>x.recruitId===recruit.id&&x.programTeamId===program)?.value??0;const gain=kind==='contact'?5:kind==='pitch'?3:0;return{ok:true,value:{capacity:capacity-cost,interests:[...interests.filter(x=>x.recruitId!==recruit.id||x.programTeamId!==program),{recruitId:recruit.id,programTeamId:program,value:Math.max(0,Math.min(100,before+gain))}]}}}

function createRecruitingRpg(random: SeededRandomSource, programTeamIds: readonly TeamId[]): RecruitingRpgState {
  const importance = Object.fromEntries(RECRUITING_PREFERENCE_DIMENSIONS.map((dimension) => [dimension, random.nextInt(1, 10)])) as Record<RecruitingPreferenceDimension, number>
  const top = [...RECRUITING_PREFERENCE_DIMENSIONS].sort((a, b) => importance[b] - importance[a]).slice(0, 4)
  const dealbreakers = random.nextInt(0, 2) === 0 ? [] : [top[0]!]
  const stakeholder = random.nextInt(0, 4) === 0 ? undefined : { id: `stakeholder:${random.nextInt(1, 3)}`, role: random.nextInt(0, 2) === 0 ? 'parent' as const : 'schoolCoach' as const, influence: random.nextInt(45, 85), preference: top[1]!, attitudeByProgram: Object.fromEntries(programTeamIds.map((id) => [id, random.nextInt(-35, 35)])) }
  return { preferenceProfile: { importance, compensationSecurityImportance: random.nextInt(1, 10), dealbreakers, decisionStyle: (['early','deliberate','visitDriven','deadlineDriven','volatile','loyal'] as const)[random.nextInt(0, 5)]!, ...(random.nextInt(0, 2) === 0 ? { internationalNeeds: ['language','relocation'] as const } : {}) }, intel: [], relationships: [], stakeholders: stakeholder === undefined ? [] : [stakeholder], promises: [], story: [] }
}

function staffForRecruiting(world: GameWorld, teamId: TeamId): { headCoachId?: string; recruiterId?: string } {
  const actors = recruitingStaffActors(world, teamId)
  return { headCoachId: actors.headCoachId, recruiterId: actors.recruiterId }
}

function transferPermissionContext(world: GameWorld, profile: RecruitProfile | undefined, programTeamId: TeamId) {
  return profile?.origin === 'transfer'
    ? { recruitingContext: 'TRANSFER' as const, transferAuthorized: canRecruitTransferPlayer(world, profile.playerId, programTeamId) }
    : { recruitingContext: 'INITIAL' as const }
}

/** Explainable, deterministic choice projection. It reads preference truth only at the Player decision boundary. */
export function evaluateRecruitingChoice(world: GameWorld, recruit: RecruitProfile, teamId: TeamId, roleOpportunity?: number): { readonly value: number; readonly reasons: readonly string[] } {
  const rpg = recruit.recruitingRpg
  if (!rpg) return { value: 0, reasons: ['The prospect has not shared enough to make a reliable decision.'] }
  const preference = rpg.preferenceProfile.importance
  const currentRecruiter = staffForRecruiting(world, teamId).recruiterId
  const relationship = rpg.relationships.filter((item) => item.programTeamId === teamId && (item.actor !== 'recruiter' || item.actorId === currentRecruiter))
  const coachTrust = relationship.filter((item) => item.actor !== 'program').reduce((sum, item) => sum + item.trust, 0) / Math.max(1, relationship.filter((item) => item.actor !== 'program').length)
  const role = roleOpportunity ?? getRecruitingRoleOpportunity(world, recruit, teamId)
  const played = Object.values(world.games).filter((game) => game.status === 'completed' && (game.homeTeamId === teamId || game.awayTeamId === teamId))
  const wins = played.filter((game) => game.result !== null && (game.homeTeamId === teamId ? game.result.homeScore > game.result.awayScore : game.result.awayScore > game.result.homeScore)).length
  const winning = played.length === 0 ? 50 : Math.round(wins / played.length * 100)
  const promises = rpg.promises.filter((item) => item.programTeamId === teamId)
  const roleAssurance = Math.min(20, promises.filter((item) => item.topic === 'role' || item.topic === 'playingOpportunity').reduce((sum, item) => sum + ({ statement: 3, expectation: 7, assurance: 12, explicit: 16 }[item.strength]), 0))
  const conflictingAssurances = Object.values(world.recruitProfilesById).filter((other) => other.id !== recruit.id && other.position === recruit.position).flatMap((other) => other.recruitingRpg?.promises ?? []).filter((item) => item.programTeamId === teamId && item.topic === 'role' && ['assurance','explicit'].includes(item.strength)).length
  const stakeholder = rpg.stakeholders.reduce((sum, item) => sum + item.influence * (item.attitudeByProgram[String(teamId)] ?? 0) / 100, 0)
  const negotiations = (rpg.negotiations ?? []).filter((item) => item.programTeamId === teamId && item.terminalState === 'active')
  const negotiationEffect = negotiations.reduce((sum, item) => sum - item.unresolvedTopics.length * 4 + item.resolvedTopics.length * 2 + (rpg.preferenceProfile.decisionStyle === 'early' || rpg.preferenceProfile.decisionStyle === 'deadlineDriven' ? item.pressure * 0.08 : -item.pressure * 0.12), 0)
  const recentNegativeEffect = (rpg.negativeEvents ?? []).filter((item) => item.programTeamId === teamId && Date.parse(`${world.currentDate}T00:00:00Z`) - Date.parse(`${item.date}T00:00:00Z`) <= 14 * 86_400_000).reduce((sum, item) => sum + item.shortTermEffect, 0)
  const components = [
    { dimension: 'playingTime' as const, value: role },
    { dimension: 'roleClarity' as const, value: Math.min(100, role + roleAssurance) },
    { dimension: 'coachTrust' as const, value: coachTrust },
    { dimension: 'familyTrust' as const, value: 50 + stakeholder },
    { dimension: 'development' as const, value: Math.min(100, 35 + Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === teamId).reduce((sum, item) => sum + (world.staffPeopleById[item.staffPersonId]?.professional.attributes.playerDevelopment ?? 50), 0) / Math.max(1, Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === teamId).length) / 2) },
    { dimension: 'winning' as const, value: winning }, { dimension: 'prestige' as const, value: Math.round(35 + winning * 0.3) },
    { dimension: 'distance' as const, value: 50 }, { dimension: 'academics' as const, value: 50 },
    { dimension: 'professionalPathway' as const, value: 50 }, { dimension: 'internationalSupport' as const, value: 50 },
  ]
  const institutionId = world.teams[teamId]?.organizationId
  const benefits = Object.values(world.settlementBenefitsAgreementsById).filter((item) => item.playerId === recruit.playerId && item.teamId === teamId && item.institutionId === institutionId && item.status !== 'cancelled').sort((a, b) => b.valueMinorUnits - a.valueMinorUnits)[0]
  const cap = benefits === undefined ? undefined : world.institutionBenefitsCapsById[`cap:${institutionId}:${benefits.capYear}`] ?? Object.values(world.institutionBenefitsCapsById).find((item) => item.institutionId === institutionId && item.capYear === benefits.capYear)
  const legalBenefits = benefits !== undefined && cap !== undefined && (benefits.status === 'signed' || benefits.valueMinorUnits <= availableInstitutionBenefitsRoom(cap, Object.values(world.settlementBenefitsAgreementsById))) ? benefits.valueMinorUnits : 0
  const aid = Object.values(world.athleticsAidAgreementsById).filter((item) => item.playerId === recruit.playerId && item.teamId === teamId && (item.status === 'offered' || item.status === 'signed')).sort((a, b) => b.valueMinorUnits - a.valueMinorUnits)[0]?.valueMinorUnits ?? 0
  const compensationImportance = legalBenefits + aid > 0 ? rpg.preferenceProfile.compensationSecurityImportance ?? 0 : 0
  const compensationValue = Math.min(100, Math.round((legalBenefits + aid) / 500_000 * 100))
  const weight = RECRUITING_PREFERENCE_DIMENSIONS.reduce((sum, dimension) => sum + preference[dimension], 0) + compensationImportance
  const value = (components.reduce((sum, item) => sum + preference[item.dimension] * item.value, 0) + compensationImportance * compensationValue) / Math.max(1, weight)
  const facts = Object.fromEntries(components.map((item) => [item.dimension, item.value])) as Record<RecruitingPreferenceDimension, number>
  const dealbreakerPenalty = rpg.preferenceProfile.dealbreakers.filter((dimension) => facts[dimension] < 30).length * 40
  const reasons = components.filter((item) => preference[item.dimension] >= 7).sort((a, b) => b.value - a.value).slice(0, 2).map((item) => `${item.dimension}: ${Math.round(item.value)}`)
  if (compensationImportance >= 7 && (legalBenefits > 0 || aid > 0)) reasons.push(`legal compensation security: ${compensationValue}`)
  return { value: Math.round(value - Math.min(18, conflictingAssurances * 9) - dealbreakerPenalty + negotiationEffect + recentNegativeEffect), reasons }
}
export function offer(cycle:RecruitingCycle,recruit:RecruitProfile|undefined,offers:readonly RecruitingOffer[],program:TeamId,date:GameDate):RecruitingResult<RecruitingOffer>{if(cycle.status!=='open')return{ok:false,reason:'RECRUITING_NOT_OPEN'};if(!recruit)return{ok:false,reason:'INVALID_RECRUIT'};if(!['open','committed'].includes(recruit.status))return{ok:false,reason:'RECRUIT_ALREADY_COMMITTED'};if(offers.some(x=>x.recruitId===recruit.id&&x.programTeamId===program&&x.status==='active'))return{ok:false,reason:'DUPLICATE_OFFER'};if(offers.filter(x=>x.cycleId===cycle.id&&x.programTeamId===program&&x.status==='active').length>=cycle.rules.maxOffers)return{ok:false,reason:'OFFER_LIMIT_REACHED'};const priorAttempts=offers.filter(x=>x.cycleId===cycle.id&&x.recruitId===recruit.id&&x.programTeamId===program).length;const baseId=`offer:${cycle.id}:${recruit.id}:${program}`;return{ok:true,value:{id:priorAttempts===0?baseId:`${baseId}:attempt:${priorAttempts+1}`,cycleId:cycle.id,recruitId:recruit.id,programTeamId:program,status:'active',madeOn:date}}}

/** Canonical world operations. The UI and AI share these boundaries. */
export function addRecruitingBoardEntry(world: GameWorld, entry: RecruitingBoardEntry): GameWorld {
  return updateGameWorld(world, { recruitingBoards: setBoard(world.recruitingBoards, entry) })
}

export function removeRecruitingBoardEntry(world: GameWorld, programTeamId: TeamId, recruitId: string): GameWorld {
  return updateGameWorld(world, { recruitingBoards: world.recruitingBoards.filter((entry) => entry.programTeamId !== programTeamId || entry.recruitId !== recruitId) })
}

export function designateOffCampusRecruiter(world: GameWorld, cycleId: string, programTeamId: TeamId, staffId: StaffPersonId, reason = 'Assigned by the program'): RecruitingResult<GameWorld> {
  const cycle = world.recruitingCyclesById[cycleId]
  if (!cycle || world.ecosystems[cycle.ecosystemId]?.kind !== 'ncaaLike') return { ok: false, reason: 'RECRUITING_CYCLE_NOT_NCAA' }
  const seasonYear = Number(cycle.calendar?.derivedSeason?.slice(0, 4) ?? cycle.opensOn.slice(0, 4))
  if (!Number.isInteger(seasonYear)) return { ok: false, reason: 'RECRUITING_SEASON_MISSING' }
  const designationYearStart = createGameDate(seasonYear, 8, 1)
  const designationYearEnd = createGameDate(seasonYear + 1, 7, 31)
  if (world.currentDate < designationYearStart || world.currentDate > designationYearEnd) return { ok: false, reason: 'RECRUITING_DESIGNATION_YEAR_INACTIVE' }
  if (!world.staffPeopleById[staffId] || !Object.values(world.teamStaffAssignmentsById).some((assignment) => assignment.teamId === programTeamId && assignment.staffPersonId === staffId)) return { ok: false, reason: 'RECRUITING_STAFF_REQUIRED' }
  const designations = [...(cycle.staffDesignations ?? [])]
  const active = designations.filter((item) => item.programTeamId === programTeamId && item.active && world.currentDate >= item.effectiveFrom && world.currentDate <= item.effectiveTo)
  if (active.some((item) => item.staffId === staffId)) return { ok: true, value: world }
  const maximum = cycle.calendar?.maximumDesignatedOffCampusRecruiters
  if (maximum === undefined) return { ok: false, reason: 'OFF_CAMPUS_RECRUITER_LIMITS_MISSING' }
  const departed = active.filter((item) => !Object.values(world.teamStaffAssignmentsById).some((assignment) => assignment.teamId === programTeamId && assignment.staffPersonId === item.staffId))
  if (active.length - departed.length >= maximum) return { ok: false, reason: 'OFF_CAMPUS_RECRUITER_DESIGNATION_LIMIT' }
  for (const item of departed) {
    const index = designations.findIndex((designation) => designation.id === item.id)
    if (index >= 0) designations[index] = { ...item, active: false, effectiveTo: world.currentDate }
  }
  const designation: RecruitingStaffDesignation = { id: `recruiter-designation:${cycle.id}:${programTeamId}:${staffId}`, programTeamId, staffId, recruitingCycleId: cycle.id, context: 'offCampusRecruiter', effectiveFrom: world.currentDate < designationYearStart ? designationYearStart : world.currentDate, effectiveTo: designationYearEnd, active: true, source: departed.length === 0 ? 'programAssignment' : 'staffAttritionReplacement', reason }
  return { ok: true, value: updateGameWorld(world, { recruitingCycles: Object.values(world.recruitingCyclesById).map((item) => item.id === cycleId ? { ...item, staffDesignations: [...designations, designation] } : item) }) }
}

function activeRecruitingDesignations(cycle: RecruitingCycle, programTeamId: TeamId, date: GameDate): readonly RecruitingStaffDesignation[] {
  return (cycle.staffDesignations ?? []).filter((item) => item.programTeamId === programTeamId && item.active && date >= item.effectiveFrom && date <= item.effectiveTo)
}

/**
 * BS15E NCAA action audit (actor required | designation | off-campus | person-day | four/day | incompatible | HC-specific | AI gateway):
 * - contact/pitch, remote: recruiter | no | no | no | no | no | no | yes (same operation).
 * - contact, off-campus: recruiter | yes | yes | yes | yes | conflicts with same Staff evaluation | no | permission gateway shared; AI cadence currently stays remote.
 * - evaluation: assigned evaluator | off-campus only | caller-selected | off-campus only | off-campus only | conflicts with same Staff contact | no | no AI evaluator entry point exists.
 * - official/unofficial visit: assigned Head Coach and participants | no | no | no | no | Staff V2 workload applies | yes | AI uses the same visit operation (unofficial only).
 * - offer/promise/negotiation: assigned recruiter | no | no | no | no | Staff V2 + daily action ledger | no | AI offers/negotiations use the same gateways.
 * - gray/negative pitch: assigned recruiter | no for its modeled remote action | no | no | no | Staff V2 + daily action ledger | no | no AI gray action is currently scheduled.
 * There is no separate Head Coach negotiation-intervention operation. This table describes the
 * existing entry points; it makes missing AI/evaluator variants explicit instead of implying parity.
 */
export function performRecruitingAction(world: GameWorld, cycleId: string, recruitId: string, programTeamId: TeamId, kind: 'contact'|'pitch'|'visit', visitDetails?: { readonly type: 'official'|'unofficial'; readonly startsOn: GameDate; readonly endsOn: GameDate; readonly lodgingNights: number; readonly participants?: readonly string[]; readonly offCampus?: boolean; readonly offCampusSite?: 'educationalInstitution'|'residence'|'other'; readonly staffPersonId?: StaffPersonId }): RecruitingResult<GameWorld> {
  const cycle = world.recruitingCyclesById[cycleId]
  if (!cycle) return { ok: false, reason: 'INVALID_RECRUIT' }
  const recruit = world.recruitProfilesById[recruitId]
  const rivalSigning = Object.values(world.recruitSigningsById).find((signing) => signing.recruitId === recruitId && signing.programTeamId !== programTeamId)
  const signedWithOtherProgram = rivalSigning !== undefined
  const releasedFromContactProhibition = rivalSigning !== undefined && recruit?.contactReleasedFromProgramId === rivalSigning.programTeamId
  const signingDay = Object.values(world.recruitSigningsById).some((signing) => signing.recruitId === recruitId && signing.signedOn === world.currentDate)
  const hasVisitToday = Object.values(world.recruitingVisitsById).some((visit) => visit.cycleId === cycleId && visit.recruitId === recruitId && visit.programTeamId === programTeamId && visit.date === world.currentDate)
  const countsAsOpportunity = kind === 'contact' && !hasVisitToday
  const category = world.ecosystems[cycle.ecosystemId]?.category ?? 'men'
  const isNCAA = world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike'
  const owners = staffForRecruiting(world, programTeamId)
  const actor = kind === 'visit' ? 'headCoach' as const : 'recruiter' as const
  const actorId = actor === 'headCoach' ? owners.headCoachId : owners.recruiterId
  const coachStaffId = actor === 'headCoach' && actorId !== undefined ? world.coaches[actorId as keyof typeof world.coaches]?.staffProfileId : undefined
  const staffId = visitDetails?.staffPersonId ?? (actor === 'headCoach' ? coachStaffId : owners.recruiterId)
  const involvedStaffIds = [...new Set(kind === 'visit' ? [...(visitDetails?.participants ?? []), ...(staffId === undefined ? [] : [staffId])] : staffId === undefined ? [] : [staffId])]
  // Action matrix: contact/pitch use the assigned recruiter; visits use the Head Coach;
  // off-campus contact consumes designation/person-day and counts toward the daily recruiter
  // limit; remote pitch/contact do not. Visits are campus activities and do not consume a
  // person-day. Each is checked against Staff V2 capacity and the common permission gateway.
  // AI calls this same operation. Evaluation and gray actions have their own entries below.
  if (isNCAA && (staffId === undefined || involvedStaffIds.some((personId) => !Object.values(world.teamStaffAssignmentsById).some((assignment) => assignment.teamId === programTeamId && assignment.staffPersonId === personId)))) return { ok: false, reason: 'RECRUITING_STAFF_REQUIRED' }
  if (isNCAA && involvedStaffIds.some((personId) => isStaffActivityRestricted(world, personId as StaffPersonId, 'RECRUITING'))) return { ok: false, reason: 'STAFF_ACTIVITY_SUSPENDED' }
  if (isNCAA && involvedStaffIds.some((personId) => { const workload = calculateStaffWorkload(world, personId as StaffPersonId); return workload.overloaded || workload.totalCapacityUsed + 1 > workload.capacityLimit })) return { ok: false, reason: 'STAFF_WORKLOAD_CAPACITY_EXHAUSTED' }
  const offCampus = kind !== 'visit' && visitDetails?.offCampus === true
  if (isNCAA && offCampus && staffId !== undefined && Object.values(world.recruitingActionHistoryById).some((item) => item.staffPersonId === staffId && item.date === world.currentDate && item.offCampus && item.kind !== kind && item.kind !== 'negativeRecruiting')) return { ok: false, reason: 'STAFF_HIGH_TOUCH_ACTIVITY_CONFLICT' }
  const designations = activeRecruitingDesignations(cycle, programTeamId, world.currentDate)
  const activeDesignation = staffId === undefined ? undefined : designations.find((item) => item.staffId === staffId)
  if (offCampus && isNCAA && activeDesignation === undefined) return { ok: false, reason: 'STAFF_NOT_DESIGNATED_OFF_CAMPUS_RECRUITER' }
  const staffDailyCapacityUsed = involvedStaffIds.reduce((maximum, personId) => Math.max(maximum, Object.values(world.recruitingActionHistoryById).filter((item) => (item.staffPersonId === personId || item.staffPersonIds?.includes(personId)) && item.date === world.currentDate).reduce((sum, item) => sum + item.cost, 0)), 0)
  const currentOpportunityYear = recruitingOpportunityYear(world.currentDate, category)
  const countableOpportunitiesUsed = Object.values(world.recruitingActionHistoryById).filter((item) => item.cycleId === cycleId && item.recruitId === recruitId && item.countsAsOpportunity && recruitingOpportunityYear(item.date, category) === currentOpportunityYear).length
  const visitType = visitDetails?.type ?? 'unofficial'
  const priorOffCampusToday = Object.values(world.recruitingActionHistoryById).filter((item) => item.programTeamId === programTeamId && item.offCampus && item.date === world.currentDate && item.staffPersonId !== undefined && item.staffPersonId !== staffId)
  const simultaneousRecruiters = new Set(priorOffCampusToday.map((item) => item.staffPersonId)).size
  const personDayYear = recruitingPersonDayYear(world.currentDate, category)
  const personDaysUsed = new Set(Object.values(world.recruitingActionHistoryById).filter((item) => item.programTeamId === programTeamId && item.offCampus && item.staffPersonId !== undefined && recruitingPersonDayYear(item.date, category) === personDayYear && isCountableRecruitingPersonDay(cycle, item.date, recruit?.prospectGroup)).map((item) => `${item.staffPersonId}:${item.date}`)).size
  const personDayException = cycle.calendar === undefined ? undefined : getRecruitingPeriod(cycle.calendar, world.currentDate, recruit?.prospectGroup)?.personDayException
  const permission = canPerformRecruitingAction({ date: world.currentDate, isNCAA, calendar: cycle.calendar, category: world.ecosystems[cycle.ecosystemId]?.category, education: recruit?.education, prospectGroup: recruit?.prospectGroup, ...transferPermissionContext(world, recruit, programTeamId), action: kind === 'visit' ? visitType === 'official' ? 'officialVisit' : 'unofficialVisit' : kind === 'contact' ? 'inPersonContact' : 'correspondence', location: offCampus ? 'offCampus' : 'onCampus', offCampusSite: visitDetails?.offCampusSite, signedWithOtherProgram, releasedFromContactProhibition, signingDay, countsAsOpportunity, countableOpportunitiesUsed, personDayRequired: offCampus, personDayException, personDaysUsed, designatedOffCampusRecruiter: offCampus ? activeDesignation !== undefined : undefined, designatedOffCampusRecruitersUsed: designations.length, simultaneousOffCampusRecruiters: simultaneousRecruiters, maximumDesignatedOffCampusRecruiters: cycle.calendar?.maximumDesignatedOffCampusRecruiters, maximumSimultaneousOffCampusRecruiters: cycle.calendar?.maximumSimultaneousOffCampusRecruiters, staffDailyCapacity: cycle.rules.staffDailyCapacity ?? 6, staffDailyCapacityUsed, staffActionCost: cycle.rules.costs[kind] })
  if (!permission.allowed) return { ok: false, reason: permission.reasonCode }
  if (kind === 'visit' && isNCAA && visitDetails?.type === 'official') {
    const maximumNights = cycle.calendar?.maximumOfficialVisitLodgingNights
    if (maximumNights === undefined) return { ok: false, reason: 'OFFICIAL_VISIT_RULESET_MISSING' }
    if (visitDetails.endsOn < visitDetails.startsOn || visitDetails.startsOn !== world.currentDate) return { ok: false, reason: 'OFFICIAL_VISIT_DATES_INVALID' }
    if (!Number.isInteger(visitDetails.lodgingNights) || visitDetails.lodgingNights < 0 || visitDetails.lodgingNights > maximumNights) return { ok: false, reason: 'OFFICIAL_VISIT_LODGING_LIMIT' }
    const priorOfficialVisits = Object.values(world.recruitingVisitsById).filter((visit) => visit.type === 'official' && visit.recruitId === recruitId && visit.programTeamId === programTeamId)
    const graduationYear = recruit?.education?.highSchoolGraduationYear
    if (graduationYear === undefined) return { ok: false, reason: 'PROSPECT_EDUCATION_REQUIRED' }
    const cutoff = createGameDate(graduationYear, 10, 15)
    const beforeCutoff = priorOfficialVisits.filter((visit) => visit.date < cutoff).length
    const afterCutoff = priorOfficialVisits.filter((visit) => visit.date >= cutoff).length
    if (world.currentDate < cutoff ? beforeCutoff >= 1 : afterCutoff >= 1) return { ok: false, reason: 'OFFICIAL_VISIT_COUNT_LIMIT' }
  }
  const capacity = world.recruitingCapacityByProgramId[programTeamId] ?? cycle?.rules.periodCapacity ?? 0
  const result = act(cycle, recruit, world.recruitingInterests, programTeamId, kind, capacity)
  if (!result.ok) return result
  const profile = recruit!
  const rpg = profile.recruitingRpg ?? createRecruitingRpg(new SeededRandomSource(hashStringToSeed(`recruiting-rpg-legacy:${profile.id}`)), Object.keys(world.teams) as TeamId[])
  const fatigue = Object.values(world.recruitingActionHistoryById).filter((item) => item.recruitId === recruitId && item.programTeamId === programTeamId && item.date === world.currentDate).length
  const staff = staffId === undefined ? undefined : world.staffPeopleById[staffId as keyof typeof world.staffPeopleById]
  const communication = staff?.professional.attributes.communication ?? 50
  const response = Math.max(1, Math.round(3 + communication / 24 - fatigue * 5))
  const relationships = [...rpg.relationships]
  const relationshipIndex = relationships.findIndex((item) => item.programTeamId === programTeamId && item.actor === actor && item.actorId === actorId)
  const prior = relationshipIndex < 0 ? { programTeamId, actor, ...(actorId === undefined ? {} : { actorId }), familiarity: 0, rapport: 0, trust: 50, credibility: 50, updatedOn: world.currentDate } : relationships[relationshipIndex]!
  const relationship = { ...prior, familiarity: Math.min(100, prior.familiarity + response + (kind === 'visit' ? 8 : 0)), rapport: Math.max(0, Math.min(100, prior.rapport + response + (kind === 'visit' ? 6 : 0))), trust: Math.max(0, Math.min(100, prior.trust + (communication >= 65 ? 2 : -1) - fatigue * 3)), credibility: Math.max(0, Math.min(100, prior.credibility + (communication >= 60 ? 1 : 0))), updatedOn: world.currentDate }
  if (relationshipIndex < 0) relationships.push(relationship); else relationships[relationshipIndex] = relationship
  const beliefs = { ...(rpg.intel.find((item) => item.programTeamId === programTeamId)?.beliefs ?? {}) }
  const favored = [...RECRUITING_PREFERENCE_DIMENSIONS].sort((a, b) => rpg.preferenceProfile.importance[b] - rpg.preferenceProfile.importance[a])[0]!
  const learned = kind === 'contact' ? ['playingTime','familyTrust'][fatigue % 2] as RecruitingPreferenceDimension : favored
  beliefs[learned] = fatigue > 0 ? 'moderate' : 'high'
  const intelRecord = { programTeamId, beliefs, confidence: Math.min(100, (rpg.intel.find((item) => item.programTeamId === programTeamId)?.confidence ?? 0) + 15), discoveredOn: world.currentDate, sources: [...new Set([...(rpg.intel.find((item) => item.programTeamId === programTeamId)?.sources ?? []), kind === 'visit' ? 'campus visit' : kind === 'pitch' ? 'conversation' : 'direct contact'])] }
  const intel = [...rpg.intel.filter((item) => item.programTeamId !== programTeamId), intelRecord]
  let visitEffect = 0
  if (kind === 'visit') {
    const roleWeight = rpg.preferenceProfile.importance.playingTime + rpg.preferenceProfile.importance.roleClarity
    const roleFit = getRecruitingRoleOpportunity(world, profile, programTeamId)
    visitEffect = Math.round((roleFit - 50) * roleWeight / 20 + (relationship.trust - 50) / 8)
  }
  const currentInterest = result.value.interests.find((item) => item.recruitId === recruitId && item.programTeamId === programTeamId)?.value ?? 0
  const updatedInterests = kind === 'visit' ? result.value.interests.map((item) => item.recruitId === recruitId && item.programTeamId === programTeamId ? { ...item, value: Math.max(0, Math.min(100, currentInterest + visitEffect)) } : item) : result.value.interests
  const story = [...rpg.story, `${world.currentDate}: ${kind} with ${actor} ${actorId ?? 'staff'}; ${fatigue ? 'frequent contact reduced the response' : visitEffect < 0 ? 'the visit exposed a role concern' : visitEffect > 0 ? 'the visit reinforced role fit' : 'the conversation added familiarity'}.`].slice(-24)
  const updatedProfile = { ...profile, recruitingRpg: { ...rpg, relationships, intel, story } }
  const actionId = `recruiting-action:${cycleId}:${programTeamId}:${recruitId}:${kind}:${world.currentDate}:${Object.keys(world.recruitingActionHistoryById).length}`
  const history = { id: actionId, cycleId, recruitId, programTeamId, kind, date: world.currentDate, cost: cycle.rules.costs[kind], effect: kind === 'visit' ? visitEffect : relationship.rapport, countsAsOpportunity, ...(staffId === undefined ? {} : { staffPersonId: staffId }), ...(involvedStaffIds.length === 0 ? {} : { staffPersonIds: involvedStaffIds }), offCampus }
  const visits = kind === 'visit' ? [...Object.values(world.recruitingVisitsById), { id: `visit:${cycleId}:${programTeamId}:${recruitId}:${world.currentDate}:${Object.keys(world.recruitingVisitsById).length}`, cycleId, recruitId, programTeamId, date: world.currentDate, cost: cycle.rules.costs.visit, outcome: visitEffect, type: visitType, startsOn: visitDetails?.startsOn ?? world.currentDate, endsOn: visitDetails?.endsOn ?? world.currentDate, lodgingNights: visitDetails?.lodgingNights ?? 0, participants: visitDetails?.participants ?? (staffId === undefined ? [] : [staffId]), sourceActionId: actionId, legalStatus: 'allowed' as const }] : Object.values(world.recruitingVisitsById)
  return { ok: true, value: updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById).filter((item) => item.id !== recruitId), updatedProfile], recruitingInterests: updatedInterests, recruitingCapacityByProgramId: { ...world.recruitingCapacityByProgramId, [programTeamId]: result.value.capacity }, recruitingActionHistory: [...Object.values(world.recruitingActionHistoryById), history], recruitingVisits: visits }) }
}

/** Records a live evaluation in the same persisted ledger as countable contacts. */
export function recordRecruitingEvaluation(world: GameWorld, input: { cycleId: string; recruitId: string; programTeamId: TeamId; eventType: RecruitingEvaluationEvent; eventApproved: boolean; offCampus?: boolean; staffPersonId?: string; time?: string; prospectCompetingToday?: boolean; signingRelatedActivity?: boolean }): RecruitingResult<GameWorld> {
  const cycle = world.recruitingCyclesById[input.cycleId]
  const recruit = world.recruitProfilesById[input.recruitId]
  if (!cycle || !recruit || recruit.cycleId !== cycle.id || recruit.status !== 'open') return { ok: false, reason: 'INVALID_RECRUIT' }
  const category = world.ecosystems[cycle.ecosystemId]?.category ?? 'men'
  const isNCAA = world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike'
  const offCampus = input.offCampus === true
  const signingDay = Object.values(world.recruitSigningsById).some((signing) => signing.recruitId === recruit.id && signing.signedOn === world.currentDate)
  const assignedStaffIds = Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === input.programTeamId).map((item) => item.staffPersonId as string)
  const evaluatorId = input.staffPersonId ?? staffForRecruiting(world, input.programTeamId).recruiterId
  if (evaluatorId === undefined || world.staffPeopleById[evaluatorId as keyof typeof world.staffPeopleById] === undefined || isNCAA && !assignedStaffIds.includes(evaluatorId)) return { ok: false, reason: 'RECRUITING_STAFF_REQUIRED' }
  if (isNCAA) { const workload = calculateStaffWorkload(world, evaluatorId as StaffPersonId); if (workload.overloaded || workload.totalCapacityUsed + 1 > workload.capacityLimit) return { ok: false, reason: 'STAFF_WORKLOAD_CAPACITY_EXHAUSTED' } }
  // Evaluation is a live Staff action; remote calls/messages do not consume a person-day.
  if (isNCAA && offCampus && Object.values(world.recruitingActionHistoryById).some((item) => item.staffPersonId === evaluatorId && item.date === world.currentDate && item.offCampus && item.kind !== 'evaluation' && item.kind !== 'negativeRecruiting')) return { ok: false, reason: 'STAFF_HIGH_TOUCH_ACTIVITY_CONFLICT' }
  const staffAssignments = activeRecruitingDesignations(cycle, input.programTeamId, world.currentDate)
  const staffAssignment = staffAssignments.find((item) => item.staffId === evaluatorId)
  const windowsToday = cycle.calendar === undefined ? undefined : getRecruitingPeriod(cycle.calendar, world.currentDate, recruit.prospectGroup)
  const annualYear = recruitingOpportunityYear(world.currentDate, category)
  const countableOpportunityRecords = Object.values(world.recruitingActionHistoryById).filter((item) => item.cycleId === cycle.id && item.recruitId === recruit.id && item.countsAsOpportunity && recruitingOpportunityYear(item.date, category) === annualYear)
  const priorOffCampusToday = Object.values(world.recruitingActionHistoryById).filter((item) => item.programTeamId === input.programTeamId && item.offCampus && item.date === world.currentDate && item.staffPersonId !== undefined && item.staffPersonId !== evaluatorId)
  const simultaneousRecruiters = new Set(priorOffCampusToday.map((item) => item.staffPersonId)).size
  const personDayYear = recruitingPersonDayYear(world.currentDate, category)
  const countedDays = new Set(Object.values(world.recruitingActionHistoryById).filter((item) => item.programTeamId === input.programTeamId && item.offCampus && item.staffPersonId !== undefined && recruitingPersonDayYear(item.date, category) === personDayYear && isCountableRecruitingPersonDay(cycle, item.date, recruit.prospectGroup)).map((item) => `${item.staffPersonId}:${item.date}`)).size
  const staffDailyCapacityUsed = Object.values(world.recruitingActionHistoryById).filter((item) => item.staffPersonId === evaluatorId && item.date === world.currentDate).reduce((sum, item) => sum + item.cost, 0)
  const permission = canPerformRecruitingAction({ date: world.currentDate, time: input.time, isNCAA, calendar: cycle.calendar, category, prospectGroup: recruit.prospectGroup, education: recruit.education, ...transferPermissionContext(world, recruit, input.programTeamId), action: 'evaluation', eventType: input.eventType, eventApproved: input.eventApproved, prospectCompetingToday: input.prospectCompetingToday, signingDay, signingRelatedActivity: input.signingRelatedActivity, countsAsOpportunity: true, countableOpportunitiesUsed: countableOpportunityRecords.length, personDayRequired: offCampus, personDayException: windowsToday?.personDayException, personDaysUsed: countedDays, designatedOffCampusRecruiter: offCampus ? staffAssignment !== undefined : undefined, designatedOffCampusRecruitersUsed: staffAssignments.length, simultaneousOffCampusRecruiters: simultaneousRecruiters, maximumDesignatedOffCampusRecruiters: cycle.calendar?.maximumDesignatedOffCampusRecruiters, maximumSimultaneousOffCampusRecruiters: cycle.calendar?.maximumSimultaneousOffCampusRecruiters, staffDailyCapacity: cycle.rules.staffDailyCapacity ?? 6, staffDailyCapacityUsed, staffActionCost: 1 })
  if (!permission.allowed) return { ok: false, reason: permission.reasonCode }
  if (offCampus && !staffAssignment) return { ok: false, reason: 'STAFF_DESIGNATION_REQUIRED' }
  if (offCampus && cycle.calendar?.maximumDesignatedOffCampusRecruiters !== undefined && staffAssignments.length > cycle.calendar.maximumDesignatedOffCampusRecruiters) return { ok: false, reason: 'OFF_CAMPUS_RECRUITER_DESIGNATION_LIMIT' }
  const capacity = world.recruitingCapacityByProgramId[input.programTeamId] ?? cycle.rules.periodCapacity
  if (capacity < 1) return { ok: false, reason: 'INSUFFICIENT_RECRUITING_CAPACITY' }
  const id = `recruiting-evaluation:${cycle.id}:${input.programTeamId}:${recruit.id}:${world.currentDate}:${Object.keys(world.recruitingActionHistoryById).length}`
  const record = { id, cycleId: cycle.id, recruitId: recruit.id, programTeamId: input.programTeamId, kind: 'evaluation' as const, date: world.currentDate, cost: 1, effect: 0, countsAsOpportunity: true, staffPersonId: evaluatorId, offCampus, eventType: input.eventType }
  return { ok: true, value: updateGameWorld(world, { recruitingActionHistory: [...Object.values(world.recruitingActionHistoryById), record], recruitingCapacityByProgramId: { ...world.recruitingCapacityByProgramId, [input.programTeamId]: capacity - 1 } }) }
}

function recruitingOpportunityYear(date: GameDate, category: 'men'|'women'): number {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return year - ((category === 'men' && month <= 4) || (category === 'women' && month <= 7) ? 1 : 0)
}

function recruitingPersonDayYear(date: GameDate, category: 'men'|'women'): number {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return year - (month < (category === 'men' ? 9 : 8) ? 1 : 0)
}

function isCountableRecruitingPersonDay(cycle: RecruitingCycle, date: GameDate, prospectGroup?: RecruitProfile['prospectGroup']): boolean {
  const month = Number(date.slice(5, 7))
  const inAnnualWindow = cycle.calendar?.annualPersonDayLimit === 100 ? month >= 9 || month <= 4 : month >= 8 || month <= 7
  if (!inAnnualWindow) return false
  return cycle.calendar === undefined || getRecruitingPeriod(cycle.calendar, date, prospectGroup)?.personDayException !== true
}

function prospectEducation(world: GameWorld, cycle: RecruitingCycle): NonNullable<RecruitProfile['education']> {
  const targetSeason = world.seasons[cycle.targetSeasonId]
  const graduationYear = Number((targetSeason?.startDate ?? cycle.opensOn).slice(0, 4))
  return {
    highSchoolGraduationYear: graduationYear,
    sophomoreConclusionOn: createGameDate(graduationYear - 2, 6, 15),
    dayAfterSophomoreConclusionOn: createGameDate(graduationYear - 2, 6, 16),
    sophomoreYearOpeningOn: createGameDate(graduationYear - 3, 8, 1),
    juniorYearOpeningOn: createGameDate(graduationYear - 2, 8, 1),
    seniorYearOpeningOn: createGameDate(graduationYear - 1, 8, 1),
    nontraditionalCalendar: false,
  }
}

export function makeRecruitingOffer(world: GameWorld, cycleId: string, recruitId: string, programTeamId: TeamId): RecruitingResult<GameWorld> {
  const cycle = world.recruitingCyclesById[cycleId]
  if (!cycle) return { ok: false, reason: 'INVALID_RECRUIT' }
  const rivalSigning = Object.values(world.recruitSigningsById).find((signing) => signing.recruitId === recruitId && signing.programTeamId !== programTeamId)
  const signedWithOtherProgram = rivalSigning !== undefined
  const profile = world.recruitProfilesById[recruitId]
  const isNCAA = world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike'
  const recruiterId = recruitingStaffActors(world, programTeamId).recruiterId
  if (isNCAA) {
    const staffBlock = recruitingStaffActionBlock(world, cycle, programTeamId, recruiterId, 1)
    if (staffBlock !== undefined) return { ok: false, reason: staffBlock }
  }
  const releasedFromContactProhibition = rivalSigning !== undefined && profile?.contactReleasedFromProgramId === rivalSigning.programTeamId
  const permission = canPerformRecruitingAction({ date: world.currentDate, isNCAA: world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike', calendar: cycle.calendar, category: world.ecosystems[cycle.ecosystemId]?.category, education: profile?.education, prospectGroup: profile?.prospectGroup, ...transferPermissionContext(world, profile, programTeamId), action: 'offer', signedWithOtherProgram, releasedFromContactProhibition })
  if (!permission.allowed) return { ok: false, reason: permission.reasonCode }
  const result = offer(cycle, world.recruitProfilesById[recruitId], Object.values(world.recruitingOffersById), programTeamId, world.currentDate)
  if (!result.ok) return result
  let next = updateGameWorld(world, { recruitingOffers: [...Object.values(world.recruitingOffersById), result.value] })
  if (isNCAA && recruiterId !== undefined) next = recordRecruitingStaffAction(next, { id: `staff-action:offer:${cycleId}:${programTeamId}:${recruitId}:${world.currentDate}`, cycleId, recruitId, programTeamId, kind: 'offer', date: world.currentDate, cost: 1, effect: 0, countsAsOpportunity: false, staffPersonId: recruiterId, offCampus: false })
  return { ok: true, value: next }
}

/** A promise is part of negotiation history and is retained on the same Player's recruiting record. */
export function promiseRecruitingRole(world: GameWorld, cycleId: string, recruitId: string, programTeamId: TeamId, strength: 'statement'|'expectation'|'assurance'|'explicit' = 'expectation'): RecruitingResult<GameWorld> {
  const cycle = world.recruitingCyclesById[cycleId]
  if (!cycle) return { ok: false, reason: 'INVALID_RECRUIT' }
  const rivalSigning = Object.values(world.recruitSigningsById).find((signing) => signing.recruitId === recruitId && signing.programTeamId !== programTeamId)
  const signedWithOtherProgram = rivalSigning !== undefined
  const profile = world.recruitProfilesById[recruitId]
  const releasedFromContactProhibition = rivalSigning !== undefined && profile?.contactReleasedFromProgramId === rivalSigning.programTeamId
  const permission = canPerformRecruitingAction({ date: world.currentDate, isNCAA: world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike', calendar: cycle.calendar, category: world.ecosystems[cycle.ecosystemId]?.category, education: profile?.education, prospectGroup: profile?.prospectGroup, ...transferPermissionContext(world, profile, programTeamId), action: 'correspondence', signedWithOtherProgram, releasedFromContactProhibition })
  if (!permission.allowed) return { ok: false, reason: permission.reasonCode }
  if (cycle?.status !== 'open' || !profile || profile.cycleId !== cycleId || profile.status === 'signed' || profile.status === 'arrived') return { ok: false, reason: 'INVALID_RECRUIT' }
  const capacity = world.recruitingCapacityByProgramId[programTeamId] ?? cycle.rules.periodCapacity
  const cost = cycle.rules.costs.pitch
  if (capacity < cost) return { ok: false, reason: 'INSUFFICIENT_RECRUITING_CAPACITY' }
  const rpg = profile.recruitingRpg ?? createRecruitingRpg(new SeededRandomSource(hashStringToSeed(`recruiting-rpg-legacy:${profile.id}`)), Object.keys(world.teams) as TeamId[])
  if (rpg.promises.some((item) => item.programTeamId === programTeamId && item.topic === 'role' && item.strength === strength && item.madeOn === world.currentDate)) return { ok: true, value: world }
  const recruiterId = recruitingStaffActors(world, programTeamId).recruiterId
  if (world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike') {
    const staffBlock = recruitingStaffActionBlock(world, cycle, programTeamId, recruiterId, 1)
    if (staffBlock !== undefined) return { ok: false, reason: staffBlock }
  }
  const contradictory = Object.values(world.recruitProfilesById).some((other) => other.id !== profile.id && otherPosition(world, other) === profile.position && (other.recruitingRpg?.promises ?? []).some((promise) => promise.programTeamId === programTeamId && promise.topic === 'role' && ['assurance','explicit'].includes(promise.strength)))
  const promise = { id: `promise:${cycleId}:${programTeamId}:${recruitId}:${rpg.promises.length}`, programTeamId, topic: 'role' as const, strength, detail: `Clear path to compete at ${profile.position}; roster competition remains a real factor.`, madeOn: world.currentDate }
  const story = [...rpg.story, `${world.currentDate}: ${strength} role promise recorded${contradictory ? '; it conflicts with another same-position assurance.' : '.'}`].slice(-24)
  let next = updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById).filter((item) => item.id !== recruitId), { ...profile, recruitingRpg: { ...rpg, promises: [...rpg.promises, promise], story } }], recruitingCapacityByProgramId: { ...world.recruitingCapacityByProgramId, [programTeamId]: capacity - cost } })
  if (world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike' && recruiterId !== undefined) next = recordRecruitingStaffAction(next, { id: `staff-action:promise:${cycleId}:${programTeamId}:${recruitId}:${world.currentDate}:${strength}`, cycleId, recruitId, programTeamId, kind: 'promise', date: world.currentDate, cost: 1, effect: 0, countsAsOpportunity: false, staffPersonId: recruiterId, offCampus: false })
  return { ok: true, value: next }
}

function otherPosition(world: GameWorld, profile: RecruitProfile): string | undefined { return world.players[profile.playerId]?.basketball.primaryPosition }

export function resolveRecruitingCommitments(world: GameWorld, cycleId: string): GameWorld {
  const cycle = world.recruitingCyclesById[cycleId]
  if (!cycle || cycle.status === 'scheduled' || cycle.status === 'completed') return world
  const profiles = Object.values(world.recruitProfilesById).filter((profile) => profile.cycleId === cycleId && (profile.status === 'open' || profile.status === 'committed'))
  // This resolver only changes verbal statuses, offers, story and negotiation terminal
  // state. It never changes roster/eligibility, incoming signings, promises or preferences.
  // Forecast each team's role context once within this synchronous resolution, then drop it.
  const planningRosters = new Map<string, readonly PlayerId[]>()
  const roleOpportunity = (profile: RecruitProfile, teamId: TeamId): number => {
    const planningCycle = profile.origin === 'transfer' ? undefined : profile.cycleId
    const key = `${teamId}:${planningCycle ?? 'current'}`
    let roster = planningRosters.get(key)
    if (roster === undefined) {
      roster = getRecruitingPlanningRoster(world, teamId, planningCycle)
      planningRosters.set(key, roster)
    }
    return getRecruitingRoleOpportunity(world, profile, teamId, roster)
  }
  let next = world
  for (const profile of profiles) {
    const current = Object.values(next.recruitingCommitmentsById).find((item) => item.cycleId === cycleId && item.recruitId === profile.id)
    const candidates = Object.values(next.recruitingOffersById).filter((offer) => offer.cycleId === cycleId && offer.recruitId === profile.id && (offer.status === 'active' || offer.status === 'committed')).map((offer) => {
      const choice = evaluateRecruitingChoice(next, profile, offer.programTeamId, roleOpportunity(profile, offer.programTeamId))
      const style = profile.recruitingRpg?.preferenceProfile.decisionStyle
      const visits = Object.values(next.recruitingVisitsById).filter((visit) => visit.recruitId === profile.id && visit.programTeamId === offer.programTeamId).length
      const rapport = profile.recruitingRpg?.relationships.filter((item) => item.programTeamId === offer.programTeamId).reduce((sum, item) => sum + item.rapport, 0) ?? 0
      const decisionReadiness = (style === 'early' ? 12 : style === 'deliberate' ? -8 : style === 'visitDriven' ? visits > 0 ? 15 : -35 : style === 'deadlineDriven' ? 0 : style === 'loyal' ? 10 : -4)
      const signal = next.recruitingInterests.find((value) => value.recruitId === profile.id && value.programTeamId === offer.programTeamId)?.value ?? 0
      return { offer, value: Math.round(choice.value + decisionReadiness + Math.min(12, rapport / 10) + Math.min(5, signal / 20)) }
    }).filter((candidate) => profile.origin !== 'transfer' || canRecruitTransferPlayer(next, profile.playerId, candidate.offer.programTeamId)).filter((candidate) => candidate.value >= cycle.rules.commitmentThreshold).sort((a, b) => b.value - a.value || a.offer.programTeamId.localeCompare(b.offer.programTeamId))
    const winner = candidates[0]
    if (!winner) {
      if (current && !Object.values(next.recruitSigningsById).some((item) => item.recruitId === profile.id)) next = updateGameWorld(next, { recruitProfiles: [...Object.values(next.recruitProfilesById).filter((item) => item.id !== profile.id), { ...profile, status: 'open' }], recruitingCommitments: Object.values(next.recruitingCommitmentsById).filter((item) => item.id !== current.id), recruitingOffers: Object.values(next.recruitingOffersById).map((item) => item.recruitId === profile.id ? { ...item, status: 'active' } : item) })
      continue
    }
    if (current?.programTeamId === winner.offer.programTeamId) continue
    const commitment = { id: `commitment:${cycleId}:${profile.id}`, cycleId, recruitId: profile.id, programTeamId: winner.offer.programTeamId, offerId: winner.offer.id, committedOn: next.currentDate }
    const story = profile.recruitingRpg === undefined ? undefined : [...profile.recruitingRpg.story, `${next.currentDate}: ${current ? 'Verbal commitment changed after the recruiting picture shifted.' : 'Verbally committed after weighing role, relationships and context.'}`].slice(-24)
    const negotiations = profile.recruitingRpg?.negotiations?.map((item) => item.terminalState !== 'active' ? item : item.programTeamId === winner.offer.programTeamId
      ? { ...item, stage: 'terminal' as const, terminalState: 'committed' as const }
      : { ...item, stage: 'terminal' as const, terminalState: 'rejected' as const })
    const committedProfile = { ...profile, status: 'committed' as const, ...(story === undefined ? {} : { recruitingRpg: { ...profile.recruitingRpg!, story, ...(negotiations === undefined ? {} : { negotiations }) } }) }
    next = updateGameWorld(next, { recruitProfiles: [...Object.values(next.recruitProfilesById).filter((item) => item.id !== profile.id), committedProfile], recruitingCommitments: [...Object.values(next.recruitingCommitmentsById).filter((item) => item.id !== commitment.id), commitment], recruitingOffers: Object.values(next.recruitingOffersById).map((item) => item.recruitId === profile.id ? { ...item, status: item.id === winner.offer.id ? 'committed' : 'active' } : item) })
  }
  return next
}

/** A verbal commitment can be reopened before formal signing; signed players are terminal. */
export function decommitRecruitingProspect(world: GameWorld, cycleId: string, recruitId: string): RecruitingResult<GameWorld> {
  const commitment = Object.values(world.recruitingCommitmentsById).find((item) => item.cycleId === cycleId && item.recruitId === recruitId)
  const profile = world.recruitProfilesById[recruitId]
  if (!commitment || !profile || profile.status !== 'committed') return { ok: false, reason: 'COMMITMENT_NOT_ACTIVE' }
  if (Object.values(world.recruitSigningsById).some((item) => item.cycleId === cycleId && item.recruitId === recruitId)) return { ok: false, reason: 'SIGNED_COMMITMENT_TERMINAL' }
  const rpg = profile.recruitingRpg
  const updatedProfile = { ...profile, status: 'open' as const, ...(rpg === undefined ? {} : { recruitingRpg: { ...rpg, story: [...rpg.story, `${world.currentDate}: verbal commitment was withdrawn before formal signing; recruiting reopened.`].slice(-24) } }) }
  return { ok: true, value: updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById).filter((item) => item.id !== recruitId), updatedProfile], recruitingCommitments: Object.values(world.recruitingCommitmentsById).filter((item) => item.id !== commitment.id), recruitingOffers: Object.values(world.recruitingOffersById).map((item) => item.recruitId === recruitId ? { ...item, status: 'active' } : item) }) }
}

/** Uses the completed FINAL, or the canonical championship history of a compact league. */
export function resolveBasketballChampionshipDate(world: GameWorld, cycle: RecruitingCycle): GameDate | undefined {
  const season = world.seasons[cycle.sourceSeasonId]
  if (season === undefined) return undefined
  const variant = season.worldCompetitionFormat?.variants.find((item) => item.isRealVariant) ?? season.worldCompetitionFormat?.variants[0]
  const finalNode = variant?.nodes.find((node) => node.role === 'FINAL')
  if (finalNode === undefined) return season.worldCompetitionFormat === undefined ? world.seasonHistoryBySeasonId[season.id]?.completedOn : undefined
  const games = Object.values(world.games).filter((game) => game.seasonId === season.id && game.competitionStageKey === finalNode.key && game.status === 'completed')
  return games.map((game) => game.date).sort().at(-1)
}

export function signCommittedRecruit(world: GameWorld, cycleId: string, recruitId: string, agreementType: 'athleticsAidAgreement'|'settlementRelatedBenefitsAgreement' = 'athleticsAidAgreement'): RecruitingResult<GameWorld> {
  const profile = world.recruitProfilesById[recruitId]; const cycle = world.recruitingCyclesById[cycleId]
  const commitment = Object.values(world.recruitingCommitmentsById).find((item) => item.cycleId === cycleId && item.recruitId === recruitId)
  if (!cycle || cycle.status !== 'open' && cycle.status !== 'signing') return { ok: false, reason: 'RECRUITING_NOT_OPEN' }
  if (!profile || !commitment || profile.status !== 'committed') return { ok: false, reason: 'RECRUIT_ALREADY_COMMITTED' }
  const isNCAA = world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike'
  if (!isNCAA && cycle.status !== 'signing') return { ok: false, reason: 'RECRUITING_NOT_OPEN' }
  const institutionalPolicy = cycle.institutionalSigningPolicies?.find((policy) => policy.programTeamId === commitment.programTeamId && policy.seasonId === cycle.sourceSeasonId)
  const permission = canPerformRecruitingAction({ date: world.currentDate, isNCAA, calendar: cycle.calendar, category: world.ecosystems[cycle.ecosystemId]?.category, prospectGroup: profile.prospectGroup, ...transferPermissionContext(world, profile, commitment.programTeamId), basketballChampionshipDate: resolveBasketballChampionshipDate(world, cycle), institutionalRegularSigningEndOn: institutionalPolicy?.finalAidSigningDate, action: 'sign' })
  if (!permission.allowed) return { ok: false, reason: permission.reasonCode }
  const used = Object.values(world.recruitSigningsById).filter((item) => item.cycleId === cycleId && item.programTeamId === commitment.programTeamId).length
  if (used >= cycle.rules.maxSignings) return { ok: false, reason: 'OFFER_LIMIT_REACHED' }
  const signing = { id: `signing:${cycleId}:${recruitId}`, cycleId, recruitId, playerId: profile.playerId, programTeamId: commitment.programTeamId, targetSeasonId: cycle.targetSeasonId, offerId: commitment.offerId, signedOn: world.currentDate, agreementType }
  const recruitingRpg = profile.recruitingRpg === undefined ? undefined : { ...profile.recruitingRpg, negotiations: profile.recruitingRpg.negotiations?.map((item) => item.terminalState !== 'active' ? item : { ...item, stage: 'terminal' as const, terminalState: item.programTeamId === commitment.programTeamId ? 'committed' as const : 'rejected' as const }), story: [...profile.recruitingRpg.story, `${world.currentDate}: formal ${agreementType} signing completed.`].slice(-24) }
  const signedProfile = { ...profile, status: 'incoming' as const, ...(recruitingRpg === undefined ? {} : { recruitingRpg }) }
  return { ok: true, value: updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById).filter((item) => item.id !== recruitId), signedProfile], recruitSignings: [...Object.values(world.recruitSigningsById), signing], recruitingOffers: Object.values(world.recruitingOffersById).map((offer) => offer.id === commitment.offerId ? { ...offer, status: 'signed' } : offer) }) }
}

/** Completes a signed transfer as one roster move while retaining the canonical Player identity. */
export function completeCollegeTransfer(world: GameWorld, recruitId: string, academicEvidence?: Pick<import('@/domain/eligibility').PlayerEnrollment, 'fullTimeEnrollmentTermStartedAt' | 'firstClassAttendanceAt' | 'academicLevel' | 'firstAcademicTermEndsOn' | 'nextAcademicYearStartsOn' | 'transitionPolicySelection' | 'transitionPolicySource'>): RecruitingResult<GameWorld> {
  const profile = world.recruitProfilesById[recruitId]
  const entry = profile?.transferPortalEntryId === undefined ? undefined : world.transferPortalEntriesById[profile.transferPortalEntryId]
  const signing = Object.values(world.recruitSigningsById).find((item) => item.recruitId === recruitId)
  if (profile?.origin === 'transfer' && profile.status === 'arrived' && entry?.status === 'completed' && entry.movement !== undefined) return { ok: true, value: world }
  if (profile?.origin !== 'transfer' || !entry || entry.status !== 'authorized' || profile.status !== 'incoming' || !signing) return { ok: false, reason: 'SIGNED_TRANSFER_REQUIRED' }
  if (!canRecruitTransferPlayer(world, profile.playerId, signing.programTeamId)) return { ok: false, reason: 'TRANSFER_PORTAL_AUTHORIZATION_REQUIRED' }
  const cycle = world.recruitingCyclesById[signing.cycleId]
  const season = cycle === undefined ? undefined : world.seasons[cycle.sourceSeasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  const destination = world.teams[signing.programTeamId]
  const activeEnrollment = Object.values(world.playerEnrollmentsById).find((item) => item.playerId === profile.playerId && item.ecosystemId === entry.ecosystemId && item.teamId === entry.sourceTeamId && item.status === 'active')
  if (!cycle || cycle.ecosystemId !== entry.ecosystemId || !competition?.participantTeamIds.includes(signing.programTeamId) || !destination || !activeEnrollment) return { ok: false, reason: 'TRANSFER_DESTINATION_OR_SOURCE_ENROLLMENT_INVALID' }
  const sourceAcademic = Object.values(world.academicProfilesById).find((item) => item.playerId === profile.playerId && item.ecosystemId === entry.ecosystemId && item.programTeamId === entry.sourceTeamId)
  const sourceEligibility = Object.values(world.eligibilityProfilesById).find((item) => item.playerId === profile.playerId && item.ecosystemId === entry.ecosystemId && item.programTeamId === entry.sourceTeamId)
  const sourceNil = Object.values(world.nilProfilesById).find((item) => item.playerId === profile.playerId && item.ecosystemId === entry.ecosystemId && item.programTeamId === entry.sourceTeamId)
  let staged = updateGameWorld(world, {
    teams: Object.values(world.teams).map((team) => createTeam({ ...team, rosterPlayerIds: team.id === signing.programTeamId
      ? [...team.rosterPlayerIds.filter((id) => id !== profile.playerId), profile.playerId]
      : team.rosterPlayerIds.filter((id) => id !== profile.playerId) })),
    playerEnrollments: Object.values(world.playerEnrollmentsById).map((item) => item.id === activeEnrollment.id ? { ...item, status: 'ended' as const, endsOn: world.currentDate } : item),
  })
  const enrolled = enrollPlayer(staged, { playerId: profile.playerId, teamId: signing.programTeamId, ecosystemId: entry.ecosystemId, actionId: `transfer-signing:${signing.id}`, evidence: { transferFromEnrollmentId: activeEnrollment.id, ...(activeEnrollment.academicLevel === undefined ? {} : { academicLevel: activeEnrollment.academicLevel }), ...academicEvidence } })
  if (!enrolled.ok) return { ok: false, reason: enrolled.reason }
  staged = enrolled.world
  const movedAcademic = sourceAcademic === undefined ? staged.academicProfilesById : { ...staged.academicProfilesById, [`academic:${entry.ecosystemId}:${signing.programTeamId}:${profile.playerId}`]: { ...sourceAcademic, id: `academic:${entry.ecosystemId}:${signing.programTeamId}:${profile.playerId}`, programTeamId: signing.programTeamId } }
  const movedEligibility = sourceEligibility === undefined ? staged.eligibilityProfilesById : { ...staged.eligibilityProfilesById, [`eligibility:${entry.ecosystemId}:${signing.programTeamId}:${profile.playerId}`]: { ...sourceEligibility, id: `eligibility:${entry.ecosystemId}:${signing.programTeamId}:${profile.playerId}`, programTeamId: signing.programTeamId } }
  const movedNil = sourceNil === undefined ? staged.nilProfilesById : { ...staged.nilProfilesById, [`nil-profile:${entry.ecosystemId}:${signing.programTeamId}:${profile.playerId}`]: { ...sourceNil, id: `nil-profile:${entry.ecosystemId}:${signing.programTeamId}:${profile.playerId}`, programTeamId: signing.programTeamId } }
  staged = updateGameWorld(staged, { academicProfiles: Object.values(movedAcademic), eligibilityProfiles: Object.values(movedEligibility), nilProfiles: Object.values(movedNil) })
  const assessment = assessCollegeEligibility(staged, { playerId: profile.playerId, teamId: signing.programTeamId, ecosystemId: entry.ecosystemId })
  if (!assessment?.eligible) return { ok: false, reason: `TRANSFER_DESTINATION_INELIGIBLE:${assessment?.reasons.join(',') ?? 'RULESET_UNAVAILABLE'}` }
  staged = recordCollegeEligibilityAssessment(staged, { playerId: profile.playerId, teamId: signing.programTeamId, ecosystemId: entry.ecosystemId })
  staged = initializeNilProfile(staged, profile.playerId, signing.programTeamId, entry.ecosystemId)
  const completedEntry = { ...entry, status: 'completed' as const, destinationTeamId: signing.programTeamId, movement: {
    playerId: profile.playerId,
    sourceTeamId: entry.sourceTeamId,
    destinationTeamId: signing.programTeamId,
    sourceEnrollmentId: activeEnrollment.id,
    destinationEnrollmentId: enrolled.enrollment.id,
    formalSigningId: signing.id,
    transferredOn: world.currentDate,
    eligibilityAssessmentId: assessment.id,
    authority: 'AUTHORIZED_PORTAL_ENTRY' as const,
    rulesetId: entry.rulesetId,
    rulesetProvenance: world.transferPortalRulesetsById[entry.rulesetId]!.provenance,
  } }
  const arrivedProfile = { ...profile, status: 'arrived' as const }
  return { ok: true, value: updateGameWorld(staged, {
    transferPortalEntries: Object.values(staged.transferPortalEntriesById).map((item) => item.id === entry.id ? completedEntry : item),
    recruitProfiles: Object.values(staged.recruitProfilesById).map((item) => item.id === profile.id ? arrivedProfile : item),
  }) }
}

export function arriveSignedRecruits(world: GameWorld): GameWorld {
  const arrivals = Object.values(world.recruitSigningsById).filter((signing) => {
    const season = world.seasons[signing.targetSeasonId]
    return season !== undefined && season.startDate <= world.currentDate && season.endDate >= world.currentDate && !world.teams[signing.programTeamId].rosterPlayerIds.includes(signing.playerId) && world.recruitProfilesById[signing.recruitId]?.status === 'incoming' && world.recruitProfilesById[signing.recruitId]?.origin !== 'transfer'
  })
  if (arrivals.length === 0) return world
  let current = world
  for (const arrival of arrivals) {
    const season = current.seasons[arrival.targetSeasonId]
    const ecosystemId = season === undefined ? undefined : current.competitions[season.competitionId]?.ecosystemId
    if (ecosystemId === undefined) continue
    const team = current.teams[arrival.programTeamId]!
    const existingRosterOwner = Object.values(current.teams).find((item) => item.id !== team.id && item.rosterPlayerIds.includes(arrival.playerId))
    if (existingRosterOwner !== undefined) {
      current = updateGameWorld(current, { recruitProfiles: Object.values(current.recruitProfilesById).map((profile) => profile.id === arrival.recruitId ? {
        ...profile,
        status: 'ineligible' as const,
        recruitingRpg: profile.recruitingRpg === undefined ? undefined : { ...profile.recruitingRpg, story: [...profile.recruitingRpg.story, `${current.currentDate}: college arrival held; player is already rostered with ${existingRosterOwner.id}.`] },
      } : profile) })
      continue
    }
    const staged = updateGameWorld(current, { teams: Object.values(current.teams).map((item) => item.id === team.id ? createTeam({ ...item, rosterPlayerIds: [...item.rosterPlayerIds, arrival.playerId] }) : item) })
    if (current.ecosystems[ecosystemId]?.kind === 'ncaaLike') {
      const enrolled = enrollPlayer(staged, { playerId: arrival.playerId, teamId: arrival.programTeamId, ecosystemId, actionId: `recruit-signing:${arrival.id}` })
      if (!enrolled.ok) {
        current = updateGameWorld(current, { recruitProfiles: Object.values(current.recruitProfilesById).map((profile) => profile.id === arrival.recruitId ? { ...profile, status: 'ineligible', recruitingRpg: profile.recruitingRpg === undefined ? undefined : { ...profile.recruitingRpg, story: [...profile.recruitingRpg.story, `${current.currentDate}: college arrival held; enrollment validation failed (${enrolled.reason}).`] } } : profile) })
        continue
      }
      const assessment = assessCollegeEligibility(enrolled.world, { playerId: arrival.playerId, teamId: arrival.programTeamId, ecosystemId })
      current = recordCollegeEligibilityAssessment(enrolled.world, { playerId: arrival.playerId, teamId: arrival.programTeamId, ecosystemId })
      if (!assessment?.eligible) {
        current = endPlayerEnrollment(current, enrolled.enrollment.id)
        current = updateGameWorld(current, { teams: Object.values(current.teams).map((item) => item.id === team.id ? createTeam({ ...item, rosterPlayerIds: item.rosterPlayerIds.filter((playerId) => playerId !== arrival.playerId) }) : item), recruitProfiles: Object.values(current.recruitProfilesById).map((profile) => profile.id === arrival.recruitId ? { ...profile, status: 'ineligible', recruitingRpg: profile.recruitingRpg === undefined ? undefined : { ...profile.recruitingRpg, story: [...profile.recruitingRpg.story, `${current.currentDate}: college arrival blocked by eligibility assessment (${assessment?.reasons.join(', ') ?? 'RULESET_UNAVAILABLE'}).`] } } : profile) })
        continue
      }
    } else {
      current = initializeEligibility(staged, arrival.playerId, arrival.programTeamId, ecosystemId)
      current = initializeAcademicProfile(current, arrival.playerId, arrival.programTeamId, ecosystemId)
    }
    current = initializeNilProfile(current, arrival.playerId, arrival.programTeamId, ecosystemId)
    current = updateGameWorld(current, { recruitProfiles: Object.values(current.recruitProfilesById).map((profile) => profile.id === arrival.recruitId ? { ...profile, status: 'arrived' } : profile) })
  }
  return current
}

export interface RecruitingClassSummary { readonly programTeamId: TeamId; readonly committed: readonly RecruitProfile[]; readonly signed: readonly RecruitProfile[]; readonly incoming: readonly RecruitProfile[]; readonly publicQuality: number; readonly remainingSignings: number }
export function getRecruitingClass(world: GameWorld, cycleId: string, programTeamId: TeamId): RecruitingClassSummary {
  const profiles = Object.values(world.recruitProfilesById); const signedIds = new Set(Object.values(world.recruitSigningsById).filter((item) => item.cycleId === cycleId && item.programTeamId === programTeamId).map((item) => item.recruitId)); const committedIds = new Set(Object.values(world.recruitingCommitmentsById).filter((item) => item.cycleId === cycleId && item.programTeamId === programTeamId).map((item) => item.recruitId)); const signed = profiles.filter((profile) => signedIds.has(profile.id)); const committed = profiles.filter((profile) => committedIds.has(profile.id) && !signedIds.has(profile.id)); const incoming = signed.filter((profile) => profile.status === 'incoming'); const quality = [...committed, ...signed].reduce((total, profile) => total + ({ elite: 4, strong: 3, rotation: 2, developmental: 1 }[profile.tier]), 0); const cycle = world.recruitingCyclesById[cycleId]
  return { programTeamId, committed, signed, incoming, publicQuality: quality, remainingSignings: Math.max(0, (cycle?.rules.maxSignings ?? 0) - signed.length) }
}

export function getTeamRecruitingNeeds(world: GameWorld, teamId: TeamId, cycleId?: string): Readonly<Record<'PG'|'SG'|'SF'|'PF'|'C', number>> {
  const team = world.teams[teamId]; const counts: Record<'PG'|'SG'|'SF'|'PF'|'C', number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 }
  if (team) for (const playerId of getRecruitingPlanningRoster(world, teamId, cycleId)) counts[world.players[playerId]!.basketball.primaryPosition] += 1
  for (const signing of Object.values(world.recruitSigningsById).filter((item) => item.programTeamId === teamId)) { const profile = world.recruitProfilesById[signing.recruitId]; if (profile?.status === 'incoming') counts[profile.position] += 1 }
  return Object.fromEntries(Object.entries(counts).map(([position, count]) => [position, Math.max(0, 2 - count)])) as Record<'PG'|'SG'|'SF'|'PF'|'C', number>
}

/** Bounded, organization-specific target ordering for recruiting decisions. */
export function rankAiRecruitingTargets(world: GameWorld, cycleId: string, programTeamId: TeamId): readonly RecruitProfile[] {
  const needs = getTeamRecruitingNeeds(world, programTeamId, cycleId)
  const immediateNeeds = getTeamRecruitingNeeds(world, programTeamId)
  const organizationId = world.teams[programTeamId]!.organizationId
  const policy = world.organizationEvaluationPoliciesById[organizationId]
  return Object.values(world.recruitProfilesById).filter((profile) => profile.cycleId === cycleId && (profile.status === 'open' || profile.status === 'committed')).sort((a, b) => {
    const first = world.players[a.playerId]!, second = world.players[b.playerId]!
    const firstValue = deriveOrganizationPlayerValuation({ organizationId, playerId: first.id, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'RECRUITING', publicPosition: first.basketball.primaryPosition, policy })
    const secondValue = deriveOrganizationPlayerValuation({ organizationId, playerId: second.id, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'RECRUITING', publicPosition: second.basketball.primaryPosition, policy })
    return (b.origin === 'transfer' ? immediateNeeds : needs)[b.position] - (a.origin === 'transfer' ? immediateNeeds : needs)[a.position] || secondValue.priorityScore - firstValue.priorityScore || a.publicRank - b.publicRank || a.id.localeCompare(b.id)
  })
}

/** Weekly deterministic AI cadence. It only invokes public canonical operations. */
export function progressAiRecruiting(world: GameWorld, cycleId: string): GameWorld {
  const cycle = world.recruitingCyclesById[cycleId]; const ecosystem = cycle && world.ecosystems[cycle.ecosystemId]
  if (!cycle || ecosystem?.kind !== 'ncaaLike' || (cycle.status !== 'open' && cycle.status !== 'signing')) return world
  const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)?.id
  const programs = Object.values(world.competitions).filter((competition) => competition.ecosystemId === cycle.ecosystemId).flatMap((competition) => competition.participantTeamIds).filter((teamId, index, all) => teamId !== userTeam && all.indexOf(teamId) === index).sort()
  let next = world
  for (const programTeamId of programs) {
    const needs = getTeamRecruitingNeeds(next, programTeamId, cycleId)
    const targets = rankAiRecruitingTargets(next, cycleId, programTeamId).slice(0, 2)
    for (const target of targets) {
      next = addRecruitingBoardEntry(next, { programTeamId, recruitId: target.id, priority: needs[target.position] > 0 ? 'high' : 'normal' })
      const priorActions = Object.values(next.recruitingActionHistoryById).filter((item) => item.cycleId === cycleId && item.recruitId === target.id && item.programTeamId === programTeamId)
      const isFreshTarget = priorActions.length === 0
      if (!priorActions.some((item) => item.kind === 'contact')) { const contacted = performRecruitingAction(next, cycleId, target.id, programTeamId, 'contact'); if (contacted.ok) next = contacted.value }
      if (!priorActions.some((item) => item.kind === 'pitch')) { const pitched = performRecruitingAction(next, cycleId, target.id, programTeamId, 'pitch'); if (pitched.ok) next = pitched.value }
      next = progressAiNegotiation(next, cycleId, target.id, programTeamId)
      if (!Object.values(next.recruitingOffersById).some((item) => item.cycleId === cycleId && item.recruitId === target.id && item.programTeamId === programTeamId && item.status === 'active')) { const offered = makeRecruitingOffer(next, cycleId, target.id, programTeamId); if (offered.ok) next = offered.value }
      // Visit is deferred to the next AI cadence after the first contact/negotiation so it fits
      // the canonical Staff V2 daily budget with the high-touch recruiter actions.
      if (!isFreshTarget && !Object.values(next.recruitingVisitsById).some((item) => item.cycleId === cycleId && item.recruitId === target.id && item.programTeamId === programTeamId)) { const visited = performRecruitingAction(next, cycleId, target.id, programTeamId, 'visit'); if (visited.ok) next = visited.value }
    }
    for (const commitment of Object.values(next.recruitingCommitmentsById).filter((item) => item.cycleId === cycleId && item.programTeamId === programTeamId)) { const signed = signCommittedRecruit(next, cycleId, commitment.recruitId); if (signed.ok) next = signed.value }
  }
  return resolveRecruitingCommitments(next, cycleId)
}

export function progressAiNegotiation(world: GameWorld, cycleId: string, recruitId: string, programTeamId: TeamId): GameWorld {
  const profile = world.recruitProfilesById[recruitId]
  if (profile?.recruitingRpg === undefined || profile.status !== 'open') return world
  let negotiation = profile.recruitingRpg.negotiations?.find((item) => item.cycleId === cycleId && item.programTeamId === programTeamId && item.terminalState === 'active')
  if (negotiation === undefined) {
    const opened = openAiRecruitingNegotiation(world, cycleId, recruitId, programTeamId)
    if (!opened.ok) return world
    world = opened.world
    negotiation = opened.negotiation
  }
  const topic = negotiation.unresolvedTopics[0]
  if (topic === undefined) return world
  const current = world.recruitProfilesById[recruitId]!
  const programIntel = current.recruitingRpg?.intel.find((item) => item.programTeamId === programTeamId)
  const relationship = current.recruitingRpg?.relationships.find((item) => item.programTeamId === programTeamId && item.actor === 'program')
  const trust = relationship?.trust ?? 50
  const credibility = relationship?.credibility ?? 50
  const staff = staffForRecruiting(world, programTeamId).recruiterId
  const communication = staff === undefined ? 50 : world.staffPeopleById[staff as keyof typeof world.staffPeopleById]?.professional.attributes.communication ?? 50
  const knowsRoleFit = topic === 'role' || topic === 'playingOpportunity' || topic === 'rosterCompetition'
  const hasOpenPosition = getTeamRecruitingNeeds(world, programTeamId, current.origin === 'transfer' ? undefined : cycleId)[current.position] > 0
  const promiseCapable = !['commercialEnvironment','familyDistance','visit','decisionTiming'].includes(topic)
  const response = selectAiNegotiationResponse({ cycleId, programTeamId, recruitId, date: world.currentDate, topic, intelConfidence: programIntel?.confidence ?? 0, trust, credibility, hasOpenPosition, communication })
  const result = respondToRecruitingConcern(world, negotiation.id, topic, response)
  return result.ok ? result.world : world
}

/** AI action selection accepts only program-known facts and canonical context. */
export function selectAiNegotiationResponse(input: { readonly cycleId: string; readonly programTeamId: TeamId; readonly recruitId: string; readonly date: GameDate; readonly topic: RecruitingNegotiationTopic; readonly intelConfidence: number; readonly trust: number; readonly credibility: number; readonly hasOpenPosition: boolean; readonly communication: number }): RecruitingProgramResponseKind {
  const knowsRoleFit = input.topic === 'role' || input.topic === 'playingOpportunity' || input.topic === 'rosterCompetition'
  const promiseCapable = !['commercialEnvironment','familyDistance','visit','decisionTiming'].includes(input.topic)
  // A raised role concern can be answered from the program's public roster plan;
  // confidence about the prospect's private preferences does not change that fact.
  return knowsRoleFit && input.hasOpenPosition
    ? 'factualReassurance'
    : promiseCapable && input.trust >= 58 && input.communication >= 55
      ? 'promise'
      : input.trust < 30 || input.credibility < 25
        ? 'refuse'
        : input.topic === 'decisionTiming' && input.communication >= 70 && input.trust >= 55 && hashStringToSeed(`${input.cycleId}:${input.programTeamId}:${input.recruitId}:${input.date}:${input.topic}`) % 3 === 0
          ? 'pressure'
          : hashStringToSeed(`${input.cycleId}:${input.programTeamId}:${input.recruitId}:${input.topic}`) % 2 === 0 ? 'delay' : 'redirect'
}

/** Builds the NCAA recruiting market from canonical, explicitly sourced Players. */
export function generateRecruitingPool(world: GameWorld, cycleId: string): GameWorld {
  const cycle = world.recruitingCyclesById[cycleId]
  if (!cycle || Object.values(world.recruitProfilesById).some((profile) => profile.cycleId === cycleId)) return world
  if (world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike') return generateCanonicalNcaaRecruitingPool(world, cycleId)
  return world
}

/** Explicit compatibility path for non-NCAA legacy fixtures; never used by annual NCAA intake. */
export function generateLegacyFixtureRecruitingPool(world: GameWorld, cycleId: string): GameWorld {
  const cycle = world.recruitingCyclesById[cycleId]
  if (!cycle || Object.values(world.recruitProfilesById).some((profile) => profile.cycleId === cycleId)) return world
  const template = Object.values(world.teams).find((team) => Object.values(world.competitions).some((competition) => competition.ecosystemId === cycle.ecosystemId && competition.participantTeamIds.includes(team.id)))
  if (!template) return world
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const
  const players = []; const profiles = []
  for (let index = 0; index < cycle.rules.poolSize; index += 1) {
    const id = `recruit:${cycle.id}:${index + 1}` as import('@/domain/ids').PlayerId
    const random = new SeededRandomSource(hashStringToSeed(`recruiting-pool-v1:${cycle.ecosystemId}:${cycle.id}:${index}`))
    const position = positions[index % positions.length]!
    const ratings = generateCanonicalRatings(hashStringToSeed(cycle.id), id, position, 42, 82)
    const age = random.nextInt(17, 20)
    const player = createPlayer({ id, firstName: `Recruit${index + 1}`, lastName: `Class${cycle.targetSeasonId}`, gender: template.gender, nationalityId: template.countryId, basketball: { primaryPosition: position, ratings }, bio: { dateOfBirth: addYears(cycle.opensOn, -age), heightCm: random.nextInt(178, 218), weightKg: random.nextInt(72, 125) }, development: generateCanonicalDevelopmentProfile(hashStringToSeed(cycle.id), id, ratings, age) })
    // Public recruiting reputation is generated independently from Player Truth ratings.
    const publicScore = random.nextInt(40, 86)
    const programs = Object.values(world.competitions).filter((competition) => competition.ecosystemId === cycle.ecosystemId).flatMap((competition) => competition.participantTeamIds)
    players.push(player); profiles.push({ id: `recruit-profile:${cycle.id}:${index + 1}`, playerId: id, cycleId, origin: (['preCollege', 'academy', 'international'] as const)[index % 3]!, position, prospectGroup: 'seniorOrTwoYear' as const, education: prospectEducation(world, cycle), publicRank: index + 1, positionRank: Math.floor(index / positions.length) + 1, tier: (publicScore >= 72 ? 'elite' : publicScore >= 62 ? 'strong' : publicScore >= 52 ? 'rotation' : 'developmental') as 'elite'|'strong'|'rotation'|'developmental', preferences: { opportunity: random.nextInt(1, 10), development: random.nextInt(1, 10), competing: random.nextInt(1, 10), coach: random.nextInt(1, 10) }, recruitingRpg: createRecruitingRpg(random, programs), status: 'open' as const })
  }
  profiles.sort((a, b) => b.tier.localeCompare(a.tier) || a.id.localeCompare(b.id)).forEach((profile, index) => { (profile as { publicRank: number }).publicRank = index + 1 })
  return updateGameWorld(world, { players: [...Object.values(world.players), ...players], recruitProfiles: [...Object.values(world.recruitProfilesById), ...profiles] })
}

function generateCanonicalNcaaRecruitingPool(world: GameWorld, cycleId: string): GameWorld {
  const cycle = world.recruitingCyclesById[cycleId]!
  const competitions = Object.values(world.competitions).filter((item) => item.ecosystemId === cycle.ecosystemId)
  const programIds = [...new Set(competitions.flatMap((item) => item.participantTeamIds))].sort()
  const vacancies = programIds.reduce((sum, id) => {
    const needs = getTeamRecruitingNeeds(world, id, cycleId)
    return sum + needs.PG + needs.SG + needs.SF + needs.PF + needs.C
  }, 0)
  const demand = Math.min(cycle.rules.poolSize, Math.max(programIds.length * 2, vacancies))
  const rules = resolveCollegeRuleset(world, cycle.ecosystemId, world.currentDate)
  const withinCollegeClock = (playerId: import('@/domain/ids').PlayerId) => { const clock = rules && deriveCollegeEligibilityClock(world, playerId, rules); return !clock || world.currentDate < addYears(clock.startsOn, rules!.eligibilityClock!.periodYears) }
  const existingProfiles = Object.values(world.recruitProfilesById)
  const blockedPlayers = new Set(existingProfiles.filter((profile) => profile.status !== 'arrived' && profile.status !== 'unsigned' && profile.status !== 'ineligible').map((profile) => profile.playerId))
  const eligible = Object.values(world.players).filter((player) => {
    const source = playerPathwaySource(world, player)
    return player.careerEnd === undefined && withinCollegeClock(player.id) && source !== undefined && player.gender === (world.ecosystems[cycle.ecosystemId]?.category === 'men' ? 'male' : 'female')
      && !blockedPlayers.has(player.id)
      && !Object.values(world.teams).some((team) => team.rosterPlayerIds.includes(player.id))
  }).sort((a, b) => a.id.localeCompare(b.id)).slice(0, demand)

  const materializationRequests: { cohortId: string; candidateIndex: number; cause: 'RECRUITING_POOL' }[] = []
  const selected = new Set(eligible.map((player) => player.id))
  for (const cohort of Object.values(world.talentCohortsById).filter((item) => item.candidateCapacity > 0 && item.gender === (world.ecosystems[cycle.ecosystemId]?.category === 'men' ? 'male' : 'female')).sort((a, b) => b.birthYear - a.birthYear || a.id.localeCompare(b.id))) {
    if (selected.size >= demand) break
    const materializedIndices = new Set(Object.values(world.talentMaterializationsByCandidateKey).filter((item) => item.cohortId === cohort.id).map((item) => item.candidateIndex))
    for (let index = 1; index <= cohort.candidateCapacity && selected.size + materializationRequests.length < demand; index += 1) {
      const candidateKey = `${cohort.id}:candidate:${index.toString().padStart(6, '0')}`
      const existing = world.talentMaterializationsByCandidateKey[candidateKey]
      if (materializedIndices.has(index)) {
        const player = existing === undefined ? undefined : world.players[existing.playerId]
        if (player !== undefined && player.careerEnd === undefined && withinCollegeClock(player.id) && latestPlayerPathway(player.pathwayHistory) !== undefined && !blockedPlayers.has(player.id) && !selected.has(player.id) && !Object.values(world.teams).some((team) => team.rosterPlayerIds.includes(player.id))) selected.add(player.id)
        continue
      }
      materializationRequests.push({ cohortId: cohort.id, candidateIndex: index, cause: 'RECRUITING_POOL' })
    }
  }
  const supplied = materializeTalentCandidates(world, materializationRequests)
  const candidates = [...eligible, ...supplied.players].filter((player, index, all) => all.findIndex((item) => item.id === player.id) === index).slice(0, demand)
  const profiles = candidates.map((player, index): RecruitProfile => {
    const source = playerPathwaySource(supplied.world, player)!
    const candidateKey = Object.values(supplied.world.talentMaterializationsByCandidateKey).find((item) => item.playerId === player.id)?.candidateKey
    const random = new SeededRandomSource(hashStringToSeed(`recruiting-profile:${cycleId}:${candidateKey ?? player.id}`))
    const publicScore = random.nextInt(40, 86)
    const origin = source === 'INTERNATIONAL_CLUB' ? 'international' : source === 'ACADEMY_YOUTH' ? 'academy' : 'preCollege'
    return {
      id: `recruit-profile:${cycleId}:${candidateKey ?? player.id}`,
      playerId: player.id,
      cycleId,
      origin,
      position: player.basketball.primaryPosition,
      prospectGroup: 'seniorOrTwoYear',
      education: prospectEducation(supplied.world, cycle),
      publicRank: index + 1,
      positionRank: 1 + candidates.slice(0, index).filter((item) => item.basketball.primaryPosition === player.basketball.primaryPosition).length,
      tier: publicScore >= 72 ? 'elite' : publicScore >= 62 ? 'strong' : publicScore >= 52 ? 'rotation' : 'developmental',
      preferences: { opportunity: random.nextInt(1, 10), development: random.nextInt(1, 10), competing: random.nextInt(1, 10), coach: random.nextInt(1, 10) },
      recruitingRpg: createRecruitingRpg(random, programIds),
      status: 'open',
    }
  })
  return updateGameWorld(supplied.world, { recruitProfiles: [...Object.values(supplied.world.recruitProfilesById), ...profiles] })
}

function latestPlayerPathway(history: readonly PlayerPathwayRecord[] | undefined): PlayerPathwayRecord | undefined {
  return history?.at(-1)
}

function playerPathwaySource(world: GameWorld, player: GameWorld['players'][keyof GameWorld['players']]): PlayerPathwaySource | undefined {
  if (Object.values(world.playerRegistrationsById).some((item) => item.playerId === player.id && item.cause !== 'RELEASE')) return 'ACADEMY_YOUTH'
  const explicit = latestPlayerPathway(player.pathwayHistory)
  if (explicit !== undefined) return explicit.source
  if (Object.values(world.ecosystemTransitionsById).some((item) => item.playerId === player.id && world.ecosystems[item.fromEcosystemId]?.kind === 'fibaLike')) return 'INTERNATIONAL_CLUB'
  return undefined
}

/** Discovers one latent BS15B candidate through a recruiting action, preserving its canonical PlayerId. */
export function materializeRecruitingTalentCandidate(world: GameWorld, cycleId: string, cohortId: string, candidateIndex: number): RecruitingResult<GameWorld> {
  const cycle = world.recruitingCyclesById[cycleId]
  const cohort = world.talentCohortsById[cohortId]
  if (cycle?.status !== 'open' || !cohort) return { ok: false, reason: 'INVALID_RECRUIT' }
  const candidateKey = `${cohortId}:candidate:${candidateIndex.toString().padStart(6, '0')}`
  const existing = Object.values(world.recruitProfilesById).find((profile) => profile.cycleId === cycleId && profile.playerId === world.talentMaterializationsByCandidateKey[candidateKey]?.playerId)
  if (existing) return { ok: true, value: world }
  const materialized = materializeTalentCandidates(world, [{ cohortId, candidateIndex, cause: 'RECRUITING_POOL' }])
  const player = materialized.players[0]!
  const random = new SeededRandomSource(hashStringToSeed(`recruiting-profile:${cycleId}:${candidateKey}`))
  const programs = Object.values(materialized.world.competitions).filter((competition) => competition.ecosystemId === cycle.ecosystemId).flatMap((competition) => competition.participantTeamIds)
  const profiles = Object.values(materialized.world.recruitProfilesById).filter((profile) => profile.cycleId === cycleId)
  const publicScore = random.nextInt(40, 86)
  const source = playerPathwaySource(materialized.world, player)
  const origin = source === 'INTERNATIONAL_CLUB' ? 'international' : source === 'ACADEMY_YOUTH' ? 'academy' : 'preCollege'
  const profile: RecruitProfile = { id: `recruit-profile:${cycleId}:${candidateKey}`, playerId: player.id, cycleId, origin, position: player.basketball.primaryPosition, prospectGroup: 'seniorOrTwoYear', education: prospectEducation(materialized.world, cycle), publicRank: profiles.length + 1, positionRank: 1 + profiles.filter((item) => item.position === player.basketball.primaryPosition).length, tier: publicScore >= 72 ? 'elite' : publicScore >= 62 ? 'strong' : publicScore >= 52 ? 'rotation' : 'developmental', preferences: { opportunity: random.nextInt(1, 10), development: random.nextInt(1, 10), competing: random.nextInt(1, 10), coach: random.nextInt(1, 10) }, recruitingRpg: createRecruitingRpg(random, programs), status: 'open' }
  return { ok: true, value: updateGameWorld(materialized.world, { recruitProfiles: [...Object.values(materialized.world.recruitProfilesById), profile] }) }
}

/** Bounded user/AI discovery: select and materialize at most one compatible cohort candidate. */
export function discoverRecruitingTalentCandidate(world: GameWorld, cycleId: string, programTeamId?: TeamId): RecruitingResult<GameWorld> {
  const cycle = world.recruitingCyclesById[cycleId]
  const ecosystem = cycle && world.ecosystems[cycle.ecosystemId]
  if (cycle?.status !== 'open' || ecosystem?.kind !== 'ncaaLike') return { ok: false, reason: 'INVALID_RECRUIT' }
  const cohorts = Object.values(world.talentCohortsById).filter((item) => item.candidateCapacity > 0 && item.gender === (ecosystem.category === 'men' ? 'male' : 'female')).sort((a, b) => b.birthYear - a.birthYear || a.id.localeCompare(b.id))
  for (const cohort of cohorts) {
    const used = new Set(Object.keys(world.talentMaterializationsByCandidateKey).filter((key) => key.startsWith(`${cohort.id}:candidate:`)).map((key) => Number(key.slice(key.lastIndexOf(':') + 1))))
    const first = hashStringToSeed(`recruiting-discovery-v1:${cycleId}:${cohort.id}`) % cohort.candidateCapacity + 1
    let index = first
    for (let attempt = 0; attempt <= used.size && used.has(index); attempt += 1) index = index % cohort.candidateCapacity + 1
    if (used.has(index)) continue
    const materialized = materializeRecruitingTalentCandidate(world, cycleId, cohort.id, index)
    if (!materialized.ok) continue
    const profile = Object.values(materialized.value.recruitProfilesById).find((item) => item.cycleId === cycleId && item.playerId === materialized.value.talentMaterializationsByCandidateKey[`${cohort.id}:candidate:${index.toString().padStart(6, '0')}`]?.playerId)
    if (!profile) continue
    let discovered = materialized.value
    if (programTeamId !== undefined) {
      const team = discovered.teams[programTeamId]
      const staffId = staffForRecruiting(discovered, programTeamId).recruiterId
      if (!team || staffId === undefined || !discovered.staffPeopleById[staffId as keyof typeof discovered.staffPeopleById]) return { ok: false, reason: 'RECRUITING_STAFF_REQUIRED' }
      const organizationId = organizationIdForTeam(programTeamId)
      const alreadyAware = Object.values(discovered.organizationPlayerAwarenessById).some((item) => item.organizationId === organizationId && item.playerId === profile.playerId)
      discovered = addRecruitingBoardEntry(discovered, { programTeamId, recruitId: profile.id, priority: 'normal' })
      if (!alreadyAware) discovered = updateGameWorld(discovered, { organizationPlayerAwareness: [...Object.values(discovered.organizationPlayerAwarenessById), createOrganizationPlayerAwareness({ id: `player-awareness:${organizationId}:${profile.playerId}`, organizationId, playerId: profile.playerId, discoveredAt: discovered.currentDate, source: 'RECRUITING_DISCOVERY', discoveredByStaffId: staffId as StaffPersonId, territory: { kind: 'COUNTRY', countryId: discovered.players[profile.playerId]!.nationalityId } })] })
    }
    return { ok: true, value: discovered }
  }
  return { ok: false, reason: 'NO_UNDISCOVERED_TALENT' }
}
