import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays, createGameDate } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { nbaDraftRulesForYear } from '@/domain/draft'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { considerDraftEntry, declareDraftEntry, getDraftCandidates, openDraft, projectDraftCandidates, withdrawDraftEntry } from '@/engine/draft'
import { projectProductionDraftPool } from './SeasonContentLifecycle'

describe('production Draft pool projection', () => {
  it('keeps the exact existing Player count and includes only pre-existing rostered PlayerIds', () => {
    const world = createNewGame()
    const nbaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.kind === 'nbaLike')!
    const rules = nbaDraftRulesForYear(Number(nbaSeason.startDate.slice(0, 4)) + 1)
    const pool = projectProductionDraftPool(world, nbaSeason.id, rules)
    expect(pool.playersBefore).toBe(Object.keys(world.players).length)
    expect(pool.playersAfter).toBe(pool.playersBefore)
    expect(pool.playersAfter - pool.playersBefore).toBe(0)
    expect(pool.playerIds.every((playerId) => world.players[playerId] !== undefined)).toBe(true)
  })

  it('creates the cycle before the declaration deadline and projects later declarations dynamically', () => {
    let world = createNewGame()
    const nbaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.kind === 'nbaLike')!
    const nba = world.ecosystems[world.competitions[nbaSeason.competitionId]!.ecosystemId]!
    for (const game of Object.values(world.games).filter((item) => item.seasonId === nbaSeason.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
    world = finalizeSeason(world, nbaSeason.id)
    const draft = Object.values(world.draftsById).find((item) => item.sourceSeasonId === nbaSeason.id)!
    expect(draft).toBeDefined()
    expect(nbaDraftRulesForYear(Number(nbaSeason.startDate.slice(0, 4)) + 1).earlyEntryDeadline! >= world.seasons[draft.sourceSeasonId]!.endDate).toBe(true)

    const ncaa = Object.values(world.ecosystems).find((ecosystem) => ecosystem.kind === 'ncaaLike' && ecosystem.category === 'men')!
    const ncaaTeam = Object.values(world.teams).find((team) => team.rosterPlayerIds.some((id) => Object.values(world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === id && enrollment.teamId === team.id && enrollment.ecosystemId === ncaa.id && enrollment.status === 'active')) && Object.values(world.competitions).some((competition) => competition.ecosystemId === ncaa.id && competition.participantTeamIds.includes(team.id)))!
    const playerIds = ncaaTeam.rosterPlayerIds.filter((id) => Object.values(world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === id && enrollment.teamId === ncaaTeam.id && enrollment.ecosystemId === ncaa.id && enrollment.status === 'active')).slice(0, 4)
    expect(playerIds).toHaveLength(4)
    const returnPlayerId = playerIds[0]!
    const returnPersonId = world.players[returnPlayerId]!.personId
    const returnEnrollment = Object.values(world.playerEnrollmentsById).find((enrollment) => enrollment.playerId === returnPlayerId && enrollment.teamId === ncaaTeam.id && enrollment.status === 'active')!
    const recruitingCycle = Object.values(world.recruitingCyclesById).find((cycle) => cycle.ecosystemId === ncaa.id)!
    const draftYear = Number(draft.scheduledOn.slice(0, 4))
    const educationProfiles = playerIds.map((playerId, index) => ({ id: `default-draft-education:${playerId}`, playerId, cycleId: recruitingCycle.id, origin: 'preCollege' as const, position: world.players[playerId]!.basketball.primaryPosition, publicRank: index + 1, positionRank: index + 1, tier: 'strong' as const, preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'open' as const, education: { highSchoolGraduationYear: draftYear - 1, completedUsHighSchool: true, enrolledAtUsCollege: true } }))
    world = updateGameWorld(world, {
      currentDate: draft.rules.earlyEntryDeadline!,
      players: Object.values(world.players).map((player) => playerIds.includes(player.id) ? { ...player, bio: { ...player.bio, dateOfBirth: createGameDate(draftYear - 19, 1, 1) } } : player),
      recruitProfiles: [...Object.values(world.recruitProfilesById), ...educationProfiles],
    })
    const initial = projectDraftCandidates(world, draft.id)
    const before = Object.keys(world.players).length
    expect(initial.playersBefore).toBe(before)
    expect(initial.playersAfter).toBe(before)
    expect(initial.automaticPlayerIds).toHaveLength(0)
    expect(initial.earlyEntryPlayerIds).toHaveLength(0)

    world = considerDraftEntry(world, draft.id, returnPlayerId)
    for (const playerId of playerIds.slice(0, 3)) world = declareDraftEntry(world, draft.id, playerId)
    const afterDeclarationDeadline = updateGameWorld(world, { currentDate: addDays(draft.rules.earlyEntryDeadline!, 1) })
    expect(() => declareDraftEntry(afterDeclarationDeadline, draft.id, playerIds[3]!)).toThrow('Draft declaration deadline has passed')
    const declared = projectDraftCandidates(world, draft.id)
    expect(declared.earlyEntryPlayerIds).toEqual(expect.arrayContaining(playerIds.slice(0, 3)))
    expect(declared.automaticPlayerIds).toHaveLength(0)
    expect(declared.playerIds).toHaveLength(3)
    expect(declared.playersAfter - declared.playersBefore).toBe(0)

    world = updateGameWorld(world, { currentDate: addDays(draft.rules.collegeWithdrawalDeadline!, -1) })
    const withdrawnId = returnPlayerId
    world = withdrawDraftEntry(world, draft.id, withdrawnId)
    const afterWithdrawal = projectDraftCandidates(world, draft.id)
    const returnedEntry = world.draftsById[draft.id]!.entries!.find((entry) => entry.playerId === withdrawnId)!
    expect(returnedEntry.status).toBe('withdrawnNCAAEligible')
    expect(returnedEntry.collegeReturnAssessment).toMatchObject({ allowed: true, deadline: draft.rules.collegeWithdrawalDeadline, rulesetId: expect.any(String), rulesetVersion: expect.any(String), reasons: ['ELIGIBLE_UNDER_COLLEGE_RULESET'] })
    expect(returnedEntry.history?.map((event) => event.status)).toEqual(['considering', 'declaredEarlyEntry', 'withdrawnNCAAEligible'])
    expect(world.players[withdrawnId]!.personId).toBe(returnPersonId)
    expect(world.playerEnrollmentsById[returnEnrollment.id]).toEqual(returnEnrollment)
    expect(world.teams[ncaaTeam.id]!.rosterPlayerIds).toContain(withdrawnId)
    const savedReturn = deserializeGameWorldV4(serializeGameWorldV4(world, '2032-10-01T00:00:00.000Z'))
    expect(savedReturn.draftsById[draft.id]!.entries!.find((entry) => entry.playerId === withdrawnId)?.collegeReturnAssessment).toEqual(returnedEntry.collegeReturnAssessment)
    expect(getDraftCandidates(savedReturn, draft.id)).not.toContain(withdrawnId)
    expect(withdrawDraftEntry(savedReturn, draft.id, withdrawnId)).toEqual(savedReturn)
    expect(afterWithdrawal.playerIds).not.toContain(withdrawnId)
    expect(afterWithdrawal.playerIds).toHaveLength(2)
    expect(afterWithdrawal.playersAfter - afterWithdrawal.playersBefore).toBe(0)

    const lateReturnId = playerIds[1]!
    world = updateGameWorld(world, { currentDate: addDays(draft.rules.collegeWithdrawalDeadline!, 1) })
    world = withdrawDraftEntry(world, draft.id, lateReturnId)
    const lateEntry = world.draftsById[draft.id]!.entries!.find((entry) => entry.playerId === lateReturnId)!
    expect(lateEntry.status).toBe('withdrawnNCAAIneligible')
    expect(lateEntry.collegeReturnAssessment).toMatchObject({ allowed: false, deadline: draft.rules.collegeWithdrawalDeadline, rulesetId: expect.any(String), rulesetVersion: expect.any(String), reasons: ['NCAA_RETURN_DEADLINE_PASSED'] })
    const afterLateReturn = projectDraftCandidates(world, draft.id)
    expect(afterLateReturn.playerIds).not.toContain(lateReturnId)
    expect(afterLateReturn.playerIds).toHaveLength(1)
    expect(afterLateReturn.playersAfter - afterLateReturn.playersBefore).toBe(0)
    expect(deserializeGameWorldV4(serializeGameWorldV4(world, '2032-10-01T00:00:00.000Z')).draftsById[draft.id]!.entries!.find((entry) => entry.playerId === lateReturnId)?.collegeReturnAssessment).toEqual(lateEntry.collegeReturnAssessment)

    world = updateGameWorld(world, { currentDate: draft.scheduledOn })
    expect(() => withdrawDraftEntry(world, draft.id, playerIds[2]!)).toThrow(new RegExp(`NBA Draft withdrawal deadline ${draft.rules.finalWithdrawalDeadline}`))
    const opened = openDraft(world, draft.id)
    const finalPool = getDraftCandidates(opened, draft.id)
    expect(opened.draftsById[draft.id]!.entries?.find((entry) => entry.playerId === playerIds[2])?.status).toBe('finalPool')
    expect(finalPool).toContain(playerIds[2])
    expect(finalPool).toHaveLength(1)
    expect(finalPool).not.toContain(withdrawnId)
    expect(Object.keys(opened.players).length).toBe(before)
  }, 20_000)
})
