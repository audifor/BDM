import { createCurrencyCode, createMoney, type CurrencyCode, type Money } from './FinancialLedger'
import { DEFAULT_NBA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { ecosystemIdFromString, organizationIdFromString, type OrganizationId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'

/**
 * BS16F. Canonical currency provisioning policy.
 *
 * `OrganizationFinancialProfile.baseCurrencyCode` stays the FINAL Organization currency truth; this module is
 * only the provisioning source used when an Organization has no canonical profile yet. It is explicit data
 * keyed on canonical identity (ISO-style country code, canonical ecosystem id) — never on club names, league
 * display names, string matching or machine/UI locale — and it has no default fallback: an Organization whose
 * jurisdiction and ecosystem are both unresolved simply has no currency.
 */
export interface FinanceCurrencyPolicyEntry<TIdentity extends string> {
  readonly identity: TIdentity
  readonly currencyCode: CurrencyCode
}

/** Canonical home-country currency policy, keyed on the Country's ISO-style `code`. */
export const COUNTRY_CURRENCY_POLICY: readonly FinanceCurrencyPolicyEntry<string>[] = Object.freeze([
  Object.freeze({ identity: 'ESP', currencyCode: createCurrencyCode('EUR') }),
  Object.freeze({ identity: 'USA', currencyCode: createCurrencyCode('USD') }),
])

/**
 * The prototype career namespaces its women's world by replacing the `generated-` id prefix with `women-`, so
 * the shipped WNBA-like ecosystem id is the shipped NBA-like id under that prefix. Deriving it here keeps one
 * source of ecosystem identity instead of duplicating a literal id.
 */
const PROTOTYPE_ID_PREFIX = 'generated-'
const PROTOTYPE_WOMEN_ID_PREFIX = 'women-'

function womenNamespaceId(canonicalId: string): string {
  if (!canonicalId.startsWith(PROTOTYPE_ID_PREFIX)) throw new RangeError(`Canonical prototype id ${canonicalId} does not use the expected namespace prefix`)
  return `${PROTOTYPE_WOMEN_ID_PREFIX}${canonicalId.slice(PROTOTYPE_ID_PREFIX.length)}`
}

export const SHIPPED_NBA_LIKE_ECOSYSTEM_ID = DEFAULT_NBA_LIKE_ECOSYSTEM_ID
export const SHIPPED_WNBA_LIKE_ECOSYSTEM_ID = ecosystemIdFromString(womenNamespaceId(String(DEFAULT_NBA_LIKE_ECOSYSTEM_ID)))

/**
 * Shipped ecosystem policy for the ecosystems whose currency is approved product data rather than a resolved
 * jurisdiction. It names the two shipped NBA-like/WNBA-like ecosystems explicitly; it is deliberately NOT a
 * rule that every `nbaLike` ecosystem is USD, so a future NBA-like ecosystem resolves by its own country or
 * stays without currency.
 */
export const SHIPPED_ECOSYSTEM_CURRENCY_POLICY: readonly FinanceCurrencyPolicyEntry<string>[] = Object.freeze([
  Object.freeze({ identity: String(SHIPPED_NBA_LIKE_ECOSYSTEM_ID), currencyCode: createCurrencyCode('USD') }),
  Object.freeze({ identity: String(SHIPPED_WNBA_LIKE_ECOSYSTEM_ID), currencyCode: createCurrencyCode('USD') }),
])

/** Supported currencies use exactly two decimal places; `Money.minorUnits` is 1/100 of the major unit. */
export const SUPPORTED_CURRENCY_MINOR_UNITS_PER_MAJOR_UNIT: Readonly<Record<string, number>> = Object.freeze({ EUR: 100, USD: 100 })

/**
 * Canonical precision authority: how many minor units one major unit of `currencyCode` is worth, or null when
 * the currency has no support in canonical Finance. Every major→minor crossing resolves its precision here, so
 * no caller invents its own scale.
 */
export function getMinorUnitsPerMajorUnit(currencyCode: string): number | null {
  return SUPPORTED_CURRENCY_MINOR_UNITS_PER_MAJOR_UNIT[currencyCode] ?? null
}

export function getCountryCurrencyPolicy(countryCode: string): CurrencyCode | null {
  return COUNTRY_CURRENCY_POLICY.find((entry) => entry.identity === countryCode)?.currencyCode ?? null
}

export function getEcosystemCurrencyPolicy(ecosystemId: string): CurrencyCode | null {
  return SHIPPED_ECOSYSTEM_CURRENCY_POLICY.find((entry) => entry.identity === ecosystemId)?.currencyCode ?? null
}

export type FinanceCurrencyUnavailableReason =
  | 'NO_FINANCE_BEARING_TEAM'
  | 'JURISDICTION_AMBIGUOUS'
  | 'JURISDICTION_UNKNOWN'
  | 'ECOSYSTEM_AMBIGUOUS'
  | 'ECOSYSTEM_UNKNOWN'

export type OrganizationCurrencyResolution =
  | { readonly status: 'RESOLVED'; readonly currencyCode: CurrencyCode; readonly source: 'COUNTRY' | 'ECOSYSTEM'; readonly identity: string }
  | { readonly status: 'FINANCE_CURRENCY_UNAVAILABLE'; readonly reason: FinanceCurrencyUnavailableReason }

/**
 * Resolution precedence: explicit organization currency data (not modelled in GameWorld today), then the
 * canonical home-country policy, then the shipped ecosystem policy, otherwise no currency at all.
 */
export function resolveOrganizationCurrency(world: GameWorld, organizationId: OrganizationId | string): OrganizationCurrencyResolution {
  const organization = String(organizationIdFromString(organizationId))
  const teams = Object.values(world.teams).filter((team) => String(team.organizationId) === organization)
  if (teams.length === 0) return Object.freeze({ status: 'FINANCE_CURRENCY_UNAVAILABLE', reason: 'NO_FINANCE_BEARING_TEAM' })

  const countryCodes = [...new Set(teams.map((team) => world.countries[team.countryId]?.code).filter((code): code is string => typeof code === 'string' && code.length > 0))].sort()
  if (countryCodes.length > 1) return Object.freeze({ status: 'FINANCE_CURRENCY_UNAVAILABLE', reason: 'JURISDICTION_AMBIGUOUS' })
  const countryCode = countryCodes[0]
  if (countryCode !== undefined) {
    const countryCurrency = getCountryCurrencyPolicy(countryCode)
    if (countryCurrency !== null) return Object.freeze({ status: 'RESOLVED', currencyCode: countryCurrency, source: 'COUNTRY', identity: countryCode })
  }

  const teamIds = new Set(teams.map((team) => String(team.id)))
  const ecosystemIds = [...new Set(Object.values(world.competitions)
    .filter((competition) => competition.participantTeamIds.some((teamId) => teamIds.has(String(teamId))))
    .map((competition) => String(competition.ecosystemId)))].sort()
  if (ecosystemIds.length > 1) return Object.freeze({ status: 'FINANCE_CURRENCY_UNAVAILABLE', reason: 'ECOSYSTEM_AMBIGUOUS' })
  const ecosystemId = ecosystemIds[0]
  if (ecosystemId !== undefined) {
    const ecosystemCurrency = getEcosystemCurrencyPolicy(ecosystemId)
    if (ecosystemCurrency !== null) return Object.freeze({ status: 'RESOLVED', currencyCode: ecosystemCurrency, source: 'ECOSYSTEM', identity: ecosystemId })
  }
  return Object.freeze({ status: 'FINANCE_CURRENCY_UNAVAILABLE', reason: countryCode === undefined ? 'JURISDICTION_UNKNOWN' : 'ECOSYSTEM_UNKNOWN' })
}

/**
 * The single legacy-money conversion boundary. Legacy gameplay amounts (`TeamFinances` pools, contract
 * salaries, agent fees, buyouts) are whole major currency units — `formatMoney` renders 11_600_000 as "11.60M"
 * and generated player salaries span 80_000..3_500_000 — while canonical `Money.minorUnits` are minor units,
 * so every legacy amount that becomes a canonical Money obligation crosses here and nowhere else.
 */
export function legacyMajorUnitsToMoney(amount: number, currencyCode: string): Money {
  const currency = createCurrencyCode(currencyCode)
  const precision = getMinorUnitsPerMajorUnit(currency)
  if (precision === null) throw new RangeError(`No canonical minor-unit precision is defined for ${currency}`)
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Legacy amount must be a non-negative safe integer of major currency units')
  const minorUnits = amount * precision
  if (!Number.isSafeInteger(minorUnits)) throw new RangeError('Legacy amount exceeds the safe integer range once converted to minor units')
  return createMoney({ currencyCode: currency, minorUnits })
}

/** The same boundary under its BS16F name, for the team-finance pools that introduced it. */
export const legacyTeamFinanceAmountToMoney = legacyMajorUnitsToMoney
