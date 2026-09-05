import { organizationIdForTeam, type PlayerId, type StaffPersonId, type TeamId } from '@/domain/ids'
import { formatRatingEvaluation, getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { RESPONSIBILITY_DOMAINS, type ResponsibilityDomain } from '@/domain/responsibility'
import type { GameWorld } from '@/domain/world'
import {
  RESPONSIBILITY_DOMAIN_LABELS,
  STAFF_ROLE_LABELS,
} from '@/ui/staffPresentation'
import { getStaffRecommendationsForTeam } from '@/ui/staffRecommendationPresentation'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import {
  knowledgeDimensionLabel,
  scoutingMissionLabel,
} from '@/ui-ng/applications/scouting/scoutingWorkspaceModel'

export interface RosterStaffComment {
  readonly id: string
  readonly level: string
  readonly staffName: string
  readonly roleLabel: string | undefined
  readonly title: string
  readonly body: string
  readonly dateLabel: string
}

export interface RosterStaffCommentGroup {
  readonly level: string
  readonly comments: readonly RosterStaffComment[]
}

export interface RosterStaffCommentsModel {
  readonly groups: readonly RosterStaffCommentGroup[]
}

function staffName(world: GameWorld, staffId: StaffPersonId): string {
  const staff = world.staffPeopleById[staffId]
  return staff === undefined ? 'Unknown staff' : `${staff.identity.firstName} ${staff.identity.lastName}`
}

function payloadMentionsPlayer(payload: Readonly<Record<string, string | number | boolean>>, playerId: PlayerId): boolean {
  return Object.values(payload).some((value) => value === playerId)
}

function domainOrder(level: string): number {
  const domain = RESPONSIBILITY_DOMAINS.find((item) => RESPONSIBILITY_DOMAIN_LABELS[item] === level)
  return domain === undefined ? RESPONSIBILITY_DOMAINS.length : RESPONSIBILITY_DOMAINS.indexOf(domain)
}

function advisoryComments(world: GameWorld, teamId: TeamId, playerId: PlayerId): RosterStaffComment[] {
  return getStaffRecommendationsForTeam(world, teamId)
    .filter((item) => payloadMentionsPlayer(world.delegationOutcomesById[item.outcomeId]?.payload ?? {}, playerId))
    .map((item) => ({
      id: item.outcomeId,
      level: RESPONSIBILITY_DOMAIN_LABELS[item.domain as ResponsibilityDomain] ?? item.domain.toUpperCase(),
      staffName: item.staffName,
      roleLabel: item.staffRole === undefined ? undefined : STAFF_ROLE_LABELS[item.staffRole],
      title: item.title,
      body: item.summary,
      dateLabel: formatGameDateLabel(item.decidedOn),
    }))
}

function scoutingComments(world: GameWorld, teamId: TeamId, playerId: PlayerId): RosterStaffComment[] {
  const organizationId = organizationIdForTeam(teamId)
  const player = world.players[playerId]
  return Object.values(world.evaluatorReportsById)
    .filter((report) => report.organizationId === organizationId && report.subjectPlayerId === playerId)
    .map((report) => {
      const findings = report.findings.map((finding) => {
        const evaluation = getOrganizationRatingEvaluation({
          organizationId,
          playerId,
          dimension: finding.dimension,
          knowledge: world.organizationKnowledge,
          currentDate: world.currentDate,
          publicPosition: player?.basketball.primaryPosition,
        })
        return `${knowledgeDimensionLabel(finding.dimension)} ${formatRatingEvaluation(evaluation)}`
      })
      return {
        id: report.id,
        level: RESPONSIBILITY_DOMAIN_LABELS.scouting,
        staffName: staffName(world, report.evaluatorStaffId),
        roleLabel: STAFF_ROLE_LABELS.regionalScout,
        title: scoutingMissionLabel(report.missionType),
        body: findings.join(' · '),
        dateLabel: formatGameDateLabel(report.createdAt),
      }
    })
}

export function buildRosterStaffComments(
  world: GameWorld,
  teamId: TeamId,
  playerId: PlayerId,
): RosterStaffCommentsModel {
  const comments = [...advisoryComments(world, teamId, playerId), ...scoutingComments(world, teamId, playerId)].sort(
    (left, right) =>
      domainOrder(left.level) - domainOrder(right.level) ||
      right.dateLabel.localeCompare(left.dateLabel) ||
      left.id.localeCompare(right.id),
  )

  const groups: RosterStaffCommentGroup[] = []
  for (const comment of comments) {
    const last = groups.at(-1)
    if (last?.level === comment.level) {
      groups[groups.length - 1] = { level: last.level, comments: [...last.comments, comment] }
      continue
    }
    groups.push({ level: comment.level, comments: [comment] })
  }

  return { groups }
}
