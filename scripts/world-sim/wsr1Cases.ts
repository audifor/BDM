/**
 * WSR1 reference cases: real matchups from the prototype and ACB worlds, prepared through the production path (world -> prepareMatchSetup),
 * under several competition formats (as competition data, never league-name hacks), with cohort transforms that create deliberately
 * different teams (strength, offense/defense balance, pace, interior/perimeter, bench depth, star dependence, rebounding, coverages).
 * The same case list is used for FAST reference runs, calibration and BACKGROUND certification.
 */
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { prepareMatchSetup } from '@/app/matchNext/prepareMatchSetup'
import { FIBA_GAME_FORMAT, NBA_GAME_FORMAT, NCAA_MEN_GAME_FORMAT, NCAA_WOMEN_GAME_FORMAT, WNBA_GAME_FORMAT } from '@/domain/competition'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { Game } from '@/domain/game'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import type { MatchNextPlayerProfile, MatchSetup } from '@/engine/match-next'
import { withStyle } from '@/presentation/match-next/dev/tacticalStyles'

export type Format = 'NATIVE' | 'FIBA' | 'NBA' | 'NCAAM' | 'NCAAW' | 'WNBA'
export type Transform = 'none' | 'strongHome' | 'eliteBoth' | 'weakBoth' | 'offHeavy' | 'defHeavy' | 'fast' | 'slow' | 'fastVsSlow'
  | 'interior' | 'perimeter' | 'deep' | 'shallow' | 'star' | 'boards' | 'pressSag' | 'dropBlitz' | 'switchHelp' | 'tired'

export interface WsrCase {
  readonly id: string
  readonly world: 'proto' | 'acb'
  /** Game day index (0 = first day with games) and game index within it. */
  readonly day: number
  readonly game: number
  readonly format: Format
  readonly transform: Transform
  /** Independent rating scales (offense, defense) of each team, applied after the transform: strength-gap calibration. */
  readonly scale?: { readonly homeOffense: number; readonly homeDefense: number; readonly awayOffense: number; readonly awayDefense: number }
}

const FORMATS = { FIBA: FIBA_GAME_FORMAT, NBA: NBA_GAME_FORMAT, NCAAM: NCAA_MEN_GAME_FORMAT, NCAAW: NCAA_WOMEN_GAME_FORMAT, WNBA: WNBA_GAME_FORMAT } as const
const TRANSFORMS: readonly Transform[] = ['none', 'strongHome', 'eliteBoth', 'weakBoth', 'offHeavy', 'defHeavy', 'fast', 'slow', 'fastVsSlow', 'interior', 'perimeter', 'deep', 'shallow', 'star', 'boards', 'pressSag', 'dropBlitz', 'switchHelp', 'tired']

/** Calibration cases: every base matchup of the first game days, transforms and formats rotated over them. */
export function calibrationCases(): readonly WsrCase[] {
  const cases: WsrCase[] = []
  const formats: readonly Format[] = ['NATIVE', 'NATIVE', 'NBA', 'NCAAM', 'WNBA', 'NATIVE', 'NCAAW', 'FIBA']
  let k = 0
  for (const [world, days, perDay] of [['proto', 4, 4], ['acb', 4, 9]] as const) {
    for (let day = 0; day < days; day += 1) for (let game = 0; game < perDay; game += 1) {
      for (let r = 0; r < 2; r += 1) {
        const transform = TRANSFORMS[(k * 7 + r * 3) % TRANSFORMS.length]!
        const format = world === 'acb' && k % 3 !== 0 ? 'NATIVE' : formats[k % formats.length]!
        cases.push({ id: `cal-${world}-d${day}g${game}-${transform}-${format}`, world, day, game, format, transform })
        k += 1
      }
    }
  }
  return cases
}

/**
 * Supplementary calibration (strength gaps): every base matchup of the first game days with each team's offense and defense scaled
 * independently (0.82-1.18, a fixed low-discrepancy sequence), so the fit sees how FAST responds to rating differences.
 */
export function strengthCalibrationCases(): readonly WsrCase[] {
  const cases: WsrCase[] = []
  let k = 0
  const factor = (n: number) => Math.round((0.82 + 0.36 * ((n * 0.6180339887) % 1)) * 1000) / 1000
  for (const [world, days, perDay] of [['proto', 4, 4], ['acb', 2, 9]] as const) {
    for (let day = 0; day < days; day += 1) for (let game = 0; game < perDay; game += 1) {
      for (let r = 0; r < 2; r += 1) {
        const scale = { homeOffense: factor(4 * k + 1), homeDefense: factor(4 * k + 2), awayOffense: factor(4 * k + 3), awayDefense: factor(4 * k + 4) }
        cases.push({ id: `cal2-${world}-d${day}g${game}-${r}`, world, day, game, format: k % 5 === 4 ? 'NBA' : 'NATIVE', transform: 'none', scale })
        k += 1
      }
    }
  }
  return cases
}

