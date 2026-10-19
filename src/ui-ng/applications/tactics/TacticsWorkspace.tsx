import { useMemo, useState, type CSSProperties } from 'react'

import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { TacticsPcbPage, TACTICS_PCB_TABS, type TacticsPcbTab } from '@/ui/pcb-migrated/tactics/TacticsPcbPage'
import { CourtsideTacticsPanels } from '@/ui-ng/applications/tactics/CourtsideTacticsPanels'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import {
  buildRosterWorkspaceContext,
  rosterTeamForWorld,
} from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'

import './tactics-workspace.css'
import './courtside-tactics.css'
import './courtside-tactics-unified.css'

const CT_PAGE_TITLES: Record<TacticsPcbTab, string> = {
  board: 'PIZARRA', designer: 'DISEÑADOR', matchups: 'EMPAREJAMIENTOS', rotations: 'ROTACIONES', match: 'PLAN DE PARTIDO',
}
const CT_PAGE_DESCRIPTIONS: Record<TacticsPcbTab, string> = {
  board: 'Organiza el quinteto y define cómo quieres jugar.',
  designer: 'Dibuja, edita y reproduce jugadas.',
  matchups: 'Prepara los duelos defensivos contra el próximo rival.',
  rotations: 'Distribuye los minutos con las reglas de tu competición.',
  match: 'Prepara y aplica instrucciones reales para el siguiente encuentro.',
}

function TacticsWorkspaceHeader({
  teamName,
  competitionLabel,
  seasonLabel,
  opponentName,
}: {
  readonly teamName: string
  readonly competitionLabel: string | null
  readonly seasonLabel: string | null
  readonly opponentName: string | null
}) {
  return (
    <header className="tactics-workspace-header" data-ng-region="tactics-workspace-header">
      <div className="tactics-workspace-header__main">
        <span className="tactics-workspace-header__app">Tactics</span>
        <span className="tactics-workspace-header__sep" aria-hidden />
        <span className="tactics-workspace-header__team">{teamName}</span>
        <span className="tactics-workspace-header__meta">
          {competitionLabel ?? '—'}
          {' · '}
          {seasonLabel ?? '—'}
          {opponentName === null ? null : ` · vs ${opponentName}`}
        </span>
      </div>
    </header>
  )
}

