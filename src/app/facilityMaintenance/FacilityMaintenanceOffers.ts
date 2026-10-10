/**
 * Offer issuing under BDM_GAME_BALANCE_V1: "request quotes" for an open maintenance operation.
 *
 * The authorized cost model is the preset's calibrated catalog: for each synthetic provider the price is the
 * catalog base price of the work kind times the provider's factor, rounded to whole currency units. Offers are
 * persisted once with a deterministic id and are never recalculated: asking again returns the same records.
 * No offer is issued where the preset has no market (unsupported currency/ecosystem): the cost stays UNKNOWN_COST.
 */

import { addDays } from '@/domain/date'
import { componentConditionAt } from '@/domain/facilities'
import { createFacilityMaintenanceOffer, deriveFacilityOperationLifecycle, facilityOperationEvents, type FacilityMaintenanceInterventionType, type FacilityMaintenanceOffer } from '@/domain/facilityEconomy'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import {
  GAME_BALANCE_MARKETS,
  GAME_BALANCE_OFFER_VALID_DAYS,
  GAME_BALANCE_PAYMENT_DUE_DAYS,
  GAME_BALANCE_PROVIDERS,
  WORK_KIND_RESULT,
  gameBalanceId,
  type GameBalanceWorkKind,
} from '@/app/gameBalance/BdmGameBalanceV1'
import { gameBalanceCatalogEntryId, gameBalanceProviderId, teamEcosystemKind } from '@/app/gameBalance/GameBalanceBootstrap'
import { registerFacilityEconomyRecord, type FacilityMaintenanceCommandResult } from './FacilityMaintenanceCommands'

const CLASSIFICATION: Readonly<Record<GameBalanceWorkKind, FacilityMaintenanceOffer['classification']>> = {
  ROUTINE_MAINTENANCE: 'OPEX_ROUTINE_MAINTENANCE',
  PREVENTIVE_MAINTENANCE: 'OPEX_ROUTINE_MAINTENANCE',
  MINOR_REPAIR: 'OPEX_RESTORATIVE_REPAIR',
  MAJOR_REPAIR: 'OPEX_RESTORATIVE_REPAIR',
  MINOR_REPLACEMENT: 'OPEX_MINOR_REPLACEMENT',
}

export function gameBalanceOfferId(operationId: string, providerSlug: string, workKind: GameBalanceWorkKind): string {
  return gameBalanceId('offer', operationId, providerSlug, workKind.toLowerCase())
}

/** Which work kinds the preset quotes for an operation: the primary kind for every provider, plus a replacement alternative for serious repairs. */
export function quotedWorkKinds(interventionType: string, severity: string): readonly { readonly workKind: GameBalanceWorkKind; readonly providerSlugs: readonly string[] }[] {
  const all = GAME_BALANCE_PROVIDERS.map((provider) => provider.slug)
  if (interventionType === 'ROUTINE_MAINTENANCE') return [{ workKind: 'ROUTINE_MAINTENANCE', providerSlugs: all }]
  if (interventionType === 'PREVENTIVE_MAINTENANCE') return [{ workKind: 'PREVENTIVE_MAINTENANCE', providerSlugs: all }]
  const serious = severity === 'MAJOR' || severity === 'CRITICAL'
  return [
    { workKind: serious ? 'MAJOR_REPAIR' : 'MINOR_REPAIR', providerSlugs: all },
    ...(severity === 'MINOR' ? [] : [{ workKind: 'MINOR_REPLACEMENT' as const, providerSlugs: ['standard-services'] }]),
  ]
}

function roundToWholeUnits(minorUnits: number): number { return Math.max(100, Math.round(minorUnits / 100) * 100) }

/**
 * Issues (once) the preset's offers for an operation that has no decision yet. Idempotent: existing offers are kept
 * byte for byte. Returns APPLIED when it issued something, NO_CHANGE when they already existed.
 */
