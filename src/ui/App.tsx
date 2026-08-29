import { useEffect, useRef, useState } from 'react'

import { selectUnreadInboxCount, useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { tauriGameSaveRepository } from '@/tauri/TauriGameSaveRepository'
import { getTeamRoster } from '@/domain/world'
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
import { useDesktopPreferencesStore } from '@/stores/desktopPreferencesStore'
import { DesktopWidgetLayer } from './desktop/DesktopWidgetLayer'
import { DesktopCanonicalSurfaceLayer } from './desktop/DesktopCanonicalSurfaceLayer'
import { GlobalSearchOverlay } from './desktop/GlobalSearch'
import { EntityActionComposer } from './entityActions/EntityActionComposer'
import { resolveGameCapabilities } from './gameContext'
import { type EntityDestination, useEntityNavigationStore } from './navigation/entityNavigation'

/** Temporary compatibility export for existing UI tests; the dock and launcher own navigation. */
export const NAVIGATION: readonly { readonly id: DesktopSection; readonly label: string }[] = DESKTOP_APPS
  .filter((app): app is typeof app & { readonly section: DesktopSection } => app.section !== undefined)
  .map((app) => ({ id: app.section, label: app.label.toUpperCase() }))
import './styles.css'
import './desktop/desktop-art-direction.css'

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
  const respondToMedia = useGameStore((state) => state.respondToMedia)
  const skipMedia = useGameStore((state) => state.skipMedia)
  const selectDraftProspect = useGameStore((state) => state.selectDraftProspect)
  const executeEntityAction = useGameStore((state) => state.executeEntityAction)
  const navigateEntity = useEntityNavigationStore((state) => state.navigate)
  const [launcherQuery, setLauncherQuery] = useState('')
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [entityDestinations, setEntityDestinations] = useState<Record<string, EntityDestination>>({})
  const desktopInitialized = useRef(false)
  const desktopCompositionInitialized = useRef(false)
  const enterDesktopWidgetEditMode = useDesktopWidgetStore((state) => state.enterEditMode)
  const showDesktopWidget = useDesktopWidgetStore((state) => state.showWidget)
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
  const snapWindow = useDesktopStore((state) => state.snapWindow)
  const toggleLauncher = useDesktopStore((state) => state.toggleLauncher)
  const closeLauncher = useDesktopStore((state) => state.closeLauncher)
  const reorderLauncher = useDesktopStore((state) => state.reorderLauncher)
  const wallpaper = useDesktopPreferencesStore((state) => state.wallpaper)
  const density = useDesktopPreferencesStore((state) => state.density)
  const dockAutoHide = useDesktopPreferencesStore((state) => state.dockAutoHide)
  const visualQaFixture = useDesktopPreferencesStore((state) => state.visualQaFixture)
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
  const openEntity = (destination: EntityDestination) => {
    const instanceId = entityWindowId(destination); const initialBounds = defaultEntityWindowBounds(destination)
    navigateEntity(destination); setEntityDestinations((current) => ({ ...current, [instanceId]: destination })); openWindow('entity', instanceId, initialBounds); setLauncherQuery('')
  }
  useEffect(() => {
    if (!visualQaFixture || world === null || simulation !== null || desktopCompositionInitialized.current || desktopWindows.length > 0) return
    const team = getUserTeam(world); if (team === undefined) return
    const player = getTeamRoster(world, team.id)[0]; if (player === undefined) return
    desktopCompositionInitialized.current = true
    ;(['squad', 'nextGame', 'training', 'dayStatus', 'standings', 'news'] as const).forEach((id) => showDesktopWidget(id, { width: globalThis.innerWidth, height: globalThis.innerHeight }))
    openEntity({ type: 'team', teamId: team.id, section: 'squad' }); openEntity({ type: 'player', playerId: player.id, section: 'overview' })
  }, [desktopWindows.length, showDesktopWidget, simulation, visualQaFixture, world])
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
    return <DesktopShell context={<GameContextBar onOpenSettings={() => openWindow('settings')} onSearch={() => setGlobalSearchOpen(true)} world={world} />} density={density} dockAutoHide={dockAutoHide} overlay={<EntityActionComposer onResult={executeComposerAction} />} wallpaper={wallpaper}><MatchViewerScreen world={world} simulation={simulation} homeTeamName={world.teams[simulation.homeTeamId]!.name} awayTeamName={world.teams[simulation.awayTeamId]!.name} currentEventIndex={currentEventIndex} isPlaying={isPlaying} speed={speed} resultApplied={resultApplied} onPause={pause} onResume={resume} onSpeedChange={setSpeed} onRevealNext={() => replaceSimulation(advanceLiveMatch())} onRequestPresentationSegment={() => createPresentationSegment(advanceLiveMatchPresentation())} onCompletePresentationSegment={(nextSimulation) => replaceSimulation(nextSimulation)} onSkipToEnd={() => replaceSimulation(skipLiveMatch(), false)} onApplyResult={() => { if (markResultApplied()) completeMatch(simulation) }} onContinue={clearMatch} coachingPlan={tacticalPlan} coachingPlayers={coachingTeam.rosterPlayerIds.map((playerId) => world.players[playerId]!)} coachingTeamId={coachingTeam.id} onApplyCoaching={(plan) => { replaceSimulation(applyLiveTactics(coachingTeam.id, plan), false); setTacticalPlan(plan) }} onApplyManualSubstitutions={(substitutions) => replaceSimulation(applyManualSubstitutions(coachingTeam.id, substitutions), false)} /></DesktopShell>
  }
  const seasonComplete = Object.values(world.games).every((game) => game.status === 'completed')

  const openDesktopApp = (appId: string) => {
    if (appId === 'schedule' || appId === 'standings') return openWindow('competition')
    openWindow(appId); setLauncherQuery('')
  }
  const unreadInboxCount = selectUnreadInboxCount(world)
  const capabilities = resolveGameCapabilities(world)
  const activeAppId = desktopWindows.find((window) => window.id === focusedWindowId)?.appId ?? null
  const desktopActions: DesktopAppActions = { tacticalPlan, openApp: openDesktopApp, openEntity, playGame: () => startMatch(startLiveMatch(tacticalPlan)), instantResult: () => instantResult(tacticalPlan), simulateRemainingGamesToday, advanceDay, startNextSeason, releasePlayer, signFreeAgent, selectDraftProspect, executeTrade, addRecruitingTarget, removeRecruitingTarget, performRecruitingAction, makeRecruitingOffer, acceptNilOpportunity, purchaseSkill: (id) => { const result = purchaseUserCoachSkill(id); if (!result.ok) setSaveMessage(result.reason) }, purchasePerk: (id) => { const result = purchaseUserCoachPerk(id); if (!result.ok) setSaveMessage(result.reason) }, acceptOffer: acceptUserCoachOffer, declineOffer: declineUserCoachOffer, applyForJob: applyUserCoachForJob, setTacticalPlan, resetTacticalPlan, setTrainingIntensity, setTrainingFocus, setCoachLifestyle: setUserCoachLifestyle, respondToMedia, skipMedia }

  return (
    <DesktopShell
      context={<GameContextBar onOpenSettings={() => openDesktopApp('settings')} onSearch={() => setGlobalSearchOpen(true)} world={world} />}
      density={density}
      dockAutoHide={dockAutoHide}
      widgets={<><DesktopWidgetLayer world={world} onAdvanceDay={advanceDay} onContinue={continueGame} onInstantResult={() => instantResult(tacticalPlan)} onOpenApp={openDesktopApp} onOpenPendingGame={(gameId) => { if (world.games[gameId]?.status === 'scheduled') startMatch(startLiveMatch(tacticalPlan)) }} onPlayGame={() => startMatch(startLiveMatch(tacticalPlan))} /><DesktopCanonicalSurfaceLayer visible={visualQaFixture} world={world} /></>}
      dock={<DesktopDock activeAppId={activeAppId} launcherOpen={launcherOpen} onAppOpen={openDesktopApp} onLauncherToggle={toggleLauncher} openAppIds={desktopWindows.map((window) => window.appId)} unreadCount={unreadInboxCount} />}
      overlay={<><DesktopLauncher activeAppId={activeAppId} capabilities={capabilities} canAdvanceDay={!seasonComplete} canLoad={hasSave} isOpen={launcherOpen && !globalSearchOpen} launcherOrder={launcherOrder} onAdvanceDay={advanceDay} onAppOpen={openDesktopApp} onClose={closeLauncher} onCustomizeDesktop={enterDesktopWidgetEditMode} onLoad={() => void loadGame()} onQueryChange={setLauncherQuery} onReorder={reorderLauncher} onSave={() => void saveGame()} query={launcherQuery} recentAppIds={recentAppIds} /><GlobalSearchOverlay canAdvanceDay={!seasonComplete} canLoad={hasSave} isOpen={globalSearchOpen} onAdvanceDay={advanceDay} onClose={() => setGlobalSearchOpen(false)} onCustomize={enterDesktopWidgetEditMode} onLoad={() => void loadGame()} onOpenApp={openDesktopApp} onSave={() => void saveGame()} world={world} /><EntityActionComposer onResult={executeComposerAction} /></>}
      status={<StatusCluster saveMessage={saveMessage} />}
      wallpaper={wallpaper}
    >
      <div className="app-shell">
        {desktopWindows.filter((window) => !window.minimized).map((window) => <DesktopWindow focused={window.id === focusedWindowId} key={window.id} onClose={() => closeWindow(window.id)} onFocus={() => focusWindow(window.id)} onMaximize={() => maximizeWindow(window.id)} onMinimize={() => minimizeWindow(window.id)} onMove={(position) => moveWindow(window.id, position)} onResize={(bounds) => resizeWindow(window.id, bounds)} onRestoreMaximized={() => restoreMaximizedWindow(window.id)} onSnap={(snap) => snapWindow(window.id, snap, { width: globalThis.innerWidth, height: globalThis.innerHeight })} title={desktopWindowTitle(window.appId, window.instanceId === undefined ? undefined : entityDestinations[window.instanceId], world)} window={window}><DesktopAppHost actions={desktopActions} appId={window.appId} entityDestination={window.instanceId === undefined ? undefined : entityDestinations[window.instanceId]} world={world} /></DesktopWindow>)}
      </div>
    </DesktopShell>
  )
}

