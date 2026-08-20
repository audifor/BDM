import { createNewGame } from '@/app/game/createNewGame'
import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { evaluatePlayerEligibility } from '@/engine/eligibility'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { openInvestigation, progressEnforcement, reportViolation } from './EnforcementEngine'

describe('Enforcement', () => {
  it('resolves deterministically into a temporary player restriction without clearing academic eligibility', () => {
    const base = createNewGame(); const season = Object.values(base.seasons).find((item) => base.ecosystems[base.competitions[item.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!; const game = Object.values(base.games).find((item) => item.seasonId === season.id)!; const playerId = base.teams[game.homeTeamId]!.rosterPlayerIds[0]!; const ecosystemId = base.competitions[game.competitionId]!.ecosystemId
    const academic = updateGameWorld(base, { eligibilityRestrictions: [{ id: 'academic:test', playerId, ecosystemId, reasonCode: 'ACADEMIC_INELIGIBLE', startsAt: base.currentDate, sourceType: 'academic' }] })
    const reported = reportViolation(academic, { ecosystemId, programTeamId: game.homeTeamId, playerId, category: 'academic', severity: 'major', source: 'fixture' }); const investigated = openInvestigation(reported, Object.keys(reported.violationsById)[0]!); const resolved = progressEnforcement(updateGameWorld(investigated, { currentDate: addDays(investigated.currentDate, 7) }))
    expect(Object.values(resolved.findingsById)).toHaveLength(1); expect(evaluatePlayerEligibility(resolved, { playerId, teamId: game.homeTeamId, competitionId: game.competitionId, seasonId: season.id }).eligible).toBe(false)
    const expired = progressEnforcement(updateGameWorld(resolved, { currentDate: addDays(resolved.currentDate, 15) }))
    expect(Object.values(expired.eligibilityRestrictionsById).map((item) => item.reasonCode)).toEqual(['ACADEMIC_INELIGIBLE'])
    expect(evaluatePlayerEligibility(expired, { playerId, teamId: game.homeTeamId, competitionId: game.competitionId, seasonId: season.id }).eligible).toBe(false)
  })

  it('persists open investigations and active sanctions without inventing legacy history', () => {
    const world = createNewGame(); const ncaa = Object.values(world.competitions).find((item) => world.ecosystems[item.ecosystemId]!.kind === 'ncaaLike')!; const reported = reportViolation(world, { ecosystemId: ncaa.ecosystemId, programTeamId: ncaa.participantTeamIds[0]!, category: 'recruiting', severity: 'minor', source: 'fixture' }); const open = openInvestigation(reported, Object.keys(reported.violationsById)[0]!); expect(deserializeGameWorldV1(serializeGameWorldV1(open, '2032-10-01T00:00:00.000Z')).investigationsById).toEqual(open.investigationsById)
    const sanctioned = progressEnforcement(updateGameWorld(open, { currentDate: addDays(open.currentDate, 7) })); expect(deserializeGameWorldV1(serializeGameWorldV1(sanctioned, '2032-10-08T00:00:00.000Z')).sanctionsById).toEqual(sanctioned.sanctionsById)
  })
})
