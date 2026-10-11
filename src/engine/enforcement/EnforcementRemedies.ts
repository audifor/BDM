import type { GameDate } from '@/domain/date'
import type { StaffActivityCategory, Violation } from '@/domain/enforcement'
import { createBudgetLine, createFinancialBudget, createMoney, ensureExpenseAccountMapping, recordAuthorizedFinancialFine } from '@/domain/finance'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/** Fictional NCAA careers receive an explicit Team-dimension Finance budget for the last fiscal year. */
export function ensureNcaaSportBudgets(world: GameWorld): GameWorld {
  const year = Number(world.currentDate.slice(0, 4)) - (Number(world.currentDate.slice(5, 7)) < 7 ? 2 : 1)
  const budgets = Object.values(world.financialBudgetsById)
  const lines = Object.values(world.budgetLinesById)
  for (const competition of Object.values(world.competitions).filter((item) => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')) {
    for (const teamId of competition.participantTeamIds) {
      const team = world.teams[teamId]
      if (team === undefined || budgets.some((budget) => budget.period.kind === 'FISCAL_YEAR' && budget.period.endsOn === `${year + 1}-06-30` && lines.some((line) => line.budgetId === budget.id && line.teamId === teamId))) continue
      const id = `budget:ncaa-sport:${teamId}:${year}-${year + 1}`
      const source = { kind: 'SIMULATED_NCAA_SPORT_BUDGET', id, description: 'Fictional basketball program annual budget; Team dimension is the sport authority.' }
      budgets.push(createFinancialBudget({ id, organizationId: team.organizationId, currencyCode: 'USD', period: { kind: 'FISCAL_YEAR', startsOn: `${year}-07-01`, endsOn: `${year + 1}-06-30` }, status: 'APPROVED', label: `${year}-${year + 1} basketball program`, createdOn: `${year}-07-01`, approval: { authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: id, approvedOn: `${year}-07-01`, provenance: source }, provenance: source }))
      lines.push(createBudgetLine({ id: `line:${id}:basketball`, budgetId: id, organizationId: team.organizationId, teamId, category: 'BASKETBALL_PROGRAM_OPERATIONS', direction: 'EXPENSE', amount: { currencyCode: 'USD', minorUnits: 1_000_000_000 }, provenance: source }))
    }
  }
  return budgets.length === Object.keys(world.financialBudgetsById).length ? world : updateGameWorld(world, { financialBudgets: budgets, budgetLines: lines })
}

/** Use the latest completed fiscal-year budget with expense lines for this sport's Team. */
export function mostRecentSportBudget(world: GameWorld, teamId: TeamId) {
  const organizationId = world.teams[teamId]?.organizationId
  return Object.values(world.financialBudgetsById)
    .filter((budget) => budget.organizationId === organizationId && budget.period.kind === 'FISCAL_YEAR' && budget.period.endsOn < world.currentDate && (budget.status === 'APPROVED' || budget.status === 'CLOSED'))
    .sort((a, b) => b.period.endsOn.localeCompare(a.period.endsOn))
    .map((budget) => ({ budget, lines: Object.values(world.budgetLinesById).filter((line) => line.budgetId === budget.id && line.teamId === teamId && line.direction === 'EXPENSE') }))
    .find((item) => item.lines.length > 0)
}

export function isStaffActivityRestricted(world: GameWorld, staffId: StaffPersonId, activity: StaffActivityCategory, onDate: GameDate = world.currentDate): boolean {
  return Object.values(world.sanctionsById).some((sanction) => sanction.kind === 'staffActivitySuspension' && sanction.status === 'active' && sanction.staffPersonId === staffId && sanction.startsAt <= onDate && sanction.activityCategories?.includes(activity))
}

export function isHeadCoachAvailableForActivity(world: GameWorld, teamId: TeamId, activity: StaffActivityCategory, onDate: GameDate = world.currentDate): boolean {
  const coachId = world.teams[teamId]?.coachId
  const staffId = coachId === undefined ? undefined : world.coaches[coachId]?.staffProfileId
  return staffId !== undefined && !isStaffActivityRestricted(world, staffId, activity, onDate)
}

/** Contest completion, not elapsed days, releases an activity suspension. */
export function progressStaffActivitySanctions(world: GameWorld): GameWorld {
  const original = Object.values(world.sanctionsById)
  const sanctions = original.map((sanction) => {
    if (sanction.kind !== 'staffActivitySuspension' || sanction.status !== 'active') return sanction
    const completed = Object.values(world.games).filter((game) => game.status === 'completed' && game.date > sanction.startsAt && game.date <= world.currentDate && (game.homeTeamId === sanction.programTeamId || game.awayTeamId === sanction.programTeamId)).map((game) => String(game.id)).sort()
    const status = completed.length >= (sanction.requiredContestEquivalents ?? Number.POSITIVE_INFINITY) ? 'expired' as const : 'active' as const
    return status === sanction.status && JSON.stringify(completed) === JSON.stringify(sanction.completedContestGameIds ?? []) ? sanction : { ...sanction, status, completedContestGameIds: completed }
  })
  return sanctions.every((item, index) => item === original[index]) ? world : updateGameWorld(world, { sanctions })
}

export type AutomaticRemedyResult = { readonly ok: true; readonly world: GameWorld; readonly violationId: string } | { readonly ok: false; readonly world: GameWorld; readonly reason: 'SPORT_BUDGET_UNAVAILABLE' | 'HEAD_COACH_UNAVAILABLE' | 'ENFORCEMENT_RULE_UNAVAILABLE' | 'FINANCE_FINE_REJECTED' }

/** Generic immediate Enforcement case with Staff and Finance remedies. */
export function executeAutomaticEnforcementRemedies(world: GameWorld, input: {
  readonly violation: Omit<Violation, 'date' | 'status'>
  readonly staffId: StaffPersonId
  readonly activities: readonly StaffActivityCategory[]
  readonly maximumChampionshipSegmentContests: number
  readonly contestLimitSource: string
  readonly fineRateBasisPoints: number
}): AutomaticRemedyResult {
  if (world.violationsById[input.violation.id] !== undefined) return { ok: true, world, violationId: input.violation.id }
  if (!world.staffPeopleById[input.staffId]) return { ok: false, world, reason: 'HEAD_COACH_UNAVAILABLE' }
  const budget = mostRecentSportBudget(world, input.violation.programTeamId)
  if (budget === undefined) return { ok: false, world, reason: 'SPORT_BUDGET_UNAVAILABLE' }
  const basisMinorUnits = budget.lines.reduce((sum, line) => sum + line.amount.minorUnits, 0)
  const fineMinorUnits = Number((BigInt(basisMinorUnits) * BigInt(input.fineRateBasisPoints) + 5_000n) / 10_000n)
  const investigationId = `investigation:${input.violation.id}`
  const findingId = `finding:${investigationId}`
  const suspensionId = `sanction:${findingId}:staffActivitySuspension`
  const penaltyId = `sanction:${findingId}:financialPenalty`
  const institutionId = world.teams[input.violation.programTeamId]!.organizationId
  const staged = updateGameWorld(world, {
    violations: [...Object.values(world.violationsById), { ...input.violation, date: world.currentDate, status: 'resolved' as const }],
    investigations: [...Object.values(world.investigationsById), { id: investigationId, ecosystemId: input.violation.ecosystemId, programTeamId: input.violation.programTeamId, violationIds: [input.violation.id], startedAt: world.currentDate, expectedResolutionAt: world.currentDate, status: 'resolved' as const }],
    findings: [...Object.values(world.findingsById), { id: findingId, investigationId, programTeamId: input.violation.programTeamId, issuedAt: world.currentDate, level: 'major' as const, score: 60 }],
    sanctions: [...Object.values(world.sanctionsById), { id: suspensionId, findingId, ecosystemId: input.violation.ecosystemId, programTeamId: input.violation.programTeamId, kind: 'staffActivitySuspension' as const, startsAt: world.currentDate, status: 'active' as const, staffPersonId: input.staffId, activityCategories: input.activities, requiredContestEquivalents: Math.ceil(input.maximumChampionshipSegmentContests / 2), completedContestGameIds: [], maximumChampionshipSegmentContests: input.maximumChampionshipSegmentContests, contestLimitSource: input.contestLimitSource }, { id: penaltyId, findingId, ecosystemId: input.violation.ecosystemId, programTeamId: input.violation.programTeamId, kind: 'financialPenalty' as const, startsAt: world.currentDate, status: 'active' as const, organizationId: institutionId, budgetId: budget.budget.id, budgetPeriodEndsOn: budget.budget.period.endsOn, rateBasisPoints: input.fineRateBasisPoints, basisMinorUnits, amount: fineMinorUnits, currencyCode: budget.budget.currencyCode }],
    programComplianceByProgramId: { ...world.programComplianceByProgramId, [input.violation.programTeamId]: { ...(world.programComplianceByProgramId[input.violation.programTeamId] ?? { programTeamId: input.violation.programTeamId, ecosystemId: input.violation.ecosystemId, resolvedFindingCount: 0, activeSanctionIds: [] }), resolvedFindingCount: (world.programComplianceByProgramId[input.violation.programTeamId]?.resolvedFindingCount ?? 0) + 1, activeSanctionIds: [suspensionId, penaltyId] } },
  })
  const mapping = ensureExpenseAccountMapping(staged, institutionId, budget.budget.currencyCode, 'ENFORCEMENT_FINANCIAL_FINE')
  const finance = recordAuthorizedFinancialFine(mapping.world, { id: penaltyId, authorityOrganizationId: institutionId, organizationId: institutionId, amount: createMoney({ currencyCode: budget.budget.currencyCode, minorUnits: fineMinorUnits }), effectiveOn: world.currentDate, dueOn: world.currentDate, provenance: { kind: 'ENFORCEMENT_SANCTION', id: penaltyId } }, { offsetAccountId: mapping.payableAccount.id, resultAccountId: mapping.expenseAccount.id })
  if (finance.status === 'rejected' || finance.transaction === undefined || finance.commitment === undefined) return { ok: false, world, reason: 'FINANCE_FINE_REJECTED' }
  const completed = updateGameWorld(finance.world, { sanctions: Object.values(finance.world.sanctionsById).map((item) => item.id === penaltyId ? { ...item, financeTransactionId: finance.transaction!.id, financeCommitmentId: finance.commitment!.id } : item) })
  return { ok: true, world: completed, violationId: input.violation.id }
}
