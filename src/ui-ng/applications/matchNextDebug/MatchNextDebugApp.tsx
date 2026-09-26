import { useEffect, useMemo, useState } from 'react'
import type { CourtPosition } from '@/domain/court'
import { createCourtGeometry, distanceBetween } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { activePossession, applyCommand, createMatchState, tick, toFrame, type MatchNextCommand, type MatchSetup, type MatchState } from '@/engine/match-next'

type ScenarioName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'VERTICAL SLICE'
interface ScheduledCommand { readonly atT: number; readonly command: MatchNextCommand }
interface ScenarioStart { readonly state: MatchState; readonly commands: readonly ScheduledCommand[]; readonly description: string }
function debugSetup(): MatchSetup {
  const homeTeamId = teamIdFromString('match-next-debug-home')
  const awayTeamId = teamIdFromString('match-next-debug-away')
  const homeIds = Array.from({ length: 5 }, (_, index) => playerIdFromString(`match-next-home-${index + 1}`))
  const awayIds = Array.from({ length: 5 }, (_, index) => playerIdFromString(`match-next-away-${index + 1}`))
  const profile = (playerId: typeof homeIds[number], teamId: typeof homeTeamId, index: number, isHome: boolean) => ({
    playerId, teamId, primaryPosition: 'PG' as const,
    physical: { heightCm: 190, weightKg: 85, wingspanCm: 195, standingReachCm: 245 },
    kinematics: isHome ? [
      { maxSpeedMps: 5.5, accelerationMps2: 2.8, brakingMps2: 3.5 },
      { maxSpeedMps: 5.8, accelerationMps2: 3, brakingMps2: 3.8 },
      { maxSpeedMps: 6.5, accelerationMps2: 3.8, brakingMps2: 4.8 },
      { maxSpeedMps: 5.0, accelerationMps2: 2.4, brakingMps2: 3.2 },
      { maxSpeedMps: 6.1, accelerationMps2: 3.4, brakingMps2: 4.2 },
    ][index]! : { maxSpeedMps: 5.8, accelerationMps2: 3, brakingMps2: 3.8 },
    offense: {
      usage: 50,
      rimAttack: isHome && index === 1 ? 84 : 50,
      shooting: isHome && index === 2 ? 90 : 50,
      creation: isHome && index === 1 ? 82 : 50,
      ballSecurity: 50,
    },
    passing: { accuracy: isHome && index === 1 ? 72 : 50, vision: isHome && index === 1 ? 74 : 50, timing: 68 },
    defense: { pointOfAttack: 50, interior: 50, mobility: 50, steal: 50 }, rebounding: { impact: 50 },
  })
  const emptyPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }
  const homeSpots: readonly CourtPosition[] = [{ x: 14, y: 7.5 }, { x: 10.5, y: 7.5 }, { x: 8.5, y: 3.2 }, { x: 8.5, y: 11.8 }, { x: 10, y: 5.2 }]
  const awaySpots: readonly CourtPosition[] = homeSpots.map((spot) => ({ x: spot.x + 1.5, y: Math.max(0.5, Math.min(14.5, spot.y + 0.35)) }))
  return {
    gameId: gameIdFromString('match-next-debug-game'), homeTeamId, awayTeamId,
    court: createCourtGeometry('FIBA'),
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24, offensiveReboundShotClockSeconds: null },
    homeSquad: homeIds, awaySquad: awayIds, initialLineups: { home: homeIds, away: awayIds },
    players: [...homeIds.map((id, index) => profile(id, homeTeamId, index, true)), ...awayIds.map((id, index) => profile(id, awayTeamId, index, false))],
    initialPlayerPositions: [...homeIds.map((playerId, index) => ({ playerId, position: homeSpots[index]! })), ...awayIds.map((playerId, index) => ({ playerId, position: awaySpots[index]! }))],
    tacticalPlans: { home: emptyPlan, away: emptyPlan },
    defensiveMatchupOverrides: {
      home: homeIds.map((playerId, index) => ({ playerId, opponentPlayerId: awayIds[index]! })),
      away: awayIds.map((playerId, index) => ({ playerId, opponentPlayerId: homeIds[index]! })),
    },
    matchSeed: 20260926,
  }
}

