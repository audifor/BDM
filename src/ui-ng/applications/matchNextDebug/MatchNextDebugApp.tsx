import { useEffect, useMemo, useState } from 'react'
import type { CourtPosition } from '@/domain/court'
import { createCourtGeometry, distanceBetween } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { activePossession, applyCommand, createMatchState, resolveFiveOutTargets, TARGET_ARRIVAL_SPEED_MPS, TARGET_ARRIVAL_TOLERANCE_METERS, tick, toFrame, type MatchNextCommand, type MatchSetup, type MatchState } from '@/engine/match-next'

type ScenarioName = 'A' | 'B' | 'C' | 'D' | 'E'
interface ScheduledCommand { readonly atT: number; readonly command: MatchNextCommand }
interface ScenarioStart { readonly state: MatchState; readonly commands: readonly ScheduledCommand[]; readonly description: string }
interface AthleticProfileObservation {
  readonly playerId: string
  readonly label: string
  readonly slot: string
  readonly profile: MatchState['players'][number]['kinematics']
  readonly startDistanceMeters: number
  readonly peakSpeedMps: number
  readonly peakAccelerationMps2: number
  readonly peakBrakingMps2: number
  readonly distanceToTargetMeters: number
  readonly arrivalSeconds: number | null
}

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
    offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 50 },
    passing: { accuracy: 50, vision: 50, timing: 50 },
    defense: { pointOfAttack: 50, interior: 50, mobility: 50, steal: 50 }, rebounding: { impact: 50 },
  })
  const emptyPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }
  const homeSpots: readonly CourtPosition[] = [{ x: 14, y: 7.5 }, { x: 10.5, y: 7.5 }, { x: 8.5, y: 3.2 }, { x: 8.5, y: 11.8 }, { x: 10, y: 5.2 }]
  const awaySpots: readonly CourtPosition[] = [{ x: 27, y: 7.5 }, { x: 25.5, y: 3.2 }, { x: 25.5, y: 11.8 }, { x: 23, y: 5.2 }, { x: 23, y: 9.8 }]
  return {
    gameId: gameIdFromString('match-next-debug-game'), homeTeamId, awayTeamId,
    court: createCourtGeometry('FIBA'),
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24, offensiveReboundShotClockSeconds: null },
    homeSquad: homeIds, awaySquad: awayIds, initialLineups: { home: homeIds, away: awayIds },
    players: [...homeIds.map((id, index) => profile(id, homeTeamId, index, true)), ...awayIds.map((id, index) => profile(id, awayTeamId, index, false))],
    initialPlayerPositions: [...homeIds.map((playerId, index) => ({ playerId, position: homeSpots[index]! })), ...awayIds.map((playerId, index) => ({ playerId, position: awaySpots[index]! }))],
    tacticalPlans: { home: emptyPlan, away: emptyPlan }, defensiveMatchupOverrides: { home: [], away: [] }, matchSeed: 20260926,
  }
}

