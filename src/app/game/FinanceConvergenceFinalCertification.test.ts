import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createNewGame } from '@/app/game'
import { getFreeAgentMarketTerms, releasePlayer, signFreeAgent } from '@/app/market'
import {
  capitalContributionIdFor,
  createCapitalContribution,
  evaluateGameplayFinancialDecision,
  evaluateTeamGameplayFinancialDecision,
  executeFinancingForDate,
  gameplayFinancialBlockReason,
  getEffectiveAuthorizedHeadroomMinorUnits,
  getOrganizationFinancialAuthorization,
  materializeContractFinanceForDate,
  resolveExpenseRecognitionAccounts,
  sumReservedCapacity,
} from '@/domain/finance'
import { authorizeTeamSalaryForTest, cashMinorUnitsForTest, financingDrawdownForTest } from '@/domain/finance/financeTestFixture'
import { canTeamAffordAdditionalSalary, getTeamFinancialSnapshot, updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import type { OrganizationId, PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

/**
 * BS16M-B2 final convergence certification.
 *
 * The four gameplay authorities that create contracts, the AI paths and the display surfaces all read one
 * canonical Finance truth, and the legacy `TeamFinances` pools are a non-authoritative planning number that
 * never allows, blocks, receives back-sync or receives money. Each case below is asserted through the same
 * canonical gateway the production consumers use, never through an isolated reservation fixture.
 */
const SAVED_AT = '2026-09-20T00:00:00.000Z'
const RICH_CASH_MINOR_UNITS = 10_000_000_000
const UNIT_MINOR_UNITS = 100_000
const LEGACY_PATTERN = /canTeamAffordAdditionalSalary|canTeamAffordAdditionalStaffSalary|playerSalaryBudget|staffSalaryBudget|teamFinancesByTeamId/

function userTeam(world: GameWorld) {
  return Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
}

interface FundedClub {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly currencyCode: string
  readonly legacyPools: string
}

/**
 * The prototype career is immutable and deterministic, so one instance is built at module load and reused:
 * a case is then about its own subject instead of about world creation. Every fixture derives a new world.
 */
const PROTOTYPE_CAREER = createNewGame()

function career(): GameWorld {
  return PROTOTYPE_CAREER
}

/**
 * A club with real canonical liquidity, obtained through the legitimate BS16L financing authority, and a real
 * canonical spending authorization above its own payroll. Liquidity is deliberately not an opening balance:
 * the prototype clubs already carry canonical ledger history, so BS16H never invents an opening position.
 */
function fundedClub(cashMinorUnits = RICH_CASH_MINOR_UNITS, authorizedPlayerMinorUnits = UNIT_MINOR_UNITS * 1_000, key = 'cert'): FundedClub {
  const base = career()
  const team = userTeam(base)
  const currencyCode = String(base.organizationFinancialProfilesById[team.organizationId]!.baseCurrencyCode)
  const organizationId = team.organizationId
  const withLiquidity = cashMinorUnits > 0 ? financingDrawdownForTest(base, team.id, cashMinorUnits, key) : base
  const world = authorizeTeamSalaryForTest(withLiquidity, team.id, {
    currencyCode,
    playerSalaryMinorUnits: committedMinorUnits(withLiquidity, organizationId, currencyCode, 'PLAYER_SALARY') + authorizedPlayerMinorUnits,
    staffSalaryMinorUnits: committedMinorUnits(withLiquidity, organizationId, currencyCode, 'STAFF_SALARY'),
  })
  return { world, teamId: team.id, currencyCode, legacyPools: JSON.stringify(withLiquidity.teamFinancesByTeamId) }
}

function headroomMinorUnits(world: GameWorld, organizationId: OrganizationId | string, currencyCode: string, category: 'PLAYER_SALARY' | 'STAFF_SALARY' = 'PLAYER_SALARY'): number {
  return getEffectiveAuthorizedHeadroomMinorUnits(getOrganizationFinancialAuthorization(world, { organizationId, currencyCode }), category)
}

function committedMinorUnits(world: GameWorld, organizationId: OrganizationId | string, currencyCode: string, category: 'PLAYER_SALARY' | 'STAFF_SALARY'): number {
  return getOrganizationFinancialAuthorization(world, { organizationId, currencyCode }).lines
    .filter((line) => line.category === category)
    .reduce((sum, line) => sum + line.committedMinorUnits, 0)
}

function openReservedMinorUnits(world: GameWorld, organizationId: OrganizationId | string, currencyCode: string): number {
  return sumReservedCapacity(Object.values(world.financialReservationsById), organizationId, currencyCode).minorUnits
}

/** Authorizes exactly `playerMinorUnits` of headroom above whatever the club's own payroll already commits. */
function authorizeAboveCommitted(club: FundedClub, playerMinorUnits: number, staffMinorUnits = 0): FundedClub {
  const organizationId = club.world.teams[club.teamId]!.organizationId
  const world = authorizeTeamSalaryForTest(club.world, club.teamId, {
    currencyCode: club.currencyCode,
    playerSalaryMinorUnits: committedMinorUnits(club.world, organizationId, club.currencyCode, 'PLAYER_SALARY') + playerMinorUnits,
    staffSalaryMinorUnits: committedMinorUnits(club.world, organizationId, club.currencyCode, 'STAFF_SALARY') + staffMinorUnits,
  })
  return { ...club, world }
}

function decision(club: FundedClub, legacyAnnualAmountMajorUnits: number, action: 'PLAYER_SIGNING' | 'STAFF_HIRING' = 'PLAYER_SIGNING') {
  return evaluateTeamGameplayFinancialDecision(club.world, { teamId: club.teamId, action, legacyAnnualAmountMajorUnits, sourceAuthority: 'TEST', sourceEntityId: 'bs16m-b2' })
}

function availableFreeAgent(world: GameWorld, clubTeamId: TeamId) {
  const contract = Object.values(world.contractsById).find((item) => item.teamId !== undefined && item.teamId !== clubTeamId
    && (world.teams[item.teamId]?.rosterPlayerIds.length ?? 0) >= 6
    && world.teams[item.teamId]?.rosterPlayerIds.includes(item.playerId))
  if (contract?.teamId === undefined) throw new Error('The certification fixture needs a releasable player from another club')
  const released = releasePlayer(world, contract.teamId, contract.playerId)
  return { world: released, playerId: contract.playerId, salaryMinorUnits: getFreeAgentMarketTerms(released, contract.playerId).annualSalary * 100 }
}

function marketContractId(world: GameWorld, teamId: TeamId, playerId: PlayerId): string {
  const ordinal = Object.values(world.contractsById).filter((contract) => contract.playerId === playerId && contract.term.startsOn === world.currentDate).length + 1
  return `contract:${playerId}:${teamId}:${world.currentDate}:${ordinal}`
}

describe('BS16M-B2 final case A — a legacy budget never overrides canonical liquidity', () => {
  it('blocks a signature the legacy pool approves but canonical liquidity cannot fund', () => {
    const club = authorizeAboveCommitted(fundedClub(1_000), UNIT_MINOR_UNITS * 100)
    const amount = 50_000

    // The legacy planning pool still says yes; canonical Finance owns the verdict.
    expect(canTeamAffordAdditionalSalary(club.world, club.teamId, amount)).toBe(true)
    expect(getTeamFinancialSnapshot(club.world, club.teamId).remainingPlayerSalaryBudget).toBeGreaterThan(amount)

    const blocked = decision(club, amount)
    expect(blocked.allowed).toBe(false)
    expect(['INSUFFICIENT_LIQUIDITY', 'REQUIRES_FINANCING']).toContain(blocked.status)
    expect(blocked.authorization.state).toBe('ACTIVE')
    expect(club.world.teamFinancesByTeamId).toEqual(JSON.parse(club.legacyPools))
  })
})

describe('BS16M-B2 final case B — cash is not authorization', () => {
  it('blocks on missing authorized headroom even with abundant cash', () => {
    const club = authorizeAboveCommitted(fundedClub(RICH_CASH_MINOR_UNITS), 0)
    const organizationId = club.world.teams[club.teamId]!.organizationId
    const amount = 50_000
    const canonicalAmountMinorUnits = amount * 100

    expect(cashMinorUnitsForTest(club.world, organizationId)).toBeGreaterThan(canonicalAmountMinorUnits)
    const blocked = decision(club, amount)
    expect(blocked.allowed).toBe(false)
    expect(blocked.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(blocked.outcome).toBe('HAS_LIQUIDITY_BUT_NO_AUTHORIZATION')
    expect(blocked.authorization.availableHeadroom!.minorUnits).toBe(0)
  })
})

describe('BS16M-B2 final case C — both authorities agree and the binding hands capacity over', () => {
  it('allows the signing and publishes the contract with a terminal bridge it fully owns', () => {
    const base = fundedClub()
    const freeAgent = availableFreeAgent(base.world, base.teamId)
    const club = authorizeAboveCommitted({ ...base, world: freeAgent.world }, freeAgent.salaryMinorUnits)
    const organizationId = club.world.teams[club.teamId]!.organizationId
    const headroomBefore = headroomMinorUnits(club.world, organizationId, club.currencyCode)

    const allowed = decision(club, freeAgent.salaryMinorUnits / 100)
    expect(allowed.allowed).toBe(true)
    expect(allowed.status).toBe('AFFORDABLE_NOW')
    expect(allowed.outcome).toBe('CAN_AFFORD')

    const signed = signFreeAgent(club.world, club.teamId, freeAgent.playerId)
    const contractId = marketContractId(club.world, club.teamId, freeAgent.playerId)
    expect(signed.contractsById[contractId as never]).toBeDefined()
    const bridge = Object.values(signed.financialReservationsById).filter((reservation) => reservation.sourceEntityId === contractId)
    expect(bridge).toHaveLength(1)
    expect(bridge[0]).toMatchObject({ sourceAuthority: 'CONTRACT', sourceEntityId: contractId, status: 'CONSUMED' })
    expect(openReservedMinorUnits(signed, organizationId, club.currencyCode)).toBe(0)
    expect(headroomMinorUnits(signed, organizationId, club.currencyCode)).toBe(headroomBefore - freeAgent.salaryMinorUnits)
    expect(signed.teamFinancesByTeamId).toEqual(JSON.parse(club.legacyPools))
  })
})

describe('BS16M-B2 final case D — capacity conflict is owned by the contract, not by a reservation', () => {
  it('blocks the second signature at 100/70/70 with zero OPEN reservations', () => {
    const base = fundedClub()
    const first = availableFreeAgent(base.world, base.teamId)
    const second = availableFreeAgent(first.world, base.teamId)
    const club = authorizeAboveCommitted({ ...base, world: second.world }, first.salaryMinorUnits + second.salaryMinorUnits - UNIT_MINOR_UNITS)
    const organizationId = club.world.teams[club.teamId]!.organizationId

    const afterFirst = signFreeAgent(club.world, club.teamId, first.playerId)
    expect(openReservedMinorUnits(afterFirst, organizationId, club.currencyCode)).toBe(0)
    expect(committedMinorUnits(afterFirst, organizationId, club.currencyCode, 'PLAYER_SALARY')).toBe(committedMinorUnits(club.world, organizationId, club.currencyCode, 'PLAYER_SALARY') + first.salaryMinorUnits)
    expect(headroomMinorUnits(afterFirst, organizationId, club.currencyCode)).toBe(second.salaryMinorUnits - UNIT_MINOR_UNITS)

    // The blocker is the canonical contractual obligation, never a lingering reservation.
    const blocked = evaluateTeamGameplayFinancialDecision(afterFirst, { teamId: club.teamId, action: 'PLAYER_SIGNING', amount: { currencyCode: club.currencyCode, minorUnits: second.salaryMinorUnits }, sourceAuthority: 'TEST', sourceEntityId: 'bs16m-b2' })
    expect(blocked.allowed).toBe(false)
    expect(blocked.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(openReservedMinorUnits(afterFirst, organizationId, club.currencyCode)).toBe(0)
  })
})

describe('BS16M-B2 final case E — financing moves liquidity only', () => {
  it('turns a canonical block into the same canonical allow without touching authorization or the pools', () => {
    const club = authorizeAboveCommitted(fundedClub(0), UNIT_MINOR_UNITS * 100)
    const organizationId = club.world.teams[club.teamId]!.organizationId
    const amountMinorUnits = 500 * 100
    const ask = () => evaluateTeamGameplayFinancialDecision(club.world, { teamId: club.teamId, action: 'PLAYER_SIGNING', amount: { currencyCode: club.currencyCode, minorUnits: amountMinorUnits }, sourceAuthority: 'TEST', sourceEntityId: 'bs16m-b2' })

    const before = ask()
    expect(before.allowed).toBe(false)
    expect(before.authorization.state).toBe('ACTIVE')

    const financed = financingDrawdownForTest(club.world, club.teamId, amountMinorUnits * 4, 'cert-case-e')
    const after = evaluateTeamGameplayFinancialDecision(financed, { teamId: club.teamId, action: 'PLAYER_SIGNING', amount: { currencyCode: club.currencyCode, minorUnits: amountMinorUnits }, sourceAuthority: 'TEST', sourceEntityId: 'bs16m-b2' })

    expect(after.allowed).toBe(true)
    expect(after.status).toBe('AFFORDABLE_NOW')
    expect(after.authorization.availableHeadroom).toEqual(before.authorization.availableHeadroom)
    expect(headroomMinorUnits(financed, organizationId, club.currencyCode)).toBe(headroomMinorUnits(club.world, organizationId, club.currencyCode))
    expect(financed.teamFinancesByTeamId).toEqual(JSON.parse(club.legacyPools))
  })
})

describe('BS16M-B2 final case F — capital moves cash and equity only', () => {
  it('cannot buy authorization: liquidity improves, headroom does not', () => {
    const club = authorizeAboveCommitted(fundedClub(0), UNIT_MINOR_UNITS)
    const organizationId = club.world.teams[club.teamId]!.organizationId
    const provenance = { kind: 'TEST_FIXTURE' as const, id: 'bs16m-b2-capital' }
    const contribution = createCapitalContribution({
      id: capitalContributionIdFor(organizationId, 'bs16m-b2'),
      recipientOrganizationId: organizationId,
      contributor: { kind: 'EXTERNAL', label: 'External investor' },
      currencyCode: club.currencyCode,
      amount: { currencyCode: club.currencyCode, minorUnits: UNIT_MINOR_UNITS * 50 },
      effectiveOn: club.world.currentDate,
      provenance,
    })
    const withContribution = updateGameWorld(club.world, { capitalContributions: [...Object.values(club.world.capitalContributionsById), contribution] })
    const executed = executeFinancingForDate(withContribution, { organizationId, date: withContribution.currentDate }).world

    expect(cashMinorUnitsForTest(executed, organizationId)).toBeGreaterThan(cashMinorUnitsForTest(club.world, organizationId))
    expect(headroomMinorUnits(executed, organizationId, club.currencyCode)).toBe(headroomMinorUnits(club.world, organizationId, club.currencyCode))

    // Authorization is still the missing authority, so the capital cannot make an unaffordable salary legal.
    const stillBlocked = evaluateTeamGameplayFinancialDecision(executed, { teamId: club.teamId, action: 'PLAYER_SIGNING', amount: { currencyCode: club.currencyCode, minorUnits: UNIT_MINOR_UNITS * 2 }, sourceAuthority: 'TEST', sourceEntityId: 'bs16m-b2' })
    expect(stillBlocked.allowed).toBe(false)
    expect(stillBlocked.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(executed.teamFinancesByTeamId).toEqual(JSON.parse(club.legacyPools))
  })
})

describe('BS16M-B2 final case G — user and AI read one canonical truth', () => {
  it('answers the same question identically for gameplay and for the AI vocabulary', () => {
    const club = authorizeAboveCommitted(fundedClub(RICH_CASH_MINOR_UNITS), UNIT_MINOR_UNITS * 10)
    const organizationId = club.world.teams[club.teamId]!.organizationId
    const canonical = evaluateGameplayFinancialDecision(club.world, {
      organizationId,
      action: 'PLAYER_SIGNING',
      amount: { currencyCode: club.currencyCode, minorUnits: UNIT_MINOR_UNITS * 2 },
      sourceAuthority: 'USER_ACTION',
      sourceEntityId: 'bs16m-b2-user',
      effectiveDate: club.world.currentDate,
    })
    const ai = evaluateTeamGameplayFinancialDecision(club.world, {
      teamId: club.teamId,
      action: 'PLAYER_SIGNING',
      amount: { currencyCode: club.currencyCode, minorUnits: UNIT_MINOR_UNITS * 2 },
      sourceAuthority: 'AI_DECISION',
      sourceEntityId: 'bs16m-b2-ai',
      effectiveDate: club.world.currentDate,
    })

    expect(ai.status).toBe(canonical.status)
    expect(ai.reasons).toEqual(canonical.reasons)
    expect(ai.allowed).toBe(canonical.allowed)
    expect(ai.liquidity).toEqual(canonical.liquidity)
    expect(ai.authorization).toEqual(canonical.authorization)
    // Only the diagnostic attribution differs, and the AI label is a pure translation of canonical truth.
    expect(canonical.sourceAuthority).toBe('USER_ACTION')
    expect(ai.sourceAuthority).toBe('AI_DECISION')
    // The AI label is a pure translation of the canonical decision: same economic truth, AI-readable name.
    expect(ai.outcome).toBe('CAN_AFFORD')
    expect(gameplayFinancialBlockReason(ai)).toBe(`${ai.status}:${ai.reasons.join('|')}`)
  })
})

describe('BS16M-B2 divergence matrix', () => {
  it('records the four accepted divergences and never restores legacy parity', () => {
    // 1 · legacy YES / canonical NO because liquidity is not there.
    const illiquid = fundedClub(1_000, UNIT_MINOR_UNITS * 1_000, 'cert-div1')
    const legacyAffordable = Math.max(1_000, Math.floor(getTeamFinancialSnapshot(illiquid.world, illiquid.teamId).remainingPlayerSalaryBudget / 2))
    expect(canTeamAffordAdditionalSalary(illiquid.world, illiquid.teamId, legacyAffordable)).toBe(true)
    const liquidityBlock = decision(illiquid, legacyAffordable)
    expect(liquidityBlock.allowed).toBe(false)
    expect(['INSUFFICIENT_LIQUIDITY', 'REQUIRES_FINANCING']).toContain(liquidityBlock.status)

    // 2 · legacy YES / canonical NO because the canonical contract capacity is fully committed.
    const tight = fundedClub(RICH_CASH_MINOR_UNITS, 0, 'cert-div2')
    const tightOrganizationId = tight.world.teams[tight.teamId]!.organizationId
    expect(committedMinorUnits(tight.world, tightOrganizationId, tight.currencyCode, 'PLAYER_SALARY')).toBeGreaterThan(0)
    expect(headroomMinorUnits(tight.world, tightOrganizationId, tight.currencyCode)).toBe(0)
    const tightSnapshot = getTeamFinancialSnapshot(tight.world, tight.teamId)
    const legacyRoom = Math.max(1_000, Math.floor(tightSnapshot.remainingPlayerSalaryBudget / 2))
    expect(tightSnapshot.remainingPlayerSalaryBudget).toBeGreaterThan(0)
    expect(canTeamAffordAdditionalSalary(tight.world, tight.teamId, legacyRoom)).toBe(true)
    const capacityBlock = decision(tight, legacyRoom)
    expect(capacityBlock.allowed).toBe(false)
    expect(capacityBlock.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')

    // 3 · legacy NO / canonical YES once legitimate financing exists: the canonical model is richer, not looser.
    const thinBase = fundedClub(0, 0, 'cert-div3')
    const thinOrganizationId = thinBase.world.teams[thinBase.teamId]!.organizationId
    const askMajorUnits = Math.max(1_000, Math.ceil(getTeamFinancialSnapshot(thinBase.world, thinBase.teamId).remainingPlayerSalaryBudget) + 10_000)
    const thin: FundedClub = {
      ...thinBase,
      world: authorizeTeamSalaryForTest(thinBase.world, thinBase.teamId, {
        currencyCode: thinBase.currencyCode,
        playerSalaryMinorUnits: committedMinorUnits(thinBase.world, thinOrganizationId, thinBase.currencyCode, 'PLAYER_SALARY') + askMajorUnits * 100,
        staffSalaryMinorUnits: committedMinorUnits(thinBase.world, thinOrganizationId, thinBase.currencyCode, 'STAFF_SALARY'),
      }),
    }
    // The legacy pool refuses the amount, and so does canonical Finance while there is no liquidity.
    expect(canTeamAffordAdditionalSalary(thin.world, thin.teamId, askMajorUnits)).toBe(false)
    expect(decision(thin, askMajorUnits).allowed).toBe(false)

    const financed = financingDrawdownForTest(thin.world, thin.teamId, askMajorUnits * 200, 'cert-div3')
    const afterFinancing = decision({ ...thin, world: financed }, askMajorUnits)
    expect(afterFinancing.allowed).toBe(true)
    expect(afterFinancing.status).toBe('AFFORDABLE_NOW')
    // Legitimate financing moved liquidity only: the legacy pool still refuses and is byte-identical.
    expect(canTeamAffordAdditionalSalary(financed, thin.teamId, askMajorUnits)).toBe(false)
    expect(financed.teamFinancesByTeamId).toEqual(JSON.parse(thin.legacyPools))

    // 4 · same outcome, different model: both authorities allow, and the canonical reason is the one reported.
    const rich = authorizeAboveCommitted(fundedClub(), UNIT_MINOR_UNITS * 100)
    expect(canTeamAffordAdditionalSalary(rich.world, rich.teamId, 10_000)).toBe(true)
    const agree = decision(rich, 10_000)
    expect(agree.allowed).toBe(true)
    expect(agree.reasons).toEqual(['AFFORDABLE_NOW'])
  })
})

describe('BS16M-B2 certification — no dual write, no back-sync', () => {
  it('leaves the legacy pools byte-identical across signing, payroll and financing', () => {
    const base = fundedClub()
    const freeAgent = availableFreeAgent(base.world, base.teamId)
    const club = authorizeAboveCommitted({ ...base, world: freeAgent.world }, freeAgent.salaryMinorUnits + UNIT_MINOR_UNITS)
    const organizationId = club.world.teams[club.teamId]!.organizationId

    const signed = signFreeAgent(club.world, club.teamId, freeAgent.playerId)
    const contractId = marketContractId(club.world, club.teamId, freeAgent.playerId)
    const payroll = materializeContractFinanceForDate(signed, signed.currentDate, {
      organizationId,
      contractId,
      currencyCode: club.currencyCode,
      includeConditional: true,
      dueDatePolicy: 'ON_RECOGNITION',
      ledger: resolveExpenseRecognitionAccounts(signed, organizationId),
    })
    const financed = financingDrawdownForTest(payroll.world, club.teamId, UNIT_MINOR_UNITS * 25, 'cert-after-payroll')

    expect(signed.teamFinancesByTeamId).toEqual(JSON.parse(club.legacyPools))
    expect(payroll.world.teamFinancesByTeamId).toEqual(JSON.parse(club.legacyPools))
    expect(financed.teamFinancesByTeamId).toEqual(JSON.parse(club.legacyPools))
    // The canonical records changed, and the legacy pools did not receive a single back-synced number.
    expect(payroll.world.financialTransactionsById).not.toEqual(signed.financialTransactionsById)
  })
})

describe('BS16M-B2 certification — legacy consumer audit', () => {
  it('keeps zero legacy allow/block decision authority in production', () => {
    const sourceFiles = userSourceFiles()
    const allowList = new Map<string, string>([
      // Legacy authority itself, its state and its world plumbing: definitions, generation and migration.
      ['domain/finance/TeamFinances.ts', 'LEGACY_AUTHORITY_DEFINITION'],
      ['domain/world/finances.ts', 'LEGACY_AUTHORITY_DEFINITION'],
      ['domain/world/index.ts', 'LEGACY_AUTHORITY_SURFACE'],
      ['domain/world/GameWorld.ts', 'SEED_AND_STATE'],
      ['engine/world/TeamFinancesGenerator.ts', 'SEED_GENERATION'],
      ['engine/coach/CoachSpecialization.ts', 'SEED_AND_STATE'],
      ['app/game/createNewGame.ts', 'SEED_GENERATION'],
      // PBM identities use the same initial budget generator, materialized immediately
      // into canonical Finance authorization; no affordability decision reads this seed.
      ['app/game/WorldDbV2Game.ts', 'SEED_GENERATION'],
      ['save/GameWorldSaveV1.ts', 'MIGRATION'],
      ['save/GameWorldSaveV3.ts', 'MIGRATION'],
      // Documentation of what the legacy numbers are.
      ['domain/finance/FinanceActivation.ts', 'NON_AUTHORITATIVE_TRANSITIONAL_INPUT'],
      ['domain/finance/FinanceOpeningState.ts', 'CLASSIFICATION_DATA'],
      ['domain/finance/EconomicSourceAuthority.ts', 'CLASSIFICATION_DATA'],
      ['domain/finance/GameplayFinancialDecision.ts', 'DOCUMENTATION'],
      // Display and the two accepted transitional inputs.
      ['ui/desktop/DesktopCanonicalSurfaceLayer.tsx', 'DISPLAY'],
      ['ui-ng/applications/coach/CoachOpportunitiesScreen.tsx', 'DISPLAY'],
      ['app/coachCareer/CoachCareerService.ts', 'NON_AUTHORITATIVE_AMOUNT_HEURISTIC'],
      // Test support that is not named like a test file.
      ['app/governance/testFixtures.ts', 'TEST_SUPPORT'],
      ['app/game/createAcbTestGame.ts', 'TEST_SUPPORT'],
    ])
    const uncategorized: string[] = []
    for (const file of sourceFiles) {
      const path = relative(sourceRoot(), file).replace(/\\/g, '/')
      if (allowList.has(path)) continue
      const lines = readFileSync(file, 'utf8').split('\n')
      for (const [index, line] of lines.entries()) {
        if (LEGACY_PATTERN.test(line)) uncategorized.push(`${path}:${index + 1}`)
      }
    }
    expect(uncategorized).toEqual([])
    expect(allowList.size).toBeGreaterThan(0)
  })

  it('never calls the legacy affordability helpers outside their own definition', () => {
    const callers = userSourceFiles()
      .filter((file) => !['domain/world/finances.ts', 'domain/world/index.ts'].includes(relative(sourceRoot(), file).replace(/\\/g, '/')))
      .filter((file) => /canTeamAffordAdditionalSalary|canTeamAffordAdditionalStaffSalary/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(sourceRoot(), file).replace(/\\/g, '/'))
    expect(callers).toEqual([])
  })

  it('certifies the two accepted transitional inputs and nothing else', () => {
    // A · the coach/staff offer amount may read a legacy pool as an amount heuristic, never as a verdict.
    const coachCareer = readFileSync(join(sourceRoot(), 'app/coachCareer/CoachCareerService.ts'), 'utf8')
    expect(coachCareer).toContain('offerSalary')
    expect(coachCareer).not.toMatch(/canTeamAffordAdditional/)
    // B · activation seeds canonical authorization from the legacy pools, one way, at the canonical seam.
    const activation = readFileSync(join(sourceRoot(), 'domain/finance/FinanceActivation.ts'), 'utf8')
    expect(activation).toContain('materializeLegacyTeamFinancesAuthorization')
    expect(activation).not.toMatch(/updateGameWorld\([\s\S]{0,400}teamFinances/)
  })
})

describe('BS16M-B2 certification — save and load matrix', () => {
  it('round-trips profile, authorization, terminal bridge, ledger, debt and capital without duplicating a fact', () => {
    const base = fundedClub()
    const freeAgent = availableFreeAgent(base.world, base.teamId)
    const club = authorizeAboveCommitted({ ...base, world: freeAgent.world }, freeAgent.salaryMinorUnits + UNIT_MINOR_UNITS)
    const organizationId = club.world.teams[club.teamId]!.organizationId
    const signed = signFreeAgent(club.world, club.teamId, freeAgent.playerId)
    const withDebt = financingDrawdownForTest(signed, club.teamId, UNIT_MINOR_UNITS * 25, 'cert-save')
    const provenance = { kind: 'TEST_FIXTURE' as const, id: 'bs16m-b2-capital' }
    const withCapital = updateGameWorld(withDebt, {
      capitalContributions: [...Object.values(withDebt.capitalContributionsById), createCapitalContribution({
        id: capitalContributionIdFor(organizationId, 'bs16m-b2-save'),
        recipientOrganizationId: organizationId,
        contributor: { kind: 'EXTERNAL', label: 'External investor' },
        currencyCode: club.currencyCode,
        amount: { currencyCode: club.currencyCode, minorUnits: UNIT_MINOR_UNITS * 10 },
        effectiveOn: withDebt.currentDate,
        provenance,
      })],
    })
    const executed = executeFinancingForDate(withCapital, { organizationId, date: withCapital.currentDate }).world

    const restored = deserializeGameWorldV4(serializeGameWorldV4(executed, SAVED_AT))
    expect(restored.organizationFinancialProfilesById).toEqual(executed.organizationFinancialProfilesById)
    expect(restored.financialBudgetsById).toEqual(executed.financialBudgetsById)
    expect(restored.budgetLinesById).toEqual(executed.budgetLinesById)
    expect(restored.financialReservationsById).toEqual(executed.financialReservationsById)
    expect(restored.financialTransactionsById).toEqual(executed.financialTransactionsById)
    expect(restored.financialCommitmentsById).toEqual(executed.financialCommitmentsById)
    expect(restored.financingAgreementsById).toEqual(executed.financingAgreementsById)
    expect(restored.financingDrawdownsById).toEqual(executed.financingDrawdownsById)
    expect(restored.capitalContributionsById).toEqual(executed.capitalContributionsById)
    expect(restored.teamFinancesByTeamId).toEqual(executed.teamFinancesByTeamId)

    // Replay: the market refuses a player who already holds the contract, and nothing is duplicated or reopened.
    expect(() => signFreeAgent(restored, club.teamId, freeAgent.playerId)).toThrow(/not a free agent/)
    expect(restored.financialReservationsById).toEqual(executed.financialReservationsById)
    expect(openReservedMinorUnits(restored, organizationId, club.currencyCode)).toBe(0)
    expect(headroomMinorUnits(restored, organizationId, club.currencyCode)).toBe(headroomMinorUnits(executed, organizationId, club.currencyCode))
  })
})

function sourceRoot(): string {
  return join(process.cwd(), 'src')
}

/** Production user files only, exactly the set the framework import guard and this audit care about. */
function userSourceFiles(): readonly string[] {
  return walk(sourceRoot()).filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
}

function walk(root: string): readonly string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry)
    if (statSync(path).isDirectory()) return walk(path)
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : []
  })
}
