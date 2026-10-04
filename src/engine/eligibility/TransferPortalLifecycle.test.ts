import { describe, expect, it } from 'vitest'
import { createNcaaSimulatedGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { basketballTransferWindow } from '@/domain/eligibility'
import { updateGameWorld } from '@/domain/world'
import { createAthleticsAidAgreement, recordAthleticsAidChange } from '@/domain/collegeCompensation'
import { canRecruitTransferPlayer, completeTransferEducationModule, processTransferPortalEntry, submitAthleticsAidExceptionTransferNotice, submitHeadCoachExceptionTransferNotice, submitTransferNotice, withdrawTransferPortalEntry } from './TransferPortalLifecycle'

describe('Transfer Portal lifecycle', () => {
  it('records notice, module, and institutional processing without moving the player', () => {
    let world = createNcaaSimulatedGame()
    const season = world.seasons[world.currentSeasonId]!
    const competition = world.competitions[season.competitionId]!
    const sourceTeam = world.teams[competition.participantTeamIds[0]!]!
    const destination = world.teams[competition.participantTeamIds[1]!]!
    const playerId = sourceTeam.rosterPlayerIds[0]!
    const ruleset = Object.values(world.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    const finalDate = Object.values(world.games).find((game) => game.seasonId === season.id && game.stakes === 'final')!.date
    const window = basketballTransferWindow(finalDate, ruleset)
    world = updateGameWorld(world, { currentDate: window.opensOn })

    const notice = submitTransferNotice(world, { id: 'portal-entry:one', playerId, sourceTeamId: sourceTeam.id, ecosystemId: competition.ecosystemId, rulesetId: ruleset.id }, window)
    expect(notice.ok).toBe(true)
    if (!notice.ok) return
    const module = completeTransferEducationModule(notice.world, 'portal-entry:one')
    expect(module.ok).toBe(true)
    if (!module.ok) return
    world = updateGameWorld(module.world, { currentDate: addDays(module.world.currentDate, 1) })
    const processed = processTransferPortalEntry(world, 'portal-entry:one')
    expect(processed.ok).toBe(true)
    if (!processed.ok) return

    expect(canRecruitTransferPlayer(processed.world, playerId, destination.id)).toBe(true)
    expect(processed.world.teams[sourceTeam.id]!.rosterPlayerIds).toContain(playerId)
    expect(processed.world.teams[destination.id]!.rosterPlayerIds).not.toContain(playerId)
    expect(processTransferPortalEntry(processed.world, 'portal-entry:one').ok).toBe(false)
    const withdrawn = withdrawTransferPortalEntry(processed.world, 'portal-entry:one')
    expect(withdrawn.ok).toBe(true)
    if (!withdrawn.ok) return
    expect(canRecruitTransferPlayer(withdrawn.world, playerId, destination.id)).toBe(false)
    expect(withdrawn.world.transferPortalEntriesById['portal-entry:one']?.status).toBe('withdrawn')
    expect(withdrawn.world.teams[sourceTeam.id]!.rosterPlayerIds).toContain(playerId)
  })

  it('qualifies a head-coach exception from canonical departure and hire history', () => {
    let world = createNcaaSimulatedGame()
    const season = world.seasons[world.currentSeasonId]!
    const competition = world.competitions[season.competitionId]!
    const sourceTeam = world.teams[competition.participantTeamIds[0]!]!
    const playerId = sourceTeam.rosterPlayerIds[0]!
    const oldCoachId = sourceTeam.coachId!
    const newCoachId = Object.keys(world.coaches).find((coachId) => coachId !== oldCoachId)! as typeof oldCoachId
    const finalDate = Object.values(world.games).find((game) => game.seasonId === season.id && game.competitionStageKey === 'FINAL')!.date
    const departedOn = addDays(finalDate, 1)
    const hiredOn = addDays(departedOn, 2)
    const ruleset = Object.values(world.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    world = updateGameWorld(world, {
      currentDate: addDays(hiredOn, 5),
      coachCareerHistoryByCoachId: {
        ...world.coachCareerHistoryByCoachId,
        [oldCoachId]: [...world.coachCareerHistoryByCoachId[oldCoachId]!, { kind: 'departure', coachId: oldCoachId, teamId: sourceTeam.id, date: departedOn, reason: 'fired' }],
        [newCoachId]: [...world.coachCareerHistoryByCoachId[newCoachId]!, { kind: 'appointment', coachId: newCoachId, teamId: sourceTeam.id, date: hiredOn, reason: 'hired' }],
      },
    })
    const submitted = submitHeadCoachExceptionTransferNotice(world, { id: 'portal-coach-change', playerId, sourceTeamId: sourceTeam.id, ecosystemId: competition.ecosystemId, rulesetId: ruleset.id })
    expect(submitted.ok).toBe(true)
    if (!submitted.ok) return
    expect(submitted.world.transferPortalEntriesById['portal-coach-change']).toMatchObject({ notifiedOn: addDays(hiredOn, 5), exception: 'HEAD_COACH_CHANGE', status: 'noticePending' })
  })

  it('opens the no-replacement Head Coach exception on day 31 from canonical Staff history', () => {
    let world = createNcaaSimulatedGame()
    const season = world.seasons[world.currentSeasonId]!
    const competition = world.competitions[season.competitionId]!
    const sourceTeam = world.teams[competition.participantTeamIds[0]!]!
    const playerId = sourceTeam.rosterPlayerIds[0]!
    const oldCoachId = sourceTeam.coachId!
    const finalDate = Object.values(world.games).find((game) => game.seasonId === season.id && game.competitionStageKey === 'FINAL')!.date
    const departedOn = addDays(finalDate, 1)
    const day31 = addDays(departedOn, 31)
    const ruleset = Object.values(world.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    world = updateGameWorld(world, {
      currentDate: day31,
      coachCareerHistoryByCoachId: {
        ...world.coachCareerHistoryByCoachId,
        [oldCoachId]: [...world.coachCareerHistoryByCoachId[oldCoachId]!, { kind: 'departure', coachId: oldCoachId, teamId: sourceTeam.id, date: departedOn, reason: 'acceptedOtherJob' }],
      },
    })

    const submitted = submitHeadCoachExceptionTransferNotice(world, { id: 'portal-no-replacement', playerId, sourceTeamId: sourceTeam.id, ecosystemId: competition.ecosystemId, rulesetId: ruleset.id })
    expect(submitted.ok).toBe(true)
    if (!submitted.ok) return
    expect(submitted.world.transferPortalEntriesById['portal-no-replacement']).toMatchObject({ notifiedOn: day31, exception: 'NO_NEW_HEAD_COACH_AFTER_30_DAYS', status: 'noticePending' })
  })

  it('opens the aid-change window from qualifying aid history and rejects excluded causes', () => {
    let world = createNcaaSimulatedGame()
    const season = world.seasons[world.currentSeasonId]!
    const competition = world.competitions[season.competitionId]!
    const sourceTeam = world.teams[competition.participantTeamIds[0]!]!
    const playerId = sourceTeam.rosterPlayerIds[0]!
    const ruleset = Object.values(world.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    const baseAid = createAthleticsAidAgreement({ id: 'aid:portal-test', playerId, teamId: sourceTeam.id, institutionId: sourceTeam.organizationId, academicPeriod: '2026-27', valueMinorUnits: 10_000, effectiveFrom: world.currentDate, effectiveTo: addDays(world.currentDate, 365), offeredOn: world.currentDate, signedOn: world.currentDate, status: 'signed', provenance: 'aid-office', history: [] })
    const qualifying = recordAthleticsAidChange(baseAid, { id: 'aid-event:qualifying', action: 'reduction', date: world.currentDate, valueMinorUnits: 8_000, reason: 'institutionalChange', provenance: 'aid-office' })
    const excluded = recordAthleticsAidChange(qualifying, { id: 'aid-event:excluded', action: 'reduction', date: world.currentDate, valueMinorUnits: 7_000, reason: 'athleticAbility', provenance: 'aid-office' })
    world = updateGameWorld(world, { athleticsAidAgreements: [excluded], currentDate: addDays(world.currentDate, 1) })
    const entry = { id: 'portal-aid-exception', playerId, sourceTeamId: sourceTeam.id, ecosystemId: competition.ecosystemId, rulesetId: ruleset.id }
    expect(submitAthleticsAidExceptionTransferNotice(world, entry, 'aid-event:qualifying').ok).toBe(true)
    expect(submitAthleticsAidExceptionTransferNotice(world, { ...entry, id: 'portal-aid-excluded' }, 'aid-event:excluded')).toMatchObject({ ok: false, reason: 'QUALIFYING_AID_CHANGE_UNAVAILABLE' })
  })

  it.each([
    ['cancellation', 'cancellation', 'institutionalChange'],
    ['nonrenewal', 'nonrenewal', 'headCoachChange'],
  ] as const)('qualifies aid %s from signed agreement history', (_label, action, reason) => {
    let world = createNcaaSimulatedGame()
    const season = world.seasons[world.currentSeasonId]!
    const competition = world.competitions[season.competitionId]!
    const sourceTeam = world.teams[competition.participantTeamIds[0]!]!
    const playerId = sourceTeam.rosterPlayerIds[0]!
    const ruleset = Object.values(world.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    const baseAid = createAthleticsAidAgreement({ id: `aid:${action}`, playerId, teamId: sourceTeam.id, institutionId: sourceTeam.organizationId, academicPeriod: '2026-27', valueMinorUnits: 10_000, effectiveFrom: world.currentDate, effectiveTo: addDays(world.currentDate, 365), offeredOn: world.currentDate, signedOn: world.currentDate, status: 'signed', provenance: 'aid-office', history: [] })
    const changed = recordAthleticsAidChange(baseAid, { id: `aid-event:${action}`, action, date: world.currentDate, valueMinorUnits: 0, reason, provenance: 'aid-office' })
    world = updateGameWorld(world, { athleticsAidAgreements: [changed], currentDate: addDays(world.currentDate, 1) })
    const submitted = submitAthleticsAidExceptionTransferNotice(world, { id: `portal-aid-${action}`, playerId, sourceTeamId: sourceTeam.id, ecosystemId: competition.ecosystemId, rulesetId: ruleset.id }, `aid-event:${action}`)
    expect(submitted.ok).toBe(true)
    if (!submitted.ok) return
    expect(submitted.world.transferPortalEntriesById[`portal-aid-${action}`]).toMatchObject({ exception: 'ATHLETICS_AID_CHANGE', notifiedOn: addDays(world.currentDate, 0) })
  })
})