function athleticismSetup(setup: MatchSetup): MatchSetup {
  const profiles = [
    { maxSpeedMps: 5.2, accelerationMps2: 2.6, brakingMps2: 3.4 },
    { maxSpeedMps: 5.7, accelerationMps2: 3.0, brakingMps2: 4.0 },
    { maxSpeedMps: 6.2, accelerationMps2: 4.0, brakingMps2: 5.0 },
    { maxSpeedMps: 4.8, accelerationMps2: 2.3, brakingMps2: 3.0 },
    { maxSpeedMps: 5.9, accelerationMps2: 3.4, brakingMps2: 4.4 },
  ] as const
  const inbounder = setup.initialLineups.home[0]!
  const receiver = setup.initialLineups.home[1]!
  const receiverPosition = { x: 17.5, y: setup.court.widthMeters / 2 }
  const targets = resolveFiveOutTargets(setup.court, receiverPosition, setup.court.baskets.right, 'BOTTOM')
  const spacePlayers = setup.initialLineups.home.filter((playerId) => playerId !== receiver)
  const targetBySlot = new Map(targets.map((item) => [item.slot, item.position]))
  const inboundPosition = { x: setup.court.lengthMeters / 2, y: setup.court.widthMeters / 2 }
  const commonDistance = distanceBetween(inboundPosition, targetBySlot.get('STRONG_SLOT')!)
  const scenarioSlots = ['STRONG_SLOT', 'STRONG_CORNER', 'WEAK_SLOT', 'WEAK_CORNER'] as const
  const startPositions = new Map(spacePlayers.map((playerId, index) => {
    if (playerId === inbounder) return [playerId, inboundPosition] as const
    const target = targetBySlot.get(scenarioSlots[index]!)!
    return [playerId, { x: target.x - commonDistance, y: target.y }] as const
  }))
  return {
    ...setup,
    players: setup.players.map((player) => {
      const homeIndex = setup.initialLineups.home.indexOf(player.playerId)
      return homeIndex < 0 ? player : { ...player, kinematics: { ...profiles[homeIndex]! } }
    }),
    initialPlayerPositions: setup.initialPlayerPositions?.map((item) => ({
      playerId: item.playerId,
      position: item.playerId === receiver ? receiverPosition : startPositions.get(item.playerId) ?? item.position,
    })),
  }
}

function scenarioStart(name: ScenarioName, setup: MatchSetup): ScenarioStart {
  const scenarioSetup = name === 'C' ? athleticismSetup(setup) : setup
  const initial = createMatchState(scenarioSetup)
  const home = scenarioSetup.homeTeamId
  const inbounder = scenarioSetup.initialLineups.home[0]!
  const receiver = scenarioSetup.initialLineups.home[1]!
  const commands: ScheduledCommand[] = [
    { atT: 1, command: { type: 'startInbound', teamId: home, inbounderPlayerId: inbounder, reason: 'periodStart' } },
    { atT: 2, command: { type: 'releaseInbound', receiverPlayerId: receiver, passKind: 'chest', travelTicks: 4 } },
  ]
  let warmState = initial
  for (const item of commands) {
    while (warmState.t < item.atT) warmState = tick(warmState)
    warmState = applyCommand(warmState, item.command)
  }
  if (name === 'B') {
    while (warmState.t < 150) warmState = tick(warmState)
    const structure = warmState.offensiveStructure
    const targetPlayer = structure?.assignments.find((item) => item.slot === 'WEAK_SLOT')?.playerId
    const targetPosition = warmState.players.find((player) => player.playerId === targetPlayer)?.position
    if (!targetPlayer || !targetPosition || warmState.ball.kind !== 'HELD') return { state: warmState, commands: [], description: 'B · Structure did not reach a pass-ready state.' }
    return {
      state: warmState,
      commands: [{ atT: warmState.t + 1, command: { type: 'releasePass', command: { receiverPlayerId: targetPlayer, target: { ...targetPosition }, passKind: 'chest', travelTicks: 3 } } }],
      description: 'B · Scripted opposite-side pass. The former handler moves to the nearest point on the three-point arc; the other three spacers keep their physical lanes.',
    }
  }
  if (name === 'C') {
    // Stop just before the legal inbound receipt starts live player movement.
    // Playing from here exposes controlled, equal-distance runs in MatchState.
    while (warmState.t < 5) warmState = tick(warmState)
    return { state: warmState, commands: [], description: 'C · Play through the inbound catch. Four players cover the same 6.3 m target distance; readings below come from 0.1 s MatchState ticks.' }
  }
  const description = name === 'A' ? 'A · Legal inbound, physical advance, and 5OUT settling.'
    : name === 'D' ? 'D · Watch acceleration, controlled braking, and slot arrival.'
      : 'E · Mid-movement state for deterministic JSON resume.'
  if (name === 'D' || name === 'E') while (warmState.t < 20) warmState = tick(warmState)
  return { state: warmState, commands: [], description }
}

