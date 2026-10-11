import { describe, expect, it } from 'vitest'
import { BDM_PROTOTYPE_FINANCE_POLICY_V1, prototypeOrganizationCurrencyAuthorities } from './PrototypeFinancePolicy'
import { PROTOTYPE_GAME_CONFIGURATION, createAcbTestGame, createNewGame } from '@/app/game'
import { ensureCanonicalFinanceFoundation, getFinanceActivationReport, listFinanceBearingOrganizationIds, resolveOrganizationCurrency, type OrganizationFinanceActivation } from '@/domain/finance'
import { evaluateTeamGameplayFinancialDecision } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'
import { generateWorld } from '@/engine/world'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const unavailable = (entries: readonly OrganizationFinanceActivation[]) => entries.filter((entry) => entry.status === 'FINANCE_CURRENCY_UNAVAILABLE')
const currenciesOf = (entries: readonly OrganizationFinanceActivation[]) => [...new Set(entries.map((entry) => String(entry.currencyCode)))].sort()
const organizationsOf = (entries: readonly OrganizationFinanceActivation[]) => entries.map((entry) => String(entry.organizationId)).sort()

/** The prototype's own generation, before the prototype entry point applies any finance policy. */
function rawPrototypeWorld(): GameWorld {
  return generateWorld({ ...PROTOTYPE_GAME_CONFIGURATION, gender: 'male', includeNbaLike: true, includeNcaaLike: true })
}

/**
 * Deterministic, immutable worlds built once at module load: the certification is about Finance policy, not
 * about repeating world creation inside a test's own time budget.
 */
const PROTOTYPE_CAREER = createNewGame()
const RAW_PROTOTYPE = rawPrototypeWorld()
const ACTIVATED_RAW_PROTOTYPE = ensureCanonicalFinanceFoundation(RAW_PROTOTYPE)
const ACB_CAREER = createAcbTestGame()

