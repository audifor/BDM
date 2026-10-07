import { useMemo, useState } from 'react'

import {
  CLUB_FACILITY_COMMAND_REASON_TEXT,
  buildClubFacilitiesWorkspaceModel,
  type ClubFacilitiesWorkspaceModel,
  type ClubFacilityRow,
  type ClubMaintenanceNeedRow,
  type ClubProjectRow,
} from '@/app/facilities'
import type { FacilityDevelopmentProjectId, FacilityId } from '@/domain/ids'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { NgPrecisionTable, ngCol } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'
import type { SportingCapabilityStatus } from '@/integration/facilitiesSporting'

import {
  accessLabel,
  amountPlaceholder,
  conditionLabel,
  formatFacilityAmount,
  humanizeToken,
  parseMajorAmountToMinorUnits,
  projectActionLabel,
  scheduleLabel,
  serviceabilityLabel,
} from './facilitiesPresentation'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'facilities', label: 'Facilities' },
  { id: 'maintenance', label: 'Condition & maintenance' },
  { id: 'projects', label: 'Projects' },
  { id: 'costs', label: 'Costs & funding' },
  { id: 'effects', label: 'Sporting effects' },
] as const
type FacilitiesTabId = (typeof TABS)[number]['id']

interface CommandNotice {
  readonly tone: 'APPLIED' | 'BLOCKED'
  readonly text: string
}

export function FacilitiesWorkspace() {
  const world = useGameStore((state) => state.world)
  const startFacilityProject = useGameStore((state) => state.startFacilityProject)
  const pauseFacilityProject = useGameStore((state) => state.pauseFacilityProject)
  const resumeFacilityProject = useGameStore((state) => state.resumeFacilityProject)
  const completeFacilityProject = useGameStore((state) => state.completeFacilityProject)
  const cancelFacilityProject = useGameStore((state) => state.cancelFacilityProject)
  const [tab, setTab] = useState<FacilitiesTabId>('overview')
  const [selectedFacilityId, setSelectedFacilityId] = useState<FacilityId | undefined>(undefined)
  const [commitmentProjectId, setCommitmentProjectId] = useState<FacilityDevelopmentProjectId | undefined>(undefined)
  const [commitmentAmount, setCommitmentAmount] = useState('')
  const [commitmentCurrency, setCommitmentCurrency] = useState('')
  const [notice, setNotice] = useState<CommandNotice | null>(null)

  const team = world === null ? undefined : getUserTeam(world)
  const model = useMemo(
    () => (world === null || team === undefined ? null : buildClubFacilitiesWorkspaceModel(world, team.id)),
    [world, team],
  )

  if (world === null) {
    return <NgHoloShell appLabel="Facilities" empty emptyMessage="No career loaded." region="facilities-workspace" />
  }
  if (team === undefined || model === null) {
    return <NgHoloShell appLabel="Facilities" empty emptyMessage="No team assigned to the user coach." region="facilities-workspace" />
  }

  const runCommand = (result: { readonly status: 'APPLIED' | 'BLOCKED'; readonly reasons: readonly (keyof typeof CLUB_FACILITY_COMMAND_REASON_TEXT)[] }, appliedText: string) => {
    if (result.status === 'APPLIED') {
      setNotice({ tone: 'APPLIED', text: appliedText })
      setCommitmentProjectId(undefined)
      setCommitmentAmount('')
      return
    }
    setNotice({ tone: 'BLOCKED', text: result.reasons.map((reason) => CLUB_FACILITY_COMMAND_REASON_TEXT[reason]).join(' ') })
  }

  const selectedFacility = model.facilities.find((facility) => facility.facilityId === selectedFacilityId)

  return (
    <NgHoloShell
      activeTabId={tab}
      appLabel="Facilities"
      meta={
        <>
          <span className="ng-type-numeric">{model.facilities.length}</span> facilities
          {' · '}
          <span className="ng-type-numeric">{model.openNeeds.length}</span> open needs
          {' · '}
          <span className="ng-type-numeric">{model.activeProjectIds.length}</span> active projects
        </>
      }
      onTabSelect={(id) => setTab(id as FacilitiesTabId)}
      region="facilities-workspace"
      tabs={TABS}
      teamId={model.teamId}
      title={model.teamName}
    >
      {notice === null ? null : (
        <p className={notice.tone === 'APPLIED' ? 'ng-canon__note' : 'ng-canon__badge'} data-ng-region="facilities-command-notice">
          {notice.text}
        </p>
      )}

      {tab === 'overview' ? <OverviewPanel model={model} /> : null}

      {tab === 'facilities' ? (
        <>
          <FacilityTable
            facilities={model.facilities}
            onSelect={(facilityId) => setSelectedFacilityId(facilityId)}
            selectedFacilityId={selectedFacilityId}
          />
          {selectedFacility === undefined ? null : <FacilityInspector model={model} facility={selectedFacility} />}
        </>
      ) : null}

      {tab === 'maintenance' ? <MaintenancePanel model={model} /> : null}

      {tab === 'projects' ? (
        <ProjectsPanel
          cancel={(projectId) => runCommand(cancelFacilityProject(projectId), 'Project cancelled.')}
          commitmentAmount={commitmentAmount}
          commitmentCurrency={commitmentCurrency}
          commitmentProjectId={commitmentProjectId}
          commitWithCapital={(projectId) => {
            const currencyCode = commitmentCurrency.trim() === '' ? (model.reportingCurrencyCode ?? '') : commitmentCurrency
            const amount = parseMajorAmountToMinorUnits(commitmentAmount, currencyCode)
            if (amount === null) {
              setNotice({ tone: 'BLOCKED', text: 'Enter a positive capital amount in major units.' })
              return
            }
            runCommand(
              startFacilityProject(projectId, { currencyCode, minorUnits: amount }),
              `Project started with a capital commitment of ${formatFacilityAmount(currencyCode, amount)}.`,
            )
          }}
          complete={(projectId) => runCommand(completeFacilityProject(projectId), 'Project completed.')}
          model={model}
          onCommitmentAmountChange={setCommitmentAmount}
          onCommitmentCurrencyChange={setCommitmentCurrency}
          onOpenCommitment={(projectId) => {
            setCommitmentProjectId(projectId)
            setCommitmentAmount('')
            setCommitmentCurrency(model.reportingCurrencyCode ?? '')
          }}
          pause={(projectId) => runCommand(pauseFacilityProject(projectId), 'Project paused.')}
          resume={(projectId) => runCommand(resumeFacilityProject(projectId), 'Project resumed.')}
          start={(projectId) => runCommand(startFacilityProject(projectId), 'Project started.')}
        />
      ) : null}

      {tab === 'costs' ? <CostsPanel model={model} /> : null}

      {tab === 'effects' ? <EffectsPanel model={model} /> : null}
    </NgHoloShell>
  )
}

