import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createNewGame } from '@/app/game'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { NBA_GAME_FORMAT, NCAA_MEN_GAME_FORMAT, WNBA_GAME_FORMAT } from '@/domain/competition'
import { addDays } from '@/domain/date'
import type { Game } from '@/domain/game'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString, type PlayerId } from '@/domain/ids'
import { getTeamRoster, updateGameWorld, type GameWorld } from '@/domain/world'
import { getNextUserGame } from '@/engine/calendar'
import { withStyle } from '../../dev/tacticalStyles'
import { auditMatch, type MatchAudit } from './integration'

/**
 * BT7 integration scenarios over the production path. Read-only with respect to the engine.
 * BT2_AUDIT=1 BT7_SCEN=A,B,... npx vitest run src/presentation/match-next/audit/bt7/integration.test.ts -> docs/match-next-bt7/audit/<scen>.json
 * A normal user match (+ Live with frames, determinism) | B missing star | C foul trouble (limit 3) | C2 foul limit 2 with 6 available
 * D thin bench (6 available) | E1/E2 two tactical identities on the same Game | V:<kind>:<gender> competition variants | ACB universe
 */
const SEED = 3_498_342_002

function ratingMean(world: GameWorld, id: PlayerId): number {
  const values: number[] = []
  const walk = (v: unknown): void => { if (typeof v === 'number') values.push(v); else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x) }
  walk(world.players[id]?.basketball.ratings)
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

function injure(world: GameWorld, game: Game, ids: readonly PlayerId[]): GameWorld {
  const injuries = ids.map((playerId, i) => createInjury({ id: injuryIdFromString(`bt7-injury-${i}-${String(playerId)}`), playerId, kind: 'ankleSprain', severity: 'moderate', injuredOn: addDays(game.date, -1), expectedReturnDate: addDays(game.date, 20) }))
  return updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), ...injuries] })
}

function byQuality(world: GameWorld, teamId: Game['homeTeamId']): PlayerId[] {
  return getTeamRoster(world, teamId).map((p) => p.id).sort((a, b) => ratingMean(world, b) - ratingMean(world, a))
}

function withRatings(world: GameWorld, audit: MatchAudit): MatchAudit {
  const add = (side: unknown): void => {
    const s = side as { minutes?: { player: string; rating?: number }[] }
    for (const m of s.minutes ?? []) m.rating = Number(ratingMean(world, m.player as unknown as PlayerId).toFixed(1))
  }
  add(audit.metrics.home); add(audit.metrics.away)
  return audit
}

