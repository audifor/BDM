import { describe, expect, it } from 'vitest'
import { playerIdFromString } from '@/domain/ids'
import { isValidRotationMinutes } from './TacticalPlanning'

describe('isValidRotationMinutes (Issue #9 blocker 2 canonical validator)', () => {
  const p1 = playerIdFromString('player-1')
  const p2 = playerIdFromString('player-2')
  const p3 = playerIdFromString('player-3')
  const p4 = playerIdFromString('player-4')
  const p5 = playerIdFromString('player-5')
  const activeFive = [p1, p2, p3, p4, p5]

  it('is valid when every regulation period sums to exactly periodMinutes*5', () => {
    const minutes = { [p1]: [10, 10], [p2]: [10, 10], [p3]: [10, 10], [p4]: [10, 10], [p5]: [10, 10] }
    expect(isValidRotationMinutes(minutes, activeFive, [10, 10])).toBe(true)
  })

  it('is invalid when a period sums to less than periodMinutes*5', () => {
    const minutes = { [p1]: [8, 10], [p2]: [8, 10], [p3]: [8, 10], [p4]: [8, 10], [p5]: [8, 10] }
    expect(isValidRotationMinutes(minutes, activeFive, [10, 10])).toBe(false)
  })

  it('is invalid when a period sums to more than periodMinutes*5', () => {
    const minutes = { [p1]: [12, 10], [p2]: [10, 10], [p3]: [10, 10], [p4]: [10, 10], [p5]: [10, 10] }
    expect(isValidRotationMinutes(minutes, activeFive, [10, 10])).toBe(false)
  })

  it('ignores minutes recorded for a player not in activePlayerIds', () => {
    const stalePlayer = playerIdFromString('stale-player')
    const minutes = { [p1]: [10, 10], [p2]: [10, 10], [p3]: [10, 10], [p4]: [10, 10], [p5]: [10, 10], [stalePlayer]: [50, 50] }
    expect(isValidRotationMinutes(minutes, activeFive, [10, 10])).toBe(true)
  })

  it('an empty active roster is trivially valid', () => {
    expect(isValidRotationMinutes({}, [], [10, 10])).toBe(true)
  })

  it('columns beyond periodMinutesByColumn.length (an OT column) are exempt from the strict-total check', () => {
    const minutesZeroOt = { [p1]: [10, 10, 0], [p2]: [10, 10, 0], [p3]: [10, 10, 0], [p4]: [10, 10, 0], [p5]: [10, 10, 0] }
    expect(isValidRotationMinutes(minutesZeroOt, activeFive, [10, 10])).toBe(true)

    const minutesPartialOt = { [p1]: [10, 10, 3], [p2]: [10, 10, 0], [p3]: [10, 10, 0], [p4]: [10, 10, 0], [p5]: [10, 10, 0] }
    expect(isValidRotationMinutes(minutesPartialOt, activeFive, [10, 10])).toBe(true)
  })

  it('validates each supplied regulation period independently: valid P1 with invalid P2 is overall invalid', () => {
    const minutes = { [p1]: [10, 5], [p2]: [10, 5], [p3]: [10, 5], [p4]: [10, 5], [p5]: [10, 5] }
    expect(isValidRotationMinutes(minutes, activeFive, [10, 10])).toBe(false)
  })
})
