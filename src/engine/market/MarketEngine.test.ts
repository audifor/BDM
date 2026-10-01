import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer, signFreeAgent } from '@/app/market'
import { addDays } from '@/domain/date'
import { agentIdFromString, organizationIdForTeam, playerIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { agentCounter, createNegotiationContact, getMarketKnowledge, negotiationContactActor, negotiationOfferActor, negotiationOpeningKeyString, type Agent, type ContractNegotiation } from '@/domain/market'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { updateGameWorld } from '@/domain/world'
import { formalOfferCounterSignalId, initializeMarketAgents, openNegotiation, progressFormalOfferResponses, progressNegotiationContactResponses, receiveMarketSignal, createNegotiationContact as createContactInEngine } from './MarketEngine'

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
  it('advances the exact positive contact with a separate authorized offer actor and optional role and fee',()=>{
    const setup=userContactFixture()
    const otherTeam=Object.values(setup.world.teams).find(item=>item.id!==setup.team.id&&item.coachId!==undefined)!
    const staffPersonId=staffPersonIdFromString('staff:offer-execution-test')
    const assignmentId=teamStaffAssignmentIdFromString('assignment:offer-execution-test')
    const responsibilityId=responsibilityIdForTeam(setup.team.id,'submitPlayerContractOffer')
    const world=updateGameWorld(setup.world,{userCoachId:otherTeam.coachId!,staffPeople:[...Object.values(setup.world.staffPeopleById),{id:staffPersonId,identity:{firstName:'Offer',lastName:'Operator'},professional:{attributes:Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map(key=>[key,70])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number],number>}}],teamStaffAssignments:[...Object.values(setup.world.teamStaffAssignmentsById),{id:assignmentId,staffPersonId,teamId:setup.team.id,role:'generalManager',assignedOn:setup.world.currentDate}],responsibilities:[...Object.values(setup.world.responsibilitiesById).filter(item=>item.id!==responsibilityId),{id:responsibilityId,teamId:setup.team.id,kind:'submitPlayerContractOffer',mode:'delegated',holderStaffId:staffPersonId}]})
    const input={...openInput(setup),offerResponsibleActor:{kind:'STAFF' as const,staffPersonId}}
    const offered=openNegotiation(world,input)
    expect(Object.keys(offered.negotiationsById)).toEqual([setup.contact.id])
    expect(offered.negotiationsById[setup.contact.id]).toMatchObject({status:'OPEN',startedOn:setup.contact.startedOn,offerSubmittedOn:setup.world.currentDate,contactResponse:setup.contact.contactResponse,salary:650_000,years:2,offerResponsibleActor:input.offerResponsibleActor,sourcePlanId:setup.sourcePlanId,sourceProposalId:setup.sourceProposalId})
    expect(offered.negotiationsById[setup.contact.id]!.offerSubmittedOn).not.toBe(setup.contact.startedOn)
    expect(offered.negotiationsById[setup.contact.id]).not.toHaveProperty('role')
    expect(offered.negotiationsById[setup.contact.id]).not.toHaveProperty('agentFee')
    expect(negotiationContactActor(offered.negotiationsById[setup.contact.id]!)).toEqual({kind:'USER'})
    expect(negotiationOfferActor(offered.negotiationsById[setup.contact.id]!)).toEqual(input.offerResponsibleActor)
    expect(offered.contractsById).toBe(world.contractsById)
    expect(offered.playerTransactionsById).toBe(world.playerTransactionsById)
  })
  it('preserves canonical action identity and makes the same offer idempotent',()=>{
    const setup=userContactFixture(),input=openInput(setup)
    const opened=openNegotiation(setup.world,input)
    expect(opened.negotiationsById[setup.contact.id]).toMatchObject({status:'OPEN',teamId:setup.team.id,actionKey:setup.actionKey,openingKey:negotiationOpeningKeyString({organizationId:setup.team.organizationId,teamId:setup.team.id,playerId:setup.playerId,actionKey:setup.actionKey})})
    expect(openNegotiation(opened,input)).toBe(opened)
    expect(()=>openNegotiation(opened,{...input,salary:700_000})).toThrow(/already in use/)
    const firstOffer=opened.negotiationsById[setup.contact.id]!
    if(firstOffer.status!=='OPEN') throw new Error('expected OPEN offer')
    const countered=updateGameWorld(opened,{negotiations:[{...firstOffer,status:'COUNTERED',round:1}]})
    expect(()=>openNegotiation(countered,input)).toThrow(/already in use/)
    expect(()=>openNegotiation(setup.world,{...input,actionKey:'second-attempt'})).toThrow(/exact existing CONTACTED/)
  })
  it('counters salary without manufacturing a missing agent fee',()=>{
    const setup=userContactFixture()
    const opened=openNegotiation(setup.world,openInput(setup)).negotiationsById[setup.contact.id]!
    const agent:Agent={id:agentIdFromString('agent:counter-test'),name:'Counter Agent',reputation:70,abilities:{negotiation:80,marketKnowledge:70,network:60,clientManagement:70,mediaInfluence:50},personality:{aggressiveness:60,loyalty:50,opportunism:55,patience:50,discretion:50}}
    const counter=agentCounter(opened,agent)
    expect(counter).toMatchObject({status:'COUNTERED',salary:expect.any(Number),years:2})
    expect(counter.salary!).toBeGreaterThan(opened.salary!)
    expect(counter.offerSubmittedOn).toBe(opened.offerSubmittedOn)
    expect(counter).not.toHaveProperty('agentFee')
  })
  it('responds to due OPEN offers once, accepts salary terms, and preserves the exact agreed offer',()=>{
    const setup=userContactFixture()
    const initialized=initializeMarketAgents(setup.world)
    const opened=openNegotiation(initialized,openInput(setup))
    const reality={...opened.marketRealityByPlayerId[setup.playerId]!,expectedSalary:600_000,expectedYears:4}
    const due=updateGameWorld(opened,{currentDate:addDays(opened.currentDate,1),marketReality:[...Object.values(opened.marketRealityByPlayerId).filter(item=>item.playerId!==setup.playerId),reality]})
    expect(progressFormalOfferResponses(opened)).toBe(opened)
    const accepted=progressFormalOfferResponses(due)
    const agreement=accepted.negotiationsById[setup.contact.id]!
    expect(agreement).toMatchObject({status:'ACCEPTED',salary:650_000,years:2,playerResponse:{outcome:'ACCEPTED',respondedOn:due.currentDate,origin:'PLAYER'},round:0})
    expect(agreement.roundHistory).toEqual([{round:0,offer:{salary:650_000,years:2},submittedOn:opened.currentDate,submittedBy:{kind:'USER'},playerResponse:agreement.playerResponse}])
    expect(progressFormalOfferResponses(accepted)).toBe(accepted)
    expect(progressFormalOfferResponses(due)).toEqual(accepted)
    expect(accepted.contractsById).toBe(due.contractsById)
    expect(accepted.playerTransactionsById).toBe(due.playerTransactionsById)
    expect(accepted.teams[setup.team.id]!.rosterPlayerIds).toEqual(due.teams[setup.team.id]!.rosterPlayerIds)
    expect(accepted.governanceRequestsById).toBe(due.governanceRequestsById)
  })
  it('uses the canonical agent counter, records its round and date, and reveals only the counter salary',()=>{
    const setup=userContactFixture()
    const initialized=initializeMarketAgents(setup.world)
    const currentRepresentation=initialized.playerRepresentations.find(item=>item.playerId===setup.playerId)!
    const offerAgent=Object.values(initialized.agentsById).find(item=>item.id!==currentRepresentation.agentId)!
    const opened=openNegotiation(initialized,{...openInput(setup),agentId:offerAgent.id})
    const changedRepresentation=updateGameWorld(opened,{playerRepresentations:opened.playerRepresentations.map(item=>item.playerId===setup.playerId?{...item,agentId:currentRepresentation.agentId}:item)})
    const reality={...changedRepresentation.marketRealityByPlayerId[setup.playerId]!,expectedSalary:2_000_000,expectedYears:5}
    const due=updateGameWorld(changedRepresentation,{currentDate:addDays(changedRepresentation.currentDate,1),marketReality:[...Object.values(changedRepresentation.marketRealityByPlayerId).filter(item=>item.playerId!==setup.playerId),reality]})
    const first=progressFormalOfferResponses(due)
    const repeated=progressFormalOfferResponses(due)
    const countered=first.negotiationsById[setup.contact.id]!
    expect(countered).toMatchObject({status:'COUNTERED',round:1,years:2,playerResponse:{outcome:'COUNTERED',respondedOn:due.currentDate,origin:'AGENT',counterTerms:{salary:countered.salary,years:2}}})
    expect(countered.salary).toBe(agentCounter(opened.negotiationsById[setup.contact.id]!,offerAgent).salary)
    expect(countered.roundHistory?.[0]).toMatchObject({round:0,offer:{salary:650_000,years:2},playerResponse:{outcome:'COUNTERED',origin:'AGENT',counterTerms:{salary:countered.salary,years:2}}})
    expect(countered).not.toHaveProperty('role')
    expect(countered).not.toHaveProperty('agentFee')
    expect(first.marketSignalsById[formalOfferCounterSignalId(setup.contact.id,0)]).toMatchObject({organizationId:setup.team.organizationId,playerId:setup.playerId,source:'AGENT',expectedSalary:countered.salary,occurredOn:due.currentDate})
    expect(first.marketSignalsById[formalOfferCounterSignalId(setup.contact.id,0)]).not.toHaveProperty('expectedYears')
    expect(Object.values(first.marketKnowledge).find(item=>item.organizationId===setup.team.organizationId&&item.playerId===setup.playerId)).toMatchObject({expectedSalary:countered.salary,source:'AGENT'})
    expect(Object.values(first.marketKnowledge).find(item=>item.organizationId===setup.source.organizationId&&item.playerId===setup.playerId)).toBeUndefined()
    expect(first.marketSignalsById).toEqual(repeated.marketSignalsById)
    expect(first.negotiationsById).toEqual(repeated.negotiationsById)
    expect(progressFormalOfferResponses(first)).toBe(first)
  })
  it('rejects an under-expectation offer without representation and closes an offer if the player is no longer free',()=>{
    const setup=userContactFixture()
    const initialized=initializeMarketAgents(setup.world)
    const opened=openNegotiation(initialized,openInput(setup))
    const noAgent=updateGameWorld(opened,{playerRepresentations:[]})
    const reality={...noAgent.marketRealityByPlayerId[setup.playerId]!,expectedSalary:2_000_000}
    const due=updateGameWorld(noAgent,{currentDate:addDays(noAgent.currentDate,1),marketReality:[...Object.values(noAgent.marketRealityByPlayerId).filter(item=>item.playerId!==setup.playerId),reality]})
    const rejected=progressFormalOfferResponses(due)
    expect(rejected.negotiationsById[setup.contact.id]).toMatchObject({status:'REJECTED',playerResponse:{outcome:'REJECTED',origin:'PLAYER'}})
    expect(rejected.marketSignalsById).toEqual(due.marketSignalsById)

    const funded=updateGameWorld(opened,{teamFinances:Object.values(opened.teamFinancesByTeamId).map(item=>item.teamId===setup.team.id?{...item,playerSalaryBudget:100_000_000}:item)})
    const signed=signFreeAgent(funded,setup.team.id,setup.playerId)
    const stale=updateGameWorld(signed,{currentDate:addDays(signed.currentDate,1)})
    const closed=progressFormalOfferResponses(stale)
    expect(closed.negotiationsById[setup.contact.id]).toMatchObject({status:'CLOSED',closedOn:stale.currentDate,closeReason:'PLAYER_NO_LONGER_FREE_AGENT'})
    expect(closed.negotiationsById[setup.contact.id]).not.toHaveProperty('playerResponse')
  })
  it('requires a positive exact contact, a current free agent, an authorized owner, and affordable salary',()=>{
    const setup=userContactFixture()
    const noContact=updateGameWorld(setup.world,{negotiations:[]})
    expect(()=>openNegotiation(noContact,openInput(setup))).toThrow(/exact existing CONTACTED/)
    expect(()=>openNegotiation(setup.world,{...openInput(setup),playerId:playerIdFromString('player:missing')})).toThrow(/player does not exist/)
    const pending=updateGameWorld(setup.world,{negotiations:[{...setup.contact,contactResponse:undefined}]})
    expect(()=>openNegotiation(pending,openInput(setup))).toThrow(/positive current contact/)
    const refused=updateGameWorld(setup.world,{negotiations:[{...setup.contact,status:'CLOSED',contactResponse:{...setup.contact.contactResponse!,outcome:'NOT_INTERESTED'}} as ContractNegotiation]})
    expect(()=>openNegotiation(refused,openInput(setup))).toThrow(/opening key.*already in use/)
    const funded=updateGameWorld(setup.world,{teamFinances:Object.values(setup.world.teamFinancesByTeamId).map(item=>item.teamId===setup.team.id?{...item,playerSalaryBudget:100_000_000}:item)})
    const signed=signFreeAgent(funded,setup.team.id,setup.playerId)
    expect(()=>openNegotiation(signed,openInput(setup))).toThrow(/no longer a free agent/)
    expect(()=>openNegotiation(setup.world,{...openInput(setup),offerResponsibleActor:{kind:'ORGANIZATION'}})).toThrow(/not authorized/)
    expect(()=>openNegotiation(funded,{...openInput(setup),salary:100_000_000})).toThrow(/cannot afford/)
  })
  it('creates one authorized term-free contact and persists the delegated actor and current source',()=>{
    const initial=createNewGame(),team=Object.values(initial.teams).find(item=>item.coachId!==undefined&&item.coachId!==initial.userCoachId)!,source=Object.values(initial.teams).find(item=>item.id!==team.id)!,playerId=source.rosterPlayerIds[0]!
    const released=releasePlayer(initial,source.id,playerId)
    const world=updateGameWorld(released,{userCoachId:team.coachId!})
    const input={organizationId:team.organizationId,teamId:team.id,playerId,startedOn:world.currentDate,actionKey:'current-plan:current-proposal',responsibleActor:{kind:'USER' as const},sourcePlanId:'current-plan',sourceProposalId:'current-proposal'}
    const result=createContactInEngine(world,input)
    expect(result.status).toBe('CREATED')
    if(result.status!=='CREATED') throw new Error('expected contact creation')
    expect(result.contact).toMatchObject({status:'CONTACTED',startedOn:world.currentDate,actionKey:input.actionKey,sourcePlanId:input.sourcePlanId,sourceProposalId:input.sourceProposalId,contactResponsibleActor:input.responsibleActor})
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

function userContactFixture() {
  const initial=createNewGame()
  const team=Object.values(initial.teams).find(item=>item.coachId===initial.userCoachId)!
  const source=Object.values(initial.teams).find(item=>item.id!==team.id&&item.rosterPlayerIds.length>0)!
  const playerId=source.rosterPlayerIds[0]!
  const released=releasePlayer(initial,source.id,playerId)
  const actionKey='plan-contact:proposal-contact'
  const sourcePlanId='plan-contact'
  const sourceProposalId='proposal-contact'
  const responseDate=addDays(released.currentDate,1)
  const contact={...createNegotiationContact({organizationId:team.organizationId,teamId:team.id,playerId,startedOn:released.currentDate,actionKey,sourcePlanId,sourceProposalId,responsibleActor:{kind:'USER'}}),contactResponse:{outcome:'OPEN_TO_TALKS' as const,respondedOn:responseDate,marketSignalId:'signal:positive-contact'}} as ContractNegotiation
  return {world:updateGameWorld(released,{currentDate:responseDate,negotiations:[contact]}),team,source,playerId,contact,actionKey,sourcePlanId,sourceProposalId}
}

function openInput(setup: ReturnType<typeof userContactFixture>) {
  return {organizationId:setup.team.organizationId,teamId:setup.team.id,playerId:setup.playerId,salary:650_000,years:2,actionKey:setup.actionKey,sourcePlanId:setup.sourcePlanId,sourceProposalId:setup.sourceProposalId,offerResponsibleActor:{kind:'USER' as const}}
}