function OverviewPanel({ model }: { readonly model: ClubFacilitiesWorkspaceModel }) {
  const committed = model.costs.reduce((total, cost) => total + cost.committedMinorUnits, 0)
  const paid = model.costs.reduce((total, cost) => total + cost.paidMinorUnits, 0)
  const outOfService = model.facilities.reduce((total, facility) => total + facility.outOfServiceComponentIds.length, 0)
  const constrained = model.sporting.constraints
  const currencyCode = model.costs[0]?.currencyCode

  return (
    <section className="ng-canon__overview">
      <div className="ng-canon__panel ng-holo-panel">
        <dl className="ng-canon__metrics">
          <NgMetric label="Club organization" value={model.organizationName ?? model.organizationId} />
          <NgMetric label="Facilities" value={model.facilities.length} />
          <NgMetric label="Components" value={model.components.length} />
          <NgMetric label="Out of service" value={outOfService} />
          <NgMetric label="Open maintenance needs" value={model.openNeeds.length} />
          <NgMetric label="Critical needs" value={model.criticalOpenNeeds.length} />
          <NgMetric label="Active projects" value={model.activeProjectIds.length} />
          <NgMetric label="Projects eligible to start" value={model.eligibleProjectIds.length} />
          <NgMetric label="Capital committed" value={currencyCode === undefined ? 'No financial facts' : formatFacilityAmount(currencyCode, committed)} />
          <NgMetric label="Capital paid" value={currencyCode === undefined ? 'No financial facts' : formatFacilityAmount(currencyCode, paid)} />
          <NgMetric label="Reporting currency" value={model.reportingCurrencyCode ?? 'Not configured'} />
          <NgMetric label="As of" value={model.asOf} />
        </dl>
        {model.facilities.length === 0 ? (
          <p className="ng-canon__note" data-ng-region="facilities-empty-truth">
            No canonical Facility is recorded for this club organization in this universe.
          </p>
        ) : null}
      </div>

      <div className="ng-canon__panel ng-holo-panel">
        <p className="ng-canon__eyebrow">Attention</p>
        {model.criticalOpenNeeds.length === 0 && model.projects.filter((project) => project.delayed).length === 0 && outOfService === 0 ? (
          <p className="ng-canon__note">No critical need, delayed project or out-of-service component is recorded.</p>
        ) : (
          <ul className="ng-canon__list">
            {model.criticalOpenNeeds.map((need) => (
              <li key={need.needId}>
                Critical {humanizeToken(need.type).toLowerCase()} need at {need.facilityName}
                {need.componentName === null ? '' : ` · ${need.componentName}`} · detected {need.detectedAt}
              </li>
            ))}
            {model.projects
              .filter((project) => project.delayed)
              .map((project) => (
                <li key={project.projectId}>
                  Project delayed: {project.scopeSummary} · planned completion {project.plannedCompletionDate}
                </li>
              ))}
            {model.facilities
              .filter((facility) => facility.outOfServiceComponentIds.length > 0)
              .map((facility) => (
                <li key={facility.facilityId}>
                  {facility.name}: {facility.outOfServiceComponentIds.length} component(s) out of service
                </li>
              ))}
          </ul>
        )}
        {constrained.length === 0 ? null : (
          <p className="ng-canon__note">{constrained.map((constraint) => humanizeToken(constraint)).join(' · ')}</p>
        )}
      </div>
    </section>
  )
}

