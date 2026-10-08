import { addYears, type GameDate } from '@/domain/date'
import type { PlayerEnrollment } from '@/domain/eligibility'
import { playerTransactionIdFromString } from '@/domain/ids'
import { clearPlayerFromLineup } from '@/domain/tactics'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { assessCollegeEligibility, recordCollegeEligibilityAssessment, resolveCollegeRuleset } from './EligibilityEngine'

interface ExitCandidate { readonly enrollment: PlayerEnrollment; readonly birth: GameDate | undefined; readonly expiresOn?: GameDate; readonly participationExhausted: boolean }
interface ExitIndex { readonly profiles: GameWorld['eligibilityProfilesById']; readonly rules: GameWorld['collegeRulesetsById']; readonly effectiveRules: string; readonly candidates: readonly ExitCandidate[] }
const exitIndexes = new WeakMap<GameWorld['playerEnrollmentsById'], ExitIndex>()

/** Derived, disposable index: unchanged histories are not rescanned on every calendar day. */
function exitCandidates(world: GameWorld): readonly ExitCandidate[] {
  const effectiveRules = Object.values(world.ecosystems).filter(item => item.kind === 'ncaaLike').map(item => {
    const rule = resolveCollegeRuleset(world, item.id, world.currentDate)
    return `${rule?.id}:${rule?.eligibilityClock !== undefined && world.currentDate >= rule.eligibilityClock.effectiveFrom}`
  }).join('|')
  const cached = exitIndexes.get(world.playerEnrollmentsById)
  if (cached?.profiles === world.eligibilityProfilesById && cached.rules === world.collegeRulesetsById && cached.effectiveRules === effectiveRules
    && cached.candidates.every(item => item.birth === world.players[item.enrollment.playerId]?.bio.dateOfBirth)) return cached.candidates
  const candidates = Object.values(world.playerEnrollmentsById).filter(item => item.status === 'active' && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike').map(enrollment => {
    const assessment = assessCollegeEligibility(world, { playerId: enrollment.playerId, teamId: enrollment.teamId, ecosystemId: enrollment.ecosystemId })
    const rule = resolveCollegeRuleset(world, enrollment.ecosystemId, world.currentDate)
    const clockStart = assessment?.evidence.eligibilityClockStart
    return { enrollment, birth: world.players[enrollment.playerId]?.bio.dateOfBirth, participationExhausted: assessment?.reasons.includes('PARTICIPATION_LIMIT_REACHED') ?? false,
      ...(clockStart !== undefined && rule?.eligibilityClock !== undefined ? { expiresOn: addYears(clockStart, rule.eligibilityClock.periodYears) } : {}) }
  })
  exitIndexes.set(world.playerEnrollmentsById, { profiles: world.eligibilityProfilesById, rules: world.collegeRulesetsById, effectiveRules, candidates })
  return candidates
}

/** Permanent sporting eligibility ends program membership, never the person's career or academic history. */
export function progressCollegeEligibilityExits(world: GameWorld): GameWorld {
  let current = world
  for (const candidate of exitCandidates(world)) {
    const { enrollment } = candidate
    if (!candidate.participationExhausted && (candidate.expiresOn === undefined || candidate.expiresOn > world.currentDate)) continue
    if (enrollment.status !== 'active' || enrollment.startsOn > world.currentDate || world.ecosystems[enrollment.ecosystemId]?.kind !== 'ncaaLike'
      || !current.teams[enrollment.teamId]?.rosterPlayerIds.includes(enrollment.playerId)) continue
    const assessment = assessCollegeEligibility(current, { playerId: enrollment.playerId, teamId: enrollment.teamId, ecosystemId: enrollment.ecosystemId })
    if (!assessment?.reasons.some(reason => reason === 'ELIGIBILITY_CLOCK_EXPIRED' || reason === 'PARTICIPATION_LIMIT_REACHED')) continue
    current = recordCollegeEligibilityAssessment(current, { playerId: enrollment.playerId, teamId: enrollment.teamId, ecosystemId: enrollment.ecosystemId })
    const lineup = current.lineupsByTeamId[enrollment.teamId]
    current = updateGameWorld(current, {
      teams: Object.values(current.teams).map(team => team.id === enrollment.teamId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter(id => id !== enrollment.playerId) } : team),
      playerEnrollments: Object.values(current.playerEnrollmentsById).map(item => item.id === enrollment.id ? { ...item, status: 'ended' as const, endsOn: current.currentDate } : item),
      playerRegistrations: Object.values(current.playerRegistrationsById).map(item => item.playerId === enrollment.playerId && item.teamId === enrollment.teamId && item.endsOn === undefined ? { ...item, endsOn: current.currentDate } : item),
      ...(lineup ? { lineupsByTeamId: { ...current.lineupsByTeamId, [enrollment.teamId]: clearPlayerFromLineup(lineup, enrollment.playerId) } } : {}),
      transferPortalEntries: Object.values(current.transferPortalEntriesById).map(item => item.playerId === enrollment.playerId && ['noticePending', 'authorized'].includes(item.status) ? { ...item, status: 'withdrawn' as const } : item),
      recruitProfiles: Object.values(current.recruitProfilesById).map(item => item.playerId === enrollment.playerId && item.origin === 'transfer' && ['open', 'committed', 'incoming'].includes(item.status) ? { ...item, status: 'ineligible' as const } : item),
      playerTransactions: [...Object.values(current.playerTransactionsById), { id: playerTransactionIdFromString(`transaction:ncaaEligibilityExit:${enrollment.id}:${current.currentDate}`), playerId: enrollment.playerId, fromTeamId: enrollment.teamId, kind: 'ncaaEligibilityExit', occurredOn: current.currentDate }],
    })
  }
  return current
}

/** Read-only publication guard reuses the same permanent-exit facts as the lifecycle owner. */
export function assertCollegeRosterPermanentEligibility(world: GameWorld): void {
  for (const candidate of exitCandidates(world)) {
    const enrollment = candidate.enrollment
    if (!candidate.participationExhausted && (candidate.expiresOn === undefined || candidate.expiresOn > world.currentDate)) continue
    if (enrollment.startsOn > world.currentDate || !world.teams[enrollment.teamId]?.rosterPlayerIds.includes(enrollment.playerId)) continue
    const assessment = assessCollegeEligibility(world, { playerId: enrollment.playerId, teamId: enrollment.teamId, ecosystemId: enrollment.ecosystemId })
    if (assessment?.reasons.some(reason => reason === 'ELIGIBILITY_CLOCK_EXPIRED' || reason === 'PARTICIPATION_LIMIT_REACHED')) throw new Error(`Permanently ineligible NCAA roster Player ${enrollment.playerId}`)
  }
}
