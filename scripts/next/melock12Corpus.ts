/**
 * ME-LOCK1.2 exact-execution certification corpus.
 *
 * Every case is produced through the production path (world -> port.prepare -> port.simulate). Variants are world data (the
 * competition's real game format, as BT7 R:*) or valid setup transforms (coach styles, foul limit, career fatigue, roster
 * strength), so the corpus is regenerated from code and needs no stored fixtures. Hashes use a key-sorted serialization:
 * internal property order cannot fake a mismatch, any value difference can't hide.
 *
 *   node scripts/next/melock1Build.mjs scripts/next/melock12Corpus.ts node_modules/.cache/melock12/corpus.mjs
 *   node node_modules/.cache/melock12/corpus.mjs [--only id,id] [--full id,id|all|cert] [--out file] [--compare baseline.json] [--jobs N] [--diagnostics]
 */
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEnginePort } from '@/app/matchNext/MatchNextEnginePort'
import { FIBA_GAME_FORMAT, NBA_GAME_FORMAT, NCAA_MEN_GAME_FORMAT, NCAA_WOMEN_GAME_FORMAT, WNBA_GAME_FORMAT } from '@/domain/competition'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import type { MatchSetup } from '@/engine/match-next'
import { withStyle } from '@/presentation/match-next/dev/tacticalStyles'
import { setExecutionDiagnostics } from '@/engine/match-next/execution/Diagnostics'
import { eventLogDiagnostics } from '@/engine/match-next/execution/EventLog'

type Format = 'FIBA' | 'NBA' | 'NCAAM' | 'NCAAW' | 'WNBA'
interface CorpusCase {
  readonly id: string
  readonly world: 'proto' | 'acb'
  readonly game: number
  readonly seed: number
  readonly format?: Format
  readonly home?: string
  readonly away?: string
  /** Personal foul limit override (foul trouble / foul-outs). */
  readonly foulLimit?: number
  /** Career fatigue given to both starting fives. */
  readonly tiredStarters?: number
  /** Ratings of the away team scaled by this factor (roster strength gap). */
  readonly awayScale?: number
}

const FORMATS = { FIBA: FIBA_GAME_FORMAT, NBA: NBA_GAME_FORMAT, NCAAM: NCAA_MEN_GAME_FORMAT, NCAAW: NCAA_WOMEN_GAME_FORMAT, WNBA: WNBA_GAME_FORMAT } as const

export const CORPUS: readonly CorpusCase[] = [
  // Golden ME-LOCK1.1 cases (prototype world, FIBA-like generated rules).
  { id: 'p0-3498342002', world: 'proto', game: 0, seed: 3498342002 },
  { id: 'p0-7', world: 'proto', game: 0, seed: 7 },
  { id: 'p1-11', world: 'proto', game: 1, seed: 11 },
  { id: 'p2-424242', world: 'proto', game: 2, seed: 424242 },
  { id: 'p3-99', world: 'proto', game: 3, seed: 99 },
  // Real competition formats through world data.
  { id: 'fiba-p1-5', world: 'proto', game: 1, seed: 5, format: 'FIBA' },
  { id: 'nba-p0-21', world: 'proto', game: 0, seed: 21, format: 'NBA' },
  { id: 'nba-p2-22', world: 'proto', game: 2, seed: 22, format: 'NBA', home: 'fast', away: 'controlled' },
  { id: 'ncaam-p1-31', world: 'proto', game: 1, seed: 31, format: 'NCAAM' },
  { id: 'ncaaw-p3-32', world: 'proto', game: 3, seed: 32, format: 'NCAAW' },
  { id: 'wnba-p0-41', world: 'proto', game: 0, seed: 41, format: 'WNBA' },
  { id: 'wnba-p3-42', world: 'proto', game: 3, seed: 42, format: 'WNBA', home: 'press', away: 'sag' },
  // Tactical identities, pace and coverages.
  { id: 'style-fast-ctrl', world: 'proto', game: 0, seed: 51, home: 'fast', away: 'controlled' },
  { id: 'style-ctrl-fast', world: 'proto', game: 1, seed: 52, home: 'controlled', away: 'fast' },
  { id: 'cov-drop-blitz', world: 'proto', game: 2, seed: 53, home: 'dropD', away: 'blitzD' },
  { id: 'cov-switch-help', world: 'proto', game: 3, seed: 54, home: 'switchD', away: 'helpHigh' },
  { id: 'press-helplow', world: 'proto', game: 0, seed: 55, home: 'press', away: 'helpLow' },
  // Foul trouble, fatigue, roster strength.
  { id: 'foul-limit-3', world: 'proto', game: 1, seed: 61, foulLimit: 3 },
  { id: 'foul-limit-2-press', world: 'proto', game: 2, seed: 62, foulLimit: 2, home: 'press', away: 'press' },
  { id: 'tired-75', world: 'proto', game: 3, seed: 63, tiredStarters: 75 },
  { id: 'weak-away-0.7', world: 'proto', game: 0, seed: 64, awayScale: 0.7 },
  // Overtime (found by scanning seeds at 6492794: 85-87 after one overtime).
  { id: 'overtime-p3-107', world: 'proto', game: 3, seed: 107 },
  // ACB universe (real roster depth, 9-game day).
  { id: 'acb0-71', world: 'acb', game: 0, seed: 71 },
  { id: 'acb4-72', world: 'acb', game: 3, seed: 72, home: 'fast', away: 'dropD' },
  { id: 'acb8-73', world: 'acb', game: 5, seed: 73, format: 'NBA' },
]