export function TacticsWorkspace() {
  const world = useGameStore((state) => state.world)
  const setLineupSlot = useGameStore((state) => state.setLineupSlot)
  const clearLineupSlot = useGameStore((state) => state.clearLineupSlot)
  const updateRotationMinutes = useGameStore((state) => state.updateRotationMinutes)
  const updateGamePlanMatchups = useGameStore((state) => state.updateGamePlanMatchups)
  const updateGamePlanTacticalOverride = useGameStore((state) => state.updateGamePlanTacticalOverride)
  const saveDesignerPlay = useGameStore((state) => state.saveDesignerPlay)
  const deleteDesignerPlay = useGameStore((state) => state.deleteDesignerPlay)
  const saveDesignerPlaybook = useGameStore((state) => state.saveDesignerPlaybook)
  const deleteDesignerPlaybook = useGameStore((state) => state.deleteDesignerPlaybook)
  const updateTeamTacticalPlan = useGameStore((state) => state.updateTeamTacticalPlan)
  const clearGamePlanTacticalOverride = useGameStore((state) => state.clearGamePlanTacticalOverride)
  const lineupNotice = useGameStore((state) => state.lineupNotice)
  const clearLineupNotice = useGameStore((state) => state.clearLineupNotice)
  const [activeTab, setActiveTab] = useState<Exclude<TacticsPcbTab, 'designer'>>('board')
  const [boardMode, setBoardMode] = useState<'prepare' | 'design' | 'analyse'>('prepare')
  const { openEntity } = useNgWorkspaceNavigation()

  const context = useMemo(() => (world === null ? null : buildRosterWorkspaceContext(world)), [world])
  const team = useMemo(() => (world === null ? undefined : rosterTeamForWorld(world)), [world])
  const opponentName = useMemo(() => {
    if (world === null || team === undefined) return null
    const nextGame = getNextUserGame(world)
    if (nextGame === undefined) return null
    const opponent = world.teams[nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId]
    return opponent?.name ?? null
  }, [team, world])
  const teamStyle = useMemo(() => {
    if (team === undefined) return undefined
    const colors = deriveTeamColors(team.id)
    return {
      '--po-team-primary': colors.primary,
      '--po-team-secondary': colors.secondary,
      '--po-team-muted': colors.muted,
    } as CSSProperties
  }, [team])
  const tabs = useMemo(
    () =>
      TACTICS_PCB_TABS.filter(([id]) => id !== 'designer').map(([id, label]) => ({
        id,
        label: id === 'match' ? 'PLAN DE PARTIDO' : label,
        active: id === activeTab,
      })),
    [activeTab],
  )

  if (world === null || context === null || team === undefined || getUserTeam(world) === undefined) {
    return (
      <div className="tactics-workspace tactics-workspace--empty" data-ng-region="tactics-workspace">
        <section className="tactics-workspace__empty-state">
          <h1 className="tactics-workspace__empty-title">Tactics</h1>
          <p className="tactics-workspace__empty-message">No team assigned to the user coach.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="tactics-workspace ct-courtside" data-ng-region="tactics-workspace" style={teamStyle}>
      <ApplicationWorkspace
        header={
          <TacticsWorkspaceHeader
            competitionLabel={context.competitionLabel}
            opponentName={opponentName}
            seasonLabel={context.seasonLabel}
            teamName={context.teamName}
          />
        }
        tabs={
          <WorkspaceTabs
            activeTabId={activeTab}
            onTabSelect={(tabId) => setActiveTab(tabId as Exclude<TacticsPcbTab, 'designer'>)}
            tabs={tabs}
          />
        }
      >
        <ScrollRegion className="tactics-workspace__scroll">
          <div className="ct-page" data-courtside-tactics-screen={activeTab === 'board' ? boardMode === 'prepare' ? 'board' : 'designer' : activeTab} aria-label={CT_PAGE_DESCRIPTIONS[activeTab]}>
            <h1 className="ct-page__sr-only">{CT_PAGE_TITLES[activeTab]}</h1>
            {lineupNotice === null ? null : <p className="tactics-workspace__notice" role="alert">{lineupNotice} <button onClick={clearLineupNotice} type="button">Entendido</button></p>}
            {activeTab === 'board' ? <>
              <div className="ct-unified-switch" role="group" aria-label="Modo de Pizarra">
                {([
                  ['prepare', 'PREPARAR', 'Quinteto y ajustes del equipo'],
                  ['design', 'DISEÑAR', 'Dibujar y guardar jugadas'],
                  ['analyse', 'ANALIZAR', 'Zonas de tiro y movimientos sugeridos'],
                ] as const).map(([id, label, description]) =>
                  <button type="button" key={id} className={boardMode === id ? 'is-active' : ''}
                    aria-pressed={boardMode === id} title={description}
                    onClick={() => setBoardMode(id)}>{label}</button>)}
                <span className="ct-unified-switch__context">MISMO QUINTETO · MISMA PARTIDA · JUGADAS EDITABLES</span>
              </div>
              <div className="ct-legacy-content ct-unified-content"><TacticsPcbPage
            activeTab={boardMode === 'prepare' ? 'board' : 'designer'}
            keepDesignerMounted
            creatorMode={boardMode === 'analyse' ? 'lab' : 'edit'}
            onChange={updateGamePlanTacticalOverride}
            onDeleteDesignerPlay={deleteDesignerPlay}
            onDeleteDesignerPlaybook={deleteDesignerPlaybook}
            onLineupSlotChange={setLineupSlot}
            onLineupSlotClear={clearLineupSlot}
            onOpenPlayer={(playerId) => openEntity({ type: 'player', playerId, section: 'overview' })}
            onReset={clearGamePlanTacticalOverride}
            onSaveDesignerPlay={saveDesignerPlay}
            onSaveDesignerPlaybook={saveDesignerPlaybook}
            onUpdateTeamPlan={updateTeamTacticalPlan}
            onUpdateMatchups={updateGamePlanMatchups}
            onUpdateRotationMinutes={updateRotationMinutes}
            variant="ng"
            world={world}
          /></div></> : (
            <CourtsideTacticsPanels
              tab={activeTab}
              world={world}
              teamId={team.id}
              onOpenPlayer={(playerId) => openEntity({ type: 'player', playerId, section: 'overview' })}
            />
          )}
          </div>
        </ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}
