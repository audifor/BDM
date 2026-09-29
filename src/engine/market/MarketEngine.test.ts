import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market'
import { organizationIdForTeam, staffPersonIdFromString } from '@/domain/ids'
import { createNegotiationContact, getMarketKnowledge, negotiationIdForOpening, negotiationOpeningKeyString, type ContractNegotiation } from '@/domain/market'
import { updateGameWorld } from '@/domain/world'
import { initializeMarketAgents, openNegotiation, receiveMarketSignal, createNegotiationContact as createContactInEngine } from './MarketEngine'

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

  it('creates one authorized term-free contact and persists the delegated actor and current source',()=>{
    const initial=createNewGame(),team=Object.values(initial.teams).find(item=>item.coachId!==undefined&&item.coachId!==initial.userCoachId)!,source=Object.values(initial.teams).find(item=>item.id!==team.id)!,playerId=source.rosterPlayerIds[0]!
    const released=releasePlayer(initial,source.id,playerId)
    const world=updateGameWorld(released,{userCoachId:team.coachId!})
    const input={organizationId:team.organizationId,teamId:team.id,playerId,startedOn:world.currentDate,actionKey:'current-plan:current-proposal',responsibleActor:{kind:'USER' as const},sourcePlanId:'current-plan',sourceProposalId:'current-proposal'}
    const result=createContactInEngine(world,input)
    expect(result.status).toBe('CREATED')
    if(result.status!=='CREATED') throw new Error('expected contact creation')
    expect(result.contact).toMatchObject({status:'CONTACTED',startedOn:world.currentDate,actionKey:input.actionKey,sourcePlanId:input.sourcePlanId,sourceProposalId:input.sourceProposalId,responsibleActor:input.responsibleActor})
    expect(result.contact.openingKey).toBe(negotiationOpeningKeyString({organizationId:team.organizationId,teamId:team.id,playerId,actionKey:input.actionKey}))
    for(const term of ['salary','years','role','agentFee']) expect(result.contact).not.toHaveProperty(term)
    expect(result.world.contractsById).toBe(world.contractsById)
    expect(result.world.playerTransactionsById).toBe(world.playerTransactionsById)
    expect(result.world.governanceRequestsById).toBe(world.governanceRequestsById)
    expect(result.world.governanceDecisionsById).toBe(world.governanceDecisionsById)
    expect(result.world.treasuryApplicationsById).toBe(world.treasuryApplicationsById)
    expect(result.world.marketKnowledge).toBe(world.marketKnowledge)
    expect(result.world.teams[team.id]!.rosterPlayerIds).toEqual(world.teams[team.id]!.rosterPlayerIds)
    const repeated=createContactInEngine(result.world,input)
    expect(repeated.status).toBe('ALREADY_EXISTS')
    expect(repeated.world).toBe(result.world)
    expect(Object.keys(repeated.world.negotiationsById)).toHaveLength(Object.keys(result.world.negotiationsById).length)
  })

  it('blocks unauthorized, malformed, non-free-agent, and conflicting active contacts without mutation',()=>{
    const initial=createNewGame(),team=Object.values(initial.teams).find(item=>item.coachId!==undefined&&item.coachId!==initial.userCoachId)!,source=Object.values(initial.teams).find(item=>item.id!==team.id)!,playerId=source.rosterPlayerIds[0]!,world=releasePlayer(initial,source.id,playerId)
    const input={organizationId:team.organizationId,teamId:team.id,playerId,startedOn:world.currentDate,actionKey:'plan:proposal',responsibleActor:{kind:'USER' as const},sourcePlanId:'plan',sourceProposalId:'proposal'}
    expect(createContactInEngine(world,input)).toMatchObject({status:'BLOCKED',reason:'CONTACT_ACTOR_NOT_AUTHORIZED',world})
    expect(createContactInEngine(world,{...input,organizationId:organizationIdForTeam(source.id)})).toMatchObject({status:'BLOCKED',reason:'TEAM_OR_ORGANIZATION_MISMATCH',world})
    expect(createContactInEngine(world,{...input,actionKey:'  '})).toMatchObject({status:'BLOCKED',reason:'CONTACT_SOURCE_OR_ACTION_KEY_REQUIRED',world})
    expect(createContactInEngine(world,{...input,startedOn:'1900-01-01' as never})).toMatchObject({status:'BLOCKED',reason:'CONTACT_DATE_IS_NOT_CURRENT',world})
    expect(createContactInEngine(world,{...input,playerId:team.rosterPlayerIds[0]!})).toMatchObject({status:'PLAYER_NOT_FREE_AGENT',world})
    const userWorld=updateGameWorld(world,{userCoachId:team.coachId!})
    const authorized={...input,responsibleActor:{kind:'USER' as const}}
    const created=createContactInEngine(userWorld,authorized)
    expect(created.status).toBe('CREATED')
    expect(createContactInEngine(created.status==='CREATED'?created.world:userWorld,{...authorized,actionKey:'another:proposal'})).toMatchObject({status:'ACTIVE_NEGOTIATION_EXISTS'})
    expect(Object.keys(userWorld.negotiationsById)).toHaveLength(0)
  })

  it('allows a new canonical contact after an earlier attempt is closed',()=>{
    const initial=createNewGame(),team=Object.values(initial.teams).find(item=>item.coachId!==undefined&&item.coachId!==initial.userCoachId)!,source=Object.values(initial.teams).find(item=>item.id!==team.id)!,playerId=source.rosterPlayerIds[0]!,world=releasePlayer(initial,source.id,playerId),userWorld=updateGameWorld(world,{userCoachId:team.coachId!})
    const first=createContactInEngine(userWorld,{organizationId:team.organizationId,teamId:team.id,playerId,startedOn:userWorld.currentDate,actionKey:'plan-a:proposal-a',responsibleActor:{kind:'USER'},sourcePlanId:'plan-a',sourceProposalId:'proposal-a'})
    if(first.status!=='CREATED') throw new Error('expected first contact')
    const closedContact=first.contact.status==='CONTACTED'?{...first.contact,status:'CLOSED' as const}:first.contact
    const closed=updateGameWorld(first.world,{negotiations:Object.values(first.world.negotiationsById).map(item=>item.id===first.contact.id?closedContact:item)})
    const later=createContactInEngine(closed,{organizationId:team.organizationId,teamId:team.id,playerId,startedOn:closed.currentDate,actionKey:'plan-b:proposal-b',responsibleActor:{kind:'USER'},sourcePlanId:'plan-b',sourceProposalId:'proposal-b'})
    expect(later.status).toBe('CREATED')
    expect(Object.values(later.world.negotiationsById).map(item=>item.status)).toEqual(['CLOSED','CONTACTED'])
  })
})
