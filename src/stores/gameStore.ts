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
import { getUserCoachReputationProfile } from '@/domain/world'
import { getRecentCoachReputationEvents, type CoachReputationProfile } from '@/domain/coachReputation'
import { purchaseCoachPerk, purchaseCoachSkillRank, type CoachRpgOperationResult } from '@/engine/coach'
import type { ManualSubstitution, MatchSimulation, MatchTacticalPlan } from '@/engine/match'
import type { LiveMatchController, LiveMatchStep } from '@/app/game'
import { create } from 'zustand'

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
