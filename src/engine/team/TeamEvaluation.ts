import type { Player, PlayerTruthRatings } from '@/domain/player'
import { getAvailableRosterPlayers, type GameWorld } from '@/domain/world'
import type { GameDate } from '@/domain/date'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { TeamStrength } from '@/engine/match'
const POSITIONS = ['PG','SG','SF','PF','C'] as const
/** Rating keys read directly for roster-evaluation purposes (starter ranking, team strength). */
const IMPACT_RATING_KEYS = ['RIM_FINISHING','CONTACT_FINISHING','SHORT_MIDRANGE','LONG_MIDRANGE','THREE_POINT_STATIC','FREE_THROW','DRIVE_CREATION','PASSING_VISION','BALL_CONTROL','POINT_OF_ATTACK_DEFENSE','LATERAL_DEFENSE','RIM_PROTECTION','OFFENSIVE_REBOUNDING','DEFENSIVE_REBOUNDING','SPEED','AGILITY'] as const satisfies readonly (keyof PlayerTruthRatings)[]
/**
 * Contextual roster-evaluation aggregate scoped to starter ranking and team-strength display.
 * Reads PlayerTruthRatings directly; not a persisted or general-purpose "overall" rating.
 */
export function calculatePlayerImpact(player: Player): number { const r=player.basketball.ratings; return IMPACT_RATING_KEYS.reduce((sum,key)=>sum+r[key],0)/IMPACT_RATING_KEYS.length }
export function selectStartingFive(world: GameWorld, teamId: TeamId, onDate:GameDate=world.currentDate, allowedPlayerIds?: readonly PlayerId[]): readonly PlayerId[] { const allowed=allowedPlayerIds===undefined?undefined:new Set(allowedPlayerIds); const roster=getAvailableRosterPlayers(world,teamId,onDate).filter((player)=>allowed===undefined||allowed.has(player.id)); if(roster.length<5) throw new Error('Insufficient available players'); const selected:PlayerId[]=[]; for(const position of POSITIONS){const candidates=roster.filter(p=>p.basketball.primaryPosition===position&&!selected.includes(p.id));const pool=candidates.length?candidates:roster.filter(p=>!selected.includes(p.id));const chosen=[...pool].sort((a,b)=>calculatePlayerImpact(b)-calculatePlayerImpact(a)||(a.id<b.id?-1:1))[0];if(chosen)selected.push(chosen.id)}return selected }
export function calculateTeamStrength(world:GameWorld,teamId:TeamId,onDate:GameDate=world.currentDate, allowedPlayerIds?: readonly PlayerId[]):TeamStrength {const starters=selectStartingFive(world,teamId,onDate,allowedPlayerIds);const value=starters.reduce((sum,id)=>sum+calculatePlayerImpact(world.players[id]!),0)/5;return{teamId,value}}
