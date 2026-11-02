import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { injuryIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import type { MatchStatLog, PlayerGameStatLine } from '@/domain/stats/MatchStatLog'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { deriveRolePromiseUsage } from './RolePromiseUsage'

const base = createNewGame()

function fixture(clockMinutes = 10, overtimeMinutes = 5, playerIndex = 5, role: 'STAR' | 'STARTER' | 'ROTATION' | 'DEPTH' = 'ROTATION') {
  const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
  const playerId = team.rosterPlayerIds[playerIndex]!
  const contract = Object.values(base.contractsById).find((item) => item.playerId === playerId && item.teamId === team.id)!
  const game = Object.values(base.games).find((item) => item.status === 'scheduled' && (item.homeTeamId === team.id || item.awayTeamId === team.id))!
  const otherTeamId = game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId
  const otherTeam = base.teams[otherTeamId]!
  const home = game.homeTeamId === team.id ? team : otherTeam
  const away = game.awayTeamId === team.id ? team : otherTeam
  const promise = { id: 'role-promise:test', playerId, teamOrganizationId: team.organizationId, role, acceptedOn: game.date, status: 'ACTIVE' as const }
  const regulationSeconds = 4 * clockMinutes * 60
  const gameSeconds = regulationSeconds
  const statLine = (id: typeof team.rosterPlayerIds[number], teamId: typeof team.id, opponentTeamId: typeof team.id, isHome: boolean, started: boolean, secondsPlayed: number): PlayerGameStatLine => ({
    playerId: id, teamId, opponentTeamId, isHome, started,
    stats: { playerId: id, secondsPlayed, points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, twoPointMade: 0, twoPointAttempted: 0, threePointMade: 0, threePointAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, foulsCommitted: 0, plusMinus: 0 },
  })
  const teamLines = (current: typeof team, opponent: typeof team, isHome: boolean): PlayerGameStatLine[] => {
    const roster = current.rosterPlayerIds
    return [
      ...roster.slice(0, 5).map((id) => statLine(id, current.id, opponent.id, isHome, true, Math.round(gameSeconds * 0.75))),
      statLine(roster[5]!, current.id, opponent.id, isHome, false, Math.round(gameSeconds * 0.625)),
      statLine(roster[6]!, current.id, opponent.id, isHome, false, Math.round(gameSeconds * 0.625)),
    ]
  }
  const lines = [...teamLines(home, away, true), ...teamLines(away, home, false)]
  const completedGame = { ...game, status: 'completed' as const, result: { homeScore: 0, awayScore: 0 } }
  const log: MatchStatLog = { gameId: game.id, competitionId: game.competitionId, seasonId: game.seasonId, gameDate: game.date, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, finalScore: { home: 0, away: 0 }, playerLines: lines }
  const competition = base.competitions[game.competitionId]!
  const world = updateGameWorld(base, {
    currentDate: game.date,
    rolePromises: [promise],
    games: Object.values(base.games).map((item) => item.id === game.id ? completedGame : item),
    matchStatLogs: [...Object.values(base.matchStatLogsByGameId).filter((item) => item.gameId !== game.id), log],
    competitions: Object.values(base.competitions).map((item) => item.id === competition.id ? { ...item, rules: { ...item.rules, gameFormat: { ...item.rules.gameFormat, periodMinutes: clockMinutes, overtimeMinutes } } } : item),
    contracts: Object.values(base.contractsById).map((item) => item.teamId === team.id ? { ...item, term: { startsOn: game.date, expiresOn: '2099-12-31' as typeof game.date } } : item),
  })
  return { world, game, playerId, team, promise }
}

const sample = fixture()
const nbaSample = fixture(12)
const promiseFor = (playerId: typeof sample.playerId, role: typeof sample.promise.role) => ({ ...sample.promise, id: `role-promise:${role}:${playerId}`, playerId, role })

describe('professional RolePromise usage evidence', () => {
  it('measures a sixth player against FIBA regulation time, not five-player aggregate', () => {
    const { world, promise } = sample
    const window = deriveRolePromiseUsage(world, promise)[0]!
    expect(window.evidence.find((item) => item.status === 'MEASURED')).toMatchObject({ status: 'MEASURED', started: false, appeared: true, playerSeconds: 1500, regulationSeconds: 2400 })
    expect(window.playingTimeShare).toBeCloseTo(1500 / 2400)
    expect(window.starts).toBe(0)
    expect(window.measuredGames).toBe(1)
  })

  it.each([
    ['STAR', 0, true, true],
    ['STARTER', 1, true, true],
    ['ROTATION', 5, false, true],
    ['DEPTH', 7, false, false],
  ] as const)('reports objective starts and minutes for %s without activating a fulfilment threshold', (role, index, started, appeared) => {
    const promise = promiseFor(sample.team.rosterPlayerIds[index]!, role)
    const measured = deriveRolePromiseUsage(sample.world, promise)[0]!.evidence.find((item) => item.status === 'MEASURED')!
    expect(measured).toMatchObject({ status: 'MEASURED', started, appeared })
    expect(promise.status).toBe('ACTIVE')
  })

  it('uses NBA regulation time and includes overtime seconds in the playing-time share', () => {
    const { world, game, promise } = nbaSample
    const overtimeLines = world.matchStatLogsByGameId[game.id]!.playerLines.map((line) => ({ ...line, stats: { ...line.stats, secondsPlayed: line.stats.secondsPlayed + (line.started ? 300 : 0) } }))
    const log = { ...world.matchStatLogsByGameId[game.id]!, playerLines: overtimeLines }
    const overtimeWorld = updateGameWorld(world, { matchStatLogs: [...Object.values(world.matchStatLogsByGameId).filter((item) => item.gameId !== game.id), log] })
    const evidence = deriveRolePromiseUsage(overtimeWorld, promise)[0]!.evidence[0]!
    expect(evidence).toMatchObject({ status: 'MEASURED', actualGameSeconds: 3180, regulationSeconds: 2880 })
    expect(evidence.status === 'MEASURED' && evidence.playerSeconds).toBe(1800)
    expect(deriveRolePromiseUsage(overtimeWorld, promise)[0]!.playingTimeShare).toBeCloseTo(1800 / 2880)
  })

  it('reconstructs the same evidence after Save V4 round-trip without persisting derived usage', () => {
    const { world, promise } = sample
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(world, '2026-11-02T12:00:00.000Z'))
    expect(deriveRolePromiseUsage(loaded, loaded.rolePromisesById[promise.id]!)).toEqual(deriveRolePromiseUsage(world, promise))
    expect(JSON.stringify(loaded)).not.toContain('playingTimeShare')
  })

  it('treats an omitted player line as an available DNP when the team logs are complete', () => {
    const { world, game, promise } = sample
    const log = world.matchStatLogsByGameId[game.id]!
    const playerId = promise.playerId
    const dnpLog = { ...log, playerLines: log.playerLines.filter((line) => line.playerId !== playerId) }
    const teamId = Object.values(world.contractsById).find((item) => item.playerId === playerId && world.teams[item.teamId]?.organizationId === promise.teamOrganizationId)!.teamId
    const completeDnpLog = { ...dnpLog, playerLines: dnpLog.playerLines.map((line) => line.teamId === teamId && line.started ? { ...line, stats: { ...line.stats, secondsPlayed: line.stats.secondsPlayed + 300 } } : line) }
    const dnpWorld = { ...world, matchStatLogsByGameId: { ...world.matchStatLogsByGameId, [game.id]: completeDnpLog } }
    expect(deriveRolePromiseUsage(dnpWorld, promise)[0]).toMatchObject({ availableGames: 1, appearances: 0, playerSeconds: 0, evidence: [{ status: 'MEASURED', started: false, appeared: false, playerSeconds: 0 }] })
  })

  it('excludes a game when a canonical injury or same-ecosystem restriction prevents participation', () => {
    const { world, game, promise } = sample
    const injured = updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), { id: injuryIdFromString('injury:role-promise-test'), playerId: promise.playerId, kind: 'ankleSprain', severity: 'minor', injuredOn: game.date, expectedReturnDate: addDays(game.date, 5) }] })
    expect(deriveRolePromiseUsage(injured, promise)[0]!.evidence[0]!.status).toBe('EXCLUDED_INJURY')
    const ecosystemId = world.competitions[game.competitionId]!.ecosystemId
    const restricted = updateGameWorld(world, { eligibilityRestrictions: [...Object.values(world.eligibilityRestrictionsById), { id: 'eligibility-restriction:role-promise-test', playerId: promise.playerId, ecosystemId, reasonCode: 'test', startsAt: game.date }] })
    expect(deriveRolePromiseUsage(restricted, promise)[0]!.evidence[0]!.status).toBe('EXCLUDED_RESTRICTION')
  })

  it('does not treat missing or incomplete records as coach non-use', () => {
    const { world, game, promise } = sample
    const missing = { ...world, matchStatLogsByGameId: Object.fromEntries(Object.entries(world.matchStatLogsByGameId).filter(([id]) => id !== game.id)) }
    expect(deriveRolePromiseUsage(missing, promise)[0]!.evidence[0]!.status).toBe('MISSING_MATCH_LOG')
    const log = world.matchStatLogsByGameId[game.id]!
    const incomplete = { ...world, matchStatLogsByGameId: { ...world.matchStatLogsByGameId, [game.id]: { ...log, playerLines: log.playerLines.slice(1) } } }
    expect(deriveRolePromiseUsage(incomplete, promise)[0]!.evidence[0]!.status).toBe('INCOMPLETE_MATCH_LOG')
  })
})
