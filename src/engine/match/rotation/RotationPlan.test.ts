import { describe, expect, it } from 'vitest'

import { countryIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createPlayer, type Player } from '@/domain/player'

import { type MatchSession, type MatchSquads } from '../MatchEngine'
import { applyDueRotations, INITIAL_ROTATION_CONTROLLER_STATE } from './RotationController'
import { createDefaultRotationPlan } from './RotationPlan'

const TEAM_ID = teamIdFromString('rotation-team')
const OPPONENT_ID = teamIdFromString('opponent-team')
const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const
const starters = positions.map((position) => playerIdFromString(`starter-${position}`))
const backups = positions.map((position) => playerIdFromString(`backup-${position}`))

describe('default match rotations', () => {
  it('selects the best unique positional backups deterministically and schedules Q1-Q4', () => {
    const players = playerRecord([
      ...positions.map((position, index) => player(`starter-${position}`, position, 90 - index)),
      ...positions.map((position, index) => player(`backup-${position}`, position, 40 + index)),
      player('backup-PG-alpha', 'PG', 80),
      player('backup-PG-beta', 'PG', 80),
    ])
    const squad = [...starters, ...backups, playerIdFromString('backup-PG-alpha'), playerIdFromString('backup-PG-beta')]
    const first = createDefaultRotationPlan({ teamId: TEAM_ID, squad, initialLineup: starters, players })
    const second = createDefaultRotationPlan({ teamId: TEAM_ID, squad, initialLineup: starters, players })

    expect(first).toEqual(second)
    expect(first.instructions).toHaveLength(20)
    expect(first.instructions.find((item) => item.period === 1 && item.clockThresholdSeconds === 120 && item.playerOutId === starters[0])).toMatchObject({ playerInId: playerIdFromString('backup-PG-alpha') })
    expect(new Set(first.instructions.filter((item) => item.period === 1).map((item) => item.playerInId)).size).toBe(5)
    expect(first.instructions.filter((item) => item.period === 1 && item.clockThresholdSeconds === 240).map((item) => item.playerOutId)).toEqual([starters[1], starters[3]])
    expect(first.instructions.filter((item) => item.period === 4 && item.clockThresholdSeconds === 360).map((item) => item.playerInId)).toEqual([starters[1], starters[3]])
  })

  it('uses the highest-impact unassigned fallback and supports partial or five-player squads', () => {
    const players = playerRecord([...positions.map((position) => player(`starter-${position}`, position, 90)), player('bench-sf', 'SF', 50), player('bench-pg', 'PG', 70), player('bench-pf', 'PF', 60)])
    const partial = createDefaultRotationPlan({ teamId: TEAM_ID, squad: [...starters, playerIdFromString('bench-sf'), playerIdFromString('bench-pg'), playerIdFromString('bench-pf')], initialLineup: starters, players })
    const five = createDefaultRotationPlan({ teamId: TEAM_ID, squad: starters, initialLineup: starters, players })

    expect(partial.instructions).toHaveLength(12)
    expect(partial.instructions.find((item) => item.playerOutId === starters[0])).toMatchObject({ playerInId: playerIdFromString('bench-pg') })
    expect(five.instructions).toEqual([])
  })

  it('applies each due instruction once through MatchSession substitutions without changing clock or score', () => {
    const squad: MatchSquads = { home: [...starters, ...backups], away: positions.map((position) => playerIdFromString(`away-${position}`)) }
    const session = sessionAt(239, squad)
    const plan = { teamId: TEAM_ID, instructions: [
      { period: 1, clockThresholdSeconds: 240, playerOutId: starters[1]!, playerInId: backups[1]! },
      { period: 1, clockThresholdSeconds: 240, playerOutId: starters[3]!, playerInId: backups[3]! },
    ] }
    const applied = applyDueRotations(session, plan, INITIAL_ROTATION_CONTROLLER_STATE)
    const again = applyDueRotations(applied.session, plan, applied.controllerState)

    expect(applied.session.state.clockSecondsRemaining).toBe(239)
    expect(applied.session.state.homeScore).toBe(session.state.homeScore)
    expect(applied.session.state.events.filter((event) => event.type === 'substitution')).toHaveLength(2)
    expect(applied.session.state.activeLineups.home).toEqual([starters[0], backups[1], starters[2], backups[3], starters[4]])
    expect(again.session).toBe(applied.session)
  })
})

function player(id: string, position: typeof positions[number], impact: number): Player {
  return createPlayer({ id: playerIdFromString(id), firstName: 'Test', lastName: id, gender: 'male', nationalityId: countryIdFromString('country'), basketball: { primaryPosition: position, ratings: { finishing: impact, shooting: impact, playmaking: impact, perimeterDefense: impact, interiorDefense: impact, rebounding: impact, athleticism: impact } } })
}

function playerRecord(players: readonly Player[]): Record<Player['id'], Player> { return Object.fromEntries(players.map((item) => [item.id, item])) as Record<Player['id'], Player> }

function sessionAt(clockSecondsRemaining: number, squads: MatchSquads): MatchSession {
  const profile = (playerId: typeof starters[number]) => ({ playerId, primaryPosition: 'PG' as const, offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 50 }, defense: { pointOfAttack: 50, interior: 50, mobility: 50 } })
  return { state: { gameId: 'game' as MatchSession['state']['gameId'], homeTeamId: TEAM_ID, awayTeamId: OPPONENT_ID, initialLineups: { home: starters, away: squads.away }, activeLineups: { home: starters, away: squads.away }, squads, fatigueByPlayerId: Object.fromEntries([...squads.home, ...squads.away].map((id) => [id, 0])), playerProfiles: { home: squads.home.map(profile), away: squads.away.map(profile) }, homeStrength: { teamId: TEAM_ID, value: 50 }, awayStrength: { teamId: OPPONENT_ID, value: 50 }, openingTeamId: TEAM_ID, period: 1, clockSecondsRemaining, homeScore: 42, awayScore: 40, attackingTeamId: TEAM_ID, nextSequence: 1, events: [], isComplete: false }, random: {} as MatchSession['random'], decisionRandom: {} as MatchSession['decisionRandom'], actorRandom: {} as MatchSession['actorRandom'] }
}
