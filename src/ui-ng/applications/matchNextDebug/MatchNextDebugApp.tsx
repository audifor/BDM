import { useEffect, useMemo, useState } from 'react'
import type { CourtPosition } from '@/domain/court'
import { createCourtGeometry } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { activePossession, applyCommand, createMatchState, tick, toFrame, type MatchNextCommand, type MatchSetup, type MatchState } from '@/engine/match-next'

type ScenarioName = 'A' | 'B' | 'C' | 'D' | 'E'
interface ScheduledCommand { readonly atT: number; readonly command: MatchNextCommand }
interface ScenarioStart { readonly state: MatchState; readonly commands: readonly ScheduledCommand[]; readonly description: string }

function debugSetup(): MatchSetup {
  const homeTeamId = teamIdFromString('match-next-debug-home')
  const awayTeamId = teamIdFromString('match-next-debug-away')
  const homeIds = Array.from({ length: 5 }, (_, index) => playerIdFromString(`match-next-home-${index + 1}`))
  const awayIds = Array.from({ length: 5 }, (_, index) => playerIdFromString(`match-next-away-${index + 1}`))
  const profile = (playerId: typeof homeIds[number], teamId: typeof homeTeamId) => ({
    playerId, teamId, primaryPosition: 'PG' as const,
    physical: { heightCm: 190, weightKg: 85, wingspanCm: 195, standingReachCm: 245 },
    kinematics: { maxSpeedMps: 6, accelerationMps2: 3, brakingMps2: 4 },
    offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 50 },
    passing: { accuracy: 50, vision: 50, timing: 50 },
    defense: { pointOfAttack: 50, interior: 50, mobility: 50, steal: 50 }, rebounding: { impact: 50 },
  })
  const emptyPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }
  const homeSpots: readonly CourtPosition[] = [{ x: 14, y: 7.5 }, { x: 24, y: 7.5 }, { x: 18, y: 7.5 }, { x: 17, y: 7.5 }, { x: 8, y: 6 }]
  const awaySpots: readonly CourtPosition[] = [{ x: 27.5, y: 7.5 }, { x: 25, y: 7.5 }, { x: 20, y: 7.5 }, { x: 22, y: 5 }, { x: 22, y: 10 }]
  return {
    gameId: gameIdFromString('match-next-debug-game'), homeTeamId, awayTeamId,
    court: createCourtGeometry('FIBA'),
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24, offensiveReboundShotClockSeconds: null },
    homeSquad: homeIds, awaySquad: awayIds, initialLineups: { home: homeIds, away: awayIds },
    players: [...homeIds.map((id) => profile(id, homeTeamId)), ...awayIds.map((id) => profile(id, awayTeamId))],
    initialPlayerPositions: [...homeIds.map((playerId, index) => ({ playerId, position: homeSpots[index]! })), ...awayIds.map((playerId, index) => ({ playerId, position: awaySpots[index]! }))],
    tacticalPlans: { home: emptyPlan, away: emptyPlan }, defensiveMatchupOverrides: { home: [], away: [] }, matchSeed: 20260926,
  }
}