function scenarioStart(name: ScenarioName, setup: MatchSetup): ScenarioStart {
  let scenarioSetup = setup
  if (name === 'F' || name === 'G') {
    const handlerId = setup.initialLineups.home[1]!
    const shootingScenario = name === 'F'
    scenarioSetup = {
      ...setup,
      players: setup.players.map((profile) => profile.playerId === handlerId
        ? {
            ...profile,
            offense: { ...profile.offense, rimAttack: shootingScenario ? 42 : 38, shooting: shootingScenario ? 100 : 42, creation: shootingScenario ? 48 : 40 },
          }
        : profile),
      initialPlayerPositions: setup.initialPlayerPositions?.map((entry) => entry.playerId === handlerId
        ? { ...entry, position: shootingScenario ? { x: 22, y: 7.5 } : entry.position }
        : entry.playerId === setup.initialLineups.away[1] && shootingScenario
          ? { ...entry, position: { x: 23.5, y: 7.85 } }
          : entry),
    }
  }
  let initial = createMatchState(scenarioSetup)
  if (name === 'E') initial = { ...initial, period: 3, events: initial.events.map((event) => ({ ...event, period: 3 })) }
  let state = tick(initial)
  state = applyCommand(state, { type: 'startInbound', teamId: scenarioSetup.homeTeamId, inbounderPlayerId: scenarioSetup.initialLineups.home[0]!, reason: 'periodStart' })
  state = tick(state)
  state = applyCommand(state, { type: 'releaseInbound', receiverPlayerId: scenarioSetup.initialLineups.home[1]!, passKind: 'chest', travelTicks: 4 })
  for (let index = 0; index < 320 && activePossession(state)?.phase !== 'SETUP'; index += 1) state = tick(state)
  if (name === 'D') for (let index = 0; index < 24; index += 1) state = tick(state)

  if (name === 'B') {
    const receiver = state.offensiveStructure?.assignments.find((item) => item.slot === 'WEAK_SLOT')?.playerId
    return receiver
      ? { state, commands: [schedulePerimeterPass(state, receiver)], description: 'B · Pase al lado débil: el defensor del handler pasa a GAP/HELP y el asignado al receptor toma ON_BALL; los cinco emparejamientos permanecen fijos.' }
      : { state, commands: [], description: 'B · No hay receptor de lado débil disponible.' }
  }
  if (name === 'C') {
    const handlerId = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null
    const receiver = state.offensiveStructure?.assignments.filter((item) => item.playerId !== handlerId)
      .sort((left, right) => distanceBetween(state.players.find((player) => player.playerId === right.playerId)!.position, state.ball.position)
        - distanceBetween(state.players.find((player) => player.playerId === left.playerId)!.position, state.ball.position))[0]?.playerId
    return receiver
      ? { state, commands: [schedulePerimeterPass(state, receiver)], description: 'C · Skip pass to the far side: weak-side HELP reacts to the live ball and moves through MatchState kinematics.' }
      : { state, commands: [], description: 'C · No far-side receiver is available.' }
  }
  if (name === 'D') {
    const helperId = state.responsibilities.find((item) => item.owner === 'defensiveStructure' && item.kind === 'HELP')?.playerId
    const helperAssignment = state.defensiveStructure?.assignments.find((item) => item.defenderPlayerId === helperId)
    const handlerId = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null
    const helperMan = helperAssignment && state.players.find((player) => player.playerId === helperAssignment.attackerPlayerId)
    const receiver = helperMan && state.offensiveStructure
      ? state.offensiveStructure.assignments.filter((item) => item.playerId !== helperAssignment!.attackerPlayerId && item.playerId !== handlerId)
        .sort((left, right) => distanceBetween(state.players.find((player) => player.playerId === left.playerId)!.position, helperMan.position) - distanceBetween(state.players.find((player) => player.playerId === right.playerId)!.position, helperMan.position))[0]?.playerId
      : undefined
    return {
      state,
      commands: receiver ? [schedulePerimeterPass(state, receiver)] : [],
      description: 'D · Pase que acerca el balón al hombre asignado a la ayuda: sigue HELP → RECOVER → GAP con movimiento físico.',
    }
  }
  const actionScenario = name === 'E' || name === 'F' || name === 'G' || name === 'VERTICAL SLICE'
  if (actionScenario) {
    for (let index = 0; index < 24; index += 1) state = tick(state)
    state = { ...state, autonomousActions: true }
  }
  const description = name === 'E'
    ? 'E - Drive, help, kick-out, catch, closeout, catch-and-shoot and shot resolution from live MatchState.'
    : name === 'VERTICAL SLICE'
      ? 'Vertical Slice - Main reference: drive, help, kick-out, physical pass and catch, closeout, catch-and-shoot and shot resolution.'
      : name === 'F'
        ? 'F - Shooting decision under a live defender. Watch the actual contest, shot probability, flight and result.'
        : name === 'G'
          ? 'G - Ordinary PASS decision. Watch the passing lane, physical catch, defensive reassignment and next live decision.'
          : 'A - Five recognizable MAN assignments while players are still moving into the 5OUT structure. Select defenders to inspect assignment and movement intent.'
  return { state, commands: [], description }
}

