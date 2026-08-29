import { legacyRatingSignals, type Player } from '@/domain/player'
import { getAvailableRosterPlayers, type GameWorld } from '@/domain/world'
import type { GameDate } from '@/domain/date'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { TeamStrength } from '@/engine/match'
const POSITIONS = ['PG','SG','SF','PF','C'] as const
/** Temporary read-only compatibility aggregate; PlayerTruth remains canonical ratings only. */
export function calculatePlayerImpact(player: Player): number { const r=legacyRatingSignals(player.basketball.ratings); return r.finishing*.15+r.shooting*.15+r.playmaking*.15+r.perimeterDefense*.15+r.interiorDefense*.15+r.rebounding*.15+r.athleticism*.1 }
export function selectStartingFive(world: GameWorld, teamId: TeamId, onDate:GameDate=world.currentDate, allowedPlayerIds?: readonly PlayerId[]): readonly PlayerId[] { const allowed=allowedPlayerIds===undefined?undefined:new Set(allowedPlayerIds); const roster=getAvailableRosterPlayers(world,teamId,onDate).filter((player)=>allowed===undefined||allowed.has(player.id)); if(roster.length<5) throw new Error('Insufficient available players'); const selected:PlayerId[]=[]; for(const position of POSITIONS){const candidates=roster.filter(p=>p.basketball.primaryPosition===position&&!selected.includes(p.id));const pool=candidates.length?candidates:roster.filter(p=>!selected.includes(p.id));const chosen=[...pool].sort((a,b)=>calculatePlayerImpact(b)-calculatePlayerImpact(a)||(a.id<b.id?-1:1))[0];if(chosen)selected.push(chosen.id)}return selected }
export function calculateTeamStrength(world:GameWorld,teamId:TeamId,onDate:GameDate=world.currentDate, allowedPlayerIds?: readonly PlayerId[]):TeamStrength {const starters=selectStartingFive(world,teamId,onDate,allowedPlayerIds);const value=starters.reduce((sum,id)=>sum+calculatePlayerImpact(world.players[id]!),0)/5;return{teamId,value}}
