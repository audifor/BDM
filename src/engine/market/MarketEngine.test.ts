import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market'
import { organizationIdForTeam } from '@/domain/ids'
import { createNegotiationContact, getMarketKnowledge, negotiationIdForOpening, negotiationOpeningKeyString, type ContractNegotiation } from '@/domain/market'
import { updateGameWorld } from '@/domain/world'
import { initializeMarketAgents, openNegotiation, receiveMarketSignal } from './MarketEngine'

describe('Wave 4 market core',()=>{
  it('creates deterministic agencies, shared agent portfolios, and sparse market knowledge',()=>{const first=initializeMarketAgents(createNewGame()),second=initializeMarketAgents(createNewGame());expect(first.agenciesById).toEqual(second.agenciesById);expect(first.agentsById).toEqual(second.agentsById);expect(first.playerRepresentations).toEqual(second.playerRepresentations);expect(Object.keys(first.agentsById).length).toBeLessThan(Object.keys(first.players).length);expect(first.marketKnowledge).toEqual([])})
  it('updates only the contacted organization market knowledge without reading market reality',()=>{const world=initializeMarketAgents(createNewGame()),team=Object.values(world.teams)[0]!,player=Object.values(world.players)[0]!,organizationId=organizationIdForTeam(team.id),before=world.marketKnowledge.length;const next=receiveMarketSignal(world,{id:'signal:1',organizationId,playerId:player.id,source:'AGENT',occurredOn:world.currentDate,reliability:.8,availability:'OPEN',expectedSalary:900_000});expect(next.marketKnowledge).toHaveLength(before+1);expect(getMarketKnowledge(next.marketKnowledge,organizationId,player.id)).toMatchObject({availability:'OPEN',expectedSalary:900_000});expect(next.marketRealityByPlayerId[player.id]).toEqual(world.marketRealityByPlayerId[player.id])})
  it('represents pre-offer contact without creating offer terms',()=>{
    const world=createNewGame(),team=Object.values(world.teams)[0]!,player=Object.values(world.players)[0]!
    const contact=createNegotiationContact({organizationId:team.organizationId,teamId:team.id,playerId:player.id,startedOn:world.currentDate,actionKey:'plan-a:proposal-a',sourcePlanId:'plan-a',sourceProposalId:'proposal-a',responsibleActor:{kind:'USER'}})
    expect(contact).toMatchObject({status:'CONTACTED',teamId:team.id,startedOn:world.currentDate})
    expect(contact).not.toHaveProperty('salary');expect(contact).not.toHaveProperty('years');expect(contact).not.toHaveProperty('role');expect(contact).not.toHaveProperty('agentFee')
    expect(updateGameWorld(world,{negotiations:[contact]}).negotiationsById[contact.id]).toEqual(contact)
    expect(()=>updateGameWorld(world,{negotiations:[contact,{id:'legacy-parallel',organizationId:team.organizationId,playerId:player.id,salary:500_000,years:1,role:'DEPTH',agentFee:0,status:'OPEN',round:0}]})).toThrow(/Multiple active negotiations/)
  })
  it('advances the same contact record into a formal first offer only when exact terms are supplied',()=>{
    const initial=createNewGame(),team=Object.values(initial.teams)[1]!,source=Object.values(initial.teams).find(item=>item.id!==team.id)!,playerId=source.rosterPlayerIds[0]!,world=releasePlayer(initial,source.id,playerId)
    const actionKey='plan-contact:proposal-contact'
    const contact=createNegotiationContact({organizationId:team.organizationId,teamId:team.id,playerId,startedOn:world.currentDate,actionKey,sourcePlanId:'plan-contact',sourceProposalId:'proposal-contact',responsibleActor:{kind:'ORGANIZATION'}})
    const contacted=updateGameWorld(world,{negotiations:[contact]})
    const offered=openNegotiation(contacted,{organizationId:team.organizationId,teamId:team.id,playerId,salary:650_000,years:2,role:'ROTATION',agentFee:1,actionKey,sourcePlanId:'plan-contact',sourceProposalId:'proposal-contact',responsibleActor:{kind:'ORGANIZATION'}})
    expect(Object.keys(offered.negotiationsById)).toEqual([contact.id])
    expect(offered.negotiationsById[contact.id]).toMatchObject({status:'OPEN',startedOn:contact.startedOn,salary:650_000,years:2,role:'ROTATION',agentFee:1})
    expect(contacted.negotiationsById[contact.id]).not.toHaveProperty('salary')
  })
  it('uses a stable action identity, blocks a second active team/player attempt, and allows a later attempt after closure',()=>{
    const initial=createNewGame(),team=Object.values(initial.teams)[1]!,source=Object.values(initial.teams).find(item=>item.id!==team.id)!,playerId=source.rosterPlayerIds[0]!
    const world=releasePlayer(initial,source.id,playerId)
    const input={organizationId:team.organizationId,teamId:team.id,playerId,salary:650_000,years:2,role:'ROTATION' as const,agentFee:1,actionKey:'plan-a:proposal-a',sourcePlanId:'plan-a',sourceProposalId:'proposal-a',responsibleActor:{kind:'ORGANIZATION' as const}}
    const opened=openNegotiation(world,input)
    expect(opened.negotiationsById[Object.keys(opened.negotiationsById)[0]!]).toMatchObject({status:'OPEN',teamId:team.id,startedOn:world.currentDate,openingKey:negotiationOpeningKeyString({organizationId:team.organizationId,teamId:team.id,playerId,actionKey:'plan-a:proposal-a'})})
    expect(openNegotiation(opened,input)).toBe(opened)
    expect(()=>openNegotiation(opened,{...input,actionKey:'plan-a:proposal-b'})).toThrow(/active negotiation already exists/)
    const closedNegotiations: ContractNegotiation[] = Object.values(opened.negotiationsById).map(item=>item.status==='OPEN'||item.status==='COUNTERED'||item.status==='ACCEPTED'||item.status==='REJECTED'?{...item,status:'REJECTED' as const,round:1}:item)
    const closed=updateGameWorld(opened,{negotiations:closedNegotiations})
    const later=openNegotiation(closed,{...input,actionKey:'plan-b:proposal-a',sourcePlanId:'plan-b'})
    expect(Object.keys(later.negotiationsById)).toHaveLength(2)
    expect(Object.values(later.negotiationsById).map(item=>item.id)).toEqual(expect.arrayContaining([negotiationIdForOpening({organizationId:team.organizationId,teamId:team.id,playerId,actionKey:'plan-a:proposal-a'}),negotiationIdForOpening({organizationId:team.organizationId,teamId:team.id,playerId,actionKey:'plan-b:proposal-a'})]))
    expect(openNegotiation(closed,input)).toBe(closed)
  })
  it('rechecks free-agent status at the formal offer boundary',()=>{
    const world=createNewGame(),team=Object.values(world.teams)[0]!,playerId=team.rosterPlayerIds[0]!
    expect(()=>openNegotiation(world,{organizationId:team.organizationId,teamId:team.id,playerId,salary:650_000,years:2,role:'ROTATION',agentFee:1,actionKey:'proposal-a',responsibleActor:{kind:'USER'}})).toThrow(/no longer a free agent/)
  })
  it('rechecks current payroll affordability at the formal offer boundary',()=>{
    const initial=createNewGame(),team=Object.values(initial.teams)[1]!,source=Object.values(initial.teams).find(item=>item.id!==team.id)!,playerId=source.rosterPlayerIds[0]!,world=releasePlayer(initial,source.id,playerId)
    expect(()=>openNegotiation(world,{organizationId:team.organizationId,teamId:team.id,playerId,salary:10_000_000_000,years:2,role:'ROTATION',agentFee:1,actionKey:'unaffordable-offer',responsibleActor:{kind:'USER'}})).toThrow(/cannot afford/)
  })
})
