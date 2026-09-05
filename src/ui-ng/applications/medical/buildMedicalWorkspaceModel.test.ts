import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { injuryIdFromString, type PlayerId } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { getUserTeam } from '@/engine/calendar'
import { isPlayerAvailable, updateGameWorld } from '@/domain/world'
import { getTeamStaffPresentation } from '@/ui/staffPresentation'

import { buildMedicalWorkspaceModel } from './buildMedicalWorkspaceModel'

function withInjury(
  world: ReturnType<typeof createNewGame>,
  playerId: PlayerId,
  input: {
    readonly id?: string
    readonly injuredOn?: string
    readonly expectedReturnDate?: string
    readonly kind?: 'ankleSprain' | 'hamstringStrain'
    readonly severity?: 'minor' | 'moderate' | 'serious'
  } = {},
) {
  const injury = createInjury({
    id: injuryIdFromString(input.id ?? 'injury-medical-workspace'),
    playerId,
    kind: input.kind ?? 'ankleSprain',
    severity: input.severity ?? 'moderate',
    injuredOn: (input.injuredOn ?? world.currentDate) as never,
    expectedReturnDate: (input.expectedReturnDate ?? addDays(world.currentDate, 14)) as never,
  })

  return updateGameWorld(world, {
    injuries: [...Object.values(world.injuriesById), injury],
  })
}

describe('buildMedicalWorkspaceModel', () => {
  it('projects a healthy roster from canonical availability, risk and medical staff', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const model = buildMedicalWorkspaceModel(world)!
    const medicalStaff = getTeamStaffPresentation(world, team.id).filter((item) => item.department === 'medical')

    expect(model.teamName).toBe(team.name)
    expect(model.rosterCount).toBe(team.rosterPlayerIds.length)
    expect(model.availableCount).toBe(team.rosterPlayerIds.length)
    expect(model.injuredCount).toBe(0)
    expect(model.injured).toEqual([])
    expect(model.history).toEqual([])
    expect(model.risk).toHaveLength(team.rosterPlayerIds.length)
    expect(model.medicalStaffCount).toBe(medicalStaff.length)
    expect(model.medicalStaffCount).toBeGreaterThan(0)
    expect(model.staff.every((row) => row.presentation.department === 'medical')).toBe(true)
    expect(model.averageFatigue).toBeGreaterThanOrEqual(0)
    expect(model.averageFatigue).toBeLessThanOrEqual(100)
  })

  it('lists an active injury without inventing facilities or treatment plans', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const injuredWorld = withInjury(world, playerId)
    const model = buildMedicalWorkspaceModel(injuredWorld)!
    const player = injuredWorld.players[playerId]!

    expect(isPlayerAvailable(injuredWorld, playerId)).toBe(false)
    expect(model.injuredCount).toBe(1)
    expect(model.availableCount).toBe(team.rosterPlayerIds.length - 1)
    expect(model.injured[0]?.playerName).toBe(`${player.firstName} ${player.lastName}`)
    expect(model.injured[0]?.injuryLabel).toBe('Ankle sprain')
    expect(model.injured[0]?.severityLabel).toBe('Moderate')
    expect(model.injured[0]?.sourceLabel).toBe('—')
    expect(model.history).toHaveLength(1)
    expect(model.history[0]?.statusLabel).toBe('Active')
    expect(model.risk.find((row) => row.playerId === playerId)?.available).toBe(false)
    expect(model.risk.find((row) => row.playerId === playerId)?.riskScore).toBeGreaterThan(0)
  })

  it('keeps recovered injuries in history only', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const recoveredWorld = withInjury(world, playerId, {
      injuredOn: addDays(world.currentDate, -21),
      expectedReturnDate: addDays(world.currentDate, -7),
    })
    const model = buildMedicalWorkspaceModel(recoveredWorld)!

    expect(model.injured).toEqual([])
    expect(model.injuredCount).toBe(0)
    expect(model.history).toHaveLength(1)
    expect(model.history[0]?.statusLabel).toBe('Recovered')
    expect(isPlayerAvailable(recoveredWorld, playerId)).toBe(true)
  })
})
