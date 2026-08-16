import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'

import { addTradeMovement, addTradeParticipant, buildTradePresentation, changeTradeCounterparty, createTradeDraft, humanizeTradeReason, removeTradeMovement } from './TradePresentation'

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
})
