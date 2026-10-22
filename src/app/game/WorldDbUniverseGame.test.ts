import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseWorldCompetitionRuntimeBundle } from '@/domain/competition'
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS } from '@/domain/player/PlayerTruthCatalog'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { assertWorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { assertWorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import { assertWorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'
import { assertWorldDbSelectionCatalogV1 } from '@/domain/worldDb/SelectionCatalog'
import { assertWorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import { createWorldDbUniverseGame, listWorldDbUniverseCompetitions } from './WorldDbUniverseGame'
import { advanceGameDayWithResult } from './advanceGameDay'
import { getContractFinancialSchedule } from '@/domain/finance/ContractFinancialSchedule'

/**
 * Real-data suite. The Rust loader (`probe_universe_bootstrap_from_env`) reads a generated universe
 * SQLite and writes exactly the JSON the Tauri commands return; this suite replays those payloads
 * through the unchanged TypeScript session. Set BDM_UNIVERSE_EXPORT_DIR and BDM_UNIVERSE_BUNDLE.
 */
const exportDir = process.env.BDM_UNIVERSE_EXPORT_DIR
const bundlePath = process.env.BDM_UNIVERSE_BUNDLE
const available = exportDir !== undefined && bundlePath !== undefined && existsSync(join(exportDir, 'catalog.json'))

const read = (name: string): unknown => JSON.parse(readFileSync(join(exportDir!, name), 'utf8'))
const key = (id: string): string => id.replaceAll(':', '_')

function exportedRepository(): WorldDatabaseRepository {
  return {
    async inspectDatabase() { const value = read('info.json'); assertWorldDbDatabaseInfoV1(value); return value },
    async loadSelectionCatalog() { const value = read('catalog.json'); assertWorldDbSelectionCatalogV1(value); return value },
    async loadCompetitionSeason(_db, season) { const value = read(`bundle__${key(season)}.json`); assertWorldDbCompetitionBundleV1(value); return value },
    async loadMatchRealizations(_db, season) { const value = read(`matches__${key(season)}.json`); assertWorldDbMatchRealizationBundleV1(value); return value },
    async loadGameBootstrapSlice(_db, season, ecosystem) { const value = read(`${key(ecosystem)}__${key(season)}.json`); assertWorldDbGameBootstrapSliceV1(value); return value },
    async loadCompetitionRuntimeBundle(path) { return parseWorldCompetitionRuntimeBundle(JSON.parse(readFileSync(path, 'utf8'))) },
  }
}

const access = () => ({ repository: exportedRepository(), databasePath: 'universe.db', runtimeBundlePath: bundlePath! })

describe.skipIf(!available)('BDM from a generated multi-competition universe (real SQLite payloads)', () => {
  it('lists every competition the universe can play, men and women, with their clubs', async () => {
    const options = await listWorldDbUniverseCompetitions(access())
    const ids = options.map((option) => option.competitionSeasonId)
    expect(ids).toContain('edition:ESP:liga-endesa:2026-27')
    expect(ids).toContain('edition:ESP:lf-endesa:2026-27')
    expect(ids).toContain('edition:ESP:primera-feb:2026-27')
  })

  it('creates an independent ACB game with the loaded people, contracts, finances and facilities', async () => {
    const { world, report } = await createWorldDbUniverseGame({ ...access(), competitionSeasonId: 'edition:ESP:liga-endesa:2026-27', teamId: 'team:ESP:male:barca' })
    expect(report.counts.teams).toBe(18)
    expect(report.counts.players).toBe(257)
    expect(world.currentDate).toBe('2026-07-01')
    for (const player of Object.values(world.players)) {
      expect(Object.keys(player.basketball.ratings).sort()).toEqual([...PLAYER_TRUTH_RATING_KEYS].sort())
      expect(Object.keys(player.basketball.tendencies).sort()).toEqual([...PLAYER_TRUTH_TENDENCY_KEYS].sort())
      const birth = String(player.bio.dateOfBirth)
      const age = 2026 - Number(birth.slice(0, 4)) - Number('07-01' < birth.slice(5))
      expect(player.development.developmentStage).toBe(age < 21 ? 'early' : age < 25 ? 'developing' : age < 31 ? 'prime' : 'declining')
    }
    // every loaded player and staff member holds exactly the contract of the universe
    expect(report.counts.playerContracts).toBe(257)
    expect(report.counts.staffContracts).toBe(report.counts.staff)
    expect(Object.values(world.contractsById).every((contract) => contract.compensation.annualSalary >= 1)).toBe(true)
    // opening cash comes from the universe ledger, one posting per club, never a guess
    expect(report.openingEconomicState).toEqual({ ALREADY_MATERIALIZED: 18 })
    expect(report.counts.facilities).toBeGreaterThan(18)
    expect(report.counts.games).toBe(306)
    for (const contract of world.worldDbUniverseSource!.contracts ?? []) {
      const obligations = getContractFinancialSchedule(world, { contractId: contract.contractId, includeConditional: true })
      const exact = contract.terms.filter(term => term.termType.includes('BASE')).reduce((sum, term) => sum + term.amountCents, 0)
      expect(obligations.reduce((sum, item) => sum + item.amount.minorUnits, 0)).toBe(exact)
    }
    // what BDM cannot run yet is reported, not dropped
    expect(report.availableNotConsumed.unmappedStaffAssignments.map((row) => row.roleCode).sort()).toEqual(['SPORT_PSYCHOLOGIST', 'TEAM_DELEGATE'])
    expect(report.availableNotConsumed.executives).toBeGreaterThan(0)
    expect(report.availableNotConsumed.agents).toBeGreaterThan(0)
    expect(report.availableNotConsumed.officials).toBeGreaterThan(0)
  })

  it('creates a women\'s competition game and a second-division men\'s game from the same universe', async () => {
    const women = await createWorldDbUniverseGame({ ...access(), competitionSeasonId: 'edition:ESP:lf-endesa:2026-27', teamId: 'team:ESP:female:baxi-ferrol' })
    expect(women.report.counts.teams).toBe(16)
    expect(Object.values(women.world.players).every((player) => player.gender === 'female')).toBe(true)
    const options = await listWorldDbUniverseCompetitions(access())
    const division = options.find((o) => o.competitionSeasonId === 'edition:ESP:primera-feb:2026-27')!
    const second = await createWorldDbUniverseGame({ ...access(), competitionSeasonId: division.competitionSeasonId, teamId: division.teams[0]!.teamId })
    expect(second.report.counts.teams).toBe(17)
  })

  it('rejects a club that the universe did not generate and never invents one', async () => {
    await expect(createWorldDbUniverseGame({ ...access(), competitionSeasonId: 'edition:ESP:liga-endesa:2026-27', teamId: 'team:ESP:male:not-a-club' })).rejects.toThrow()
  })

  it('saves and reopens the game without losing any imported fact, and two games never share state', async () => {
    const first = await createWorldDbUniverseGame({ ...access(), competitionSeasonId: 'edition:ESP:liga-endesa:2026-27', teamId: 'team:ESP:male:barca' })
    const second = await createWorldDbUniverseGame({ ...access(), competitionSeasonId: 'edition:ESP:liga-endesa:2026-27', teamId: 'team:ESP:male:barca' })
    expect(JSON.stringify(serializeGameWorldV4(first.world, '2026-10-22T00:00:00Z'))).toBe(JSON.stringify(serializeGameWorldV4(second.world, '2026-10-22T00:00:00Z')))
    const reopened = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(first.world, '2026-10-22T00:00:00Z'))))
    expect(Object.keys(reopened.players).length).toBe(Object.keys(first.world.players).length)
    expect(Object.keys(reopened.contractsById).length).toBe(Object.keys(first.world.contractsById).length)
    expect(Object.keys(reopened.staffContractsById).length).toBe(Object.keys(first.world.staffContractsById).length)
    expect(Object.keys(reopened.financialTransactionsById).length).toBe(Object.keys(first.world.financialTransactionsById).length)
    expect(Object.keys(reopened.facilitiesById).length).toBe(Object.keys(first.world.facilitiesById).length)
    expect(reopened.currentDate).toBe(first.world.currentDate)
    if (process.env.BDM_UNIVERSE_GAME_EXPORT) {
      writeFileSync(process.env.BDM_UNIVERSE_GAME_EXPORT, JSON.stringify(serializeGameWorldV4(first.world, '2026-10-22T00:00:00Z')), { flag: 'wx' })
      const disk = deserializeGameWorldV4(JSON.parse(readFileSync(process.env.BDM_UNIVERSE_GAME_EXPORT, 'utf8')))
      expect(disk.players).toEqual(first.world.players)
      expect(disk.worldDbUniverseSource).toEqual(first.world.worldDbUniverseSource)
    }
    expect(reopened.worldDbUniverseSource).toEqual(first.world.worldDbUniverseSource)
    expect(reopened.players).toEqual(first.world.players)
    expect(reopened.contractsById).toEqual(first.world.contractsById)
  })

  it('advances the imported game through the existing daily boundary without changing another game', async () => {
    const first = await createWorldDbUniverseGame({ ...access(), competitionSeasonId: 'edition:ESP:liga-endesa:2026-27', teamId: 'team:ESP:male:barca' })
    const second = await createWorldDbUniverseGame({ ...access(), competitionSeasonId: 'edition:ESP:liga-endesa:2026-27', teamId: 'team:ESP:male:barca' })
    const result = advanceGameDayWithResult(first.world)
    expect(result.failure).toBeUndefined()
    expect(result.world.currentDate).toBe('2026-07-02')
    expect(second.world.currentDate).toBe('2026-07-01')
    expect(result.world.worldDbUniverseSource).toEqual(first.world.worldDbUniverseSource)
  }, 60_000)
})
