import { useMemo, useState } from 'react'
import {
  FACILITY_MAINTENANCE_REASON_TEXT,
  buildFacilityMaintenanceNeedRows,
  type FacilityMaintenanceActionAvailability,
  type FacilityMaintenanceActionId,
  type FacilityMaintenanceCommandResult,
  type FacilityMaintenanceNeedRow,
  type FacilityMaintenanceOperationView,
  type FacilityMaintenanceUiCommand,
} from '@/app/facilityMaintenance'
import type { FacilityMaintenanceInterventionType } from '@/domain/facilityEconomy'
import type { GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { formatFacilityAmount, humanizeToken } from './facilitiesPresentation'

/**
 * Manager surface for authorized maintenance and repair. It explains, never decides: every button is built from an
 * action availability that the command layer computed by dry-running the real command, and a click calls that same
 * command through the store. A quoted cost is evidence, never money committed; reserved, recognized, owed and paid
 * amounts are read from Finance. Offers and providers marked simulated come from the BDM game-balance preset.
 */
const ACTION_LABEL: Readonly<Record<FacilityMaintenanceActionId, string>> = Object.freeze({
  OPEN_PROPOSAL: 'Open maintenance proposal',
  REQUEST_OFFERS: 'Request offers from providers',
  SELECT_OFFER: 'Select sourced offer',
  REQUEST_APPROVAL: 'Request institutional approval',
  APPROVE: 'Approve as my governing body',
  RESERVE_AND_CONTRACT: 'Reserve funds and accept contract',
  START_WORK: 'Start work',
  COMPLETE_WORK: 'Accept completed work (contract milestone)',
  REQUEST_CANCELLATION: 'Request cancellation decision',
  CANCEL: 'Cancel operation',
})

const ALERT_TEXT: Readonly<Record<string, string>> = Object.freeze({
  COST_UNKNOWN: 'Cost unknown: no sourced offer is selected, so nothing can be approved or funded.',
  OFFER_EXPIRED: 'The selected offer has expired; a contract cannot be accepted under it.',
  INSTITUTIONAL_AUTHORITY_UNVERIFIED: 'Institutional authority is unverified for this club.',
  FUNDS_RESERVED: 'Funds are reserved; nothing is owed yet.',
  WORK_IN_PROGRESS: 'Work in progress: the component is unavailable to Training and Medical until the work is accepted or stopped.',
  REPAIR_COMPLETED: 'Work accepted.',
  OBLIGATION_PENDING: 'An obligation is recognized and not yet fully paid.',
  PAYMENT_PENDING: 'Payment pending.',
  OPERATION_CANCELLED: 'Operation cancelled; its history is preserved.',
})

function alertText(alert: string): string {
  if (alert.startsWith('FUNDING_BLOCKED:')) return `Funding blocked by Finance (${humanizeToken(alert.slice('FUNDING_BLOCKED:'.length))}). The need and the proposal are preserved.`
  return ALERT_TEXT[alert] ?? alert
}

function money(currencyCode: string | null, minorUnits: number | null): string {
  return currencyCode === null || minorUnits === null ? 'Unknown' : formatFacilityAmount(currencyCode, minorUnits)
}

function resultText(result: FacilityMaintenanceCommandResult): string {
  if (result.status === 'APPLIED') return 'Done.'
  if (result.status === 'NO_CHANGE') return 'Nothing changed.'
  const text = result.reasons.map((reason) => FACILITY_MAINTENANCE_REASON_TEXT[reason]).join(' ')
  return result.canonicalReasons.length === 0 ? text : `${text} (${result.canonicalReasons.map(humanizeToken).join(', ')})`
}

export function FacilityMaintenanceOperationsPanel({
  world,
  teamId,
  execute,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly execute: (command: FacilityMaintenanceUiCommand) => FacilityMaintenanceCommandResult
}) {
  const rows = useMemo(() => buildFacilityMaintenanceNeedRows(world, teamId), [world, teamId])
  const [notice, setNotice] = useState<{ readonly tone: 'APPLIED' | 'BLOCKED'; readonly text: string } | null>(null)
  const [intervention, setIntervention] = useState<FacilityMaintenanceInterventionType>('REPAIR')

  const run = (command: FacilityMaintenanceUiCommand) => {
    const result = execute(command)
    setNotice({ tone: result.status === 'APPLIED' ? 'APPLIED' : 'BLOCKED', text: resultText(result) })
  }

  return (
    <div className="ng-canon__panel ng-holo-panel" data-ng-region="facilities-maintenance-operations">
      <p className="ng-canon__eyebrow">Maintenance &amp; repair operations</p>
      <p className="ng-canon__note">
        A quoted cost is evidence, not money. Offers, approval, funding reservation, contract, physical work, recognition, payable and payment are separate steps.
      </p>
      {notice === null ? null : (
        <p className="ng-canon__note" data-ng-notice={notice.tone} role="status">
          {notice.text}
        </p>
      )}
      {rows.length === 0 ? <p className="ng-canon__empty">No maintenance need is recorded for this club.</p> : null}
      {rows.map((row) => (
        <NeedOperations key={row.needId} intervention={intervention} onIntervention={setIntervention} row={row} run={run} />
      ))}
    </div>
  )
}

function ActionButtons({ actions, run, build }: { readonly actions: readonly FacilityMaintenanceActionAvailability[]; readonly run: (command: FacilityMaintenanceUiCommand) => void; readonly build: (action: FacilityMaintenanceActionAvailability) => FacilityMaintenanceUiCommand | null }) {
  return (
    <ul className="ng-canon__list" data-ng-region="facilities-maintenance-actions">
      {actions.map((action) => {
        const command = action.enabled ? build(action) : null
        return (
          <li key={action.id}>
            <button disabled={command === null} onClick={() => command !== null && run(command)} type="button">
              {ACTION_LABEL[action.id]}
            </button>
            {action.reasonText === null ? null : <span className="ng-canon__note"> — {action.enabled ? `Finance currently refuses this: ${action.reasonText}` : action.reasonText}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function NeedOperations({ row, run, intervention, onIntervention }: { readonly row: FacilityMaintenanceNeedRow; readonly run: (command: FacilityMaintenanceUiCommand) => void; readonly intervention: FacilityMaintenanceInterventionType; readonly onIntervention: (value: FacilityMaintenanceInterventionType) => void }) {
  const open = row.openProposalAction
  return (
    <section data-need-id={row.needId} className="ng-canon__panel">
      <p className="ng-canon__eyebrow">
        {row.needId} · {humanizeToken(row.severity)} · {humanizeToken(row.needStatus)}
      </p>
      {row.active === null ? (
        <>
          <label>
            Intervention{' '}
            <select aria-label={`Intervention for ${row.needId}`} onChange={(event) => onIntervention(event.target.value as FacilityMaintenanceInterventionType)} value={intervention}>
              <option value="ROUTINE_MAINTENANCE">Routine maintenance</option>
              <option value="PREVENTIVE_MAINTENANCE">Preventive maintenance</option>
              <option value="REPAIR">Repair</option>
            </select>
          </label>
          <ActionButtons actions={[open]} build={() => ({ kind: 'OPEN_PROPOSAL', needId: row.needId, interventionType: intervention })} run={run} />
          <p className="ng-canon__note">{row.offerCount === 0 ? 'No sourced offer exists for this need: its cost is unknown.' : `${row.offerCount} sourced offer(s) on record.`}</p>
        </>
      ) : (
        <OperationCard view={row.active} run={run} />
      )}
      {row.operations.filter((operation) => operation !== row.active).map((operation) => (
        <p className="ng-canon__note" key={operation.operationId}>
          Earlier operation {operation.operationId}: {humanizeToken(operation.stage)}.
        </p>
      ))}
    </section>
  )
}

function OperationCard({ view, run }: { readonly view: FacilityMaintenanceOperationView; readonly run: (command: FacilityMaintenanceUiCommand) => void }) {
  const { cost, governance, funding, execution, economics } = view
  const build = (action: FacilityMaintenanceActionAvailability): FacilityMaintenanceUiCommand | null => {
    switch (action.id) {
      case 'REQUEST_OFFERS': return { kind: 'REQUEST_OFFERS', operationId: view.operationId }
      case 'SELECT_OFFER': return action.offerId === undefined ? null : { kind: 'SELECT_OFFER', operationId: view.operationId, offerId: action.offerId }
      case 'REQUEST_APPROVAL': return { kind: 'REQUEST_APPROVAL', operationId: view.operationId }
      case 'APPROVE': return action.decisionId === undefined || action.bodyId === undefined ? null : { kind: 'APPROVE', decisionId: action.decisionId, bodyId: action.bodyId }
      case 'RESERVE_AND_CONTRACT': return { kind: 'RESERVE_AND_CONTRACT', operationId: view.operationId }
      case 'START_WORK': return { kind: 'START_WORK', operationId: view.operationId }
      case 'COMPLETE_WORK': return { kind: 'COMPLETE_WORK', operationId: view.operationId, ...(action.inspectionId === undefined ? {} : { inspectionId: action.inspectionId }) }
      case 'REQUEST_CANCELLATION': return { kind: 'REQUEST_CANCELLATION', operationId: view.operationId }
      case 'CANCEL': return { kind: 'CANCEL', operationId: view.operationId }
      default: return null
    }
  }
  const approveAvailable = view.actions.some((action) => action.id === 'APPROVE' && action.enabled)
  const awaitingInstitution = governance.state === 'PENDING' && !approveAvailable
  return (
    <article data-operation-id={view.operationId} data-stage={view.stage}>
      <p className="ng-canon__eyebrow">
        {humanizeToken(view.interventionType)} · stage {humanizeToken(view.stage)}
      </p>
      <ul className="ng-canon__list">
        <li data-ng-region="facility-op-cost">
          Cost: {cost.status === 'UNKNOWN_COST' ? 'Unknown' : `${money(cost.currencyCode, cost.amountMinorUnits)} quoted by ${cost.providerName ?? 'unknown provider'} (${humanizeToken(cost.sourceKind ?? 'UNKNOWN')}, valid until ${cost.validUntil ?? '—'}${cost.expired ? ', expired' : ''}) — evidence, not committed`}
        </li>
        <li data-ng-region="facility-op-governance">
          Governance: {humanizeToken(governance.state)} ({governance.approvedBodyIds.length}/{governance.requiredBodyIds.length} required approvals)
          {awaitingInstitution ? ' — awaiting the institution\'s decision; the Board reviews requests on the next day.' : ''}
        </li>
        <li data-ng-region="facility-op-funding">Funding: {humanizeToken(funding.state)}{funding.blockerCode === null ? '' : ` — ${humanizeToken(funding.blockerCode)}`}</li>
        <li data-ng-region="facility-op-execution">Physical work: {humanizeToken(execution.state)}{execution.completedOn === null ? '' : ` on ${execution.completedOn}`}{execution.outcome === null ? '' : ` (${humanizeToken(execution.outcome)})`}</li>
        <li data-ng-region="facility-op-economics">
          {economics.state === 'NONE'
            ? 'Finance: no cost is authorized yet; nothing is recognized, owed or paid.'
            : `Finance: ${humanizeToken(economics.state)} · recognized ${money(economics.currencyCode, economics.recognizedMinorUnits)} · owed ${money(economics.currencyCode, economics.outstandingMinorUnits)} · paid ${money(economics.currencyCode, economics.settledMinorUnits)}`}
        </li>
      </ul>
      {view.offers.length === 0 ? null : (
        <ul className="ng-canon__list" data-ng-region="facility-op-offers">
          {view.offers.map((offer) => (
            <li data-offer-id={offer.offerId} key={offer.offerId}>
              {offer.providerName} — {money(offer.currencyCode, offer.amountMinorUnits)} ({humanizeToken(offer.classification)}; {offer.executionDays === null ? 'duration not stated' : `${offer.executionDays} days`}
              {offer.resultingCondition === null ? '' : `; promised condition ${offer.resultingCondition}`}; valid until {offer.validUntil}{offer.expired ? ', expired' : ''}; {humanizeToken(offer.sourceKind)}){' '}
              {offer.selected ? <strong>Selected</strong> : (
                <button aria-label={`Select offer ${offer.offerId}`} disabled={offer.blockedReason !== null} onClick={() => run({ kind: 'SELECT_OFFER', operationId: view.operationId, offerId: offer.offerId })} title={offer.blockedReason === null ? undefined : FACILITY_MAINTENANCE_REASON_TEXT[offer.blockedReason]} type="button">
                  Select
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {view.alerts.length === 0 ? null : (
        <ul className="ng-canon__list" data-ng-region="facility-op-alerts">
          {view.alerts.map((alert) => <li key={alert}>{alertText(alert)}</li>)}
        </ul>
      )}
      <ActionButtons actions={view.actions.filter((action) => action.id !== 'SELECT_OFFER')} build={build} run={run} />
      <details>
        <summary>History</summary>
        <ol>{view.history.map((event) => <li key={event.sequence}>{event.effectiveOn} · {humanizeToken(event.kind)}{event.reasonCode === null ? '' : ` · ${humanizeToken(event.reasonCode)}`}</li>)}</ol>
      </details>
    </article>
  )
}
