import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseDb04PbmCompetitionDetailV1, parseDb04PbmCountriesResponseV1 } from '@/domain/worldDb/Db04PbmCatalogContract'
import { addDays } from '@/domain/date'
import { competitionIdFromString } from '@/domain/ids'
import { advanceGameDayWithResult } from './advanceGameDay'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createWorldDbPbmUniverseV1 } from './WorldDbPbmUniverse'

const database = 'C:/BDM_DB/WORLDDB_PBM/DB-07/worlddb_db07_world_formats.db'
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

function readCatalog(...args: string[]): unknown {
  const result = spawnSync('cargo', [
    'run', '--quiet', '--manifest-path', 'src-tauri/Cargo.toml', '--bin', 'worlddb-pbm-catalog', '--',
    ...args, '--database', database,
  ], { cwd: repoRoot, encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr.trim() || `DB-06 CLI exited with ${String(result.status)}`)
  return JSON.parse(result.stdout)
}

describe('WorldDB PBM V1 real universe flow', () => {
  it('builds an independent ACB GameWorld from DB-07, varies by seed, replays deterministically, and advances the calendar', () => {
    const sourceHashBefore = createHash('sha256').update(readFileSync(database)).digest('hex')
    const countries = parseDb04PbmCountriesResponseV1(readCatalog('countries'))
    const detail = parseDb04PbmCompetitionDetailV1(readCatalog('competition', '--id', 'competition:ESP:liga-endesa'))
    const options = { detail, countries: countries.countries, editionId: 'edition:ESP:liga-endesa:2025-26', startDate: '2026-10-25', seed: 20261025 }
    const first = createWorldDbPbmUniverseV1(options)
    const replay = createWorldDbPbmUniverseV1(options)
    const second = createWorldDbPbmUniverseV1({ ...options, seed: 20261026 })

    const realIdentity = (value: typeof first) => Object.values(value.world.teams).map(({ id, name }) => [id, name]).sort(([left], [right]) => String(left).localeCompare(String(right)))
    expect(realIdentity(first)).toEqual(detail.editions[0]!.participants.map((participant) => [participant.canonicalTeamId, participant.officialTeamName]).sort(([left], [right]) => left.localeCompare(right)))
    expect(realIdentity(second)).toEqual(realIdentity(first))
    expect(first.world.competitions[competitionIdFromString('competition:ESP:liga-endesa')]).toMatchObject({ name: 'Liga Endesa', participantTeamIds: expect.arrayContaining(detail.editions[0]!.participants.map((participant) => participant.canonicalTeamId)) })
    expect(Object.keys(first.world.games).length).toBeGreaterThan(0)
    expect(first.world.currentDate).toBe(options.startDate)
    expect(first.world.seasons[first.world.currentSeasonId]!.startDate).toBe(options.startDate)
    expect(first.generatedCounts.players).toBeGreaterThan(150)
    expect(first.generatedCounts.staff).toBeGreaterThan(18)
    expect(first.world.players).toEqual(replay.world.players)
    expect(first.world.players).not.toEqual(second.world.players)
    const firstEnvelope = serializeGameWorldV4(first.world, '2026-10-25T00:00:00.000Z')
    expect(serializeGameWorldV4(replay.world, '2026-10-25T00:00:00.000Z')).toEqual(firstEnvelope)

    for (const universe of [first, second]) {
      const advanced = advanceGameDayWithResult(universe.world, () => universe.selection.teamId.length)
      expect(advanced.status).toBe('COMPLETED')
      expect(advanced.failure).toBeUndefined()
      expect(advanced.world.currentDate).toBe(addDays(universe.world.currentDate, 1))
    }

    const output = resolve(repoRoot, 'outputs', 'worlddb-universe-v1')
    mkdirSync(output, { recursive: true })
    const envelope = firstEnvelope
    const restored = deserializeGameWorldV4(envelope)
    expect(Object.keys(restored.teams).sort()).toEqual(Object.keys(first.world.teams).sort())
    expect(restored.currentDate).toBe(options.startDate)
    expect(Object.keys(restored.games)).toEqual(Object.keys(first.world.games))
    writeFileSync(resolve(output, 'liga-endesa-2026-10-25-seed-20261025.save.json'), JSON.stringify(envelope, null, 2), 'utf8')
    const sourceHashAfter = createHash('sha256').update(readFileSync(database)).digest('hex')
    expect(sourceHashAfter).toBe(sourceHashBefore)
    writeFileSync(resolve(output, 'pbm-real-run-report.json'), JSON.stringify({
      result: 'PARTIAL', verticalProof: 'PASS', source: database, sourceSha256: sourceHashAfter, sourceUnchanged: sourceHashAfter === sourceHashBefore, sourceEditionId: first.sourceEditionId, selectedStartDate: options.startDate,
      seed: options.seed, replaySeed: options.seed, comparisonSeed: 20261026,
      clubsAndCompetitionsRecovered: { competitionId: detail.competition.certifiedCompetitionId, competitionName: detail.competition.displayName, teams: realIdentity(first) },
      countriesRead: countries.countries.length, countriesInInstance: Object.keys(first.world.countries).length,
      generatedCounts: first.generatedCounts, generatedNationalities: 'Generated identities use the selected competition country; nationality is simulated.', gamesScheduled: Object.keys(first.world.games).length,
      calendarAdvances: [first.world.currentDate, addDays(first.world.currentDate, 1)],
      sourceFormatHash: detail.editions[0]!.formatSha256,
      limitationsReportFile: 'outputs/worlddb-universe-v1/incompatibilities.json',
    }, null, 2), 'utf8')
  }, 180_000)
})
