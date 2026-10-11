import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

export interface TalentAttentionItem {
  readonly id: string
  readonly type: string
  readonly playerId: PlayerId
  readonly title: string
  readonly explanation: string
  readonly urgency: 'high' | 'normal' | 'low'
  readonly deadline?: GameDate
  readonly destination: { readonly app: 'player' | 'scouting' | 'recruiting' | 'portal' | 'draft'; readonly playerId: PlayerId; readonly playerView?: 'scouting' | 'history'; readonly focusPlayerId?: PlayerId }
  readonly source: string
}

export function buildTalentAttentionItems(world: GameWorld, userTeamId: TeamId | undefined = getUserTeam(world)?.id): readonly TalentAttentionItem[] {
  const team = userTeamId ? world.teams[userTeamId] : undefined
  const organizationId = team?.organizationId
  const items: TalentAttentionItem[] = []
  const reports = Object.values(world.evaluatorReportsById).filter((item) => organizationId !== undefined && item.organizationId === organizationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const report of reports.slice(0, 10)) items.push({ id: `report:${report.id}`, type: 'scouting-report', playerId: report.subjectPlayerId, title: 'Scouting report ready', explanation: 'A completed organization report is available for review.', urgency: 'normal', destination: { app: 'player', playerId: report.subjectPlayerId, playerView: 'scouting' }, source: `evaluatorReport:${report.id}` })
  if (organizationId) for (const awareness of Object.values(world.organizationPlayerAwarenessById).filter((item) => item.organizationId === organizationId)) {
    const evaluated = reports.some((report) => report.subjectPlayerId === awareness.playerId)
    if (!evaluated) items.push({ id: `discovery:${awareness.id}`, type: 'new-discovery', playerId: awareness.playerId, title: 'New Player discovered', explanation: 'This Player is known to your organization but has no completed Scouting report.', urgency: 'low', destination: { app: 'scouting', playerId: awareness.playerId, focusPlayerId: awareness.playerId }, source: `organizationAwareness:${awareness.id}` })
  }
  if (team) {
    for (const profile of Object.values(world.recruitProfilesById).filter((item) => world.recruitingBoards.some((entry) => entry.programTeamId === team.id && entry.recruitId === item.id))) {
      const active = profile.recruitingRpg?.negotiations?.filter((negotiation) => negotiation.programTeamId === team.id && negotiation.terminalState === 'active') ?? []
      for (const negotiation of active) for (const concern of negotiation.currentConcerns.filter((item) => item.status !== 'resolved')) items.push({ id: `concern:${concern.id}`, type: 'recruiting-concern', playerId: profile.playerId, title: 'Recruiting concern', explanation: concern.description, urgency: 'high', destination: { app: 'recruiting', playerId: profile.playerId, focusPlayerId: profile.playerId }, source: `recruitingConcern:${concern.id}` })
    }
    const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id))
    for (const entry of Object.values(world.transferPortalEntriesById).filter((item) => item.status === 'authorized' && item.ecosystemId === competition?.ecosystemId)) {
      const ownEntry = entry.sourceTeamId === team.id
      const recruitingProfile = Object.values(world.recruitProfilesById).find((profile) => profile.transferPortalEntryId === entry.id && profile.status === 'open')
      if (ownEntry) items.push({ id: `own-portal:${entry.id}`, type: 'retention-decision', playerId: entry.playerId, title: 'Own Player Portal decision', explanation: 'The notice is authorized; review the Player’s retention and withdrawal context.', urgency: 'high', destination: { app: 'portal', playerId: entry.playerId, focusPlayerId: entry.playerId }, source: `transferPortalEntry:${entry.id}` })
      else if (recruitingProfile) items.push({ id: `portal-recruiting:${entry.id}`, type: 'portal-recruiting', playerId: entry.playerId, title: 'Portal Player in Recruiting', explanation: 'Continue the active transfer Recruiting profile.', urgency: 'normal', destination: { app: 'recruiting', playerId: entry.playerId, focusPlayerId: entry.playerId }, source: `recruitProfile:${recruitingProfile.id}` })
      else items.push({ id: `portal:${entry.id}`, type: 'portal-entry', playerId: entry.playerId, title: 'Authorized Portal entry', explanation: 'This transfer Player can be reviewed for your current program.', urgency: 'normal', destination: { app: 'portal', playerId: entry.playerId, focusPlayerId: entry.playerId }, source: `transferPortalEntry:${entry.id}` })
    }
    for (const entry of Object.values(world.transferPortalEntriesById).filter((item) => item.sourceTeamId === team.id && item.status === 'noticePending')) items.push({ id: `retention:${entry.id}`, type: 'retention-concern', playerId: entry.playerId, title: 'Roster Player considering the Portal', explanation: 'Review the Player’s continuation context and Portal processing state.', urgency: 'high', ...(entry.processingDueOn ? { deadline: entry.processingDueOn } : {}), destination: { app: 'portal', playerId: entry.playerId, focusPlayerId: entry.playerId }, source: `transferPortalEntry:${entry.id}` })
    const latestEligibility = new Map<string, (typeof world.collegeEligibilityAssessmentsById)[string]>()
    for (const assessment of Object.values(world.collegeEligibilityAssessmentsById).filter((item) => item.teamId === team.id).sort((a, b) => a.assessedOn.localeCompare(b.assessedOn) || a.id.localeCompare(b.id))) latestEligibility.set(assessment.playerId, assessment)
    for (const assessment of latestEligibility.values()) if (!assessment.eligible) items.push({ id: `eligibility:${assessment.id}`, type: 'eligibility-block', playerId: assessment.playerId, title: 'Eligibility block', explanation: 'A program assessment records an eligibility issue that needs review.', urgency: 'high', destination: { app: 'player', playerId: assessment.playerId }, source: `collegeEligibilityAssessment:${assessment.id}` })
  }
  for (const draft of Object.values(world.draftsById).filter((item) => item.status === 'scheduled' || item.status === 'inProgress')) for (const [kind, date] of [['declaration', draft.rules.earlyEntryDeadline], ['NCAA withdrawal', draft.rules.collegeWithdrawalDeadline], ['NBA withdrawal', draft.rules.finalWithdrawalDeadline]] as const) {
    if (!date || date < world.currentDate) continue
    const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${world.currentDate}T00:00:00Z`)) / 86400000)
    if (days > 30) continue
    for (const entry of draft.entries ?? []) if (['considering', 'declaredEarlyEntry', 'finalPool'].includes(entry.status)) items.push({ id: `draft-deadline:${draft.id}:${kind}:${entry.playerId}`, type: 'draft-deadline', playerId: entry.playerId, title: `Draft ${kind} deadline`, explanation: `${kind} decision is due ${date}.`, urgency: days <= 3 ? 'high' : 'normal', deadline: date, destination: { app: 'draft', playerId: entry.playerId, focusPlayerId: entry.playerId }, source: `draft:${draft.id}:${kind}` })
  }
  return items.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || ({ high: 0, normal: 1, low: 2 }[a.urgency] - { high: 0, normal: 1, low: 2 }[b.urgency]) || a.id.localeCompare(b.id)).slice(0, 30)
}

export interface TalentDeadlineItem { readonly id: string; readonly date: GameDate; readonly meaning: string; readonly consequence: string; readonly urgency: 'overdue' | 'today' | 'near' | 'upcoming'; readonly playerId?: PlayerId; readonly destination: { readonly app: 'recruiting' | 'portal' | 'draft'; readonly focusPlayerId?: PlayerId }; readonly source: string }

export function buildTalentDeadlineItems(world: GameWorld, horizonDays = 30): readonly TalentDeadlineItem[] {
  const results: TalentDeadlineItem[] = []
  const add = (id: string, date: GameDate | undefined, meaning: string, consequence: string, app: TalentDeadlineItem['destination']['app'], source: string, playerId?: PlayerId) => {
    if (!date) return
    const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${world.currentDate}T00:00:00Z`)) / 86400000)
    if (days > horizonDays) return
    results.push({ id, date, meaning, consequence, urgency: days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'near' : 'upcoming', ...(playerId ? { playerId } : {}), destination: { app, ...(playerId && app !== 'recruiting' ? { focusPlayerId: playerId } : {}) }, source })
  }
  for (const cycle of Object.values(world.recruitingCyclesById).filter((item) => item.status === 'open')) add(`recruiting:${cycle.id}`, cycle.closesOn, 'Recruiting cycle closes', 'Remaining recruiting actions and decisions may no longer be available.', 'recruiting', `recruitingCycle:${cycle.id}`)
  for (const cycle of Object.values(world.recruitingCyclesById).filter((item) => item.status === 'open')) add(`signing:${cycle.id}`, cycle.signingOn, 'Recruiting signing date', 'Available signing actions may close after this date.', 'recruiting', `recruitingCycle:${cycle.id}:signing`)
  for (const entry of Object.values(world.transferPortalEntriesById).filter((item) => item.sourceTeamId === getUserTeam(world)?.id && item.status === 'noticePending')) add(`portal:${entry.id}`, entry.processingDueOn, 'Portal institutional processing due', 'Late processing may close the current notice path.', 'portal', `transferPortalEntry:${entry.id}`, entry.playerId)
  for (const draft of Object.values(world.draftsById).filter((item) => item.status === 'scheduled' || item.status === 'inProgress')) {
    add(`draft:${draft.id}:declare`, draft.rules.earlyEntryDeadline, 'Draft declaration deadline', 'A Player who has not declared may lose this entry opportunity.', 'draft', `draft:${draft.id}`)
    add(`draft:${draft.id}:ncaa`, draft.rules.collegeWithdrawalDeadline, 'NCAA withdrawal deadline', 'After this date, withdrawal cannot restore college eligibility.', 'draft', `draft:${draft.id}`)
    add(`draft:${draft.id}:nba`, draft.rules.finalWithdrawalDeadline, 'NBA withdrawal deadline', 'After this date, Draft withdrawal is no longer available.', 'draft', `draft:${draft.id}`)
  }
  return results.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
