import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseWorldCompetitionFormatDocument, parseWorldCompetitionRuntimeBundle } from '@/domain/competition'
import reference from '@/data/worlddb-v2/competition-runtime.json'
import globalFormats from '@/data/worlddb-v2/global-formats.json'
const adaptedFormats = globalFormats.filter(doc => doc.notes?.includes('ADAPTED_DOCUMENTED_FORMAT'))
import { worldDbV2FamilySignature } from './WorldDbV2Connection'
import { createWorldDbV2UniverseFromSnapshots } from './WorldDbV2Universe'
import { createWorldDbV2GameFromSnapshot } from './WorldDbV2Game'
import { WORLDDB_V2_GLOBAL_COMPETITIONS, worldDbV2Competition } from './WorldDbV2Competitions'
import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import { simulateAndApplyGame } from './matchResolution'
import { withShortGameFormat } from './testFixtures'
import { materializeCompetitionPostseason, getCompetitionPostseasonState } from '@/engine/competition/WorldCompetitionPostseason'
import { calculateGroupStandings } from '@/engine/competition/standings/Standings'
import { isSeasonComplete } from '@/engine/season'
import { startNextSeasonTransitionFor } from './startNextSeason'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { validateGameWorld } from '@/domain/world'

function generated(count: number, grouped: boolean) {
  return JSON.parse(execFileSync(process.env.BDM_PYTHON ?? 'python', ['-c',
    `import importlib.util,json; s=importlib.util.spec_from_file_location('f','scripts/playable/worlddb-v2-simulation-fallback.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.simulation_document('pbm:DYN_championnat:999','Test',${count},postseason=True,grouped=${grouped ? 'True' : 'False'})))`], { encoding: 'utf8' }))
}

function snapshot(count: number, female: boolean): WorldDbV2Snapshot {
  const country = 'pbm:DYN_pays:8'
  return {
    manifest: { master: { sha256: 'a'.repeat(64) }, configuration: { start_date: '2025-07-01', seed: 'global-families' } },
    countries: [{ entity_id: country, parent_id: null, source_table: 'DYN_pays', reference_data: { nom_pays: 'Test', abreviation: 'ESP' } }],
    clubs: Array.from({ length: count }, (_, i) => ({ entity_id: `pbm:DYN_equipe:${90000 + i}`, parent_id: country, source_table: 'DYN_equipe', reference_data: { nom_equipe: `Club ${i}`, sexe: female ? 1 : 0 } })),
    people: [],
    competitions: [{ entity_id: 'pbm:DYN_championnat:999', parent_id: country, source_table: 'DYN_championnat', reference_data: { sexe: female ? 1 : 0 } }],
  }
}

it('links domestic tiers without mixing genders and exchanges teams in the next saved editions', async () => {
  const baseWire = generated(2, false)
  const snapshots = Array.from({ length: 4 }, (_, i) => {
    const source = snapshot(2, i >= 2)
    return { ...source, clubs: source.clubs.map((club, j) => ({ ...club, entity_id: `pbm:DYN_equipe:${99000 + 10 * i + j}` })),
      competitions: [{ ...source.competitions[0]!, entity_id: `pbm:DYN_championnat:${990 + i}`, reference_data: { sexe: i >= 2 ? 1 : 0, championnat_pays: 8, division: i % 2 + 1, type_competition: 0, categorie_age_competition: 0 } }] }
  })
  const formats = snapshots.map((_, i) => parseWorldCompetitionFormatDocument({ ...baseWire, competition_id: `competition:tiers:${i}`, competition_season_id: `edition:tiers:${i}` }))
  const configurations = formats.map((format, i) => ({ ...worldDbV2Competition(), sourceCompetitionId: snapshots[i]!.competitions[0]!.entity_id,
    nativeCompetitionId: format.competitionId, editionId: format.competitionSeasonId, ecosystemId: `ecosystem:tiers:${i}`, name: `Tier ${i}`, teamCount: 2, calendar: 'FORMAT_DERIVED_SIMULATION', formatProvenance: 'GENERATED_SIMULATION' }))
  let world = withShortGameFormat(await createWorldDbV2UniverseFromSnapshots(snapshots, snapshots[0]!.clubs[0]!.entity_id, undefined, { configurations, runtimeBundle: { ...parseWorldCompetitionRuntimeBundle(reference), competitionFormats: formats } }), 0.1)
  const seasons = Object.values(world.seasons)
  expect(seasons).toHaveLength(4)
  const rules = Object.values(world.ecosystems).flatMap(e => e.tierMovementRules)
  expect(rules).toHaveLength(2)
  for (const rule of rules) expect(world.competitions[rule.upperCompetitionId]!.gender).toBe(world.competitions[rule.lowerCompetitionId]!.gender)
  for (let i = 0; i < 40 && seasons.some(s => !isSeasonComplete(world, s.id)); i++) {
    for (const season of seasons) world = materializeCompetitionPostseason(world, season.id)
    const game = Object.values(world.games).filter(g => g.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0]
    expect(game).toBeDefined()
    world = simulateAndApplyGame(world, game!, 4000 + i)
  }
  expect(Object.values(world.promotionRelegationResolutionsById)).toHaveLength(2)
  world = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-10-31T12:00:00Z'))))
  for (const season of seasons) {
    const transition = startNextSeasonTransitionFor(world, season.id)
    world = transition.world
    const next = world.seasons[transition.result.targetSeasonId]!
    expect(next.participantTeamIds!.filter(id => season.participantTeamIds!.includes(id))).toHaveLength(1)
    expect(next.participantTeamIds!.every(id => world.teams[id]!.gender === world.competitions[next.competitionId]!.gender)).toBe(true)
  }
  validateGameWorld(world)
}, 120_000)

