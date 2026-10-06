import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createInjury, type InjuryRecord } from '@/domain/injury'
import { injuryIdFromString, type PlayerId, type TeamId } from '@/domain/ids'
import { getAvailableRosterPlayers, updateGameWorld, type GameWorld } from '@/domain/world'
import { canRecordInjuries, overlapsRecordedInjury, selectRecordableInjuries } from './InjuryApplication'

function injury(playerId: PlayerId, onDate: GameWorld['currentDate'], extraDays: number, id = `mx02-recordable:${playerId}:${onDate}`): InjuryRecord {
  return createInjury({ id: injuryIdFromString(id), playerId, kind: 'ankleSprain', severity: 'minor', injuredOn: onDate, expectedReturnDate: addDays(onDate, 10 + extraDays) })
}

/** Takes a club down to exactly `keep` available Players by injuring the rest. */
function clubWithAvailable(world: GameWorld, teamId: TeamId, keep: number): GameWorld {
  const injuries = getAvailableRosterPlayers(world, teamId, world.currentDate).slice(keep).map((player, index) => injury(player.id, world.currentDate, index, `mx02-exhaust:${teamId}:${player.id}`))
  const next = updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), ...injuries] })
  expect(getAvailableRosterPlayers(next, teamId, next.currentDate)).toHaveLength(keep)
  return next
}

describe('MX0.2 canonical injury application rules', () => {
  it('refuses any injury that would leave a club with fewer than five available Players', () => {
    const base = createNewGame()
    const teamId = Object.keys(base.teams)[0]! as TeamId
    const atFloor = clubWithAvailable(base, teamId, 5)
    const candidates = getAvailableRosterPlayers(atFloor, teamId, atFloor.currentDate).slice(0, 3).map((player, index) => injury(player.id, atFloor.currentDate, 90 + index))

    expect(selectRecordableInjuries(atFloor, candidates, () => teamId, atFloor.currentDate)).toEqual([])
    expect(canRecordInjuries(atFloor, candidates, () => teamId, atFloor.currentDate)).toBe(false)

    const above = clubWithAvailable(base, teamId, 8)
    const aboveCandidates = getAvailableRosterPlayers(above, teamId, above.currentDate).slice(0, 3).map((player, index) => injury(player.id, above.currentDate, 90 + index))
    expect(selectRecordableInjuries(above, aboveCandidates, () => teamId, above.currentDate)).toHaveLength(3)
  })

  it('applies the floor per club, independently', () => {
    const base = createNewGame()
    const teamIds = Object.keys(base.teams) as TeamId[]
    const first = clubWithAvailable(base, teamIds[0]!, 5)
    const second = clubWithAvailable(first, teamIds[1]!, 8)
    const firstPlayer = getAvailableRosterPlayers(second, teamIds[0]!, second.currentDate)[0]!
    const secondPlayer = getAvailableRosterPlayers(second, teamIds[1]!, second.currentDate)[0]!

    const applied = selectRecordableInjuries(
      second, [injury(firstPlayer.id, second.currentDate, 200), injury(secondPlayer.id, second.currentDate, 200)],
      (candidate) => (candidate.playerId === firstPlayer.id ? teamIds[0]! : teamIds[1]!), second.currentDate,
    )
    expect(applied.map((item) => item.playerId)).toEqual([secondPlayer.id])
  })

  it('never records an injury whose recovery window overlaps a recorded or same-batch injury', () => {
    const base = createNewGame()
    const teamId = Object.keys(base.teams)[0]! as TeamId
    const playerId = getAvailableRosterPlayers(base, teamId, base.currentDate)[0]!.id
    // A Game resolved ahead of the clock recorded a future injury; an earlier one must not overlap it.
    const future = injury(playerId, addDays(base.currentDate, 30), 0, 'mx02-recordable-future')
    const withFuture = updateGameWorld(base, { injuries: [future] })
    const earlier = injury(playerId, addDays(base.currentDate, 10), 0, 'mx02-recordable-earlier')

    expect(overlapsRecordedInjury(withFuture, earlier)).toBe(true)
    expect(selectRecordableInjuries(withFuture, [earlier], () => teamId, withFuture.currentDate)).toEqual([])
    // A different Player is never affected by the Rule.
    const otherPlayerId = getAvailableRosterPlayers(base, teamId, base.currentDate)[1]!.id
    expect(overlapsRecordedInjury(withFuture, injury(otherPlayerId, addDays(base.currentDate, 10), 0, 'mx02-recordable-other'))).toBe(false)

    // Two candidates for the same Player on the same day cannot both be recorded.
    const sameDay = [injury(playerId, base.currentDate, 0, 'mx02-recordable-a'), injury(playerId, base.currentDate, 1, 'mx02-recordable-b')]
    expect(selectRecordableInjuries(base, sameDay, () => teamId, base.currentDate)).toHaveLength(1)
  })
})