function Table({
  gridId,
  headers,
  rows,
  empty,
  numericColumns = [],
}: {
  readonly gridId: string
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly empty: string
  readonly numericColumns?: readonly string[]
}) {
  if (rows.length === 0) return <p className="ng-canon__empty">{empty}</p>
  const data = rows.map(([id, ...cells]) => ({ id, cells: Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])) }))
  const numeric = new Set(numericColumns)
  return (
    <div className="ng-canon__panel ng-holo-panel">
      <NgPrecisionTable
        className="ng-canon__table"
        columns={headers.map((header) =>
          ngCol<(typeof data)[number]>(header, header, (row) => row.cells[header], { value: (row) => row.cells[header], numeric: numeric.has(header) }),
        )}
        gridId={gridId}
        rows={data}
      />
    </div>
  )
}

function FacilityTable({
  facilities,
  selectedFacilityId,
  onSelect,
}: {
  readonly facilities: readonly ClubFacilityRow[]
  readonly selectedFacilityId: FacilityId | undefined
  readonly onSelect: (facilityId: FacilityId) => void
}) {
  const table = ngTableRows(facilities)
  if (facilities.length === 0) {
    return <p className="ng-canon__empty" data-ng-region="facilities-empty-table">This club organization has no recorded Facility in this universe.</p>
  }
  return (
    <div className="ng-canon__panel ng-holo-panel">
      <NgPrecisionTable
        className="ng-canon__table"
        columns={table.columns}
        gridId="ng-facilities-inventory"
        onRowClick={(row) => onSelect(row.facilityId)}
        rows={table.rows}
        selectedId={selectedFacilityId}
      />
    </div>
  )
}