function observeAthleticProfiles(history: readonly MatchState[]): readonly AthleticProfileObservation[] {
  const firstStructure = history.find((item) => item.offensiveStructure !== null)?.offensiveStructure
  if (!firstStructure) return []
  return firstStructure.assignments.filter((item) => item.slot !== 'BALL').map((assignment) => {
    const samples = history.map((item) => ({
      t: item.t,
      player: item.players.find((candidate) => candidate.playerId === assignment.playerId)!,
      intent: item.movementIntents.find((candidate) => candidate.playerId === assignment.playerId),
    }))
    let peakSpeedMps = 0
    let peakAccelerationMps2 = 0
    let peakBrakingMps2 = 0
    for (let index = 0; index < samples.length; index += 1) {
      const current = samples[index]!
      const speed = Math.hypot(current.player.velocity.x, current.player.velocity.y)
      if (current.intent) peakSpeedMps = Math.max(peakSpeedMps, speed)
      if (index === 0 || !current.intent) continue
      const previous = samples[index - 1]!
      const elapsedSeconds = (current.t - previous.t) * 0.1
      if (elapsedSeconds <= 0) continue
      const previousSpeed = Math.hypot(previous.player.velocity.x, previous.player.velocity.y)
      peakAccelerationMps2 = Math.max(peakAccelerationMps2, (speed - previousSpeed) / elapsedSeconds)
      peakBrakingMps2 = Math.max(peakBrakingMps2, (previousSpeed - speed) / elapsedSeconds)
    }
    const current = samples.at(-1)!
    const distanceToTargetMeters = current.intent ? distanceBetween(current.player.position, current.intent.target) : 0
    const firstIntent = samples.find((sample) => sample.intent)?.intent
    const initialPlayer = history[0]!.players.find((player) => player.playerId === assignment.playerId)!
    const arrival = samples.find((sample) => sample.intent
      && distanceBetween(sample.player.position, sample.intent.target) <= TARGET_ARRIVAL_TOLERANCE_METERS
      && Math.hypot(sample.player.velocity.x, sample.player.velocity.y) <= TARGET_ARRIVAL_SPEED_MPS)
    const homeIndex = history[0]!.players.findIndex((player) => player.playerId === assignment.playerId)
    return {
      playerId: assignment.playerId,
      label: `Home ${homeIndex + 1}`,
      slot: assignment.slot,
      profile: current.player.kinematics,
      startDistanceMeters: firstIntent ? distanceBetween(initialPlayer.position, firstIntent.target) : 0,
      peakSpeedMps,
      peakAccelerationMps2: Math.max(0, peakAccelerationMps2),
      peakBrakingMps2: Math.max(0, peakBrakingMps2),
      distanceToTargetMeters,
      arrivalSeconds: arrival ? (arrival.t - history[0]!.t) * 0.1 : null,
    }
  })
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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [description, setDescription] = useState('A · Legal inbound, physical advance, and 5OUT settling.')
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
  const athleticProfiles = scenario === 'C' ? observeAthleticProfiles(history.slice(0, selectedTick + 1)) : []
  const possession = activePossession(state)
  const selected = frame.players.find((player) => player.playerId === selectedPlayerId) ?? frame.players[0]
  const ballRadius = 0.2 + Math.min(0.15, frame.ball.heightMeters * 0.04)
  return <main style={{ minHeight: '100vh', background: '#101820', color: '#ecf1f4', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
    <h1 style={{ marginTop: 0 }}>Match Next · Movement &amp; 5OUT Debug</h1>
    <p>{description}</p>
    <div aria-label="Match state" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 8, maxWidth: 1100, marginBottom: 16 }}>
      <span>Ball: <strong>{frame.ball.kind}{frame.ball.ownerPlayerId ? ` · ${frame.ball.ownerPlayerId}` : ''}</strong></span>
      <span>Possession: <strong>{possession?.phase ?? 'none'} · {possession?.id ?? 'none'}</strong></span>
      <span>Formation: <strong>{frame.offensiveStructure?.formation ?? 'none'}</strong></span>
      <span>Ball side: <strong>{frame.offensiveStructure?.ballSide ?? 'none'}</strong></span>
      <span>Game clock: <strong>{(frame.gameClock / 10).toFixed(1)}s</strong></span>
      <span>Shot clock: <strong>{frame.shotClock === null ? '—' : `${(frame.shotClock / 10).toFixed(1)}s`}</strong></span>
      <span>Period / tick: <strong>{frame.period} / {frame.t}</strong></span>
      <span>Score: <strong>{frame.score.home}–{frame.score.away}</strong></span>
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
      {frame.players.map((player, index) => {
        const isHome = player.teamId === setup.homeTeamId
        const isSelected = player.playerId === selected?.playerId
        const intent = player.intent
        return <g key={player.playerId} onClick={() => setSelectedPlayerId(player.playerId)} style={{ cursor: 'pointer' }}>
          {isHome && intent && <line x1={player.position.x} y1={player.position.y} x2={intent.target.x} y2={intent.target.y} stroke="#fff" strokeWidth="0.06" strokeDasharray="0.2 0.18" opacity="0.55" />}
          {isHome && <line x1={player.position.x} y1={player.position.y} x2={player.position.x + player.velocity.x * 0.28} y2={player.position.y + player.velocity.y * 0.28} stroke="#27f4e5" strokeWidth="0.1" />}
          {isHome && <line x1={player.position.x} y1={player.position.y} x2={player.position.x + player.facing.x * 0.8} y2={player.position.y + player.facing.y * 0.8} stroke="#fff284" strokeWidth="0.08" />}
          <circle cx={player.position.x} cy={player.position.y} r={isSelected ? 0.52 : 0.42} fill={isHome ? '#153d72' : '#922638'} stroke={isSelected ? '#fff284' : 'white'} strokeWidth={isSelected ? 0.16 : 0.08} />
          <text x={player.position.x} y={player.position.y + 0.12} textAnchor="middle" fill="white" fontSize="0.32">{index < 5 ? index + 1 : index - 4}</text>
        </g>
      })}
      <circle cx={frame.ball.position.x} cy={frame.ball.position.y} r={ballRadius} fill={frame.ball.kind === 'DEAD' ? '#523b2b' : '#f6de7e'} stroke="white" strokeWidth="0.08" />
    </svg>
    <p style={{ maxWidth: 1100, color: '#c8d0d6' }}>Offense: dashed line = intent target, cyan = velocity, yellow = facing. The five away players are static placeholders and do not defend.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 16 }}>
      {(['A', 'B', 'C', 'D', 'E'] as const).map((name) => <button key={name} onClick={() => chooseScenario(name)} aria-pressed={scenario === name}>Scenario {name}</button>)}
      <button onClick={() => setPlaying(false)}>Pause</button>
      <button onClick={() => setPlaying(true)}>Play</button>
      <button onClick={step}>Step 0.1s</button>
      <input aria-label="Simulation history" type="range" min="0" max={Math.max(0, history.length - 1)} value={selectedTick} onChange={(event) => { setPlaying(false); const selectedState = history[Number(event.target.value)]; if (selectedState) setSimulation((current) => ({ ...current, state: selectedState })) }} style={{ width: 300 }} />
      <span>{history.length} snapshots</span>
      {scenario === 'E' && <button onClick={checkSerializedResume}>Check JSON resume</button>}
      {resumeResult && <strong aria-live="polite">Serialization: {resumeResult}</strong>}
    </div>
    <section aria-label="Player inspector" style={{ marginTop: 20, background: '#1b2832', padding: 16, maxWidth: 1100, borderRadius: 6 }}>
      <h2 style={{ marginTop: 0 }}>Player inspector</h2>
      <label>Player <select value={selected?.playerId ?? ''} onChange={(event) => setSelectedPlayerId(event.target.value)}>{frame.players.map((player) => <option key={player.playerId} value={player.playerId}>{player.playerId}</option>)}</select></label>
      {selected && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
        <div><strong>Position / motion</strong><div>Position: {selected.position.x.toFixed(2)}, {selected.position.y.toFixed(2)} m</div><div>Velocity: {selected.velocity.x.toFixed(2)}, {selected.velocity.y.toFixed(2)} m/s (current speed {Math.hypot(selected.velocity.x, selected.velocity.y).toFixed(2)})</div><div>Profile max / acceleration / braking: {selected.kinematics.maxSpeedMps.toFixed(1)} / {selected.kinematics.accelerationMps2.toFixed(1)} / {selected.kinematics.brakingMps2.toFixed(1)}</div><div>Facing: {selected.facing.x.toFixed(2)}, {selected.facing.y.toFixed(2)}</div></div>
        <div><strong>Responsibility</strong><div>{selected.responsibility?.kind ?? 'none'}{selected.responsibility?.slot ? ` · ${selected.responsibility.slot}` : ''}</div><div>{selected.responsibility?.id ?? '—'} · {selected.responsibility?.owner ?? '—'}</div><div>{selected.responsibility?.reason ?? 'No offensive responsibility'}</div><div>Since tick {selected.responsibility?.startedT ?? '—'}</div></div>
        <div><strong>Decision → movement intent</strong><div>{selected.decision?.kind ?? 'none'} · {selected.decision?.reason ?? '—'}</div><div>Target: {selected.intent ? `${selected.intent.target.x.toFixed(2)}, ${selected.intent.target.y.toFixed(2)} m` : '—'}</div><div>Urgency: {selected.intent?.urgency ?? '—'} · facing {selected.intent?.facing.kind ?? '—'}</div><div>Provenance: {selected.intent?.provenance.owner ?? '—'} / {selected.intent?.provenance.decisionId ?? '—'} / {selected.intent?.provenance.responsibilityId ?? '—'}</div><div>Distance to target: {selected.intent ? `${distanceBetween(selected.position, selected.intent.target).toFixed(2)} m` : '—'}</div></div>
      </div>}
      <p>Structure: {frame.offensiveStructure ? `${frame.offensiveStructure.formation} · ${frame.offensiveStructure.assignments.find((item) => item.playerId === selected?.playerId)?.slot ?? 'no slot'}` : 'none'}. No autonomous basketball decision is being simulated.</p>
    </section>
    {scenario === 'C' && <section aria-label="Athletic profile traces" style={{ marginTop: 16, background: '#1b2832', padding: 16, maxWidth: 1100, borderRadius: 6 }}>
      <h2 style={{ marginTop: 0 }}>Scenario C · Recorded kinematics</h2>
      <p>Measured from the recorded MatchState sequence at 0.1 s per tick. Peak speed, acceleration and braking are observed values; arrival is recorded only when the player reaches the real target and settles.</p>
      {athleticProfiles.length === 0 ? <p>Step or play through the inbound receipt to start the four equal-distance runs.</p> : <div style={{ display: 'grid', gap: 6 }}>
        {athleticProfiles.map((item) => <div key={item.playerId} style={{ display: 'grid', gridTemplateColumns: '110px 150px repeat(3, minmax(115px, 1fr)) minmax(155px, 1.2fr) minmax(150px, 1.2fr)', gap: 8, padding: '8px 10px', background: '#243542', borderLeft: `4px solid ${item.profile.maxSpeedMps <= 4.8 ? '#ffbb77' : item.profile.maxSpeedMps >= 6.1 ? '#73dfbb' : '#90b9ff'}`, fontVariantNumeric: 'tabular-nums' }}>
          <strong>{item.label} · {item.slot.replace('_', ' ')}</strong>
          <span>Profile: {item.profile.maxSpeedMps.toFixed(1)} m/s · {item.profile.accelerationMps2.toFixed(1)} · {item.profile.brakingMps2.toFixed(1)}</span>
          <span>Peak speed: {item.peakSpeedMps.toFixed(2)} m/s</span>
          <span>Peak accel: {item.peakAccelerationMps2.toFixed(2)} m/s²</span>
          <span>Peak braking: {item.peakBrakingMps2.toFixed(2)} m/s²</span>
          <span>Run start: {item.startDistanceMeters.toFixed(1)} m</span>
          <span>{item.arrivalSeconds === null ? `Moving · ${item.distanceToTargetMeters.toFixed(2)} m left` : `Arrived: ${item.arrivalSeconds.toFixed(1)} s`}</span>
        </div>)}
      </div>}
    </section>}
  </main>
}
