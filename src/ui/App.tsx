import { useState } from 'react'

import { useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { getUserTeam } from '@/engine/calendar'

import { formatPrototypeDate } from './formatters'
import { HomeScreen, MatchViewerScreen, ScheduleScreen, SquadScreen, StandingsScreen, TacticsScreen } from './screens'
import './styles.css'

type Section = 'home' | 'tactics' | 'squad' | 'schedule' | 'standings'

const NAVIGATION: readonly { readonly id: Section; readonly label: string }[] = [
  { id: 'home', label: 'HOME' },
  { id: 'tactics', label: 'TACTICS' },
  { id: 'squad', label: 'SQUAD' },
  { id: 'schedule', label: 'SCHEDULE' },
  { id: 'standings', label: 'STANDINGS' },
]

export function App() {
  const world = useGameStore((state) => state.world)
  const newGame = useGameStore((state) => state.newGame)
  const resetGame = useGameStore((state) => state.resetGame)
  const prepareUserMatch = useGameStore((state) => state.prepareUserMatch)
  const startLiveMatch = useGameStore((state) => state.startLiveMatch)
  const advanceLiveMatch = useGameStore((state) => state.advanceLiveMatch)
  const skipLiveMatch = useGameStore((state) => state.skipLiveMatch)
  const applyLiveTactics = useGameStore((state) => state.applyLiveTactics)
  const completeMatch = useGameStore((state) => state.completeMatch)
  const instantResult = useGameStore((state) => state.instantResult)
  const advanceDay = useGameStore((state) => state.advanceDay)
  const [section, setSection] = useState<Section>('home')
  const simulation = useMatchViewerStore((state) => state.simulation)
  const currentEventIndex = useMatchViewerStore((state) => state.currentEventIndex)
  const isPlaying = useMatchViewerStore((state) => state.isPlaying)
  const speed = useMatchViewerStore((state) => state.speed)
  const resultApplied = useMatchViewerStore((state) => state.resultApplied)
  const startMatch = useMatchViewerStore((state) => state.startMatch)
  const replaceSimulation = useMatchViewerStore((state) => state.replaceSimulation)
  const pause = useMatchViewerStore((state) => state.pause)
  const resume = useMatchViewerStore((state) => state.resume)
  const setSpeed = useMatchViewerStore((state) => state.setSpeed)
  const revealNextEvent = useMatchViewerStore((state) => state.revealNextEvent)
  const skipToEnd = useMatchViewerStore((state) => state.skipToEnd)
  const markResultApplied = useMatchViewerStore((state) => state.markResultApplied)
  const clearMatch = useMatchViewerStore((state) => state.clear)
  const tacticalPlan = useTacticalPlanStore((state) => state.plan)
  const setTacticalPlan = useTacticalPlanStore((state) => state.setPlan)
  const resetTacticalPlan = useTacticalPlanStore((state) => state.reset)

  if (world === null) {
    return <StartScreen onNewGame={() => { newGame(); resetTacticalPlan(); setSection('home') }} />
  }

  if (simulation !== null) {
    const coachingTeam = getUserTeam(world)!
    return <MatchViewerScreen world={world} simulation={simulation} homeTeamName={world.teams[simulation.homeTeamId]!.name} awayTeamName={world.teams[simulation.awayTeamId]!.name} currentEventIndex={currentEventIndex} isPlaying={isPlaying} speed={speed} resultApplied={resultApplied} onPause={pause} onResume={resume} onSpeedChange={setSpeed} onRevealNext={() => replaceSimulation(advanceLiveMatch())} onSkipToEnd={() => replaceSimulation(skipLiveMatch(), false)} onApplyResult={() => { if (markResultApplied()) completeMatch(simulation) }} onContinue={() => { clearMatch(); setSection('home') }} coachingPlan={tacticalPlan} coachingPlayers={coachingTeam.rosterPlayerIds.map((playerId) => world.players[playerId]!)} onApplyCoaching={(plan) => { replaceSimulation(applyLiveTactics(coachingTeam.id, plan), false); setTacticalPlan(plan) }} />
  }
  const userTeam = getUserTeam(world)

  const startNewGame = () => {
    if (window.confirm('Start a new prototype career? The current career will be lost.')) {
      newGame()
      resetTacticalPlan()
      setSection('home')
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><strong>BDM</strong><span>BASKETBALL DYNASTY MANAGER</span></div>
        <time>{formatPrototypeDate(world.currentDate)}</time>
      </header>
      <aside className="sidebar">
        <nav aria-label="Main navigation">
          {NAVIGATION.map((item) => <button className={section === item.id ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => setSection(item.id)} type="button">{item.label}</button>)}
        </nav>
        <div className="sidebar-actions">
          <button className="advance-button" onClick={advanceDay} type="button">ADVANCE DAY</button>
          <button className="text-button" onClick={startNewGame} type="button">NEW GAME</button>
          <button className="text-button" onClick={resetGame} type="button">EXIT CAREER</button>
        </div>
      </aside>
      <div className="main-content">
        {section === 'home' && <HomeScreen world={world} onPlayGame={() => startMatch(startLiveMatch(tacticalPlan))} onInstantResult={() => instantResult(tacticalPlan)} />}
        {section === 'tactics' && <TacticsScreen players={userTeam === undefined ? [] : userTeam.rosterPlayerIds.map((playerId) => world.players[playerId]!)} plan={tacticalPlan} onChange={setTacticalPlan} onReset={resetTacticalPlan} />}
        {section === 'squad' && <SquadScreen world={world} />}
        {section === 'schedule' && <ScheduleScreen world={world} />}
        {section === 'standings' && <StandingsScreen world={world} />}
      </div>
    </main>
  )
}

function StartScreen({ onNewGame }: { readonly onNewGame: () => void }) {
  return (
    <main className="start-screen">
      <section>
        <p className="eyebrow">PROTOTYPE CAREER</p>
        <h1>BDM</h1>
        <p className="subtitle">Basketball Dynasty Manager</p>
        <button className="primary-button" onClick={onNewGame} type="button">NEW GAME</button>
      </section>
    </main>
  )
}
