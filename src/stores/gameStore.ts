import {
  advanceGameDay,
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
import { acceptCoachJobOffer, declineCoachJobOffer } from '@/app/coachCareer'
import { getCareerFatigueForPlayer, getLatestTrainingSession, getTrainingPlanForTeam } from '@/domain/world'
import type { TrainingFocus, TrainingIntensity } from '@/domain/training'
import { setTeamTrainingPlan } from '@/engine/training'
import { getUserTeam } from '@/engine/calendar'
import { executeEntityActionResult, type EntityActionExecution } from '@/app/entityActions/EntityActionExecutor'
import type { CommandResult } from '@/app/entityActions/EntityCommand'
import { selectDraftProspect } from '@/app/draft'

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
  startNextSeason(): void
  signFreeAgent(teamId: TeamId, playerId: PlayerId): void
  releasePlayer(teamId: TeamId, playerId: PlayerId): void
  purchaseUserCoachSkill(skillId: CoachSkillId): CoachRpgOperationResult
  purchaseUserCoachPerk(perkId: CoachPerkId): CoachRpgOperationResult
  acceptUserCoachOffer(offerId: string): void
  declineUserCoachOffer(offerId: string): void
  setTrainingIntensity(intensity: TrainingIntensity): void
  setTrainingFocus(focus: TrainingFocus): void
  selectDraftProspect(draftId: string, playerId: PlayerId): void
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
  startLiveMatch: (tacticalPlan) => { liveController = createLiveUserMatch(requireWorld(get().world), tacticalPlan); return liveController.snapshot() },
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
  setTrainingIntensity: (intensity) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: setTeamTrainingPlan(world, team.id, { intensity }) }) },
  setTrainingFocus: (focus) => { const world = requireWorld(get().world); const team = getUserTeam(world); if (team !== undefined) set({ world: setTeamTrainingPlan(world, team.id, { focus }) }) },
  selectDraftProspect: (draftId, playerId) => set({ world: selectDraftProspect(requireWorld(get().world), draftId, playerId) }),
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
export function selectLatestUserTrainingSession(world: GameWorld | null) { const team = world === null ? undefined : getUserTeam(world); return team === undefined || world === null ? undefined : getLatestTrainingSession(world, team.id) }
export function selectUserTeamCareerFatigueSummary(world: GameWorld | null) { const team = world === null ? undefined : getUserTeam(world); if (team === undefined || world === null || team.rosterPlayerIds.length === 0) return 0; return team.rosterPlayerIds.reduce((sum, id) => sum + getCareerFatigueForPlayer(world, id), 0) / team.rosterPlayerIds.length }