function variantGames(world: GameWorld): { key: string; game: Game }[] {
  const out: { key: string; game: Game }[] = []
  const seen = new Set<string>()
  for (const game of Object.values(world.games)) {
    if (game.status !== 'scheduled') continue
    const competition = world.competitions[game.competitionId]
    if (competition === undefined) continue
    const kind = world.ecosystems[competition.ecosystemId]?.kind ?? 'unknown'
    const key = `${kind}:${competition.gender}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ key, game })
  }
  return out
}

it.skipIf(process.env.BT2_AUDIT === undefined)('BT7 integration scenarios', () => {
  const scenarios = (process.env.BT7_SCEN ?? 'A').split(',')
  const outDir = `docs/match-next-bt7/audit${process.env.BT7_OUT === undefined ? '' : `/${process.env.BT7_OUT}`}`
  mkdirSync(outDir, { recursive: true })
  const world = createNewGame()
  const userGame = getNextUserGame(world)!
  for (const scen of scenarios) {
    const t0 = Date.now()
    let audits: MatchAudit[] = []
    let notes: Record<string, unknown> = {}
    if (scen === 'A') audits = [withRatings(world, auditMatch('A normal user match', world, userGame, SEED, { live: true }))]
    else if (scen.startsWith('S')) { // extra seeds of the normal match (sample)
      const seed = SEED + Number(scen.slice(1))
      audits = [withRatings(world, auditMatch(`sample seed ${seed}`, world, userGame, seed))]
    } else if (scen === 'B') {
      const star = byQuality(world, userGame.homeTeamId)[0]!
      const w = injure(world, userGame, [star])
      notes = { star: String(star), starRating: ratingMean(world, star) }
      audits = [withRatings(w, auditMatch('B missing star (home best player injured)', w, userGame, SEED))]
    } else if (scen === 'C') {
      audits = [withRatings(world, auditMatch('C foul trouble (personal foul limit 3)', world, userGame, SEED, { prepareSetup: (s) => ({ ...s, clockRules: { ...s.clockRules, foulRules: { personalFoulLimit: 3, teamFoulPenaltyFrom: 5, teamFoulOneAndOneFrom: null } } }) }))]
    } else if (scen === 'C2') {
      const keep = byQuality(world, userGame.homeTeamId).slice(0, 6)
      const w = injure(world, userGame, getTeamRoster(world, userGame.homeTeamId).map((p) => p.id).filter((id) => !keep.includes(id)))
      try {
        audits = [withRatings(w, auditMatch('C2 foul limit 2 with 6 available (exhaustion edge)', w, userGame, SEED, { prepareSetup: (s) => ({ ...s, clockRules: { ...s.clockRules, foulRules: { personalFoulLimit: 2, teamFoulPenaltyFrom: 5, teamFoulOneAndOneFrom: null } } }) }))]
      } catch (error) { notes = { threw: String(error) } }
    } else if (scen === 'D') {
      const keep = byQuality(world, userGame.homeTeamId).slice(0, 6)
      const w = injure(world, userGame, getTeamRoster(world, userGame.homeTeamId).map((p) => p.id).filter((id) => !keep.includes(id)))
      audits = [withRatings(w, auditMatch('D thin bench (home 6 available)', w, userGame, SEED))]
    } else if (scen === 'D4') {
      const keep = byQuality(world, userGame.homeTeamId).slice(0, 4)
      const w = injure(world, userGame, getTeamRoster(world, userGame.homeTeamId).map((p) => p.id).filter((id) => !keep.includes(id)))
      try { auditMatch('D4 only 4 available', w, userGame, SEED); notes = { threw: false } } catch (error) { notes = { threw: String(error) } }
    } else if (scen === 'E1' || scen === 'E2') {
      const style = scen === 'E1' ? 'fast' : 'controlled'
      audits = [withRatings(world, auditMatch(`E home style ${style}`, world, userGame, SEED, { prepareSetup: (s) => ({ ...s, tacticalPlans: { ...s.tacticalPlans, home: withStyle(s.tacticalPlans.home, style) } }) }))]
    } else if (scen.startsWith('V:')) {
      const key = scen.slice(2)
      const v = variantGames(world).find((x) => x.key === key)
      notes = { available: variantGames(world).map((x) => x.key) }
      if (v !== undefined) audits = [withRatings(world, auditMatch(`variant ${key}`, world, v.game, SEED))]
    } else if (scen === 'ACB') {
      const acb = createAcbTestGame()
      const g = getNextUserGame(acb)!
      audits = [withRatings(acb, auditMatch('ACB universe user match', acb, g, SEED))]
    } else if (scen.startsWith('R:')) {
      // Competition variant through world data: the generated world gives every competition FIBA-like rules, so the Game's competition
      // is given the real format (production path unchanged: world -> prepare -> engine).
      const format = { NBA: NBA_GAME_FORMAT, NCAAM: NCAA_MEN_GAME_FORMAT, WNBA: WNBA_GAME_FORMAT }[scen.slice(2)]!
      const competition = world.competitions[userGame.competitionId]!
      const w = updateGameWorld(world, { competitions: Object.values(world.competitions).map((c) => c.id === competition.id ? { ...c, rules: { ...c.rules, gameFormat: format } } : c) })
      audits = [withRatings(w, auditMatch(`rules ${scen.slice(2)}`, w, userGame, SEED))]
    } else if (scen === 'F') {
      const starters = byQuality(world, userGame.homeTeamId).slice(0, 5)
      const w = updateGameWorld(world, { careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, ...Object.fromEntries(starters.map((id) => [id, 75])) } })
      notes = { tired: starters.map(String) }
      audits = [withRatings(w, auditMatch('F fatigue stress (home best five at career fatigue 75)', w, userGame, SEED))]
    } else if (scen === 'AIAI') {
      const userTeamId = Object.values(world.teams).find((t) => t.coachId === world.userCoachId)!.id
      const g = Object.values(world.games).find((x) => x.status === 'scheduled' && x.competitionId === userGame.competitionId && x.homeTeamId !== userTeamId && x.awayTeamId !== userTeamId)!
      audits = [withRatings(world, auditMatch('AI vs AI (same competition)', world, g, SEED))]
    } else if (scen === 'LIST') {
      notes = { variants: variantGames(world).map((x) => ({ key: x.key, game: String(x.game.id), competition: String(x.game.competitionId) })), userGame: String(userGame.id) }
    }
    const failed = audits.flatMap((a) => a.checks.filter((c) => !c.ok).map((c) => `${a.label}: ${c.name} ${c.detail ?? ''}`))
    writeFileSync(`${outDir}/${scen.replace(/[:]/g, '_')}.json`, JSON.stringify({ scen, wallMs: Date.now() - t0, notes, failed, audits }, null, 1))
  }
}, 60_000_000)
