import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createWorldDbV2UniverseFromSnapshots } from './WorldDbV2Universe'
import { WORLDDB_V2_COMPETITIONS } from './WorldDbV2Competitions'
import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import { validateGameWorld, type GameWorld } from '@/domain/world'
import { advanceGameDayWithResult, advanceGameDayWithResultAsync } from './advanceGameDay'
import { createUniverseAcceptanceRunner } from './testSupport/WorldDbV2UniverseRunner'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { useGameStore } from '@/stores/gameStore'
import { hashStringToSeed } from '@/engine/random'
import { calculateStandings } from '@/engine/competition/standings'
import { getCompetitionPostseasonState } from '@/engine/competition'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { buildCompetitionWorkspaceModel } from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'
import { getUserTeam } from '@/engine/calendar'
import { simulationDetailFor } from './matchResolution'
import { decideResolutions } from '@/app/worldSim/SimulationResolutionPolicy'
import { buildScoutingWorkspaceModel } from '@/ui-ng/applications/scouting/buildScoutingWorkspaceModel'

const root = process.env.WORLDDB_SOURCE_ROOT ?? 'C:/BDM_DB/WORLDDB_PBM'
const enabled = process.env.BDM_WORLDDB_UNIVERSE === '1' && existsSync(resolve(root, 'WORLDDB_UNIFIED_V2/worlddb_bdm_btw_v2.sqlite'))

describe('WorldDB V2 universe selection', () => {
  it('requires an active competition', async () => {
    await expect(createWorldDbV2UniverseFromSnapshots([], 'missing')).rejects.toThrow('at least one')
  })
  it('assembles 70 clubs with unique identities, all four exact schedules and Save V4', async () => {
    const snapshots = fixtureSnapshots()
    const world = await createWorldDbV2UniverseFromSnapshots(snapshots, snapshots[0]!.clubs[0]!.entity_id)
    expect(Object.keys(world.competitions)).toHaveLength(4)
    expect(Object.keys(world.teams)).toHaveLength(70)
    expect(Object.keys(world.players)).toHaveLength(350)
    expect(Object.keys(world.games)).toHaveLength(1166)
    expect(world.worldDbCompetitionRuntime?.competitionSeasonIds).toHaveLength(4)
    const today = Object.values(world.games).filter(g => g.date === world.currentDate)
    expect(today).toHaveLength(35)
    expect(decideResolutions(world, today, simulationDetailFor(world)).every(d => d.resolution === 'FAST')).toBe(true)
    const restored = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-10-27T12:00:00Z'))))
    expect(projectPersistentWorldTruth(restored)).toEqual(projectPersistentWorldTruth(world))
    expect(world.worldDbCompetitionRuntime?.worldDbV2?.activeCompetitionIds).toEqual(WORLDDB_V2_COMPETITIONS.map(c => c.sourceCompetitionId))
    expect(restored.worldDbCompetitionRuntime).toEqual(world.worldDbCompetitionRuntime)
    for (const season of Object.values(restored.seasons)) expect(buildCompetitionWorkspaceModel(restored, season.competitionId, getUserTeam(restored)?.id)?.standings).toHaveLength(restored.competitions[season.competitionId]!.participantTeamIds.length)
    const market = buildScoutingWorkspaceModel(restored)!
    const foreign = market.knowledge.filter(row => !row.isOwnRoster)
    expect(new Set(foreign.map(row => row.competitionName)).size).toBe(4)
    expect(foreign.every(row => row.knownRatingCount === 0)).toBe(true)
  }, 120_000)
  it('rejects duplicate leagues, mismatched sources and clubs outside the active universe', async () => {
    const snapshots = fixtureSnapshots(), first = snapshots[0]!, club = first.clubs[0]!.entity_id
    await expect(createWorldDbV2UniverseFromSnapshots([first, first], club)).rejects.toThrow('Duplicate')
    const changed = { ...snapshots[1]!, manifest: { ...snapshots[1]!.manifest, configuration: { ...first.manifest.configuration, seed: 'other' } } }
    await expect(createWorldDbV2UniverseFromSnapshots([first, changed], club)).rejects.toThrow('share master, date and seed')
    await expect(createWorldDbV2UniverseFromSnapshots(snapshots, 'outside')).rejects.toThrow('not in an active')
  })
  it('refuses conflicting shared identities instead of overwriting a person or country', async () => {
    const snapshots = fixtureSnapshots(), second = snapshots[1]!
    const conflicting = { ...second, countries: second.countries.map((country, i) => i === 0 ? { ...country, reference_data: { ...country.reference_data, nom_pays: 'Conflicting country' } } : country) }
    await expect(createWorldDbV2UniverseFromSnapshots([snapshots[0]!, conflicting], snapshots[0]!.clubs[0]!.entity_id)).rejects.toThrow('Conflicting WorldDB identity: countries/')
  }, 120_000)
})