function ngTableRows(facilities: readonly ClubFacilityRow[]) {
  const rows = facilities.map((facility) => ({ ...facility, id: String(facility.facilityId) }))
  return {
    rows,
    columns: [
      ngCol<(typeof rows)[number]>('name', 'Facility', (row) => row.name, { value: (row) => row.name }),
      ngCol<(typeof rows)[number]>('type', 'Type', (row) => humanizeToken(row.type), { value: (row) => row.type }),
      ngCol<(typeof rows)[number]>('status', 'Status', (row) => humanizeToken(row.status), { value: (row) => row.status }),
      ngCol<(typeof rows)[number]>('access', 'Club involvement', (row) => accessLabel(row.accessKinds), { value: (row) => accessLabel(row.accessKinds) }),
      ngCol<(typeof rows)[number]>('place', 'Place', (row) => row.placeName ?? String(row.placeId), { value: (row) => row.placeName ?? '' }),
      ngCol<(typeof rows)[number]>('components', 'Components', (row) => String(row.activeComponentCount), { numeric: true, value: (row) => row.activeComponentCount }),
      ngCol<(typeof rows)[number]>('condition', 'Avg condition', (row) => conditionLabel(row.averageKnownCondition), { numeric: true, value: (row) => row.averageKnownCondition ?? '' }),
      ngCol<(typeof rows)[number]>('out', 'Out of service', (row) => String(row.outOfServiceComponentIds.length), { numeric: true, value: (row) => row.outOfServiceComponentIds.length }),
      ngCol<(typeof rows)[number]>('needs', 'Open needs', (row) => String(row.openNeedIds.length), { numeric: true, value: (row) => row.openNeedIds.length }),
      ngCol<(typeof rows)[number]>('projects', 'Active projects', (row) => String(row.activeProjectIds.length), { numeric: true, value: (row) => row.activeProjectIds.length }),
    ],
  }
}

function FacilityInspector({ model, facility }: { readonly model: ClubFacilitiesWorkspaceModel; readonly facility: ClubFacilityRow }) {
  const components = model.components.filter((component) => component.facilityId === facility.facilityId)
  const needs = model.needs.filter((need) => need.facilityId === facility.facilityId)
  const actions = model.maintenanceActions.filter((action) => action.facilityId === facility.facilityId)
  const projects = model.projects.filter((project) => project.facilityId === facility.facilityId)

  return (
    <div className="ng-canon__panel ng-holo-panel" data-ng-region="facilities-inspector">
      <p className="ng-canon__eyebrow">{humanizeToken(facility.type)} · {humanizeToken(facility.status)}</p>
      <h3 className="ng-canon__title">{facility.name}</h3>
      <dl className="ng-canon__metrics">
        <NgMetric label="Purposes" value={facility.purposes.map(humanizeToken).join(' · ')} />
        <NgMetric label="Capabilities" value={facility.capabilities.length === 0 ? 'Not declared' : facility.capabilities.map(humanizeToken).join(' · ')} />
        <NgMetric label="Opened" value={facility.openedOn ?? 'Not recorded'} />
        <NgMetric label="Total capacity" value={facility.totalCapacity ?? 'Not recorded'} />
        <NgMetric label="Court count" value={facility.courtCount ?? 'Not recorded'} />
        <NgMetric label="Accessibility provision" value={facility.hasAccessibilityProvision === null ? 'Not recorded' : facility.hasAccessibilityProvision ? 'Yes' : 'No'} />
        <NgMetric label="Worst condition" value={conditionLabel(facility.worstKnownCondition)} />
        <NgMetric label="Limited service" value={facility.limitedServiceComponentIds.length} />
        <NgMetric label="Records of condition" value={`${facility.knownConditionComponentCount}/${facility.activeComponentCount}`} />
        <NgMetric label="Inspections recorded" value={facility.inspectionCount} />
      </dl>

      <p className="ng-canon__eyebrow">Components</p>
      <Table
        empty="No active component is recorded for this facility."
        gridId="ng-facilities-components"
        headers={['Component', 'Type', 'Status', 'Condition', 'Serviceability', 'Open needs']}
        numericColumns={['Condition', 'Open needs']}
        rows={components.map((component) => [
          String(component.componentId),
          component.name,
          humanizeToken(component.type),
          humanizeToken(component.status),
          conditionLabel(component.physicalCondition),
          serviceabilityLabel(component.serviceability),
          String(component.openNeedIds.length),
        ])}
      />

      {needs.length === 0 ? null : (
        <>
          <p className="ng-canon__eyebrow">Maintenance needs</p>
          <NeedsTable needs={needs} />
        </>
      )}

      {actions.length === 0 ? null : (
        <>
          <p className="ng-canon__eyebrow">Maintenance history</p>
          <MaintenanceActionsTable rows={actions} />
        </>
      )}

      {projects.length === 0 ? null : (
        <p className="ng-canon__note">Projects: {projects.map((project) => `${project.scopeSummary} (${humanizeToken(project.status)})`).join(' · ')}</p>
      )}
    </div>
  )
}

