import { useEffect, useMemo, useState } from 'react'
import { createCourtGeometry } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createMatchState, tick, toFrame, type MatchSetup, type MatchState } from '@/engine/match-next'

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
  return {
    gameId: gameIdFromString('match-next-debug-game'), homeTeamId, awayTeamId,
    court: createCourtGeometry('FIBA'),
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24 },
    homeSquad: homeIds, awaySquad: awayIds, initialLineups: { home: homeIds, away: awayIds },
    players: [...homeIds.map((id) => profile(id, homeTeamId)), ...awayIds.map((id) => profile(id, awayTeamId))],
    tacticalPlans: { home: emptyPlan, away: emptyPlan }, defensiveMatchupOverrides: { home: [], away: [] }, matchSeed: 20260926,
  }
}

export function MatchNextDebugApp() {
  const setup = useMemo(debugSetup, [])
  const [simulation, setSimulation] = useState(() => {
    const initial = createMatchState(setup)
    return { state: initial, history: [initial] as readonly MatchState[] }
  })
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setSimulation((current) => {
        const next = tick(current.state)
        return { state: next, history: [...current.history, next] }
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [playing, setup])
  useEffect(() => { if (simulation.state.isComplete) setPlaying(false) }, [simulation.state.isComplete])
  const { state, history } = simulation
  const frame = toFrame(state)
  const court = setup.court
  const selectedTick = history.findIndex((entry) => entry.t === state.t)
  return <main style={{ minHeight: '100vh', background: '#101820', color: '#ecf1f4', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
    <h1 style={{ marginTop: 0 }}>Match Next · Foundation Debug</h1>
    <p>Foundation placement only. Players and ball remain static; this is not a basketball result.</p>
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 12 }}>
      <strong>Period {frame.period}</strong><strong>Clock {(frame.gameClock / 10).toFixed(1)}s</strong><strong>Shot clock —</strong><strong>Tick {frame.t}</strong><strong>Score {frame.score.home}–{frame.score.away}</strong>
    </div>
    <svg viewBox={`0 0 ${court.lengthMeters} ${court.widthMeters}`} role="img" aria-label="Foundation court with ten static player markers" style={{ display: 'block', width: 'min(100%, 1000px)', background: '#ca8b50', border: '4px solid #f5ead4' }}>
      <rect x="0.3" y="0.3" width={court.lengthMeters - 0.6} height={court.widthMeters - 0.6} fill="none" stroke="#fff1da" strokeWidth="0.12" />
      <line x1={court.lengthMeters / 2} y1="0" x2={court.lengthMeters / 2} y2={court.widthMeters} stroke="#fff1da" strokeWidth="0.1" />
      <circle cx={court.lengthMeters / 2} cy={court.widthMeters / 2} r="1.8" fill="none" stroke="#fff1da" strokeWidth="0.1" />
      <circle cx={court.baskets.left.x} cy={court.baskets.left.y} r="1.8" fill="none" stroke="#fff1da" strokeWidth="0.1" />
      <circle cx={court.baskets.right.x} cy={court.baskets.right.y} r="1.8" fill="none" stroke="#fff1da" strokeWidth="0.1" />
      {frame.players.map((player, index) => <g key={player.playerId}>
        <circle cx={player.position.x} cy={player.position.y} r="0.42" fill={player.teamId === setup.homeTeamId ? '#153d72' : '#9b2433'} stroke="white" strokeWidth="0.08" />
        <text x={player.position.x} y={player.position.y + 0.12} textAnchor="middle" fill="white" fontSize="0.35">{index < 5 ? index + 1 : index - 4}</text>
      </g>)}
      <circle cx={frame.ball.position.x} cy={frame.ball.position.y} r="0.2" fill="#392414" stroke="white" strokeWidth="0.06" />
    </svg>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
      <button onClick={() => setPlaying(false)}>Pause</button>
      <button onClick={() => setPlaying(true)} disabled={state.isComplete}>Play</button>
      <button onClick={() => { setPlaying(false); setSimulation((current) => { const next = tick(current.state); return { state: next, history: [...current.history, next] } }) }} disabled={state.isComplete}>Single tick</button>
      <input aria-label="Simulation history" type="range" min="0" max={Math.max(0, history.length - 1)} value={Math.max(0, selectedTick)} onChange={(event) => { setPlaying(false); const selected = history[Number(event.target.value)]; if (selected) setSimulation((current) => ({ ...current, state: selected })) }} style={{ width: 300 }} />
      <span>{history.length} snapshots</span>
    </div>
  </main>
}
