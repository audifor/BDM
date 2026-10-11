import { BASKETBALL_POSITIONS, type BasketballPosition } from '@/domain/primitives'
import type { TeamId } from '@/domain/ids'
import { getCurrentPlayerContract, getCurrentPlayerInjury, getTeamLineup, getTeamRoster, type GameWorld } from '@/domain/world'

export type RosterManagerPriority = 'keep' | 'develop' | 'explore'
export type RosterManagerPriorities = Readonly<Partial<Record<BasketballPosition,RosterManagerPriority>>>
export const ROSTER_MANAGER_PRIORITY_LABEL: Readonly<Record<RosterManagerPriority,string>> = {
  keep:'Consolidar',develop:'Desarrollar',explore:'Estudiar refuerzo',
}
const TYPES: readonly RosterManagerPriority[]=['keep','develop','explore']

/** Local planning notes, NOT world/save/market transactions. Scoped by user coach, club and season. */
export function rosterManagerPlanKey(world:GameWorld,teamId:TeamId):string {
  return 'bdm:courtside:roster-plan:v1:'+world.userCoachId+':'+teamId+':'+world.currentSeasonId
}
export function readRosterManagerPriorities(world:GameWorld,teamId:TeamId):RosterManagerPriorities {
  try {
    if(typeof localStorage==='undefined')return {}
    const source=localStorage.getItem(rosterManagerPlanKey(world,teamId))
    if(source===null)return {}
    const candidate:unknown=JSON.parse(source)
    if(candidate===null||typeof candidate!=='object'||Array.isArray(candidate))return {}
    const record=candidate as Record<string,unknown>
    const out:Partial<Record<BasketballPosition,RosterManagerPriority>>={}
    for(const position of BASKETBALL_POSITIONS){
      const value=record[position]
      if(TYPES.some(kind=>kind===value))out[position]=value as RosterManagerPriority
    }
    return out
  }catch{return {}}
}
export function saveRosterManagerPriorities(world:GameWorld,teamId:TeamId,priorities:RosterManagerPriorities):void {
  try{
    if(typeof localStorage!=='undefined')localStorage.setItem(rosterManagerPlanKey(world,teamId),JSON.stringify(priorities))
  }catch{/* storage unavailable: state still works in current session */}
}

export interface RosterManagerStatus {
  readonly rosterCount:number
  readonly startingCount:number
  readonly benchCount:number
  readonly missingStarterPositions:readonly BasketballPosition[]
  readonly injuredAssignedCount:number
  readonly injuredPlayerCount:number
  readonly unassignedCount:number
  readonly unverifiedContractCount:number
  readonly positions:readonly {readonly position:BasketballPosition;readonly count:number;readonly isStarterAssigned:boolean}[]
}
export function buildRosterManagerStatus(world:GameWorld,teamId:TeamId):RosterManagerStatus {
  const players=getTeamRoster(world,teamId)
  const lineup=getTeamLineup(world,teamId)
  const starters=lineup===undefined?[]:Object.values(lineup.starters).filter((id):id is typeof players[number]['id']=>id!==undefined)
  const bench=lineup===undefined?[]:Object.values(lineup.bench).filter((id):id is typeof players[number]['id']=>id!==undefined)
  const assigned=new Set([...starters,...bench])
  const injured=new Set(players.filter(p=>getCurrentPlayerInjury(world,p.id)!==undefined).map(p=>p.id))
  return {
    rosterCount:players.length,startingCount:starters.length,benchCount:bench.length,
    missingStarterPositions:BASKETBALL_POSITIONS.filter(pos=>lineup?.starters[pos]===undefined),
    injuredAssignedCount:[...assigned].filter(id=>injured.has(id)).length,
    injuredPlayerCount:injured.size,
    unassignedCount:players.filter(p=>!assigned.has(p.id)).length,
    unverifiedContractCount:players.filter(p=>getCurrentPlayerContract(world,p.id)===undefined).length,
    positions:BASKETBALL_POSITIONS.map(position=>({
      position,count:players.filter(p=>p.basketball.primaryPosition===position).length,
      isStarterAssigned:lineup?.starters[position]!==undefined,
    })),
  }
}
