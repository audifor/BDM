import type { InjuryRecord } from '@/domain/injury'
import type { GameId, TeamId } from '@/domain/ids'
import { getActiveInjuryForPlayer, updateGameWorld, type GameWorld } from '@/domain/world'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { createDeterministicInjury, deterministicInjuryKind } from './InjuryCreation'
import { boundedInjuryProbability, careerLoadRiskMultiplier, recurrenceRiskMultiplier } from './InjuryRisk'
import { selectRecordableInjuries } from './InjuryApplication'

export function injuryProbability(secondsPlayed:number, fatigue = 0, recurrence = 1):number {
  if (secondsPlayed <= 0) return 0
  const exposure = .005 + .015 * Math.max(0, Math.min(1, secondsPlayed / (40 * 60)))
  return boundedInjuryProbability(exposure, [careerLoadRiskMultiplier(fatigue), recurrence])
}
export function generatePostMatchInjuries(world:GameWorld,gameId:GameId):readonly InjuryRecord[]{const game=world.games[gameId];const log=world.matchStatLogsByGameId[gameId];if(!game||!log)throw new Error('Completed Game and MatchStatLog are required');return log.playerLines.filter(l=>l.stats.secondsPlayed>0&&!getActiveInjuryForPlayer(world,l.playerId,game.date)).flatMap(line=>{const playerId=line.playerId;const kind=deterministicInjuryKind('MATCH',gameId,playerId);const fatigue=world.careerFatigueByPlayerId[playerId]??0;const probability=injuryProbability(line.stats.secondsPlayed,fatigue,recurrenceRiskMultiplier(world,playerId,kind,game.date));const occurrence=new SeededRandomSource(hashStringToSeed(`player-injury-occurrence-v1:${gameId}:${playerId}`));if(occurrence.nextFloat(0,1)>=probability)return[];return [createDeterministicInjury({playerId,injuredOn:game.date,source:'MATCH',sourceId:gameId,sourceGameId:gameId})]})}
/** Applies the Game's post-match injuries through the canonical injury-application rules (no overlap, playable minimum kept). */
export function applyPostMatchInjuries(world: GameWorld, gameId: GameId): GameWorld {
  const game = world.games[gameId]
  if (game === undefined) throw new Error('Completed Game is required')
  const candidates = [...generatePostMatchInjuries(world, gameId)].sort((a, b) => a.playerId.localeCompare(b.playerId))
  // The MatchStatLog already ties every injured Player to one of the Game's two Teams.
  const teamIdForInjury = (injury: InjuryRecord): TeamId => (world.teams[game.homeTeamId]!.rosterPlayerIds.includes(injury.playerId) ? game.homeTeamId : game.awayTeamId)
  const applied = selectRecordableInjuries(world, candidates, teamIdForInjury, game.date)
  return applied.length === 0 ? world : updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), ...applied] })
}
