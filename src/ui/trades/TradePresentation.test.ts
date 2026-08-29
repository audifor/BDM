import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'
import { organizationIdForTeam } from '@/domain/ids'
import { validateTrade } from '@/engine/trade'

import { addTradeMovement, addTradeParticipant, buildTradePresentation, changeTradeCounterparty, createTradeDraft, humanizeTradeReason, removeTradeMovement, tradePlayerValuation } from './TradePresentation'

describe('TradePresentation', () => {
  const world = createNewGame()
  const rules = Object.values(world.tradeRulesBySeasonId)[0]!
  const teams = Object.values(world.teams).filter((team) => team.id !== getUserTeam(world)!.id)
  const user = getUserTeam(world)!
  const partner = teams[0]!
  const movement = { asset: { kind: 'player' as const, playerId: user.rosterPlayerIds[0]! }, fromTeamId: user.id, toTeamId: partner.id }

  it('starts with only the user team and edits the draft without mutating the world', () => {
    const before = JSON.stringify(world); const draft = addTradeParticipant(createTradeDraft(world), partner.id, rules.maxTeamsPerTrade)
    const next = addTradeMovement(draft, movement)
    expect(next.movements).toEqual([movement]); expect(JSON.stringify(world)).toBe(before)
  })

  it('assigns assets to the receiving team and calculates canonical salary presentation', () => {
    const draft = addTradeMovement(addTradeParticipant(createTradeDraft(world), partner.id, rules.maxTeamsPerTrade), movement)
    const presentation = buildTradePresentation(world, rules, draft)
    expect(presentation.teams.find((team) => team.teamId === partner.id)?.received[0]?.movement).toEqual(movement)
    expect(presentation.teams.find((team) => team.teamId === user.id)?.validation?.outgoingSalary).toBeGreaterThanOrEqual(0)
    expect(presentation.hasSalaryMatching).toBe(world.salaryRulesBySeasonId[rules.seasonId] !== undefined)
  })

  it('prevents duplicate assets, removes assets, and safely resets on counterparty change', () => {
    const start = addTradeParticipant(createTradeDraft(world), partner.id, rules.maxTeamsPerTrade)
    const added = addTradeMovement(start, movement)
    expect(addTradeMovement(added, movement)).toBe(added)
    expect(removeTradeMovement(added, movement).movements).toEqual([])
    expect(changeTradeCounterparty(added, user.id, teams[1]!.id).movements).toEqual([])
  })

  it('keeps technical validation codes while presenting a human salary explanation', () => {
    const draft = addTradeParticipant(createTradeDraft(world), partner.id, rules.maxTeamsPerTrade)
    const presentation = buildTradePresentation(world, rules, draft)
    const validation = presentation.teams[0]!.validation
    expect(humanizeTradeReason('SALARY_MATCHING_FAILED', presentation.teams[0]!.teamName, validation)).not.toContain('SALARY_MATCHING_FAILED')
  })

  it('scales the same draft model to the engine maximum of four teams', () => {
    const draft = teams.slice(0, 3).reduce((current, team) => addTradeParticipant(current, team.id, rules.maxTeamsPerTrade), createTradeDraft(world))
    expect(draft.participantTeamIds).toHaveLength(4)
    expect(addTradeParticipant(draft, teams[3]!.id, rules.maxTeamsPerTrade)).toBe(draft)
  })

  it('does not expose salary presentation when canonical salary rules are absent', () => {
    const noSalaryWorld = updateGameWorld(world, { salaryRulesBySeasonId: {} })
    const draft = addTradeParticipant(createTradeDraft(noSalaryWorld), partner.id, rules.maxTeamsPerTrade)
    expect(buildTradePresentation(noSalaryWorld, rules, draft).hasSalaryMatching).toBe(false)
  })

  it('retains the canonical salary invalidity on the receiving team', () => {
    const draft = addTradeMovement(addTradeParticipant(createTradeDraft(world), partner.id, rules.maxTeamsPerTrade), movement)
    const presentation = buildTradePresentation(world, rules, draft)
    expect(presentation.allowed).toBe(false)
    expect(presentation.teams.find((team) => team.teamId === partner.id)?.validation?.reasons).toContain('SALARY_MATCHING_FAILED')
  })

  it('keeps trade talent valuation invariant to hidden player truth and organization-specific', () => {
    const playerId = user.rosterPlayerIds[0]!, receivingOrganization = organizationIdForTeam(partner.id), sourceOrganization = organizationIdForTeam(user.id)
    const hiddenChanged = updateGameWorld(world, { players: Object.values(world.players).map((player) => player.id !== playerId ? player : { ...player, basketball: { ...player.basketball, ratings: { ...player.basketball.ratings, threePointShooting: 100, passing: 100 } } }) })
    expect(tradePlayerValuation(hiddenChanged, receivingOrganization, playerId)).toEqual(tradePlayerValuation(world, receivingOrganization, playerId))
    const known = updateGameWorld(world, { organizationKnowledge: [{ organizationId: receivingOrganization, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: world.currentDate, provenance: 'scoutReport', estimate: 95, uncertainty: 1 } } }, { organizationId: sourceOrganization, subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: world.currentDate, provenance: 'scoutReport', estimate: 20, uncertainty: 1 } } }] })
    expect(tradePlayerValuation(known, receivingOrganization, playerId)).not.toEqual(tradePlayerValuation(known, sourceOrganization, playerId))
    expect(tradePlayerValuation(known, receivingOrganization, playerId)).not.toEqual(tradePlayerValuation(world, receivingOrganization, playerId))
  })

  it('keeps trade legality and salary matching independent from OrganizationKnowledge', () => {
    const draft = addTradeMovement(addTradeParticipant(createTradeDraft(world), partner.id, rules.maxTeamsPerTrade), movement)
    const proposal = buildTradePresentation(world, rules, draft).proposal
    const knowledgeable = updateGameWorld(world, { organizationKnowledge: [{ organizationId: organizationIdForTeam(partner.id), subjectPlayerId: user.rosterPlayerIds[0]!, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: world.currentDate, provenance: 'scoutReport', estimate: 95, uncertainty: 1 } } }] })
    expect(validateTrade(knowledgeable, proposal)).toEqual(validateTrade(world, proposal))
  })
})