function NeedsTable({ needs }: { readonly needs: readonly ClubMaintenanceNeedRow[] }) {
  return (
    <Table
      empty="No maintenance need is recorded."
      gridId="ng-facilities-needs"
      headers={['Need', 'Facility', 'Component', 'Type', 'Severity', 'Status', 'Detected', 'Source']}
      rows={needs.map((need) => [
        need.needId,
        need.facilityName,
        need.componentName ?? 'Facility-wide',
        humanizeToken(need.type),
        humanizeToken(need.severity),
        humanizeToken(need.status),
        need.detectedAt,
        need.source,
      ])}
    />
  )
}

function MaintenanceActionsTable({ rows }: { readonly rows: ClubFacilitiesWorkspaceModel['maintenanceActions'] }) {
  return (
    <Table
      empty="No intervention is recorded."
      gridId="ng-facilities-maintenance-actions"
      headers={['Action', 'Facility', 'Component', 'Type', 'Started', 'Completed', 'Outcome', 'Resulting condition']}
      rows={rows.map((action) => [
        action.actionId,
        action.facilityName,
        action.componentName ?? 'Facility-wide',
        humanizeToken(action.type),
        action.startedAt,
        action.completedAt ?? '—',
        action.outcome === null ? '—' : humanizeToken(action.outcome),
        action.resultingCondition === null ? '—' : conditionLabel(action.resultingCondition),
      ])}
    />
  )
}

function MaintenancePanel({ model }: { readonly model: ClubFacilitiesWorkspaceModel }) {
  return (
    <>
      <div className="ng-canon__panel ng-holo-panel">
        <p className="ng-canon__eyebrow">Open maintenance needs</p>
        <NeedsTable needs={model.openNeeds} />
      </div>
      <div className="ng-canon__panel ng-holo-panel">
        <p className="ng-canon__eyebrow">Recorded interventions</p>
        <MaintenanceActionsTable rows={model.maintenanceActions} />
        <p className="ng-canon__note" data-ng-region="facilities-maintenance-gap">
          Recording an intervention is not yet a club action: no canonical policy maps a maintenance need to an intervention
          type, outcome and resulting condition, so this workspace reports maintenance truth read-only.
        </p>
      </div>
    </>
  )
}

