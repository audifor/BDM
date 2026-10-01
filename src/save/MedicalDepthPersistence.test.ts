import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

describe('BS12E Medical Save V1 evidence', () => {
  it('round-trips rehab plan history, setbacks, tests and keeps legacy active injuries in recovery', () => {
    const world = createNewGame()
    const team = Object.values(world.teams)[0]!
    const playerId = team.rosterPlayerIds[0]!
    const injury = createInjury({
      id: injuryIdFromString('bs12e-medical-save'), playerId, kind: 'hamstringStrain', severity: 'serious',
      injuredOn: addDays(world.currentDate, -20), expectedReturnDate: addDays(world.currentDate, 10),
      rehabilitation: {
        mode: 'ACCELERATED_REHAB', startedOn: addDays(world.currentDate, -20), changedOn: addDays(world.currentDate, -12),
        history: [{ changedOn: addDays(world.currentDate, -12), mode: 'ACCELERATED_REHAB', actor: { kind: 'AI', teamId: team.id } }],
      },
      rehabilitationSetbacks: [{ id: 'bs12e-medical-save:rehab-week:2', occurredOn: addDays(world.currentDate, -6), mode: 'ACCELERATED_REHAB', reason: 'REHAB_SETBACK', daysAdded: 3 }],
      fitnessTests: [{ id: 'bs12e-medical-save:fitness:2026-09-30', testedOn: addDays(world.currentDate, -1), result: 'BORDERLINE', actor: { kind: 'USER', coachId: world.userCoachId } }],
    })
    const saved = serializeGameWorldV1(updateGameWorld(world, { injuries: [injury] }), '2026-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)))
    expect(loaded.injuriesById[injury.id]).toMatchObject({
      rehabilitation: { mode: 'ACCELERATED_REHAB', history: [{ mode: 'ACCELERATED_REHAB' }] },
      rehabilitationSetbacks: [{ daysAdded: 3 }],
      fitnessTests: [{ result: 'BORDERLINE' }],
    })

    const legacy = JSON.parse(JSON.stringify(saved)) as { payload: { injuries: Record<string, unknown>[] } }
    const legacyInjury = legacy.payload.injuries.find((item) => item.id === injury.id)!
    delete legacyInjury.rehabilitation
    delete legacyInjury.rehabilitationSetbacks
    delete legacyInjury.fitnessTests
    const compatible = deserializeGameWorldV1(legacy)
    expect(compatible.injuriesById[injury.id]?.rehabilitation?.mode).toBe('STANDARD_REHAB')
    expect(compatible.injuriesById[injury.id]?.fitnessTests).toEqual([])
    expect(compatible.injuriesById[injury.id]?.returnToPlay?.clearedOn).toBeUndefined()
  })

  it('does not resurrect a historically cleared injury when BS12E fields are absent', () => {
    const world = createNewGame()
    const team = Object.values(world.teams)[0]!
    const injury = createInjury({
      id: injuryIdFromString('bs12e-medical-cleared-save'), playerId: team.rosterPlayerIds[0]!, kind: 'ankleSprain', severity: 'minor',
      injuredOn: addDays(world.currentDate, -20), expectedReturnDate: addDays(world.currentDate, -15),
      returnToPlay: { reviewDueOn: addDays(world.currentDate, -15), clearedOn: addDays(world.currentDate, -14), reviews: [] },
    })
    const saved = serializeGameWorldV1(updateGameWorld(world, { injuries: [injury] }), '2026-10-01T00:00:00.000Z')
    const legacy = JSON.parse(JSON.stringify(saved)) as { payload: { injuries: Record<string, unknown>[] } }
    const legacyInjury = legacy.payload.injuries.find((item) => item.id === injury.id)!
    delete legacyInjury.rehabilitation
    delete legacyInjury.rehabilitationSetbacks
    delete legacyInjury.fitnessTests
    const loaded = deserializeGameWorldV1(legacy)
    expect(loaded.injuriesById[injury.id]?.returnToPlay?.clearedOn).toBe(addDays(world.currentDate, -14))
  })
})
