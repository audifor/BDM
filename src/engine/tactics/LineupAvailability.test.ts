import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { injuryIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { updateGameWorld } from '@/domain/world'
import { getNextScheduledGameForTeam } from '@/engine/calendar'

import { assertLineupCandidate, classifyLineupCandidate, LineupSelectionError } from './LineupAvailability'
import { setLineupSlot } from './LineupEngine'

function ncaaFixture() {
  const world = createNewGame()
  const season = Object.values(world.seasons).find((candidate) => world.ecosystems[world.competitions[candidate.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
  const first = Object.values(world.games).find((candidate) => candidate.seasonId === season.id && candidate.status === 'scheduled')!
  // The rule is evaluated for the team's NEXT scheduled game, so the fixture is that game.
  const game = getNextScheduledGameForTeam(world, first.homeTeamId)!
  return { world, game, team: world.teams[first.homeTeamId]! }
}

describe('lineup candidates: the squad rule the match preparation applies', () => {
  it('lets a healthy, eligible roster player in and refuses someone from another team', () => {
    const { world, game, team: own } = ncaaFixture()
    const other = world.teams[own.id === game.homeTeamId ? game.awayTeamId : game.homeTeamId]!
    expect(classifyLineupCandidate(world, own.id, own.rosterPlayerIds[0]!)).toEqual({ playerId: own.rosterPlayerIds[0], selectable: true })
    expect(classifyLineupCandidate(world, own.id, other.rosterPlayerIds[0]!)).toMatchObject({ selectable: false, reason: 'NOT_ON_ROSTER' })
  })

  it('refuses an injured player and says why, while a healthy teammate stays selectable', () => {
    const { world, game, team } = ncaaFixture()
    const [hurt, healthy] = [team.rosterPlayerIds[0]!, team.rosterPlayerIds[1]!]
    const injured = updateGameWorld(world, {
      injuries: [createInjury({ id: injuryIdFromString('lineup-hurt'), playerId: hurt, kind: 'ankleSprain', severity: 'minor', injuredOn: addDays(world.currentDate, -10), expectedReturnDate: addDays(game.date, 5) })],
    })
    expect(classifyLineupCandidate(injured, team.id, hurt)).toMatchObject({ selectable: false, reason: 'INJURED', detail: expect.stringContaining('Lesionado') })
    expect(() => assertLineupCandidate(injured, team.id, hurt)).toThrow(LineupSelectionError)
    expect(classifyLineupCandidate(injured, team.id, healthy).selectable).toBe(true)
  })

  it('refuses a player who is not eligible for the competition and keeps the lineup untouched', () => {
    const { world, game, team } = ncaaFixture()
    const playerId = team.rosterPlayerIds[0]!
    const restricted = updateGameWorld(world, { eligibilityRestrictions: [{ id: 'eligibility-restriction:lineup', playerId, ecosystemId: world.competitions[game.competitionId]!.ecosystemId, reasonCode: 'test', startsAt: game.date }] })
    expect(classifyLineupCandidate(restricted, team.id, playerId)).toMatchObject({ selectable: false, reason: 'INELIGIBLE' })
    expect(() => setLineupSlot(restricted, team.id, 'PG', playerId)).toThrow(LineupSelectionError)
    expect(restricted.lineupsByTeamId[team.id]).toEqual(world.lineupsByTeamId[team.id])
    expect(setLineupSlot(restricted, team.id, 'PG', team.rosterPlayerIds[1]!).lineupsByTeamId[team.id]?.starters.PG).toBe(team.rosterPlayerIds[1])
  })
})
