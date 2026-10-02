import {
  continueGame as runContinueGame,
  simulateUntilDate as runSimulateUntilDate,
  startNextSeason,
  completeMatch,
  createNewGame,
  instantResult,
  prepareUserMatch,
  createLiveUserMatch,
  playUserGame,
  simulateRemainingGamesToday,
  advanceGameDayWithResult,
} from '@/app/game'
import { releasePlayer } from '@/app/market'
import { recordContractReviewDecision } from '@/app/contractReview'
import { openUserContractRetention, respondUserToContractRetentionCounter, submitUserContractRetentionOffer, withdrawUserContractRetention } from '@/app/contractRetention/ContractRetentionService'
import type { RetentionTermSet } from '@/domain/contract/ContractRetentionNegotiation'
import type { ContractReviewIntent } from '@/domain/contract/ContractReviewDecision'
import { completeAcceptedFreeAgentSigning, initiatePreferredFreeAgentContact, submitPreparedFreeAgentOffer, respondToNegotiationCounter } from '@/app/marketIntelligence'
import { startUserPlayerContractSigning, recordPlayerContractSigningDecisionEvent } from '@/app/governance'
import { executeAcceptedRetentionAgreement } from '@/app/contractRetention/RetentionSigningService'
import { ensureRetentionPlayerContractSigningDecision } from '@/app/governance/PlayerContractSigningGovernanceService'
import type { ClubCounterDecision } from '@/app/marketIntelligence'
import { type InjuryId, type PlayerId, type StaffPersonId, type TeamId } from '@/domain/ids'
import type { CoachPerkId, CoachSkillId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getInboxItemsForCoach, getNewsFeed, getRelationshipsForPerson, getUnreadInboxCount, getUserCoachReputationProfile } from '@/domain/world'
import { getRecentCoachReputationEvents, type CoachReputationProfile } from '@/domain/coachReputation'
import { purchaseCoachPerk, purchaseCoachSkillRank, type CoachRpgOperationResult } from '@/engine/coach'
import type { ManualSubstitution, MatchSimulation, MatchTacticalPlan } from '@/engine/match'
import type { LiveMatchController, LiveMatchStep } from '@/app/game'
import { create } from 'zustand'
import { acceptCoachJobOffer, applyUserCoachForJob, declineCoachJobOffer } from '@/app/coachCareer'
import { getCareerFatigueForPlayer, getLatestTrainingSession, getTrainingPlanForTeam } from '@/domain/world'
import type { ScheduledTrainingSession, TrainingFocus, TrainingIntensity, TrainingParticipation, UserTrainingModule } from '@/domain/training'
import { assignTrainingModuleToPlayer, cancelScheduledTrainingSession, createOrUpdateUserTrainingModule, deleteUserTrainingModule, scheduleAutomaticTeamTrainingWeek, scheduleTeamModuleSession, scheduleTrainingSession, setTeamTrainingPlan, setTrainingParticipation } from '@/engine/training'
import { clearLineupSlot, setLineupSlot } from '@/engine/tactics/LineupEngine'
import { getTeamLineup } from '@/domain/world'
import type { LineupSlot, DefensiveMatchupAssignment, Playbook, SavedPlay } from '@/domain/tactics'
import { updateGamePlan } from '@/app/game/TacticalPlanning'
import { deleteDesignerPlay, deleteDesignerPlaybook, saveDesignerPlay, saveDesignerPlaybook } from '@/engine/tactics/PlaybookEngine'
import { updateRotationMinutesForTeam } from '@/engine/tactics/RotationEngine'
import { executeEntityActionResult, type EntityActionExecution } from '@/app/entityActions/EntityActionExecutor'
import type { CommandResult } from '@/app/entityActions/EntityCommand'
import { selectDraftProspect } from '@/app/draft'
import { reviewMaterialRosterChanges } from '@/app/gmPlanning'
import type { ContinueResult, SimulateUntilResult, WorldDayAdvanceResult } from '@/app/game'
import { addRecruitingBoardEntry, makeRecruitingOffer, performRecruitingAction, removeRecruitingBoardEntry } from '@/engine/recruiting'
import type { Priority } from '@/domain/recruiting'
import { acceptNilOpportunity } from '@/engine/nil'
import { requestBoosterSupport } from '@/engine/boosters'
import { setCoachLifestyle } from '@/engine/coachFinances'
import type { Lifestyle } from '@/domain/coachFinances'
import type { MediaStance } from '@/domain/media'
import { createPreMatchMediaOpportunity, respondToMediaOpportunity, skipMediaOpportunity } from '@/engine/media'
import { getGamesToday, getNextUserGame, getUserTeam } from '@/engine/calendar'
import { requestScouting } from '@/engine/scouting'
import type { StaffRoleId } from '@/domain/staff'
import { acceptStaffJobOffer, completeStaffInterview, createStaffJobOffer, createStaffJobOpeningForTeam, declineStaffJobOffer, fireStaffFromTeam, identifyStaffCandidate, startStaffInterview } from '@/app/staffCareer'
import { setTeamResponsibility, type SetTeamResponsibilityInput } from '@/app/staffResponsibilities'
import { runStaffAssignmentStrategy, runStaffOptimization, type StaffAssignmentScope, type StaffAssignmentStrategy } from '@/app/staffAssignments'
import { acceptStaffRecommendation as acceptStaffRecommendationCommand, dismissStaffRecommendation as dismissStaffRecommendationCommand, type StaffRecommendationCommandResult } from '@/app/staffRecommendations'
import type { DelegationOutcomeId } from '@/domain/responsibility'
import { declineStaffCareerRequest, grantStaffCareerRequest } from '@/app/staffCareerAutonomy'
import { proposeTradeNegotiation, respondToTradeNegotiation, type TradeNegotiationActionRequest, type TradeNegotiationCommandResult } from '@/app/trades'
import { startUserTradeCommitment, recordTradeCommitmentEvent, type TradeCommitmentResult } from '@/app/trades'
import type { TradeProposal } from '@/domain/trade'
import { reviewReturnToPlay as reviewReturnToPlayCommand, type ReturnToPlayReviewResult } from '@/engine/injury/ReturnToPlayEngine'
import type { ReturnToPlayDecision } from '@/domain/injury'
import type { RehabilitationMode } from '@/domain/injury'
import { conductFitnessTest as conductFitnessTestCommand, type ConductFitnessTestResult } from '@/engine/injury/FitnessTest'
import { setRehabilitationPlan as setRehabilitationPlanCommand, type SetRehabilitationPlanResult } from '@/engine/injury/Rehabilitation'