/** FULL (presentation frames every tick) is slow: this subset certifies FULL = FAST at every checkpoint. */
export const FULL_CERT = ['p0-3498342002', 'nba-p2-22', 'ncaam-p1-31', 'foul-limit-2-press', 'overtime-p3-107', 'acb4-72']

/** Canonical JSON: object keys sorted, undefined members dropped (as JSON.stringify does). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : canonicalJson(item)).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}
export const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 20)

const worlds = new Map<string, GameWorld>()
function baseWorld(kind: CorpusCase['world']): GameWorld {
  let world = worlds.get(kind)
  if (world === undefined) {
    world = kind === 'proto' ? createNewGame() : createAcbTestGame()
    // The ACB universe opens before its first round: play on the first match day.
    while (getScheduledGamesToday(world).length === 0) world = advanceDay(world)
    worlds.set(kind, world)
  }
  return world
}

export function corpusSetup(port: MatchNextEnginePort, item: CorpusCase): MatchSetup {
  let world = baseWorld(item.world)
  const game = getScheduledGamesToday(world)[item.game]!
  if (item.format !== undefined) {
    const format = FORMATS[item.format]
    world = updateGameWorld(world, { competitions: Object.values(world.competitions).map((c) => c.id === game.competitionId ? { ...c, rules: { ...c.rules, gameFormat: format } } : c) })
  }
  let setup = port.prepare(world, game, item.seed)
  if (item.home !== undefined || item.away !== undefined) setup = { ...setup, tacticalPlans: { home: withStyle(setup.tacticalPlans.home, item.home), away: withStyle(setup.tacticalPlans.away, item.away) } }
  if (item.foulLimit !== undefined) {
    const foulRules = setup.clockRules.foulRules ?? { personalFoulLimit: 5, teamFoulPenaltyFrom: 5, teamFoulOneAndOneFrom: null }
    setup = { ...setup, clockRules: { ...setup.clockRules, foulRules: { ...foulRules, personalFoulLimit: item.foulLimit } } }
  }
  if (item.tiredStarters !== undefined) {
    const starters = new Set([...setup.initialLineups.home, ...setup.initialLineups.away])
    setup = { ...setup, players: setup.players.map((p) => starters.has(p.playerId) ? { ...p, dynamicState: { careerFatigue: item.tiredStarters! } } : p) }
  }
  if (item.awayScale !== undefined) {
    const k = item.awayScale
    const s = (v: number) => Math.round(v * k)
    setup = { ...setup, players: setup.players.map((p) => p.teamId !== setup.awayTeamId ? p : {
      ...p,
      offense: { usage: p.offense.usage, rimAttack: s(p.offense.rimAttack), shooting: s(p.offense.shooting), creation: s(p.offense.creation), ballSecurity: s(p.offense.ballSecurity) },
      defense: { ...p.defense, pointOfAttack: s(p.defense.pointOfAttack), interior: s(p.defense.interior), mobility: s(p.defense.mobility) },
      ...(p.passing === undefined ? {} : { passing: { accuracy: s(p.passing.accuracy), vision: s(p.passing.vision), timing: s(p.passing.timing) } }),
    }) }
  }
  return setup
}

export interface CaseRecord { forks?: number; trims?: number; setup: string; result: string; events: string; stats: string; finalState: string; score: string; periods: number; events_n: number; fouls: number; subs: number; foulOuts: number; ms: number; full?: string }

function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
  const only = arg('--only')?.split(',')
  const fullArg = arg('--full')
  const out = arg('--out')
  const compare = arg('--compare')
  const jobs = Number(arg('--jobs') ?? 1)
  const diagnostics = args.includes('--diagnostics')
  if (diagnostics) setExecutionDiagnostics('FULL')
  const port = createMatchEnginePort('match-next') as MatchNextEnginePort
  let records: Record<string, CaseRecord> = {}
  const cases = CORPUS.filter((item) => only === undefined || only.includes(item.id))
  if (jobs > 1) {
    // Equivalence only: the cases are split over child processes (timings are then contended and not comparable).
    const shards = Array.from({ length: jobs }, (_, shard) => cases.filter((_, index) => index % jobs === shard).map((item) => item.id)).filter((ids) => ids.length > 0)
    const outputs = shards.map((_, shard) => `${tmpdir()}/melock12-shard-${process.pid}-${shard}.json`)
    const runs = shards.map((ids, shard) => new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, [process.argv[1]!, '--only', ids.join(','), '--out', outputs[shard]!, ...(fullArg === undefined ? [] : ['--full', fullArg]), ...(diagnostics ? ['--diagnostics'] : [])], { stdio: ['ignore', 'ignore', 'inherit'] })
      child.on('exit', (code) => code === 0 ? done() : fail(new Error(`shard ${shard} exited ${code}`)))
    }))
    void Promise.all(runs).then(() => {
      for (const file of outputs) records = { ...records, ...(JSON.parse(readFileSync(file, 'utf8')) as Record<string, CaseRecord>) }
      report(records, out, compare)
    })
    return
  }
  for (const item of cases) {
    const setup = corpusSetup(port, item)
    const forks0 = eventLogDiagnostics.forks, trims0 = eventLogDiagnostics.trims
    const t0 = performance.now()
    const result = port.simulate(setup, 'FAST')
    const ms = performance.now() - t0
    const record: CaseRecord = {
      setup: digest(setup), result: digest(result), events: digest(result.events), stats: digest(result.playerStats), finalState: digest(result.finalState),
      score: `${result.score.home}-${result.score.away}`, periods: result.finalState.period, events_n: result.events.length,
      fouls: result.events.filter((e) => e.type === 'foul').length, subs: result.events.filter((e) => e.type === 'substitution').length,
      foulOuts: result.events.filter((e) => e.type === 'foulOut' || e.type === 'foulOutNoReplacement').length, ms: Math.round(ms),
      forks: eventLogDiagnostics.forks - forks0, trims: eventLogDiagnostics.trims - trims0,
    }
    if (fullArg === 'all' || fullArg === 'cert' && FULL_CERT.includes(item.id) || fullArg?.split(',').includes(item.id)) record.full = digest(port.simulate(setup, 'FULL'))
    records[item.id] = record
    console.error(`${item.id.padEnd(20)} ${record.score.padEnd(8)} P${record.periods} ${String(record.ms).padStart(5)} ms  ${record.result}${record.full === undefined ? '' : record.full === record.result ? '  FULL=' : '  FULL!!'}`)
  }
  report(records, out, compare)
}

function report(unordered: Record<string, CaseRecord>, out: string | undefined, compare: string | undefined) {
  const records = Object.fromEntries(CORPUS.filter((item) => unordered[item.id] !== undefined).map((item) => [item.id, unordered[item.id]!]))
  if (out !== undefined) writeFileSync(out, `${JSON.stringify(records, null, 1)}\n`)
  if (compare !== undefined) {
    const base = JSON.parse(readFileSync(compare, 'utf8')) as Record<string, CaseRecord>
    let failures = 0
    for (const [id, record] of Object.entries(records)) {
      const ref = base[id]
      if (ref === undefined) { console.log(`?? ${id} not in baseline`); continue }
      const diffs = (['setup', 'result', 'events', 'stats', 'finalState'] as const).filter((key) => ref[key] !== record[key])
      if (record.full !== undefined && record.full !== ref.result) diffs.push('full' as never)
      if (diffs.length > 0) failures += 1
      console.log(`${diffs.length === 0 ? 'OK  ' : 'DIFF'} ${id.padEnd(20)} ${diffs.join(',')}  ${ref.ms} -> ${record.ms} ms`)
    }
    const total = (r: Record<string, CaseRecord>) => Object.keys(records).reduce((sum, id) => sum + (r[id]?.ms ?? 0), 0)
    console.log(`${failures === 0 ? 'EXACT' : `${failures} DIFFERENT`} · ${Object.keys(records).length} cases · baseline ${total(base)} ms -> ${total(records)} ms`)
    if (failures > 0) process.exitCode = 1
  }
}

if (process.argv[1]?.includes("corpus")) main()