function entityWindowId(destination: EntityDestination): string {
  if (destination.type === 'player') return `player-${destination.playerId}`
  if (destination.type === 'team') return `team-${destination.teamId}`
  return `competition-${destination.competitionId}`
}

function desktopWindowTitle(appId: string, destination: EntityDestination | undefined, world: Parameters<typeof getUserTeam>[0]) {
  if (appId !== 'entity' || destination === undefined) return undefined
  if (destination.type === 'player') { const player = world.players[destination.playerId]; return player === undefined ? 'Player profile' : `${player.firstName} ${player.lastName}` }
  if (destination.type === 'team') return destination.section === 'squad' ? 'Roster' : world.teams[destination.teamId]?.name
  return world.competitions[destination.competitionId]?.name
}

function defaultEntityWindowBounds(destination: EntityDestination): Partial<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number }> | undefined {
  const viewportWidth = typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : 1536
  const viewportHeight = typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : 1024
  const scale = Math.min(viewportWidth / 1920, viewportHeight / 1080)
  const playerWidth = Math.round(666 * scale)
  const playerX = viewportWidth - Math.round(30 * scale) - playerWidth
  const top = Math.round(76 * scale)
  if (destination.type === 'player') return { x: playerX, y: top, width: playerWidth, height: Math.round(695 * scale) }
  if (destination.type === 'team' && destination.section === 'squad') return { x: Math.round(344 * scale), y: top, width: Math.max(500, playerX - Math.round(20 * scale) - Math.round(344 * scale)), height: Math.round(637 * scale) }
  return undefined
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