function scenarioStart(name: ScenarioName, setup: MatchSetup): ScenarioStart {
  const state = createMatchState(setup)
  const home = setup.homeTeamId
  const away = setup.awayTeamId
  const inbounder = setup.initialLineups.home[0]!
  const inboundReceiver = setup.initialLineups.home[1]!
  const homePassTarget = setup.initialLineups.home[2]!
  const awayInbounder = setup.initialLineups.away[0]!
  const awayRebounder = setup.initialLineups.away[2]!
  const basket = setup.court.baskets.right
  const commands: ScheduledCommand[] = [
    { atT: 1, command: { type: 'startInbound', teamId: home, inbounderPlayerId: inbounder, reason: 'periodStart' } },
    { atT: 2, command: { type: 'releaseInbound', receiverPlayerId: inboundReceiver, passKind: 'chest', travelTicks: 10 } },
  ]
  if (name === 'A') return { state, commands, description: 'DEAD → INBOUND → PASS_IN_FLIGHT → HELD' }
  if (name === 'B') return {
    state,
    commands: [...commands, { atT: 12, command: { type: 'releasePass', command: { receiverPlayerId: homePassTarget, target: state.players.find((player) => player.playerId === homePassTarget)!.position, passKind: 'chest', travelTicks: 20 } } }],
    description: 'HELD → PASS_IN_FLIGHT → HELD(receiver)',
  }
  if (name === 'C') return {
    state,
    commands: [
      ...commands,
      { atT: 12, command: { type: 'releaseShot', command: { targetBasket: basket, travelTicks: 20, plannedOutcome: { kind: 'MAKE', points: 2 } } } },
      { atT: 33, command: { type: 'startInbound', teamId: away, inbounderPlayerId: awayInbounder, reason: 'madeBasketInbound' } },
    ],
    description: 'HELD → SHOT_IN_FLIGHT → DEAD(madeBasket) → opposing INBOUND',
  }
  if (name === 'D') return {
    state,
    commands: [
      ...commands,
      { atT: 12, command: { type: 'releaseShot', command: { targetBasket: basket, travelTicks: 20, plannedOutcome: { kind: 'MISS', reboundTarget: { x: 20, y: 7.5 }, reboundAvailableT: 52 } } } },
      { atT: 53, command: { type: 'secureRebound', playerId: awayRebounder } },
    ],
    description: 'HELD → SHOT_IN_FLIGHT → REBOUNDABLE → HELD(rebounder)',
  }
  return {
    state,
    commands: [
      ...commands,
      { atT: 12, command: { type: 'releasePass', command: { receiverPlayerId: setup.initialLineups.home[4]!, target: { x: 18, y: 7.5 }, passKind: 'bounce', travelTicks: 10 } } },
      { atT: 24, command: { type: 'recoverLooseBall', playerId: setup.initialLineups.home[3]! } },
    ],
    description: 'PASS_IN_FLIGHT → LOOSE → HELD(recoverer)',
  }
}

function applyDueCommands(state: MatchState, commands: readonly ScheduledCommand[]): { readonly state: MatchState; readonly remaining: readonly ScheduledCommand[] } {
  let current = state
  let index = 0
  while (index < commands.length && commands[index]!.atT <= current.t) {
    current = applyCommand(current, commands[index]!.command)
    index += 1
  }
  return { state: current, remaining: index === 0 ? commands : commands.slice(index) }
}