function ProjectsPanel({
  model,
  start,
  pause,
  resume,
  complete,
  cancel,
  onOpenCommitment,
  commitWithCapital,
  commitmentProjectId,
  commitmentAmount,
  commitmentCurrency,
  onCommitmentAmountChange,
  onCommitmentCurrencyChange,
}: {
  readonly model: ClubFacilitiesWorkspaceModel
  readonly start: (projectId: FacilityDevelopmentProjectId) => void
  readonly pause: (projectId: FacilityDevelopmentProjectId) => void
  readonly resume: (projectId: FacilityDevelopmentProjectId) => void
  readonly complete: (projectId: FacilityDevelopmentProjectId) => void
  readonly cancel: (projectId: FacilityDevelopmentProjectId) => void
  readonly onOpenCommitment: (projectId: FacilityDevelopmentProjectId) => void
  readonly commitWithCapital: (projectId: FacilityDevelopmentProjectId) => void
  readonly commitmentProjectId: FacilityDevelopmentProjectId | undefined
  readonly commitmentAmount: string
  readonly commitmentCurrency: string
  readonly onCommitmentAmountChange: (value: string) => void
  readonly onCommitmentCurrencyChange: (value: string) => void
}) {
  return (
    <div className="ng-canon__panel ng-holo-panel" data-ng-region="facilities-projects">
      <p className="ng-canon__eyebrow">Facility development projects</p>
      {model.projects.length === 0 ? (
        <p className="ng-canon__note">
          No facility development project is recorded for this club organization. Planning a new project is not yet a club action:
          no canonical authority defines a blueprint, place, cost or duration.
        </p>
      ) : null}
      {model.projects.map((project) => (
        <article className="ng-canon__card" data-ng-region="facilities-project-row" key={project.projectId}>
          <p className="ng-canon__eyebrow">
            {humanizeToken(project.projectType)} · {humanizeToken(project.status)} · {project.scopeKind}
            {project.eligibleToStart ? ' · eligible to start' : ''}
            {project.delayed ? ' · delayed' : ''}
          </p>
          <p>{project.scopeSummary}</p>
          <p className="ng-canon__note">
            {project.facilityName === null ? 'No facility yet' : project.facilityName} · planned start{' '}
            {scheduleLabel(model.asOf, project.plannedStartDate, project.actualStartDate)} · planned completion{' '}
            {scheduleLabel(model.asOf, project.plannedCompletionDate, project.actualCompletionDate)}
          </p>
          {project.currentPhase === null ? null : (
            <p className="ng-canon__note">
              Current phase: {project.currentPhase.name ?? `Phase ${project.currentPhase.sequence}`} · {humanizeToken(project.currentPhase.status)} ·{' '}
              {scheduleLabel(model.asOf, project.currentPhase.plannedCompletion, project.currentPhase.actualCompletion)}
            </p>
          )}
          {project.money.length === 0 ? null : (
            <p className="ng-canon__note">
              {project.money
                .map(
                  (money) =>
                    `${money.currencyCode} committed ${formatFacilityAmount(money.currencyCode, money.committedMinorUnits)} · recognized ${formatFacilityAmount(money.currencyCode, money.recognizedMinorUnits)} · paid ${formatFacilityAmount(money.currencyCode, money.paidMinorUnits)} · outstanding ${formatFacilityAmount(money.currencyCode, money.outstandingCommitmentMinorUnits)}`,
                )
                .join(' · ')}
              {project.underfundedAsOfDate === null ? '' : project.underfundedAsOfDate ? ' · underfunded' : ' · funded'}
            </p>
          )}
          <div className="ng-canon__actions">
            {project.actions.map((action) => {
              if (action === 'START') {
                return (
                  <span key={action}>
                    <button className="ng-canon__action" onClick={() => start(project.projectId)} type="button">
                      {projectActionLabel(action)} (no capital)
                    </button>
                    <button className="ng-canon__action" onClick={() => onOpenCommitment(project.projectId)} type="button">
                      Start with capital commitment
                    </button>
                  </span>
                )
              }
              return (
                <button
                  className="ng-canon__action"
                  key={action}
                  onClick={() => (action === 'PAUSE' ? pause(project.projectId) : action === 'RESUME' ? resume(project.projectId) : action === 'COMPLETE' ? complete(project.projectId) : cancel(project.projectId))}
                  type="button"
                >
                  {projectActionLabel(action)}
                </button>
              )
            })}
          </div>
          {commitmentProjectId === project.projectId ? (
            <div className="ng-canon__toolbar" data-ng-region="facilities-commitment-form">
              <label>
                Currency
                <input
                  onChange={(event) => onCommitmentCurrencyChange(event.target.value)}
                  placeholder="ISO code, e.g. EUR"
                  value={commitmentCurrency}
                />
              </label>
              <label>
                Capital commitment
                <input
                  onChange={(event) => onCommitmentAmountChange(event.target.value)}
                  placeholder={amountPlaceholder(model.reportingCurrencyCode)}
                  value={commitmentAmount}
                />
              </label>
              <button className="ng-canon__action" onClick={() => commitWithCapital(project.projectId)} type="button">
                Commit and start
              </button>
              {model.reportingCurrencyCode === null ? (
                <span className="ng-canon__note">No reporting currency is configured for this club organization.</span>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function CostsPanel({ model }: { readonly model: ClubFacilitiesWorkspaceModel }) {
  const projectName = (projectId: string) => {
    const project: ClubProjectRow | undefined = model.projects.find((candidate) => candidate.projectId === projectId)
    return project?.facilityName ?? project?.scopeSummary ?? projectId
  }
  return (
    <div className="ng-canon__panel ng-holo-panel" data-ng-region="facilities-costs">
      <p className="ng-canon__eyebrow">Facility project funding</p>
      <Table
        empty="No facility financial fact is recorded for this club organization."
        gridId="ng-facilities-costs"
        headers={['Project', 'Currency', 'Committed', 'Recognized', 'Paid', 'Outstanding', 'Underfunded']}
        numericColumns={['Committed', 'Recognized', 'Paid', 'Outstanding']}
        rows={model.projects.map((project) => [
          String(project.projectId),
          projectName(String(project.projectId)),
          ...(project.money.length === 0
            ? ['No financial facts', '—', '—', '—', '—']
            : [
                project.money[0]!.currencyCode,
                formatFacilityAmount(project.money[0]!.currencyCode, project.money[0]!.committedMinorUnits),
                formatFacilityAmount(project.money[0]!.currencyCode, project.money[0]!.recognizedMinorUnits),
                formatFacilityAmount(project.money[0]!.currencyCode, project.money[0]!.paidMinorUnits),
                formatFacilityAmount(project.money[0]!.currencyCode, project.money[0]!.outstandingCommitmentMinorUnits),
              ]),
          project.underfundedAsOfDate === null ? 'Not assessed' : project.underfundedAsOfDate ? 'Yes' : 'No',
        ])}
      />
      <p className="ng-canon__note">
        Figures are canonical CFI7 facts only: a start without a capital commitment records no money, and recurring facility
        operating costs are not yet generated by the world.
      </p>
    </div>
  )
}

function EffectsPanel({ model }: { readonly model: ClubFacilitiesWorkspaceModel }) {
  const sporting = model.sporting
  const componentName = (componentId: string) =>
    model.components.find((component) => String(component.componentId) === componentId)?.name ?? componentId
  const domains: readonly (readonly [string, readonly SportingCapabilityStatus[]])[] = [
    ['Basketball', sporting.basketball.capabilities],
    ['Strength & conditioning', sporting.strengthAndConditioning.capabilities],
    ['Performance', sporting.performance.capabilities],
    ['Medical', sporting.medical.capabilities],
    ['Rehabilitation', sporting.rehabilitation.capabilities],
    ['Recovery', sporting.recovery.capabilities],
    ['Analysis', sporting.analysis.capabilities],
    ['Player support', sporting.support.capabilities],
  ]
  return (
    <>
      <div className="ng-canon__panel ng-holo-panel" data-ng-region="facilities-effects-capabilities">
        <p className="ng-canon__eyebrow">Usable capability by domain</p>
        <Table
          empty="No sporting capability is reachable for this club today."
          gridId="ng-facilities-effects"
          headers={['Domain', 'Capability', 'Status', 'Serviceability']}
          rows={domains.flatMap(([domain, capabilities]) =>
            capabilities.map((capability) => [
              `${domain}:${capability.capability}`,
              domain,
              humanizeToken(capability.capability),
              humanizeToken(capability.status),
              capability.serviceability === null ? '—' : serviceabilityLabel(capability.serviceability),
            ]),
          )}
        />
      </div>
      <div className="ng-canon__panel ng-holo-panel" data-ng-region="facilities-effects-courts">
        <p className="ng-canon__eyebrow">Courts reachable by this club</p>
        <Table
          empty="No court is reachable for this club today."
          gridId="ng-facilities-effects-courts"
          headers={['Court', 'Type', 'Full court', 'Indoor', 'Serviceability', 'Technical standard', 'Video tracking']}
          rows={sporting.basketball.courts.map((court) => [
            String(court.componentId),
            componentName(String(court.componentId)),
            humanizeToken(court.type),
            court.isFullCourt === null ? 'Not recorded' : court.isFullCourt ? 'Yes' : 'No',
            court.isIndoor === null ? 'Not recorded' : court.isIndoor ? 'Yes' : 'No',
            serviceabilityLabel(court.serviceability),
            court.technicalStandard === null ? 'Not recorded' : humanizeToken(court.technicalStandard),
            court.hasVideoTrackingTechnology === null ? 'Not recorded' : court.hasVideoTrackingTechnology ? 'Yes' : 'No',
          ])}
        />
        <p className="ng-canon__note">
          {sporting.basketball.usablePracticeCourtCount} usable practice court(s) · constraints:{' '}
          {sporting.constraints.length === 0 ? 'none observed' : sporting.constraints.map((constraint) => humanizeToken(constraint)).join(' · ')}
        </p>
      </div>
    </>
  )
}