it.each([
  { count: 5, meetings: 1, grouped: false, female: false },
  { count: 4, meetings: 4, grouped: false, female: true },
  { count: 7, meetings: 2, grouped: true, female: true },
  { count: 8, meetings: 2, grouped: true, female: false },
  { count: 33, meetings: 2, grouped: true, female: false },
])('plays $count teams / $meetings meetings / groups=$grouped / women=$female through Save V4 and rollover', async ({ count, meetings, grouped, female }) => {
  const wire = generated(count, grouped)
  wire.variants[0].nodes[0].pairing.meetings_per_pair = meetings
  await exerciseFamily(wire, count, meetings, grouped, female)
}, 180_000)

it.each(adaptedFormats)('plays adapted $competition_id through every round and the next edition', async wire => {
  const count = wire.variants[0]!.nodes.find(n => n.role === 'REGULAR_SEASON')!.team_count!
  await exerciseFamily(wire, count, 2, false, wire.competition_id.includes('lf-endesa'))
}, 180_000)

async function exerciseFamily(wire: unknown, count: number, meetings: number, grouped: boolean, female: boolean) {
  const format = parseWorldCompetitionFormatDocument(wire)
  const config = { ...worldDbV2Competition(), sourceCompetitionId: 'pbm:DYN_championnat:999', nativeCompetitionId: format.competitionId,
    editionId: format.competitionSeasonId, teamCount: count, calendar: 'FORMAT_DERIVED_SIMULATION', formatProvenance: 'GENERATED_SIMULATION' }
  const source = snapshot(count, female)
  const runtime = { ...parseWorldCompetitionRuntimeBundle(reference), competitionFormats: [format] }
  let world = withShortGameFormat(await createWorldDbV2GameFromSnapshot(source, source.clubs[0]!.entity_id, undefined, config, runtime), 0.1)
  const seasonId = world.currentSeasonId!
  const regularCount = Object.keys(world.games).length
  expect(world.competitions[world.seasons[seasonId]!.competitionId]!.rules.schedule.meetingsPerPair).toBe(meetings)
  expect(Object.values(world.players).every(p => p.gender === (female ? 'female' : 'male'))).toBe(true)
  const save = () => {
    const saved = serializeGameWorldV4(world, '2026-10-31T12:00:00Z')
    const reopened = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(saved)))
    expect(reopened.seasons[seasonId]!.worldCompetitionFormat).toEqual(world.seasons[seasonId]!.worldCompetitionFormat)
    expect(reopened.games).toEqual(world.games)
    world = reopened
  }
  save()
  for (let n = 0; n < 600 && !isSeasonComplete(world, seasonId); n++) {
    world = materializeCompetitionPostseason(world, seasonId)
    const game = Object.values(world.games).filter(g => g.seasonId === seasonId && g.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0]
    expect(game, 'Incomplete season must have a physical next game').toBeDefined()
    world = simulateAndApplyGame(world, game!, 1000 + n)
    if (n === regularCount - 1) save()
  }
  expect(isSeasonComplete(world, seasonId)).toBe(true)
  const champion = getCompetitionPostseasonState(world, seasonId)?.championTeamId
  expect(champion).toBeTruthy()
  expect(world.seasonHistoryBySeasonId[seasonId]?.championTeamId).toBe(champion)
  const tables = calculateGroupStandings(world, seasonId)
  expect(tables).toHaveLength(grouped ? Number(format.variants[0]!.nodes[0]!.opponentScope!.payload.generated_group_count) : 1)
  for (const table of tables) expect(table.every(row => row.played === (table.length - 1) * meetings)).toBe(true)
  expect(Object.keys(world.matchStatLogsByGameId)).toHaveLength(Object.keys(world.games).length)
  save()
  const transition = startNextSeasonTransitionFor(world, seasonId)
  world = transition.world
  expect(transition.result.schedule.fixtureCount).toBe(regularCount)
  expect(startNextSeasonTransitionFor(world, seasonId).result.targetSeasonId).toBe(transition.result.targetSeasonId)
  validateGameWorld(world)
  save()
  if (process.env.BDM_WORLDDB_GLOBAL_CATALOG === '1') {
    const path = '.worlddb-v2/generated-simulation-candidates/family-' + format.competitionId.replaceAll(':', '-') + '-' + count + '-' + meetings + '-' + grouped + '.json'
    writeFileSync(path, JSON.stringify({ status: 'LIFECYCLE_PASS', signature: worldDbV2FamilySignature(format), regularGames: regularCount, champion, successorGames: transition.result.schedule.fixtureCount, shortGameMinutes: 0.1 }))
  }
}

