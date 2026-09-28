/**
 * Builds a REAL MatchEngine Next session for the Phaser POC demo.
 *
 * This uses exactly the same construction path as the real application (see
 * `src/app/game/playUserGame.ts` / `LiveMatchController`) and the same fixture pattern already
 * used by `src/engine/match/MatchEngine.test.ts`:
 *   generateWorld -> generateRoundRobinSchedule -> createMatchSession (+ rotation plans).
 *
 * Nothing here is scripted or faked: `generateWorld` produces a real GameWorld with real
 * players/ratings/teams, and the resulting MatchSession is driven forward exclusively through
 * `stepMatchSession` / `applyDueRotations`, MatchEngine Next's own public API. No shot, pass,
 * rebound, or possession outcome is computed here.
 */

import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import type { PlayerId } from '@/domain/ids'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { generateWorld } from '@/engine/world'
import { calculateTeamStrength } from '@/engine/team'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'
import { resolveStartingFive } from '@/engine/team'
import {
  applyDueRotations,
  createDefaultRotationPlan,
  createMatchPlayerProfile,
  createMatchSession,
  INITIAL_ROTATION_CONTROLLER_STATE,
  MINIMUM_MATCH_SQUAD_SIZE,
  stepMatchSession,
  type MatchSession,
  type RotationControllerState,
} from '@/engine/match'
import { SeededRandomSource, hashStringToSeed } from '@/engine/random'
import type { PresentationPlayerLabels } from '../MatchPresentationBridge'

export interface MatchDemoHandle {
  readonly world: GameWorld
  step(): MatchSession
  readonly session: MatchSession
  readonly labels: PresentationPlayerLabels
}

/** Builds a fresh real GameWorld + scheduled Game, exactly like MatchEngine.test.ts's fixture. */
function buildDemoWorld(seed: number): { readonly world: GameWorld; readonly game: GameWorld['games'][keyof GameWorld['games']] } {
  const generatedWorld = generateWorld({ seed, gender: 'male' })
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

function buildLabels(world: GameWorld, playerIds: readonly PlayerId[]): PresentationPlayerLabels {
  const labels = new Map<PlayerId, { readonly label: string; readonly jersey: number }>()
  playerIds.forEach((playerId, index) => {
    const player = world.players[playerId]
    const label = player === undefined ? String(playerId).slice(0, 6) : `${player.firstName[0]}. ${player.lastName}`
    labels.set(playerId, { label, jersey: index + 4 })
  })
  return labels
}

/**
 * Creates one real MatchEngine session plus a `.step()` that advances it through the engine's own
 * `applyDueRotations` + `stepMatchSession` — identical in shape to `LiveMatchController.advanceOneStep`.
 */
export function createMatchDemo(seed = 424242): MatchDemoHandle {
  const { world, game } = buildDemoWorld(seed)
  const homeSquad = getAvailablePlayersForCompetition(world, game.homeTeamId, game.competitionId, game.seasonId, game.date)
  const awaySquad = getAvailablePlayersForCompetition(world, game.awayTeamId, game.competitionId, game.seasonId, game.date)
  if (homeSquad.length < MINIMUM_MATCH_SQUAD_SIZE || awaySquad.length < MINIMUM_MATCH_SQUAD_SIZE) {
    throw new Error('Generated demo world does not have enough available players per team')
  }

  const lineups = {
    home: resolveStartingFive(world, game.homeTeamId, game.date, homeSquad),
    away: resolveStartingFive(world, game.awayTeamId, game.date, awaySquad),
  }
  const squads = { home: homeSquad, away: awaySquad }
  const playerProfiles = {
    home: homeSquad.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)),
    away: awaySquad.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)),
  }
  const homeRotationPlan = createDefaultRotationPlan({ teamId: game.homeTeamId, squad: homeSquad, initialLineup: lineups.home, players: world.players })
  const awayRotationPlan = createDefaultRotationPlan({ teamId: game.awayTeamId, squad: awaySquad, initialLineup: lineups.away, players: world.players })

  const random = new SeededRandomSource(seed)
  const decisionRandom = new SeededRandomSource(hashStringToSeed(`match-decisions-v1:${seed}`))
  const actorRandom = new SeededRandomSource(hashStringToSeed(`match-actors-v1:${seed}`))

  let session = createMatchSession({
    world,
    gameId: game.id,
    homeStrength: calculateTeamStrength(world, game.homeTeamId, game.date, homeSquad),
    awayStrength: calculateTeamStrength(world, game.awayTeamId, game.date, awaySquad),
    lineups,
    squads,
    playerProfiles,
    random,
    decisionRandom,
    actorRandom,
  })

  let homeController: RotationControllerState = INITIAL_ROTATION_CONTROLLER_STATE
  let awayController: RotationControllerState = INITIAL_ROTATION_CONTROLLER_STATE

  const labels = buildLabels(world, [...squads.home, ...squads.away])

  return {
    world,
    get session() {
      return session
    },
    labels,
    step(): MatchSession {
      if (!session.state.isComplete) {
        const home = applyDueRotations(session, homeRotationPlan, homeController)
        const away = applyDueRotations(home.session, awayRotationPlan, awayController)
        homeController = home.controllerState
        awayController = away.controllerState
        session = stepMatchSession(away.session).session
      }
      return session
    },
  }
}
