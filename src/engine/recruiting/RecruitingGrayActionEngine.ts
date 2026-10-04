import type { RecruitingClaimTruth, RecruitingGrayLegality, RecruitingGrayTactic, RecruitingNegativeEvidenceSource } from '@/domain/recruiting'
import type { TeamId } from '@/domain/ids'
import { calculateStaffWorkload, updateGameWorld, type GameWorld } from '@/domain/world'
import { hashStringToSeed } from '@/engine/random'
import { ensureNcaaEnforcement, openInvestigation, reportViolation } from '@/engine/enforcement'
import { canPerformRecruitingAction } from './RecruitingPermission'
import type { RecruitingResult } from './RecruitingEngine'

/** A bounded, categorical negative pitch. It never accepts allegation text or rival private state. */
export function performRecruitingGrayAction(world: GameWorld, cycleId: string, recruitId: string, programTeamId: TeamId, input: { readonly tactic: RecruitingGrayTactic; readonly targetProgramTeamId: TeamId; readonly evidenceSource: RecruitingNegativeEvidenceSource; readonly staffPersonId?: string }): RecruitingResult<GameWorld> {
  const cycle = world.recruitingCyclesById[cycleId]
  const profile = world.recruitProfilesById[recruitId]
  if (!cycle || !profile || profile.cycleId !== cycleId || profile.status !== 'open' || input.targetProgramTeamId === programTeamId || world.teams[input.targetProgramTeamId] === undefined) return { ok: false, reason: 'INVALID_RECRUIT' }
  if (profile.recruitingRpg === undefined) return { ok: false, reason: 'RECRUITING_RPG_REQUIRED' }
  const isNCAA = world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike'
  const staff = input.staffPersonId ?? Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === programTeamId && ['recruitingCoordinator','positionalRecruiter','assistantCoach','associateCoach'].includes(assignment.role))?.staffPersonId ?? world.coaches[world.teams[programTeamId]?.coachId as keyof typeof world.coaches]?.staffProfileId
  if (staff === undefined || world.staffPeopleById[staff as keyof typeof world.staffPeopleById] === undefined || isNCAA && !Object.values(world.teamStaffAssignmentsById).some((assignment) => assignment.teamId === programTeamId && assignment.staffPersonId === staff)) return { ok: false, reason: 'RECRUITING_STAFF_REQUIRED' }
  if (isNCAA) { const workload = calculateStaffWorkload(world, staff as never); if (workload.overloaded || workload.totalCapacityUsed + 1 > workload.capacityLimit) return { ok: false, reason: 'STAFF_WORKLOAD_CAPACITY_EXHAUSTED' } }
  const illegal = input.tactic === 'impermissibleContact' || input.tactic === 'impermissibleInducement'
  const permission = canPerformRecruitingAction({ date: world.currentDate, isNCAA, calendar: cycle.calendar, category: world.ecosystems[cycle.ecosystemId]?.category, prospectGroup: profile.prospectGroup, education: profile.education, action: illegal ? 'inPersonContact' : 'correspondence', location: illegal ? 'offCampus' : undefined, signedWithOtherProgram: Object.values(world.recruitSigningsById).some((signing) => signing.recruitId === recruitId && signing.programTeamId !== programTeamId), releasedFromContactProhibition: profile.contactReleasedFromProgramId !== undefined })
  if (!permission.allowed && !illegal) return { ok: false, reason: permission.reasonCode }
  const records = Object.values(world.recruitingActionHistoryById)
  const dailyUsed = records.filter((item) => item.staffPersonId === staff && item.date === world.currentDate).reduce((sum, item) => sum + item.cost, 0)
  const staffLimit = cycle.rules.staffDailyCapacity ?? 6
  const cost = cycle.rules.costs.pitch
  if (dailyUsed + cost > staffLimit) return { ok: false, reason: 'STAFF_RECRUITING_CAPACITY_EXHAUSTED' }
  const capacity = world.recruitingCapacityByProgramId[programTeamId] ?? cycle.rules.periodCapacity
  if (capacity < cost) return { ok: false, reason: 'INSUFFICIENT_RECRUITING_CAPACITY' }

  const rivalDepth = world.teams[input.targetProgramTeamId]?.rosterPlayerIds.filter((id) => world.players[id]?.basketball.primaryPosition === profile.position).length ?? 0
  const hasOwnIntel = profile.recruitingRpg?.intel.some((intel) => intel.programTeamId === programTeamId && Object.keys(intel.beliefs).length > 0) ?? false
  if (input.tactic === 'rivalConcern' && (input.evidenceSource !== 'publicRoster' || rivalDepth < 2)) return { ok: false, reason: 'RIVAL_CONCERN_NOT_SUPPORTED' }
  if (input.tactic === 'selectiveFraming' && input.evidenceSource !== 'publicRoster' && !(input.evidenceSource === 'ownRecruitingIntel' && hasOwnIntel)) return { ok: false, reason: 'RECRUITING_EVIDENCE_REQUIRED' }
  if (input.evidenceSource === 'ownRecruitingIntel' && !hasOwnIntel) return { ok: false, reason: 'RECRUITING_EVIDENCE_REQUIRED' }

  const truth: RecruitingClaimTruth = input.tactic === 'rivalConcern' ? 'FACTUAL'
    : input.tactic === 'selectiveFraming' ? 'SELECTIVE'
      : input.tactic === 'exaggeratedClaim' || input.tactic === 'deadlineBluff' ? 'EXAGGERATED'
        : 'UNSUPPORTED'
  const legality: RecruitingGrayLegality = illegal ? 'RULE_VIOLATION'
    : truth === 'FACTUAL' ? 'LEGAL_FACTUAL'
      : truth === 'SELECTIVE' ? 'LEGAL_AGGRESSIVE' : 'MISLEADING'
  const priorEvents = Object.values(world.recruitProfilesById).flatMap((item) => item.recruitingRpg?.negativeEvents ?? []).filter((event) => event.programTeamId === programTeamId)
  if (profile.recruitingRpg.negativeEvents?.some((event) => event.date === world.currentDate && event.programTeamId === programTeamId && event.targetProgramTeamId === input.targetProgramTeamId && event.tactic === input.tactic && event.evidenceSource === input.evidenceSource)) return { ok: true, value: world }
  const teamAssignments = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.teamId === programTeamId)
  const professionalism = world.staffPeopleById[staff as keyof typeof world.staffPeopleById]?.professional.attributes.discipline ?? 50
  const scrutiny = world.programComplianceByProgramId[programTeamId]?.resolvedFindingCount ?? 0
  const baseRisk = illegal ? 62 : truth === 'FACTUAL' ? 10 : truth === 'SELECTIVE' ? 22 : truth === 'EXAGGERATED' ? 38 : 48
  const detectionRisk = Math.max(5, Math.min(85, baseRisk + (input.evidenceSource === 'publicRoster' ? 14 : 0) + Math.min(18, teamAssignments.length * 2) + Math.min(18, priorEvents.length * 5) + Math.min(15, scrutiny * 5) + Math.round((50 - professionalism) / 4)))
  const id = `recruiting-gray:${cycleId}:${programTeamId}:${recruitId}:${world.currentDate}:${priorEvents.length}`
  const detectionRoll = hashStringToSeed(`${world.currentDate}:${cycleId}:${programTeamId}:${recruitId}:${input.targetProgramTeamId}:${input.tactic}:${input.evidenceSource}:${priorEvents.length}:${scrutiny}`) % 100
  const detected = detectionRoll < detectionRisk
  const shortTermEffect = truth === 'FACTUAL' ? 3 : truth === 'SELECTIVE' ? 4 : truth === 'EXAGGERATED' ? 6 : 7
  const credibilityEffect = truth === 'FACTUAL' ? 1 : truth === 'SELECTIVE' ? -2 : truth === 'EXAGGERATED' ? -5 : -8
  const stakeholderEffect = truth === 'FACTUAL' ? 1 : truth === 'SELECTIVE' ? 1 : -3
  const event = { id, programTeamId, targetProgramTeamId: input.targetProgramTeamId, tactic: input.tactic, truth, legality, evidenceSource: input.evidenceSource, date: world.currentDate, shortTermEffect, credibilityEffect, stakeholderEffect, detectionRisk, detectionRoll, detected }
  const rpg = profile.recruitingRpg
  const actorRelationship = rpg.relationships.find((item) => item.programTeamId === programTeamId && item.actor === 'program')
  const rivalRelationship = rpg.relationships.find((item) => item.programTeamId === input.targetProgramTeamId && item.actor === 'program')
  const relationships = rpg.relationships.map((item) => {
    if (item === actorRelationship) return { ...item, trust: Math.max(0, Math.min(100, item.trust + (detected ? credibilityEffect * 2 : credibilityEffect))), credibility: Math.max(0, Math.min(100, item.credibility + credibilityEffect)), updatedOn: world.currentDate }
    if (item === rivalRelationship) return { ...item, trust: Math.max(0, Math.min(100, item.trust - shortTermEffect)), updatedOn: world.currentDate }
    return item
  })
  if (!actorRelationship) relationships.push({ programTeamId, actor: 'program', familiarity: 0, rapport: 0, trust: Math.max(0, Math.min(100, 50 + (detected ? credibilityEffect * 2 : credibilityEffect))), credibility: Math.max(0, Math.min(100, 50 + credibilityEffect)), updatedOn: world.currentDate })
  if (!rivalRelationship) relationships.push({ programTeamId: input.targetProgramTeamId, actor: 'program', familiarity: 0, rapport: 0, trust: 50 - shortTermEffect, credibility: 50, updatedOn: world.currentDate })
  const stakeholders = rpg.stakeholders.map((item) => ({ ...item, attitudeByProgram: { ...item.attitudeByProgram, [String(programTeamId)]: Math.max(-100, Math.min(100, (item.attitudeByProgram[String(programTeamId)] ?? 0) + stakeholderEffect)) } }))
  const nextProfile = { ...profile, recruitingRpg: { ...rpg, relationships, stakeholders, negativeEvents: [...(rpg.negativeEvents ?? []), event], story: [...rpg.story, `${world.currentDate}: a ${legality.toLowerCase().replaceAll('_',' ')} recruiting tactic was used; risk ${detectionRisk}%, detected ${detected}.`].slice(-24) } }
  const history = { id: `recruiting-action:${id}`, cycleId, recruitId, programTeamId, kind: 'negativeRecruiting' as const, date: world.currentDate, cost, effect: shortTermEffect, staffPersonId: staff, offCampus: false }
  const interest = world.recruitingInterests.find((item) => item.recruitId === recruitId && item.programTeamId === programTeamId)?.value ?? 0
  let next = updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById).filter((item) => item.id !== recruitId), nextProfile], recruitingInterests: [...world.recruitingInterests.filter((item) => item.recruitId !== recruitId || item.programTeamId !== programTeamId), { recruitId, programTeamId, value: Math.max(0, Math.min(100, interest + shortTermEffect)) }], recruitingActionHistory: [...records, history], recruitingCapacityByProgramId: { ...world.recruitingCapacityByProgramId, [programTeamId]: capacity - cost } })
  if (detected && legality === 'RULE_VIOLATION') {
    next = ensureNcaaEnforcement(next)
    next = reportViolation(next, { id: `violation:${id}`, ecosystemId: cycle.ecosystemId, programTeamId, category: 'recruiting', severity: input.tactic === 'impermissibleInducement' ? 'major' : 'minor', source: id, playerId: profile.playerId })
    const violationId = `violation:${id}`
    next = openInvestigation(next, violationId)
    const investigationId = `investigation:${violationId}`
    const saved = { ...next.recruitProfilesById[recruitId]!, recruitingRpg: { ...next.recruitProfilesById[recruitId]!.recruitingRpg!, negativeEvents: next.recruitProfilesById[recruitId]!.recruitingRpg!.negativeEvents?.map((item) => item.id === id ? { ...item, violationId, ...(next.investigationsById[investigationId] === undefined ? {} : { investigationId }) } : item) } }
    next = updateGameWorld(next, { recruitProfiles: [...Object.values(next.recruitProfilesById).filter((item) => item.id !== recruitId), saved] })
  }
  return { ok: true, value: next }
}
