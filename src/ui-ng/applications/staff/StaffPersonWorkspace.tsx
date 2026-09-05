import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import type { StaffPersonId } from '@/domain/ids'

import { useGameStore } from '@/stores/gameStore'
import { ratingTone } from '@/ui-ng/applications/player/data/ratingCatalog'
import { DynamicsToneDot, DynamicsTonePair } from '@/ui-ng/applications/staff/DynamicsToneDot'
import { StaffPersonIdentityBand } from '@/ui-ng/applications/staff/StaffPersonIdentityBand'
import { buildStaffPersonWorkspaceModel } from '@/ui-ng/applications/staff/buildStaffPersonWorkspaceModel'
import {
  STAFF_PERSON_VIEWS,
  STAFF_PERSON_VIEW_LABELS,
  parseStaffPersonView,
  type StaffAttributeGroupId,
  type StaffPersonViewId,
  type StaffPersonWorkspaceModel,
} from '@/ui-ng/applications/staff/staffPersonWorkspaceModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'
import { syncStaffViewQuery } from '@/ui-ng/workspace/workspaceApps'

import '@/ui-ng/applications/player/player-overview.css'
import '@/ui-ng/applications/player/player-attributes.css'
import './staff-person.css'

export function StaffPersonWorkspace({ staffId }: { readonly staffId: StaffPersonId }) {
  const world = useGameStore((state) => state.world)
  const urlView = useStaffViewFromUrl()
  const [activeView, setActiveViewState] = useState<StaffPersonViewId>(urlView)
  const [selectedGroupId, setSelectedGroupId] = useState<StaffAttributeGroupId | null>(null)
  const [selectedAttributeId, setSelectedAttributeId] = useState<string | null>(null)

  const model = useMemo(
    () => (world === null ? null : buildStaffPersonWorkspaceModel(world, staffId)),
    [staffId, world],
  )

  const setActiveView = useCallback((view: StaffPersonViewId) => {
    setActiveViewState(view)
    syncStaffViewQuery(view)
  }, [])

  useEffect(() => {
    setActiveViewState(urlView)
  }, [urlView])

  useEffect(() => {
    setSelectedGroupId(null)
    setSelectedAttributeId(model?.attributes[0]?.id ?? null)
  }, [model?.identity.staffPersonId])

  const teamStyle = useMemo(() => {
    if (model === null) return undefined
    return {
      '--po-team-primary': model.identity.teamColors.primary,
      '--po-team-secondary': model.identity.teamColors.secondary,
      '--po-team-muted': model.identity.teamColors.muted,
    } as CSSProperties
  }, [model])

  const tabs = useMemo(
    () =>
      STAFF_PERSON_VIEWS.map((id) => ({
        id,
        label: STAFF_PERSON_VIEW_LABELS[id],
        active: id === activeView,
      })),
    [activeView],
  )

  if (model === null) {
    return (
      <div className="staff-person staff-person--empty" data-ng-region="staff-person">
        <section className="staff-person__empty-state">
          <h1 className="staff-person__empty-title">Staff</h1>
          <p className="staff-person__empty-message">Staff person not found.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="staff-person po-root" data-ng-region="staff-person" style={teamStyle}>
      <ApplicationWorkspace
        identityBand={<StaffPersonIdentityBand model={model} />}
        tabs={
          <WorkspaceTabs
            activeTabId={activeView}
            onTabSelect={(tabId) => setActiveView(tabId as StaffPersonViewId)}
            tabs={tabs}
          />
        }
      >
        <ScrollRegion className="staff-person__scroll">
          {activeView === 'overview' ? (
            <OverviewView
              model={model}
              onSelectAttribute={setSelectedAttributeId}
              onSelectGroup={setSelectedGroupId}
              selectedAttributeId={selectedAttributeId}
              selectedGroupId={selectedGroupId}
            />
          ) : null}
          {activeView === 'attributes' ? (
            <AttributesView
              model={model}
              onSelectAttribute={setSelectedAttributeId}
              onSelectGroup={setSelectedGroupId}
              selectedAttributeId={selectedAttributeId}
              selectedGroupId={selectedGroupId}
            />
          ) : null}
          {activeView === 'responsibilities' ? <ResponsibilitiesView model={model} /> : null}
          {activeView === 'contract' ? <ContractView model={model} /> : null}
          {activeView === 'dynamics' ? <DynamicsView model={model} /> : null}
          {activeView === 'history' ? <HistoryView model={model} /> : null}
        </ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}

function OverviewView({
  model,
  selectedGroupId,
  selectedAttributeId,
  onSelectGroup,
  onSelectAttribute,
}: {
  readonly model: StaffPersonWorkspaceModel
  readonly selectedGroupId: StaffAttributeGroupId | null
  readonly selectedAttributeId: string | null
  readonly onSelectGroup: (id: StaffAttributeGroupId | null) => void
  readonly onSelectAttribute: (id: string) => void
}) {
  const visibleAttributes =
    selectedGroupId === null ? model.attributes : model.attributes.filter((row) => row.groupId === selectedGroupId)
  const activeId = visibleAttributes.some((row) => row.id === selectedAttributeId)
    ? selectedAttributeId
    : (visibleAttributes[0]?.id ?? null)

  return (
    <div className="staff-person__overview">
      <div className="staff-person__core">
        <section className="staff-person__panel ng-holo-panel">
          <header className="staff-person__panel-head">
            <h2>Role evaluation</h2>
            <span>Current assignment first</span>
          </header>
          <ul className="staff-person__eval-list">
            {model.evaluations.map((item) => (
              <li className={item.current ? 'is-current' : undefined} key={item.role}>
                <span>{item.label}</span>
                <strong className="ng-type-numeric">{item.proficiency}</strong>
                <span aria-hidden className="staff-person__meter">
                  <span style={{ width: `${item.proficiency}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="po-ratings staff-person__panel ng-holo-panel">
          <div className="po-ratings__header">
            <span>{selectedGroupId === null ? 'Professional attributes' : model.attributeGroups.find((group) => group.id === selectedGroupId)?.label}</span>
            <span>Rating</span>
            <span>Level</span>
          </div>
          {visibleAttributes.map((row) => (
            <button
              className={`po-rating-row po-rating-row--${ratingTone(row.value)}${row.id === activeId ? ' is-selected' : ''}`}
              key={row.id}
              onClick={() => {
                onSelectAttribute(row.id)
                onSelectGroup(row.groupId)
              }}
              type="button"
            >
              <span className="po-rating-row__label">{row.label}</span>
              <span className="po-rating-row__value ng-type-numeric">{row.value}</span>
              <span className="po-rating-row__meter">
                <span className="po-rating-row__meter-fill" style={{ width: `${row.value}%` }} />
              </span>
            </button>
          ))}
        </section>
      </div>
      <div className="staff-person__deck">
        <DeckCard title="Workload" meta={model.status.workloadLabel}>
          <Metric label="Utilization" value={model.status.utilizationLabel} />
          <Metric label="State" value={model.status.workloadLabel} />
          <Metric label="Employment" value={model.status.employmentLabel} />
        </DeckCard>
        <DeckCard title="Reputation" meta={model.status.reputationScore === null ? '—' : String(model.status.reputationScore)}>
          {model.reputation.length === 0 ? (
            <p className="staff-person__note">No reputation profile yet.</p>
          ) : (
            model.reputation.map((row) => <Metric key={row.dimension} label={row.dimension} value={String(row.value)} />)
          )}
        </DeckCard>
        <DeckCard title="Responsibilities" meta={`${model.responsibilities.length}`}>
          {model.responsibilities.length === 0 ? (
            <p className="staff-person__note">No responsibilities assigned.</p>
          ) : (
            model.responsibilities.slice(0, 4).map((row) => (
              <Metric key={row.id} label={row.kindLabel} value={row.modeLabel} />
            ))
          )}
        </DeckCard>
      </div>
    </div>
  )
}

function AttributesView({
  model,
  selectedGroupId,
  selectedAttributeId,
  onSelectGroup,
  onSelectAttribute,
}: {
  readonly model: StaffPersonWorkspaceModel
  readonly selectedGroupId: StaffAttributeGroupId | null
  readonly selectedAttributeId: string | null
  readonly onSelectGroup: (id: StaffAttributeGroupId | null) => void
  readonly onSelectAttribute: (id: string) => void
}) {
  const activeGroup = model.attributeGroups.find((group) => group.id === selectedGroupId) ?? model.attributeGroups[0]
  if (activeGroup === undefined) return <p className="staff-person__note">No professional attributes available.</p>
  const activeId = activeGroup.rows.some((row) => row.id === selectedAttributeId)
    ? selectedAttributeId
    : (activeGroup.rows[0]?.id ?? null)

  return (
    <div className="po-attributes" data-ng-region="staff-person-attributes">
      <nav aria-label="Attribute groups" className="po-attributes__rail">
        <span className="po-attributes__rail-title">Category Profiles</span>
        {model.attributeGroups.map((group) => (
          <button
            aria-current={group.id === activeGroup.id ? 'true' : undefined}
            className={`po-attributes__category${group.id === activeGroup.id ? ' is-active' : ''}`}
            key={group.id}
            onClick={() => {
              onSelectGroup(group.id)
              onSelectAttribute(group.rows[0]?.id ?? '')
            }}
            type="button"
          >
            <span className="po-attributes__category-label">{group.label}</span>
            <span className="po-attributes__category-value ng-type-numeric">{group.profileValue}</span>
            <span aria-hidden className="po-attributes__category-track">
              <span className="po-attributes__category-fill" style={{ width: `${group.profileValue}%` }} />
            </span>
          </button>
        ))}
      </nav>
      <section className="po-ratings staff-person__panel ng-holo-panel">
        <div className="po-ratings__header">
          <span>{activeGroup.label}</span>
          <span>Rating</span>
          <span>Level</span>
        </div>
        {activeGroup.rows.map((row) => (
          <button
            className={`po-rating-row po-rating-row--${ratingTone(row.value)}${row.id === activeId ? ' is-selected' : ''}`}
            key={row.id}
            onClick={() => onSelectAttribute(row.id)}
            type="button"
          >
            <span className="po-rating-row__label">{row.label}</span>
            <span className="po-rating-row__value ng-type-numeric">{row.value}</span>
            <span className="po-rating-row__meter">
              <span className="po-rating-row__meter-fill" style={{ width: `${row.value}%` }} />
            </span>
          </button>
        ))}
      </section>
    </div>
  )
}

function ResponsibilitiesView({ model }: { readonly model: StaffPersonWorkspaceModel }) {
  if (model.responsibilities.length === 0) {
    return <p className="staff-person__empty-copy">No responsibilities assigned.</p>
  }
  return (
    <div className="staff-person__panel ng-holo-panel">
      <NgPrecisionTable
        className="staff-person__table"
        columns={ngTableColumns(model.responsibilities, [
          ngCol('kind', 'Responsibility', (row) => row.kindLabel, { value: (row) => row.kindLabel }),
          ngCol('domain', 'Domain', (row) => row.domainLabel, { value: (row) => row.domainLabel }),
          ngCol('control', 'Control', (row) => row.modeLabel, { value: (row) => row.modeLabel }),
          ngCol('load', 'Load', (row) => row.capacityCost, { numeric: true, value: (row) => row.capacityCost }),
        ])}
        gridId="ng-staff-person"
        rows={model.responsibilities}
      />
    </div>
  )
}

function ContractView({ model }: { readonly model: StaffPersonWorkspaceModel }) {
  return (
    <div className="staff-person__panel ng-holo-panel">
      <header className="staff-person__panel-head">
        <h2>Employment & contract</h2>
      </header>
      <dl className="staff-person__metrics">
        <Metric label="Employment" value={model.contract.employmentLabel} />
        <Metric label="Contract status" value={model.contract.contractStatusLabel} />
        <Metric label="Salary" value={model.contract.salaryLabel ?? 'No active contract'} />
        <Metric label="Term" value={model.contract.termLabel ?? '—'} />
        {model.contract.terminationLabel !== null ? <Metric label="Termination" value={model.contract.terminationLabel} /> : null}
      </dl>
    </div>
  )
}

function DynamicsView({ model }: { readonly model: StaffPersonWorkspaceModel }) {
  const { dynamics } = model
  return (
    <div className="staff-person__stack">
      <div className="staff-person__panel ng-holo-panel">
        <header className="staff-person__panel-head">
          <h2>Professional state</h2>
        </header>
        <dl className="staff-person__metrics">
          <Metric
            label="State"
            value={
              dynamics.stateTone === null ? (
                dynamics.stateLabel ?? 'No dynamics data yet.'
              ) : (
                <DynamicsToneDot label={dynamics.stateLabel ?? ''} tone={dynamics.stateTone} />
              )
            }
          />
          <Metric
            label="Trend"
            value={
              dynamics.trendTone === null ? (
                dynamics.trendLabel ?? '—'
              ) : (
                <DynamicsToneDot label={dynamics.trendLabel ?? ''} tone={dynamics.trendTone} />
              )
            }
          />
          <Metric
            label="Outlook"
            value={
              dynamics.outlookTone === null ? (
                dynamics.outlook ?? '—'
              ) : (
                <DynamicsToneDot label={dynamics.outlook ?? ''} tone={dynamics.outlookTone} />
              )
            }
          />
          <Metric label="Current focus" value={dynamics.intent ?? '—'} />
          <Metric
            label="Culture fit"
            value={
              dynamics.cultureFitTone === null ? (
                dynamics.cultureFitLabel ?? '—'
              ) : (
                <DynamicsToneDot label={dynamics.cultureFitLabel ?? ''} tone={dynamics.cultureFitTone} />
              )
            }
          />
        </dl>
        {dynamics.cultureNote !== null ? <p className="staff-person__note">{dynamics.cultureNote}</p> : null}
      </div>
      {dynamics.positives.length > 0 ? (
        <ListCard title="Key positives" items={dynamics.positives} />
      ) : null}
      {dynamics.concerns.length > 0 ? (
        <ListCard title="Key concerns" items={dynamics.concerns} />
      ) : null}
      {dynamics.relationships.length > 0 ? (
        <div className="staff-person__panel ng-holo-panel">
          <header className="staff-person__panel-head">
            <h2>Working relationships</h2>
          </header>
          <ul className="staff-person__relationships">
            {dynamics.relationships.map((row) => (
              <li key={row.personLabel}>
                <span>{row.personLabel}</span>
                <DynamicsTonePair>
                  <DynamicsToneDot label={row.stateLabel} tone={row.stateTone} />
                  <DynamicsToneDot label={row.trend} tone={row.trendTone} />
                </DynamicsTonePair>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function HistoryView({ model }: { readonly model: StaffPersonWorkspaceModel }) {
  if (model.history.length === 0) {
    return <p className="staff-person__empty-copy">No recorded career history.</p>
  }
  return (
    <div className="staff-person__panel ng-holo-panel">
      <header className="staff-person__panel-head">
        <h2>Career history</h2>
      </header>
      <ol className="staff-person__history">
        {model.history.map((row) => (
          <li key={row.id}>{row.label}</li>
        ))}
      </ol>
    </div>
  )
}

function DeckCard({ title, meta, children }: { readonly title: string; readonly meta: string; readonly children: ReactNode }) {
  return (
    <section className="staff-person__panel ng-holo-panel">
      <header className="staff-person__panel-head">
        <h2>{title}</h2>
        <span>{meta}</span>
      </header>
      {children}
    </section>
  )
}

function ListCard({ title, items }: { readonly title: string; readonly items: readonly string[] }) {
  return (
    <section className="staff-person__panel ng-holo-panel">
      <header className="staff-person__panel-head">
        <h2>{title}</h2>
      </header>
      <ul className="staff-person__bullets">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function Metric({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="staff-person__metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function useStaffViewFromUrl(): StaffPersonViewId {
  const read = () => parseStaffPersonView(new URLSearchParams(window.location.search).get('staffView'))
  const [view, setView] = useState(read)
  useEffect(() => {
    const sync = () => setView(read())
    window.addEventListener('bdm-ng-nav', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('bdm-ng-nav', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])
  return view
}
