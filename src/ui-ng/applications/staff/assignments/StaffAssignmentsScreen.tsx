import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  STAFF_ASSIGNMENT_STRATEGIES,
  STAFF_ASSIGNMENT_STRATEGY_DESCRIPTIONS,
  STAFF_ASSIGNMENT_STRATEGY_LABELS,
  planStaffAssignments,
  planStaffOptimization,
  type StaffAssignmentScope,
  type StaffAssignmentStrategy,
} from '@/app/staffAssignments'
import type { ResponsibilityKind } from '@/domain/responsibility'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { RESPONSIBILITY_KIND_LABELS } from '@/ui/staffPresentation'
import { WorkloadBar } from '@/ui-ng/applications/staff/assignments/StaffAssignmentChrome'
import {
  buildStaffAssignmentsModel,
  fullCandidateList,
  matrixFilterForKpi,
  matchesMatrixFilter,
  type MatrixFilter,
  type StaffAssignmentCandidate,
  type StaffAssignmentRow,
} from '@/ui-ng/applications/staff/assignments/staffAssignmentsModel'

import './staff-assignments.css'

export interface StaffAssignmentsScreenProps {
  readonly world: GameWorld
  readonly teamId: TeamId
  /** Imperative request from the workspace header (which owns the action buttons). */
  readonly panelRequest?: StaffAssignmentPanelRequest | null
  readonly onPanelRequestHandled?: () => void
}

/** Which overlay the workspace header asked the screen to open. */
export interface StaffAssignmentPanelRequest {
  readonly kind: 'autoAssign' | 'optimize' | 'newAssignment'
}

/**
 * Staff Assignments — dense operational workstation (assignment matrix + advanced inspector).
 *
 * V2 quick assignment: the PRIMARY cell of every matrix row is itself the control. Clicking it
 * opens a small anchored popover listing the best-ranked candidates, so a normal assignment takes
 * two clicks and never routes through the inspector. The inspector stays available as the deep
 * analysis surface, opened deliberately from the responsibility name or its ⓘ.
 */