describe('BDM Prototype Finance Policy V1', () => {
  it('resolves canonical Finance currency for every finance-bearing Organization of the prototype career', () => {
    const career = PROTOTYPE_CAREER
    const report = getFinanceActivationReport(career)
    const organizations = listFinanceBearingOrganizationIds(career).map(String).sort()

    expect(organizations).toHaveLength(48)
    expect(organizationsOf(report.organizations)).toEqual(organizations)
    expect(unavailable(report.organizations)).toHaveLength(0)
    expect(report.organizations.filter((entry) => entry.currencyCode === null || entry.budgetId === null || entry.fiscalPeriodId === null)).toHaveLength(0)
    expect(Object.keys(career.organizationFinancialProfilesById).sort()).toEqual(organizations)
    // The canonical profile is the currency authority once provisioning happened, for every single club.
    expect([...new Set(report.organizations.map((entry) => String(entry.currencySource)))]).toEqual(['CANONICAL_PROFILE'])
    expect(report.organizations.filter((entry) => entry.status === 'CURRENCY_POLICY_CONFLICT')).toHaveLength(0)
    for (const entry of report.organizations) {
      expect(String(career.organizationFinancialProfilesById[entry.organizationId]!.baseCurrencyCode)).toBe(String(entry.currencyCode))
    }
    // The prototype is a two-currency career and the policy never flattened it: 8 shipped USD clubs,
    // 40 fictional-jurisdiction clubs on the prototype euro, in both the men's and the women's half.
    const usd = report.organizations.filter((entry) => String(entry.currencyCode) === 'USD')
    const eur = report.organizations.filter((entry) => String(entry.currencyCode) === 'EUR')
    expect(usd).toHaveLength(8)
    expect(eur).toHaveLength(40)
    expect(currenciesOf(report.organizations)).toEqual(['EUR', 'USD'])
    for (const currency of [usd, eur]) {
      expect(currency.some((entry) => String(entry.organizationId).startsWith('women-'))).toBe(true)
      expect(currency.some((entry) => !String(entry.organizationId).startsWith('women-'))).toBe(true)
    }
  })

  it('provisions only the Organizations with no canonical currency authority and preserves the rest', () => {
    const raw = RAW_PROTOTYPE
    const planned = getFinanceActivationReport(raw, { explicitOrganizationCurrencies: prototypeOrganizationCurrencyAuthorities(raw) }).organizations
    const explicit = planned.filter((entry) => entry.currencySource === 'EXPLICIT_ORGANIZATION')
    const preserved = planned.filter((entry) => entry.currencySource !== 'EXPLICIT_ORGANIZATION')

    // Everything the canonical policy can already resolve keeps its own currency: the shipped NBA-like and
    // WNBA-like ecosystems stay USD, and only the fictional Virelia clubs are handed the prototype euro.
    expect(unavailable(planned)).toHaveLength(0)
    expect([...new Set(preserved.map((entry) => String(entry.currencySource)))]).toEqual(['ECOSYSTEM'])
    expect([...new Set(preserved.map((entry) => String(entry.currencyCode)))]).toEqual(['USD'])
    expect(preserved.length).toBeGreaterThan(0)
    expect(explicit.length).toBeGreaterThan(0)
    expect(currenciesOf(explicit)).toEqual(['EUR'])

    // The same split survives activation as persisted canonical truth.
    const activated = ensureCanonicalFinanceFoundation(raw, { explicitOrganizationCurrencies: prototypeOrganizationCurrencyAuthorities(raw) })
    const activatedReport = getFinanceActivationReport(activated)
    expect(activatedReport.organizations.filter((entry) => String(entry.currencyCode) === 'USD')).toHaveLength(preserved.length)
    expect(organizationsOf(activatedReport.organizations.filter((entry) => String(entry.currencyCode) === 'EUR'))).toEqual(organizationsOf(explicit))
    for (const entry of explicit) {
      expect(String(activated.organizationFinancialProfilesById[entry.organizationId]!.baseCurrencyCode)).toBe('EUR')
    }
  })

  it('exposes the provisioning decision as versioned prototype data, not as a Finance rule', () => {
    const raw = RAW_PROTOTYPE
    const authorities = prototypeOrganizationCurrencyAuthorities(raw)
    const unresolved = listFinanceBearingOrganizationIds(raw)
      .filter((organizationId) => resolveOrganizationCurrency(raw, organizationId).status === 'FINANCE_CURRENCY_UNAVAILABLE')
      .map(String)

    expect(BDM_PROTOTYPE_FINANCE_POLICY_V1.version).toBe(1)
    expect(BDM_PROTOTYPE_FINANCE_POLICY_V1.provisionedCurrencyCode).toBe('EUR')
    // The policy names exactly the Organizations that have no canonical currency authority, and nothing else.
    expect(authorities.map((authority) => String(authority.organizationId))).toEqual(unresolved)
    expect(authorities.length).toBeGreaterThan(0)
    expect([...new Set(authorities.map((authority) => String(authority.currencyCode)))]).toEqual(['EUR'])

    // The career the policy produced holds exactly those 40 clubs on the prototype euro, and the policy has
    // nothing left to name once every Organization carries its canonical currency.
    const career = PROTOTYPE_CAREER
    const stillUnresolved = listFinanceBearingOrganizationIds(career)
      .filter((organizationId) => resolveOrganizationCurrency(career, organizationId).status === 'FINANCE_CURRENCY_UNAVAILABLE')
      .map(String)
    expect(stillUnresolved).toHaveLength(40)
    expect([...new Set(stillUnresolved.map((organizationId) => String(career.organizationFinancialProfilesById[organizationId as never]!.baseCurrencyCode)))]).toEqual(['EUR'])
    expect(prototypeOrganizationCurrencyAuthorities(career)).toEqual([])
  })

  it('never guesses a currency outside the prototype policy', () => {
    const raw = RAW_PROTOTYPE
    const before = unavailable(getFinanceActivationReport(raw).organizations)

    expect(before.length).toBeGreaterThan(0)
    // Activation without the policy keeps the unchanged behavior: an unresolvable Organization has no currency.
    const activated = ACTIVATED_RAW_PROTOTYPE
    const withoutPolicy = unavailable(getFinanceActivationReport(activated).organizations)
    expect(organizationsOf(withoutPolicy)).toEqual(organizationsOf(before))
    expect(withoutPolicy.every((entry) => entry.currencyCode === null && entry.currencyUnavailableReason !== null)).toBe(true)

    // Only an explicitly named Organization resolves, and only through the explicit authority.
    const oneOrganization = before[0]!.organizationId
    const named = getFinanceActivationReport(activated, { explicitOrganizationCurrencies: [{ organizationId: oneOrganization, currencyCode: 'EUR' }] })
    expect(named.organizations.filter((entry) => entry.currencySource === 'EXPLICIT_ORGANIZATION').map((entry) => String(entry.organizationId))).toEqual([String(oneOrganization)])
    expect(unavailable(named.organizations)).toHaveLength(before.length - 1)

    // A currency canonical Finance cannot express is data error, never a silent euro.
    expect(() => getFinanceActivationReport(activated, { explicitOrganizationCurrencies: [{ organizationId: oneOrganization, currencyCode: 'JPY' }] })).toThrow(/unsupported currency/)

    // The prototype policy closes the whole prototype world and nothing else.
    expect(unavailable(getFinanceActivationReport(activated, { explicitOrganizationCurrencies: prototypeOrganizationCurrencyAuthorities(activated) }).organizations)).toHaveLength(0)
  })

  it('keeps the policy out of canonical Finance and out of every other universe', () => {
    const files = ['domain', 'engine'].flatMap((directory) => walk(join(process.cwd(), 'src', directory)))
    expect(files.filter((path) => readFileSync(path, 'utf8').includes('PrototypeFinancePolicy'))).toEqual([])

    const acb = ACB_CAREER
    const acbReport = getFinanceActivationReport(acb)
    expect(acbReport.organizations.filter((entry) => entry.currencySource === 'EXPLICIT_ORGANIZATION')).toHaveLength(0)
    expect([...new Set(acbReport.organizations.map((entry) => String(entry.currencySource)))]).toEqual(['CANONICAL_PROFILE'])
    expect(currenciesOf(acbReport.organizations)).toEqual(['EUR'])
    // The ACB euro comes from the canonical country policy, never from a prototype authority.
    expect(resolveOrganizationCurrency(acb, acbReport.organizations[0]!.organizationId)).toEqual({ status: 'RESOLVED', currencyCode: 'EUR', source: 'COUNTRY', identity: 'ESP' })
  })

  it('lets a representative prototype signing and hiring reach canonical economics instead of a missing profile', () => {
    const career = PROTOTYPE_CAREER
    const byCurrency = (currencyCode: string) => Object.values(career.teams).find((team) => String(career.organizationFinancialProfilesById[team.organizationId]!.baseCurrencyCode) === currencyCode)!

    for (const currencyCode of ['EUR', 'USD']) {
      const team = byCurrency(currencyCode)
      for (const action of ['PLAYER_SIGNING', 'STAFF_HIRING'] as const) {
        const decision = evaluateTeamGameplayFinancialDecision(career, { teamId: team.id, action, legacyAnnualAmountMajorUnits: 1_000, sourceAuthority: 'TEST', sourceEntityId: `test:${action}` })
        expect(decision.status).not.toBe('FINANCE_PROFILE_UNAVAILABLE')
        expect(decision.reasons).not.toContain('FINANCE_PROFILE_UNAVAILABLE')
        expect(String(decision.currency)).toBe(currencyCode)
        expect(String(decision.amount!.currencyCode)).toBe(currencyCode)
        expect(String(decision.organizationId)).toBe(String(team.organizationId))
        // Only canonical economic outcomes remain: cash, authorization, reservation or financing.
        expect(['AFFORDABLE_NOW', 'INSUFFICIENT_LIQUIDITY', 'INSUFFICIENT_AUTHORIZED_HEADROOM', 'RESERVED_CAPACITY_CONFLICT', 'REQUIRES_FINANCING']).toContain(decision.status)
      }
    }
  })
})

function walk(root: string): readonly string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry)
    if (statSync(path).isDirectory()) return walk(path)
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : []
  })
}
