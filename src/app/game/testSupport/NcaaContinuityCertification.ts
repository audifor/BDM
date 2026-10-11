import type { GameWorld } from '@/domain/world'
import { assessCollegeEligibility, evaluatePlayerEligibility, getEligiblePlayersForCompetition } from '@/engine/eligibility'
import { MINIMUM_MATCH_SQUAD_SIZE } from '@/engine/match'
import { addYears } from '@/domain/date'

/** Derived diagnostics only: no roster, enrollment, or eligibility mutation. */
export function collectNcaaContinuity(world: GameWorld) {
  const enrollments = Object.values(world.playerEnrollmentsById)
  const profiles = Object.values(world.academicProfilesById)
  const terms = Object.values(world.academicTermRecordsById)
  const signings = Object.values(world.recruitSigningsById)
  const recruits = Object.values(world.recruitProfilesById)
  const portal = Object.values(world.transferPortalEntriesById)
  const transitions = Object.values(world.ecosystemTransitionsById)
  const cycles = Object.values(world.recruitingCyclesById)
  const latestTerm = terms.map(item => item.termId).sort().at(-1)
  const periodStart = addYears(world.currentDate, -1)
  const teams = Object.values(world.competitions).filter(competition => world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike').flatMap(competition => {
    const season = Object.values(world.seasons).filter(item => item.competitionId === competition.id && item.startDate <= world.currentDate).sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
      ?? Object.values(world.seasons).filter(item => item.competitionId === competition.id).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]!
    return competition.participantTeamIds.map(teamId => {
      const roster = world.teams[teamId]!.rosterPlayerIds
      const assessments = roster.map(playerId => ({ playerId, assessment: assessCollegeEligibility(world, { playerId, teamId, ecosystemId: competition.ecosystemId }), eligibility: evaluatePlayerEligibility(world, { playerId, teamId, competitionId: competition.id, seasonId: season.id }) }))
      const reasons: Record<string, number> = {}
      for (const item of assessments) for (const reason of item.assessment?.reasons ?? ['RULESET_UNAVAILABLE']) if (reason !== 'ELIGIBLE') reasons[reason] = (reasons[reason] ?? 0) + 1
      const eligible = getEligiblePlayersForCompetition(world, teamId, competition.id, season.id, world.currentDate).length
      const ownSignings = signings.filter(item => item.programTeamId === teamId)
      const ownEnrollments = enrollments.filter(item => item.teamId === teamId && item.status === 'active' && item.startsOn <= world.currentDate)
      return { teamId, competitionId: competition.id, seasonId: season.id, rostered: roster.length, enrolled: ownEnrollments.length,
        academicEligible: assessments.filter(item => item.assessment !== undefined && !item.assessment.reasons.includes('ACADEMIC_REQUIREMENT_NOT_MET')).length,
        academicIneligible: assessments.filter(item => item.assessment?.reasons.includes('ACADEMIC_REQUIREMENT_NOT_MET')).length,
        eligible, minimumRequired: MINIMUM_MATCH_SQUAD_SIZE, deficit: Math.max(0, MINIMUM_MATCH_SQUAD_SIZE - eligible), reasons,
        missingAcademicProfiles: roster.filter(playerId => !profiles.some(profile => profile.playerId === playerId && profile.programTeamId === teamId)).length,
        staleAcademicProfiles: latestTerm === undefined ? 0 : roster.filter(playerId => ownEnrollments.some(item => item.playerId === playerId && item.startsOn <= `${latestTerm.split(':')[1]}-${latestTerm.split(':')[2]}-01`) && !terms.some(term => term.playerId === playerId && term.termId === latestTerm)).length,
        activeAcademicRestrictions: roster.filter(playerId => Object.values(world.eligibilityRestrictionsById).some(item => item.playerId === playerId && item.sourceType === 'academic' && item.startsAt <= world.currentDate && (item.endsAt === undefined || item.endsAt >= world.currentDate))).length,
        incomingSigned: ownSignings.filter(item => world.recruitProfilesById[item.recruitId]?.status === 'incoming').length,
        signedTotal: ownSignings.length, successfulArrivals: ownSignings.filter(item => world.recruitProfilesById[item.recruitId]?.status === 'arrived').length,
        transfersOut: portal.filter(item => item.sourceTeamId === teamId && item.status === 'completed').length,
        transfersIn: portal.filter(item => item.movement?.destinationTeamId === teamId && item.status === 'completed').length,
        proExits: transitions.filter(item => item.fromTeamId === teamId && ['ncaaToNbaDraft', 'ncaaToNbaUndrafted', 'ncaaToFiba'].includes(item.transitionType)).length,
        exhausted: assessments.filter(item => item.eligibility.reasons.includes('ELIGIBILITY_EXHAUSTED')).length,
        activeEnrollments: ownEnrollments.map(item => ({ playerId: item.playerId, startsOn: item.startsOn })),
      }
    })
  })
  const total = (key: 'rostered'|'enrolled'|'academicEligible'|'academicIneligible'|'eligible'|'incomingSigned'|'signedTotal'|'successfulArrivals'|'transfersOut'|'transfersIn'|'proExits'|'exhausted'|'missingAcademicProfiles'|'staleAcademicProfiles'|'activeAcademicRestrictions') => teams.reduce((sum, team) => sum + team[key], 0)
  const reasons: Record<string, number> = {}
  for (const team of teams) for (const [reason, count] of Object.entries(team.reasons)) reasons[reason] = (reasons[reason] ?? 0) + count
  const ineligible = total('rostered') - total('eligible')
  return { date: world.currentDate, rostered: total('rostered'), enrolled: total('enrolled'), academicEligible: total('academicEligible'), academicIneligible: total('academicIneligible'), eligible: total('eligible'), incomingSigned: total('incomingSigned'), signedTotal: total('signedTotal'), successfulArrivals: total('successfulArrivals'), transfersOut: total('transfersOut'), transfersIn: total('transfersIn'), proExits: total('proExits'), exhausted: total('exhausted'), missingAcademicProfiles: total('missingAcademicProfiles'), staleAcademicProfiles: total('staleAcademicProfiles'), activeAcademicRestrictions: total('activeAcademicRestrictions'), academicProfileCount: profiles.length, academicTermRecordCount: terms.length,
    recruitingPoolSize: recruits.length, materializedRecruitPlayers: new Set(recruits.map(item => item.playerId)).size,
    rawTalentCapacity: Object.values(world.talentCohortsById).reduce((sum, cohort) => sum + cohort.candidateCapacity, 0), talentMaterializations: Object.keys(world.talentMaterializationsByCandidateKey).length,
    periodStart, signedInPeriod: signings.filter(item => item.signedOn > periodStart && item.signedOn <= world.currentDate).length,
    arrivalsInPeriod: signings.filter(item => world.recruitProfilesById[item.recruitId]?.status === 'arrived' && (recruits.find(profile => profile.id === item.recruitId)?.origin === 'transfer' ? portal.find(entry => entry.playerId === item.playerId && entry.movement?.formalSigningId === item.id)?.movement?.transferredOn : world.seasons[item.targetSeasonId]?.startDate ?? '')! > periodStart).length,
    recruitingStatus: Object.fromEntries([...new Set(recruits.map(item => item.status))].map(status => [status, recruits.filter(item => item.status === status).length])),
    cycles: cycles.map(item => ({ id: item.id, sourceSeasonId: item.sourceSeasonId, targetSeasonId: item.targetSeasonId, status: item.status, opensOn: item.opensOn, signingOn: item.signingOn, closesOn: item.closesOn, institutionalPolicies: item.institutionalSigningPolicies?.length ?? 0 })),
    reasons: Object.entries(reasons).map(([reason, count]) => ({ reason, count, percentOfIneligible: ineligible === 0 ? 0 : count * 100 / ineligible })), teams }
}

export function assertNcaaViability(world: GameWorld): void {
  const deficits = collectNcaaContinuity(world).teams.filter(team => team.deficit > 0)
  if (deficits.length > 0) throw new Error(`NCAA eligible roster deficits at ${world.currentDate}: ${JSON.stringify(deficits.map(({ teamId, eligible, minimumRequired, deficit, reasons }) => ({ teamId, eligible, minimumRequired, deficit, reasons })))}`)
}