/** Transport-shaped synthetic fixtures exercise the adapter in CI without the private PBM master. */
function fixtureSnapshots(): WorldDbV2Snapshot[] {
  const countries = WORLDDB_V2_COMPETITIONS.map(c => ({ entity_id: `pbm:DYN_pays:${c.countryId}`, parent_id: null, source_table: 'DYN_pays', reference_data: { nom_pays: c.countryCode, abreviation: c.countryCode } }))
  return WORLDDB_V2_COMPETITIONS.map((config, league) => {
    const clubs = Array.from({ length: config.teamCount }, (_, i) => ({ entity_id: `fixture:club:${league}:${i}`, parent_id: `pbm:DYN_pays:${config.countryId}`, source_table: 'DYN_equipe', reference_data: { nom_equipe: `Club ${league} ${i}`, sexe: 0 } }))
    const people = clubs.flatMap(club => Array.from({ length: 6 }, (_, i) => ({ entity_id: `${club.entity_id}:${i === 5 ? 'staff' : 'player'}:${i}`, parent_id: club.entity_id, source_table: i === 5 ? 'DYN_person' : 'DYN_joueur', reference_data: { is_alive: 1, retraite: 0, sexe: 0, annee_naissance: 1995, mois_naissance: 1, jour_naissance: 1, joueur_prenom: 'Fixture', joueur_nom: `${club.entity_id}:${i}`, prenom: 'Coach', nom: club.entity_id, nationalite: config.countryId, nationalite_id: config.countryId, job_preference_coach: 1, aptitude_meneur: i === 0 ? 100 : 1, aptitude_arriere: i === 1 ? 100 : 1, aptitude_ailier: i === 2 ? 100 : 1, aptitude_interieur: i === 3 ? 100 : 1, aptitude_pivot: i === 4 ? 100 : 1 } })))
    return { manifest: { master: { sha256: 'a'.repeat(64) }, configuration: { start_date: '2025-10-04', seed: 'fixture' } }, countries, clubs, people, competitions: [{ entity_id: config.sourceCompetitionId, parent_id: null, source_table: 'DYN_championnat', reference_data: {} }] }
  })
}

