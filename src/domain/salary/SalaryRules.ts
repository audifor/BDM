import type { SeasonId } from '@/domain/ids'

export type SalaryCapModel = 'none' | 'soft' | 'hard'
export interface SalaryTaxTier { readonly upTo: number | null; readonly rate: number }
export interface SalaryApron { readonly id: string; readonly amount: number; readonly restrictedTransactionKinds: readonly string[] }
export interface SalaryBand { readonly minServiceYears: number; readonly maxServiceYears: number | null; readonly amount: number }
export interface SalaryMaximumBand { readonly minServiceYears: number; readonly maxServiceYears: number | null; readonly capPercentage: number }
export interface RookieScaleEntry { readonly pickOrder: number; readonly cashSalary: number; readonly capHit: number; readonly guaranteedAmount: number }
export interface SalaryExceptionRule { readonly id: string; readonly amount: number; readonly partiallyConsumable: boolean; readonly expiresAfterSeasons: number }
export interface TradeSalaryMatchingRule { readonly maximumPayroll: number | null; readonly incomingMultiplier: number; readonly incomingAllowance: number }
export interface SalaryRules {
  readonly seasonId: SeasonId
  readonly capModel: SalaryCapModel
  readonly capAmount: number
  readonly salaryFloor?: number
  readonly tax?: { readonly threshold: number; readonly tiers: readonly SalaryTaxTier[] }
  readonly aprons: readonly SalaryApron[]
  readonly minimumSalaryBands: readonly SalaryBand[]
  readonly maximumSalaryBands: readonly SalaryMaximumBand[]
  readonly rookieScale?: { readonly contractYears: number; readonly entries: readonly RookieScaleEntry[] }
  readonly exceptionRules: readonly SalaryExceptionRule[]
  readonly contractLength: { readonly minimumYears: number; readonly maximumYears: number }
  readonly tradeSalaryMatchingRules: readonly TradeSalaryMatchingRule[]
}

export function createSalaryRules(input: SalaryRules): SalaryRules {
  if (!Number.isInteger(input.capAmount) || input.capAmount < 0 || !Number.isInteger(input.contractLength.minimumYears) || !Number.isInteger(input.contractLength.maximumYears) || input.contractLength.minimumYears < 1 || input.contractLength.maximumYears < input.contractLength.minimumYears) throw new RangeError('Salary rules are invalid')
  if (input.salaryFloor !== undefined && (!Number.isInteger(input.salaryFloor) || input.salaryFloor < 0)) throw new RangeError('Salary floor is invalid')
  if (input.tax !== undefined && (!Number.isInteger(input.tax.threshold) || input.tax.threshold < 0 || input.tax.tiers.length === 0 || input.tax.tiers.some((tier) => tier.upTo !== null && (!Number.isInteger(tier.upTo) || tier.upTo < 1) || !Number.isFinite(tier.rate) || tier.rate < 0))) throw new RangeError('Salary tax rules are invalid')
  if (input.aprons.some((apron) => !apron.id || !Number.isInteger(apron.amount) || apron.amount < 0) || new Set(input.aprons.map((apron) => apron.id)).size !== input.aprons.length) throw new RangeError('Salary aprons are invalid')
  if (input.minimumSalaryBands.some((band) => !validBand(band) || !Number.isInteger(band.amount) || band.amount < 1) || input.maximumSalaryBands.some((band) => !validBand(band) || !Number.isFinite(band.capPercentage) || band.capPercentage <= 0)) throw new RangeError('Salary bands are invalid')
  if (input.rookieScale !== undefined && (!Number.isInteger(input.rookieScale.contractYears) || input.rookieScale.contractYears < 1 || input.rookieScale.entries.some((entry) => !Number.isInteger(entry.pickOrder) || entry.pickOrder < 1 || !money(entry.cashSalary) || !money(entry.capHit) || !money(entry.guaranteedAmount) || entry.guaranteedAmount > entry.cashSalary) || new Set(input.rookieScale.entries.map((entry) => entry.pickOrder)).size !== input.rookieScale.entries.length)) throw new RangeError('Rookie scale rules are invalid')
  if (input.exceptionRules.some((rule) => !rule.id || !money(rule.amount) || !Number.isInteger(rule.expiresAfterSeasons) || rule.expiresAfterSeasons < 1) || new Set(input.exceptionRules.map((rule) => rule.id)).size !== input.exceptionRules.length) throw new RangeError('Salary exception rules are invalid')
  if (input.tradeSalaryMatchingRules.length === 0 || input.tradeSalaryMatchingRules.some((rule) => (rule.maximumPayroll !== null && (!money(rule.maximumPayroll) || rule.maximumPayroll < 0)) || !Number.isFinite(rule.incomingMultiplier) || rule.incomingMultiplier < 0 || !money(rule.incomingAllowance))) throw new RangeError('Trade salary matching rules are invalid')
  return Object.freeze({ ...input, aprons: Object.freeze(input.aprons.map((apron) => Object.freeze({ ...apron, restrictedTransactionKinds: Object.freeze([...apron.restrictedTransactionKinds]) }))), minimumSalaryBands: Object.freeze(input.minimumSalaryBands.map((band) => Object.freeze({ ...band }))), maximumSalaryBands: Object.freeze(input.maximumSalaryBands.map((band) => Object.freeze({ ...band }))), ...(input.tax === undefined ? {} : { tax: Object.freeze({ threshold: input.tax.threshold, tiers: Object.freeze(input.tax.tiers.map((tier) => Object.freeze({ ...tier }))) }) }), ...(input.rookieScale === undefined ? {} : { rookieScale: Object.freeze({ contractYears: input.rookieScale.contractYears, entries: Object.freeze(input.rookieScale.entries.map((entry) => Object.freeze({ ...entry }))) }) }), exceptionRules: Object.freeze(input.exceptionRules.map((rule) => Object.freeze({ ...rule }))), contractLength: Object.freeze({ ...input.contractLength }), tradeSalaryMatchingRules: Object.freeze(input.tradeSalaryMatchingRules.map((rule) => Object.freeze({ ...rule }))) })
}

function validBand(band: Pick<SalaryBand, 'minServiceYears' | 'maxServiceYears'>): boolean { return Number.isInteger(band.minServiceYears) && band.minServiceYears >= 0 && (band.maxServiceYears === null || Number.isInteger(band.maxServiceYears) && band.maxServiceYears >= band.minServiceYears) }
function money(value: number): boolean { return Number.isInteger(value) && value >= 0 }
