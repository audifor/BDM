import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

export interface TalentPlayerViewModel {
  readonly playerId: PlayerId
  readonly pathway: string
  readonly organizationKnowledge: string
  readonly recruiting: string
  readonly portal: string
  readonly draft: string
  readonly eligibility: string
}

/** A display-only projection over pathway authorities; it never reads PlayerTruth. */
export function buildTalentPlayerViewModel(world: GameWorld, playerId: PlayerId): TalentPlayerViewModel | null {
  const player = world.players[playerId]
  if (player === undefined) return null
  const userTeam = getUserTeam(world)
  const team = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(playerId))
  const competition = team === undefined ? undefined : Object.values(world.competitions).find((candidate) => candidate.participantTeamIds.includes(team.id))
  const pathway = [team?.name, competition?.name].filter(Boolean).join(' · ') || 'Pathway not currently registered'
  const knowledge = userTeam === undefined ? undefined : world.organizationKnowledge.find((item) => item.organizationId === userTeam.organizationId && item.subjectPlayerId === playerId)
  const knowledgeDomains = Object.keys(knowledge?.dimensions ?? {})
  const organizationKnowledge = knowledgeDomains.length === 0 ? 'No scouting knowledge recorded' : `${knowledgeDomains.length} known areas · updated ${knowledgeDomains.map((key) => knowledge!.dimensions[key]!.assessedAt).sort().at(-1)}`
  const profile = Object.values(world.recruitProfilesById).find((item) => item.playerId === playerId && (userTeam === undefined || world.recruitingBoards.some((board) => board.programTeamId === userTeam.id && board.recruitId === item.id)))
  const recruiting = profile === undefined ? 'No active program target' : `Recruiting · ${profile.status}`
  const sameEcosystem = competition?.ecosystemId
  const visiblePortal = Object.values(world.transferPortalEntriesById).filter((entry) => entry.playerId === playerId && (entry.sourceTeamId === userTeam?.id || (entry.status === 'authorized' && entry.ecosystemId === sameEcosystem))).sort((a, b) => b.notifiedOn.localeCompare(a.notifiedOn))[0]
  const portal = visiblePortal === undefined ? 'No visible Portal entry' : `Portal · ${visiblePortal.status}`
  const draft = Object.values(world.draftsById).find((cycle) => cycle.entries?.some((entry) => entry.playerId === playerId))
  const draftEntry = draft?.entries?.find((entry) => entry.playerId === playerId)
  const draftStatus = draftEntry === undefined ? 'No Draft decision recorded' : `Draft · ${draftEntry.status}`
  const assessment = userTeam === undefined ? undefined : Object.values(world.collegeEligibilityAssessmentsById).filter((item) => item.playerId === playerId && item.teamId === userTeam.id).sort((a, b) => b.assessedOn.localeCompare(a.assessedOn))[0]
  const eligibility = assessment === undefined ? 'Unknown · no program assessment' : `${assessment.eligible ? 'Eligible' : 'Blocked'} · assessed ${assessment.assessedOn}`
  return { playerId, pathway, organizationKnowledge, recruiting, portal, draft: draftStatus, eligibility }
}
