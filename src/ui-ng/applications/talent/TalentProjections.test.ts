import { describe, expect, it } from 'vitest'

import { createNcaaSimulatedGame } from '@/app/game/createNcaaSimulatedGame'
import { createTransferPortalEntry } from '@/domain/eligibility'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { buildTalentAttentionItems, buildTalentDeadlineItems } from './TalentAttentionProjection'
import { toUserFacingTalentBlockedReason, TALENT_BLOCKED_REASON_COUNT } from './TalentBlockedReasonAdapter'
import { resolveTalentHistoryDestination } from './TalentHistoryRouteResolver'
import { buildTalentPortalPlayerViewModel } from './TalentPortalViewModel'
import { getPlayerSeasonStats, calculatePlayerStatAverages } from '@/engine/stats/PlayerHistory'
import { buildPlayerHistoryModel } from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'
import { buildTalentPortalPlayerViewModels } from './TalentPortalViewModel'

describe('Talent application projections', () => {
  it('projects Portal production, Unknown eligibility and separate own-player compensation contexts', () => {
    const base = createNcaaSimulatedGame()
    const team = getUserTeam(base)!
    const playerId = team.rosterPlayerIds[0]!
    const competition = Object.values(base.competitions).find((item) => item.participantTeamIds.includes(team.id))!
    const rules = Object.values(base.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    const entry = createTransferPortalEntry({ id: 'projection-own-entry', playerId, sourceTeamId: team.id, ecosystemId: competition.ecosystemId, rulesetId: rules.id, notifiedOn: base.currentDate, status: 'noticePending' })
    const world = updateGameWorld(base, { transferPortalEntries: [entry] })
    const model = buildTalentPortalPlayerViewModel(world, playerId)!

    expect(model.eligibility).toBe('Unknown')
    expect(model.playerId).toBe(playerId)
    expect(model.personId).toBe(String(world.players[playerId]!.personId))
    const averages = calculatePlayerStatAverages(getPlayerSeasonStats(world, playerId, world.currentSeasonId))
    expect(model.production).toMatchObject({ games: getPlayerSeasonStats(world, playerId, world.currentSeasonId).gamesPlayed, minutes: averages.mpg.toFixed(1), points: averages.ppg.toFixed(1) })
    expect(buildPlayerHistoryModel(world, playerId)?.items).toBeDefined()
    expect(model.retention).toMatchObject({ portalStatus: 'noticePending', activeNilDeals: 0 })
    expect(model.retention).toHaveProperty('athleticsAidMinorUnits')
    expect(model.retention).toHaveProperty('institutionalBenefitsMinorUnits')
    expect(model.retention).toHaveProperty('relationshipTrust')
    expect(world.transferPortalEntriesById[entry.id]).not.toHaveProperty('production')
    expect(model).not.toHaveProperty('privateRelationships')
    expect(model.privateRelationshipCount).toBeGreaterThanOrEqual(0)
  })

  it('derives attention from canonical Portal state and resolves when that source changes', () => {
    const base = createNcaaSimulatedGame()
    const team = getUserTeam(base)!
    const playerId = team.rosterPlayerIds[0]!
    const competition = Object.values(base.competitions).find((item) => item.participantTeamIds.includes(team.id))!
    const rules = Object.values(base.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    const entry = createTransferPortalEntry({ id: 'projection-attention-entry', playerId, sourceTeamId: team.id, ecosystemId: competition.ecosystemId, rulesetId: rules.id, notifiedOn: base.currentDate, status: 'noticePending' })
    const world = updateGameWorld(base, { transferPortalEntries: [entry] })
    expect(buildTalentAttentionItems(world).some((item) => item.type === 'retention-concern' && item.playerId === playerId && item.source.endsWith(entry.id))).toBe(true)
    expect(buildTalentAttentionItems(updateGameWorld(world, { transferPortalEntries: [{ ...entry, status: 'withdrawn' }] })).some((item) => item.id === `retention:${entry.id}`)).toBe(false)
    expect(buildTalentDeadlineItems(world).every((item) => item.source.length > 0)).toBe(true)
  })

  it('does not project a rival’s private continuation or compensation context', () => {
    const base = createNcaaSimulatedGame()
    const ownTeam = getUserTeam(base)!
    const competition = Object.values(base.competitions).find((item) => item.participantTeamIds.includes(ownTeam.id))!
    const rivalTeam = competition.participantTeamIds.map((id) => base.teams[id]!).find((item) => item.id !== ownTeam.id && item.rosterPlayerIds.length > 0)!
    const playerId = rivalTeam.rosterPlayerIds[0]!
    const rules = Object.values(base.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    const entry = createTransferPortalEntry({ id: 'projection-rival-entry', playerId, sourceTeamId: rivalTeam.id, ecosystemId: competition.ecosystemId, rulesetId: rules.id, notifiedOn: base.currentDate, educationalModuleCompletedOn: base.currentDate, processedOn: base.currentDate, status: 'authorized' })
    const view = buildTalentPortalPlayerViewModel(updateGameWorld(base, { transferPortalEntries: [entry] }), playerId)!

    expect(view.isOwnPlayer).toBe(false)
    expect(view.retention).toBeUndefined()
    expect(view.privateRelationshipCount).toBe(0)
    expect(view.playerId).toBe(playerId)
  })

  it('routes canonical Player history events to stable owning workspaces and preserves Player identity', () => {
    const playerId = 'player:history-test' as never
    expect(resolveTalentHistoryDestination({ id: 'draft-entry:x:0', type: 'draft', source: 'DRAFT_RECORD', filterCategory: 'draft', dateLabel: 'May', datePrecision: 'exact', sortDate: '2030-05-01', title: 'Declared for Draft', detail: '2030', contextLabel: null }, playerId)).toEqual({ app: 'draft', playerId, focusPlayerId: playerId })
    expect(resolveTalentHistoryDestination({ id: 'ecosystem:portal-movement', type: 'ecosystem', source: 'ECOSYSTEM_RECORD', filterCategory: 'ecosystem', dateLabel: 'May', datePrecision: 'exact', sortDate: '2030-05-01', title: 'Transfer enrollment', detail: 'A to B', contextLabel: null }, playerId)).toEqual({ app: 'portal', playerId, focusPlayerId: playerId })
    expect(resolveTalentHistoryDestination({ id: 'career:portal:portal-entry', type: 'ecosystem', source: 'CAREER_RECORD', filterCategory: 'ecosystem', dateLabel: 'May', datePrecision: 'exact', sortDate: '2030-05-01', title: 'Transfer Portal move', detail: 'A to B', contextLabel: null }, playerId)).toEqual({ app: 'portal', playerId, focusPlayerId: playerId })
    expect(resolveTalentHistoryDestination({ id: 'medical:injury', type: 'medical', source: 'MEDICAL_RECORD', filterCategory: 'medical', dateLabel: 'May', datePrecision: 'exact', sortDate: '2030-05-01', title: 'Injury', detail: 'Recovered', contextLabel: null }, playerId)).toBeNull()
  })

  it('translates blocked reasons explicitly and humanizes unknown codes', () => {
    expect(TALENT_BLOCKED_REASON_COUNT).toBeGreaterThanOrEqual(30)
    expect(toUserFacingTalentBlockedReason('CAP_EXCEEDED')).toBe('The proposed benefits exceed the institution’s available cap.')
    expect(toUserFacingTalentBlockedReason('NEW_UNMAPPED_REASON')).toBe('New unmapped reason.')
    expect(toUserFacingTalentBlockedReason('DRAFT_DECLARATION_DEADLINE_PASSED')).not.toContain('DRAFT_DECLARATION_DEADLINE_PASSED')
  })

  it('certifies readable blocked outcomes across Scouting, Recruiting, Portal, compensation, Draft and eligibility without mutation', () => {
    const world = createNcaaSimulatedGame()
    const cases = [
      ['SCOUTING', 'SCOUTING_STAFF_CAPACITY_EXHAUSTED'], ['RECRUITING', 'RECRUITING_SHUTDOWN'],
      ['PORTAL', 'NOTIFICATION_WINDOW_CLOSED'], ['COMPENSATION', 'CAP_EXCEEDED'],
      ['DRAFT', 'NCAA_WITHDRAWAL_DEADLINE_MISSED'], ['ELIGIBILITY', 'NOT_ENROLLED'],
    ] as const
    for (const [system, code] of cases) {
      const explanation = toUserFacingTalentBlockedReason(code, `${system} action context.`)
      expect(explanation).toBeTruthy()
      expect(explanation).toContain(`${system} action context.`)
      expect(explanation).not.toContain(code)
    }
    expect(world.currentDate).toBe(createNcaaSimulatedGame().currentDate)
    expect(Object.keys(world).some((key) => key.toLocaleLowerCase().includes('talentattention'))).toBe(false)
  })

  it('measures representative Portal, Talent overview, deadline and pathway projections', () => {
    const world = createNcaaSimulatedGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id))!
    const candidates = competition.participantTeamIds.filter((teamId) => teamId !== team.id).flatMap((teamId) => world.teams[teamId]!.rosterPlayerIds.map((candidateId) => ({ teamId, candidateId }))).slice(0, 40)
    const rules = Object.values(world.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    const entries = candidates.map(({ teamId, candidateId }, index) => createTransferPortalEntry({ id: `projection-performance-entry-${index}`, playerId: candidateId, sourceTeamId: teamId, ecosystemId: competition.ecosystemId, rulesetId: rules.id, notifiedOn: world.currentDate, educationalModuleCompletedOn: world.currentDate, processedOn: world.currentDate, status: 'authorized' as const }))
    const portalWorld = updateGameWorld(world, { transferPortalEntries: [...Object.values(world.transferPortalEntriesById), ...entries] })
    const samples: Record<string, number> = {}
    const measure = (name: string, work: () => unknown) => { const start = performance.now(); work(); samples[name] = Number((performance.now() - start).toFixed(2)) }
    measure('Talent attention', () => buildTalentAttentionItems(portalWorld))
    measure('Talent deadlines', () => buildTalentDeadlineItems(portalWorld))
    measure('Portal list/read model', () => buildTalentPortalPlayerViewModels(portalWorld))
    measure('Player pathway history', () => buildPlayerHistoryModel(world, playerId))
    expect(buildTalentPortalPlayerViewModels(portalWorld)).toHaveLength(candidates.length)
    console.info('BS15H representative projection timings (ms)', samples)
    expect(Object.keys(samples)).toHaveLength(4)
  })
})
