import { createNewGame } from '@/app/game'
import { addDays, parseGameDate, type GameDate } from '@/domain/date'
import { createGovernanceDecision, createGovernanceDecisionEvent, createGovernanceRequest, createGovernanceRequestEvent } from '@/domain/governance'
import type { ContractNegotiation } from '@/domain/market'
import { clearPlayerFromLineup } from '@/domain/tactics'
import type { Team } from '@/domain/team'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

import { startUserPlayerContractSigning } from './PlayerContractSigningGovernanceService'

/**
 * MX0.7 fixture — a club whose Governance institution the user coach is genuinely appointed to.
 *
 * The shipped universes contain **no** Governance institution at all (no shipped path instantiates
 * one), so every Board/Governance product test must build its own canonical state. Nothing here
 * bypasses a canonical creator or invents a business rule: the fixture only states which bodies the
 * user coach is appointed to, which rights those bodies hold, and which real negotiation the club
 * already accepted. Decisions themselves are always created through the canonical services.
 */
export interface GovernanceClubScenario {
  readonly world: GameWorld
  readonly team: Team
  readonly teamId: Team['id']
  readonly institutionId: string
  readonly negotiation: ContractNegotiation & { readonly salary: number }
  readonly playerId: string
  readonly ownerBodyId: string
  readonly executiveBodyId: string
  readonly boardBodyId: string
}

const OWNER_BODY = 'body:mx07:owner'
const EXECUTIVE_BODY = 'body:mx07:executive'
const BOARD_BODY = 'body:mx07:board'
const INSTITUTION = 'institution:mx07'
const GRANTED_ON = parseGameDate('2000-01-01')

