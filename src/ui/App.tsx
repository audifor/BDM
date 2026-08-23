import { useEffect, useRef, useState } from 'react'

import { selectUnreadInboxCount, useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { tauriGameSaveRepository } from '@/tauri/TauriGameSaveRepository'
import { getUserTeam } from '@/engine/calendar'

import { MatchViewerScreen } from './screens'
import { createPresentationSegment } from './match/MatchPresentationSegment'
import { DesktopShell } from './desktop/DesktopShell'
import { DesktopDock, DesktopLauncher, StatusCluster } from './desktop/DesktopNavigation'
import { GameContextBar } from './desktop/GameContextBar'
import { DESKTOP_APPS, getDesktopApp, type DesktopSection } from './desktop/DesktopAppRegistry'
import { DesktopWindow } from './desktop/DesktopWindow'
import { DesktopAppHost, type DesktopAppActions } from './desktop/DesktopAppHost'
import { useDesktopStore } from '@/stores/desktopStore'
import { useDesktopWidgetStore } from '@/stores/desktopWidgetStore'
import { DesktopWidgetLayer } from './desktop/DesktopWidgetLayer'
import { GlobalSearchOverlay } from './desktop/GlobalSearch'
import { EntityActionComposer } from './entityActions/EntityActionComposer'
import { resolveGameCapabilities } from './gameContext'
import { type EntityDestination, useEntityNavigationStore } from './navigation/entityNavigation'

/** Temporary compatibility export for existing UI tests; the dock and launcher own navigation. */
export const NAVIGATION: readonly { readonly id: DesktopSection; readonly label: string }[] = DESKTOP_APPS
  .filter((app): app is typeof app & { readonly section: DesktopSection } => app.section !== undefined)
  .map((app) => ({ id: app.section, label: app.label.toUpperCase() }))
import './styles.css'

export function App() {
  const world = useGameStore((state) => state.world)
  const newGame = useGameStore((state) => state.newGame)
  const replaceWorld = useGameStore((state) => state.replaceWorld)
  const startLiveMatch = useGameStore((state) => state.startLiveMatch)
  const advanceLiveMatch = useGameStore((state) => state.advanceLiveMatch)
  const advanceLiveMatchPresentation = useGameStore((state) => state.advanceLiveMatchPresentation)
  const skipLiveMatch = useGameStore((state) => state.skipLiveMatch)
  const applyLiveTactics = useGameStore((state) => state.applyLiveTactics)
  const applyManualSubstitutions = useGameStore((state) => state.applyManualSubstitutions)
  const completeMatch = useGameStore((state) => state.completeMatch)
  const instantResult = useGameStore((state) => state.instantResult)
  const simulateRemainingGamesToday = useGameStore((state) => state.simulateRemainingGamesToday)
  const advanceDay = useGameStore((state) => state.advanceDay)
  const continueGame = useGameStore((state) => state.continueGame)
  const startNextSeason = useGameStore((state) => state.startNextSeason)
  const signFreeAgent = useGameStore((state) => state.signFreeAgent)
  const releasePlayer = useGameStore((state) => state.releasePlayer)
  const executeTrade = useGameStore((state) => state.executeTrade)
  const addRecruitingTarget = useGameStore((state) => state.addRecruitingTarget)
  const removeRecruitingTarget = useGameStore((state) => state.removeRecruitingTarget)
  const performRecruitingAction = useGameStore((state) => state.performRecruitingAction)
  const makeRecruitingOffer = useGameStore((state) => state.makeRecruitingOffer)
  const acceptNilOpportunity = useGameStore((state) => state.acceptNilOpportunity)
  const purchaseUserCoachSkill = useGameStore((state) => state.purchaseUserCoachSkill)
  const purchaseUserCoachPerk = useGameStore((state) => state.purchaseUserCoachPerk)
  const acceptUserCoachOffer = useGameStore((state) => state.acceptUserCoachOffer)
  const declineUserCoachOffer = useGameStore((state) => state.declineUserCoachOffer)
  const setTrainingIntensity = useGameStore((state) => state.setTrainingIntensity)
  const setTrainingFocus = useGameStore((state) => state.setTrainingFocus)
  const setUserCoachLifestyle = useGameStore((state) => state.setUserCoachLifestyle)
  const selectDraftProspect = useGameStore((state) => state.selectDraftProspect)
  const executeEntityAction = useGameStore((state) => state.executeEntityAction)
  const navigateEntity = useEntityNavigationStore((state) => state.navigate)
  const [launcherQuery, setLauncherQuery] = useState('')
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const desktopInitialized = useRef(false)
  const enterDesktopWidgetEditMode = useDesktopWidgetStore((state) => state.enterEditMode)
  const desktopWindows = useDesktopStore((state) => state.windows)
  const focusedWindowId = useDesktopStore((state) => state.focusedWindowId)
  const launcherOpen = useDesktopStore((state) => state.launcherOpen)
  const recentAppIds = useDesktopStore((state) => state.recentAppIds)
  const launcherOrder = useDesktopStore((state) => state.launcherOrder)
  const openWindow = useDesktopStore((state) => state.openWindow)
  const closeWindow = useDesktopStore((state) => state.closeWindow)
  const focusWindow = useDesktopStore((state) => state.focusWindow)
  const minimizeWindow = useDesktopStore((state) => state.minimizeWindow)
  const restoreWindow = useDesktopStore((state) => state.restoreWindow)
  const maximizeWindow = useDesktopStore((state) => state.maximizeWindow)
  const restoreMaximizedWindow = useDesktopStore((state) => state.restoreMaximizedWindow)
  const moveWindow = useDesktopStore((state) => state.moveWindow)
  const resizeWindow = useDesktopStore((state) => state.resizeWindow)
  const toggleLauncher = useDesktopStore((state) => state.toggleLauncher)
  const closeLauncher = useDesktopStore((state) => state.closeLauncher)
  const reorderLauncher = useDesktopStore((state) => state.reorderLauncher)
  const simulation = useMatchViewerStore((state) => state.simulation)
  const currentEventIndex = useMatchViewerStore((state) => state.currentEventIndex)
  const isPlaying = useMatchViewerStore((state) => state.isPlaying)
  const speed = useMatchViewerStore((state) => state.speed)
  const resultApplied = useMatchViewerStore((state) => state.resultApplied)
  const startMatch = useMatchViewerStore((state) => state.startMatch)
  const replaceSimulation = useMatchViewerStore((state) => state.replaceSimulation)
  const executeComposerAction = (result: Parameters<typeof executeEntityAction>[0]) => { const outcome = executeEntityAction(result); if (outcome.kind === 'sessionUpdated') replaceSimulation(outcome.simulation, false); return outcome }
  const pause = useMatchViewerStore((state) => state.pause)
  const resume = useMatchViewerStore((state) => state.resume)
  const setSpeed = useMatchViewerStore((state) => state.setSpeed)
  const revealNextEvent = useMatchViewerStore((state) => state.revealNextEvent)
  const skipToEnd = useMatchViewerStore((state) => state.skipToEnd)
  const markResultApplied = useMatchViewerStore((state) => state.markResultApplied)
  const clearMatch = useMatchViewerStore((state) => state.clear)
  const tacticalPlan = useTacticalPlanStore((state) => state.plan)
  const applyUserCoachForJob = useGameStore((state) => state.applyUserCoachForJob)
  const setTacticalPlan = useTacticalPlanStore((state) => state.setPlan)
  const resetTacticalPlan = useTacticalPlanStore((state) => state.reset)
  const [hasSave, setHasSave] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const refreshSaveInfo = async () => {
    try { setHasSave((await tauriGameSaveRepository.getInfo()) !== null) } catch { setHasSave(false) }
  }
  useEffect(() => { void refreshSaveInfo() }, [])
  useEffect(() => { if (world !== null && !desktopInitialized.current) desktopInitialized.current = true }, [world])
  useEffect(() => { if (focusedWindowId === null && desktopWindows.length === 0) document.querySelector<HTMLButtonElement>('.desktop-dock__item')?.focus() }, [desktopWindows.length, focusedWindowId])
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') { event.preventDefault(); closeLauncher(); setGlobalSearchOpen(true) } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown) }, [closeLauncher])
  const loadGame = async () => {
    try {
      const loaded = await loadSavedGame(tauriGameSaveRepository)
      replaceWorld(loaded); clearMatch(); resetTacticalPlan(); setSaveMessage('GAME LOADED')
    } catch (error) { setSaveMessage(error instanceof Error ? error.message : 'Unable to load saved game') }
  }
  const saveGame = async () => {
    if (world === null || simulation !== null) return
    try { await saveCurrentGame(world, tauriGameSaveRepository, new Date().toISOString()); setHasSave(true); setSaveMessage('GAME SAVED') }
    catch (error) { setSaveMessage(error instanceof Error ? error.message : 'Unable to save game') }
  }

  if (world === null) {
    return <StartScreen onNewGame={() => { newGame(); resetTacticalPlan() }} onLoad={() => void loadGame()} canLoad={hasSave} message={saveMessage} />
  }

  if (simulation !== null) {
    const coachingTeam = getUserTeam(world)!
    return <DesktopShell context={<GameContextBar world={world} />} overlay={<EntityActionComposer onResult={executeComposerAction} />}><MatchViewerScreen world={world} simulation={simulation} homeTeamName={world.teams[simulation.homeTeamId]!.name} awayTeamName={world.teams[simulation.awayTeamId]!.name} currentEventIndex={currentEventIndex} isPlaying={isPlaying} speed={speed} resultApplied={resultApplied} onPause={pause} onResume={resume} onSpeedChange={setSpeed} onRevealNext={() => replaceSimulation(advanceLiveMatch())} onRequestPresentationSegment={() => createPresentationSegment(advanceLiveMatchPresentation())} onCompletePresentationSegment={(nextSimulation) => replaceSimulation(nextSimulation)} onSkipToEnd={() => replaceSimulation(skipLiveMatch(), false)} onApplyResult={() => { if (markResultApplied()) completeMatch(simulation) }} onContinue={clearMatch} coachingPlan={tacticalPlan} coachingPlayers={coachingTeam.rosterPlayerIds.map((playerId) => world.players[playerId]!)} coachingTeamId={coachingTeam.id} onApplyCoaching={(plan) => { replaceSimulation(applyLiveTactics(coachingTeam.id, plan), false); setTacticalPlan(plan) }} onApplyManualSubstitutions={(substitutions) => replaceSimulation(applyManualSubstitutions(coachingTeam.id, substitutions), false)} /></DesktopShell>
  }
  const seasonComplete = Object.values(world.games).every((game) => game.status === 'completed')

  const openEntity = (destination: EntityDestination) => { navigateEntity(destination); openWindow('entity'); setLauncherQuery('') }
  const openDesktopApp = (appId: string) => {
    const userTeam = getUserTeam(world)
    const currentCompetitionId = world.seasons[world.currentSeasonId]?.competitionId
    if (appId === 'club' && userTeam !== undefined) return openEntity({ type: 'team', teamId: userTeam.id, section: 'overview' })
    if (appId === 'squad' && userTeam !== undefined) return openEntity({ type: 'team', teamId: userTeam.id, section: 'squad' })
    if (appId === 'staff' && userTeam !== undefined) return openEntity({ type: 'team', teamId: userTeam.id, section: 'staff' })
    if (appId === 'standings' && currentCompetitionId !== undefined) return openEntity({ type: 'competition', competitionId: currentCompetitionId, section: 'standings' })
    openWindow(appId); setLauncherQuery('')
  }
  const unreadInboxCount = selectUnreadInboxCount(world)
  const capabilities = resolveGameCapabilities(world)
  const activeAppId = desktopWindows.find((window) => window.id === focusedWindowId)?.appId ?? null
  const desktopActions: DesktopAppActions = { tacticalPlan, openApp: openDesktopApp, openEntity, playGame: () => startMatch(startLiveMatch(tacticalPlan)), instantResult: () => instantResult(tacticalPlan), simulateRemainingGamesToday, advanceDay, startNextSeason, releasePlayer, signFreeAgent, selectDraftProspect, executeTrade, addRecruitingTarget, removeRecruitingTarget, performRecruitingAction, makeRecruitingOffer, acceptNilOpportunity, purchaseSkill: (id) => { const result = purchaseUserCoachSkill(id); if (!result.ok) setSaveMessage(result.reason) }, purchasePerk: (id) => { const result = purchaseUserCoachPerk(id); if (!result.ok) setSaveMessage(result.reason) }, acceptOffer: acceptUserCoachOffer, declineOffer: declineUserCoachOffer, applyForJob: applyUserCoachForJob, setTacticalPlan, resetTacticalPlan, setTrainingIntensity, setTrainingFocus, setCoachLifestyle: setUserCoachLifestyle }

  return (
    <DesktopShell
      context={<GameContextBar world={world} />}
      widgets={<DesktopWidgetLayer world={world} onAdvanceDay={advanceDay} onContinue={continueGame} onInstantResult={() => instantResult(tacticalPlan)} onOpenApp={openDesktopApp} onOpenPendingGame={(gameId) => { if (world.games[gameId]?.status === 'scheduled') startMatch(startLiveMatch(tacticalPlan)) }} onPlayGame={() => startMatch(startLiveMatch(tacticalPlan))} />}
      dock={<DesktopDock activeAppId={activeAppId} launcherOpen={launcherOpen} onAppOpen={openDesktopApp} onLauncherToggle={toggleLauncher} openAppIds={desktopWindows.map((window) => window.appId)} unreadCount={unreadInboxCount} />}
      overlay={<><DesktopLauncher activeAppId={activeAppId} capabilities={capabilities} canAdvanceDay={!seasonComplete} canLoad={hasSave} isOpen={launcherOpen && !globalSearchOpen} launcherOrder={launcherOrder} onAdvanceDay={advanceDay} onAppOpen={openDesktopApp} onClose={closeLauncher} onCustomizeDesktop={enterDesktopWidgetEditMode} onLoad={() => void loadGame()} onQueryChange={setLauncherQuery} onReorder={reorderLauncher} onSave={() => void saveGame()} query={launcherQuery} recentAppIds={recentAppIds} /><GlobalSearchOverlay canAdvanceDay={!seasonComplete} canLoad={hasSave} isOpen={globalSearchOpen} onAdvanceDay={advanceDay} onClose={() => setGlobalSearchOpen(false)} onCustomize={enterDesktopWidgetEditMode} onLoad={() => void loadGame()} onOpenApp={openDesktopApp} onSave={() => void saveGame()} world={world} /><EntityActionComposer onResult={executeComposerAction} /></>}
      status={<StatusCluster saveMessage={saveMessage} />}
    >
      <div className="app-shell">
        {desktopWindows.filter((window) => !window.minimized).map((window) => <DesktopWindow focused={window.id === focusedWindowId} key={window.id} onClose={() => closeWindow(window.id)} onFocus={() => focusWindow(window.id)} onMaximize={() => maximizeWindow(window.id)} onMinimize={() => minimizeWindow(window.id)} onMove={(position) => moveWindow(window.id, position)} onResize={(bounds) => resizeWindow(window.id, bounds)} onRestoreMaximized={() => restoreMaximizedWindow(window.id)} window={window}><DesktopAppHost actions={desktopActions} appId={window.appId} world={world} /></DesktopWindow>)}
      </div>
    </DesktopShell>
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
