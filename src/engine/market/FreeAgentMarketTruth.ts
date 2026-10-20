import type { PlayerId } from '@/domain/ids'
import type { MarketReality, PlayerRepresentation } from '@/domain/market'
import { isPlayerFreeAgent, updateGameWorld, type GameWorld } from '@/domain/world'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { createBootstrapMarketAgents } from './MarketEngine'
import { getPlayerMarketTerms } from './PlayerMarketTerms'

/**
 * Hidden market truth for an explicit set of free agents. Expected salary and years are the canonical shared market terms
 * (`getPlayerMarketTerms`, ability based); willingness and competition are seeded per player, so some players decline to talk.
 * Nothing here is tuned for an outcome. Representation uses the same deterministic agent portfolio as `initializeMarketAgents`
 * but only for the supplied players, so rostered players keep their absent MarketReality (AI retention is unchanged).
 */
export function initializeFreeAgentMarketTruth(world: GameWorld, playerIds: readonly PlayerId[]): GameWorld {
  const known = new Set(Object.keys(world.marketRealityByPlayerId))
  const pending = [...playerIds].filter((id) => world.players[id] !== undefined && !known.has(id)).sort()
  if (pending.length === 0) return world
  const portfolio = Object.keys(world.agentsById).length > 0 ? undefined : createBootstrapMarketAgents()
  const agents = portfolio?.agents ?? Object.values(world.agentsById).sort((a, b) => a.id.localeCompare(b.id))
  const representations = new Set(world.playerRepresentations.map((item) => item.playerId))
  const realities: MarketReality[] = pending.map((playerId) => {
    const terms = getPlayerMarketTerms(world, playerId)
    const random = (label: string) => new SeededRandomSource(hashStringToSeed(`free-agent-market-truth-v1:${label}:${playerId}`))
    return {
      playerId,
      availability: 'OPEN',
      expectedSalary: terms.annualSalary,
      expectedYears: terms.contractYears,
      playerWillingness: random('willingness').nextInt(30, 90),
      sellerWillingness: 100,
      competition: random('competition').nextInt(0, 5),
    }
  })
  const newRepresentations: PlayerRepresentation[] = agents.length === 0 ? [] : pending.filter((id) => !representations.has(id)).map((playerId, index) => ({
    playerId, agentId: agents[index % agents.length]!.id, trust: 55 + (index % 30), startedOn: world.currentDate,
  }))
  return updateGameWorld(world, {
    ...(portfolio === undefined ? {} : { agencies: portfolio.agencies, agents: portfolio.agents }),
    playerRepresentations: [...world.playerRepresentations, ...newRepresentations],
    marketReality: [...Object.values(world.marketRealityByPlayerId), ...realities],
  })
}

/**
 * Any player can become a free agent after the world was created (a release, an expired contract). The hidden market truth of such a
 * player is derived exactly like the one of the opening pool, the first day a club's contact is waiting for his answer, so no free
 * agent is unreachable for the manager. Only the manager's own contacts are served; players that already have a truth, and contacts
 * that are not pending, are untouched.
 */
export function ensureFreeAgentMarketTruthForPendingContacts(world: GameWorld): GameWorld {
  const missing = Object.values(world.negotiationsById)
    .filter((item) => item.status === 'CONTACTED' && item.contactResponse === undefined && (item.startedOn === undefined || item.startedOn < world.currentDate)
      && item.teamId !== undefined && world.teams[item.teamId]?.coachId === world.userCoachId
      && world.marketRealityByPlayerId[item.playerId] === undefined && isPlayerFreeAgent(world, item.playerId))
    .map((item) => item.playerId)
  return missing.length === 0 ? world : initializeFreeAgentMarketTruth(world, [...new Set(missing)])
}