/** Certification cohorts (§41): fixed matchups never used for calibration (later game days), each cohort on several matchups. */
export const COHORTS: readonly { readonly name: string; readonly transform: Transform; readonly format: Format }[] = [
  { name: 'balanced', transform: 'none', format: 'NATIVE' },
  { name: 'elite-vs-weak', transform: 'strongHome', format: 'NATIVE' },
  { name: 'elite-vs-elite', transform: 'eliteBoth', format: 'NATIVE' },
  { name: 'offense-heavy', transform: 'offHeavy', format: 'NATIVE' },
  { name: 'defense-heavy', transform: 'defHeavy', format: 'NATIVE' },
  { name: 'fast', transform: 'fast', format: 'NATIVE' },
  { name: 'slow', transform: 'slow', format: 'NATIVE' },
  { name: 'interior', transform: 'interior', format: 'NATIVE' },
  { name: 'perimeter', transform: 'perimeter', format: 'NATIVE' },
  { name: 'deep-bench', transform: 'deep', format: 'NATIVE' },
  { name: 'shallow-bench', transform: 'shallow', format: 'NATIVE' },
  { name: 'star', transform: 'star', format: 'NATIVE' },
  { name: 'nba-format', transform: 'none', format: 'NBA' },
  { name: 'ncaa-format', transform: 'none', format: 'NCAAM' },
  { name: 'wnba-format', transform: 'none', format: 'WNBA' },
]

export function certificationCases(): readonly WsrCase[] {
  const bases = [['proto', 5, 0], ['proto', 6, 1], ['acb', 6, 2], ['acb', 7, 5]] as const
  return COHORTS.flatMap((cohort) => bases.map(([world, day, game]) => ({ id: `cert-${cohort.name}-${world}-d${day}g${game}`, world, day, game, format: cohort.format, transform: cohort.transform })))
}

const worldCache = new Map<string, readonly GameWorld[]>()
/** The world on each of its first game days (advancing the calendar without playing: only the date moves). */
function gameDays(kind: WsrCase['world'], count: number): readonly GameWorld[] {
  const cached = worldCache.get(kind)
  if (cached !== undefined && cached.length >= count) return cached
  const days: GameWorld[] = []
  let world = kind === 'proto' ? createNewGame() : createAcbTestGame()
  while (days.length < count) {
    while (getScheduledGamesToday(world).length === 0) world = advanceDay(world)
    days.push(world)
    world = advanceDay(world)
  }
  worldCache.set(kind, days)
  return days
}

export function caseSetup(item: WsrCase, seed: number): MatchSetup {
  let world = gameDays(item.world, item.day + 1)[item.day]!
  const games: readonly Game[] = getScheduledGamesToday(world)
  const game = games[item.game % games.length]!
  if (item.format !== 'NATIVE') {
    const format = FORMATS[item.format]
    world = updateGameWorld(world, { competitions: Object.values(world.competitions).map((c) => c.id === game.competitionId ? { ...c, rules: { ...c.rules, gameFormat: format } } : c) })
  }
  const transformed = transform(prepareMatchSetup(world, game, seed), item.transform)
  const scale = item.scale
  return scale === undefined ? transformed : mapPlayers(transformed, (p, home) => scalePlayer(p, home ? { offense: scale.homeOffense, defense: scale.homeDefense, rebounding: (scale.homeOffense + scale.homeDefense) / 2 } : { offense: scale.awayOffense, defense: scale.awayDefense, rebounding: (scale.awayOffense + scale.awayDefense) / 2 }))
}