function clubGovernanceGraph() {
  return {
    governanceBodies: [
      { id: OWNER_BODY, institutionId: INSTITUTION, kind: 'OWNERSHIP' as const, name: 'Ownership' },
      { id: EXECUTIVE_BODY, institutionId: INSTITUTION, kind: 'EXECUTIVE' as const, name: 'Executive' },
      { id: BOARD_BODY, institutionId: INSTITUTION, kind: 'BOARD' as const, name: 'Board' },
    ],
    governanceAuthorityGrants: [
      { id: 'authority:mx07:owner-executive:signing', fromBodyId: OWNER_BODY, toBodyId: EXECUTIVE_BODY, decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: GRANTED_ON },
      { id: 'authority:mx07:owner-board:signing', fromBodyId: OWNER_BODY, toBodyId: BOARD_BODY, decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: GRANTED_ON },
      { id: 'authority:mx07:owner-executive:firing', fromBodyId: OWNER_BODY, toBodyId: EXECUTIVE_BODY, decision: 'COACH_FIRING' as const, grantedOn: GRANTED_ON },
      { id: 'authority:mx07:owner-board:firing', fromBodyId: OWNER_BODY, toBodyId: BOARD_BODY, decision: 'COACH_FIRING' as const, grantedOn: GRANTED_ON },
      { id: 'authority:mx07:owner-executive:budget', fromBodyId: OWNER_BODY, toBodyId: EXECUTIVE_BODY, decision: 'BUDGET' as const, grantedOn: GRANTED_ON },
      { id: 'authority:mx07:owner-board:budget', fromBodyId: OWNER_BODY, toBodyId: BOARD_BODY, decision: 'BUDGET' as const, grantedOn: GRANTED_ON },
    ],
    governanceDecisionParticipationGrants: [
      { id: 'right:mx07:executive:signing-propose', authorityGrantId: 'authority:mx07:owner-executive:signing', bodyId: EXECUTIVE_BODY, edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
      { id: 'right:mx07:executive:signing-execute', authorityGrantId: 'authority:mx07:owner-executive:signing', bodyId: EXECUTIVE_BODY, edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
      { id: 'right:mx07:board:signing-approve', authorityGrantId: 'authority:mx07:owner-board:signing', bodyId: BOARD_BODY, edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const },
      { id: 'right:mx07:executive:firing-propose', authorityGrantId: 'authority:mx07:owner-executive:firing', bodyId: EXECUTIVE_BODY, edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
      { id: 'right:mx07:executive:firing-execute', authorityGrantId: 'authority:mx07:owner-executive:firing', bodyId: EXECUTIVE_BODY, edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
      { id: 'right:mx07:board:firing-approve', authorityGrantId: 'authority:mx07:owner-board:firing', bodyId: BOARD_BODY, edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const },
      { id: 'right:mx07:executive:budget-propose', authorityGrantId: 'authority:mx07:owner-executive:budget', bodyId: EXECUTIVE_BODY, edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
      { id: 'right:mx07:board:budget-approve', authorityGrantId: 'authority:mx07:owner-board:budget', bodyId: BOARD_BODY, edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const },
    ],
  }
}

function userAppointments(coachId: string, on: GameDate) {
  return [
    { id: 'appointment:mx07:user-executive', bodyId: EXECUTIVE_BODY, actor: { kind: 'COACH' as const, id: coachId }, role: 'CEO' as const, startedOn: on },
    { id: 'appointment:mx07:user-board', bodyId: BOARD_BODY, actor: { kind: 'COACH' as const, id: coachId }, role: 'BOARD_MEMBER' as const, startedOn: on },
  ]
}

export function createGovernanceClubScenario(): GovernanceClubScenario {
  const base = createNewGame()
  const team = getUserTeam(base)!
  const player = base.players[team.rosterPlayerIds[0]!]!
  const contract = Object.values(base.contractsById).find((item) => item.playerId === player.id)!
  const negotiation: ContractNegotiation & { readonly salary: number } = {
    id: 'negotiation:mx07:signing',
    organizationId: team.organizationId,
    teamId: team.id,
    playerId: player.id,
    sourceProposalId: 'proposal:mx07:signing',
    offerResponsibleActor: { kind: 'USER' },
    status: 'ACCEPTED',
    salary: 1_234_567,
    years: 2,
    round: 1,
  }
  const world = updateGameWorld(base, {
    negotiations: [negotiation],
    contracts: Object.values(base.contractsById).map((item) => item.id === contract.id ? { ...item, termination: { terminatedOn: base.currentDate, reason: 'released' as const } } : item),
    teams: Object.values(base.teams).map((item) => item.id === team.id ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => id !== player.id) } : item),
    lineupsByTeamId: Object.fromEntries(Object.entries(base.lineupsByTeamId).map(([id, lineup]) => [id, clearPlayerFromLineup(lineup, player.id)])),
    teamFinances: Object.values(base.teamFinancesByTeamId).map((finances) => finances.teamId === team.id ? { ...finances, playerSalaryBudget: 1_000_000_000 } : finances),
    governanceInstitutions: [{ id: INSTITUTION, universe: 'PROFESSIONAL_CLUB' as const, name: 'MX0.7 Club', teamIds: [team.id] }],
    governanceAppointments: userAppointments(base.userCoachId, base.currentDate),
    ...clubGovernanceGraph(),
  })
  return { world, team, teamId: team.id, institutionId: INSTITUTION, negotiation, playerId: player.id, ownerBodyId: OWNER_BODY, executiveBodyId: EXECUTIVE_BODY, boardBodyId: BOARD_BODY }
}

/** Real canonical proposal: `startUserPlayerContractSigning` creates the club's signing decision. */
export function withProposedSigning(scenario: GovernanceClubScenario): GameWorld {
  const started = startUserPlayerContractSigning(scenario.world, { teamId: scenario.teamId, negotiationId: scenario.negotiation.id, expectedProposalId: scenario.negotiation.sourceProposalId! })
  if (started.status !== 'PROPOSED') throw new Error(`MX0.7 fixture could not propose the signing decision: ${started.status} (${started.reason ?? 'no reason'})`)
  return started.world
}

export interface IssuedGovernanceRequestScenario {
  readonly world: GameWorld
  readonly requestId: string
  readonly summary: string
  readonly dueOn: string
}

/** A canonical club request addressed to the user coach, issued by the ownership body's actor. */export function withIssuedGovernanceRequest(scenario: GovernanceClubScenario): IssuedGovernanceRequestScenario {
  const issuer = Object.values(scenario.world.coaches).find((coach) => coach.id !== scenario.world.userCoachId)!
  const summary = 'Present the revised operating plan'
  const request = createGovernanceRequest({
    id: 'request:mx07:operating-plan',
    institutionId: scenario.institutionId,
    issuer: { kind: 'ACTOR', actor: { kind: 'COACH', id: issuer.id } },
    recipient: { kind: 'ACTOR', actor: { kind: 'COACH', id: scenario.world.userCoachId } },
    category: 'OPERATIONS',
    summary,
    dueOn: addDays(scenario.world.currentDate, 3),
    origin: { kind: 'STANDALONE' },
  })
  const issued = createGovernanceRequestEvent({ id: 'request:mx07:operating-plan:1-issued', requestId: request.id, kind: 'ISSUED', effectiveOn: scenario.world.currentDate, actor: request.issuer })
  return { world: updateGameWorld(scenario.world, { governanceRequests: [request], governanceRequestEvents: [issued] }), requestId: request.id, summary, dueOn: request.dueOn! }
}

export interface CoachFiringScenario {
  readonly world: GameWorld
  readonly decisionId: string
}

/**
 * The club's own head coach subject to a canonical firing decision. `approved` records the real
 * Board approval event, so only the canonical execution command remains.
 */
export function withCoachFiring(scenario: GovernanceClubScenario, options: { readonly approved: boolean }): CoachFiringScenario {
  const decisionId = 'decision:mx07:firing'
  const world = scenario.world
  const decision = createGovernanceDecision({ id: decisionId, institutionId: scenario.institutionId, decisionType: 'COACH_FIRING', proposedByBodyId: EXECUTIVE_BODY, proposedOn: world.currentDate, subject: { kind: 'COACH', coachId: world.userCoachId } })
  const proposed = createGovernanceDecisionEvent({ id: `${decisionId}:1-proposed`, decisionId, kind: 'PROPOSED', bodyId: EXECUTIVE_BODY, effectiveOn: world.currentDate, authorityGrantIds: ['authority:mx07:owner-executive:firing'] })
  const events = options.approved
    ? [proposed, createGovernanceDecisionEvent({ id: `${decisionId}:2-approved`, decisionId, kind: 'APPROVED', bodyId: BOARD_BODY, effectiveOn: world.currentDate, authorityGrantIds: ['authority:mx07:owner-board:firing'] })]
    : [proposed]
  return { world: updateGameWorld(world, { governanceDecisions: [decision], governanceDecisionEvents: events }), decisionId }
}

/** A canonical decision type that has no canonical command yet (BUDGET), used to pin read-only behaviour. */
export function withPendingBudgetDecision(scenario: GovernanceClubScenario): CoachFiringScenario {
  const decisionId = 'decision:mx07:budget'
  const decision = createGovernanceDecision({ id: decisionId, institutionId: scenario.institutionId, decisionType: 'BUDGET', proposedByBodyId: EXECUTIVE_BODY, proposedOn: scenario.world.currentDate, subject: { kind: 'BUDGET', scope: 'TEAM', referenceId: scenario.teamId } })
  const proposed = createGovernanceDecisionEvent({ id: `${decisionId}:1-proposed`, decisionId, kind: 'PROPOSED', bodyId: EXECUTIVE_BODY, effectiveOn: scenario.world.currentDate, authorityGrantIds: ['authority:mx07:owner-executive:budget'] })
  return { world: updateGameWorld(scenario.world, { governanceDecisions: [decision], governanceDecisionEvents: [proposed] }), decisionId }
}

export interface OtherClubScenario {
  readonly world: GameWorld
  readonly institutionId: string
  readonly decisionId: string
  readonly executiveBodyId: string
}

/** A second club with its own canonical institution and one pending BUDGET decision. */
export function withOtherClubBudgetDecision(scenario: GovernanceClubScenario): OtherClubScenario {
  const otherTeam = Object.values(scenario.world.teams).find((team) => team.id !== scenario.teamId)!
  const institutionId = 'institution:mx07:other'
  const ownerBodyId = 'body:mx07:other:owner'
  const executiveBodyId = 'body:mx07:other:executive'
  const boardBodyId = 'body:mx07:other:board'
  const decisionId = 'decision:mx07:other:budget'
  const grants = [
    { id: 'authority:mx07:other:budget-owner-executive', fromBodyId: ownerBodyId, toBodyId: executiveBodyId, decision: 'BUDGET' as const, grantedOn: GRANTED_ON },
    { id: 'authority:mx07:other:budget-owner-board', fromBodyId: ownerBodyId, toBodyId: boardBodyId, decision: 'BUDGET' as const, grantedOn: GRANTED_ON },
  ]
  const decision = createGovernanceDecision({ id: decisionId, institutionId, decisionType: 'BUDGET', proposedByBodyId: executiveBodyId, proposedOn: scenario.world.currentDate, subject: { kind: 'BUDGET', scope: 'TEAM', referenceId: otherTeam.id } })
  const proposed = createGovernanceDecisionEvent({ id: `${decisionId}:1-proposed`, decisionId, kind: 'PROPOSED', bodyId: executiveBodyId, effectiveOn: scenario.world.currentDate, authorityGrantIds: [grants[0]!.id] })
  const world = updateGameWorld(scenario.world, {
    governanceInstitutions: [...Object.values(scenario.world.governanceInstitutionsById), { id: institutionId, universe: 'PROFESSIONAL_CLUB' as const, name: 'Other club', teamIds: [otherTeam.id] }],
    governanceBodies: [...Object.values(scenario.world.governanceBodiesById), { id: ownerBodyId, institutionId, kind: 'OWNERSHIP' as const, name: 'Other ownership' }, { id: executiveBodyId, institutionId, kind: 'EXECUTIVE' as const, name: 'Other executive' }, { id: boardBodyId, institutionId, kind: 'BOARD' as const, name: 'Other board' }],
    governanceAuthorityGrants: [...Object.values(scenario.world.governanceAuthorityGrantsById), ...grants],
    governanceDecisionParticipationGrants: [...Object.values(scenario.world.governanceDecisionParticipationGrantsById),
      { id: 'right:mx07:other:budget-propose', authorityGrantId: grants[0]!.id, bodyId: executiveBodyId, edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
      { id: 'right:mx07:other:budget-approve', authorityGrantId: grants[1]!.id, bodyId: boardBodyId, edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const }],
    governanceDecisions: [decision],
    governanceDecisionEvents: [proposed],
  })
  return { world, institutionId, decisionId, executiveBodyId }
}
