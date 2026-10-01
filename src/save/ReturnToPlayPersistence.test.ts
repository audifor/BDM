import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createInjury, injuryLifecycleStatus } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { isPlayerAvailable, updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { deserializeGameWorldV1, serializeGameWorldV1, type SaveGameEnvelopeV1 } from './GameWorldSaveV1'

describe('Return-to-Play Save V1 compatibility', () => {
  it('round-trips review state and clearance evidence', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const injury = createInjury({
      id: injuryIdFromString('rtp-save-roundtrip'), playerId, kind: 'ankleSprain', severity: 'minor',
      injuredOn: addDays(world.currentDate, -10), expectedReturnDate: addDays(world.currentDate, -1),
      returnToPlay: {
        reviewDueOn: addDays(world.currentDate, -1), clearedOn: world.currentDate,
        reviews: [{ reviewedOn: world.currentDate, decision: 'CLEAR_FOR_PLAY', actor: { kind: 'USER', coachId: world.userCoachId } }],
      },
    })
    const input = updateGameWorld(world, { injuries: [injury] })
    const save = serializeGameWorldV1(input, '2032-10-01T00:00:00.000Z')
    const restored = deserializeGameWorldV1(JSON.parse(JSON.stringify(save)) as unknown)

    expect(restored.injuriesById[injury.id]?.returnToPlay).toEqual(injury.returnToPlay)
    expect(isPlayerAvailable(restored, playerId)).toBe(true)
  })

  it('migrates legacy active injuries to review due while preserving historical clear dates', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const activeId = injuryIdFromString('legacy-rtp-active')
    const historicalId = injuryIdFromString('legacy-rtp-historical')
    const active = createInjury({ id: activeId, playerId: team.rosterPlayerIds[0]!, kind: 'backStrain', severity: 'moderate', injuredOn: addDays(world.currentDate, -4), expectedReturnDate: addDays(world.currentDate, 3) })
    const historical = createInjury({ id: historicalId, playerId: team.rosterPlayerIds[1]!, kind: 'handInjury', severity: 'minor', injuredOn: addDays(world.currentDate, -10), expectedReturnDate: addDays(world.currentDate, -2) })
    const save = serializeGameWorldV1(updateGameWorld(world, { injuries: [active, historical] }), '2032-10-01T00:00:00.000Z')
    const legacyPayload = {
      ...save.payload,
      injuries: save.payload.injuries.map(({ returnToPlay: _ignored, ...injury }) => injury),
    }
    const restored = deserializeGameWorldV1({ ...save, payload: legacyPayload } as SaveGameEnvelopeV1)

    expect(restored.injuriesById[activeId]?.returnToPlay?.reviewDueOn).toBe(active.expectedReturnDate)
    expect(injuryLifecycleStatus(restored.injuriesById[activeId]!, world.currentDate)).toBe('RECOVERING')
    expect(restored.injuriesById[historicalId]?.returnToPlay?.clearedOn).toBe(historical.expectedReturnDate)
    expect(isPlayerAvailable(restored, historical.playerId)).toBe(true)
  })
})
