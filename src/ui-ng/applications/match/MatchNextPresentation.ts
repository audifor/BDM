import type { GameWorld } from '@/domain/world'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { MatchNextResult } from '@/app/matchNext'
import type { MatchFrame, MatchSetup } from '@/engine/match-next'

export interface MatchNextPresentedStats {
  readonly points: number
  readonly rebounds: number
  readonly steals: number
  readonly fieldGoalsMade: number
  readonly fieldGoalsAttempted: number
  readonly twoPointMade: number
  readonly twoPointAttempted: number
  readonly threePointMade: number
  readonly threePointAttempted: number
}

export interface MatchNextPresentedPlayer {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly started: boolean
  readonly onCourt: boolean
  readonly courtTimeSeconds: number
  readonly matchFatigue: number
  readonly preMatchFatigue: number
  readonly stats: MatchNextPresentedStats
}

export interface MatchNextPresentedTeam {
  readonly teamId: TeamId
  readonly score: number
  readonly starters: readonly MatchNextPresentedPlayer[]
  readonly currentFive: readonly MatchNextPresentedPlayer[]
  readonly bench: readonly MatchNextPresentedPlayer[]
  readonly players: readonly MatchNextPresentedPlayer[]
  readonly stats: MatchNextPresentedStats
}

export interface MatchNextPresentationState {
  readonly home: MatchNextPresentedTeam
  readonly away: MatchNextPresentedTeam
  readonly playersById: ReadonlyMap<PlayerId, MatchNextPresentedPlayer>
  readonly substitutionEvents: readonly MatchFrame['events'][number][]
  readonly unsupportedStats: readonly ['AST', 'BLK', 'TO', 'PF', 'FT']
}

const zeroStats = (): MatchNextPresentedStats => ({
  points: 0,
  rebounds: 0,
  steals: 0,
  fieldGoalsMade: 0,
  fieldGoalsAttempted: 0,
  twoPointMade: 0,
  twoPointAttempted: 0,
  threePointMade: 0,
  threePointAttempted: 0,
})

/** Read-only UI projection of Match Next state/events. Unsupported stats are deliberately absent. */
export function projectMatchNextPresentation(
  world: GameWorld,
  setup: MatchSetup,
  frame: MatchFrame,
  result?: MatchNextResult | null,
): MatchNextPresentationState {
  const statsByPlayer = new Map<PlayerId, MatchNextPresentedStats>()
  const eventSource = result?.events ?? frame.events
  for (const playerId of [...setup.homeSquad, ...setup.awaySquad]) statsByPlayer.set(playerId, zeroStats())

  if (result) {
    for (const stat of result.playerStats) {
      const current = statsByPlayer.get(stat.playerId)
      if (!current) continue
      statsByPlayer.set(stat.playerId, {
        ...current,
        points: stat.points,
        rebounds: stat.rebounds,
        steals: stat.steals,
        fieldGoalsMade: stat.fieldGoalsMade,
        fieldGoalsAttempted: stat.fieldGoalsAttempted,
        twoPointMade: stat.twoPointMade,
        twoPointAttempted: stat.twoPointAttempted,
        threePointMade: stat.threePointMade,
        threePointAttempted: stat.threePointAttempted,
      })
    }
  } else {
    for (const event of eventSource) {
      const shooterId = event.shooterPlayerId
      if (event.type === 'shotReleased' && shooterId) {
        const current = statsByPlayer.get(shooterId)
        if (current) statsByPlayer.set(shooterId, {
          ...current,
          fieldGoalsAttempted: current.fieldGoalsAttempted + 1,
          ...(event.points === 3
            ? { threePointAttempted: current.threePointAttempted + 1 }
            : { twoPointAttempted: current.twoPointAttempted + 1 }),
        })
      }
      if (event.type === 'shotMade' && shooterId) {
        const current = statsByPlayer.get(shooterId)
        if (current) statsByPlayer.set(shooterId, {
          ...current,
          points: current.points + (event.points ?? 0),
          fieldGoalsMade: current.fieldGoalsMade + 1,
          ...(event.points === 3
            ? { threePointMade: current.threePointMade + 1 }
            : { twoPointMade: current.twoPointMade + 1 }),
        })
      }
      if (event.type === 'reboundSecured' && event.playerId) {
        const current = statsByPlayer.get(event.playerId)
        if (current) statsByPlayer.set(event.playerId, { ...current, rebounds: current.rebounds + 1 })
      }
      if (event.type === 'passIntercepted' && event.playerId) {
        const current = statsByPlayer.get(event.playerId)
        if (current) statsByPlayer.set(event.playerId, { ...current, steals: current.steals + 1 })
      }
    }
  }

  const playersById = new Map<PlayerId, MatchNextPresentedPlayer>()
  for (const rotationPlayer of frame.rotationPlayers) {
    playersById.set(rotationPlayer.playerId, {
      playerId: rotationPlayer.playerId,
      teamId: rotationPlayer.teamId,
      started: rotationPlayer.started,
      onCourt: rotationPlayer.active,
      courtTimeSeconds: rotationPlayer.courtTimeTenths / 10,
      matchFatigue: rotationPlayer.matchSessionFatigue,
      preMatchFatigue: rotationPlayer.preMatchCareerFatigue,
      stats: statsByPlayer.get(rotationPlayer.playerId) ?? zeroStats(),
    })
  }
  const team = (teamId: TeamId, squad: readonly PlayerId[], score: number, starters: readonly PlayerId[]): MatchNextPresentedTeam => {
    const players = squad.flatMap((playerId) => {
      const player = playersById.get(playerId)
      return player ? [player] : []
    })
    const sum = players.reduce((totals, player) => addStats(totals, player.stats), zeroStats())
    return {
      teamId,
      score,
      starters: starters.flatMap((playerId) => {
        const player = playersById.get(playerId)
        return player ? [player] : []
      }),
      currentFive: players.filter((player) => player.onCourt),
      bench: players.filter((player) => !player.onCourt),
      players,
      stats: sum,
    }
  }

  // The setup and world provide identity/roster truth; this access validates that the match belongs to this world.
  if (!world.games[setup.gameId] || !world.teams[setup.homeTeamId] || !world.teams[setup.awayTeamId]) {
    throw new Error('Match Next presentation requires the setup game and teams in the current world')
  }
  return {
    home: team(setup.homeTeamId, setup.homeSquad, frame.score.home, setup.initialLineups.home),
    away: team(setup.awayTeamId, setup.awaySquad, frame.score.away, setup.initialLineups.away),
    playersById,
    substitutionEvents: frame.events.filter((event) => event.type === 'substitution' && event.playerId !== undefined && event.outgoingPlayerId !== undefined),
    unsupportedStats: ['AST', 'BLK', 'TO', 'PF', 'FT'],
  }
}

function addStats(left: MatchNextPresentedStats, right: MatchNextPresentedStats): MatchNextPresentedStats {
  return {
    points: left.points + right.points,
    rebounds: left.rebounds + right.rebounds,
    steals: left.steals + right.steals,
    fieldGoalsMade: left.fieldGoalsMade + right.fieldGoalsMade,
    fieldGoalsAttempted: left.fieldGoalsAttempted + right.fieldGoalsAttempted,
    twoPointMade: left.twoPointMade + right.twoPointMade,
    twoPointAttempted: left.twoPointAttempted + right.twoPointAttempted,
    threePointMade: left.threePointMade + right.threePointMade,
    threePointAttempted: left.threePointAttempted + right.threePointAttempted,
  }
}