export function MatchNextDebugApp() {
  const setup = useMemo(debugSetup, [])
  const initialScenario = useMemo(() => scenarioStart('A', setup), [setup])
  const [scenario, setScenario] = useState<ScenarioName>('A')
  const [script, setScript] = useState<readonly ScheduledCommand[]>(initialScenario.commands)
  const [description, setDescription] = useState(initialScenario.description)
  const [simulation, setSimulation] = useState(() => {
    return { state: initialScenario.state, history: [initialScenario.state] as readonly MatchState[] }
  })
  const [playing, setPlaying] = useState(false)

  const chooseScenario = (name: ScenarioName) => {
    const initial = scenarioStart(name, setup)
    const applied = applyDueCommands(initial.state, initial.commands)
    setPlaying(false)
    setScenario(name)
    setScript(applied.remaining)
    setDescription(initial.description)
    setSimulation({ state: applied.state, history: [applied.state] })
  }

  const step = () => setSimulation((current) => {
    const advanced = tick(current.state)
    const applied = applyDueCommands(advanced, script)
    setScript(applied.remaining)
    return { state: applied.state, history: [...current.history, applied.state] }
  })
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(step, 100)
    return () => window.clearInterval(timer)
  }, [playing, script])
  useEffect(() => { if (simulation.state.isComplete) setPlaying(false) }, [simulation.state.isComplete])

  const { state, history } = simulation
  const frame = toFrame(state)
  const court = setup.court
  const selectedTick = Math.max(0, history.findIndex((entry) => entry === state))
  const possession = activePossession(state)
  const ballRadius = 0.2 + Math.min(0.15, frame.ball.heightMeters * 0.04)
  return <main style={{ minHeight: '100vh', background: '#101820', color: '#ecf1f4', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
    <h1 style={{ marginTop: 0 }}>Match Next · Ball &amp; Possession Debug</h1>
    <p>{description || 'Choose a deterministic ball and possession scenario. Players stay spatially static.'}</p>
    <div aria-label="Match state" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 8, maxWidth: 980, marginBottom: 16 }}>
      <span>Ball state: <strong>{frame.ball.kind}{frame.ball.deadReason ? ` (${frame.ball.deadReason})` : ''}</strong></span>
      <span>Ball owner: <strong>{frame.ball.ownerPlayerId ?? 'none'}</strong></span>
      <span>Possession ID: <strong>{possession?.id ?? 'none'}</strong></span>
      <span>Possession team: <strong>{possession?.teamId ?? 'none'}</strong></span>
      <span>Possession phase: <strong>{possession?.phase ?? 'none'}</strong></span>
      <span>Game clock: <strong>{(frame.gameClock / 10).toFixed(1)}s ({frame.clock.gameRunning ? 'running' : 'stopped'})</strong></span>
      <span>Shot clock: <strong>{frame.shotClock === null ? '—' : `${(frame.shotClock / 10).toFixed(1)}s`} ({frame.clock.shotRunning ? 'running' : 'stopped'})</strong></span>
      <span>Period: <strong>{frame.period}</strong></span>
      <span>Tick: <strong>{frame.t}</strong></span>
      <span>Score: <strong>{frame.score.home}–{frame.score.away}</strong></span>
    </div>
    <svg viewBox={`0 0 ${court.lengthMeters} ${court.widthMeters}`} role="img" aria-label="Match Next court with static players and current ball position" style={{ display: 'block', width: 'min(100%, 1000px)', background: '#ca8b50', border: '4px solid #f5ead4' }}>
      <rect x="0.3" y="0.3" width={court.lengthMeters - 0.6} height={court.widthMeters - 0.6} fill="none" stroke="#fff1da" strokeWidth="0.12" />
      <line x1={court.lengthMeters / 2} y1="0" x2={court.lengthMeters / 2} y2={court.widthMeters} stroke="#fff1da" strokeWidth="0.1" />
      <circle cx={court.lengthMeters / 2} cy={court.widthMeters / 2} r="1.8" fill="none" stroke="#fff1da" strokeWidth="0.1" />
      <circle cx={court.baskets.left.x} cy={court.baskets.left.y} r="1.8" fill="none" stroke="#fff1da" strokeWidth="0.1" />
      <circle cx={court.baskets.right.x} cy={court.baskets.right.y} r="1.8" fill="none" stroke="#fff1da" strokeWidth="0.1" />
      {frame.ball.flight && <line x1={frame.ball.flight.from.x} y1={frame.ball.flight.from.y} x2={frame.ball.flight.target.x} y2={frame.ball.flight.target.y} stroke="#312115" strokeWidth="0.07" strokeDasharray="0.25 0.25" opacity="0.65" />}
      {frame.players.map((player, index) => <g key={player.playerId}>
        <circle cx={player.position.x} cy={player.position.y} r="0.42" fill={player.teamId === setup.homeTeamId ? '#153d72' : '#9b2433'} stroke="white" strokeWidth="0.08" />
        <text x={player.position.x} y={player.position.y + 0.12} textAnchor="middle" fill="white" fontSize="0.35">{index < 5 ? index + 1 : index - 4}</text>
      </g>)}
      <circle cx={frame.ball.position.x} cy={frame.ball.position.y} r={ballRadius} fill={frame.ball.kind === 'DEAD' ? '#523b2b' : '#f6de7e'} stroke="white" strokeWidth="0.08" />
      <text x={frame.ball.position.x + 0.35} y={frame.ball.position.y - 0.3} fill="#1b1712" fontSize="0.45">{frame.ball.kind}</text>
    </svg>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 16 }}>
      {(['A', 'B', 'C', 'D', 'E'] as const).map((name) => <button key={name} onClick={() => chooseScenario(name)} aria-pressed={scenario === name}>Scenario {name}</button>)}
      <button onClick={() => setPlaying(false)}>Pause</button>
      <button onClick={() => setPlaying(true)} disabled={state.isComplete}>Play</button>
      <button onClick={step} disabled={state.isComplete}>Step 0.1s</button>
      <input aria-label="Simulation history" type="range" min="0" max={Math.max(0, history.length - 1)} value={selectedTick} onChange={(event) => { setPlaying(false); const selected = history[Number(event.target.value)]; if (selected) setSimulation((current) => ({ ...current, state: selected })) }} style={{ width: 300 }} />
      <span>{history.length} snapshots</span>
    </div>
  </main>
}
