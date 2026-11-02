import { describe, expect, it } from 'vitest'
import type { RolePromise } from '@/domain/market'
import type { RolePromiseUsageWindow } from './RolePromiseUsage'
import { evaluateRolePromiseUsage, ROLE_PROMISE_EVALUATION_CALIBRATION } from './RolePromiseEvaluation'

const promise = (role: RolePromise['role']): RolePromise => ({ id: `role-promise:${role}`, playerId: 'player:test' as never,
  teamOrganizationId: 'organization:test' as never, role, acceptedOn: '2032-01-01' as never, status: 'ACTIVE' })

function window(input: Partial<RolePromiseUsageWindow> = {}): RolePromiseUsageWindow {
  const measuredGames = input.measuredGames ?? 12
  const evidence: RolePromiseUsageWindow['evidence'] = input.evidence ?? Array.from({ length: measuredGames }, (_, index) => ({
    gameId: `game:${index}`, competitionId: 'competition:test' as never, seasonId: 'season:test' as never,
    gameDate: '2032-01-01' as never, status: 'MEASURED' as const, started: true, appeared: true,
    playerSeconds: 900, actualGameSeconds: 2400, regulationSeconds: 2400, teamMinuteRank: 1,
  }))
  return { competitionId: 'competition:test' as never, seasonId: 'season:test' as never, evidence, measuredGames,
    availableGames: input.availableGames ?? measuredGames, starts: input.starts ?? measuredGames,
    appearances: input.appearances ?? measuredGames, topThreeMinuteGames: input.topThreeMinuteGames ?? measuredGames,
    playerSeconds: input.playerSeconds ?? measuredGames * 900, regulationSeconds: input.regulationSeconds ?? measuredGames * 2400,
    playingTimeShare: input.playingTimeShare ?? 0.375, topThreeMinuteRate: input.topThreeMinuteRate ?? 1 }
}

describe('professional role promise evaluation', () => {
  it('keeps every provisional balance value centralized and explicitly non-canonical', () => {
    expect(ROLE_PROMISE_EVALUATION_CALIBRATION).toMatchObject({ version: 'PROVISIONAL_V1', minimumMeasuredGames: 10 })
  })

  it('recognizes a star through relative minutes, regular availability-adjusted participation, and regulation share', () => {
    const assessment = evaluateRolePromiseUsage(promise('STAR'), window({ topThreeMinuteRate: 0.75 }))
    expect(assessment.status).toBe('REASONABLE')
    expect(assessment.topThreeMinuteRate).toBe(0.75)
  })

  it('accepts a high-minute sixth player as a STAR or ROTATION without requiring starts', () => {
    const sixthMan = window({ starts: 0, appearances: 12, topThreeMinuteGames: 9, topThreeMinuteRate: 0.75, playingTimeShare: 0.32 })
    expect(evaluateRolePromiseUsage(promise('STAR'), sixthMan).status).toBe('REASONABLE')
    expect(evaluateRolePromiseUsage(promise('ROTATION'), sixthMan).status).toBe('REASONABLE')
  })

  it('recognizes a starter losing the starting place across a multi-game window', () => {
    const lostPlace = window({ starts: 2, playerSeconds: 5000, playingTimeShare: 5000 / (12 * 2400) })
    expect(evaluateRolePromiseUsage(promise('STARTER'), lostPlace).status).toBe('SUSTAINED_BREACH')
  })

  it('recognizes a rotation player who stops appearing by coach decision', () => {
    const noUse = window({ starts: 0, appearances: 0, topThreeMinuteGames: 0, playerSeconds: 0, playingTimeShare: 0, topThreeMinuteRate: 0 })
    expect(evaluateRolePromiseUsage(promise('ROTATION'), noUse).status).toBe('SUSTAINED_BREACH')
  })

  it('does not penalize injuries, incomplete records, or short league samples as if they were DNPs', () => {
    const injuredAndAvailable = window({ measuredGames: 10, availableGames: 10,
      evidence: [...window({ measuredGames: 10 }).evidence, { gameId: 'game:injured', competitionId: 'competition:test' as never,
        seasonId: 'season:test' as never, gameDate: '2032-01-01' as never, status: 'EXCLUDED_INJURY' }] })
    expect(evaluateRolePromiseUsage(promise('STARTER'), injuredAndAvailable).status).toBe('REASONABLE')
    const incomplete = window({ availableGames: 15, evidence: [...window().evidence,
      ...Array.from({ length: 5 }, (_, index) => ({ gameId: `missing:${index}`, competitionId: 'competition:test' as never,
        seasonId: 'season:test' as never, gameDate: '2032-01-01' as never, status: 'MISSING_MATCH_LOG' as const }))] })
    expect(evaluateRolePromiseUsage(promise('STAR'), incomplete).status).toBe('INSUFFICIENT_EVIDENCE')
    expect(evaluateRolePromiseUsage(promise('STAR'), window({ measuredGames: 6 })).status).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('does not create a regular-minute obligation for DEPTH', () => {
    expect(evaluateRolePromiseUsage(promise('DEPTH'), window({ starts: 0, appearances: 0, playerSeconds: 0, playingTimeShare: 0,
      topThreeMinuteGames: 0, topThreeMinuteRate: 0 })).status).toBe('REASONABLE')
  })
})
