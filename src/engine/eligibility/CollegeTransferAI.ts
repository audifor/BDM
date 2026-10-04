import { basketballTransferWindow, isWithinTransferWindow } from '@/domain/eligibility'
import { addYears } from '@/domain/date'
import { availableInstitutionBenefitsRoom, createAthleticsAidAgreement, type SettlementBenefitsAgreement } from '@/domain/collegeCompensation'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { getPlayerSeasonStats, calculatePlayerStatAverages } from '@/engine/stats/PlayerHistory'
import { addTransferRecruitToCycle, completeCollegeTransfer, makeRecruitingOffer, performRecruitingAction, progressAiNegotiation, promiseRecruitingRole, rankAiRecruitingTargets, resolveRecruitingCommitments, signCommittedRecruit, getTeamRecruitingNeeds } from '@/engine/recruiting/RecruitingEngine'
import { assessCollegeContinuation, recordCollegeContinuationAssessment } from './CollegeContinuationAssessment'
import { signInstitutionBenefits, signInstitutionalAthleticsAid } from './CollegeCompensationEngine'
import { completeTransferEducationModule, processTransferPortalEntry, submitTransferNotice } from './TransferPortalLifecycle'

function benefitsCapYear(date: string): string {
  const start = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0)
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** Runs one deterministic NCAA continuation and Portal pass through the same actions used by the user. */
export function runCollegeRosterContinuationAndTransferAI(world: GameWorld, cycleId: string): GameWorld {
  const cycle = world.recruitingCyclesById[cycleId]
  const season = cycle === undefined ? undefined : world.seasons[cycle.sourceSeasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  const rules = cycle === undefined ? undefined : Object.values(world.transferPortalRulesetsById).filter((item) => item.ecosystemId === cycle.ecosystemId && item.effectiveFrom <= world.currentDate).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
  const final = season === undefined ? undefined : Object.values(world.games).filter((game) => game.seasonId === season.id && game.competitionId === competition?.id && game.stakes === 'final' && game.status === 'completed').sort((a, b) => b.date.localeCompare(a.date))[0]
  if (cycle?.status !== 'open' || season === undefined || competition === undefined || world.ecosystems[cycle.ecosystemId]?.kind !== 'ncaaLike' || rules === undefined || final === undefined) return world
  const window = basketballTransferWindow(final.date, rules)
  if (!isWithinTransferWindow(world.currentDate, window)) return world
  const userTeamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)?.id
  let next = world
  for (const sourceId of [...competition.participantTeamIds].sort()) {
    if (sourceId === userTeamId) continue
    const source = next.teams[sourceId]
    if (source === undefined) continue
    const ownPriority = (playerId: typeof source.rosterPlayerIds[number]) => {
      const risk = assessCollegeContinuation(next, playerId, sourceId, season.id)
      const production = calculatePlayerStatAverages(getPlayerSeasonStats(next, playerId, season.id))
      const knowledge = deriveOrganizationPlayerValuation({ organizationId: source.organizationId, playerId, knowledge: next.organizationKnowledge, currentDate: next.currentDate, context: 'RECRUITING', publicPosition: next.players[playerId]!.basketball.primaryPosition, policy: next.organizationEvaluationPoliciesById[source.organizationId] })
      return (risk === undefined ? 0 : risk.leavePressure - risk.stayPressure) * 1_000 + production.mpg + knowledge.priorityScore
    }
    for (const playerId of [...source.rosterPlayerIds].sort((a, b) => ownPriority(b) - ownPriority(a) || a.localeCompare(b))) {
      if (Object.values(next.transferPortalEntriesById).some((item) => item.playerId === playerId && item.ecosystemId === cycle.ecosystemId)) continue
      let assessment = assessCollegeContinuation(next, playerId, sourceId, season.id)
      if (assessment === undefined || assessment.tone === 'content') continue
      next = recordCollegeContinuationAssessment(next, assessment)
      const cap = Object.values(next.institutionBenefitsCapsById).find((item) => item.institutionId === source.organizationId && item.capYear === benefitsCapYear(next.currentDate))
      const room = cap === undefined ? 0 : availableInstitutionBenefitsRoom(cap, Object.values(next.settlementBenefitsAgreementsById))
      const alreadySupported = Object.values(next.settlementBenefitsAgreementsById).some((item) => item.playerId === playerId && item.teamId === sourceId && item.status === 'signed')
      if (room >= 100_000 && !alreadySupported) {
        const value = Math.min(room, 250_000)
        const agreement: SettlementBenefitsAgreement = { id: `ai-retention:${cycleId}:${playerId}`, playerId, teamId: sourceId, institutionId: source.organizationId, capYear: cap!.capYear, valueMinorUnits: value, effectiveFrom: next.currentDate, effectiveTo: season.endDate, status: 'draft', reportingStatus: 'notSigned', provenance: `AI_CONTINUATION:${assessment.tone}` }
        const signed = signInstitutionBenefits(next, agreement)
        if (signed.ok) next = signed.world
      }
      assessment = assessCollegeContinuation(next, playerId, sourceId, season.id)
      if (assessment === undefined || assessment.leavePressure <= assessment.stayPressure + 1) continue
      const notice = submitTransferNotice(next, { id: `ai-portal:${cycleId}:${playerId}`, playerId, sourceTeamId: sourceId, ecosystemId: cycle.ecosystemId, rulesetId: rules.id }, window)
      if (!notice.ok) continue
      const module = completeTransferEducationModule(notice.world, `ai-portal:${cycleId}:${playerId}`)
      if (!module.ok) continue
      const authorized = processTransferPortalEntry(module.world, `ai-portal:${cycleId}:${playerId}`)
      if (!authorized.ok) continue
      next = authorized.world
    }
  }
  for (const entry of Object.values(next.transferPortalEntriesById).filter((item) => item.ecosystemId === cycle.ecosystemId && item.status === 'authorized').sort((a, b) => a.id.localeCompare(b.id))) {
    const added = addTransferRecruitToCycle(next, cycleId, entry.id)
    if (!added.ok) continue
    next = added.value
    const recruitId = `transfer-recruit:${entry.id}`
    const destinations = [...competition.participantTeamIds].filter((id) => id !== userTeamId && id !== entry.sourceTeamId && next.teams[id] !== undefined).sort((a, b) => {
      const position = next.players[entry.playerId]!.basketball.primaryPosition
      const need = getTeamRecruitingNeeds(next, b)[position] - getTeamRecruitingNeeds(next, a)[position]
      if (need !== 0) return need
      const aRank = rankAiRecruitingTargets(next, cycleId, a).findIndex((item) => item.id === recruitId)
      const bRank = rankAiRecruitingTargets(next, cycleId, b).findIndex((item) => item.id === recruitId)
      return aRank - bRank || a.localeCompare(b)
    })
    for (const destinationId of destinations) {
      if (Object.values(next.recruitingOffersById).some((item) => item.recruitId === recruitId && item.programTeamId === destinationId)) continue
      const contact = performRecruitingAction(next, cycleId, recruitId, destinationId, 'contact')
      if (!contact.ok) continue
      const pitch = performRecruitingAction(contact.value, cycleId, recruitId, destinationId, 'pitch')
      next = pitch.ok ? pitch.value : contact.value
      const offer = makeRecruitingOffer(next, cycleId, recruitId, destinationId)
      if (!offer.ok) continue
      next = offer.value
      const promise = promiseRecruitingRole(next, cycleId, recruitId, destinationId, 'expectation')
      if (promise.ok) next = promise.value
      next = progressAiNegotiation(next, cycleId, recruitId, destinationId)
      const targetSeason = next.seasons[cycle.targetSeasonId] ?? { label: `${Number(season.label.slice(0, 4)) + 1}-${String((Number(season.label.slice(0, 4)) + 2) % 100).padStart(2, '0')}`, startDate: addYears(season.startDate, 1), endDate: addYears(season.endDate, 1) }
      const destination = next.teams[destinationId]!
      {
        const aidId = `ai-transfer-aid:${cycleId}:${entry.playerId}:${destinationId}`
        if (next.athleticsAidAgreementsById[aidId] === undefined) next = updateGameWorld(next, { athleticsAidAgreements: [...Object.values(next.athleticsAidAgreementsById), createAthleticsAidAgreement({ id: aidId, playerId: entry.playerId, teamId: destinationId, institutionId: destination.organizationId, academicPeriod: targetSeason.label, valueMinorUnits: 100_000, effectiveFrom: targetSeason.startDate, effectiveTo: targetSeason.endDate, offeredOn: next.currentDate, status: 'offered', provenance: 'AI_TRANSFER_RECRUITING', history: [] })] })
        const cap = Object.values(next.institutionBenefitsCapsById).find((item) => item.institutionId === destination.organizationId && item.capYear === benefitsCapYear(next.currentDate))
        const room = cap === undefined ? 0 : availableInstitutionBenefitsRoom(cap, Object.values(next.settlementBenefitsAgreementsById))
        const benefitsId = `ai-transfer-benefits:${cycleId}:${entry.playerId}:${destinationId}`
        if (cap !== undefined && room >= 100_000 && next.settlementBenefitsAgreementsById[benefitsId] === undefined) next = updateGameWorld(next, { settlementBenefitsAgreements: [...Object.values(next.settlementBenefitsAgreementsById), { id: benefitsId, playerId: entry.playerId, teamId: destinationId, institutionId: destination.organizationId, capYear: cap.capYear, valueMinorUnits: Math.min(room, 150_000), effectiveFrom: targetSeason.startDate, effectiveTo: targetSeason.endDate, status: 'draft' as const, reportingStatus: 'notSigned' as const, provenance: 'AI_TRANSFER_RECRUITING' }] })
      }
      break
    }
    next = resolveRecruitingCommitments(next, cycleId)
    const commitment = Object.values(next.recruitingCommitmentsById).find((item) => item.recruitId === recruitId)
    if (commitment === undefined) continue
    const aid = next.athleticsAidAgreementsById[`ai-transfer-aid:${cycleId}:${entry.playerId}:${commitment.programTeamId}`]
    if (aid !== undefined && aid.status === 'offered') { const signedAid = signInstitutionalAthleticsAid(next, aid); if (signedAid.ok) next = signedAid.world }
    const benefits = next.settlementBenefitsAgreementsById[`ai-transfer-benefits:${cycleId}:${entry.playerId}:${commitment.programTeamId}`]
    if (benefits !== undefined && benefits.status === 'draft') { const signedBenefits = signInstitutionBenefits(next, benefits); if (signedBenefits.ok) next = signedBenefits.world }
    const signed = signCommittedRecruit(next, cycleId, recruitId)
    if (!signed.ok) continue
    next = signed.value
    const moved = completeCollegeTransfer(next, recruitId)
    if (moved.ok) next = moved.value
  }
  return next
}
