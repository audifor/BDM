import { createCurrencyCode, listFinanceBearingOrganizationIds, resolveOrganizationCurrency, type ExplicitOrganizationCurrencyAuthority } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'

/**
 * BDM Prototype Finance Policy V1 (BS16M-B2).
 *
 * The prototype career plays in a fictional jurisdiction whose canonical policy deliberately has no currency,
 * so 40 of its 48 finance-bearing Organizations had no canonical currency at all and could not record a single
 * Finance fact. This module is prototype *data*: the value lives here, and it reaches Finance as an explicit
 * Organization currency authority instead of as a rule inside `FinanceCurrencyPolicy`, so canonical Finance
 * still knows nothing about what a "prototype" is and still never guesses a currency for anyone.
 *
 * Two boundaries keep the policy honest:
 * - it covers only prototype Organizations that would otherwise be unresolved, so an Organization with a
 *   canonical profile, an explicit jurisdiction or a shipped ecosystem currency keeps exactly that currency;
 * - only the prototype entry point passes it, so World DB Spain, the ACB and every other universe keep the
 *   unchanged `FINANCE_CURRENCY_UNAVAILABLE` behavior.
 */
export const BDM_PROTOTYPE_FINANCE_POLICY_V1 = Object.freeze({
  version: 1,
  /** The prototype career's fictional jurisdiction uses the euro. Prototype data, never a Finance default. */
  provisionedCurrencyCode: 'EUR',
})

/**
 * The prototype Organizations the policy provisions: every finance-bearing Organization of the prototype world
 * that has no canonical profile and whose currency resolves to nothing. Organizations that already resolve are
 * absent, so the policy can never overwrite an existing currency or turn one into a reported conflict.
 */
export function prototypeOrganizationCurrencyAuthorities(world: GameWorld): readonly ExplicitOrganizationCurrencyAuthority[] {
  const currencyCode = createCurrencyCode(BDM_PROTOTYPE_FINANCE_POLICY_V1.provisionedCurrencyCode)
  return Object.freeze(listFinanceBearingOrganizationIds(world)
    .filter((organizationId) => world.organizationFinancialProfilesById[organizationId] === undefined
      && resolveOrganizationCurrency(world, organizationId).status === 'FINANCE_CURRENCY_UNAVAILABLE')
    .map((organizationId) => Object.freeze({ organizationId, currencyCode })))
}
