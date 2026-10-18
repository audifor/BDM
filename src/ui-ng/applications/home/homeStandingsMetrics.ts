import type { GameWorld } from '@/domain/world'
import type { SeasonId, TeamId } from '@/domain/ids'
import { isRegularSeasonGame } from '@/domain/season/RegularSeasonScope'

/** Derived only from completed regular-season games, consistent with canonical standings. */
export function homeStandingStreaks(world:GameWorld, seasonId:SeasonId): ReadonlyMap<TeamId,string> {
  const season=world.seasons[seasonId]
  if(season===undefined) return new Map()
  const records=new Map<TeamId,{date:string;id:string;win:boolean}[]>()
  for(const game of Object.values(world.games)){
    if(game.seasonId!==seasonId || game.status!=='completed' || game.result===undefined
      || !isRegularSeasonGame(season,game))continue
    for(const [teamId,win] of [
      [game.homeTeamId,game.result.homeScore>game.result.awayScore],
      [game.awayTeamId,game.result.awayScore>game.result.homeScore],
    ] as const){
      const row=records.get(teamId)??[]
      row.push({date:game.date,id:game.id,win})
      records.set(teamId,row)
    }
  }
  const output=new Map<TeamId,string>()
  for(const [teamId,rows] of records){
    rows.sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))
    if(rows.length===0)continue
    let count=0
    for(const row of rows){if(row.win!==rows[0]!.win)break;count++}
    output.set(teamId,`${rows[0]!.win?'G':'P'}${count}`)
  }
  return output
}
