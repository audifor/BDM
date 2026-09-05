import { useMemo, useState, type CSSProperties } from 'react'

import type { PlayerId } from '@/domain/ids'

import { useGameStore } from '@/stores/gameStore'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { buildScoutingWorkspaceModel } from '@/ui-ng/applications/scouting/buildScoutingWorkspaceModel'
import {
  SCOUTING_TAB_LABELS,
  SCOUTING_WORKSPACE_TABS,
  type ScoutingAssignmentRow,
  type ScoutingOppositionRow,
  type ScoutingReportRow,
  type ScoutingWorkspaceModel,
  type ScoutingWorkspaceTabId,
} from '@/ui-ng/applications/scouting/scoutingWorkspaceModel'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'
import { getUserTeam } from '@/engine/calendar'

import './scouting-workspace.css'

function formatMetric(value: number | null): string {
  return value === null ? '—' : String(value)
}

function ScoutingWorkspaceHeader({ model }: { readonly model: ScoutingWorkspaceModel }) {
  return (
    <header className="scouting-workspace-header" data-ng-region="scouting-workspace-header">
      <div className="scouting-workspace-header__main">
        <span className="scouting-workspace-header__app">Scouting</span>
        <span className="scouting-workspace-header__sep" aria-hidden />
        <span className="scouting-workspace-header__team">{model.teamName}</span>
        <span className="scouting-workspace-header__meta">
          <span className="ng-type-numeric">{model.knownSubjectCount}</span> known
          {' · '}
          <span className="ng-type-numeric">{model.openAssignmentCount}</span> open
          {' · '}
          <span className="ng-type-numeric">{model.reportCount}</span> reports
          {' · '}
          <span className="ng-type-numeric">{model.oppositionCount}</span> opposition
        </span>
      </div>
    </header>
  )
}

function KnowledgeBoard({
  model,
  onOpenPlayer,
  onRequest,
}: {
  readonly model: ScoutingWorkspaceModel
  readonly onOpenPlayer: (playerId: PlayerId) => void
  readonly onRequest: (playerId: PlayerId) => void
}) {
  if (model.knowledge.length === 0) {
    return <p className="scouting-workspace__empty">No players available for organization knowledge.</p>
  }

  const rows = model.knowledge.map((row) => ({ ...row, id: row.playerId }))
  const evaluationColumns = (model.knowledge[0]?.evaluations ?? []).map((evaluation) =>
    ngCol<(typeof rows)[number]>(
      evaluation.dimension,
      evaluation.label,
      (row) => row.evaluations.find((item) => item.dimension === evaluation.dimension)?.evaluationLabel ?? '—',
      {
        numeric: true,
        value: (row) => row.evaluations.find((item) => item.dimension === evaluation.dimension)?.evaluationLabel ?? '',
      },
    ),
  )

  return (
    <div className="scouting-workspace__panel ng-holo-panel">
      <NgPrecisionTable
        className="scouting-workspace__table"
        columns={[
          ngCol('name', 'Player', (row) => (
            <>
              <button className="scouting-workspace__link" onClick={() => onOpenPlayer(row.playerId)} type="button">
                {row.name}
              </button>
              {row.isOwnRoster ? <span className="scouting-workspace__tag">Own</span> : null}
            </>
          ), { value: (row) => row.name }),
          ngCol('pos', 'Pos', (row) => <PlayPositionMark position={row.position} />, { value: (row) => row.position }),
          ngCol('club', 'Club', (row) => row.clubName, { value: (row) => row.clubName }),
          ngCol('coverage', 'Coverage', (row) => row.coverageLabel, { numeric: true, value: (row) => row.coverageLabel }),
          ngCol('confidence', 'Confidence', (row) => row.confidenceLabel, { numeric: true, value: (row) => row.confidenceLabel }),
          ngCol('freshness', 'Freshness', (row) => row.freshnessLabel, { numeric: true, value: (row) => row.freshnessLabel }),
          ngCol('value', 'Value', (row) => formatMetric(row.valuationCurrent), {
            numeric: true,
            value: (row) => row.valuationCurrent ?? '',
            sortValue: (row) => row.valuationCurrent ?? -1,
          }),
          ngCol('certainty', 'Certainty', (row) => formatMetric(row.valuationCertainty), {
            numeric: true,
            value: (row) => row.valuationCertainty ?? '',
            sortValue: (row) => row.valuationCertainty ?? -1,
          }),
          ngCol('risk', 'Risk', (row) => formatMetric(row.valuationRisk), {
            numeric: true,
            value: (row) => row.valuationRisk ?? '',
            sortValue: (row) => row.valuationRisk ?? -1,
          }),
          ...evaluationColumns,
          ngCol('action', 'Action', (row) => (
            <button
              className="ng-btn ng-btn--primary"
              disabled={!model.canRequestScouting || row.hasOpenQuickLook}
              onClick={() => onRequest(row.playerId)}
              type="button"
            >
              {row.hasOpenQuickLook ? 'Queued' : 'Quick look'}
            </button>
          ), { sortable: false, value: (row) => (row.hasOpenQuickLook ? 'Queued' : 'Quick look') }),
        ]}
        gridId="ng-scouting-knowledge"
        rows={rows}
      />
      {model.requestUnavailableLabel !== null && (
        <p className="scouting-workspace__note">{model.requestUnavailableLabel}</p>
      )}
    </div>
  )
}

