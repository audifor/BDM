import type { InjuryRecord } from '@/domain/injury'
import type { GameId } from '@/domain/ids'
import { getActiveInjuryForPlayer, isPlayerAvailable, updateGameWorld, type GameWorld } from '@/domain/world'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { createDeterministicInjury, deterministicInjuryKind } from './InjuryCreation'
import { boundedInjuryProbability, careerLoadRiskMultiplier, recurrenceRiskMultiplier } from './InjuryRisk'

export function injuryProbability(secondsPlayed:number, fatigue = 0, recurrence = 1):number {
  if (secondsPlayed <= 0) return 0
  const exposure = .005 + .015 * Math.max(0, Math.min(1, secondsPlayed / (40 * 60)))
  return boundedInjuryProbability(exposure, [careerLoadRiskMultiplier(fatigue), recurrence])
}
export function generatePostMatchInjuries(world:GameWorld,gameId:GameId):readonly InjuryRecord[]{const game=world.games[gameId];const log=world.matchStatLogsByGameId[gameId];if(!game||!log)throw new Error('Completed Game and MatchStatLog are required');return log.playerLines.filter(l=>l.stats.secondsPlayed>0&&!getActiveInjuryForPlayer(world,l.playerId,game.date)).flatMap(line=>{const playerId=line.playerId;const kind=deterministicInjuryKind('MATCH',gameId,playerId);const fatigue=world.careerFatigueByPlayerId[playerId]??0;const probability=injuryProbability(line.stats.secondsPlayed,fatigue,recurrenceRiskMultiplier(world,playerId,kind,game.date));const occurrence=new SeededRandomSource(hashStringToSeed(`player-injury-occurrence-v1:${gameId}:${playerId}`));if(occurrence.nextFloat(0,1)>=probability)return[];return [createDeterministicInjury({playerId,injuredOn:game.date,source:'MATCH',sourceId:gameId,sourceGameId:gameId})]})}
export function applyPostMatchInjuries(world:GameWorld,gameId:GameId):GameWorld{const candidates=generatePostMatchInjuries(world,gameId);const game=world.games[gameId]!;const available=new Map([game.homeTeamId,game.awayTeamId].map(id=>[id,Object.values(world.teams[id]!.rosterPlayerIds).filter(playerId=>isPlayerAvailable(world,playerId,game.date)).length]));const applied=[...candidates].sort((a,b)=>a.playerId.localeCompare(b.playerId)).filter(injury=>{const teamId=world.teams[game.homeTeamId]!.rosterPlayerIds.includes(injury.playerId)?game.homeTeamId:game.awayTeamId;const count=available.get(teamId)!;if(count<=5)return false;available.set(teamId,count-1);return true});return applied.length===0?world:updateGameWorld(world,{injuries:[...Object.values(world.injuriesById),...applied]})}
