import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { InjuryId } from '@/domain/ids'
import { getUserTeam } from '@/engine/calendar'
import { assessRetentionEligibility } from '@/engine/contractRetention/ContractRetentionEngine'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { saveCurrentGame } from '@/app/save/GameSaveService'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { createF3Day0, f3AdvanceDay, f3Store, f3World } from './testSupport/PlayableF3Support'

/**
 * Not part of the regular suite: generates the Save V4 that step 18 of the Windows acceptance loads. The pilot squad's contracts end on
 * 1 July 2028, so their 365-day renewal window opens on 2 July 2027; this run plays every day between 27 Sep 2026 and 2 Jul 2027
 * through the production day boundary (matches included, due Return-to-Play reviews cleared as the coach would), without any market
 * operation, so the career that reaches the window is a real one. Enabled only with F3_RENEWAL_FIXTURE_OUT=<file>.
 */
const out = process.env.F3_RENEWAL_FIXTURE_OUT
describe.skipIf(out === undefined)('F3 renewal fixture (Windows acceptance input)', () => {
  it('plays 27 Sep 2026 → 2 Jul 2027 and writes the Save V4', async () => {
    f3Store().replaceWorld(await createF3Day0())
    let days = 0
    let seasonsStarted = 0
    while (f3World().currentDate < '2027-07-02' && days < 400) {
      for (const candidate of evaluateSimulationBreakpoints(f3World()).candidates.filter((item) => item.reason === 'returnToPlayReview')) {
        const injuryId = candidate.sourceId as InjuryId
        let result = f3Store().reviewReturnToPlay(injuryId, 'CLEAR_FOR_PLAY')
        if (!result.ok && result.reason === 'FITNESS_TEST_REQUIRED') {
          const test = f3Store().conductFitnessTest(injuryId)
          result = f3Store().reviewReturnToPlay(injuryId, test.ok && test.record.result === 'PASS' ? 'CLEAR_FOR_PLAY' : 'CONTINUE_RECOVERY')
        }
      }
      try { f3AdvanceDay() } catch (error) {
        // The season checkpoint (all fixtures played): the coach starts the next season, as the Home screen offers.
        if (!(error instanceof Error) || !/is complete; Continue pauses at the season checkpoint/.test(error.message)) throw error
        f3Store().startNextSeason()
        seasonsStarted += 1
        continue
      }
      days += 1
    }
    const world = f3World()
    expect(seasonsStarted).toBeLessThanOrEqual(1)
    expect(world.currentDate).toBe('2027-07-02')
    const team = getUserTeam(world)!
    const earliest = Object.values(world.contractsById).filter((contract) => contract.teamId === team.id && contract.termination === undefined).sort((a, b) => a.term.expiresOn.localeCompare(b.term.expiresOn))[0]!
    expect(assessRetentionEligibility(world, team.id, earliest.id).eligible).toBe(true)
    const repository: GameSaveRepository & { file: string } = { file: '', save: async (json: string) => { repository.file = json }, load: async () => repository.file, getInfo: async () => ({ savedAt: '2027-07-02T09:00:00.000Z' }) }
    await saveCurrentGame(world, repository, '2027-07-02T09:00:00.000Z')
    writeFileSync(out!, repository.file)
  }, 7_200_000)
})
