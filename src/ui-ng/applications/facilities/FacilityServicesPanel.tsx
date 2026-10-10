import { useMemo, useState } from 'react'
import {
  FACILITY_MAINTENANCE_REASON_TEXT,
  buildFacilityServiceRows,
  type FacilityMaintenanceCommandResult,
  type FacilityMaintenanceUiCommand,
  type FacilityServiceActionAvailability,
  type FacilityServiceActionId,
  type FacilityServiceOperationView,
  type FacilityServiceRow,
} from '@/app/facilityMaintenance'
import type { GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { formatFacilityAmount, humanizeToken } from './facilitiesPresentation'

/**
 * Manager surface for recurring conservation services. A recurring expense exists only because a signed contract does: each period is
 * billed once through Finance, restores the most worn component, and can be skipped (never charged) when Finance would refuse it.
 */
const ACTION_LABEL: Readonly<Record<FacilityServiceActionId, string>> = Object.freeze({
  OPEN_PROPOSAL: 'Open service proposal',
  REQUEST_OFFERS: 'Request service offers',
  SELECT_OFFER: 'Select service offer',
  REQUEST_APPROVAL: 'Request service approval',
  APPROVE: 'Approve service as my governing body',
  SIGN: 'Sign service contract',
  TERMINATE: 'Give notice of termination',
})

function resultText(result: FacilityMaintenanceCommandResult): string {
  if (result.status === 'APPLIED') return 'Done.'
  if (result.status === 'NO_CHANGE') return 'Nothing changed.'
  const text = result.reasons.map((reason) => FACILITY_MAINTENANCE_REASON_TEXT[reason]).join(' ')
  return result.canonicalReasons.length === 0 ? text : `${text} (${result.canonicalReasons.map(humanizeToken).join(', ')})`
}

export function FacilityServicesPanel({ world, teamId, execute }: { readonly world: GameWorld; readonly teamId: TeamId; readonly execute: (command: FacilityMaintenanceUiCommand) => FacilityMaintenanceCommandResult }) {
  const rows = useMemo(() => buildFacilityServiceRows(world, teamId), [world, teamId])
  const [notice, setNotice] = useState<{ readonly tone: 'APPLIED' | 'BLOCKED'; readonly text: string } | null>(null)
  const run = (command: FacilityMaintenanceUiCommand) => {
    const result = execute(command)
    setNotice({ tone: result.status === 'APPLIED' ? 'APPLIED' : 'BLOCKED', text: resultText(result) })
  }
  return (
    <div className="ng-canon__panel ng-holo-panel" data-ng-region="facilities-services">
      <p className="ng-canon__eyebrow">Recurring services (conservation contract)</p>
      <p className="ng-canon__note">Owning a facility never creates a charge. A conservation contract bills one fee per period, once, and each period restores the most worn component. It runs for its term unless you give notice.</p>
      {notice === null ? null : <p className="ng-canon__note" data-ng-notice={notice.tone} role="status">{notice.text}</p>}
      {rows.length === 0 ? <p className="ng-canon__empty">No facility is available to service.</p> : null}
      {rows.map((row) => <ServiceRow key={row.option.key} row={row} run={run} />)}
    </div>
  )
}

function Buttons({ actions, build, run }: { readonly actions: readonly FacilityServiceActionAvailability[]; readonly build: (action: FacilityServiceActionAvailability) => FacilityMaintenanceUiCommand | null; readonly run: (command: FacilityMaintenanceUiCommand) => void }) {
  return (
    <ul className="ng-canon__list" data-ng-region="facilities-service-actions">
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

function ServiceRow({ row, run }: { readonly row: FacilityServiceRow; readonly run: (command: FacilityMaintenanceUiCommand) => void }) {
  const { option } = row
  return (
    <section className="ng-canon__panel" data-service-key={option.key}>
      <p className="ng-canon__eyebrow">{option.label} · {row.active !== null ? humanizeToken(row.active.stage) : option.eligible ? 'available' : humanizeToken(option.reason)}</p>
      <p className="ng-canon__note">{option.description}</p>
      {row.active === null
        ? (option.eligible ? <Buttons actions={[row.openAction]} build={() => ({ kind: 'SERVICE_OPEN', facilityId: option.facilityId })} run={run} /> : null)
        : <ServiceCard view={row.active} run={run} />}
    </section>
  )
}

function ServiceCard({ view, run }: { readonly view: FacilityServiceOperationView; readonly run: (command: FacilityMaintenanceUiCommand) => void }) {
  const build = (action: FacilityServiceActionAvailability): FacilityMaintenanceUiCommand | null => {
    switch (action.id) {
      case 'REQUEST_OFFERS': return { kind: 'SERVICE_REQUEST_OFFERS', operationId: view.operationId }
      case 'REQUEST_APPROVAL': return { kind: 'SERVICE_REQUEST_APPROVAL', operationId: view.operationId }
      case 'APPROVE': return action.decisionId === undefined || action.bodyId === undefined ? null : { kind: 'APPROVE', decisionId: action.decisionId, bodyId: action.bodyId }
      case 'SIGN': return { kind: 'SERVICE_SIGN', operationId: view.operationId }
      case 'TERMINATE': return { kind: 'SERVICE_TERMINATE', operationId: view.operationId }
      default: return null
    }
  }
  const money = (minorUnits: number, currencyCode: string) => formatFacilityAmount(currencyCode, minorUnits)
  const approveAvailable = view.actions.some((action) => action.id === 'APPROVE' && action.enabled)
  const awaiting = view.governance.state === 'PENDING' && !approveAvailable
  const contract = view.contract
  return (
    <article data-service-operation={view.operationId} data-stage={view.stage}>
      <ul className="ng-canon__list">
        <li data-ng-region="service-contract">
          {contract === null
            ? 'Cost: Unknown — request and select an offer first.'
            : `Contract: ${money(contract.amountPerPeriodMinorUnits, contract.currencyCode)} per ${contract.periodDays} days for ${contract.termPeriods} periods with ${contract.providerName}, restoring ${contract.restorationPoints} condition points per period, ${contract.noticeDays} days notice${contract.startsOn === null ? ' (selected offer is evidence, not committed)' : `, from ${contract.startsOn} to ${contract.endsOn}`}${contract.terminationNoticedEffectiveOn === null ? '' : `; termination effective ${contract.terminationNoticedEffectiveOn}`}${contract.ended ? '; ended' : ''}`}
        </li>
        <li data-ng-region="service-governance">Governance: {humanizeToken(view.governance.state)} ({view.governance.approvedBodyIds.length}/{view.governance.requiredBodyIds.length} required approvals){awaiting ? ' — awaiting the institution decision; the Board reviews requests on the next day.' : ''}</li>
        <li data-ng-region="service-periods">Periods: processed {view.periods.processed} · skipped {view.periods.skipped}{view.periods.nextDueOn === null ? '' : ` · next ${view.periods.nextDueOn}`}{contract === null ? '' : ` · billed ${money(view.periods.billedMinorUnits, contract.currencyCode)}`}</li>
      </ul>
      {view.offers.length === 0 || view.stage === 'CONTRACTED' ? null : (
        <ul className="ng-canon__list" data-ng-region="service-offers">
          {view.offers.map((offer) => (
            <li data-offer-id={offer.offerId} key={offer.offerId}>
              {offer.providerName} — {money(offer.amountPerPeriodMinorUnits, offer.currencyCode)} per {offer.periodDays} days × {offer.termPeriods}; restores {offer.restorationPoints} points; valid until {offer.validUntil}{' '}
              {offer.selected ? <strong>Selected</strong> : <button aria-label={`Select service offer ${offer.offerId}`} disabled={offer.blockedReason !== null} onClick={() => run({ kind: 'SERVICE_SELECT_OFFER', operationId: view.operationId, offerId: offer.offerId })} type="button">Select</button>}
            </li>
          ))}
        </ul>
      )}
      <Buttons actions={view.actions.filter((action) => action.id !== 'SELECT_OFFER')} build={build} run={run} />
      <details><summary>History</summary><ol>{view.history.map((event) => <li key={event.sequence}>{event.effectiveOn} · {humanizeToken(event.kind)}{event.reasonCode === null ? '' : ` · ${humanizeToken(event.reasonCode)}`}</li>)}</ol></details>
    </article>
  )
}
