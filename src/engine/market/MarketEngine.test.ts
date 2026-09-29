import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer, signFreeAgent } from '@/app/market'
import { addDays } from '@/domain/date'
import { organizationIdForTeam, staffPersonIdFromString } from '@/domain/ids'
import { createNegotiationContact, getMarketKnowledge, negotiationIdForOpening, negotiationOpeningKeyString, type ContractNegotiation } from '@/domain/market'
import { updateGameWorld } from '@/domain/world'
import { initializeMarketAgents, openNegotiation, progressNegotiationContactResponses, receiveMarketSignal, createNegotiationContact as createContactInEngine } from './MarketEngine'

describe('Wave 4 market core',()=>{
  it('creates deterministic agencies, shared agent portfolios, and sparse market knowledge',()=>{const first=initializeMarketAgents(createNewGame()),second=initializeMarketAgents(createNewGame());expect(first.agenciesById).toEqual(second.agenciesById);expect(first.agentsById).toEqual(second.agentsById);expect(first.playerRepresentations).toEqual(second.playerRepresentations);expect(Object.keys(first.agentsById).length).toBeLessThan(Object.keys(first.players).length);expect(first.marketKnowledge).toEqual([])})
  it('updates only the contacted organization market knowledge without reading market reality',()=>{const world=initializeMarketAgents(createNewGame()),team=Object.values(world.teams)[0]!,player=Object.values(world.players)[0]!,organizationId=organizationIdForTeam(team.id),before=world.marketKnowledge.length;const next=receiveMarketSignal(world,{id:'signal:1',organizationId,playerId:player.id,source:'AGENT',occurredOn:world.currentDate,reliability:.8,availability:'OPEN',expectedSalary:900_000});expect(next.marketKnowledge).toHaveLength(before+1);expect(getMarketKnowledge(next.marketKnowledge,organizationId,player.id)).toMatchObject({availability:'OPEN',expectedSalary:900_000});expect(next.marketRealityByPlayerId[player.id]).toEqual(world.marketRealityByPlayerId[player.id])})
  it('processes a due positive contact once and reveals only scoped contact observations',()=>{
    const initial=initializeMarketAgents(createNewGame()),team=Object.values(initial.teams)[0]!,source=Object.values(initial.teams)[1]!,playerId=source.rosterPlayerIds[0]!,released=releasePlayer(initial,source.id,playerId)
    const reality={...released.marketRealityByPlayerId[playerId]!,playerWillingness:72,expectedSalary:1_250_000,expectedYears:3}
    const responseDate=addDays(released.currentDate,1)
    const world=updateGameWorld(released,{currentDate:responseDate,marketReality:[...Object.values(released.marketRealityByPlayerId).filter(item=>item.playerId!==playerId),reality]})
    const contact=createNegotiationContact({organizationId:team.organizationId,teamId:team.id,playerId,startedOn:released.currentDate,actionKey:'positive-response',responsibleActor:{kind:'USER'}})
    const contacted=updateGameWorld(world,{negotiations:[contact]})
    const answered=progressNegotiationContactResponses(contacted)
    expect(answered.negotiationsById[contact.id]).toMatchObject({status:'CONTACTED',contactResponse:{outcome:'OPEN_TO_TALKS',respondedOn:world.currentDate,marketSignalId:`market-signal:contact-response:${contact.id}`}})
    expect(answered.marketSignalsById[`market-signal:contact-response:${contact.id}`]).toMatchObject({organizationId:team.organizationId,playerInterest:72,expectedSalary:1_250_000,source:'CLUB_CONTACT',reliability:.9})
    expect(answered.marketSignalsById[`market-signal:contact-response:${contact.id}`]).not.toHaveProperty('expectedYears')
    expect(getMarketKnowledge(answered.marketKnowledge,team.organizationId,playerId)).toMatchObject({playerInterest:72,expectedSalary:1_250_000,source:'CLUB_CONTACT',confidence:90,assessedAt:world.currentDate})
    expect(getMarketKnowledge(answered.marketKnowledge,source.organizationId,playerId)).toBeUndefined()
    expect(progressNegotiationContactResponses(contacted)).toEqual(answered)
    expect(progressNegotiationContactResponses(answered)).toBe(answered)
    expect(Object.keys(answered.marketSignalsById)).toHaveLength(Object.keys(contacted.marketSignalsById).length+1)
    expect(answered.negotiationsById[contact.id]).not.toHaveProperty('salary')
    expect(answered.contractsById).toBe(contacted.contractsById)
    expect(answered.playerTransactionsById).toBe(contacted.playerTransactionsById)
    expect(answered.teams[team.id]!.rosterPlayerIds).toEqual(contacted.teams[team.id]!.rosterPlayerIds)
  })
  it('closes a refusal without inventing salary or years and leaves missing reality pending',()=>{
    const initial=initializeMarketAgents(createNewGame()),team=Object.values(initial.teams)[0]!,source=Object.values(initial.teams)[1]!,playerId=source.rosterPlayerIds[0]!,released=releasePlayer(initial,source.id,playerId)
    const reality={...released.marketRealityByPlayerId[playerId]!,playerWillingness:20}
    const ready=updateGameWorld(released,{currentDate:addDays(released.currentDate,1),marketReality:[...Object.values(released.marketRealityByPlayerId).filter(item=>item.playerId!==playerId),reality]})
    const contact=createNegotiationContact({organizationId:team.organizationId,teamId:team.id,playerId,startedOn:released.currentDate,actionKey:'negative-response',responsibleActor:{kind:'USER'}})
    const refused=progressNegotiationContactResponses(updateGameWorld(ready,{negotiations:[contact]}))
    expect(refused.negotiationsById[contact.id]).toMatchObject({status:'CLOSED',contactResponse:{outcome:'NOT_INTERESTED'}})
    expect(refused.marketSignalsById[`market-signal:contact-response:${contact.id}`]).toMatchObject({playerInterest:20,source:'CLUB_CONTACT'})
    expect(refused.marketSignalsById[`market-signal:contact-response:${contact.id}`]).not.toHaveProperty('expectedSalary')
    expect(refused.marketSignalsById[`market-signal:contact-response:${contact.id}`]).not.toHaveProperty('expectedYears')
    const noRealityContact={...contact,id:`${contact.id}:unknown`}
    const noReality=updateGameWorld(ready,{marketReality:Object.values(ready.marketRealityByPlayerId).filter(item=>item.playerId!==playerId),negotiations:[noRealityContact]})
    expect(progressNegotiationContactResponses(noReality)).toBe(noReality)
  })
  it('waits until the day after contact and closes stale contacts without claiming a response',()=>{
    const initial=createNewGame(),team=Object.values(initial.teams)[0]!,source=Object.values(initial.teams)[1]!,playerId=source.rosterPlayerIds[0]!,released=releasePlayer(initial,source.id,playerId)
    const contact=createNegotiationContact({organizationId:team.organizationId,teamId:team.id,playerId,startedOn:released.currentDate,actionKey:'delayed-response',responsibleActor:{kind:'USER'}})
    const sameDay=updateGameWorld(released,{negotiations:[contact]})
    expect(progressNegotiationContactResponses(sameDay)).toBe(sameDay)
    const signed=signFreeAgent(sameDay,source.id,playerId)
    const later=updateGameWorld(signed,{currentDate:addDays(signed.currentDate,1)})
    const stale=progressNegotiationContactResponses(later)
    expect(stale.negotiationsById[contact.id]).toMatchObject({status:'CLOSED'})
    expect(stale.negotiationsById[contact.id]).not.toHaveProperty('contactResponse')
    expect(stale.marketSignalsById).toEqual(later.marketSignalsById)
  })
  it('uses the same response model for user and AI contacts and ignores non-contact states',()=>{
    const initial=initializeMarketAgents(createNewGame()),team=Object.values(initial.teams)[0]!,source=Object.values(initial.teams)[1]!,playerId=source.rosterPlayerIds[0]!,released=releasePlayer(initial,source.id,playerId)
    const due=updateGameWorld(released,{currentDate:addDays(released.currentDate,1)})
    const userContact=createNegotiationContact({organizationId:team.organizationId,teamId:team.id,playerId,startedOn:released.currentDate,actionKey:'same-response',responsibleActor:{kind:'USER'}})
    const aiContact={...userContact,responsibleActor:{kind:'ORGANIZATION' as const}}
    const respond=(contact:ContractNegotiation)=>progressNegotiationContactResponses(updateGameWorld(due,{negotiations:[contact]})).negotiationsById[contact.id]!.contactResponse
    expect(respond(userContact)).toEqual(respond(aiContact))
    const open:ContractNegotiation={...userContact,status:'OPEN',salary:500_000,years:1,role:'DEPTH',agentFee:0,round:0}
    const closed:ContractNegotiation={id:`${userContact.id}:closed`,organizationId:userContact.organizationId,teamId:userContact.teamId,playerId:userContact.playerId,startedOn:userContact.startedOn,actionKey:userContact.actionKey,openingKey:userContact.openingKey,responsibleActor:userContact.responsibleActor,status:'CLOSED'}
    const untouched=updateGameWorld(due,{negotiations:[open,closed]})
    expect(progressNegotiationContactResponses(untouched)).toBe(untouched)
  })
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