interface GameStore {
  readonly world: GameWorld | null
  readonly lastDayAdvanceResult: WorldDayAdvanceResult | null
  newGame(): void
  prepareUserMatch(tacticalPlan?: MatchTacticalPlan): MatchSimulation
  startLiveMatch(tacticalPlan?: MatchTacticalPlan): MatchSimulation
  advanceLiveMatch(): MatchSimulation
  advanceLiveMatchPresentation(): LiveMatchStep
  skipLiveMatch(): MatchSimulation
  applyLiveTactics(teamId: MatchSimulation['homeTeamId'], tacticalPlan: MatchTacticalPlan): MatchSimulation
  applyManualSubstitutions(teamId: MatchSimulation['homeTeamId'], substitutions: readonly ManualSubstitution[]): MatchSimulation
  completeMatch(simulation: MatchSimulation): void
  instantResult(tacticalPlan?: MatchTacticalPlan): void
  playUserGame(): void
  simulateRemainingGamesToday(): void
  advanceDay(): WorldDayAdvanceResult
  continueGame(): ContinueResult
  simulateUntilDate(date: GameWorld['currentDate']): SimulateUntilResult
  startNextSeason(): void
  contactFreeAgent(teamId: TeamId, playerId: PlayerId, expectedProposalId: string): void
  submitFreeAgentOffer(teamId: TeamId, negotiationId: string, expectedProposalId: string): void
  decideFreeAgentCounter(teamId: TeamId, negotiationId: string, expectedRound: number, decision: ClubCounterDecision): void
  startFreeAgentSigningGovernance(teamId: TeamId, negotiationId: string, expectedProposalId: string, proposerBodyId?: string): void
  recordFreeAgentSigningDecision(decisionId: string, kind: 'APPROVED' | 'REJECTED' | 'VETOED' | 'WITHDRAWN', bodyId: string): void
  completeFreeAgentSigning(teamId: TeamId, negotiationId: string, expectedProposalId: string): void
  proposeUserTradeNegotiation(proposal: TradeProposal, pursuitId?: string): TradeNegotiationCommandResult
  respondUserToTradeNegotiation(request: Omit<TradeNegotiationActionRequest, 'teamId' | 'actor'>): TradeNegotiationCommandResult
  startUserTradeCommitment(negotiationId: string, expectedRevisionId: string): TradeCommitmentResult
  recordUserTradeCommitmentEvent(decisionId: string, kind: 'APPROVED' | 'REJECTED' | 'VETOED', bodyId: string): TradeCommitmentResult
  releasePlayer(teamId: TeamId, playerId: PlayerId): void
  decideContractReview(teamId: TeamId, contractId: import('@/domain/ids').ContractId, intent: ContractReviewIntent): void
  openContractRetention(teamId: TeamId, contractId: import('@/domain/ids').ContractId, actionId: string): void
  submitContractRetentionOffer(teamId: TeamId, negotiationId: string, expectedRound: number, actionId: string, terms: RetentionTermSet): void
  acceptContractRetentionCounter(teamId: TeamId, negotiationId: string, expectedRound: number, actionId: string): void
  withdrawContractRetention(teamId: TeamId, negotiationId: string, actionId: string): void
  requestRetentionSigning(teamId: TeamId, negotiationId: string, proposerBodyId?: string): void
  startStaffCandidacy(teamId: TeamId, roleId: StaffRoleId, staffId: StaffPersonId): void
  startStaffInterview(candidacyId: string): void
  completeStaffInterview(candidacyId: string): void
  createStaffOffer(candidacyId: string): void
  acceptStaffOffer(offerId: string): void
  declineStaffOffer(offerId: string): void
  fireStaff(staffId: StaffPersonId): void
  setStaffResponsibility(input: SetTeamResponsibilityInput): void
  applyStaffAssignmentStrategy(teamId: TeamId, strategy: StaffAssignmentStrategy, scope?: StaffAssignmentScope): number
  applyStaffOptimization(teamId: TeamId, scope?: StaffAssignmentScope): number
  acceptStaffRecommendation(outcomeId: DelegationOutcomeId): StaffRecommendationCommandResult
  dismissStaffRecommendation(outcomeId: DelegationOutcomeId): StaffRecommendationCommandResult
  reviewReturnToPlay(injuryId: import('@/domain/ids').InjuryId, decision: ReturnToPlayDecision, recommendationOutcomeId?: DelegationOutcomeId): ReturnToPlayReviewResult
  setRehabilitationPlan(injuryId: InjuryId, mode: RehabilitationMode): SetRehabilitationPlanResult
  conductFitnessTest(injuryId: InjuryId): ConductFitnessTestResult
  grantStaffCareerRequest(requestId: string): void
  declineStaffCareerRequest(requestId: string): void
  purchaseUserCoachSkill(skillId: CoachSkillId): CoachRpgOperationResult
  purchaseUserCoachPerk(perkId: CoachPerkId): CoachRpgOperationResult
  acceptUserCoachOffer(offerId: string): void
  declineUserCoachOffer(offerId: string): void
  applyUserCoachForJob(openingId: string): void
  setTrainingIntensity(intensity: TrainingIntensity): void
  setTrainingFocus(focus: TrainingFocus): void
  scheduleTrainingSession(session: ScheduledTrainingSession): void
  scheduleTeamModuleSession(input: { readonly moduleId: string; readonly date: GameWorld['currentDate']; readonly startTime: string; readonly durationMinutes: number; readonly sessionId: string; readonly intensity?: TrainingIntensity; readonly assignedStaffPersonIds?: readonly StaffPersonId[]; readonly participationByPlayerId?: Readonly<Record<string, TrainingParticipation>> }): void
  scheduleAutomaticTeamTrainingWeek(weekStart: GameWorld['currentDate']): void
  cancelTrainingSession(sessionId: string): void
  setTrainingParticipation(input: { readonly sessionId: string; readonly playerId: PlayerId; readonly participation?: TrainingParticipation }): void
  saveUserTrainingModule(module: UserTrainingModule): void
  deleteUserTrainingModule(moduleId: string): void
  assignTrainingModuleToPlayer(input: { readonly playerId: PlayerId; readonly moduleId: string; readonly date: GameWorld['currentDate']; readonly startTime: string; readonly sessionId: string; readonly assignedStaffPersonIds?: readonly StaffPersonId[] }): void
  setLineupSlot(slot: LineupSlot, playerId: PlayerId): void
  requestScoutingAssignment(playerId: PlayerId): void
  clearLineupSlot(slot: LineupSlot): void
  updateRotationMinutes(minutesByPeriod: Readonly<Record<PlayerId, readonly number[]>>): void
  updateGamePlanMatchups(matchups: readonly DefensiveMatchupAssignment[]): void
  updateGamePlanTacticalOverride(tacticalOverride: MatchTacticalPlan): void
  saveDesignerPlay(play: SavedPlay): void
  deleteDesignerPlay(playId: string): void
  saveDesignerPlaybook(playbook: Playbook): void
  deleteDesignerPlaybook(playbookId: string): void
  selectDraftProspect(draftId: string, playerId: PlayerId): void
  addRecruitingTarget(cycleId: string, recruitId: string, priority: Priority): void
  removeRecruitingTarget(recruitId: string): void
  performRecruitingAction(cycleId: string, recruitId: string, kind: 'contact'|'pitch'|'visit'): string | null
  makeRecruitingOffer(cycleId: string, recruitId: string): string | null
  acceptNilOpportunity(opportunityId: string): void
  requestBoosterSupport(boosterId: string): void
  setUserCoachLifestyle(lifestyle: Lifestyle): void
  respondToMedia(opportunityId: string, stance: MediaStance): void
  skipMedia(opportunityId: string): void
  executeEntityAction(result: CommandResult): EntityActionExecution
  getActiveMatchSession(): LiveMatchController | null
  replaceWorld(world: GameWorld): void
  resetGame(): void
}

