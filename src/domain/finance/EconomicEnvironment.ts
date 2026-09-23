import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createCurrencyCode, createMoney, type CurrencyCode, type FinancialSource, type Money } from './FinancialLedger'
import { createFinancialSource } from './FinancialLedger'

/** Rational positive factors avoid binary floating point money arithmetic. */
export interface EconomicFactor { readonly numerator: number; readonly denominator: number }
export interface EconomicObservation {
  readonly id: string
  readonly kind: 'INFLATION_INDEX' | 'COST_INDEX' | 'GROWTH_INDEX'
  readonly region: string
  readonly currencyCode: CurrencyCode
  readonly effectiveOn: GameDate
  readonly factor: EconomicFactor
  readonly provenance: FinancialSource
}
export interface ExchangeRate {
  readonly id: string
  readonly baseCurrencyCode: CurrencyCode
  readonly quoteCurrencyCode: CurrencyCode
  readonly effectiveOn: GameDate
  readonly rate: EconomicFactor
  readonly provenance: FinancialSource
}
export type IndexationPolicy = { readonly kind: 'FIXED' | 'EXTERNALLY_SUPPLIED' } | { readonly kind: 'INDEXED'; readonly observationId: string }

export function createEconomicFactor(value: EconomicFactor): EconomicFactor {
  if (!Number.isSafeInteger(value.numerator) || value.numerator <= 0 || !Number.isSafeInteger(value.denominator) || value.denominator <= 0) throw new RangeError('Economic factor must be a positive safe rational')
  return Object.freeze({ numerator: value.numerator, denominator: value.denominator })
}
export function createEconomicObservation(value: EconomicObservation): EconomicObservation {
  if (!value.id?.trim() || !value.region?.trim() || !['INFLATION_INDEX', 'COST_INDEX', 'GROWTH_INDEX'].includes(value.kind)) throw new TypeError('Economic observation is invalid')
  return Object.freeze({ id: value.id, kind: value.kind, region: value.region, currencyCode: createCurrencyCode(value.currencyCode), effectiveOn: parseGameDate(value.effectiveOn), factor: createEconomicFactor(value.factor), provenance: createFinancialSource(value.provenance) })
}
export function createExchangeRate(value: ExchangeRate): ExchangeRate {
  if (!value.id?.trim() || value.baseCurrencyCode === value.quoteCurrencyCode) throw new TypeError('Exchange rate pair is invalid')
  return Object.freeze({ id: value.id, baseCurrencyCode: createCurrencyCode(value.baseCurrencyCode), quoteCurrencyCode: createCurrencyCode(value.quoteCurrencyCode), effectiveOn: parseGameDate(value.effectiveOn), rate: createEconomicFactor(value.rate), provenance: createFinancialSource(value.provenance) })
}
export function createIndexationPolicy(value: IndexationPolicy): IndexationPolicy {
  if (value.kind === 'INDEXED') { if (!value.observationId?.trim()) throw new TypeError('Indexed policy requires observationId'); return Object.freeze({ kind: 'INDEXED', observationId: value.observationId }) }
  if (value.kind !== 'FIXED' && value.kind !== 'EXTERNALLY_SUPPLIED') throw new TypeError('Indexation policy is invalid')
  return Object.freeze({ kind: value.kind })
}
export function validateEconomicCollections(observations: readonly EconomicObservation[], rates: readonly ExchangeRate[]): void {
  const observationKeys = new Set<string>(); const rateKeys = new Set<string>()
  for (const item of observations) { const key = `${item.kind}:${item.region}:${item.currencyCode}:${item.effectiveOn}`; if (observationKeys.has(key)) throw new RangeError('Conflicting economic observations for one date and scope'); observationKeys.add(key) }
  for (const item of rates) { const key = `${item.baseCurrencyCode}:${item.quoteCurrencyCode}:${item.effectiveOn}`; if (rateKeys.has(key)) throw new RangeError('Conflicting exchange rates for one date and pair'); rateKeys.add(key) }
}
export function applyEconomicObservation(world: GameWorld, observation: EconomicObservation): GameWorld {
  const value = createEconomicObservation(observation)
  const existing = world.economicObservationsById[value.id]
  if (existing) { if (JSON.stringify(existing) !== JSON.stringify(value)) throw new RangeError('Economic observation ID conflict'); return world }
  return updateGameWorld(world, { economicObservations: [...Object.values(world.economicObservationsById), value] })
}
export function applyExchangeRate(world: GameWorld, rate: ExchangeRate): GameWorld {
  const value = createExchangeRate(rate)
  const existing = world.exchangeRatesById[value.id]
  if (existing) { if (JSON.stringify(existing) !== JSON.stringify(value)) throw new RangeError('Exchange rate ID conflict'); return world }
  return updateGameWorld(world, { exchangeRates: [...Object.values(world.exchangeRatesById), value] })
}
export function indexFutureMoney(amount: Money, policy: IndexationPolicy | undefined, observations: Readonly<Record<string, EconomicObservation>>, asOfDate: GameDate | string): Money {
  if (policy?.kind !== 'INDEXED') return amount
  const observation = observations[policy.observationId]
  if (!observation || observation.currencyCode !== amount.currencyCode || compareGameDates(observation.effectiveOn, parseGameDate(asOfDate)) > 0) throw new RangeError('Applicable index observation is missing')
  return createMoney({ currencyCode: amount.currencyCode, minorUnits: roundedRatio(amount.minorUnits, observation.factor) })
}
export function getExchangeRate(world: GameWorld, base: string, quote: string, asOfDate: GameDate | string): ExchangeRate | undefined {
  const date = parseGameDate(asOfDate)
  return Object.values(world.exchangeRatesById).filter((rate) => rate.baseCurrencyCode === base && rate.quoteCurrencyCode === quote && compareGameDates(rate.effectiveOn, date) <= 0).sort((a, b) => compareGameDates(b.effectiveOn, a.effectiveOn) || a.id.localeCompare(b.id))[0]
}
export function getEconomicEnvironmentSnapshot(world: GameWorld, region: string, currencyCode: string, asOfDate: GameDate | string) {
  const date = parseGameDate(asOfDate); const currency = createCurrencyCode(currencyCode)
  const indicators = Object.values(world.economicObservationsById).filter((item) => item.region === region && item.currencyCode === currency && item.effectiveOn <= date).sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn) || a.id.localeCompare(b.id))
  return Object.freeze({ region, currencyCode: currency, asOfDate: date, inflation: indicators.find((item) => item.kind === 'INFLATION_INDEX') ?? null, cost: indicators.find((item) => item.kind === 'COST_INDEX') ?? null, growth: indicators.find((item) => item.kind === 'GROWTH_INDEX') ?? null })
}
export function convertForReporting(world: GameWorld, amount: Money, quote: string, asOfDate: GameDate | string): { readonly amount: Money; readonly rateId: string | null } | { readonly missingRate: true; readonly base: CurrencyCode; readonly quote: CurrencyCode } {
  const target = createCurrencyCode(quote)
  if (amount.currencyCode === target) return { amount, rateId: null }
  const rate = getExchangeRate(world, amount.currencyCode, target, asOfDate)
  return rate ? { amount: createMoney({ currencyCode: target, minorUnits: roundedRatio(amount.minorUnits, rate.rate) }), rateId: rate.id } : { missingRate: true, base: amount.currencyCode, quote: target }
}
export function consolidateForReporting(world: GameWorld, amounts: readonly Money[], quote: string, asOfDate: GameDate | string) {
  const converted = amounts.map((amount) => convertForReporting(world, amount, quote, asOfDate))
  const missingRates = converted.filter((item): item is Extract<typeof item, { readonly missingRate: true }> => 'missingRate' in item)
  const totalMinorUnits = converted.reduce((sum, item) => sum + ('amount' in item ? item.amount.minorUnits : 0), 0)
  if (!Number.isSafeInteger(totalMinorUnits)) throw new RangeError('Reporting total exceeds safe integer range')
  return Object.freeze({ amount: createMoney({ currencyCode: quote, minorUnits: totalMinorUnits }), complete: missingRates.length === 0, missingRates: Object.freeze(missingRates) })
}
function roundedRatio(value: number, factor: EconomicFactor): number {
  const result = (BigInt(value) * BigInt(factor.numerator) + BigInt(Math.floor(factor.denominator / 2))) / BigInt(factor.denominator)
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Converted amount exceeds safe integer range')
  return Number(result)
}
