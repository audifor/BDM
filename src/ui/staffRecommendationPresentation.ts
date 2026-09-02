import type { StaffPersonId, TeamId } from '@/domain/ids'
import { getResponsibility, getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'
import {
  RESPONSIBILITY_DOMAINS,
  RESPONSIBILITY_KINDS,
  responsibilityDefinition,
  type DelegationOutcome,
  type DelegationOutcomeId,
  type ResponsibilityDomain,
  type ResponsibilityId,
  type ResponsibilityKind,
} from '@/domain/responsibility'
import type { StaffRoleId } from '@/domain/staff'
import { hasCanonicalAcceptanceSeam } from '@/app/staffRecommendations'
import { RESPONSIBILITY_DOMAIN_LABELS, RESPONSIBILITY_KIND_LABELS } from './staffPresentation'

export type StaffRecommendationStatus = 'PENDING' | 'INFORMATIONAL' | 'ACCEPTED' | 'DISMISSED'
export type StaffRecommendationActionability = 'ACCEPTABLE' | 'VIEW_ONLY'

export interface StaffRecommendationPresentationItem {
  readonly id: DelegationOutcomeId
  readonly outcomeId: DelegationOutcomeId
  readonly responsibilityId: ResponsibilityId
  readonly kind: ResponsibilityKind
  readonly domain: ResponsibilityDomain
  readonly decidedOn: string
  readonly staffId: StaffPersonId
  readonly staffName: string
  readonly staffRole: StaffRoleId | undefined
  readonly qualityScore: number
  readonly status: StaffRecommendationStatus
  readonly actionability: StaffRecommendationActionability
  readonly title: string
  readonly summary: string
  readonly subjectLabel: string | undefined
  readonly secondaryLabel: string | undefined
  readonly detailRows: readonly { readonly label: string; readonly value: string }[]
}

/**
 * Every `DelegationOutcome` belonging to `teamId` that qualifies for the Advisory Center (Wave
 * 4C3 §14): explicit user history (any `userDisposition`), unresolved advisory outcomes
 * (`applied === false` and no disposition yet), or a backward-compatible legacy-accepted outcome
 * — `applied === true` with no disposition, but ONLY for a kind that has a known advisory
 * acceptance seam. Every other `applied === true` outcome (automatic/delegated execution) is
 * deliberately excluded — `applied` alone is never read as "user accepted" (Wave 4C3 §6).
 *
 * User-team isolation is authoritative via `outcome.responsibilityId -> Responsibility.teamId`
 * (Wave 4C3 §13) — `payload.teamId`, when present, is never used for authorization, only display.
 */
export function getStaffRecommendationsForTeam(world: GameWorld, teamId: TeamId): readonly StaffRecommendationPresentationItem[] {
  return Object.values(world.delegationOutcomesById)
    .filter((outcome) => belongsToTeam(world, outcome, teamId))
    .filter((outcome) => qualifiesForAdvisoryCenter(outcome))
    .map((outcome) => toPresentationItem(world, outcome))
    .sort((left, right) =>
      unresolvedRank(left.status) - unresolvedRank(right.status)
      || right.decidedOn.localeCompare(left.decidedOn)
      || domainOrder(left.domain) - domainOrder(right.domain)
      || kindOrder(left.kind) - kindOrder(right.kind)
      || left.outcomeId.localeCompare(right.outcomeId),
    )
}

function belongsToTeam(world: GameWorld, outcome: DelegationOutcome, teamId: TeamId): boolean {
  const responsibility = world.responsibilitiesById[outcome.responsibilityId]
  return responsibility !== undefined && responsibility.teamId === teamId
}

function qualifiesForAdvisoryCenter(outcome: DelegationOutcome): boolean {
  if (outcome.userDisposition !== undefined) return true
  if (!outcome.applied) return true
  return hasCanonicalAcceptanceSeam(outcome.kind)
}

function unresolvedRank(status: StaffRecommendationStatus): number {
  return status === 'PENDING' || status === 'INFORMATIONAL' ? 0 : 1
}

function domainOrder(domain: ResponsibilityDomain): number {
  return RESPONSIBILITY_DOMAINS.indexOf(domain)
}

function kindOrder(kind: ResponsibilityKind): number {
  return RESPONSIBILITY_KINDS.indexOf(kind)
}

function resolveStatus(outcome: DelegationOutcome): StaffRecommendationStatus {
  if (outcome.userDisposition === 'accepted') return 'ACCEPTED'
  if (outcome.userDisposition === 'dismissed') return 'DISMISSED'
  if (outcome.applied) return 'ACCEPTED' // legacy backward-compatible acceptance; qualifiesForAdvisoryCenter already restricted this to known acceptance-seam kinds.
  return hasCanonicalAcceptanceSeam(outcome.kind) ? 'PENDING' : 'INFORMATIONAL'
}

function resolveActionability(status: StaffRecommendationStatus, kind: ResponsibilityKind): StaffRecommendationActionability {
  return status === 'PENDING' && hasCanonicalAcceptanceSeam(kind) ? 'ACCEPTABLE' : 'VIEW_ONLY'
}

function toPresentationItem(world: GameWorld, outcome: DelegationOutcome): StaffRecommendationPresentationItem {
  const staff = getStaffPerson(world, outcome.staffId)
  const staffAssignment = getStaffAssignment(world, outcome.staffId)
  const staffName = staff === undefined ? 'Unknown Staff' : `${staff.identity.firstName} ${staff.identity.lastName}`
  const domain = responsibilityDefinition(outcome.kind).domain
  const status = resolveStatus(outcome)
  const formatted = formatOutcome(world, outcome)

  return {
    id: outcome.id,
    outcomeId: outcome.id,
    responsibilityId: outcome.responsibilityId,
    kind: outcome.kind,
    domain,
    decidedOn: outcome.decidedOn,
    staffId: outcome.staffId,
    staffName,
    staffRole: staffAssignment?.role,
    qualityScore: outcome.qualityScore,
    status,
    actionability: resolveActionability(status, outcome.kind),
    title: formatted.title,
    summary: formatted.summary,
    subjectLabel: formatted.subjectLabel,
    secondaryLabel: formatted.secondaryLabel,
    detailRows: formatted.detailRows,
  }
}

interface FormattedOutcome {
  readonly title: string
  readonly summary: string
  readonly subjectLabel: string | undefined
  readonly secondaryLabel: string | undefined
  readonly detailRows: readonly { readonly label: string; readonly value: string }[]
}

function playerName(world: GameWorld, playerId: unknown): string | undefined {
  if (typeof playerId !== 'string') return undefined
  const player = world.players[playerId as never]
  return player === undefined ? undefined : `${player.firstName} ${player.lastName}`
}

function recruitPlayerName(world: GameWorld, recruitId: unknown): string | undefined {
  if (typeof recruitId !== 'string') return undefined
  const recruit = world.recruitProfilesById[recruitId]
  if (recruit === undefined) return undefined
  return playerName(world, recruit.playerId)
}

function teamName(world: GameWorld, teamId: unknown): string | undefined {
  if (typeof teamId !== 'string') return undefined
  return world.teams[teamId as never]?.name
}

/**
 * One formatter per known payload shape (Wave 4C3 §19-25), plus a safe generic fallback for any
 * unknown/future `DelegationOutcome` (§26). Never a monolithic exhaustive switch over
 * `ResponsibilityKind` — payload shape, not `kind` alone, decides `prospectReport`'s scouting vs.
 * draft-advisory formatting (§24). Never reads hidden Player ratings; only names/public payload.
 */
function formatOutcome(world: GameWorld, outcome: DelegationOutcome): FormattedOutcome {
  if (outcome.kind === 'returnToPlayRecommendation' || outcome.kind === 'treatmentRecommendation') return formatMedical(world, outcome)
  if (outcome.kind === 'prospectIdentification' || outcome.kind === 'recruitEvaluation' || outcome.kind === 'recruitingPriorities') return formatRecruiting(world, outcome)
  if (outcome.kind === 'tradeRecommendation') return formatTrade(world, outcome)
  if (outcome.kind === 'recommendSignings') return formatRecommendSignings(world, outcome)
  if (outcome.kind === 'shortlistPlayers') return formatShortlistPlayers(world, outcome)
  if (outcome.kind === 'contractRecommendation') return formatContractRecommendation(world, outcome)
  if (outcome.kind === 'oppositionScouting') return formatOppositionScouting(outcome)
  if (outcome.kind === 'oppositionReport' || outcome.kind === 'prospectReport') return formatScoutingOrDraft(world, outcome)
  return formatUnknown(outcome)
}

function formatMedical(world: GameWorld, outcome: DelegationOutcome): FormattedOutcome {
  const player = playerName(world, outcome.payload.playerId) ?? 'Player'
  const recommendedExtraDays = outcome.payload.recommendedExtraDays
  const days = typeof recommendedExtraDays === 'number' ? recommendedExtraDays : undefined
  const adjustmentLabel = days === undefined ? undefined : days >= 0 ? `+${days} day${days === 1 ? '' : 's'} recovery margin` : `${days} day${days === -1 ? '' : 's'} return adjustment`
  const kindLabel = outcome.kind === 'returnToPlayRecommendation' ? 'Return-to-play' : 'Treatment'
  return {
    title: `${kindLabel} recommendation`,
    summary: adjustmentLabel === undefined ? player : `${player} · ${adjustmentLabel}`,
    subjectLabel: player,
    secondaryLabel: adjustmentLabel,
    detailRows: [
      { label: 'PLAYER', value: player },
      { label: 'BASE RETURN', value: typeof outcome.payload.baseExpectedReturnDate === 'string' ? outcome.payload.baseExpectedReturnDate : '—' },
      { label: 'RECOMMENDED ADJUSTMENT', value: adjustmentLabel ?? '—' },
    ],
  }
}

const RECRUIT_ACTION_LABELS: Readonly<Record<string, string>> = { contact: 'CONTACT', pitch: 'PITCH', visit: 'VISIT', offer: 'OFFER' }

function formatRecruiting(world: GameWorld, outcome: DelegationOutcome): FormattedOutcome {
  const recruit = recruitPlayerName(world, outcome.payload.recruitId) ?? 'Recruit'
  if (outcome.kind === 'prospectIdentification') {
    return { title: 'Add to recruiting board', summary: `Add ${recruit} to recruiting board`, subjectLabel: recruit, secondaryLabel: undefined, detailRows: [{ label: 'RECRUIT', value: recruit }] }
  }
  if (outcome.kind === 'recruitingPriorities') {
    const priority = typeof outcome.payload.recommendedPriority === 'string' ? outcome.payload.recommendedPriority.toUpperCase() : '—'
    return { title: 'Set recruiting priority', summary: `Set ${recruit} priority to ${priority}`, subjectLabel: recruit, secondaryLabel: priority, detailRows: [{ label: 'RECRUIT', value: recruit }, { label: 'PRIORITY', value: priority }] }
  }
  const action = typeof outcome.payload.recommendedAction === 'string' ? RECRUIT_ACTION_LABELS[outcome.payload.recommendedAction] ?? outcome.payload.recommendedAction.toUpperCase() : '—'
  return { title: 'Recruit evaluation', summary: `${action} ${recruit}`, subjectLabel: recruit, secondaryLabel: action, detailRows: [{ label: 'RECRUIT', value: recruit }, { label: 'ACTION', value: action }] }
}

function formatTrade(world: GameWorld, outcome: DelegationOutcome): FormattedOutcome {
  const outgoing = playerName(world, outcome.payload.outgoingPlayerId) ?? 'Outgoing player'
  const incoming = playerName(world, outcome.payload.incomingPlayerId) ?? 'Incoming player'
  const counterpart = teamName(world, outcome.payload.counterpartTeamId) ?? 'Counterpart'
  const confidence = typeof outcome.payload.confidence === 'number' ? `${outcome.payload.confidence}%` : '—'
  return {
    title: 'Trade recommendation',
    summary: `Trade ${outgoing} for ${incoming}`,
    subjectLabel: `${outgoing} → ${incoming}`,
    secondaryLabel: counterpart,
    detailRows: [
      { label: 'OUTGOING', value: outgoing },
      { label: 'INCOMING', value: incoming },
      { label: 'COUNTERPART', value: counterpart },
      { label: 'CONFIDENCE', value: confidence },
    ],
  }
}

function formatRecommendSignings(world: GameWorld, outcome: DelegationOutcome): FormattedOutcome {
  const player = playerName(world, outcome.payload.playerId) ?? 'Player'
  const confidence = typeof outcome.payload.confidence === 'number' ? `${outcome.payload.confidence}%` : '—'
  const salary = typeof outcome.payload.expectedSalary === 'number' ? outcome.payload.expectedSalary.toLocaleString() : '—'
  const affordable = outcome.payload.affordable === true ? 'YES' : outcome.payload.affordable === false ? 'NO' : '—'
  return {
    title: 'Free agent signing recommendation',
    summary: `Consider signing ${player}`,
    subjectLabel: player,
    secondaryLabel: confidence,
    detailRows: [
      { label: 'PLAYER', value: player },
      { label: 'EXPECTED SALARY', value: salary },
      { label: 'CONFIDENCE', value: confidence },
      { label: 'AFFORDABLE', value: affordable },
    ],
  }
}

function formatShortlistPlayers(world: GameWorld, outcome: DelegationOutcome): FormattedOutcome {
  const candidateCount = typeof outcome.payload.candidateCount === 'number' ? outcome.payload.candidateCount : 0
  const rows: { readonly label: string; readonly value: string }[] = []
  for (let i = 1; i <= candidateCount; i += 1) {
    const player = playerName(world, outcome.payload[`candidate${i}PlayerId`])
    if (player === undefined) continue
    const rank = outcome.payload[`candidate${i}Rank`]
    const confidence = outcome.payload[`candidate${i}Confidence`]
    rows.push({ label: `#${typeof rank === 'number' ? rank : i}`, value: `${player}${typeof confidence === 'number' ? ` · ${confidence}%` : ''}` })
  }
  return {
    title: 'Free agent shortlist',
    summary: `Shortlist: ${candidateCount} candidate${candidateCount === 1 ? '' : 's'}`,
    subjectLabel: undefined,
    secondaryLabel: `${candidateCount} candidates`,
    detailRows: rows.length > 0 ? rows : [{ label: 'CANDIDATES', value: 'None' }],
  }
}

function formatContractRecommendation(world: GameWorld, outcome: DelegationOutcome): FormattedOutcome {
  const player = playerName(world, outcome.payload.playerId) ?? 'Player'
  const recommendation = typeof outcome.payload.recommendation === 'string' ? outcome.payload.recommendation.toUpperCase() : '—'
  const currentSalary = typeof outcome.payload.annualSalary === 'number' ? outcome.payload.annualSalary.toLocaleString() : '—'
  const recommendedSalary = typeof outcome.payload.recommendedAnnualSalary === 'number' ? outcome.payload.recommendedAnnualSalary.toLocaleString() : '—'
  const budgetStatus = typeof outcome.payload.budgetStatus === 'string' ? outcome.payload.budgetStatus.toUpperCase() : '—'
  const confidence = typeof outcome.payload.confidence === 'number' ? `${outcome.payload.confidence}%` : '—'
  return {
    title: 'Contract recommendation',
    summary: `${recommendation} · ${player}`,
    subjectLabel: player,
    secondaryLabel: recommendation,
    detailRows: [
      { label: 'PLAYER', value: player },
      { label: 'RECOMMENDATION', value: recommendation },
      { label: 'CURRENT SALARY', value: currentSalary },
      { label: 'RECOMMENDED SALARY', value: recommendedSalary },
      { label: 'BUDGET STATUS', value: budgetStatus },
      { label: 'CONFIDENCE', value: confidence },
    ],
  }
}

function formatOppositionScouting(outcome: DelegationOutcome): FormattedOutcome {
  const emphasis = typeof outcome.payload.recommendedDefensiveEmphasis === 'string' ? outcome.payload.recommendedDefensiveEmphasis : '—'
  const pace = typeof outcome.payload.recommendedPaceAdjustment === 'number' ? String(outcome.payload.recommendedPaceAdjustment) : '—'
  const flagged = typeof outcome.payload.flaggedPlayerCount === 'number' ? String(outcome.payload.flaggedPlayerCount) : '—'
  return {
    title: 'Opposition report',
    summary: 'Opposition report available',
    subjectLabel: undefined,
    secondaryLabel: undefined,
    detailRows: [
      { label: 'DEFENSIVE EMPHASIS', value: emphasis },
      { label: 'PACE ADJUSTMENT', value: pace },
      { label: 'FLAGGED PLAYERS COUNT', value: flagged },
    ],
  }
}

/** Handles both scouting-request advisories (oppositionReport/prospectReport) and, when the payload carries draft-specific fields, the Draft Advisory shape of `prospectReport` — distinguished by payload, never by kind alone (Wave 4C3 §24). */
function formatScoutingOrDraft(world: GameWorld, outcome: DelegationOutcome): FormattedOutcome {
  const isDraftAdvisory = typeof outcome.payload.draftId === 'string' || typeof outcome.payload.recommendedPlayerId === 'string'
  if (isDraftAdvisory) {
    const player = playerName(world, outcome.payload.recommendedPlayerId) ?? 'Prospect'
    return { title: 'Draft recommendation', summary: `Draft recommendation: ${player}`, subjectLabel: player, secondaryLabel: undefined, detailRows: [{ label: 'PROSPECT', value: player }] }
  }
  const target = playerName(world, outcome.payload.targetPlayerId) ?? recruitPlayerName(world, outcome.payload.recruitId) ?? 'Player'
  return { title: 'Scouting requested', summary: `Scouting requested: ${target}`, subjectLabel: target, secondaryLabel: undefined, detailRows: [{ label: 'SUBJECT', value: target }] }
}

/** Future-proof safety net (Wave 4C3 §26): any unrecognized/future DelegationOutcome payload renders informationally, never crashes. */
function formatUnknown(outcome: DelegationOutcome): FormattedOutcome {
  const kindLabel = RESPONSIBILITY_KIND_LABELS[outcome.kind] ?? outcome.kind
  const domainLabel = RESPONSIBILITY_DOMAIN_LABELS[responsibilityDefinition(outcome.kind).domain]
  const rows = Object.entries(outcome.payload).map(([key, value]) => ({ label: key.toUpperCase(), value: String(value) }))
  return {
    title: kindLabel,
    summary: `${domainLabel} · ${kindLabel}`,
    subjectLabel: undefined,
    secondaryLabel: undefined,
    detailRows: rows.length > 0 ? rows : [{ label: 'PAYLOAD', value: 'None' }],
  }
}
