import { createFinancialAuthorizationRenewalPolicy, listFinanceBearingOrganizationIds, type FinancialAuthorizationRenewalPolicy, type OrganizationAuthorizationRenewalAssignment } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'

/**
 * BDM Annual Authorization Continuity Policy V1 (BS16N-R).
 *
 * The approved product decision for the shipped financial ecosystems: when an Organization's fiscal year rolls
 * over, the previous fiscal period's approved category limits become the new period's authorization, so a
 * legitimate multi-year career can keep operating its clubs. Only the approved limits by category and currency
 * carry forward — spent amounts, commitments, reservations, cash, receivables, payables, debt, capital and used
 * headroom never do, because the new period starts with new authorization against the obligations that actually
 * belong to that period.
 *
 * This module is product *data*, not a Finance rule. Canonical Finance has no global carry-forward default, so an
 * Organization nobody assigns this policy to keeps the truthful `RENEWAL_NOT_MODELLED` /
 * `BUDGET_AUTHORIZATION_NOT_MODELLED` answer; the policy reaches Finance as an explicit per-Organization
 * assignment from the entry point that owns that universe (Prototype, ACB Demo, World DB Spain). A future
 * Governance-approved annual budget replaces it by assigning a different policy — no Finance redesign needed.
 */
export const BDM_ANNUAL_AUTHORIZATION_CONTINUITY_POLICY_V1 = Object.freeze({
  version: 1,
  mode: 'CARRY_FORWARD_PREVIOUS_APPROVED_LIMITS' as const,
  provenance: { kind: 'PRODUCT_POLICY', id: 'bdm-annual-authorization-continuity-v1', description: 'BDM Annual Authorization Continuity Policy V1' },
})

export function annualAuthorizationContinuityPolicy(): FinancialAuthorizationRenewalPolicy {
  return createFinancialAuthorizationRenewalPolicy(BDM_ANNUAL_AUTHORIZATION_CONTINUITY_POLICY_V1)
}

/**
 * The explicit assignments for one universe: every finance-bearing Organization of that world. The caller is the
 * only thing that decides which universes get annual continuity, so no engine and no other world can inherit it.
 */
export function annualAuthorizationContinuityAuthorities(world: GameWorld): readonly OrganizationAuthorizationRenewalAssignment[] {
  const policy = annualAuthorizationContinuityPolicy()
  return Object.freeze(listFinanceBearingOrganizationIds(world).map((organizationId) => Object.freeze({ organizationId, policy })))
}
