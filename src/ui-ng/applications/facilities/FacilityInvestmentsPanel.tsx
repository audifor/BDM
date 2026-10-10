import { useMemo, useState } from 'react'
import {
  FACILITY_MAINTENANCE_REASON_TEXT,
  buildFacilityInvestmentRows,
  type FacilityInvestmentActionAvailability,
  type FacilityInvestmentActionId,
  type FacilityInvestmentOperationView,
  type FacilityInvestmentRow,
  type FacilityMaintenanceCommandResult,
  type FacilityMaintenanceUiCommand,
} from '@/app/facilityMaintenance'
import type { GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { formatFacilityAmount, humanizeToken } from './facilitiesPresentation'

/**
 * Manager surface for capital investments (renovation, replacement, expansion). It explains and invokes real commands only: each
 * button comes from a dry run of the command. A quote is evidence, not money; recognized, owed and paid amounts are read from Finance,
 * milestone by milestone. Benefits are only the physical change the works actually make.
 */
const ACTION_LABEL: Readonly<Record<FacilityInvestmentActionId, string>> = Object.freeze({
  OPEN_PROPOSAL: 'Open investment proposal',
  REQUEST_OFFERS: 'Request offers from providers',
  SELECT_OFFER: 'Select offer',
  REQUEST_APPROVAL: 'Request Board approval',
  APPROVE: 'Approve as my governing body',
  RESERVE_AND_CONTRACT: 'Reserve funds and sign contract',
  START_WORK: 'Start works (first milestone)',
  ACCEPT_WORK: 'Accept finished works (final milestone)',
  REQUEST_CANCELLATION: 'Request cancellation decision',
  CANCEL: 'Cancel investment',
})

const ALERT_TEXT: Readonly<Record<string, string>> = Object.freeze({
  COST_UNKNOWN: 'Cost unknown: request and select an offer first.',
  OFFER_EXPIRED: 'The selected offer has expired; a contract cannot be signed under it.',
  INSTITUTIONAL_AUTHORITY_UNVERIFIED: 'Institutional authority is unverified for this club.',
  FUNDS_RESERVED: 'Funds are reserved per milestone; nothing is owed until a milestone is reached.',
  WORKS_IN_PROGRESS: 'Works in progress: the affected component is unavailable to Training and Medical.',
  INVESTMENT_COMPLETED: 'Works accepted; the physical result is recorded.',
  PAYMENT_PENDING: 'A milestone payable is pending payment.',
  OPERATION_CANCELLED: 'Investment cancelled; recognized milestones stay as they are.',
})

function alertText(alert: string): string {
  if (alert.startsWith('FUNDING_BLOCKED:')) return `Funding blocked by Finance (${humanizeToken(alert.slice('FUNDING_BLOCKED:'.length))}). The proposal is preserved.`
  return ALERT_TEXT[alert] ?? alert
}

const money = (currencyCode: string | null, minorUnits: number | null) => currencyCode === null || minorUnits === null ? 'Unknown' : formatFacilityAmount(currencyCode, minorUnits)

function resultText(result: FacilityMaintenanceCommandResult): string {
  if (result.status === 'APPLIED') return 'Done.'
  if (result.status === 'NO_CHANGE') return 'Nothing changed.'
  const text = result.reasons.map((reason) => FACILITY_MAINTENANCE_REASON_TEXT[reason]).join(' ')
  return result.canonicalReasons.length === 0 ? text : `${text} (${result.canonicalReasons.map(humanizeToken).join(', ')})`
}

export function FacilityInvestmentsPanel({ world, teamId, execute }: { readonly world: GameWorld; readonly teamId: TeamId; readonly execute: (command: FacilityMaintenanceUiCommand) => FacilityMaintenanceCommandResult }) {
  const rows = useMemo(() => buildFacilityInvestmentRows(world, teamId), [world, teamId])
  const [notice, setNotice] = useState<{ readonly tone: 'APPLIED' | 'BLOCKED'; readonly text: string } | null>(null)
  const run = (command: FacilityMaintenanceUiCommand) => {
    const result = execute(command)
    setNotice({ tone: result.status === 'APPLIED' ? 'APPLIED' : 'BLOCKED', text: resultText(result) })
  }
  return (
    <div className="ng-canon__panel ng-holo-panel" data-ng-region="facilities-investments">
      <p className="ng-canon__eyebrow">Investments (renovation, replacement, expansion)</p>
      <p className="ng-canon__note">An investment is offered only where the physical situation justifies it. Prices are quotes (evidence, not money); the price is paid in contract milestones.</p>
      {notice === null ? null : <p className="ng-canon__note" data-ng-notice={notice.tone} role="status">{notice.text}</p>}
      {rows.length === 0 ? <p className="ng-canon__empty">No facility is available to invest in.</p> : null}
      {rows.map((row) => <InvestmentRow key={row.option.key} row={row} run={run} />)}
    </div>
  )
}

function Buttons({ actions, build, run }: { readonly actions: readonly FacilityInvestmentActionAvailability[]; readonly build: (action: FacilityInvestmentActionAvailability) => FacilityMaintenanceUiCommand | null; readonly run: (command: FacilityMaintenanceUiCommand) => void }) {
  return (
    <ul className="ng-canon__list" data-ng-region="facilities-investment-actions">
      {actions.map((action) => {
        const command = action.enabled ? build(action) : null
        return (
          <li key={action.id}>
            <button disabled={command === null} onClick={() => command !== null && run(command)} type="button">{ACTION_LABEL[action.id]}</button>
            {action.reasonText === null ? null : <span className="ng-canon__note"> — {action.enabled ? `Finance currently refuses this: ${action.reasonText}` : action.reasonText}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function InvestmentRow({ row, run }: { readonly row: FacilityInvestmentRow; readonly run: (command: FacilityMaintenanceUiCommand) => void }) {
  const { option } = row
  return (
    <section className="ng-canon__panel" data-investment-key={option.key}>
      <p className="ng-canon__eyebrow">{option.label} · {option.eligible || row.active !== null ? 'justified' : 'not justified now'}</p>
      <p className="ng-canon__note">{option.limitation}</p>
      {row.active === null ? (
        option.eligible ? <Buttons actions={[row.openAction]} build={() => ({ kind: 'INVEST_OPEN', facilityId: option.facilityId, investment: option.kind, componentId: option.componentId })} run={run} /> : null
      ) : <OperationCard view={row.active} run={run} />}
      {row.active === null && row.lastCompleted !== null ? <OperationCard view={row.lastCompleted} run={run} /> : null}
      {row.operations.filter((operation) => operation !== row.active && operation !== row.lastCompleted).map((operation) => (
        <p className="ng-canon__note" key={operation.operationId}>Earlier investment {operation.operationId}: {humanizeToken(operation.stage)}.</p>
      ))}
    </section>
  )
}

function OperationCard({ view, run }: { readonly view: FacilityInvestmentOperationView; readonly run: (command: FacilityMaintenanceUiCommand) => void }) {
  const build = (action: FacilityInvestmentActionAvailability): FacilityMaintenanceUiCommand | null => {
    switch (action.id) {
      case 'REQUEST_OFFERS': return { kind: 'INVEST_REQUEST_OFFERS', operationId: view.operationId }
      case 'SELECT_OFFER': return action.offerId === undefined ? null : { kind: 'INVEST_SELECT_OFFER', operationId: view.operationId, offerId: action.offerId }
      case 'REQUEST_APPROVAL': return { kind: 'INVEST_REQUEST_APPROVAL', operationId: view.operationId }
      case 'APPROVE': return action.decisionId === undefined || action.bodyId === undefined ? null : { kind: 'APPROVE', decisionId: action.decisionId, bodyId: action.bodyId }
      case 'RESERVE_AND_CONTRACT': return { kind: 'INVEST_RESERVE', operationId: view.operationId }
      case 'START_WORK': return { kind: 'INVEST_START', operationId: view.operationId }
      case 'ACCEPT_WORK': return { kind: 'INVEST_ACCEPT', operationId: view.operationId }
      case 'REQUEST_CANCELLATION': return { kind: 'INVEST_REQUEST_CANCELLATION', operationId: view.operationId }
      case 'CANCEL': return { kind: 'INVEST_CANCEL', operationId: view.operationId }
      default: return null
    }
  }
  const approveAvailable = view.actions.some((action) => action.id === 'APPROVE' && action.enabled)
  const awaiting = view.governance.state === 'PENDING' && !approveAvailable
  return (
    <article data-investment-operation={view.operationId} data-stage={view.stage}>
      <p className="ng-canon__eyebrow">{humanizeToken(view.kind)} · stage {humanizeToken(view.stage)} · project {humanizeToken(view.projectStatus)}</p>
      <ul className="ng-canon__list">
        <li data-ng-region="investment-cost">
          Cost: {view.cost.status === 'UNKNOWN_COST' ? 'Unknown' : `${money(view.cost.currencyCode, view.cost.amountMinorUnits)} quoted by ${view.cost.providerName ?? 'unknown provider'}, ${view.cost.executionDays ?? '?'} days, promised condition ${view.cost.promisedCondition ?? 'not stated'} — evidence, not committed`}
        </li>
        <li data-ng-region="investment-governance">Governance: {humanizeToken(view.governance.state)} ({view.governance.approvedBodyIds.length}/{view.governance.requiredBodyIds.length} required approvals){awaiting ? ' — awaiting the institution\'s decision; the Board reviews requests on the next day.' : ''}</li>
        <li data-ng-region="investment-funding">Funding: {humanizeToken(view.funding.state)}{view.funding.blockerCode === null ? '' : ` — ${humanizeToken(view.funding.blockerCode)}`} · reservations open {view.funding.openReservations}, used {view.funding.consumedReservations}</li>
        <li data-ng-region="investment-execution">Works: {humanizeToken(view.execution.state)}{view.execution.startedOn === null ? '' : ` since ${view.execution.startedOn}`}{view.execution.completedOn === null ? '' : `, completed ${view.execution.completedOn}`}</li>
        <li data-ng-region="investment-economics">Finance: recognized {money(view.economics.currencyCode, view.economics.recognizedMinorUnits)} · owed {money(view.economics.currencyCode, view.economics.owedMinorUnits)} · paid {money(view.economics.currencyCode, view.economics.paidMinorUnits)}</li>
      </ul>
      {view.tranches.length === 0 ? null : (
        <ul className="ng-canon__list" data-ng-region="investment-tranches">
          {view.tranches.map((tranche) => <li key={tranche.label}>{humanizeToken(tranche.label)} ({tranche.permille / 10}% — {money(view.cost.currencyCode, tranche.amountMinorUnits)}): {humanizeToken(tranche.state)}{tranche.dueOn === null ? '' : `, due ${tranche.dueOn}`}</li>)}
        </ul>
      )}
      {view.offers.length === 0 ? null : (
        <ul className="ng-canon__list" data-ng-region="investment-offers">
          {view.offers.map((offer) => (
            <li data-offer-id={offer.offerId} key={offer.offerId}>
              {offer.providerName} — {money(offer.currencyCode, offer.amountMinorUnits)}; {offer.executionDays ?? '?'} days; promised condition {offer.promisedCondition ?? 'not stated'}; valid until {offer.validUntil}{offer.expired ? ', expired' : ''}{' '}
              {offer.selected ? <strong>Selected</strong> : <button aria-label={`Select investment offer ${offer.offerId}`} disabled={offer.blockedReason !== null} onClick={() => run({ kind: 'INVEST_SELECT_OFFER', operationId: view.operationId, offerId: offer.offerId })} type="button">Select</button>}
            </li>
          ))}
        </ul>
      )}
      {view.alerts.length === 0 ? null : <ul className="ng-canon__list" data-ng-region="investment-alerts">{view.alerts.map((alert) => <li key={alert}>{alertText(alert)}</li>)}</ul>}
      <Buttons actions={view.actions.filter((action) => action.id !== 'SELECT_OFFER')} build={build} run={run} />
      <details><summary>History</summary><ol>{view.history.map((event) => <li key={event.sequence}>{event.effectiveOn} · {humanizeToken(event.kind)}{event.reasonCode === null ? '' : ` · ${humanizeToken(event.reasonCode)}`}</li>)}</ol></details>
    </article>
  )
}