/** UI bridge only: game operations remain in Application services. */
let liveController: LiveMatchController | null = null
export const useGameStore = create<GameStore>((set, get) => ({
  world: null,
  lastDayAdvanceResult: null,
  newGame: () => set({ world: createNewGame(), lastDayAdvanceResult: null }),
  prepareUserMatch: (tacticalPlan) => prepareUserMatch(requireWorld(get().world), tacticalPlan),
  startLiveMatch: (tacticalPlan) => { const world = addPreMatchMedia(requireWorld(get().world)); set({ world }); liveController = createLiveUserMatch(world, tacticalPlan); return liveController.snapshot() },
  advanceLiveMatch: () => requireLiveController().advanceOneStep(),
  advanceLiveMatchPresentation: () => requireLiveController().advanceOneStepWithSnapshots(),
  skipLiveMatch: () => requireLiveController().skipToEnd(),
  applyLiveTactics: (teamId, tacticalPlan) => requireLiveController().applyTactics(teamId, tacticalPlan),
  applyManualSubstitutions: (teamId, substitutions) => requireLiveController().applyManualSubstitutions(teamId, substitutions),
  completeMatch: (simulation) => {
    const world = requireWorld(get().world)
    set({ world: completeMatch(world, simulation) })
    liveController = null
  },
  instantResult: (tacticalPlan) => {
    const world = requireWorld(get().world)
    set({ world: instantResult(world, tacticalPlan) })
  },
  playUserGame: () => {
    const world = requireWorld(get().world)
    set({ world: playUserGame(world) })
  },
  simulateRemainingGamesToday: () => {
    const world = requireWorld(get().world)
    set({ world: simulateRemainingGamesToday(world) })
  },
  advanceDay: () => {
    const world = requireWorld(get().world)
    const result = advanceGameDayWithResult(world)
    set({ world: result.status === 'COMPLETED' || result.status === 'BREAKPOINT_AFTER_PROCESSING' ? result.world : world, lastDayAdvanceResult: result })
    return result
  },
  continueGame: () => {
    const result = runContinueGame(requireWorld(get().world))
    set({ world: result.world })
    return result
  },
  simulateUntilDate: (date) => {
    const result = runSimulateUntilDate(requireWorld(get().world), date)
    set({ world: result.world })
    return result
  },
  startNextSeason: () => {
    const world = requireWorld(get().world)
    set({ world: startNextSeason(world) })
  },
  contactFreeAgent: (teamId, playerId, expectedProposalId) => { const result = initiatePreferredFreeAgentContact(requireWorld(get().world), teamId, expectedProposalId, playerId); if (result.status === 'CREATED') set({ world: result.world }) },
  submitFreeAgentOffer: (teamId, negotiationId, expectedProposalId) => { const result = submitPreparedFreeAgentOffer(requireWorld(get().world), { teamId, negotiationId, expectedProposalId }); if (result.status === 'SUBMITTED') set({ world: result.world }) },
  decideFreeAgentCounter: (teamId, negotiationId, expectedRound, decision) => { const result = respondToNegotiationCounter(requireWorld(get().world), { teamId, negotiationId, expectedRound, decision }); if (result.status === 'APPLIED' || result.status === 'PLAYER_NOT_FREE_AGENT') set({ world: result.world }) },
  startFreeAgentSigningGovernance: (teamId, negotiationId, expectedProposalId, proposerBodyId) => { const result = startUserPlayerContractSigning(requireWorld(get().world), { teamId, negotiationId, expectedProposalId, ...(proposerBodyId === undefined ? {} : { proposerBodyId }) }); if (result.status === 'PROPOSED') set({ world: result.world }) },
  recordFreeAgentSigningDecision: (decisionId, kind, bodyId) => { const world = requireWorld(get().world); const result = recordPlayerContractSigningDecisionEvent(world, { decisionId, kind, bodyId, actor: { kind: 'COACH', id: world.userCoachId } }); let next = result.world; const decision = next.governanceDecisionsById[decisionId]; if (result.status === 'APPROVED' && decision?.subject.kind === 'GENERIC' && decision.subject.referenceId.startsWith('retention:')) next = executeAcceptedRetentionAgreement(next, decision.subject.referenceId.slice('retention:'.length)).world; if (next !== world) set({ world: next }) },
  completeFreeAgentSigning: (teamId, negotiationId, expectedProposalId) => { const result = completeAcceptedFreeAgentSigning(requireWorld(get().world), { teamId, negotiationId, expectedProposalId }); if (result.status === 'SIGNED') set({ world: result.world }) },
  proposeUserTradeNegotiation: (proposal, pursuitId) => {
    const world = requireWorld(get().world)
    const team = getUserTeam(world)
    if (team === undefined) return { status: 'NOT_AUTHORIZED', world, reasons: ['USER_TEAM_NOT_FOUND'] }
    const result = proposeTradeNegotiation(world, proposal, team.id, { kind: 'USER' }, pursuitId)
    if (result.world !== world) set({ world: result.world })
    return result
  },
  respondUserToTradeNegotiation: (request) => {
    const world = requireWorld(get().world)
    const team = getUserTeam(world)
    if (team === undefined) return { status: 'NOT_AUTHORIZED', world, reasons: ['USER_TEAM_NOT_FOUND'] }
    const result = respondToTradeNegotiation(world, { ...request, teamId: team.id, actor: { kind: 'USER' } })
    if (result.world !== world) set({ world: result.world })
    return result
  },
  startUserTradeCommitment: (negotiationId, expectedRevisionId) => {
    const world = requireWorld(get().world)
    const team = getUserTeam(world)
    if (team === undefined) return { status: 'NO_AUTHORITY', world, reasons: ['USER_TEAM_NOT_FOUND'] }
    const result = startUserTradeCommitment(world, { negotiationId, expectedRevisionId, teamId: team.id })
    if (result.world !== world) set({ world: result.world })
    return result
  },
  recordUserTradeCommitmentEvent: (decisionId, kind, bodyId) => {
    const world = requireWorld(get().world)
    const result = recordTradeCommitmentEvent(world, { decisionId, kind, bodyId, actor: { kind: 'COACH', id: world.userCoachId } })
    if (result.world !== world) set({ world: result.world })
    return result
  },
  releasePlayer: (teamId, playerId) => set({ world: releasePlayer(requireWorld(get().world), teamId, playerId) }),
  decideContractReview: (teamId, contractId, intent) => {
    const result = recordContractReviewDecision(requireWorld(get().world), { teamId, contractId, intent })
    if (result.ok) set({ world: result.world })
  },
  openContractRetention: (teamId, contractId, actionId) => {
    const result = openUserContractRetention(requireWorld(get().world), { teamId, contractId, actionId })
    if (result.world !== get().world) set({ world: result.world })
  },
  submitContractRetentionOffer: (teamId, negotiationId, expectedRound, actionId, terms) => {
    const result = submitUserContractRetentionOffer(requireWorld(get().world), { teamId, negotiationId, expectedRound, actionId, terms })
    if (result.world !== get().world) set({ world: result.world })
  },
  acceptContractRetentionCounter: (teamId, negotiationId, expectedRound, actionId) => {
    const result = respondUserToContractRetentionCounter(requireWorld(get().world), { teamId, negotiationId, expectedRound, actionId, action: 'ACCEPT_COUNTER' })
    if (result.world !== get().world) set({ world: result.world })
  },
  withdrawContractRetention: (teamId, negotiationId, actionId) => {
    const result = withdrawUserContractRetention(requireWorld(get().world), { teamId, negotiationId, actionId })
    if (result.world !== get().world) set({ world: result.world })
  },
  requestRetentionSigning: (teamId, negotiationId, proposerBodyId) => {
    const world = requireWorld(get().world)
    const result = ensureRetentionPlayerContractSigningDecision(world, {
      teamId,
      retentionNegotiationId: negotiationId,
      initiator: { kind: 'COACH', id: world.userCoachId },
      ...(proposerBodyId === undefined ? {} : { proposerBodyId }),
    })
    if (result.world !== world) set({ world: result.world })
  },
  startStaffCandidacy: (teamId, roleId, staffId) => {
    const opening = createStaffJobOpeningForTeam(requireWorld(get().world), { teamId, roleId })
    const candidacy = identifyStaffCandidate(opening.world, { openingId: opening.opening.id, staffId })
    set({ world: candidacy.world })
  },
  startStaffInterview: (candidacyId) => set({ world: startStaffInterview(requireWorld(get().world), candidacyId) }),
  completeStaffInterview: (candidacyId) => set({ world: completeStaffInterview(requireWorld(get().world), candidacyId) }),
  createStaffOffer: (candidacyId) => { const offer = createStaffJobOffer(requireWorld(get().world), { candidacyId }); set({ world: offer.world }) },
  acceptStaffOffer: (offerId) => set({ world: acceptStaffJobOffer(requireWorld(get().world), offerId) }),
  declineStaffOffer: (offerId) => set({ world: declineStaffJobOffer(requireWorld(get().world), offerId) }),
  fireStaff: (staffId) => set({ world: fireStaffFromTeam(requireWorld(get().world), staffId) }),
  setStaffResponsibility: (input) => set({ world: setTeamResponsibility(requireWorld(get().world), input) }),
  applyStaffAssignmentStrategy: (teamId, strategy, scope) => {
    const result = runStaffAssignmentStrategy(requireWorld(get().world), teamId, strategy, scope)
    if (result.changes.length > 0) set({ world: result.world })
    return result.changes.length
  },
  applyStaffOptimization: (teamId, scope) => {
    const result = runStaffOptimization(requireWorld(get().world), teamId, scope)
    if (result.changes.length > 0) set({ world: result.world })
    return result.changes.length
  },
  acceptStaffRecommendation: (outcomeId) => {
    const result = acceptStaffRecommendationCommand(requireWorld(get().world), outcomeId)
    if (result.ok) set({ world: result.world })
    return result
  },
  dismissStaffRecommendation: (outcomeId) => {
    const result = dismissStaffRecommendationCommand(requireWorld(get().world), outcomeId)
    if (result.ok) set({ world: result.world })
    return result
  },
  reviewReturnToPlay: (injuryId, decision, recommendationOutcomeId) => {
    const world = requireWorld(get().world)
    const result = reviewReturnToPlayCommand(world, {
      injuryId,
      decision,
      actor: { kind: 'USER', coachId: world.userCoachId },
      ...(recommendationOutcomeId === undefined ? {} : { recommendationOutcomeId }),
    })
    if (result.ok) set({ world: result.world })
    return result
  },
  setRehabilitationPlan: (injuryId, mode) => {
    const world = requireWorld(get().world)
    const result = setRehabilitationPlanCommand(world, { injuryId, mode, actor: { kind: 'USER', coachId: world.userCoachId } })
    if (result.ok) set({ world: result.world })
    return result
  },
  conductFitnessTest: (injuryId) => {
    const world = requireWorld(get().world)
    const result = conductFitnessTestCommand(world, { injuryId, actor: { kind: 'USER', coachId: world.userCoachId } })
    if (result.ok) set({ world: result.world })
    return result
  },
  grantStaffCareerRequest: (requestId) => set({ world: grantStaffCareerRequest(requireWorld(get().world), requestId) }),
  declineStaffCareerRequest: (requestId) => set({ world: declineStaffCareerRequest(requireWorld(get().world), requestId) }),
  purchaseUserCoachSkill: (skillId) => { const result = purchaseCoachSkillRank(requireWorld(get().world), requireWorld(get().world).userCoachId, skillId); if (result.ok) set({ world: result.world }); return result },
  purchaseUserCoachPerk: (perkId) => { const result = purchaseCoachPerk(requireWorld(get().world), requireWorld(get().world).userCoachId, perkId); if (result.ok) set({ world: result.world }); return result },
  acceptUserCoachOffer: (offerId) => set({ world: acceptCoachJobOffer(requireWorld(get().world), offerId) }),
  declineUserCoachOffer: (offerId) => set({ world: declineCoachJobOffer(requireWorld(get().world), offerId) }),
  applyUserCoachForJob: (openingId) => set({ world: applyUserCoachForJob(requireWorld(get().world), openingId).world }),
  setTrainingIntensity: (intensity) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: setTeamTrainingPlan(world, team.id, { intensity }) }) },
  setTrainingFocus: (focus) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: setTeamTrainingPlan(world, team.id, { focus }) }) },
  scheduleTrainingSession: (session) => set({ world: scheduleTrainingSession(requireWorld(get().world), session) }),
  scheduleTeamModuleSession: (input) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: scheduleTeamModuleSession(world, { teamId: team.id, ...input }) }) },
  scheduleAutomaticTeamTrainingWeek: (weekStart) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: scheduleAutomaticTeamTrainingWeek(world, { teamId: team.id, weekStart }) }) },
  cancelTrainingSession: (sessionId) => set({ world: cancelScheduledTrainingSession(requireWorld(get().world), sessionId) }),
  setTrainingParticipation: (input) => set({ world: setTrainingParticipation(requireWorld(get().world), input) }),
  saveUserTrainingModule: (module) => set({ world: createOrUpdateUserTrainingModule(requireWorld(get().world), module) }),
  deleteUserTrainingModule: (moduleId) => set({ world: deleteUserTrainingModule(requireWorld(get().world), moduleId) }),
  assignTrainingModuleToPlayer: (input) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: assignTrainingModuleToPlayer(world, { teamId: team.id, ...input }) }) },
  setLineupSlot: (slot, playerId) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: setLineupSlot(world, team.id, slot, playerId) }) },
  requestScoutingAssignment: (playerId) => {
    const world = requireWorld(get().world)
    const team = getUserTeam(world)
    if (team === undefined) return
    const scout = Object.values(world.teamStaffAssignmentsById).find(
      (assignment) => assignment.teamId === team.id && assignment.role === 'regionalScout',
    )
    if (scout === undefined) return
    set({
      world: requestScouting(world, {
        organizationId: team.organizationId,
        playerId,
        missionType: 'QUICK_LOOK',
        requestedBy: 'HEAD_COACH',
        evaluatorStaffId: scout.staffPersonId,
      }),
    })
  },
  clearLineupSlot: (slot) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: clearLineupSlot(world, team.id, slot) }) },
  updateRotationMinutes: (minutesByPeriod) => {
    const world = requireWorld(get().world)
    const team = getUserTeam(world)
    if (team === undefined) return
    set({ world: updateRotationMinutesForTeam(world, team.id, minutesByPeriod) })
  },
  updateGamePlanMatchups: (matchups) => {
    const world = requireWorld(get().world)
    const team = getUserTeam(world)
    const game = getNextUserGame(world)
    if (team === undefined || game === undefined) return
    const existing = world.gamePlansByKey[`${game.id}:${team.id}`]
    set({ world: updateGamePlan(world, { gameId: game.id, teamId: team.id, ...(existing?.rotationOverride === undefined ? {} : { rotationOverride: existing.rotationOverride }), ...(existing?.tacticalOverride === undefined ? {} : { tacticalOverride: existing.tacticalOverride }), matchups }) },
    )
  },
  updateGamePlanTacticalOverride: (tacticalOverride) => {
    const world = requireWorld(get().world)
    const team = getUserTeam(world)
    const game = getNextUserGame(world)
    if (team === undefined || game === undefined) return
    const existing = world.gamePlansByKey[`${game.id}:${team.id}`]
    set({ world: updateGamePlan(world, { gameId: game.id, teamId: team.id, ...(existing?.rotationOverride === undefined ? {} : { rotationOverride: existing.rotationOverride }), ...(existing?.matchups === undefined ? {} : { matchups: existing.matchups }), tacticalOverride }) })
  },
  saveDesignerPlay: (play) => set({ world: saveDesignerPlay(requireWorld(get().world), play) }),
  deleteDesignerPlay: (playId) => set({ world: deleteDesignerPlay(requireWorld(get().world), playId) }),
  saveDesignerPlaybook: (playbook) => set({ world: saveDesignerPlaybook(requireWorld(get().world), playbook) }),
  deleteDesignerPlaybook: (playbookId) => set({ world: deleteDesignerPlaybook(requireWorld(get().world), playbookId) }),
  selectDraftProspect: (draftId, playerId) => set({ world: selectDraftProspect(requireWorld(get().world), draftId, playerId) }),
  addRecruitingTarget: (cycleId, recruitId, priority) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined && world.recruitingCyclesById[cycleId] !== undefined) set({ world: addRecruitingBoardEntry(world, { programTeamId: team.id, recruitId, priority }) }) },
  removeRecruitingTarget: (recruitId) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: removeRecruitingBoardEntry(world, team.id, recruitId) }) },
  performRecruitingAction: (cycleId, recruitId, kind) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team === undefined) return 'NO_CONTROLLED_PROGRAM'; const result = performRecruitingAction(world, cycleId, recruitId, team.id, kind); if (result.ok) { set({ world: result.value }); return null } return result.reason },
  makeRecruitingOffer: (cycleId, recruitId) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team === undefined) return 'NO_CONTROLLED_PROGRAM'; const result = makeRecruitingOffer(world, cycleId, recruitId, team.id); if (result.ok) { set({ world: result.value }); return null } return result.reason },
  acceptNilOpportunity: (opportunityId) => { const result = acceptNilOpportunity(requireWorld(get().world), opportunityId); if (result.ok) set({ world: result.value }) },
  requestBoosterSupport: (boosterId) => { const result=requestBoosterSupport(requireWorld(get().world),boosterId);if(result.ok)set({world:result.value}) },
  setUserCoachLifestyle: (lifestyle) => set({ world: setCoachLifestyle(requireWorld(get().world), requireWorld(get().world).userCoachId, lifestyle) }),
  respondToMedia: (opportunityId, stance) => set({ world: respondToMediaOpportunity(requireWorld(get().world), opportunityId, stance) }),
  skipMedia: (opportunityId) => set({ world: skipMediaOpportunity(requireWorld(get().world), opportunityId) }),
  executeEntityAction: (result) => {
    const world = requireWorld(get().world); const outcome = executeEntityActionResult(world, result, { controlledTeamId: getUserTeam(world)?.id, activeMatchSession: liveController ?? undefined })
    if (outcome.kind === 'executed') set({ world: outcome.world })
    return outcome
  },
  getActiveMatchSession: () => liveController,
  replaceWorld: (world) => { liveController = null; set({ world, lastDayAdvanceResult: null }) },
  resetGame: () => { liveController = null; set({ world: null, lastDayAdvanceResult: null }) },
}))