export function StaffAssignmentsScreen({ world, teamId, panelRequest = null, onPanelRequestHandled }: StaffAssignmentsScreenProps) {
  const model = useMemo(() => buildStaffAssignmentsModel(world, teamId), [world, teamId])
  const setStaffResponsibility = useGameStore((state) => state.setStaffResponsibility)
  const applyStrategy = useGameStore((state) => state.applyStaffAssignmentStrategy)
  const applyOptimization = useGameStore((state) => state.applyStaffOptimization)

  const [selectedKind, setSelectedKind] = useState<ResponsibilityKind | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [matrixFilter, setMatrixFilter] = useState<MatrixFilter>('none')
  const [quickAssign, setQuickAssign] = useState<{ readonly kind: ResponsibilityKind; readonly anchor: HTMLElement } | null>(null)
  const [autoAssign, setAutoAssign] = useState<{ readonly scope: StaffAssignmentScope; readonly title: string } | null>(null)
  const [optimizeOpen, setOptimizeOpen] = useState(false)
  const [newAssignmentOpen, setNewAssignmentOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), 1500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (panelRequest === null) return
    if (panelRequest.kind === 'autoAssign') setAutoAssign({ scope: {}, title: 'AUTO-ASSIGN STAFF' })
    if (panelRequest.kind === 'optimize') setOptimizeOpen(true)
    if (panelRequest.kind === 'newAssignment') setNewAssignmentOpen(true)
    onPanelRequestHandled?.()
  }, [onPanelRequestHandled, panelRequest])

  const rows = useMemo(() => [...model.rowsByKind.values()], [model])
  const vacantRows = useMemo(() => rows.filter((row) => row.assignable && row.holder === undefined), [rows])
  const visibleGroups = useMemo(
    () =>
      model.groups
        .map((group) => ({ ...group, rows: group.rows.filter((row) => matchesMatrixFilter(row, matrixFilter)) }))
        .filter((group) => group.rows.length > 0),
    [matrixFilter, model.groups],
  )
  const selected =
    (selectedKind === null ? undefined : model.rowsByKind.get(selectedKind)) ??
    rows.find((row) => row.assignable && row.holder === undefined) ??
    rows[0]

  const quickAssignRow = quickAssign === null ? undefined : model.rowsByKind.get(quickAssign.kind)

  const assign = useCallback(
    (row: StaffAssignmentRow, candidate: StaffAssignmentCandidate) => {
      if (candidate.isManager) {
        setStaffResponsibility({ teamId, kind: row.kind, mode: 'userControlled' })
      } else if (candidate.staffPersonId !== null && row.delegationMode !== undefined) {
        setStaffResponsibility({ teamId, kind: row.kind, mode: row.delegationMode, holderStaffId: candidate.staffPersonId })
      }
      setQuickAssign(null)
      setToast('✓ Assignment updated')
    },
    [setStaffResponsibility, teamId],
  )

  const unassign = useCallback(
    (row: StaffAssignmentRow) => {
      setStaffResponsibility({ teamId, kind: row.kind, mode: 'userControlled' })
      setQuickAssign(null)
      setToast('✓ Assignment updated')
    },
    [setStaffResponsibility, teamId],
  )

  const openInspector = (kind: ResponsibilityKind) => {
    setSelectedKind(kind)
    setInspectorOpen(true)
  }

  const toggleFilter = (filter: MatrixFilter) => setMatrixFilter((current) => (current === filter ? 'none' : filter))

  return (
    <div className="sa-root" data-ng-region="staff-assignments">
      <section aria-label="Assignment summary" className="sa-strip">
        <ul className="sa-kpis">
          {model.kpis.map((kpi) => {
            const filter = matrixFilterForKpi(kpi.id)
            const isActive = filter !== undefined && filter === matrixFilter
            return (
              <li className={isActive ? `sa-kpi sa-tone-${kpi.tone} is-active` : `sa-kpi sa-tone-${kpi.tone}`} key={kpi.id}>
                {filter === undefined ? (
                  <>
                    <span className="sa-kpi__value ng-type-numeric">{kpi.value}</span>
                    <span className="sa-kpi__label">{kpi.label}</span>
                  </>
                ) : (
                  <button
                    aria-pressed={isActive}
                    className="sa-kpi__button"
                    onClick={() => toggleFilter(filter)}
                    title={`Filter the matrix: ${kpi.label}`}
                    type="button"
                  >
                    <span className="sa-kpi__value ng-type-numeric">{kpi.value}</span>
                    <span className="sa-kpi__label">{kpi.label}</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <div className="sa-separator-v" />
        <ul className="sa-coverage">
          {model.coverage.map((block) => (
            <li className={`sa-coverage__item sa-tone-${block.tone}`} key={block.domain} title={block.detail}>
              <span className="sa-coverage__label">{block.label}</span>
              <span className="sa-coverage__value ng-type-numeric">{block.percentLabel}</span>
              <span className="sa-coverage__track">
                <span className="sa-coverage__fill" style={{ width: block.percentLabel }} />
              </span>
            </li>
          ))}
        </ul>
        {matrixFilter === 'none' ? null : (
          <button className="sa-clear-filter" onClick={() => setMatrixFilter('none')} type="button">
            CLEAR FILTER
          </button>
        )}
      </section>

      <div className={inspectorOpen && selected !== undefined ? 'sa-workspace' : 'sa-workspace sa-workspace--no-inspector'}>
        <section aria-label="Assignment matrix" className="sa-panel sa-matrix ng-holo-panel">
          <header className="sa-panel__header">
            <h2 className="sa-panel__title">ASSIGNMENT MATRIX</h2>
            <span className="sa-panel__meta">Click a primary cell to assign</span>
          </header>
          <div className="sa-matrix__head" role="row">
            <span>Responsibility</span>
            <span>Primary</span>
            <span>Backup</span>
            <span>Load</span>
            <span>Coverage</span>
            <span>Status</span>
          </div>
          <div className="sa-matrix__body">
            {visibleGroups.length === 0 ? <p className="sa-empty">No responsibility matches this filter.</p> : null}
            {visibleGroups.map((group) => (
              <div className="sa-group" key={group.domain}>
                <div className="sa-group__head">
                  <span className="sa-group__title">{group.label}</span>
                  <button
                    className="sa-group__auto"
                    disabled={group.openCount === 0}
                    onClick={() =>
                      setAutoAssign({ scope: { domain: group.domain }, title: `AUTO-ASSIGN · ${group.label}` })
                    }
                    title={`Auto-assign all ${group.label} responsibilities`}
                    type="button"
                  >
                    AUTO
                  </button>
                </div>
                {group.rows.map((row) => (
                  <AssignmentMatrixRow
                    isSelected={selected?.kind === row.kind}
                    key={row.kind}
                    onOpenInspector={() => openInspector(row.kind)}
                    onOpenQuickAssign={(anchor) => setQuickAssign({ kind: row.kind, anchor })}
                    row={row}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>

        {inspectorOpen && selected !== undefined ? (
          <aside aria-label="Assignment inspector" className="sa-panel sa-inspector ng-holo-panel">
            <header className="sa-panel__header">
              <h2 className="sa-panel__title">ASSIGNMENT INSPECTOR</h2>
              <button aria-label="Close inspector" className="sa-icon-button" onClick={() => setInspectorOpen(false)} type="button">
                ×
              </button>
            </header>
            <div className="sa-inspector__body">
              <InspectorSummary row={selected} />
              <InspectorCurrentAssignment row={selected} />
              <InspectorSuitability row={selected} />
              <InspectorKeyMatches row={selected} />
              <InspectorOptions
                onAssign={(candidate) => assign(selected, candidate)}
                onModeChange={(mode) => {
                  setStaffResponsibility({ teamId, kind: selected.kind, mode })
                  setToast('✓ Assignment updated')
                }}
                row={selected}
              />
              <InspectorAlternatives onOpenAssign={(anchor) => setQuickAssign({ kind: selected.kind, anchor })} row={selected} />
            </div>
          </aside>
        ) : null}
      </div>

      {toast === null ? null : (
        <p className="sa-toast" role="status">
          {toast}
        </p>
      )}

      {quickAssignRow === undefined || quickAssign === null ? null : (
        <QuickAssignPopover
          anchor={quickAssign.anchor}
          candidates={quickAssignRow.recommendations}
          kindLabel={quickAssignRow.kindLabel}
          manager={quickAssignRow.managerOption}
          onAssign={(candidate) => assign(quickAssignRow, candidate)}
          onClose={() => setQuickAssign(null)}
          onUnassign={() => unassign(quickAssignRow)}
          world={world}
        />
      )}

      {autoAssign === null ? null : (
        <AutoAssignPopover
          onApply={(strategy) => {
            const applied = applyStrategy(teamId, strategy, autoAssign.scope)
            setAutoAssign(null)
            setToast(applied === 0 ? 'Nothing left to change' : `✓ ${applied} assignments applied`)
          }}
          onClose={() => setAutoAssign(null)}
          scope={autoAssign.scope}
          teamId={teamId}
          title={autoAssign.title}
          world={world}
        />
      )}

      {optimizeOpen ? (
        <OptimizePopover
          onApply={() => {
            const applied = applyOptimization(teamId)
            setOptimizeOpen(false)
            setToast(applied === 0 ? 'No improvements found' : `✓ ${applied} improvements applied`)
          }}
          onClose={() => setOptimizeOpen(false)}
          teamId={teamId}
          world={world}
        />
      ) : null}

      {newAssignmentOpen ? (
        <ModalBackdrop onClose={() => setNewAssignmentOpen(false)}>
          <div aria-label="New assignment" className="sa-modal ng-holo-float" role="dialog">
            <p className="sa-popover__title">NEW ASSIGNMENT</p>
            <p className="sa-popover__subtitle">
              BDM responsibilities are a fixed catalogue per team — {vacantRows.length} of them have no staff holder yet.
            </p>
            <ul className="sa-popover__list">
              {vacantRows.length === 0 ? <li className="sa-popover__empty">Every staff-eligible responsibility has a holder.</li> : null}
              {vacantRows.map((row) => (
                <li key={row.kind}>
                  <button
                    className="sa-popover__item"
                    onClick={() => {
                      openInspector(row.kind)
                      setNewAssignmentOpen(false)
                    }}
                    type="button"
                  >
                    <span>{row.kindLabel}</span>
                    <span className="sa-popover__item-meta">{row.domainLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="sa-popover__actions">
              <button className="sa-action" onClick={() => setNewAssignmentOpen(false)} type="button">
                CLOSE
              </button>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </div>
  )
}

function AssignmentMatrixRow({
  row,
  isSelected,
  onOpenInspector,
  onOpenQuickAssign,
}: {
  readonly row: StaffAssignmentRow
  readonly isSelected: boolean
  readonly onOpenInspector: () => void
  readonly onOpenQuickAssign: (anchor: HTMLElement) => void
}) {
  return (
    <div className={isSelected ? 'sa-row is-selected' : 'sa-row'} role="row">
      <span className="sa-row__cell sa-row__responsibility">
        <button className="sa-row__kind" onClick={onOpenInspector} type="button">
          {row.kindLabel}
        </button>
        <span className="sa-row__kind-meta">
          {row.modeLabel}
          <button aria-label={`Open inspector for ${row.kindLabel}`} className="sa-row__info" onClick={onOpenInspector} type="button">
            ⓘ
          </button>
        </span>
      </span>
      <span className="sa-row__cell sa-row__primary">
        <button
          className={row.holder === undefined ? 'sa-quick sa-quick--empty' : 'sa-quick'}
          disabled={!row.assignable}
          onClick={(event) => onOpenQuickAssign(event.currentTarget)}
          title={row.assignable ? 'Quick assign' : 'Head-Coach-only responsibility'}
          type="button"
        >
          {row.holder === undefined ? (
            <span className="sa-quick__empty-label">{row.assignable ? '+ ASSIGN' : row.postureLabel}</span>
          ) : (
            <>
              <span aria-hidden className="sa-avatar sa-avatar--row">
                {row.holder.initials}
              </span>
              <span className="sa-quick__person">
                <span className="sa-row__person-name">{row.holder.name}</span>
                <span className="sa-row__person-role">{row.holder.roleLabel}</span>
              </span>
              <span aria-hidden className="sa-quick__caret">
                ▾
              </span>
            </>
          )}
        </button>
      </span>
      <span className="sa-row__cell sa-row__backup" title="Best eligible alternative — not assigned">
        {row.backup === undefined ? (
          <span className="sa-row__posture">—</span>
        ) : (
          <span className="sa-row__person">
            <span className="sa-row__person-name">{row.backup.name}</span>
            <span className="sa-row__person-role">
              {row.backup.roleLabel} · {row.backup.proficiency}
            </span>
          </span>
        )}
      </span>
      <span className="sa-row__cell sa-row__load">
        <span className={`sa-row__load-value ng-type-numeric sa-tone-${row.loadTone}`}>{row.loadLabel}</span>
        {row.loadRatio === undefined ? null : <WorkloadBar tone={row.loadTone} value={row.loadRatio} />}
      </span>
      <span className="sa-row__cell sa-row__coverage">
        <span className={`sa-coverage__value ng-type-numeric sa-tone-${row.coverageTone}`}>{row.coverageLabel}</span>
        {row.holder === undefined ? null : (
          <span className={`sa-bar sa-tone-${row.coverageTone}`}>
            <span className="sa-bar__fill" style={{ width: `${Math.min(100, row.holder.proficiency)}%` }} />
          </span>
        )}
      </span>
      <span className="sa-row__cell sa-row__status">
        <span className={`sa-pill sa-pill--${row.statusTone}`}>{row.statusLabel}</span>
      </span>
    </div>
  )
}

/** Popover anchored to a table cell, portaled so the panel's `overflow: hidden` cannot clip it. */
function AnchoredPopover({
  anchor,
  className,
  onClose,
  children,
}: {
  readonly anchor: HTMLElement
  readonly className: string
  readonly onClose: () => void
  readonly children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ readonly top: number; readonly left: number } | undefined>(undefined)

  useLayoutEffect(() => {
    const shell = document.querySelector('[data-ng-shell="bdm-os-ng"]') as HTMLElement | null
    const host = shell ?? document.body
    const hostRect = shell === null ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight } : shell.getBoundingClientRect()
    const scaleX = shell === null || shell.offsetWidth === 0 ? 1 : hostRect.width / shell.offsetWidth
    const scaleY = shell === null || shell.offsetHeight === 0 ? 1 : hostRect.height / shell.offsetHeight
    const anchorRect = anchor.getBoundingClientRect()
    const width = (panelRef.current?.offsetWidth ?? 320) * scaleX
    setPosition({
      top: (anchorRect.bottom - hostRect.top) / scaleY + 4,
      left: Math.max(4, Math.min(anchorRect.left - hostRect.left, hostRect.width - width - 4)) / scaleX,
    })
  }, [anchor])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) === true || anchor.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [anchor, onClose])

  const host = typeof document === 'undefined' ? null : (document.querySelector('[data-ng-shell="bdm-os-ng"]') ?? document.body)
  if (host === null) return null

  return createPortal(
    <div
      className={`ng-holo-float ${className}`}
      ref={panelRef}
      style={position === undefined ? { visibility: 'hidden', position: 'fixed', top: 0, left: 0 } : { position: 'fixed', top: position.top, left: position.left }}
    >
      {children}
    </div>,
    host,
  )
}

function QuickAssignPopover({
  anchor,
  candidates,
  manager,
  kindLabel,
  onAssign,
  onUnassign,
  onClose,
  world,
}: {
  readonly anchor: HTMLElement
  readonly candidates: readonly StaffAssignmentCandidate[]
  readonly manager: StaffAssignmentCandidate | undefined
  readonly kindLabel: string
  readonly onAssign: (candidate: StaffAssignmentCandidate) => void
  readonly onUnassign: () => void
  readonly onClose: () => void
  readonly world: GameWorld
}) {
  const [showAll, setShowAll] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const list = useMemo(() => {
    const all = showAll ? candidates : candidates.slice(0, RECOMMENDED_VISIBLE)
    return manager === undefined ? all : [...all, manager]
  }, [candidates, manager, showAll])

  const active = list[Math.min(activeIndex, Math.max(0, list.length - 1))]

  return (
    <AnchoredPopover anchor={anchor} className="sa-popover" onClose={onClose}>
      <div
        className="sa-popover__body"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((index) => Math.min(index + 1, list.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter' && active !== undefined) {
            event.preventDefault()
            onAssign(active)
          }
        }}
        role="listbox"
        tabIndex={-1}
      >
        <p className="sa-popover__title">ASSIGN RESPONSIBILITY</p>
        <p className="sa-popover__subtitle">{kindLabel}</p>
        <p className="sa-popover__eyebrow">RECOMMENDED</p>
        <ul className="sa-candidates">
          {(showAll ? candidates : candidates.slice(0, RECOMMENDED_VISIBLE)).map((candidate, index) => (
            <CandidateOption
              candidate={candidate}
              isActive={index === activeIndex}
              key={candidate.staffPersonId}
              onHover={() => setActiveIndex(index)}
              onSelect={() => onAssign(candidate)}
            />
          ))}
          {candidates.length === 0 ? <li className="sa-popover__empty">No eligible staff for this responsibility.</li> : null}
        </ul>
        {manager === undefined ? null : (
          <>
            <p className="sa-popover__eyebrow">MANAGER</p>
            <ul className="sa-candidates">
              <CandidateOption
                candidate={manager}
                isActive={candidates.length === activeIndex}
                key="manager"
                onHover={() => setActiveIndex(candidates.length)}
                onSelect={() => onAssign(manager)}
              />
            </ul>
          </>
        )}
        {candidates.length > RECOMMENDED_VISIBLE && !showAll ? (
          <button className="sa-popover__link" onClick={() => setShowAll(true)} type="button">
            View all staff
          </button>
        ) : null}
        {active !== undefined && active.projectedOverloaded ? (
          <p className="sa-popover__warning">⚠ Workload would increase to {active.projectedLabel}</p>
        ) : null}
        <div className="sa-popover__footer">
          <button className="sa-popover__link" onClick={onUnassign} type="button">
            Unassign
          </button>
          <button className="sa-popover__link" onClick={onClose} type="button">
            Cancel
          </button>
        </div>
      </div>
    </AnchoredPopover>
  )
}

const RECOMMENDED_VISIBLE = 4

function CandidateOption({
  candidate,
  isActive,
  onSelect,
  onHover,
}: {
  readonly candidate: StaffAssignmentCandidate
  readonly isActive: boolean
  readonly onSelect: () => void
  readonly onHover: () => void
}) {
  return (
    <li>
      <button
        className={isActive ? 'sa-candidate is-active' : 'sa-candidate'}
        onClick={onSelect}
        onMouseEnter={onHover}
        role="option"
        aria-selected={isActive}
        type="button"
      >
        <span aria-hidden className="sa-avatar sa-avatar--candidate">
          {candidate.initials}
        </span>
        <span className="sa-candidate__who">
          <span className="sa-candidate__name">
            {candidate.isCurrent ? '✓ ' : ''}
            {candidate.name}
          </span>
          <span className="sa-candidate__role">{candidate.roleLabel}</span>
          <span className="sa-candidate__attrs">
            {candidate.attributes.map((attribute) => `${attribute.shortLabel} ${attribute.value}`).join(' · ')}
          </span>
        </span>
        <span className="sa-candidate__fit">
          <span className={`sa-candidate__fit-value ng-type-numeric sa-tone-${candidate.tone}`}>{candidate.suitability}</span>
          <span className={`sa-candidate__band sa-tone-${candidate.tone}`}>{candidate.band}</span>
          <span className="sa-candidate__load ng-type-numeric">LOAD {candidate.loadLabel}</span>
        </span>
      </button>
    </li>
  )
}

function AutoAssignPopover({
  world,
  teamId,
  scope,
  title,
  onApply,
  onClose,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly scope: StaffAssignmentScope
  readonly title: string
  readonly onApply: (strategy: StaffAssignmentStrategy) => void
  readonly onClose: () => void
}) {
  const [strategy, setStrategy] = useState<StaffAssignmentStrategy>('bestOverallFit')
  const [preview, setPreview] = useState(false)
  const program = useMemo(() => planStaffAssignments(world, teamId, strategy, scope), [scope, strategy, teamId, world])

  return (
    <ModalBackdrop onClose={onClose}>
      <div aria-label={title} className="sa-modal ng-holo-float" role="dialog">
        <p className="sa-popover__title">{preview ? 'AUTO-ASSIGN PREVIEW' : title}</p>
        {preview ? (
          <>
            <p className="sa-popover__subtitle">
              {program.changes.length} responsibilities changed · {program.unchanged} unchanged
              {program.workloadWarnings > 0 ? ` · ${program.workloadWarnings} workload warning` : ''}
            </p>
            <ul className="sa-preview">
              {program.changes.length === 0 ? <li className="sa-popover__empty">Nothing to change.</li> : null}
              {program.changes.map((change) => (
                <li className="sa-preview__row" key={change.kind}>
                  <span className="sa-preview__kind">{RESPONSIBILITY_KIND_LABELS[change.kind]}</span>
                  <span className="sa-preview__move">
                    {change.previousHolderName ?? 'UNASSIGNED'} → {change.holderName}
                  </span>
                  <span className={`sa-preview__gain sa-tone-${change.overloadWarning ? 'warning' : 'positive'} ng-type-numeric`}>
                    {change.suitabilityGain === undefined ? `FIT ${change.suitability}` : `+${change.suitabilityGain} fit`}
                  </span>
                </li>
              ))}
            </ul>
            <div className="sa-popover__actions">
              <button className="sa-action" onClick={() => setPreview(false)} type="button">
                CANCEL
              </button>
              <button className="sa-action sa-action--primary" disabled={program.changes.length === 0} onClick={() => onApply(strategy)} type="button">
                APPLY {program.changes.length} CHANGES
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="sa-popover__subtitle">Choose strategy</p>
            <ul className="sa-strategies">
              {STAFF_ASSIGNMENT_STRATEGIES.map((id) => (
                <li key={id}>
                  <label className={id === strategy ? 'sa-strategy is-active' : 'sa-strategy'}>
                    <input checked={id === strategy} name="sa-strategy" onChange={() => setStrategy(id)} type="radio" value={id} />
                    <span className="sa-strategy__body">
                      <span className="sa-strategy__label">{STAFF_ASSIGNMENT_STRATEGY_LABELS[id]}</span>
                      <span className="sa-strategy__description">{STAFF_ASSIGNMENT_STRATEGY_DESCRIPTIONS[id]}</span>
                    </span>
                    <span className="sa-strategy__count ng-type-numeric">{planStaffAssignments(world, teamId, id, scope).changes.length}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="sa-popover__actions">
              <button className="sa-action" onClick={onClose} type="button">
                CANCEL
              </button>
              <button className="sa-action sa-action--primary" disabled={program.changes.length === 0} onClick={() => setPreview(true)} type="button">
                PREVIEW
              </button>
            </div>
          </>
        )}
      </div>
    </ModalBackdrop>
  )
}

function OptimizePopover({
  world,
  teamId,
  onApply,
  onClose,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly onApply: () => void
  readonly onClose: () => void
}) {
  const suggestions = useMemo(() => planStaffOptimization(world, teamId), [teamId, world])

  return (
    <ModalBackdrop onClose={onClose}>
      <div aria-label="Optimization suggestions" className="sa-modal ng-holo-float" role="dialog">
        <p className="sa-popover__title">OPTIMIZATION SUGGESTIONS</p>
        <p className="sa-popover__subtitle">{suggestions.length} improvements found</p>
        <ul className="sa-preview">
          {suggestions.length === 0 ? <li className="sa-popover__empty">Every assignment is already the best available option.</li> : null}
          {suggestions.map((suggestion) => (
            <li className="sa-preview__row" key={suggestion.kind}>
              <span className="sa-preview__kind">{RESPONSIBILITY_KIND_LABELS[suggestion.kind]}</span>
              <span className="sa-preview__move">
                {suggestion.previousHolderName ?? 'UNASSIGNED'} → {suggestion.holderName}
              </span>
              <span className="sa-preview__gain sa-tone-positive ng-type-numeric">+{suggestion.suitabilityGain} fit</span>
            </li>
          ))}
        </ul>
        <div className="sa-popover__actions">
          <button className="sa-action" onClick={onClose} type="button">
            CANCEL
          </button>
          <button className="sa-action sa-action--primary" disabled={suggestions.length === 0} onClick={onApply} type="button">
            APPLY ALL
          </button>
        </div>
      </div>
    </ModalBackdrop>
  )
}

function ModalBackdrop({ children, onClose }: { readonly children: ReactNode; readonly onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="sa-backdrop" onClick={onClose} role="presentation">
      <div onClick={(event) => event.stopPropagation()} role="presentation">
        {children}
      </div>
    </div>
  )
}

function InspectorSummary({ row }: { readonly row: StaffAssignmentRow }) {
  return (
    <section className="sa-inspector__block">
      <p className="sa-inspector__eyebrow">{row.domainLabel}</p>
      <p className="sa-inspector__headline">{row.kindLabel}</p>
      <p className="sa-inspector__note">
        {row.modeLabel} · workload cost {row.capacityCost}
      </p>
      <p className="sa-inspector__note">
        {row.eligibleRoleLabels.length === 0 ? 'Head Coach only' : `Eligible staff: ${row.eligibleRoleLabels.join(' · ')}`}
      </p>
    </section>
  )
}

function InspectorCurrentAssignment({ row }: { readonly row: StaffAssignmentRow }) {
  return (
    <section className="sa-inspector__block">
      <p className="sa-inspector__eyebrow">CURRENT ASSIGNMENT</p>
      {row.holder === undefined ? (
        <p className="sa-inspector__empty">
          {row.assignable ? `No staff assigned — currently ${row.postureLabel.toLowerCase()}.` : 'Not delegable to staff.'}
        </p>
      ) : (
        <div className="sa-inspector__person">
          <span aria-hidden className="sa-avatar sa-avatar--inspector">
            {row.holder.initials}
          </span>
          <span>
            <span className="sa-inspector__person-name">{row.holder.name}</span>
            <span className="sa-inspector__person-role">{row.holder.roleLabel}</span>
          </span>
        </div>
      )}
    </section>
  )
}

function InspectorSuitability({ row }: { readonly row: StaffAssignmentRow }) {
  if (row.holder === undefined) return null
  const top = row.recommendations[0]
  const current = top?.isCurrent === true ? top : undefined
  return (
    <section className="sa-inspector__block">
      <p className="sa-inspector__eyebrow">SUITABILITY</p>
      <p className="sa-inspector__headline ng-type-numeric">{row.holder.proficiency} / 100</p>
      <p className="sa-inspector__note">{current === undefined ? 'Current assignment' : `${current.band} FIT`}</p>
      <div className="sa-workload">
        <span className="sa-workload__label">Workload</span>
        <span className="sa-workload__value ng-type-numeric">{row.holder.utilizationLabel}</span>
        <WorkloadBar tone={row.holder.workloadTone} value={row.holder.utilization} />
      </div>
    </section>
  )
}

function InspectorKeyMatches({ row }: { readonly row: StaffAssignmentRow }) {
  if (row.holder === undefined) return null
  return (
    <section className="sa-inspector__block">
      <p className="sa-inspector__eyebrow">KEY MATCHES</p>
      <dl className="sa-ratings">
        {row.holder.ratings.map((rating) => (
          <div className="sa-ratings__item" key={rating.label}>
            <dt title={rating.label}>{rating.shortLabel}</dt>
            <dd className="ng-type-numeric">{rating.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function InspectorOptions({
  row,
  onAssign,
  onModeChange,
}: {
  readonly row: StaffAssignmentRow
  readonly onAssign: (candidate: StaffAssignmentCandidate) => void
  readonly onModeChange: (mode: 'delegated' | 'advisory' | 'userControlled') => void
}) {
  const modes: readonly ('delegated' | 'advisory' | 'userControlled')[] = row.assignable
    ? [...row.supportedDelegationModes, 'userControlled']
    : ['userControlled']

  return (
    <section className="sa-inspector__block">
      <p className="sa-inspector__eyebrow">ASSIGNMENT OPTIONS</p>
      <p className="sa-inspector__note">Mode</p>
      <div className="sa-mode" role="group" aria-label="Assignment mode">
        {modes.map((mode) => (
          <button
            aria-pressed={row.mode === mode}
            className={row.mode === mode ? 'sa-mode__option is-active' : 'sa-mode__option'}
            key={mode}
            onClick={() => onModeChange(mode)}
            title={mode === 'userControlled' ? 'The Head Coach performs this responsibility' : undefined}
            type="button"
          >
            {mode === 'userControlled' ? 'MYSELF' : mode.toUpperCase()}
          </button>
        ))}
      </div>
      <ul className="sa-candidates sa-candidates--inspector">
        {row.recommendations.slice(0, 3).map((candidate) => (
          <li key={candidate.staffPersonId}>
            <button className="sa-candidate" onClick={() => onAssign(candidate)} type="button">
              <span className="sa-candidate__who">
                <span className="sa-candidate__name">{candidate.name}</span>
                <span className="sa-candidate__role">{candidate.roleLabel}</span>
              </span>
              <span className={`sa-candidate__fit-value ng-type-numeric sa-tone-${candidate.tone}`}>{candidate.suitability}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function InspectorAlternatives({
  row,
  onOpenAssign,
}: {
  readonly row: StaffAssignmentRow
  readonly onOpenAssign: (anchor: HTMLElement) => void
}) {
  if (!row.assignable) return null
  return (
    <section className="sa-inspector__block">
      <p className="sa-inspector__eyebrow">BEST ALTERNATIVES</p>
      <ol className="sa-alternatives">
        {row.recommendations.slice(0, 3).map((candidate, index) => (
          <li className="sa-alternative" key={candidate.staffPersonId}>
            <span className="sa-alternative__rank ng-type-numeric">{index + 1}</span>
            <span className="sa-alternative__name">{candidate.name}</span>
            <span className={`sa-alternative__fit ng-type-numeric sa-tone-${candidate.tone}`}>{candidate.suitability}</span>
            <span className={`sa-alternative__load sa-tone-${candidate.projectedTone} ng-type-numeric`}>{candidate.loadLabel}</span>
          </li>
        ))}
        {row.recommendations.length === 0 ? <li className="sa-popover__empty">No eligible staff.</li> : null}
      </ol>
      <button className="sa-action sa-action--wide" onClick={(event) => onOpenAssign(event.currentTarget)} type="button">
        OPEN QUICK ASSIGN
      </button>
    </section>
  )
}

/** Candidate list for the expanded "View all staff" selector. */
export function staffAssignmentCandidatesFor(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind, currentHolderStaffId: StaffPersonId | undefined): readonly StaffAssignmentCandidate[] {
  return fullCandidateList(world, teamId, kind, currentHolderStaffId)
}