it.skipIf(process.env.BDM_WORLDDB_GLOBAL_CATALOG !== '1')('projects every source catalog candidate with its actual clubs and persists the executable graph', async () => {
  const root = '.worlddb-v2/generated-simulation-candidates/'
  const configs = JSON.parse(readFileSync(root + 'candidate-competitions.json', 'utf8'))
  const docs = [...JSON.parse(readFileSync(root + 'simulation-formats.json', 'utf8')), ...JSON.parse(readFileSync(root + 'reused-documented-formats.json', 'utf8'))].map(parseWorldCompetitionFormatDocument)
  const base = parseWorldCompetitionRuntimeBundle(reference)
  const runtime = { ...base, competitionFormats: [...new Map([...base.competitionFormats, ...docs].map(doc => [doc.competitionSeasonId, doc])).values()] }
  const index = JSON.parse(readFileSync('.worlddb-v2/batch-04/index.json', 'utf8'))
  const results = []
  for (const config of configs.filter((c: any) => c.formatProvenance)) {
    try {
      const row = index.results.find((r: any) => r.source_id === config.sourceCompetitionId)
      const source = JSON.parse(readFileSync(row.snapshotPath, 'utf8'))
      const world = await createWorldDbV2GameFromSnapshot(source, source.clubs[0].entity_id, undefined, config, runtime)
      const saved = serializeGameWorldV4(world, '2026-10-31T12:00:00Z')
      validateGameWorld(deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(saved))))
      results.push({ id: config.sourceCompetitionId, name: config.name, status: 'PROJECTION_SAVE_PASS', signature: worldDbV2FamilySignature(world.seasons[world.currentSeasonId!]!.worldCompetitionFormat!), teams: Object.keys(world.teams).length, games: Object.keys(world.games).length })
    } catch (error) {
      results.push({ id: config.sourceCompetitionId, name: config.name, status: 'PENDING', error: String(error) })
    }
  }
  writeFileSync(root + 'global-validation.json', JSON.stringify(results, null, 2))
  expect(results.filter(r => r.status === 'PROJECTION_SAVE_PASS').length).toBeGreaterThanOrEqual(90)
}, 600_000)

it.skipIf(process.env.BDM_WORLDDB_GLOBAL_CATALOG !== '1')('opens and saves all 94 published competitions through the default application bundle', async () => {
  const index = JSON.parse(readFileSync('.worlddb-v2/batch-04/index.json', 'utf8'))
  expect(WORLDDB_V2_GLOBAL_COMPETITIONS).toHaveLength(94)
  for (const config of WORLDDB_V2_GLOBAL_COMPETITIONS) {
    const row = index.results.find((r: any) => r.source_id === config.sourceCompetitionId)
    const source = JSON.parse(readFileSync(row.snapshotPath, 'utf8')) as WorldDbV2Snapshot
    const world = await createWorldDbV2GameFromSnapshot(source, source.clubs[0]!.entity_id)
    expect(Object.keys(world.teams).sort(), config.name).toEqual(source.clubs.map(c => c.entity_id).sort())
    expect(Object.keys(world.games).length, config.name).toBeGreaterThan(0)
    const save = serializeGameWorldV4(world, '2026-10-31T12:00:00Z')
    validateGameWorld(deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(save))))
  }
}, 600_000)