function requireWorld(world: GameWorld | null): GameWorld {
  if (world === null) {
    throw new Error('No active game')
  }

  return world
}
function requireLiveController(): LiveMatchController { if (liveController === null) throw new Error('No live match'); return liveController }
function addPreMatchMedia(world: GameWorld): GameWorld { const team = getUserTeam(world); const game = team === undefined ? undefined : getGamesToday(world).find((item) => item.status === 'scheduled' && (item.homeTeamId === team.id || item.awayTeamId === team.id)); return game === undefined ? world : createPreMatchMediaOpportunity(world, game.id) }

export function selectUserCoachReputationProfile(world: GameWorld | null): CoachReputationProfile | undefined {
  return world === null ? undefined : getUserCoachReputationProfile(world)
}

export function selectUserCoachRecentReputationEvents(world: GameWorld | null, limit = 5) {
  const profile = selectUserCoachReputationProfile(world)
  return profile === undefined ? [] : getRecentCoachReputationEvents(profile, limit)
}
export function selectUserCoachPendingOffers(world: GameWorld | null) { return world === null ? [] : Object.values(world.coachJobOffersById).filter((offer) => offer.coachId === world.userCoachId && offer.status === 'pending') }
export function selectUserCoachActiveCandidacies(world: GameWorld | null) { return world === null ? [] : Object.values(world.coachJobCandidaciesById).filter((candidacy) => candidacy.coachId === world.userCoachId && ['identified', 'interviewing', 'offered'].includes(candidacy.status)) }
/** Derived selector; relationship profiles remain exclusively in GameWorld. */
export function selectUserCoachRelationships(world: GameWorld | null) { return world === null ? [] : getRelationshipsForPerson(world, world.userCoachId) }
export function selectUserInbox(world:GameWorld|null){return world===null?[]:getInboxItemsForCoach(world,world.userCoachId)}
export function selectUnreadInboxCount(world:GameWorld|null){return world===null?0:getUnreadInboxCount(world,world.userCoachId)}
export function selectRecentNews(world:GameWorld|null,limit=5){return world===null?[]:getNewsFeed(world).slice(0,limit)}
export function selectUserTrainingPlan(world: GameWorld | null) { const team = world === null ? undefined : getUserTeam(world); return team === undefined || world === null ? undefined : getTrainingPlanForTeam(world, team.id) }
export function selectUserTeamLineup(world: GameWorld | null) { const team = world === null ? undefined : getUserTeam(world); return team === undefined || world === null ? undefined : getTeamLineup(world, team.id) }
export function selectLatestUserTrainingSession(world: GameWorld | null) { const team = world === null ? undefined : getUserTeam(world); return team === undefined || world === null ? undefined : getLatestTrainingSession(world, team.id) }
export function selectUserTeamCareerFatigueSummary(world: GameWorld | null) { const team = world === null ? undefined : getUserTeam(world); if (team === undefined || world === null || team.rosterPlayerIds.length === 0) return 0; return team.rosterPlayerIds.reduce((sum, id) => sum + getCareerFatigueForPlayer(world, id), 0) / team.rosterPlayerIds.length }
export function selectUserTeamScheduledSessions(world: GameWorld | null) { const team = world === null ? undefined : getUserTeam(world); if (team === undefined || world === null) return []; return Object.values(world.scheduledTrainingSessionsById).filter((session) => session.teamId === team.id) }
export function selectUserTrainingModules(world: GameWorld | null) { return world === null ? [] : Object.values(world.userTrainingModulesById) }
export function selectUserTeamRotationIntent(world: GameWorld | null) { const team = world === null ? undefined : getUserTeam(world); return team === undefined || world === null ? undefined : world.rotationPlansByTeamId[team.id] }
export function selectUserNextGamePlanMatchups(world: GameWorld | null): readonly DefensiveMatchupAssignment[] { const team = world === null ? undefined : getUserTeam(world); const game = world === null ? undefined : getNextUserGame(world); if (team === undefined || game === undefined || world === null) return []; return world.gamePlansByKey[`${game.id}:${team.id}`]?.matchups ?? [] }
export function selectUserNextGamePlanTacticalOverride(world: GameWorld | null): MatchTacticalPlan | undefined { const team = world === null ? undefined : getUserTeam(world); const game = world === null ? undefined : getNextUserGame(world); if (team === undefined || game === undefined || world === null) return undefined; return world.gamePlansByKey[`${game.id}:${team.id}`]?.tacticalOverride as MatchTacticalPlan | undefined }
export function selectDesignerPlays(world: GameWorld | null): readonly SavedPlay[] { return world === null ? [] : Object.values(world.savedPlaysById) }
export function selectDesignerPlaybooks(world: GameWorld | null): readonly Playbook[] { return world === null ? [] : Object.values(world.playbooksById) }
