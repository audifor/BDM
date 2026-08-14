import { useEffect, useState } from 'react'

import { useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { tauriGameSaveRepository } from '@/tauri/TauriGameSaveRepository'
import { getUserTeam } from '@/engine/calendar'
import { getSeasonHistoryRecord } from '@/engine/season'
import { getCurrentSeason } from '@/app/game'

import { formatPrototypeDate } from './formatters'
import { CoachScreen, HomeScreen, MarketScreen, MatchViewerScreen, ScheduleScreen, SquadScreen, StaffScreen, StandingsScreen, TacticsScreen, TrainingScreen } from './screens'
import { createPresentationSegment } from './match/MatchPresentationSegment'
import './styles.css'

type Section = 'home' | 'coach' | 'tactics' | 'training' | 'squad' | 'staff' | 'schedule' | 'standings' | 'market'

export const NAVIGATION: readonly { readonly id: Section; readonly label: string }[] = [
  { id: 'home', label: 'HOME' },
  { id: 'coach', label: 'COACH' },
  { id: 'tactics', label: 'TACTICS' },
  { id: 'training', label: 'TRAINING' },
  { id: 'squad', label: 'SQUAD' },
  { id: 'staff', label: 'STAFF' },
  { id: 'schedule', label: 'SCHEDULE' },
  { id: 'standings', label: 'STANDINGS' },
  { id: 'market', label: 'MARKET' },
]

export function App() {
  const world = useGameStore((state) => state.world)
  const newGame = useGameStore((state) => state.newGame)
  const resetGame = useGameStore((state) => state.resetGame)
  const replaceWorld = useGameStore((state) => state.replaceWorld)
  const prepareUserMatch = useGameStore((state) => state.prepareUserMatch)
  const startLiveMatch = useGameStore((state) => state.startLiveMatch)
  const advanceLiveMatch = useGameStore((state) => state.advanceLiveMatch)
  const advanceLiveMatchPresentation = useGameStore((state) => state.advanceLiveMatchPresentation)
  const skipLiveMatch = useGameStore((state) => state.skipLiveMatch)
  const applyLiveTactics = useGameStore((state) => state.applyLiveTactics)
  const applyManualSubstitutions = useGameStore((state) => state.applyManualSubstitutions)
  const completeMatch = useGameStore((state) => state.completeMatch)
  const instantResult = useGameStore((state) => state.instantResult)
  const advanceDay = useGameStore((state) => state.advanceDay)
  const startNextSeason = useGameStore((state) => state.startNextSeason)
  const signFreeAgent = useGameStore((state) => state.signFreeAgent)
  const releasePlayer = useGameStore((state) => state.releasePlayer)
  const purchaseUserCoachSkill = useGameStore((state) => state.purchaseUserCoachSkill)
  const purchaseUserCoachPerk = useGameStore((state) => state.purchaseUserCoachPerk)
  const acceptUserCoachOffer = useGameStore((state) => state.acceptUserCoachOffer)
  const declineUserCoachOffer = useGameStore((state) => state.declineUserCoachOffer)
  const setTrainingIntensity = useGameStore((state) => state.setTrainingIntensity)
  const setTrainingFocus = useGameStore((state) => state.setTrainingFocus)
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
  const [hasSave, setHasSave] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const refreshSaveInfo = async () => {
    try { setHasSave((await tauriGameSaveRepository.getInfo()) !== null) } catch { setHasSave(false) }
  }
  useEffect(() => { void refreshSaveInfo() }, [])
  const loadGame = async () => {
    try {
      const loaded = await loadSavedGame(tauriGameSaveRepository)
      replaceWorld(loaded); clearMatch(); resetTacticalPlan(); setSection('home'); setSaveMessage('GAME LOADED')
    } catch (error) { setSaveMessage(error instanceof Error ? error.message : 'Unable to load saved game') }
  }
  const saveGame = async () => {
    if (world === null || simulation !== null) return
    try { await saveCurrentGame(world, tauriGameSaveRepository, new Date().toISOString()); setHasSave(true); setSaveMessage('GAME SAVED') }
    catch (error) { setSaveMessage(error instanceof Error ? error.message : 'Unable to save game') }
  }

  if (world === null) {
    return <StartScreen onNewGame={() => { newGame(); resetTacticalPlan(); setSection('home') }} onLoad={() => void loadGame()} canLoad={hasSave} message={saveMessage} />
  }

  if (simulation !== null) {
    const coachingTeam = getUserTeam(world)!
    return <MatchViewerScreen world={world} simulation={simulation} homeTeamName={world.teams[simulation.homeTeamId]!.name} awayTeamName={world.teams[simulation.awayTeamId]!.name} currentEventIndex={currentEventIndex} isPlaying={isPlaying} speed={speed} resultApplied={resultApplied} onPause={pause} onResume={resume} onSpeedChange={setSpeed} onRevealNext={() => replaceSimulation(advanceLiveMatch())} onRequestPresentationSegment={() => createPresentationSegment(advanceLiveMatchPresentation())} onCompletePresentationSegment={(nextSimulation) => replaceSimulation(nextSimulation)} onSkipToEnd={() => replaceSimulation(skipLiveMatch(), false)} onApplyResult={() => { if (markResultApplied()) completeMatch(simulation) }} onContinue={() => { clearMatch(); setSection('home') }} coachingPlan={tacticalPlan} coachingPlayers={coachingTeam.rosterPlayerIds.map((playerId) => world.players[playerId]!)} coachingTeamId={coachingTeam.id} onApplyCoaching={(plan) => { replaceSimulation(applyLiveTactics(coachingTeam.id, plan), false); setTacticalPlan(plan) }} onApplyManualSubstitutions={(substitutions) => replaceSimulation(applyManualSubstitutions(coachingTeam.id, substitutions), false)} />
  }
  const userTeam = getUserTeam(world)
  const seasonComplete = getSeasonHistoryRecord(world, getCurrentSeason(world).id) !== undefined

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
          <button className="advance-button" disabled={seasonComplete} onClick={advanceDay} type="button">ADVANCE DAY</button>
          <button className="text-button" onClick={() => void saveGame()} type="button">SAVE GAME</button>
          <button className="text-button" disabled={!hasSave} onClick={() => void loadGame()} type="button">LOAD GAME</button>
          {saveMessage !== null && <p>{saveMessage}</p>}
          <button className="text-button" onClick={startNewGame} type="button">NEW GAME</button>
          <button className="text-button" onClick={resetGame} type="button">EXIT CAREER</button>
        </div>
      </aside>
      <div className="main-content">
        {section === 'home' && <HomeScreen world={world} onPlayGame={() => startMatch(startLiveMatch(tacticalPlan))} onInstantResult={() => instantResult(tacticalPlan)} onStartNextSeason={startNextSeason} />}
        {section === 'coach' && <CoachScreen world={world} onSkill={(id) => { const result=purchaseUserCoachSkill(id); if(!result.ok) setSaveMessage(result.reason) }} onPerk={(id) => { const result=purchaseUserCoachPerk(id); if(!result.ok) setSaveMessage(result.reason) }} onAcceptOffer={acceptUserCoachOffer} onDeclineOffer={declineUserCoachOffer} />}
        {section === 'tactics' && <TacticsScreen players={userTeam === undefined ? [] : userTeam.rosterPlayerIds.map((playerId) => world.players[playerId]!)} plan={tacticalPlan} onChange={setTacticalPlan} onReset={resetTacticalPlan} />}
        {section === 'training' && <TrainingScreen world={world} onIntensity={setTrainingIntensity} onFocus={setTrainingFocus} />}
        {section === 'squad' && <SquadScreen world={world} onRelease={(playerId) => { if (userTeam !== undefined) releasePlayer(userTeam.id, playerId) }} />}
        {section === 'staff' && <StaffScreen world={world} />}
        {section === 'schedule' && <ScheduleScreen world={world} />}
        {section === 'standings' && <StandingsScreen world={world} />}
        {section === 'market' && <MarketScreen world={world} onSign={(playerId) => { if (userTeam !== undefined) signFreeAgent(userTeam.id, playerId) }} />}
      </div>
    </main>
  )
}

function StartScreen({ onNewGame, onLoad, canLoad, message }: { readonly onNewGame: () => void; readonly onLoad: () => void; readonly canLoad: boolean; readonly message: string | null }) {
  return (
    <main className="start-screen">
      <section>
        <p className="eyebrow">PROTOTYPE CAREER</p>
        <h1>BDM</h1>
        <p className="subtitle">Basketball Dynasty Manager</p>
        <button className="primary-button" onClick={onNewGame} type="button">NEW GAME</button>
        <button className="text-button" disabled={!canLoad} onClick={onLoad} type="button">CONTINUE</button>
        {message !== null && <p>{message}</p>}
      </section>
    </main>
  )
}
