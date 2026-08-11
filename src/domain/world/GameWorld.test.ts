import { describe, expect, it } from 'vitest'

import { createCoach } from '@/domain/coach'
import { createCompetition } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { createGameDate } from '@/domain/date'
import { createGame } from '@/domain/game'
import {
  coachIdFromString,
  competitionIdFromString,
  countryIdFromString,
  gameIdFromString,
  playerIdFromString,
  seasonIdFromString,
  teamIdFromString,
} from '@/domain/ids'
import { createPlayer } from '@/domain/player'
import { createTeam } from '@/domain/team'

import {
  createGameWorld,
  GAME_WORLD_SCHEMA_VERSION,
  GameWorldValidationError,
} from './index'
import { createValidGameWorldInput } from './testFixtures'

describe('GameWorld', () => {
  it('creates a valid normalized world', () => {
    const input = createValidGameWorldInput()
    const world = createGameWorld(input)

    expect(world.schemaVersion).toBe(GAME_WORLD_SCHEMA_VERSION)
    expect(world.currentDate).toBe(input.currentDate)
    expect(world.userCoachId).toBe(input.userCoachId)
    expect(world.players[playerIdFromString('player-home')]).toBe(input.players[0])
    expect(world.teams[teamIdFromString('team-home')]).toBe(input.teams[0])
  })

  it('rejects duplicate entity IDs', () => {
    const duplicateCountryInput = createValidGameWorldInput()
    duplicateCountryInput.countries = [...duplicateCountryInput.countries, duplicateCountryInput.countries[0]!]
    expect(() => createGameWorld(duplicateCountryInput)).toThrow(GameWorldValidationError)

    const duplicatePlayerInput = createValidGameWorldInput()
    duplicatePlayerInput.players = [...duplicatePlayerInput.players, duplicatePlayerInput.players[0]!]
    expect(() => createGameWorld(duplicatePlayerInput)).toThrow(GameWorldValidationError)
  })

  it('rejects players assigned to multiple rosters', () => {
    const input = createValidGameWorldInput()
    const homePlayer = input.players[0]!
    input.teams = [
      input.teams[0]!,
      createTeam({ ...input.teams[1]!, rosterPlayerIds: [homePlayer.id] }),
    ]

    expect(() => createGameWorld(input)).toThrow('belongs to more than one team roster')
  })

  it('rejects coaches assigned to multiple teams', () => {
    const input = createValidGameWorldInput()
    input.teams = [
      input.teams[0]!,
      createTeam({ ...input.teams[1]!, coachId: input.userCoachId }),
    ]

    expect(() => createGameWorld(input)).toThrow('is assigned to more than one team')
  })

  it('rejects missing user, nationality, team, participant, and season references', () => {
    const missingUser = createValidGameWorldInput()
    missingUser.userCoachId = coachIdFromString('missing-coach')
    expect(() => createGameWorld(missingUser)).toThrow(GameWorldValidationError)

    const missingCoachNationality = createValidGameWorldInput()
    missingCoachNationality.coaches = [
      createCoach({ ...missingCoachNationality.coaches[0]!, nationalityId: countryIdFromString('missing-country') }),
    ]
    expect(() => createGameWorld(missingCoachNationality)).toThrow(GameWorldValidationError)

    const missingPlayerNationality = createValidGameWorldInput()
    missingPlayerNationality.players = [
      createPlayer({ ...missingPlayerNationality.players[0]!, nationalityId: countryIdFromString('missing-country') }),
      missingPlayerNationality.players[1]!,
    ]
    expect(() => createGameWorld(missingPlayerNationality)).toThrow(GameWorldValidationError)

    const missingTeamCountry = createValidGameWorldInput()
    missingTeamCountry.teams = [
      createTeam({ ...missingTeamCountry.teams[0]!, countryId: countryIdFromString('missing-country') }),
      missingTeamCountry.teams[1]!,
    ]
    expect(() => createGameWorld(missingTeamCountry)).toThrow(GameWorldValidationError)

    const missingRosterPlayer = createValidGameWorldInput()
    missingRosterPlayer.teams = [
      createTeam({ ...missingRosterPlayer.teams[0]!, rosterPlayerIds: [playerIdFromString('missing-player')] }),
      missingRosterPlayer.teams[1]!,
    ]
    expect(() => createGameWorld(missingRosterPlayer)).toThrow(GameWorldValidationError)

    const missingTeamCoach = createValidGameWorldInput()
    missingTeamCoach.teams = [
      createTeam({ ...missingTeamCoach.teams[0]!, coachId: coachIdFromString('missing-coach') }),
      missingTeamCoach.teams[1]!,
    ]
    expect(() => createGameWorld(missingTeamCoach)).toThrow(GameWorldValidationError)

    const missingParticipant = createValidGameWorldInput()
    missingParticipant.competitions = [
      createCompetition({
        ...missingParticipant.competitions[0]!,
        participantTeamIds: [teamIdFromString('missing-team')],
      }),
    ]
    expect(() => createGameWorld(missingParticipant)).toThrow(GameWorldValidationError)

    const missingSeasonCompetition = createValidGameWorldInput()
    missingSeasonCompetition.seasons = [
      { ...missingSeasonCompetition.seasons[0]!, competitionId: competitionIdFromString('missing-competition') },
    ]
    expect(() => createGameWorld(missingSeasonCompetition)).toThrow(GameWorldValidationError)
  })

  it('rejects missing game references', () => {
    const missingSeason = createValidGameWorldInput()
    missingSeason.games = [
      createGame({ ...missingSeason.games[0]!, seasonId: seasonIdFromString('missing-season') }),
    ]
    expect(() => createGameWorld(missingSeason)).toThrow(GameWorldValidationError)

    const missingCompetition = createValidGameWorldInput()
    missingCompetition.games = [
      createGame({ ...missingCompetition.games[0]!, competitionId: competitionIdFromString('missing-competition') }),
    ]
    expect(() => createGameWorld(missingCompetition)).toThrow(GameWorldValidationError)

    const missingTeam = createValidGameWorldInput()
    missingTeam.games = [
      createGame({ ...missingTeam.games[0]!, homeTeamId: teamIdFromString('missing-team') }),
    ]
    expect(() => createGameWorld(missingTeam)).toThrow(GameWorldValidationError)
  })

  it('rejects player and competition gender mismatches', () => {
    const playerMismatch = createValidGameWorldInput()
    playerMismatch.players = [
      createPlayer({ ...playerMismatch.players[0]!, gender: 'male' }),
      playerMismatch.players[1]!,
    ]
    expect(() => createGameWorld(playerMismatch)).toThrow('different gender')

    const competitionMismatch = createValidGameWorldInput()
    competitionMismatch.competitions = [
      createCompetition({ ...competitionMismatch.competitions[0]!, gender: 'male' }),
    ]
    expect(() => createGameWorld(competitionMismatch)).toThrow('different gender')
  })

  it('allows a coach whose gender differs from their team', () => {
    expect(() => createGameWorld(createValidGameWorldInput())).not.toThrow()
  })

  it('rejects game competition and participant inconsistencies', () => {
    const differentCompetition = createValidGameWorldInput()
    const secondCompetition = createCompetition({
      ...differentCompetition.competitions[0]!,
      id: competitionIdFromString('competition-b'),
    })
    differentCompetition.competitions = [...differentCompetition.competitions, secondCompetition]
    differentCompetition.games = [
      createGame({ ...differentCompetition.games[0]!, competitionId: secondCompetition.id }),
    ]
    expect(() => createGameWorld(differentCompetition)).toThrow('does not match its season')

    const nonParticipant = createValidGameWorldInput()
    nonParticipant.competitions = [
      createCompetition({ ...nonParticipant.competitions[0]!, participantTeamIds: [nonParticipant.teams[0]!.id] }),
    ]
    expect(() => createGameWorld(nonParticipant)).toThrow('is not a participant')
  })

  it('rejects games outside their season date range', () => {
    const input = createValidGameWorldInput()
    input.games = [
      createGame({ ...input.games[0]!, date: createGameDate(2033, 6, 1) }),
    ]

    expect(() => createGameWorld(input)).toThrow('outside its season range')
  })

  it('serializes to plain JSON data', () => {
    const world = createGameWorld(createValidGameWorldInput())
    const serialized = JSON.stringify(world)
    const parsed = JSON.parse(serialized) as { schemaVersion: number; players: Record<string, unknown> }

    expect(parsed.schemaVersion).toBe(GAME_WORLD_SCHEMA_VERSION)
    expect(parsed.players['player-home']).toMatchObject({ id: 'player-home' })
    expect(serialized).not.toContain('Map')
    expect(serialized).not.toContain('Set')
  })
})
