import type { CompetitionId, PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { TeamPathwayRelation } from '@/domain/youth/ClubPathway'
import { acceptYouthIntake, configureTeamPathway, getPlayerPathway, getYouthPlayersRequiringDecision, promotePathwayPlayer, releaseYouthPlayer } from '@/engine/youth/YouthPathwayEngine'

/** Application actions consumed by future academy UI and AI. */
export const YouthPathwayService = Object.freeze({
  configure: (world: GameWorld, relation: TeamPathwayRelation) => configureTeamPathway(world, relation),
  intake: (world: GameWorld, input: { cohortId: string; candidateIndex: number; youthTeamId: TeamId; competitionId: CompetitionId; actionId: string; decision: 'ACCEPT' | 'DECLINE' }) => acceptYouthIntake(world, input),
  promote: (world: GameWorld, input: { playerId: PlayerId; toTeamId: TeamId; competitionId?: CompetitionId; actionId: string }) => promotePathwayPlayer(world, input),
  release: (world: GameWorld, input: { playerId: PlayerId; actionId: string }) => releaseYouthPlayer(world, input),
  inspect: (world: GameWorld, playerId: PlayerId) => getPlayerPathway(world, playerId),
  ageOutDecisions: (world: GameWorld) => getYouthPlayersRequiringDecision(world),
  roster: (world: GameWorld, teamId: TeamId) => world.teams[teamId]?.rosterPlayerIds.map((id) => world.players[id]).filter(Boolean) ?? [],
})