export function requestFacilityOffers(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string }): FacilityMaintenanceCommandResult {
  const blocked = (reason: FacilityMaintenanceCommandResult['reasons'][number], canonical: readonly string[] = []): FacilityMaintenanceCommandResult => Object.freeze({ status: 'BLOCKED' as const, world, operationId: input.operationId, reasons: Object.freeze([reason]), canonicalReasons: Object.freeze([...canonical]), decisionId: null })
  const team = world.teams[input.teamId]
  if (team === undefined) return blocked('UNKNOWN_TEAM')
  const lifecycle = deriveFacilityOperationLifecycle(facilityOperationEvents(world, input.operationId))
  if (lifecycle === null || lifecycle.projectId !== null) return blocked('OPERATION_NOT_FOUND')
  if (lifecycle.organizationId !== String(team.organizationId)) return blocked('NOT_CLUB_FACILITY')
  if (lifecycle.cancelled) return blocked('OPERATION_CANCELLED')
  if (lifecycle.decisionId !== null) return blocked('OFFER_LOCKED_BY_DECISION')
  const kind = teamEcosystemKind(world, team.id)
  const profile = world.organizationFinancialProfilesById[team.organizationId]
  if (kind === null || profile === undefined) return blocked('COST_UNKNOWN', ['NO_AUTHORIZED_COST_MODEL'])
  const market = GAME_BALANCE_MARKETS[kind]
  if (String(profile.baseCurrencyCode) !== market.currencyCode) return blocked('OFFER_CURRENCY_MISMATCH', ['NO_AUTHORIZED_COST_MODEL'])
  const need = world.facilityMaintenanceNeedsById[lifecycle.needId as never]
  if (need === undefined || lifecycle.interventionType === null || lifecycle.facilityId === null) return blocked('NEED_NOT_FOUND')
  const current = need.componentId === null ? null : componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), need.componentId, world.currentDate)?.physicalCondition ?? null
  const issued: FacilityMaintenanceOffer[] = []
  for (const { workKind, providerSlugs } of quotedWorkKinds(lifecycle.interventionType, need.severity)) {
    for (const slug of providerSlugs) {
      const provider = GAME_BALANCE_PROVIDERS.find((item) => item.slug === slug)!
      const id = gameBalanceOfferId(input.operationId, slug, workKind)
      if (world.facilityEconomyRecordsById[id] !== undefined) continue
      const result = WORK_KIND_RESULT[workKind]
      const resultingCondition = current === null ? null : result.mode === 'ADD' ? Math.min(100, Math.round(current + result.points)) : Math.max(Math.round(current), result.points)
      issued.push(createFacilityMaintenanceOffer({
        id, organizationId: String(team.organizationId), facilityId: lifecycle.facilityId, needId: String(need.id), componentId: need.componentId === null ? null : String(need.componentId),
        interventionType: lifecycle.interventionType as FacilityMaintenanceInterventionType, classification: CLASSIFICATION[workKind], providerId: gameBalanceProviderId(slug), sourceKind: 'SIMULATED_MODEL',
        evidence: { sourceId: gameBalanceId('catalog-source', kind), catalogEntryId: gameBalanceCatalogEntryId(kind, workKind), modelVersion: '1' },
        amount: { currencyCode: market.currencyCode, minorUnits: roundToWholeUnits(market.basePriceMinorUnits[workKind] * provider.priceFactorPermille / 1_000) }, market: market.key,
        issuedOn: world.currentDate, validFrom: world.currentDate, validUntil: addDays(world.currentDate, GAME_BALANCE_OFFER_VALID_DAYS),
        terms: { paymentDueDays: GAME_BALANCE_PAYMENT_DUE_DAYS, executionDays: provider.executionDays, resultingCondition },
      }))
    }
  }
  let next = world
  for (const offer of issued) {
    const registered = registerFacilityEconomyRecord(next, offer)
    if (registered.status === 'BLOCKED') return Object.freeze({ ...registered, operationId: input.operationId })
    next = registered.world
  }
  return Object.freeze({ status: issued.length === 0 ? 'NO_CHANGE' as const : 'APPLIED' as const, world: next, operationId: input.operationId, reasons: Object.freeze([]), canonicalReasons: Object.freeze([]), decisionId: null })
}

/** Offers on record for an operation's need, newest validity first. */
export function offersForOperation(world: GameWorld, operationId: string): readonly FacilityMaintenanceOffer[] {
  const lifecycle = deriveFacilityOperationLifecycle(facilityOperationEvents(world, operationId))
  if (lifecycle === null) return []
  return Object.values(world.facilityEconomyRecordsById)
    .filter((record): record is FacilityMaintenanceOffer => record.recordKind === 'OFFER' && record.needId === lifecycle.needId && record.organizationId === lifecycle.organizationId)
    .sort((a, b) => a.amount.minorUnits - b.amount.minorUnits || a.id.localeCompare(b.id))
}