it.skipIf(!enabled)('four leagues evolve in one saved universe, then complete their independent seasons', async () => {
  const runner = process.env.BDM_UNIVERSE_WORKERS === '1' ? createUniverseAcceptanceRunner() : undefined
  try {
  const out = resolve(process.env.BDM_UNIVERSE_OUT ?? '.worlddb-v2/universe-05')
  mkdirSync(out, { recursive: true })
  const snapshots: WorldDbV2Snapshot[] = []
  for (const config of WORLDDB_V2_COMPETITIONS) {
    const path = resolve(out, config.countryCode + '-snapshot.json')
    if (!existsSync(path)) {
      const raw = execFileSync(process.env.BDM_PYTHON ?? 'python', ['-B', 'src-tauri/resources/worlddb_v2_bridge.py'], {
        input: JSON.stringify({ method: 'build', sourceRoot: root, output: resolve(out, config.countryCode + '.sqlite'), competitionId: config.sourceCompetitionId, startDate: '2025-10-04', seed: 'worlddb-v2-universe-05' }),
        encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
      })
      writeFileSync(path, raw)
    }
    snapshots.push(JSON.parse(readFileSync(path, 'utf8')))
  }
  const resume = process.env.BDM_UNIVERSE_RESUME
  const continuity = process.env.BDM_UNIVERSE_CONTINUITY === '1'
  let world = resume ? deserializeGameWorldSaveV4(JSON.parse(readFileSync(resume, 'utf8'))) : await createWorldDbV2UniverseFromSnapshots(snapshots, 'pbm:DYN_equipe:41')
  expect(Object.keys(world.competitions)).toHaveLength(4)
  expect(Object.keys(world.teams)).toHaveLength(70)
  const seasons = WORLDDB_V2_COMPETITIONS.map(config => Object.values(world.seasons).find(s => s.competitionId === config.nativeCompetitionId)!)
  const identities = Object.keys(world.players).sort()
  const checkpoint = (name: string) => {
    validateGameWorld(world)
    const save = serializeGameWorldV4(world, '2026-10-27T12:00:00Z')
    writeFileSync(resolve(out, name + '.json'), JSON.stringify(save))
    const restored = deserializeGameWorldSaveV4(JSON.parse(readFileSync(resolve(out, name + '.json'), 'utf8')))
    expect(projectPersistentWorldTruth(restored)).toEqual(projectPersistentWorldTruth(world))
    expect(restored.worldDbCompetitionRuntime).toEqual(world.worldDbCompetitionRuntime)
    world = restored
  }
  if (!resume) checkpoint('opening')
  const decisions: unknown[] = [], timings: number[] = []
  const summary = () => seasons.map(season => {
    const games = Object.values(world.games).filter(g => g.seasonId === season.id)
    const completed = games.filter(g => g.status === 'completed')
    const standings = calculateStandings(world, season.id)
    const successor = Object.values(world.seasons).find(s => s.competitionId === season.competitionId && s.startDate > season.startDate)
    return { competitionId: season.competitionId, seasonId: season.id, clubs: standings.length, completed: completed.length, regular: completed.filter(g => g.stakes === 'regular').length, stats: completed.filter(g => world.matchStatLogsByGameId[g.id]).length, champion: world.seasonHistoryBySeasonId[season.id]?.championTeamId, successorId: successor?.id, successorCompleted: successor === undefined ? 0 : Object.values(world.games).filter(g => g.seasonId === successor.id && g.status === 'completed').length }
  })
  const limit = process.env.BDM_UNIVERSE_SEASON === '1' ? 500 : 30
  for (let n = 0; n < limit; n++) {
    if (limit > 30 && summary().every(row => row.champion && row.successorId && (!continuity || row.successorCompleted > 0))) break
    useGameStore.getState().replaceWorld(world)
    for (const b of evaluateSimulationBreakpoints(world).candidates.filter(b => b.level === 'ACTION_REQUIRED' || b.level === 'BLOCKING')) {
      if (b.reason === 'userGame') continue
      const store = useGameStore.getState()
      if (b.reason === 'mediaOpportunity') store.skipMedia(b.sourceId)
      else if (b.reason === 'coachJobOffer') store.declineUserCoachOffer(b.sourceId)
      else if (b.reason === 'returnToPlayReview') {
        const result = store.reviewReturnToPlay(b.sourceId as never, 'CLEAR_FOR_PLAY')
        if (!result.ok) store.reviewReturnToPlay(b.sourceId as never, 'CONTINUE_RECOVERY')
      } else throw new Error('Unresolved decision: ' + JSON.stringify(b))
      decisions.push({ date: world.currentDate, reason: b.reason, id: b.sourceId })
    }
    world = useGameStore.getState().world!
    const started = performance.now()
    let i = 0
    const seed = () => hashStringToSeed(`universe-05:${world.currentDate}:${i++}`)
    const result = runner ? await advanceGameDayWithResultAsync(world, runner, seed) : advanceGameDayWithResult(world, seed)
    if (result.status === 'FAILED' || result.status === 'BREAKPOINT_PREVENTED') {
      writeFileSync(resolve(out, 'failure.json'), JSON.stringify(result, null, 2))
      checkpoint('before-failure')
    }
    expect(result.status, JSON.stringify({ date: world.currentDate, failure: result.failure, breakpoint: result.breakpointBefore.breakpoint })).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
    world = result.world
    timings.push(performance.now() - started)
    writeFileSync(resolve(out, 'progress.json'), JSON.stringify({ date: world.currentDate, days: n + 1, leagues: summary(), lastDayMs: timings.at(-1) }, null, 2))
    if (n === 29 && !resume) {
      const rows = summary()
      expect(rows.every(row => row.completed > 0 && row.stats === row.completed)).toBe(true)
      expect(Object.keys(world.players).sort()).toEqual(identities)
      expect(new Set(Object.values(world.teams).flatMap(t => t.rosterPlayerIds)).size).toBe(Object.values(world.teams).flatMap(t => t.rosterPlayerIds).length)
      for (const season of seasons) {
        const playerIds = new Set(world.competitions[season.competitionId]!.participantTeamIds.flatMap(id => world.teams[id]!.rosterPlayerIds))
        expect([...playerIds].some(id => world.careerFatigueByPlayerId[id]! > 0)).toBe(true)
        expect(Object.values(world.injuriesById).some(injury => playerIds.has(injury.playerId))).toBe(true)
        const model = buildCompetitionWorkspaceModel(world, season.competitionId, getUserTeam(world)?.id)!
        expect(model.standings.length).toBe(world.competitions[season.competitionId]!.participantTeamIds.length)
        expect(calculateStandings(world, season.id).reduce((s, row) => s + row.wins, 0)).toBe(rows.find(row => row.seasonId === season.id)!.regular)
      }
      checkpoint('day-30')
      writeFileSync(resolve(out, 'day-30-acceptance.json'), JSON.stringify({ passed: true, leagues: rows, days: 30, meanDayMs: timings.reduce((a, b) => a + b, 0) / timings.length, maxDayMs: Math.max(...timings), decisions }, null, 2))
    }
    if (n % 30 === 29 && limit > 30) checkpoint('latest')
  }
  if (limit > 30) {
    for (const season of seasons) {
      const games = Object.values(world.games).filter(g => g.seasonId === season.id)
      const regular = games.filter(g => g.stakes === 'regular')
      const teams = world.competitions[season.competitionId]!.participantTeamIds
      expect(regular).toHaveLength(teams.length * (teams.length - 1))
      expect(games.every(g => g.status === 'completed' && world.matchStatLogsByGameId[g.id]?.resolution === 'FAST')).toBe(true)
      expect(calculateStandings(world, season.id).every(row => row.played === 2 * (teams.length - 1))).toBe(true)
      expect(getCompetitionPostseasonState(world, season.id)?.championTeamId).toBe(world.seasonHistoryBySeasonId[season.id]!.championTeamId)
      expect(summary().find(row => row.seasonId === season.id)!.successorId).toBeTruthy()
      const next = world.seasons[summary().find(row => row.seasonId === season.id)!.successorId!]!
      expect([...(next.participantTeamIds ?? [])].sort()).toEqual([...(season.participantTeamIds ?? [])].sort())
      expect(Object.values(world.games).filter(g => g.seasonId === next.id && g.stakes === 'regular')).toHaveLength(teams.length * (teams.length - 1))
      if (continuity) expect(summary().find(row => row.seasonId === season.id)!.successorCompleted).toBeGreaterThan(0)
    }
    checkpoint(continuity ? 'continued-universe' : 'season-complete')
    writeFileSync(resolve(out, continuity ? 'continuity-acceptance.json' : 'season-acceptance.json'), JSON.stringify({ passed: true, leagues: summary(), date: world.currentDate, days: timings.length, meanDayMs: timings.reduce((a, b) => a + b, 0) / timings.length, decisions }, null, 2))
  }
  } finally { runner?.dispose() }
}, 28_800_000)