function AssignmentBoard({
  rows,
  onOpenPlayer,
}: {
  readonly rows: readonly ScoutingAssignmentRow[]
  readonly onOpenPlayer: (playerId: PlayerId) => void
}) {
  if (rows.length === 0) {
    return <p className="scouting-workspace__empty">No scouting assignments for this organization.</p>
  }

  return (
    <div className="scouting-workspace__panel ng-holo-panel">
      <NgPrecisionTable
        className="scouting-workspace__table"
        columns={[
          ngCol('name', 'Player', (row) => (
            <button className="scouting-workspace__link" onClick={() => onOpenPlayer(row.playerId)} type="button">
              {row.playerName}
            </button>
          ), { value: (row) => row.playerName }),
          ngCol('mission', 'Mission', (row) => row.missionLabel, { value: (row) => row.missionLabel }),
          ngCol('status', 'Status', (row) => row.statusLabel, { value: (row) => row.statusLabel }),
          ngCol('priority', 'Priority', (row) => row.priorityLabel, { value: (row) => row.priorityLabel }),
          ngCol('evaluator', 'Evaluator', (row) => row.evaluatorName, { value: (row) => row.evaluatorName }),
          ngCol('created', 'Created', (row) => row.createdLabel, { value: (row) => row.createdLabel }),
          ngCol('expected', 'Expected', (row) => row.expectedLabel ?? '—', { value: (row) => row.expectedLabel ?? '' }),
        ]}
        gridId="ng-scouting-assignments"
        rows={rows}
      />
    </div>
  )
}

