import { describe,expect,it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getPlayerAge } from '@/domain/player'
import { parseGameDate } from '@/domain/date'
import { getTeamRoster, type GameWorld } from '@/domain/world'
import type { ContractId } from '@/domain/ids'
import { getClubRosterCandidates } from './rosterClubPresence'
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_RATING_FAMILY_KEYS } from '@/domain/player/PlayerTruthCatalog'
import { courtsideFamilyColumnIds } from './rosterCourtsideCategories'
import { getUserTeam } from '@/engine/calendar'
import { EMPTY_ROSTER_V4_FILTERS, matchesRosterV4Filters, rosterContractStatus } from './rosterV4Filters'

describe('Courtside Roster V4 filters',()=>{
  it('covers each of the 80 true ratings exactly once in its eight family views',()=>{
    const keys=Object.keys(PLAYER_RATING_FAMILY_KEYS) as (keyof typeof PLAYER_RATING_FAMILY_KEYS)[]
    const all=keys.flatMap(key=>courtsideFamilyColumnIds(key))
    expect(keys).toHaveLength(8)
    expect(PLAYER_TRUTH_RATING_KEYS).toHaveLength(80)
    expect(all).toHaveLength(80)
    expect(new Set(all).size).toBe(80)
    expect(all).toEqual(PLAYER_TRUTH_RATING_KEYS.map(key=>'truth-'+key))
  })

  it('distinguishes players in club roster from those linked by an active club contract',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const onRoster=getTeamRoster(world,team.id)[0]!
    const outside=Object.values(world.players).find(p=>!team.rosterPlayerIds.includes(p.id))!
    expect(outside).toBeDefined()
    const contractId='contract:courtside-test-linked' as ContractId
    const withLink={...world,contractsById:{
      ...world.contractsById,
      [contractId]:{
        id:contractId,playerId:outside.id,teamId:team.id,kind:'standard' as const,
        term:{startsOn:world.currentDate,expiresOn:parseGameDate(`${Number(world.currentDate.slice(0,4))+2}-06-30`)},
        compensation:{annualSalary:100000},
      },
    }} as GameWorld
    const candidates=getClubRosterCandidates(withLink,team.id)
    expect(candidates.some(player=>player.id===onRoster.id)).toBe(true)
    expect(candidates.some(player=>player.id===outside.id)).toBe(true)
    expect(matchesRosterV4Filters(withLink,onRoster,{...EMPTY_ROSTER_V4_FILTERS,club:'in'},team.id)).toBe(true)
    expect(matchesRosterV4Filters(withLink,outside,{...EMPTY_ROSTER_V4_FILTERS,club:'out'},team.id)).toBe(true)
    expect(matchesRosterV4Filters(withLink,onRoster,{...EMPTY_ROSTER_V4_FILTERS,club:'out'},team.id)).toBe(false)
    expect(matchesRosterV4Filters(withLink,outside,{...EMPTY_ROSTER_V4_FILTERS,club:'in'},team.id)).toBe(false)
  })

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
    const impossible={id:'never',field:'age' as const,operator:'lte' as const,value:String(age-100)}
    const matching={id:'yes',field:'age' as const,operator:'gte' as const,value:String(age)}
    const groups=[
      {id:'one',operator:'AND' as const,conditions:[impossible]},
      {id:'two',operator:'OR' as const,conditions:[matching,impossible]},
    ]
    expect(matchesRosterV4Filters(world,player,{...EMPTY_ROSTER_V4_FILTERS,groups,groupOperator:'OR'})).toBe(true)
    expect(matchesRosterV4Filters(world,player,{...EMPTY_ROSTER_V4_FILTERS,groups,groupOperator:'AND'})).toBe(false)
  })
})
