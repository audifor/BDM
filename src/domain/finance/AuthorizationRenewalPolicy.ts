import type { FinancialSource } from './FinancialLedger'

/**
 * BS16N-R. Fiscal authorization renewal policy.
 *
 * Materializing the next fiscal period is structural: the period is the fiscal year containing the processed
 * GameDate, and it exists because the calendar moved, not because anyone was allowed to spend. Granting that
 * period spending authorization is a separate, explicit, per-Organization decision, which is what this policy
 * records.
 *
 * `NONE` is the default state of an Organization nobody assigned a policy to: its new period is truthful period
 * truth with no authorization, and Finance keeps reporting `RENEWAL_NOT_MODELLED` /
 * `BUDGET_AUTHORIZATION_NOT_MODELLED`. `CARRY_FORWARD_PREVIOUS_APPROVED_LIMITS` renews the previous fiscal
 * period's approved category limits for the new one. There is no global carry-forward default: a world that
 * assigns nothing renews nothing.
 *
 * The mode is deliberately only about *how* a new period is authorized, never about what the period may
 * consume: no mode carries spent amounts, commitments, reservations, cash, receivables, payables, debt, capital
 * or used headroom into the next period.
 */
export const FINANCIAL_AUTHORIZATION_RENEWAL_MODES = ['NONE', 'CARRY_FORWARD_PREVIOUS_APPROVED_LIMITS'] as const

export type FinancialAuthorizationRenewalMode = typeof FINANCIAL_AUTHORIZATION_RENEWAL_MODES[number]

export interface FinancialAuthorizationRenewalPolicy {
  readonly mode: FinancialAuthorizationRenewalMode
  /** Which policy decided it: recorded on every authorization the policy renews, so provenance is auditable. */
  readonly provenance: FinancialSource
}

export function createFinancialAuthorizationRenewalPolicy(input: {
  readonly mode: string
  readonly provenance: FinancialSource
}): FinancialAuthorizationRenewalPolicy {
  if (!(FINANCIAL_AUTHORIZATION_RENEWAL_MODES as readonly string[]).includes(input.mode)) throw new TypeError(`Financial authorization renewal mode ${input.mode} is not supported`)
  const kind = input.provenance.kind
  if (typeof kind !== 'string' || kind.trim().length === 0) throw new TypeError('Financial authorization renewal policy provenance kind must be non-empty')
  return Object.freeze({
    mode: input.mode as FinancialAuthorizationRenewalMode,
    provenance: Object.freeze({
      kind,
      ...(input.provenance.id === undefined ? {} : { id: input.provenance.id }),
      ...(input.provenance.description === undefined ? {} : { description: input.provenance.description }),
    }),
  })
}

/**
 * True only for the mode that actually renews authorization. `NONE`, an absent policy and a missing profile all
 * answer false, so "no policy" can never be mistaken for "renew automatically".
 */
export function isCarryForwardAuthorizationRenewalPolicy(policy: FinancialAuthorizationRenewalPolicy | null | undefined): policy is FinancialAuthorizationRenewalPolicy {
  return policy !== null && policy !== undefined && policy.mode === 'CARRY_FORWARD_PREVIOUS_APPROVED_LIMITS'
}
