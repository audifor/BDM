import type { GameWorld } from '@/domain/world'

/** Reconcile legacy program exits from retained source membership and exit events. */
export function documentedNcaaExits(world: GameWorld, baseline: GameWorld) {
  const admitted = new Set(Object.values(world.collegeEligibilityAssessmentsById).filter(item => item.eligible && item.evidence.enrollmentId !== undefined).map(item => item.evidence.enrollmentId!))
  const transitions = Object.values(world.ecosystemTransitionsById)
  const transactions = Object.values(world.playerTransactionsById)
  return Object.values(world.playerEnrollmentsById).flatMap<{ enrollmentId: string; playerId: string; endedOn: string; evidence: 'admissionAssessment' | 'sourceMembershipAndExit' }>(enrollment => {
    if (world.ecosystems[enrollment.ecosystemId]?.kind !== 'ncaaLike' || enrollment.status !== 'ended' || !enrollment.endsOn || enrollment.endsOn <= baseline.currentDate) return []
    if (admitted.has(enrollment.id)) return [{ enrollmentId: enrollment.id, playerId: enrollment.playerId, endedOn: enrollment.endsOn, evidence: 'admissionAssessment' as const }]
    // Failed admissions end immediately; they are not program departures.
    if (enrollment.startsOn === enrollment.endsOn) return []
    const source = baseline.playerEnrollmentsById[enrollment.id]
    if (!source || source.status !== 'active' || source.playerId !== enrollment.playerId || source.teamId !== enrollment.teamId || source.startsOn !== enrollment.startsOn || !baseline.teams[source.teamId]?.rosterPlayerIds.includes(source.playerId)) throw new Error(`Unproven legacy NCAA membership ${enrollment.id}`)
    const departures = transitions.filter(item => item.playerId === enrollment.playerId && item.fromTeamId === enrollment.teamId && item.fromEcosystemId === enrollment.ecosystemId && item.effectiveDate > baseline.currentDate)
    if (departures.some(item => item.effectiveDate < enrollment.endsOn!)) throw new Error(`Legacy NCAA enrollment outlasted its departure ${enrollment.id}`)
    const exit = departures.some(item => item.effectiveDate === enrollment.endsOn)
      || world.players[enrollment.playerId]?.careerEnd?.endedOn === enrollment.endsOn
      || transactions.some(item => item.id === `transaction:ncaaEligibilityExit:${enrollment.id}:${enrollment.endsOn}` && item.kind === 'ncaaEligibilityExit' && item.playerId === enrollment.playerId && item.fromTeamId === enrollment.teamId && item.occurredOn === enrollment.endsOn)
    if (!exit) throw new Error(`Unproven legacy NCAA exit ${enrollment.id}`)
    return [{ enrollmentId: enrollment.id, playerId: enrollment.playerId, endedOn: enrollment.endsOn, evidence: 'sourceMembershipAndExit' as const }]
  })
}
