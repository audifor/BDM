import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays, type GameDate } from '@/domain/date'
import { injuryIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import type { PlayerId } from '@/domain/ids'
import { isPlayerAvailable, updateGameWorld } from '@/domain/world'

import {
  buildMedicalRiskModel,
  buildPlayerMedicalModel,
  calendarDaysBetween,
  fatigueLoadPresentation,
  findMedicalInspectorDetail,
  formatDurationLabel,
  medicalRiskOverviewTone,
  resolvePlayerMedicalRiskPresentation,
} from './buildPlayerMedicalModel'
import { buildPlayerWorkspaceModel, defaultPlayerIdForNg } from './buildPlayerWorkspaceModel'

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
    id: injuryIdFromString(input.id ?? 'injury-test'),
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

describe('buildPlayerMedicalModel', () => {
  it('builds a healthy available player model from real game data', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerMedicalModel(world, playerId)

    expect(isPlayerAvailable(world, playerId)).toBe(true)
    expect(model.availabilityBand.statusLabel).toBe('Available')
    expect(model.availabilityBand.statusTone).toBe('available')
    expect(model.activeInjury).toBeNull()
    expect(model.recoveryTimeline).toEqual([])
    expect(model.historyEmptyMessage).toBe('No recorded injuries')
    expect(model.fatigue.value).toBeGreaterThanOrEqual(0)
    expect(model.fatigue.value).toBeLessThanOrEqual(100)
    expect(model.risk?.displayLabel).toBe('Low · 0')
    expect(model.riskUnavailableLabel).toBeNull()
  })

  it('builds an active injury model when the player is unavailable', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const injuredWorld = withInjury(world, playerId)
    const model = buildPlayerMedicalModel(injuredWorld, playerId)

    expect(isPlayerAvailable(injuredWorld, playerId)).toBe(false)
    expect(model.availabilityBand.statusLabel).toBe('Injured')
    expect(model.activeInjury?.kindLabel).toBe('Ankle sprain')
    expect(model.recoveryTimeline).toHaveLength(3)
    expect(model.history[0]?.statusLabel).toBe('Active')
    expect(model.defaultSelectedEventId).toBe(model.activeInjury?.id ?? null)
    expect(model.risk?.riskScore).toBeGreaterThan(0)
    expect(model.risk?.riskBand).not.toBe('low')
  })

  it('connects engine injury-risk assessments for high career fatigue', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const fatigued = updateGameWorld(world, {
      careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, [playerId]: 72 },
    })
    const model = buildPlayerMedicalModel(fatigued, playerId)

    expect(model.fatigue.value).toBe(72)
    expect(model.fatigue.loadLabel).toBe('High load')
    expect(model.fatigue.dailyRecoveryRate).toBe(3)
    expect(model.risk?.riskBand).toBe('elevated')
    expect(model.risk?.riskScore).toBe(30)
    expect(model.risk?.reasons).toContain('High fatigue')
  })

  it('maps engine risk bands and overview tones from canonical score thresholds', () => {
    expect(buildMedicalRiskModel({ riskBand: 'low', riskScore: 0, reasons: [] }).displayLabel).toBe('Low · 0')
    expect(buildMedicalRiskModel({ riskBand: 'elevated', riskScore: 45, reasons: ['Active moderate injury'] }).displayLabel).toBe(
      'Elevated · 45',
    )
    expect(medicalRiskOverviewTone('low')).toBe('positive')
    expect(medicalRiskOverviewTone('elevated')).toBe('warning')
    expect(medicalRiskOverviewTone('high')).toBe('warning')
  })

  it('keeps Overview and Medical risk presentation aligned', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const injuredWorld = withInjury(world, playerId, { severity: 'serious' })
    const workspace = buildPlayerWorkspaceModel(injuredWorld, playerId)!
    const medical = buildPlayerMedicalModel(injuredWorld, playerId)
    const direct = resolvePlayerMedicalRiskPresentation(injuredWorld, playerId)

    expect(workspace.status.risk.status).toBe('available')
    expect(workspace.status.risk.value).toBe(medical.risk?.displayLabel)
    expect(direct.displayLabel).toBe(medical.risk?.displayLabel)
    expect(workspace.status.riskTone).toBe(medicalRiskOverviewTone(medical.risk!.riskBand))
  })

  it('returns unavailable risk presentation without a roster team context', () => {
    const presentation = resolvePlayerMedicalRiskPresentation(createNewGame(), 'missing-player' as PlayerId)
    expect(presentation.status).toBe('unavailable')
    expect(presentation.unavailableLabel).toBe('Requires roster team')
  })

  it('orders medical history by most recent injury date', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const older = createInjury({
      id: injuryIdFromString('injury-old'),
      playerId,
      kind: 'backStrain',
      severity: 'minor',
      injuredOn: addDays(world.currentDate, -40),
      expectedReturnDate: addDays(world.currentDate, -30),
    })
    const newer = createInjury({
      id: injuryIdFromString('injury-new'),
      playerId,
      kind: 'kneeSprain',
      severity: 'moderate',
      injuredOn: addDays(world.currentDate, -5),
      expectedReturnDate: addDays(world.currentDate, 10),
    })
    const withHistory = updateGameWorld(world, {
      injuries: [...Object.values(world.injuriesById), older, newer],
    })
    const model = buildPlayerMedicalModel(withHistory, playerId)

    expect(model.history.map((entry) => entry.injuryLabel)).toEqual(['Knee sprain', 'Back strain'])
    expect(model.history[0]?.statusLabel).toBe('Active')
    expect(model.history[1]?.statusLabel).toBe('Recovered')
  })

  it('derives duration labels from real injury dates', () => {
    const start = '2026-09-01' as GameDate
    const end = '2026-09-15' as GameDate

    expect(calendarDaysBetween(start, end)).toBe(14)
    expect(formatDurationLabel(14)).toBe('14 days')
    expect(formatDurationLabel(1)).toBe('1 day')
  })

  it('uses presentation-only fatigue load bands', () => {
    expect(fatigueLoadPresentation(10).loadLabel).toBe('Low load')
    expect(fatigueLoadPresentation(25).loadLabel).toBe('Moderate load')
    expect(fatigueLoadPresentation(45).loadLabel).toBe('Elevated load')
    expect(fatigueLoadPresentation(80).loadLabel).toBe('High load')
  })

  it('transforms inspector detail for a selected history row', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const injuredWorld = withInjury(world, playerId)
    const model = buildPlayerMedicalModel(injuredWorld, playerId)
    const detail = findMedicalInspectorDetail(model, model.activeInjury?.id ?? null)

    expect(detail?.injuryLabel).toBe('Ankle sprain')
    expect(detail?.availabilityImpact).toBe('Unavailable for match selection')
    expect(findMedicalInspectorDetail(model, null)).toBeUndefined()
  })

  it('marks recovered injuries without active availability restriction', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const recovered = createInjury({
      id: injuryIdFromString('injury-recovered'),
      playerId,
      kind: 'handInjury',
      severity: 'minor',
      injuredOn: addDays(world.currentDate, -20),
      expectedReturnDate: addDays(world.currentDate, -5),
    })
    const withHistory = updateGameWorld(world, {
      injuries: [...Object.values(world.injuriesById), recovered],
    })
    const model = buildPlayerMedicalModel(withHistory, playerId)
    const detail = findMedicalInspectorDetail(model, recovered.id)

    expect(model.activeInjury).toBeNull()
    expect(detail?.statusLabel).toBe('Recovered')
    expect(detail?.availabilityImpact).toBe('No current availability restriction')
  })
})
