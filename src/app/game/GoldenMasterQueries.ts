import type { CompetitionId, PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getTeamStaffAssignments } from '@/domain/world'

export interface FacilityProjection { readonly id:string;readonly type:'TRAINING'|'MEDICAL';readonly capability:string;readonly source:'trainingPlan'|'staffAssignment' }
/** Projects only existing operational capabilities; the model has no facility-level simulator. */
export function getClubFacilities(world:GameWorld,teamId:TeamId):readonly FacilityProjection[] {
  if(!world.teams[teamId])throw new Error(`Unknown team: ${teamId}`)
  const facilities:FacilityProjection[]=[]
  if(world.trainingPlansByTeamId[teamId])facilities.push({id:`training:${teamId}`,type:'TRAINING',capability:'scheduledTraining',source:'trainingPlan'})
  if(getTeamStaffAssignments(world,teamId).some(assignment=>assignment.role==='medical'))facilities.push({id:`medical:${teamId}`,type:'MEDICAL',capability:'medicalStaff',source:'staffAssignment'})
  return facilities
}
export function getMedicalFacilities(world:GameWorld,teamId:TeamId):readonly FacilityProjection[]{return getClubFacilities(world,teamId).filter(item=>item.type==='MEDICAL')}

/** Read-only DTOs for Golden Master manager surfaces; no UI owns this state. */
export function getMedicalHistory(world: GameWorld, input: { readonly teamId?: TeamId; readonly playerId?: PlayerId; readonly from?: string; readonly to?: string } = {}) {
  const roster = input.teamId === undefined ? undefined : new Set(world.teams[input.teamId]?.rosterPlayerIds ?? [])
  return Object.values(world.injuriesById).filter(injury =>
    (input.playerId === undefined || injury.playerId === input.playerId) && (roster === undefined || roster.has(injury.playerId)) &&
    (input.from === undefined || injury.injuredOn >= input.from) && (input.to === undefined || injury.injuredOn <= input.to),
  ).sort((a,b) => b.injuredOn.localeCompare(a.injuredOn) || a.id.localeCompare(b.id)).map(injury => ({ ...injury, status: injury.expectedReturnDate > world.currentDate ? 'active' as const : 'recovered' as const }))
}

export function getMedicalPreventionAdvisory(world: GameWorld, playerId: PlayerId) {
  const fatigue = world.careerFatigueByPlayerId[playerId] ?? 0
  const activeInjury = Object.values(world.injuriesById).some(injury => injury.playerId === playerId && injury.expectedReturnDate > world.currentDate)
  const recentInjury = Object.values(world.injuriesById).some(injury => injury.playerId === playerId && injury.expectedReturnDate >= world.currentDate)
  const reasons = [ ...(activeInjury ? ['CURRENT_INJURY'] : []), ...(fatigue >= 70 ? ['HIGH_FATIGUE'] : []), ...(recentInjury ? ['RECENT_INJURY'] : []) ]
  return { playerId, level: activeInjury || fatigue >= 70 ? 'HIGH' as const : fatigue >= 40 || recentInjury ? 'ELEVATED' as const : fatigue >= 20 ? 'MODERATE' as const : 'LOW' as const, reasons, fatigue, recoveryContext: Math.max(0, 100 - fatigue) }
}

export type CompetitionPlayerMetric = 'points'|'rebounds'|'assists'|'steals'|'blocks'
export function getCompetitionLeaders(world: GameWorld, competitionId: CompetitionId, metric: CompetitionPlayerMetric, limit = 10) {
  const totals = new Map<PlayerId, { teamId:TeamId; value:number; games:number }>()
  for (const log of Object.values(world.matchStatLogsByGameId)) if (log.competitionId === competitionId) for (const line of log.playerLines) {
    const entry = totals.get(line.playerId) ?? { teamId:line.teamId, value:0, games:0 }; entry.value += line.stats[metric]; entry.games += 1; totals.set(line.playerId,entry)
  }
  return [...totals].map(([playerId,value])=>({playerId,...value,average:value.value/value.games})).sort((a,b)=>b.value-a.value || a.playerId.localeCompare(b.playerId)).slice(0,limit)
}

export function getCompetitionTeamStatistics(world: GameWorld, competitionId: CompetitionId) {
  const totals = new Map<TeamId,{teamId:TeamId;games:number;wins:number;losses:number;pointsFor:number;pointsAgainst:number}>()
  for (const game of Object.values(world.games)) if (game.competitionId===competitionId && game.status==='completed' && game.result!==null) for (const [teamId,own,opponent] of [[game.homeTeamId,game.result.homeScore,game.result.awayScore],[game.awayTeamId,game.result.awayScore,game.result.homeScore]] as const) { const item=totals.get(teamId)??{teamId,games:0,wins:0,losses:0,pointsFor:0,pointsAgainst:0};item.games++;item.pointsFor+=own;item.pointsAgainst+=opponent;if(own>opponent)item.wins++;else item.losses++;totals.set(teamId,item) }
  return [...totals.values()].map(item=>({...item,pointDifferential:item.pointsFor-item.pointsAgainst})).sort((a,b)=>b.wins-a.wins||b.pointDifferential-a.pointDifferential||a.teamId.localeCompare(b.teamId))
}

export function getCompetitionCupProjection(world: GameWorld, competitionId: CompetitionId) { const competition=world.competitions[competitionId]; if(!competition)throw new Error(`Unknown competition: ${competitionId}`); return { competitionId, status:'NO_CUP_STRUCTURE' as const, stages:[] as const } }