const clampRating = (value: number): number => Math.max(20, Math.min(99, value))
type Scale = { readonly offense?: number; readonly defense?: number; readonly rebounding?: number }
function scalePlayer(player: MatchNextPlayerProfile, scale: Scale): MatchNextPlayerProfile {
  const o = scale.offense ?? 1
  const d = scale.defense ?? 1
  const r = scale.rebounding ?? 1
  return {
    ...player,
    offense: { usage: player.offense.usage, rimAttack: clampRating(player.offense.rimAttack * o), shooting: clampRating(player.offense.shooting * o), creation: clampRating(player.offense.creation * o), ballSecurity: clampRating(player.offense.ballSecurity * o) },
    ...(player.passing === undefined ? {} : { passing: { accuracy: clampRating(player.passing.accuracy * o), vision: clampRating(player.passing.vision * o), timing: player.passing.timing } }),
    defense: { ...player.defense, pointOfAttack: clampRating(player.defense.pointOfAttack * d), interior: clampRating(player.defense.interior * d), mobility: clampRating(player.defense.mobility * d), ...(player.defense.steal === undefined ? {} : { steal: clampRating(player.defense.steal * d) }) },
    rebounding: { impact: clampRating(player.rebounding.impact * r) },
  }
}

function mapPlayers(setup: MatchSetup, pick: (player: MatchNextPlayerProfile, home: boolean, starter: boolean) => MatchNextPlayerProfile): MatchSetup {
  const starters = new Set([...setup.initialLineups.home, ...setup.initialLineups.away])
  return { ...setup, players: setup.players.map((player) => pick(player, player.teamId === setup.homeTeamId, starters.has(player.playerId))) }
}

function styles(setup: MatchSetup, home: string, away: string): MatchSetup {
  return { ...setup, tacticalPlans: { home: withStyle(setup.tacticalPlans.home, home), away: withStyle(setup.tacticalPlans.away, away) } }
}

export function transform(setup: MatchSetup, kind: Transform): MatchSetup {
  switch (kind) {
    case 'none': return setup
    case 'strongHome': return mapPlayers(setup, (p, home) => scalePlayer(p, home ? { offense: 1.12, defense: 1.12, rebounding: 1.12 } : { offense: 0.88, defense: 0.88, rebounding: 0.88 }))
    case 'eliteBoth': return mapPlayers(setup, (p) => scalePlayer(p, { offense: 1.1, defense: 1.1, rebounding: 1.1 }))
    case 'weakBoth': return mapPlayers(setup, (p) => scalePlayer(p, { offense: 0.88, defense: 0.88, rebounding: 0.88 }))
    case 'offHeavy': return mapPlayers(setup, (p, home) => home ? scalePlayer(p, { offense: 1.12, defense: 0.88 }) : p)
    case 'defHeavy': return mapPlayers(setup, (p, home) => home ? scalePlayer(p, { offense: 0.88, defense: 1.12 }) : p)
    case 'fast': return styles(setup, 'fast', 'fast')
    case 'slow': return styles(setup, 'controlled', 'controlled')
    case 'fastVsSlow': return styles(setup, 'fast', 'controlled')
    case 'interior': return mapPlayers(setup, (p, home) => !home ? p : { ...p, offense: { ...p.offense, rimAttack: clampRating(p.offense.rimAttack + 12), shooting: clampRating(p.offense.shooting - 10) }, defense: { ...p.defense, interior: clampRating(p.defense.interior + 8) } })
    case 'perimeter': return mapPlayers(setup, (p, home) => !home ? p : { ...p, offense: { ...p.offense, rimAttack: clampRating(p.offense.rimAttack - 8), shooting: clampRating(p.offense.shooting + 12) } })
    case 'deep': return mapPlayers(setup, (p, home, starter) => home && !starter ? scalePlayer(p, { offense: 1.15, defense: 1.15, rebounding: 1.15 }) : p)
    case 'shallow': return mapPlayers(setup, (p, home, starter) => home && !starter ? scalePlayer(p, { offense: 0.75, defense: 0.75, rebounding: 0.75 }) : p)
    case 'star': {
      const starId = setup.initialLineups.home.map((id) => setup.players.find((p) => p.playerId === id)!).sort((a, b) => b.offense.creation - a.offense.creation)[0]!.playerId
      return mapPlayers(setup, (p, home) => !home ? p : p.playerId === starId
        ? { ...p, offense: { usage: 95, rimAttack: 95, shooting: 95, creation: 97, ballSecurity: 92 } }
        : scalePlayer(p, { offense: 0.9 }))
    }
    case 'boards': return mapPlayers(setup, (p, home) => home ? scalePlayer(p, { rebounding: 1.2 }) : p)
    case 'pressSag': return styles(setup, 'press', 'sag')
    case 'dropBlitz': return styles(setup, 'dropD', 'blitzD')
    case 'switchHelp': return styles(setup, 'switchD', 'helpHigh')
    case 'tired': return { ...setup, players: setup.players.map((p) => p.teamId === setup.homeTeamId ? { ...p, dynamicState: { careerFatigue: 70 } } : p) }
  }
}