function ReportBoard({
  rows,
  onOpenPlayer,
}: {
  readonly rows: readonly ScoutingReportRow[]
  readonly onOpenPlayer: (playerId: PlayerId) => void
}) {
  if (rows.length === 0) {
    return <p className="scouting-workspace__empty">No evaluator reports yet.</p>
  }

  return (
    <div className="scouting-workspace__list">
      {rows.map((row) => (
        <article className="scouting-workspace__panel ng-holo-panel" key={row.id}>
          <header className="scouting-workspace__card-head">
            <button className="scouting-workspace__link" onClick={() => onOpenPlayer(row.playerId)} type="button">
              {row.playerName}
            </button>
            <span>{row.missionLabel}</span>
            <span>{row.evaluatorName}</span>
            <span>{row.createdLabel}</span>
            {row.tacticalFitLabel !== null ? <span>Fit {row.tacticalFitLabel}</span> : null}
          </header>
          <ul className="scouting-workspace__findings">
            {row.findings.map((finding) => (
              <li key={`${row.id}:${finding.dimension}`}>
                <span>{finding.dimensionLabel}</span>
                <strong className="ng-type-numeric">{finding.evaluationLabel}</strong>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}

function OppositionBoard({
  rows,
  onOpenPlayer,
}: {
  readonly rows: readonly ScoutingOppositionRow[]
  readonly onOpenPlayer: (playerId: PlayerId) => void
}) {
  if (rows.length === 0) {
    return <p className="scouting-workspace__empty">No opposition scouting reports.</p>
  }

  return (
    <div className="scouting-workspace__list">
      {rows.map((row) => (
        <article className="scouting-workspace__panel ng-holo-panel" key={row.id}>
          <header className="scouting-workspace__card-head">
            <strong>{row.opponentName}</strong>
            <span>{row.gameDateLabel}</span>
            <span>Quality {row.qualityScore}</span>
            <span>{row.emphasisLabel ?? 'No emphasis'}</span>
            <span>{row.paceLabel === null ? 'Pace —' : `Pace ${row.paceLabel}`}</span>
            <span>{row.authoredBy}</span>
          </header>
          {row.flaggedPlayers.length > 0 ? (
            <ul className="scouting-workspace__findings">
              {row.flaggedPlayers.map((player) => (
                <li key={player.playerId}>
                  <button className="scouting-workspace__link" onClick={() => onOpenPlayer(player.playerId)} type="button">
                    {player.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="scouting-workspace__note">No flagged players.</p>
          )}
        </article>
      ))}
    </div>
  )
}

export function ScoutingWorkspace() {
  const world = useGameStore((state) => state.world)
  const requestScoutingAssignment = useGameStore((state) => state.requestScoutingAssignment)
  const { openEntity } = useNgWorkspaceNavigation()
  const [activeTab, setActiveTab] = useState<ScoutingWorkspaceTabId>('knowledge')

  const model = useMemo(() => (world === null ? null : buildScoutingWorkspaceModel(world)), [world])
  const team = useMemo(() => (world === null ? undefined : getUserTeam(world)), [world])
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
      SCOUTING_WORKSPACE_TABS.map((id) => ({
        id,
        label: SCOUTING_TAB_LABELS[id],
        active: id === activeTab,
      })),
    [activeTab],
  )

  const openPlayer = (playerId: PlayerId) => {
    openEntity({ type: 'player', playerId, section: 'overview' })
  }

  if (world === null || model === null) {
    return (
      <div className="scouting-workspace scouting-workspace--empty" data-ng-region="scouting-workspace">
        <section className="scouting-workspace__empty-state">
          <h1 className="scouting-workspace__empty-title">Scouting</h1>
          <p className="scouting-workspace__empty-message">No team assigned to the user coach.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="scouting-workspace" data-ng-region="scouting-workspace" style={teamStyle}>
      <ApplicationWorkspace
        header={<ScoutingWorkspaceHeader model={model} />}
        tabs={
          <WorkspaceTabs
            activeTabId={activeTab}
            onTabSelect={(tabId) => setActiveTab(tabId as ScoutingWorkspaceTabId)}
            tabs={tabs}
          />
        }
      >
        <ScrollRegion className="scouting-workspace__scroll">
          {activeTab === 'knowledge' ? (
            <KnowledgeBoard model={model} onOpenPlayer={openPlayer} onRequest={requestScoutingAssignment} />
          ) : null}
          {activeTab === 'assignments' ? (
            <AssignmentBoard onOpenPlayer={openPlayer} rows={model.assignments} />
          ) : null}
          {activeTab === 'reports' ? <ReportBoard onOpenPlayer={openPlayer} rows={model.reports} /> : null}
          {activeTab === 'opposition' ? (
            <OppositionBoard onOpenPlayer={openPlayer} rows={model.opposition} />
          ) : null}
        </ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}