function schedulePerimeterPass(state: MatchState, receiverPlayerId: MatchState['players'][number]['playerId']): ScheduledCommand {
  const target = tickMany(state, 4).players.find((player) => player.playerId === receiverPlayerId)!.position
  return {
    atT: state.t + 1,
    command: { type: 'releasePass', command: { receiverPlayerId, target: { ...target }, passKind: 'chest', travelTicks: 4 } },
  }
}

function tickMany(state: MatchState, count: number): MatchState {
  let current = state
  for (let index = 0; index < count; index += 1) current = tick(current)
  return current
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
  const [scenario, setScenario] = useState<ScenarioName>('A')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(setup.initialLineups.away[0]!)
  const [description, setDescription] = useState(() => scenarioStart('A', setup).description)
  const [script, setScript] = useState<readonly ScheduledCommand[]>([])
  const [simulation, setSimulation] = useState(() => {
    const initial = scenarioStart('A', setup)
    return { state: initial.state, history: [initial.state] as readonly MatchState[] }
  })
  const [playing, setPlaying] = useState(false)
  const [resumeResult, setResumeResult] = useState<'PASS' | 'FAIL' | null>(null)

  const chooseScenario = (name: ScenarioName) => {
    const initial = scenarioStart(name, setup)
    setPlaying(false)
    setScenario(name)
    setScript(initial.commands)
    setSelectedPlayerId(setup.initialLineups.away[0]!)
    setDescription(initial.description)
    setResumeResult(null)
    setSimulation({ state: initial.state, history: [initial.state] })
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

  const checkSerializedResume = () => {
    let uninterrupted = simulation.state
    let resumed = JSON.parse(JSON.stringify(simulation.state)) as MatchState
    for (let index = 0; index < 40; index += 1) {
      uninterrupted = tick(uninterrupted)
      resumed = tick(resumed)
    }
    setResumeResult(JSON.stringify(uninterrupted) === JSON.stringify(resumed) ? 'PASS' : 'FAIL')
  }

  const { state, history } = simulation
  const frame = toFrame(state)
  const court = setup.court
  const selectedTick = Math.max(0, history.findIndex((entry) => entry === state))
  const possession = activePossession(state)
  const selected = frame.players.find((player) => player.playerId === selectedPlayerId) ?? frame.players[0]
  const selectedMan = selected?.assignment ? frame.players.find((player) => player.playerId === selected.assignment?.attackerPlayerId) : undefined
  const selectedManDistance = selectedMan && selected ? distanceBetween(selected.position, selectedMan.position) : null
  const selectedBallDistance = selected ? distanceBetween(selected.position, frame.ball.position) : null
  const selectedBasketSide = selectedMan && selected && frame.defensiveStructure
    ? ((frame.defensiveStructure.defendedBasket.x - selectedMan.position.x) * (selected.position.x - selectedMan.position.x)
      + (frame.defensiveStructure.defendedBasket.y - selectedMan.position.y) * (selected.position.y - selectedMan.position.y)) >= 0 ? 'basket side' : 'behind man'
    : 'n/a'
  const ballRadius = 0.2 + Math.min(0.15, frame.ball.heightMeters * 0.04)
  const activeOffensiveAction = [...frame.actions].reverse().find((action) => action.status === 'ACTIVE' && action.kind !== 'CLOSEOUT')
  const closeoutAction = [...frame.actions].reverse().find((action) => action.kind === 'CLOSEOUT' && action.status === 'ACTIVE')
  const latestShotAction = [...frame.actions].reverse().find((action) => action.kind === 'SHOOT' || action.kind === 'CATCH_AND_SHOOT')
  const driveTarget = activeOffensiveAction?.kind === 'DRIVE' ? activeOffensiveAction.target : undefined
  const closeoutDefender = closeoutAction && frame.players.find((player) => player.playerId === closeoutAction.playerId)
  const closeoutShooter = closeoutAction?.targetPlayerId && frame.players.find((player) => player.playerId === closeoutAction.targetPlayerId)
  return <main style={{ minHeight: '100vh', background: '#101820', color: '#ecf1f4', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
    <h1 style={{ marginTop: 0 }}>Match Next · Actions and Defense Debug</h1>
    <p>{description}</p>
    <div aria-label="Match state" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 8, maxWidth: 1100, marginBottom: 16 }}>
      <span>Ball: <strong>{frame.ball.kind}{frame.ball.ownerPlayerId ? ` · ${frame.ball.ownerPlayerId}` : ''}</strong></span>
      <span>Possession: <strong>{possession?.phase ?? 'none'} · {possession?.id ?? 'none'}</strong></span>
      <span>Formation: <strong>{frame.offensiveStructure?.formation ?? 'none'}</strong></span>
      <span>Ball side: <strong>{frame.offensiveStructure?.ballSide ?? 'none'}</strong></span>
      <span>Defense: <strong>{frame.defensiveStructure?.scheme ?? 'none'} · {frame.defensiveStructure?.assignments.length ?? 0} assignments</strong></span>
      <span>ON_BALL defender: <strong>{frame.defensiveStructure?.onBallDefenderPlayerId ?? 'none'}</strong></span>
      <span>HELP defenders: <strong>{frame.defensiveStructure?.helpDefenderPlayerIds.join(', ') || 'none'}</strong></span>
      <span>Game clock: <strong>{(frame.gameClock / 10).toFixed(1)}s</strong></span>
      <span>Shot clock: <strong>{frame.shotClock === null ? '--' : `${(frame.shotClock / 10).toFixed(1)}s`}</strong></span>
      <span>Period / tick: <strong>{frame.period} / {frame.t}</strong></span>
      <span>Score: <strong>{frame.score.home}-{frame.score.away}</strong></span>
    </div>
    <svg viewBox={`0 0 ${court.lengthMeters} ${court.widthMeters}`} role="img" aria-label="Match Next court showing player movement, facing, and target vectors" style={{ display: 'block', width: 'min(100%, 1100px)', background: '#ca8b50', border: '4px solid #f5ead4' }}>
      <rect x="0.3" y="0.3" width={court.lengthMeters - 0.6} height={court.widthMeters - 0.6} fill="none" stroke="#fff1da" strokeWidth="0.12" />
      <line x1={court.lengthMeters / 2} y1="0" x2={court.lengthMeters / 2} y2={court.widthMeters} stroke="#fff1da" strokeWidth="0.1" />
      <circle cx={court.lengthMeters / 2} cy={court.widthMeters / 2} r="1.8" fill="none" stroke="#fff1da" strokeWidth="0.1" />
      <circle cx={court.baskets.left.x} cy={court.baskets.left.y} r="1.8" fill="none" stroke="#fff1da" strokeWidth="0.1" />
      <circle cx={court.baskets.right.x} cy={court.baskets.right.y} r="1.8" fill="none" stroke="#fff1da" strokeWidth="0.1" />
      {frame.offensiveStructure?.slots.map((slot) => <g key={slot.slot}>
        <circle cx={slot.position.x} cy={slot.position.y} r="0.22" fill="none" stroke="#f7edaf" strokeWidth="0.08" strokeDasharray="0.12 0.08" />
        <text x={slot.position.x} y={slot.position.y - 0.38} textAnchor="middle" fill="#fff8dc" fontSize="0.32">{slot.slot.replace('_', ' ')}</text>
      </g>)}
      {frame.ball.flight && <line x1={frame.ball.flight.from.x} y1={frame.ball.flight.from.y} x2={frame.ball.flight.target.x} y2={frame.ball.flight.target.y} stroke="#312115" strokeWidth="0.07" strokeDasharray="0.25 0.25" opacity="0.7" />}
      {driveTarget && <g aria-label="Drive target"><circle cx={driveTarget.x} cy={driveTarget.y} r="0.5" fill="none" stroke="#ff3bd4" strokeWidth="0.12" /><text x={driveTarget.x} y={driveTarget.y - 0.62} textAnchor="middle" fill="#ffb8f0" fontSize="0.3">DRIVE</text></g>}
      {closeoutDefender && closeoutShooter && <line x1={closeoutDefender.position.x} y1={closeoutDefender.position.y} x2={closeoutShooter.position.x} y2={closeoutShooter.position.y} stroke="#ff3bd4" strokeWidth="0.16" opacity="0.95" />}
      {frame.players.map((player, index) => {
        const isHome = player.teamId === setup.homeTeamId
        const isSelected = player.playerId === selected?.playerId
        const isOnBallDefender = frame.defensiveStructure?.onBallDefenderPlayerId === player.playerId
        const intent = player.intent
        const assignedAttacker = player.assignment ? frame.players.find((candidate) => candidate.playerId === player.assignment!.attackerPlayerId) : undefined
        return <g key={player.playerId} onClick={() => setSelectedPlayerId(player.playerId)} style={{ cursor: 'pointer' }}>
          {!isHome && assignedAttacker && <line x1={player.position.x} y1={player.position.y} x2={assignedAttacker.position.x} y2={assignedAttacker.position.y} stroke={isOnBallDefender ? '#fff284' : '#ffe6dc'} strokeWidth={isOnBallDefender ? 0.12 : 0.055} strokeDasharray={isOnBallDefender ? 'none' : '0.18 0.15'} opacity={isOnBallDefender ? 0.95 : 0.45} />}
          {intent && <line x1={player.position.x} y1={player.position.y} x2={intent.target.x} y2={intent.target.y} stroke={isHome ? '#ffffff' : '#8ff4ed'} strokeWidth={isSelected ? 0.1 : 0.055} strokeDasharray="0.2 0.18" opacity={0.65} />}
          <line x1={player.position.x} y1={player.position.y} x2={player.position.x + player.velocity.x * 0.28} y2={player.position.y + player.velocity.y * 0.28} stroke="#27f4e5" strokeWidth="0.08" opacity="0.8" />
          <line x1={player.position.x} y1={player.position.y} x2={player.position.x + player.facing.x * 0.8} y2={player.position.y + player.facing.y * 0.8} stroke="#fff284" strokeWidth="0.06" opacity="0.8" />
          {isOnBallDefender && <circle cx={player.position.x} cy={player.position.y} r="0.66" fill="none" stroke="#fff284" strokeWidth="0.13" />}
          <circle cx={player.position.x} cy={player.position.y} r={isSelected ? 0.52 : 0.42} fill={isHome ? '#153d72' : '#922638'} stroke={isSelected ? '#fff284' : 'white'} strokeWidth={isSelected ? 0.16 : 0.08} />
          <text x={player.position.x} y={player.position.y + 0.12} textAnchor="middle" fill="white" fontSize="0.32">{index < 5 ? index + 1 : index - 4}</text>
          {!isHome && <text x={player.position.x} y={player.position.y - 0.55} textAnchor="middle" fill={isOnBallDefender ? '#fff284' : '#ffffff'} fontSize="0.25">{player.responsibility?.kind ?? 'ASSIGNED'}</text>}
        </g>
      })}
      <circle cx={frame.ball.position.x} cy={frame.ball.position.y} r={ballRadius} fill={frame.ball.kind === 'DEAD' ? '#523b2b' : '#f6de7e'} stroke="white" strokeWidth="0.08" />
    </svg>
    <p style={{ maxWidth: 1100, color: '#c8d0d6' }}>Línea roja clara: asignación defensor → hombre. Amarillo: ON_BALL. Línea punteada de cada jugador: target de intent; cian: velocidad; amarillo corto: facing.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 16 }}>
      {(['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const).map((name) => <button key={name} onClick={() => chooseScenario(name)} aria-pressed={scenario === name}>Scenario {name}</button>)}
      <button onClick={() => chooseScenario('VERTICAL SLICE')} aria-pressed={scenario === 'VERTICAL SLICE'}>Vertical Slice</button>
      <button onClick={() => setPlaying(false)}>Pause</button>
      <button onClick={() => setPlaying(true)}>Play</button>
      <button onClick={step}>Step 0.1s</button>
      <input aria-label="Simulation history" type="range" min="0" max={Math.max(0, history.length - 1)} value={selectedTick} onChange={(event) => { setPlaying(false); const selectedState = history[Number(event.target.value)]; if (selectedState) setSimulation((current) => ({ ...current, state: selectedState })) }} style={{ width: 300 }} />
      <span>{history.length} snapshots</span>
      {scenario === 'E' && <button onClick={checkSerializedResume}>Check JSON resume</button>}
      {resumeResult && <strong aria-live="polite">Serialization: {resumeResult}</strong>}
    </div>
    <section aria-label="Action inspector" style={{ marginTop: 20, background: '#1b2832', padding: 16, maxWidth: 1100, borderRadius: 6 }}>
      <h2 style={{ marginTop: 0 }}>Live action</h2>
      <div>Ball handler: <strong>{frame.ball.ownerPlayerId ?? '--'}</strong> | Decision: <strong>{frame.currentDecision?.kind ?? '--'}{frame.currentDecision ? ` (${frame.currentDecision.reason})` : ''}</strong></div>
      <div>Action: <strong>{activeOffensiveAction ? `${activeOffensiveAction.kind} / ${activeOffensiveAction.phase ?? 'active'}` : '--'}</strong> | Defender: <strong>{frame.defensiveStructure?.onBallDefenderPlayerId ?? '--'}</strong> | Help: <strong>{activeOffensiveAction?.helpDefenderPlayerId ?? (frame.defensiveStructure?.helpDefenderPlayerIds.join(', ') || '--')}</strong></div>
      <div>Drive target: <strong>{driveTarget ? `${driveTarget.x.toFixed(2)}, ${driveTarget.y.toFixed(2)} m` : '--'}</strong> | Passing lane: <strong>{frame.ball.flight?.kind === 'pass' ? `${frame.ball.flight.from.x.toFixed(1)}, ${frame.ball.flight.from.y.toFixed(1)} -> ${frame.ball.flight.target.x.toFixed(1)}, ${frame.ball.flight.target.y.toFixed(1)} m` : '--'}</strong></div>
      <div>Closeout: <strong>{closeoutAction ? `${closeoutAction.playerId} -> ${closeoutAction.targetPlayerId} (${closeoutAction.contestScore?.toFixed(2) ?? 'moving'})` : '--'}</strong> | Contest: <strong>{frame.ball.contestScore?.toFixed(2) ?? latestShotAction?.contestScore?.toFixed(2) ?? '--'}</strong> | Shot probability: <strong>{frame.ball.shotProbability?.toFixed(3) ?? latestShotAction?.shotProbability?.toFixed(3) ?? '--'}</strong> | Outcome: <strong>{latestShotAction?.outcome ?? '--'}</strong></div>
    </section>
    <section aria-label="Player inspector" style={{ marginTop: 20, background: '#1b2832', padding: 16, maxWidth: 1100, borderRadius: 6 }}>
      <h2 style={{ marginTop: 0 }}>Player inspector</h2>
      <label>Player <select value={selected?.playerId ?? ''} onChange={(event) => setSelectedPlayerId(event.target.value)}>{frame.players.map((player) => <option key={player.playerId} value={player.playerId}>{player.playerId}</option>)}</select></label>
      {selected && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
        <div><strong>Position / motion</strong><div>Position: {selected.position.x.toFixed(2)}, {selected.position.y.toFixed(2)} m</div><div>Velocity: {selected.velocity.x.toFixed(2)}, {selected.velocity.y.toFixed(2)} m/s (current speed {Math.hypot(selected.velocity.x, selected.velocity.y).toFixed(2)})</div><div>Profile max / acceleration / braking: {selected.kinematics.maxSpeedMps.toFixed(1)} / {selected.kinematics.accelerationMps2.toFixed(1)} / {selected.kinematics.brakingMps2.toFixed(1)}</div><div>Facing: {selected.facing.x.toFixed(2)}, {selected.facing.y.toFixed(2)}</div></div>
        <div><strong>Responsibility</strong><div>{selected.responsibility?.kind ?? 'none'}{selected.responsibility?.slot ? ` · ${selected.responsibility.slot}` : ''}</div><div>{selected.responsibility?.id ?? '--'} · {selected.responsibility?.owner ?? '--'}</div><div>{selected.responsibility?.reason ?? 'No offensive responsibility'}</div><div>Since tick {selected.responsibility?.startedT ?? '--'}</div></div>
        <div><strong>Decision and movement intent</strong><div>{selected.decision?.kind ?? 'none'} · {selected.decision?.reason ?? '--'}</div><div>Target: {selected.intent ? `${selected.intent.target.x.toFixed(2)}, ${selected.intent.target.y.toFixed(2)} m` : '--'}</div><div>Urgency: {selected.intent?.urgency ?? '--'} · facing {selected.intent?.facing.kind ?? '--'}</div><div>Provenance: {selected.intent?.provenance.owner ?? '--'} / {selected.intent?.provenance.decisionId ?? '--'} / {selected.intent?.provenance.responsibilityId ?? '--'}</div><div>Distance to target: {selected.intent ? `${distanceBetween(selected.position, selected.intent.target).toFixed(2)} m` : '--'}</div></div>
      </div>}
      {selected?.assignment && selectedMan && <div aria-label="Defensive player inspector" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 12, marginTop: 16, paddingTop: 12, borderTop: '1px solid #43515c' }}>
        <div><strong>DEFENDER / ASSIGNMENT</strong><div>Assigned attacker: {selected.assignment.attackerPlayerId}</div><div>Assignment source: {selected.assignment.source} · since tick {selected.assignment.startedT}</div><div>Distance to assigned man: {selectedManDistance?.toFixed(2)} m</div><div>Basket relation: {selectedBasketSide}</div></div>
        <div><strong>DEFENSIVE STRUCTURE</strong><div>Responsibility: {selected.responsibility?.kind ?? 'none'}</div><div>Decision: {selected.decision?.kind ?? 'none'}</div><div>Ball distance: {selectedBallDistance?.toFixed(2)} m</div><div>Target: {selected.intent ? `${selected.intent.target.x.toFixed(2)}, ${selected.intent.target.y.toFixed(2)} m` : 'none'}</div></div>
        <div><strong>INTENT / PROVENANCE</strong><div>Urgency: {selected.intent?.urgency ?? 'none'} · facing {selected.intent?.facing.kind ?? 'none'}</div><div>Owner: {selected.intent?.provenance.owner ?? 'none'}</div><div>Assignment → responsibility → decision → intent</div><div>{selected.assignment.source} → {selected.responsibility?.id ?? 'none'} → {selected.decision?.id ?? 'none'} → {selected.intent?.playerId ?? 'none'}</div></div>
      </div>}
      <p>Structure: {frame.offensiveStructure ? `${frame.offensiveStructure.formation} · ${frame.offensiveStructure.assignments.find((item) => item.playerId === selected?.playerId)?.slot ?? 'no slot'}` : 'none'}. Actions and outcomes come from MatchState.</p>
    </section>
  </main>
}
