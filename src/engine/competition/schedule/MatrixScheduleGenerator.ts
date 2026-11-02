import type { TeamId } from '@/domain/ids'

export interface MatrixMatchup {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
}

/**
 * Deterministic, explicitly simulated per-team fixture matrix.
 *
 * Unlike a uniform ROUND_ROBIN, this produces exactly gamesPerTeam matches for
 * every club, including when a league has an odd number of participants.
 * It does NOT recreate an official NBA/NBL/G League schedule, cup dependencies,
 * conferences or broadcasting dates. Those require distinct source bindings.
 */
export function matrixRoundCount(teamCount: number, gamesPerTeam: number): number {
  if (!Number.isInteger(teamCount) || teamCount < 2 || !Number.isInteger(gamesPerTeam) || gamesPerTeam < 1 || gamesPerTeam > 200) {
    throw new RangeError('Matrix requires at least two clubs and 1..200 games per team')
  }
  if (teamCount % 2 === 1 && gamesPerTeam % 2 !== 0) {
    throw new RangeError('Odd-sized matrix cannot give every team an odd number of games')
  }
  return teamCount % 2 === 0 ? gamesPerTeam : 3 * gamesPerTeam / 2
}

export function generateBalancedMatrixRounds(teamIds: readonly TeamId[], gamesPerTeam: number): readonly (readonly MatrixMatchup[])[] {
  if (new Set(teamIds).size !== teamIds.length) throw new RangeError('Duplicate matrix team identity')
  const expectedRounds = matrixRoundCount(teamIds.length, gamesPerTeam)
  const participants = [...teamIds].sort((a, b) => String(a).localeCompare(String(b)))
  const rounds: MatrixMatchup[][] = []

  if (participants.length % 2 === 0) {
    const matches = evenMatchings(participants)
    // Keep the first half of the schedule and then its mirrored counterpart,
    // avoiding consecutive immediate home-and-away rematches.
    const mirroredPairs = Math.floor(gamesPerTeam / 2)
    const first = Array.from({ length: mirroredPairs }, (_, i) => matches[i % matches.length]!)
    rounds.push(...first.map(round => round.map(pair => ({ homeTeamId: pair[0], awayTeamId: pair[1] }))))
    if (gamesPerTeam % 2 === 1) {
      rounds.push(matches[mirroredPairs % matches.length]!.map(pair => ({ homeTeamId: pair[0], awayTeamId: pair[1] })))
    }
    rounds.push(...first.map(round => round.map(pair => ({ homeTeamId: pair[1], awayTeamId: pair[0] }))))
  } else {
    // In odd cohorts each cyclic offset is a 2-regular graph: every team has
    // one home and one away. Split its edges into three disjoint matchdays.
    // Repeating offsets creates nonuniform opponent counts without byes debt.
    const n = participants.length
    for (let index = 0; index < gamesPerTeam / 2; index += 1) {
      const offset = index % ((n - 1) / 2) + 1
      let remaining: MatrixMatchup[] = participants.map((team, i) => ({
        homeTeamId: team,
        awayTeamId: participants[(i + offset) % n]!,
      }))
      while (remaining.length > 0) {
        const used = new Set<TeamId>()
        const round: MatrixMatchup[] = []
        const next: MatrixMatchup[] = []
        for (const fixture of remaining) {
          if (used.has(fixture.homeTeamId) || used.has(fixture.awayTeamId)) {
            next.push(fixture)
          } else {
            round.push(fixture)
            used.add(fixture.homeTeamId)
            used.add(fixture.awayTeamId)
          }
        }
        rounds.push(round)
        remaining = next
      }
    }
  }

  if (rounds.length !== expectedRounds) throw new Error('Matrix round packing did not preserve expected capacity')
  const appearances = new Map(participants.map(id => [id, { total: 0, home: 0, away: 0 }]))
  for (const round of rounds) {
    const seen = new Set<TeamId>()
    for (const fixture of round) {
      if (fixture.homeTeamId === fixture.awayTeamId || seen.has(fixture.homeTeamId) || seen.has(fixture.awayTeamId)) {
        throw new Error('Matrix round duplicates a participant')
      }
      seen.add(fixture.homeTeamId)
      seen.add(fixture.awayTeamId)
      const home = appearances.get(fixture.homeTeamId)!
      const away = appearances.get(fixture.awayTeamId)!
      home.total += 1; home.home += 1
      away.total += 1; away.away += 1
    }
  }
  for (const { total, home, away } of appearances.values()) {
    if (total !== gamesPerTeam || Math.abs(home - away) > 1) {
      throw new Error('Matrix does not preserve per-team quota and balanced hosting')
    }
  }
  return rounds
}

function evenMatchings(teams: readonly TeamId[]): readonly (readonly [TeamId, TeamId][])[] {
  const rotation = [...teams]
  const result: Array<Array<[TeamId, TeamId]>> = []
  for (let round = 0; round < teams.length - 1; round += 1) {
    const matches: Array<[TeamId, TeamId]> = []
    for (let i = 0; i < teams.length / 2; i += 1) {
      matches.push([rotation[i]!, rotation[rotation.length - 1 - i]!])
    }
    result.push(matches)
    rotation.splice(1, 0, rotation.pop()!)
  }
  return result
}
