import { expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { createGame } from '@/domain/game'
import { calculateSeasonStandings, type SeasonHistoryRecord } from '@/domain/season'
import { createStaffHumanContext, createStaffReactionRecord, staffHumanContextIdFor, staffReactionRecordIdFromString } from '@/domain/staffHumanState/StaffHumanState'
import { createNewGame } from '@/app/game/createNewGame'
import { simulateAndApplyGame } from '@/app/game/playUserGame'
import { createGameWorld, updateGameWorld, withSingleWorldValidation } from './GameWorld'
import { createValidGameWorldInput } from './testFixtures'

it('revalidates season snapshots when games or the snapshot change', () => {
  const input = createValidGameWorldInput()
  const game = createGame({ ...input.games[0]!, status: 'completed', result: { homeScore: 80, awayScore: 70 } })
  const base = createGameWorld({ ...input, games: [game] })
  const history: SeasonHistoryRecord = { seasonId: game.seasonId, competitionId: game.competitionId, completedOn: base.currentDate, championTeamId: game.homeTeamId, finalStandings: calculateSeasonStandings(base, game.seasonId) }
  const world = updateGameWorld(base, { seasonHistory: [history] })
  expect(updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) }).seasonHistoryBySeasonId).toBe(world.seasonHistoryBySeasonId)
  expect(() => updateGameWorld(world, { games: [{ ...game, status: 'completed', result: { homeScore: 81, awayScore: 70 } }] })).toThrow('standings do not match')
  expect(() => updateGameWorld(world, { games: [] })).toThrow('standings do not match')
  expect(() => updateGameWorld(world, { seasonHistory: [{ ...history, finalStandings: history.finalStandings.map(line => ({ ...line, wins: 5 })) }] })).toThrow('standings do not match')
})

it('revalidates immutable match evidence when its game or log changes', () => {
  const base = createNewGame()
  const game = Object.values(base.games).find(item => item.date === base.currentDate)!
  const world = simulateAndApplyGame(base, game, 15015)
  const completed = world.games[game.id]!
  expect(completed.status).toBe('completed')
  const log = world.matchStatLogsByGameId[game.id]!
  expect(updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) }).matchStatLogsByGameId).toBe(world.matchStatLogsByGameId)
  expect(() => updateGameWorld(world, { games: Object.values(world.games).map(item => item.id === completed.id ? { ...completed, status: 'completed', result: { homeScore: log.finalScore.home + 1, awayScore: log.finalScore.away } } : item) })).toThrow('score does not match')
  expect(() => updateGameWorld(world, { matchStatLogs: [{ ...log, finalScore: { home: log.finalScore.home + 1, away: log.finalScore.away } }] })).toThrow('score does not match')
})

it('revalidates replaced staff reactions and rejects removal of their contexts', () => {
  const base = createGameWorld(createValidGameWorldInput())
  const staff = Object.values(base.staffPeopleById)[0]!
  const team = Object.values(base.teams)[0]!
  const context = createStaffHumanContext({ id: staffHumanContextIdFor(staff.id, team.id, base.currentDate), staffId: staff.id, teamId: team.id, startedOn: base.currentDate })
  const reaction = createStaffReactionRecord({ id: staffReactionRecordIdFromString('reaction:historical-validation'), staffId: staff.id, contextId: context.id, sourceEventId: 'event:historical-validation', eventKind: 'staffAppointed', importance: 'ROUTINE', occurredOn: base.currentDate, stateDelta: {}, attribution: { actorKind: 'SYSTEMIC_CONTEXT' } })
  const world = updateGameWorld(base, { staffHumanContexts: [context], staffReactionRecords: [reaction] })
  expect(updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) }).staffReactionRecordsById).toBe(world.staffReactionRecordsById)
  expect(() => updateGameWorld(world, { staffHumanContexts: [] })).toThrow('Staff reaction record')
  expect(() => updateGameWorld(world, { staffReactionRecords: [{ ...reaction, sourceEventId: '' }] })).toThrow('source event')
})


it('retains staff reaction dependencies after identity-preserving replacement', () => {
  const base = createGameWorld(createValidGameWorldInput())
  const staff = Object.values(base.staffPeopleById)[0]!
  const team = Object.values(base.teams)[0]!
  const context = createStaffHumanContext({ id: staffHumanContextIdFor(staff.id, team.id, base.currentDate), staffId: staff.id, teamId: team.id, startedOn: base.currentDate })
  const reaction = createStaffReactionRecord({ id: staffReactionRecordIdFromString('reaction:incremental-dependency'), staffId: staff.id, contextId: context.id, sourceEventId: 'event:incremental-dependency', eventKind: 'staffAppointed', importance: 'ROUTINE', occurredOn: base.currentDate, stateDelta: {}, attribution: { actorKind: 'SYSTEMIC_CONTEXT' } })
  const world = updateGameWorld(base, { staffHumanContexts: [context], staffReactionRecords: [reaction] })
  const replaced = withSingleWorldValidation(world, current => updateGameWorld(current, { staffHumanContexts: [{ ...context }] }), { validationMode: 'incremental' })
  expect(() => withSingleWorldValidation(replaced, current => updateGameWorld(current, { staffHumanContexts: [] }), { validationMode: 'incremental' })).toThrow('Staff reaction record')
})
