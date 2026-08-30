import {
  advanceGameDay,
  continueGame as runContinueGame,
  startNextSeason,
  completeMatch,
  createNewGame,
  instantResult,
  prepareUserMatch,
  createLiveUserMatch,
  playUserGame,
  simulateRemainingGamesToday,
} from '@/app/game'
import { releasePlayer, signFreeAgent } from '@/app/market'
import type { PlayerId, TeamId } from '@/domain/ids'
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
import type { ScheduledTrainingSession, TrainingFocus, TrainingIntensity, UserTrainingModule } from '@/domain/training'
import { assignTrainingModuleToPlayer, cancelScheduledTrainingSession, createOrUpdateUserTrainingModule, deleteUserTrainingModule, scheduleTeamModuleSession, scheduleTrainingSession, setTeamTrainingPlan } from '@/engine/training'
import { clearLineupSlot, setLineupSlot } from '@/engine/tactics/LineupEngine'
import { getTeamLineup } from '@/domain/world'
import type { LineupSlot, TeamRotationIntent, DefensiveMatchupAssignment } from '@/domain/tactics'
import { updateRotationPlan, updateGamePlan } from '@/app/game/TacticalPlanning'
import { executeEntityActionResult, type EntityActionExecution } from '@/app/entityActions/EntityActionExecutor'
import type { CommandResult } from '@/app/entityActions/EntityCommand'
import { selectDraftProspect } from '@/app/draft'
import { executeTrade } from '@/engine/trade'
import type { TradeProposal } from '@/domain/trade'
import type { ContinueResult } from '@/app/game'
import { addRecruitingBoardEntry, makeRecruitingOffer, performRecruitingAction, removeRecruitingBoardEntry } from '@/engine/recruiting'
import type { Priority } from '@/domain/recruiting'
import { acceptNilOpportunity } from '@/engine/nil'
import { requestBoosterSupport } from '@/engine/boosters'
import { setCoachLifestyle } from '@/engine/coachFinances'
import type { Lifestyle } from '@/domain/coachFinances'
import type { MediaStance } from '@/domain/media'
import { createPreMatchMediaOpportunity, respondToMediaOpportunity, skipMediaOpportunity } from '@/engine/media'
import { getGamesToday, getNextUserGame, getUserTeam } from '@/engine/calendar'

interface GameStore {
  readonly world: GameWorld | null
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
  advanceDay(): void
  continueGame(): ContinueResult
  startNextSeason(): void
  signFreeAgent(teamId: TeamId, playerId: PlayerId): void
  releasePlayer(teamId: TeamId, playerId: PlayerId): void
  purchaseUserCoachSkill(skillId: CoachSkillId): CoachRpgOperationResult
  purchaseUserCoachPerk(perkId: CoachPerkId): CoachRpgOperationResult
  acceptUserCoachOffer(offerId: string): void
  declineUserCoachOffer(offerId: string): void
  applyUserCoachForJob(openingId: string): void
  setTrainingIntensity(intensity: TrainingIntensity): void
  setTrainingFocus(focus: TrainingFocus): void
  scheduleTrainingSession(session: ScheduledTrainingSession): void
  scheduleTeamModuleSession(input: { readonly moduleId: string; readonly date: GameWorld['currentDate']; readonly startTime: string; readonly durationMinutes: number; readonly sessionId: string; readonly intensity?: TrainingIntensity }): void
  cancelTrainingSession(sessionId: string): void
  saveUserTrainingModule(module: UserTrainingModule): void
  deleteUserTrainingModule(moduleId: string): void
  assignTrainingModuleToPlayer(input: { readonly playerId: PlayerId; readonly moduleId: string; readonly date: GameWorld['currentDate']; readonly startTime: string; readonly sessionId: string }): void
  setLineupSlot(slot: LineupSlot, playerId: PlayerId): void
  clearLineupSlot(slot: LineupSlot): void
  updateRotationMinutes(minutesByPeriod: Readonly<Record<PlayerId, readonly number[]>>): void
  updateGamePlanMatchups(matchups: readonly DefensiveMatchupAssignment[]): void
  selectDraftProspect(draftId: string, playerId: PlayerId): void
  executeTrade(proposal: TradeProposal): void
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
  newGame: () => set({ world: createNewGame() }),
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
    set({ world: advanceGameDay(world) })
  },
  continueGame: () => {
    const result = runContinueGame(requireWorld(get().world))
    set({ world: result.world })
    return result
  },
  startNextSeason: () => {
    const world = requireWorld(get().world)
    set({ world: startNextSeason(world) })
  },
  signFreeAgent: (teamId, playerId) => set({ world: signFreeAgent(requireWorld(get().world), teamId, playerId) }),
  releasePlayer: (teamId, playerId) => set({ world: releasePlayer(requireWorld(get().world), teamId, playerId) }),
  purchaseUserCoachSkill: (skillId) => { const result = purchaseCoachSkillRank(requireWorld(get().world), requireWorld(get().world).userCoachId, skillId); if (result.ok) set({ world: result.world }); return result },
  purchaseUserCoachPerk: (perkId) => { const result = purchaseCoachPerk(requireWorld(get().world), requireWorld(get().world).userCoachId, perkId); if (result.ok) set({ world: result.world }); return result },
  acceptUserCoachOffer: (offerId) => set({ world: acceptCoachJobOffer(requireWorld(get().world), offerId) }),
  declineUserCoachOffer: (offerId) => set({ world: declineCoachJobOffer(requireWorld(get().world), offerId) }),
  applyUserCoachForJob: (openingId) => set({ world: applyUserCoachForJob(requireWorld(get().world), openingId).world }),
  setTrainingIntensity: (intensity) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: setTeamTrainingPlan(world, team.id, { intensity }) }) },
  setTrainingFocus: (focus) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: setTeamTrainingPlan(world, team.id, { focus }) }) },
  scheduleTrainingSession: (session) => set({ world: scheduleTrainingSession(requireWorld(get().world), session) }),
  scheduleTeamModuleSession: (input) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: scheduleTeamModuleSession(world, { teamId: team.id, ...input }) }) },
  cancelTrainingSession: (sessionId) => set({ world: cancelScheduledTrainingSession(requireWorld(get().world), sessionId) }),
  saveUserTrainingModule: (module) => set({ world: createOrUpdateUserTrainingModule(requireWorld(get().world), module) }),
  deleteUserTrainingModule: (moduleId) => set({ world: deleteUserTrainingModule(requireWorld(get().world), moduleId) }),
  assignTrainingModuleToPlayer: (input) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: assignTrainingModuleToPlayer(world, { teamId: team.id, ...input }) }) },
  setLineupSlot: (slot, playerId) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: setLineupSlot(world, team.id, slot, playerId) }) },
  clearLineupSlot: (slot) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: clearLineupSlot(world, team.id, slot) }) },
  updateRotationMinutes: (minutesByPeriod) => {
    const world = requireWorld(get().world)
    const team = getUserTeam(world)
    if (team === undefined) return
    const existing = world.rotationPlansByTeamId[team.id]
    const plan: TeamRotationIntent = { teamId: team.id, instructions: existing?.instructions ?? [], minutesByPeriod }
    set({ world: updateRotationPlan(world, plan) })
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
  selectDraftProspect: (draftId, playerId) => set({ world: selectDraftProspect(requireWorld(get().world), draftId, playerId) }),
  executeTrade: (proposal) => set({ world: executeTrade(requireWorld(get().world), proposal).world }),
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
  replaceWorld: (world) => { liveController = null; set({ world }) },
  resetGame: () => { liveController = null; set({ world: null }) },
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
