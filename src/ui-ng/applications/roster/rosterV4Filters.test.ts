import { describe,expect,it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getPlayerAge } from '@/domain/player'
import { getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { EMPTY_ROSTER_V4_FILTERS, matchesRosterV4Filters, rosterContractStatus } from './rosterV4Filters'

describe('Courtside Roster V4 filters',()=>{
  it('does not filter out players in the default state',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const players=getTeamRoster(world,team.id)
    expect(players.length).toBeGreaterThan(0)
    expect(players.every(player=>matchesRosterV4Filters(world,player,EMPTY_ROSTER_V4_FILTERS))).toBe(true)
  })

  it('uses canonical primary position, age and contract rather than inferred overall',()=>{
    const world=createNewGame()
    const player=getTeamRoster(world,getUserTeam(world)!.id)[0]!
    const age=getPlayerAge(world,player.id)
    expect(matchesRosterV4Filters(world,player,{...EMPTY_ROSTER_V4_FILTERS,ageMax:age-1})).toBe(false)
    expect(matchesRosterV4Filters(world,player,{...EMPTY_ROSTER_V4_FILTERS,ageMax:age})).toBe(true)
    const state=rosterContractStatus(world,player)
    expect(matchesRosterV4Filters(world,player,{...EMPTY_ROSTER_V4_FILTERS,contract:state})).toBe(true)
    expect(matchesRosterV4Filters(world,player,{...EMPTY_ROSTER_V4_FILTERS,
      groups:[{id:'a',operator:'AND',conditions:[{id:'b',field:'position',operator:'equals',value:player.basketball.primaryPosition}]}],
    })).toBe(true)
  })

  it('supports nested AND/OR groups independently of the active column preset',()=>{
    const world=createNewGame()
    const player=getTeamRoster(world,getUserTeam(world)!.id)[0]!
    const age=getPlayerAge(world,player.id)
    const impossible={id:'never',field:'age',operator:'lte' as const,value:String(age-100)}
    const matching={id:'yes',field:'age',operator:'gte' as const,value:String(age)}
    const groups=[
      {id:'one',operator:'AND' as const,conditions:[impossible]},
      {id:'two',operator:'OR' as const,conditions:[matching,impossible]},
    ]
    expect(matchesRosterV4Filters(world,player,{...EMPTY_ROSTER_V4_FILTERS,groups,groupOperator:'OR'})).toBe(true)
    expect(matchesRosterV4Filters(world,player,{...EMPTY_ROSTER_V4_FILTERS,groups,groupOperator:'AND'})).toBe(false)
  })
})
