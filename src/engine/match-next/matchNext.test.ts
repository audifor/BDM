import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getGamesForTeam } from '@/domain/world'
import { createNewGame } from '@/app/game/createNewGame'
import { prepareMatchSetup } from '@/app/matchNext/prepareMatchSetup'
import { createMatchState, runUntil, tick, toFrame, observeFrames, createRngState, draw, validateMatchSetup, type MatchSetup } from './index'

function generatedSetup() {
  const world = createNewGame()
  const worldSnapshot = JSON.stringify(world)
  const team = Object.values(world.teams).find((candidate) => candidate.coachId === world.userCoachId)!
  const game = getGamesForTeam(world, team.id).find((candidate) => candidate.status === 'scheduled')!
  const setup = prepareMatchSetup(world, game, 123456)
  return { world, game, setup, worldSnapshot }
}

describe('Match Next foundation', () => {
  it('prepares a valid generated-world setup without retaining GameWorld or mutating it', () => {
    const { world, game, setup, worldSnapshot } = generatedSetup()
    expect(setup.gameId).toBe(game.id)
    expect(setup.initialLineups.home).toHaveLength(5)
    expect(setup.initialLineups.away).toHaveLength(5)
    expect(setup).not.toHaveProperty('world')
    expect(Object.values(setup)).not.toContain(world)
    expect(JSON.stringify(world)).toBe(worldSnapshot)
    expect(JSON.parse(JSON.stringify(setup))).toEqual(setup)
  })

  it('rejects invalid team and player membership invariants with specific errors', () => {
    const { setup } = generatedSetup()
    expect(() => validateMatchSetup({ ...setup, awayTeamId: setup.homeTeamId })).toThrow('Home and away teams must be different')
    expect(() => validateMatchSetup({ ...setup, players: [...setup.players, setup.players[0]!] })).toThrow('Duplicate player profile')
    expect(() => validateMatchSetup({ ...setup, homeSquad: [...setup.homeSquad, setup.homeSquad[0]!] })).toThrow('Home squad contains duplicate player IDs')
    const absent = setup.initialLineups.home[0]!
    expect(() => validateMatchSetup({ ...setup, homeSquad: setup.homeSquad.filter((id) => id !== absent) })).toThrow(`lineup player ${absent} is absent from its squad`)
    expect(() => validateMatchSetup({ ...setup, players: setup.players.filter((profile) => profile.playerId !== absent) })).toThrow(`home squad player ${absent} has no profile`)
    expect(() => validateMatchSetup({ ...setup, players: setup.players.map((profile) => profile.playerId === absent ? { ...profile, teamId: setup.awayTeamId } : profile) })).toThrow(`home squad player ${absent} is assigned to the wrong team`)
    expect(() => validateMatchSetup({ ...setup, awaySquad: [...setup.awaySquad, setup.homeSquad[0]!] })).toThrow(`Player appears on both teams`)
    expect(() => validateMatchSetup({ ...setup, initialLineups: { ...setup.initialLineups, home: setup.initialLineups.home.slice(0, 4) } })).toThrow('home lineup must contain exactly five players')
    expect(() => validateMatchSetup({ ...setup, initialLineups: { ...setup.initialLineups, home: [setup.initialLineups.home[0]!, setup.initialLineups.home[0]!, ...setup.initialLineups.home.slice(2)] } })).toThrow('home lineup contains duplicate player IDs')
    expect(() => validateMatchSetup({ ...setup, matchSeed: -1 })).toThrow('unsigned 32-bit integer')
    expect(() => validateMatchSetup({ ...setup, clockRules: { ...setup.clockRules, periodSeconds: 0 } })).toThrow('Clock periodSeconds')
  })

  it('has independent serializable RNG streams with exact continuation', () => {
    const initial = createRngState(11)
    const same = createRngState(11)
    const other = createRngState(12)
    expect(draw(initial, 'outcome').value).toBe(draw(same, 'outcome').value)
    expect(draw(initial, 'outcome').value).not.toBe(draw(other, 'outcome').value)
    const decision = draw(initial, 'decision').value
    const decisionAfterOutcome = draw(draw(initial, 'outcome').state, 'decision').value
    expect(decisionAfterOutcome).toBe(decision)
    const outcome = draw(initial, 'outcome').value
    const outcomeAfterDecision = draw(draw(initial, 'decision').state, 'outcome').value
    expect(outcomeAfterDecision).toBe(outcome)
    let cursor = initial
    for (let i = 0; i < 6; i += 1) cursor = draw(cursor, i % 2 ? 'decision' : 'outcome').state
    let restored = JSON.parse(JSON.stringify(cursor))
    for (let i = 0; i < 8; i += 1) {
      const stream = i % 3 === 0 ? 'attribution' : i % 2 === 0 ? 'outcome' : 'decision'
      const uninterrupted = draw(cursor, stream)
      const resumed = draw(restored, stream)
      expect(resumed).toEqual(uninterrupted)
      cursor = uninterrupted.state
      restored = resumed.state
    }
  })

  it('advances one tenth per tick, changes periods exactly at zero, and finishes FIBA regulation at 24,000 ticks', () => {
    const { setup: source } = generatedSetup()
    const setup: MatchSetup = { ...source, clockRules: { ...source.clockRules, periodCount: 4, periodSeconds: 600 } }
    let state = createMatchState(setup)
    const original = state
    state = tick(state)
    expect(state.t).toBe(1)
    expect(state.gameClockTenths).toBe(5999)
    expect(original.t).toBe(0)
    state = runUntil(state, (current) => current.period === 2)
    expect(state.t).toBe(6000)
    expect(state.period).toBe(2)
    expect(state.gameClockTenths).toBe(6000)
    const final = runUntil(state, (current) => current.isComplete)
    expect(final.t).toBe(24_000)
    expect(final.events.filter((event) => event.type === 'periodStart').map((event) => event.t)).toEqual([0, 6000, 12000, 18000])
    expect(final.events.filter((event) => event.type === 'periodEnd').map((event) => event.t)).toEqual([6000, 12000, 18000, 24000])
    expect(final.events.at(-1)?.type).toBe('foundationEnd')
    expect(final.score).toEqual({ home: 0, away: 0 })
    expect(final.foundationOnly).toBe(true)
    expect(final.events.map((event) => event.sequence)).toEqual(final.events.map((_, index) => index + 1))
  })

  it('replays deterministically and resumes from a JSON round-trip at midpoint', () => {
    const { setup } = generatedSetup()
    const a0 = createMatchState(setup)
    const b0 = createMatchState(setup)
    const predicateMidpoint = (state: ReturnType<typeof createMatchState>) => state.t >= 12000
    const aMid = runUntil(a0, predicateMidpoint)
    const aFinal = runUntil(aMid, (state) => state.isComplete)
    const bMid = runUntil(b0, predicateMidpoint)
    const bFinal = runUntil(JSON.parse(JSON.stringify(bMid)), (state) => state.isComplete)
    expect(bFinal).toEqual(aFinal)
    expect(runUntil(createMatchState(setup), (state) => state.isComplete)).toEqual(aFinal)
  })

  it('projects pure serializable frames and reports player and ball teleports', () => {
    const { setup } = generatedSetup()
    const state = createMatchState(setup)
    const snapshot = JSON.stringify(state)
    const frame = toFrame(state)
    expect(JSON.stringify(state)).toBe(snapshot)
    expect(JSON.parse(JSON.stringify(frame))).toEqual(frame)
    expect(frame.players[0]?.position).toEqual(state.players[0]?.position)
    expect(frame.score).toEqual(state.score)
    expect(frame.gameClock).toBe(state.gameClockTenths)
    expect(frame.shotClock).toBe(state.shotClockTenths)
    const next = toFrame(tick(state))
    expect(observeFrames([frame, next]).playerContinuityViolations).toEqual([])
    expect(observeFrames([frame, next]).ballStateViolations).toEqual([])
    const synthetic: typeof next = {
      ...next,
      players: next.players.map((player, index) => index === 0 ? { ...player, position: { x: player.position.x + 20, y: player.position.y } } : player),
      ball: { ...next.ball, position: { x: next.ball.position.x + 20, y: next.ball.position.y } },
    }
    const report = observeFrames([frame, synthetic])
    expect(report.frameCount).toBe(2)
    expect(report.playerContinuityViolations).toHaveLength(1)
    expect(report.ballStateViolations.length).toBeGreaterThan(0)
  })

  it('keeps forbidden runtime dependencies out of the engine and MatchState', () => {
    const folder = join(process.cwd(), 'src/engine/match-next')
    const source = readdirSync(folder).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts')).map((name) => readFileSync(join(folder, name), 'utf8')).join('\n')
    expect(source).not.toMatch(/from\s+['"](?:react|zustand|@tauri-apps)/i)
    expect(source).not.toMatch(/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/)
    expect(source).not.toMatch(/GameWorld/)
    const stateSource = readFileSync(join(folder, 'state.ts'), 'utf8')
    expect(stateSource).not.toMatch(/\b(?:Map|Set)\b/)
  })

  it('measures full regulation simulation baseline', () => {
    const { setup: source } = generatedSetup()
    const setup = { ...source, clockRules: { ...source.clockRules, periodCount: 4, periodSeconds: 600 } }
    const samples: number[] = []
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now()
      runUntil(createMatchState(setup), (state) => state.isComplete)
      samples.push(performance.now() - started)
    }
    const mean = samples.reduce((total, sample) => total + sample, 0) / samples.length
    process.stderr.write(`Match Next regulation baseline: 24000 ticks x 3; ${samples.map((value) => value.toFixed(1)).join(', ')} ms; mean ${mean.toFixed(1)} ms/game; ${(24_000 / (mean / 1000)).toFixed(0)} ticks/s\n`)
    expect(mean).toBeLessThan(200)
  })
})
