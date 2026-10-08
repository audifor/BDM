import { describe, expect, it } from 'vitest'

import { gameIdFromString, type PlayerId } from '@/domain/ids'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'
import { createMatchPlayerProfile, createMatchSession, stepMatchSession, type MatchLineups } from '@/engine/match'

import { toMatchPresentationEvent, toMatchPresentationState, type PresentationPlayerLabels } from './MatchPresentationBridge'
import { interpolatePresentationState } from './interpolation'

describe('MatchPresentationBridge', () => {
  it('derives a presentation state with exactly the 10 active players and their real MatchEngine positions', () => {
    const { world, game } = createScheduledGameWorld()
    const options = createOptions(world, game.id, 777)
    const session = createMatchSession(options)
    const labels = buildLabels([...options.lineups.home, ...options.lineups.away])

    const state = toMatchPresentationState(session.state, labels)

    expect(state.players).toHaveLength(10)
    expect(new Set(state.players.map((p) => p.side))).toEqual(new Set(['home', 'away']))
    for (const player of state.players) {
      expect(player.position.xPercent).toBeGreaterThanOrEqual(0)
      expect(player.position.xPercent).toBeLessThanOrEqual(100)
      expect(player.position.yPercent).toBeGreaterThanOrEqual(0)
      expect(player.position.yPercent).toBeLessThanOrEqual(100)
    }
    expect(state.clock.period).toBe(session.state.period)
    expect(state.score).toEqual({ home: session.state.homeScore, away: session.state.awayScore })
  })

  it('never introduces a gameplay outcome: presentation events are 1:1 derived from MatchEvent fields', () => {
    const { world, game } = createScheduledGameWorld()
    let session = createMatchSession(createOptions(world, game.id, 2024))
    const collected = new Set<string>()
    for (let i = 0; i < 60 && !session.state.isComplete; i += 1) {
      const before = session.state.events.length
      session = stepMatchSession(session).session
      const newEvents = session.state.events.slice(before)
      for (const event of newEvents) {
        const presentationEvent = toMatchPresentationEvent(event)
        collected.add(presentationEvent.kind)
        // The presentation event's score/clock must match the source event exactly (no derived math).
        expect(presentationEvent.homeScore).toBe(event.homeScore)
        expect(presentationEvent.awayScore).toBe(event.awayScore)
        expect(presentationEvent.sequence).toBe(event.sequence)
      }
    }
    expect(collected.size).toBeGreaterThan(0)
  })

  it('interpolation never changes authoritative facts (score, clock, possession, completion)', () => {
    const { world, game } = createScheduledGameWorld()
    const options = createOptions(world, game.id, 55)
    const labels = buildLabels([...options.lineups.home, ...options.lineups.away])
    let session = createMatchSession(options)
    const from = toMatchPresentationState(session.state, labels)
    session = stepMatchSession(session).session
    const to = toMatchPresentationState(session.state, labels)

    for (const t of [0.25, 0.5, 0.75]) {
      const blended = interpolatePresentationState(from, to, t)
      expect(blended.score).toEqual(to.score)
      expect(blended.clock).toEqual(to.clock)
      expect(blended.possession).toEqual(to.possession)
      expect(blended.isComplete).toBe(to.isComplete)
    }
  })

  it('interpolation returns the exact endpoint snapshots at t=0 and t=1', () => {
    const { world, game } = createScheduledGameWorld()
    const options = createOptions(world, game.id, 999)
    const labels = buildLabels([...options.lineups.home, ...options.lineups.away])
    let session = createMatchSession(options)
    const from = toMatchPresentationState(session.state, labels)
    session = stepMatchSession(session).session
    const to = toMatchPresentationState(session.state, labels)

    expect(interpolatePresentationState(from, to, 0)).toEqual(from)
    expect(interpolatePresentationState(from, to, 1)).toEqual(to)
  })
})

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generatedWorld = generateWorld({ seed: 4242, gender: 'female' })
  const games = generateRoundRobinSchedule({ world: generatedWorld, seasonId: Object.values(generatedWorld.seasons)[0]!.id })
  const world = createGameWorld({
    currentDate: generatedWorld.currentDate,
    userCoachId: generatedWorld.userCoachId,
    countries: Object.values(generatedWorld.countries),
    coaches: Object.values(generatedWorld.coaches),
    players: Object.values(generatedWorld.players),
    teams: Object.values(generatedWorld.teams),
    staffPeople: Object.values(generatedWorld.staffPeopleById),
    teamStaffAssignments: Object.values(generatedWorld.teamStaffAssignmentsById),
    competitions: Object.values(generatedWorld.competitions),
    seasons: Object.values(generatedWorld.seasons),
    games,
  })
  return { world, game: games[0]! }
}

function createOptions(world: GameWorld, gameId: ReturnType<typeof gameIdFromString>, seed: number) {
  const game = world.games[gameId]!
  return {
    world,
    gameId,
    homeStrength: { teamId: game.homeTeamId, value: 50 },
    awayStrength: { teamId: game.awayTeamId, value: 50 },
    lineups: lineupsFor(world, game),
    squads: squadsFor(world, game),
    playerProfiles: profilesFor(world, game),
    random: new SeededRandomSource(seed),
    decisionRandom: new SeededRandomSource(seed + 1),
    actorRandom: new SeededRandomSource(seed + 2),
  }
}

function lineupsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]): MatchLineups {
  return {
    home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5),
    away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5),
  }
}

function squadsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) {
  return { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds }
}

function profilesFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) {
  return {
    home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)),
    away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)),
  }
}

function buildLabels(playerIds: readonly PlayerId[]): PresentationPlayerLabels {
  const labels = new Map<PlayerId, { readonly label: string; readonly jersey: number }>()
  playerIds.forEach((playerId, index) => labels.set(playerId, { label: String(playerId), jersey: index }))
  return labels
}
