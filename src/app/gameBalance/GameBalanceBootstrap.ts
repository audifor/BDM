/**
 * BDM_GAME_BALANCE_V1 bootstrap: turns the preset's parameters into canonical facts through the existing
 * authorities, once, deterministically, and never over documented data.
 *
 *   Finance      opening treasury through the opening-state authority (at activation); an APPROVED budget fact that
 *                adds the FACILITY and FACILITY_DEVELOPMENT authorization lines next to the existing salary lines.
 *   Facilities   one generic, labeled-simulated training facility per organization that has none (places,
 *                components, condition records, ownership and usage rights); no documented Facility is touched.
 *   Governance   the archetype structure (club, franchise, university) with explicit appointments and grants.
 *   Costs        the calibrated catalog (the "authorized model") and three synthetic providers; offers are issued
 *                on demand and persisted, never regenerated.
 *
 * Idempotent: every id is derived from the organization, so a second application changes nothing.
 */

import { addDays, parseGameDate, type GameDate } from '@/domain/date'
import {
  createFacility,
  createFacilityComponent,
  createFacilityComponentConditionRecord,
  createFacilityMaintenanceNeed,
  createFacilityOwnershipInterest,
  createFacilityUsageRight,
  createPlace,
} from '@/domain/facilities'
import { createFacilityCostCatalogEntry, createFacilityProvider, type FacilityEconomyRecord } from '@/domain/facilityEconomy'
import {
  createBudgetLine,
  createFinancialBudget,
  financeFiscalPeriodsOf,
  getOrganizationFinancialAuthorization,
  type OpeningEconomicStateSource,
} from '@/domain/finance'
import {
  createGovernanceUniverseProfile,
  type GovernanceActor,
  type GovernanceRole,
} from '@/domain/governance'
import type { GovernanceBodyKind, GovernanceUniverse } from '@/domain/governance'
import type { OrganizationId, TeamId } from '@/domain/ids'
import type { Team } from '@/domain/team'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import {
  BDM_BALANCE_ID_PREFIX,
  BDM_GAME_BALANCE_V1_AUTHORIZATION,
  BDM_GAME_BALANCE_V1_ID,
  GAME_BALANCE_ACTOR_PREFIX,
  GAME_BALANCE_FACILITY_COMPONENTS,
  GAME_BALANCE_INVESTMENT_KINDS,
  GAME_BALANCE_MARKETS,
  GAME_BALANCE_PROVIDERS,
  GAME_BALANCE_WORK_KINDS,
  gameBalanceHash,
  gameBalanceId,
  type GameBalanceEcosystemKind,
  type GameBalanceMarket,
  type GameBalanceScaleBand,
} from './BdmGameBalanceV1'

export function gameBalanceActorId(organizationId: string, role: string): string {
  return `${GAME_BALANCE_ACTOR_PREFIX}:${organizationId}:${role}`
}

/** The ecosystem kind of a team's primary competition, or null when the team plays in none of the supported kinds. */
export function teamEcosystemKind(world: GameWorld, teamId: TeamId | string): GameBalanceEcosystemKind | null {
  const competitions = Object.values(world.competitions).filter((competition) => competition.participantTeamIds.includes(teamId as TeamId))
  for (const competition of competitions) {
    const kind = world.ecosystems[competition.ecosystemId]?.kind
    if (kind === 'fibaLike' || kind === 'nbaLike' || kind === 'ncaaLike') return kind
  }
  return null
}

export function organizationTeam(world: GameWorld, organizationId: OrganizationId | string): Team | undefined {
  return Object.values(world.teams).filter((team) => String(team.organizationId) === String(organizationId)).sort((a, b) => a.id.localeCompare(b.id))[0]
}

/**
 * Scale classifier: the club's contracted player payroll (the contracts it actually holds), which exists both before and
 * after Finance activation. It ranks clubs inside an ecosystem kind; no amount is ever derived from it.
 */
function salaryAuthorizationTotal(world: GameWorld, organizationId: string): number {
  const teamIds = new Set(Object.values(world.teams).filter((team) => String(team.organizationId) === organizationId).map((team) => String(team.id)))
  return Object.values(world.contractsById).filter((contract) => teamIds.has(String(contract.teamId))).reduce((sum, contract) => sum + contract.compensation.annualSalary, 0)
}

/**
 * Economic scale band of every club, by rank within its ecosystem kind. The salary authorization is used ONLY to
 * classify scale (SMALL/MEDIUM/LARGE terciles); no amount is derived from it. Organizations that tie share the
 * middle band, and an ecosystem of one organization is MEDIUM.
 */
export function gameBalanceScaleBands(world: GameWorld): ReadonlyMap<string, { readonly kind: GameBalanceEcosystemKind; readonly band: GameBalanceScaleBand }> {
  const rows = Object.values(world.teams)
    .map((team) => ({ organizationId: String(team.organizationId), kind: teamEcosystemKind(world, team.id) }))
    .filter((row): row is { organizationId: string; kind: GameBalanceEcosystemKind } => row.kind !== null)
  const result = new Map<string, { readonly kind: GameBalanceEcosystemKind; readonly band: GameBalanceScaleBand }>()
  for (const kind of ['fibaLike', 'nbaLike', 'ncaaLike'] as const) {
    const group = rows.filter((row) => row.kind === kind).map((row) => ({ ...row, total: salaryAuthorizationTotal(world, row.organizationId) })).sort((a, b) => a.total - b.total || a.organizationId.localeCompare(b.organizationId))
    group.forEach((row, index) => {
      const allEqual = group.every((other) => other.total === group[0]!.total)
      const fraction = group.length === 1 || allEqual ? 0.5 : index / (group.length - 1)
      result.set(row.organizationId, { kind, band: fraction < 1 / 3 ? 'SMALL' : fraction > 2 / 3 ? 'LARGE' : 'MEDIUM' })
    })
  }
  return result
}

/**
 * Opening economic states for activation time. A source is emitted only for an organization whose canonical
 * currency is known and equals the market currency of its scale table: no conversion, no guess, no overwrite.
 */
export function gameBalanceOpeningEconomicStates(world: GameWorld, currencyOf: (organizationId: string) => string | null): readonly OpeningEconomicStateSource[] {
  const scales = gameBalanceScaleBands(world)
  const sources: OpeningEconomicStateSource[] = []
  for (const [organizationId, scale] of [...scales.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const market = GAME_BALANCE_MARKETS[scale.kind]
    if (currencyOf(organizationId) !== market.currencyCode) continue
    sources.push(Object.freeze({
      sourceAuthority: 'GAME_BALANCE_PRESET' as const,
      sourceEntityId: gameBalanceId('opening-treasury', organizationId),
      organizationId,
      currencyCode: market.currencyCode,
      effectiveOn: world.currentDate,
      cashMinorUnits: market.openingTreasuryMinorUnits[scale.band],
      counterpartKind: 'OWNER_CAPITAL' as const,
      counterpartId: gameBalanceActorId(organizationId, 'owner'),
    }))
  }
  return Object.freeze(sources)
}

function governanceShape(kind: GameBalanceEcosystemKind, gender: string) {
  if (kind === 'ncaaLike') {
    return {
      profileKind: gender === 'female' ? 'NCAAW_PROGRAM' as const : 'NCAA_PROGRAM' as const, ownershipModel: 'UNIVERSITY' as const, universe: 'NCAA' as GovernanceUniverse,
      bodies: ['BOARD', 'EXECUTIVE', 'ATHLETIC_DEPARTMENT'] as GovernanceBodyKind[], apex: 'BOARD' as GovernanceBodyKind, approver: 'EXECUTIVE' as GovernanceBodyKind, operator: 'ATHLETIC_DEPARTMENT' as GovernanceBodyKind,
      managerRole: 'DEPUTY_ATHLETIC_DIRECTOR' as GovernanceRole, roles: { BOARD: 'TRUSTEE', EXECUTIVE: 'PRESIDENT', ATHLETIC_DEPARTMENT: 'ATHLETIC_DIRECTOR' } as Record<string, GovernanceRole>,
    }
  }
  return {
    profileKind: kind === 'nbaLike' ? (gender === 'female' ? 'WNBA_FRANCHISE' as const : 'NBA_FRANCHISE' as const) : 'PROFESSIONAL_CLUB' as const,
    ownershipModel: 'PRIVATE' as const, universe: (kind === 'nbaLike' ? 'NBA_WNBA' : 'PROFESSIONAL_CLUB') as GovernanceUniverse,
    bodies: ['OWNERSHIP', 'BOARD', 'EXECUTIVE'] as GovernanceBodyKind[], apex: 'OWNERSHIP' as GovernanceBodyKind, approver: 'BOARD' as GovernanceBodyKind, operator: 'EXECUTIVE' as GovernanceBodyKind,
    managerRole: 'GENERAL_MANAGER' as GovernanceRole, roles: { OWNERSHIP: 'OWNER', BOARD: 'CHAIR', EXECUTIVE: 'CEO' } as Record<string, GovernanceRole>,
  }
}

export function gameBalanceBodyId(organizationId: string, kind: GovernanceBodyKind): string { return gameBalanceId('body', organizationId, kind.toLowerCase()) }
export function gameBalanceInstitutionId(organizationId: string): string { return gameBalanceId('institution', organizationId) }
export const GAME_BALANCE_DELEGATED_DECISIONS = ['FACILITIES', 'CAPITAL_EXPENDITURE'] as const

export const GAME_BALANCE_CATALOG_CALIBRATION = Object.freeze({ modelId: BDM_GAME_BALANCE_V1_ID, evidenceId: gameBalanceId('calibration', 'v1'), authorizedBy: BDM_GAME_BALANCE_V1_AUTHORIZATION })

export function gameBalanceCatalogEntryId(kind: GameBalanceEcosystemKind, workKind: string): string { return gameBalanceId('catalog', kind, workKind.toLowerCase()) }
export function gameBalanceProviderId(slug: string): string { return gameBalanceId('provider', slug) }

/** Catalog entries and synthetic providers: global, identical for every organization, created once. */
export function gameBalanceCostRecords(registeredOn: GameDate): readonly FacilityEconomyRecord[] {
  const records: FacilityEconomyRecord[] = []
  for (const kind of ['fibaLike', 'nbaLike', 'ncaaLike'] as const) {
    const market: GameBalanceMarket = GAME_BALANCE_MARKETS[kind]
    for (const workKind of GAME_BALANCE_WORK_KINDS) {
      records.push(createFacilityCostCatalogEntry({
        id: gameBalanceCatalogEntryId(kind, workKind), interventionType: interventionFor(workKind), physicalUnit: 'COMPONENT', componentType: null, market: market.key,
        currencyCode: market.currencyCode, unitAmountMinorUnits: market.basePriceMinorUnits[workKind], effectiveOn: registeredOn, validUntil: null, sourceKind: 'SIMULATED_MODEL',
        sourceId: gameBalanceId('catalog-source', kind), version: '1', calibration: GAME_BALANCE_CATALOG_CALIBRATION,
      }))
    }
    for (const investment of GAME_BALANCE_INVESTMENT_KINDS) {
      records.push(createFacilityCostCatalogEntry({
        id: gameBalanceCatalogEntryId(kind, `CAPITAL_${investment}`), interventionType: `CAPITAL_${investment}` as const, physicalUnit: 'COMPONENT', componentType: null, market: market.key,
        currencyCode: market.currencyCode, unitAmountMinorUnits: market.investmentPriceMinorUnits[investment], effectiveOn: registeredOn, validUntil: null, sourceKind: 'SIMULATED_MODEL',
        sourceId: gameBalanceId('catalog-source', kind), version: '1', calibration: GAME_BALANCE_CATALOG_CALIBRATION,
      }))
    }
  }
  for (const provider of GAME_BALANCE_PROVIDERS) {
    records.push(createFacilityProvider({
      id: gameBalanceProviderId(provider.slug), displayName: provider.displayName, identityKind: 'SYNTHETIC_SIMULATED', market: 'BDM-SIM',
      provenance: { kind: 'GAME_BALANCE_PRESET', id: BDM_GAME_BALANCE_V1_ID }, registeredOn,
    }))
  }
  return records
}

export function interventionFor(workKind: (typeof GAME_BALANCE_WORK_KINDS)[number]): 'ROUTINE_MAINTENANCE' | 'PREVENTIVE_MAINTENANCE' | 'REPAIR' {
  return workKind === 'ROUTINE_MAINTENANCE' ? 'ROUTINE_MAINTENANCE' : workKind === 'PREVENTIVE_MAINTENANCE' ? 'PREVENTIVE_MAINTENANCE' : 'REPAIR'
}

function conditionFor(organizationId: string, slug: string, range: readonly [number, number]): number {
  return range[0] + (gameBalanceHash(`${organizationId}:${slug}`) % (range[1] - range[0] + 1))
}

function hasDocumentedFacility(world: GameWorld, organizationId: string): boolean {
  return Object.values(world.facilityOwnershipInterestsById).some((item) => item.owner.kind === 'ORGANIZATION' && String(item.owner.organizationId) === organizationId)
    || Object.values(world.facilityUsageRightsById).some((item) => item.organizationId !== null && String(item.organizationId) === organizationId)
}

/**
 * The post-activation bootstrap. Safe to call on any world: organizations that already have documented facilities,
 * an institution, a FACILITY authorization or the preset's own records are left exactly as they are.
 */
export function applyGameBalanceBootstrap(world: GameWorld): GameWorld {
  const scales = gameBalanceScaleBands(world)
  const start = parseGameDate(world.currentDate)
  const userTeamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)?.id
  const places: ReturnType<typeof createPlace>[] = []
  const facilities: ReturnType<typeof createFacility>[] = []
  const components: ReturnType<typeof createFacilityComponent>[] = []
  const conditions: ReturnType<typeof createFacilityComponentConditionRecord>[] = []
  const ownerships: ReturnType<typeof createFacilityOwnershipInterest>[] = []
  const usageRights: ReturnType<typeof createFacilityUsageRight>[] = []
  const needs: ReturnType<typeof createFacilityMaintenanceNeed>[] = []
  const institutions: NonNullable<Parameters<typeof updateGameWorld>[1]['governanceInstitutions']>[number][] = []
  const profiles: ReturnType<typeof createGovernanceUniverseProfile>[] = []
  const bodies: NonNullable<Parameters<typeof updateGameWorld>[1]['governanceBodies']>[number][] = []
  const appointments: NonNullable<Parameters<typeof updateGameWorld>[1]['governanceAppointments']>[number][] = []
  const grants: NonNullable<Parameters<typeof updateGameWorld>[1]['governanceAuthorityGrants']>[number][] = []
  const participation: NonNullable<Parameters<typeof updateGameWorld>[1]['governanceDecisionParticipationGrants']>[number][] = []
  const budgets: ReturnType<typeof createFinancialBudget>[] = []
  const budgetLines: ReturnType<typeof createBudgetLine>[] = []

  for (const team of Object.values(world.teams).sort((a, b) => a.id.localeCompare(b.id))) {
    const organizationId = String(team.organizationId)
    const scale = scales.get(organizationId)
    if (scale === undefined) continue
    const market = GAME_BALANCE_MARKETS[scale.kind]
    const alreadyInstitution = Object.values(world.governanceInstitutionsById).some((item) => item.teamIds.includes(team.id))
    const documentedFacility = hasDocumentedFacility(world, organizationId)

    if (!documentedFacility && world.facilitiesById[gameBalanceId('facility', organizationId) as never] === undefined) {
      const placeId = gameBalanceId('place', organizationId)
      const facilityId = gameBalanceId('facility', organizationId)
      places.push(createPlace({ id: placeId, kind: scale.kind === 'ncaaLike' ? 'CAMPUS' : 'CITY', name: `${team.name} training site (simulated)` }))
      facilities.push(createFacility({ id: facilityId, placeId, type: 'TRAINING_CENTER', purposes: ['TRAINING'], capabilities: [], status: 'ACTIVE', canonicalName: `${team.name} Training Center (simulated)`, physical: { openedOn: '2000-01-01', courtCount: 1 } }))
      for (const spec of GAME_BALANCE_FACILITY_COMPONENTS) {
        const componentId = gameBalanceId('component', organizationId, spec.slug)
        components.push(createFacilityComponent({
          id: componentId, facilityId, type: spec.type, name: spec.name, status: 'ACTIVE', openedAt: '2000-01-01',
          ...(spec.type === 'PRACTICE_COURT' ? { specification: { kind: 'COURT' as const, isFullCourt: true, isIndoor: true, surface: 'HARDWOOD' as const, basketCount: 2 } } : {}),
        }))
        const physicalCondition = conditionFor(organizationId, spec.slug, spec.conditionRange)
        conditions.push(createFacilityComponentConditionRecord({ id: gameBalanceId('condition', organizationId, spec.slug), componentId, effectiveFrom: start, serviceability: 'FULL', physicalCondition }))
        // The opening inspection: a component that starts at or below the maintenance threshold begins with that need already open.
        if (physicalCondition <= 60) {
          needs.push(createFacilityMaintenanceNeed({ id: gameBalanceId('need', organizationId, spec.slug, 'opening'), facilityId, componentId, detectedAt: start, type: 'CORRECTIVE', severity: 'MODERATE', status: 'OPEN', source: `${gameBalanceId('opening-inspection')} (simulated)` }))
        }
      }
      ownerships.push(createFacilityOwnershipInterest({ id: gameBalanceId('ownership', organizationId), facilityId, owner: { kind: 'ORGANIZATION', organizationId: team.organizationId }, ownershipPercentage: 100, validFrom: '2000-01-01' }))
      for (const purpose of ['TRAINING', 'MEDICAL'] as const) {
        usageRights.push(createFacilityUsageRight({ id: gameBalanceId('usage', organizationId, purpose.toLowerCase()), facilityId, componentIds: null, organizationId: team.organizationId, teamId: team.id, purpose, exclusivity: 'SHARED', validFrom: '2000-01-01' }))
      }
    }

    if (!alreadyInstitution) {
      const shape = governanceShape(scale.kind, team.gender)
      const institutionId = gameBalanceInstitutionId(organizationId)
      institutions.push({ id: institutionId, universe: shape.universe, name: `${team.name} institution (simulated)`, teamIds: [team.id] })
      profiles.push(createGovernanceUniverseProfile({
        id: gameBalanceId('profile', organizationId), institutionId, kind: shape.profileKind, ownershipModel: shape.ownershipModel, expectedBodyKinds: shape.bodies,
        apexAuthorityBodyId: gameBalanceBodyId(organizationId, shape.apex), executiveAuthorityBodyId: gameBalanceBodyId(organizationId, shape.operator), externalOversight: false,
      }))
      for (const kind of shape.bodies) bodies.push({ id: gameBalanceBodyId(organizationId, kind), institutionId, kind, name: `${kind.toLowerCase().replace('_', ' ')} (simulated)` })
      const isUserTeam = team.id === userTeamId
      const manager: GovernanceActor = isUserTeam ? { kind: 'COACH', id: world.userCoachId } : { kind: 'EXTERNAL', id: gameBalanceActorId(organizationId, 'manager') }
      appointments.push({ id: gameBalanceId('appointment', organizationId, 'manager'), bodyId: gameBalanceBodyId(organizationId, shape.operator), actor: manager, role: shape.managerRole, startedOn: start })
      for (const kind of shape.bodies.filter((item) => item !== shape.operator)) {
        appointments.push({ id: gameBalanceId('appointment', organizationId, kind.toLowerCase()), bodyId: gameBalanceBodyId(organizationId, kind), actor: { kind: 'EXTERNAL', id: gameBalanceActorId(organizationId, kind.toLowerCase()) }, role: shape.roles[kind]!, startedOn: start })
      }
      for (const decision of GAME_BALANCE_DELEGATED_DECISIONS) {
        const apexBody = gameBalanceBodyId(organizationId, shape.apex)
        const operatorBody = gameBalanceBodyId(organizationId, shape.operator)
        const approverBody = gameBalanceBodyId(organizationId, shape.approver)
        const operatorGrant = gameBalanceId('authority', organizationId, decision.toLowerCase(), 'operator')
        grants.push({ id: operatorGrant, fromBodyId: apexBody, toBodyId: operatorBody, decision, grantedOn: start })
        participation.push(
          { id: gameBalanceId('right', organizationId, decision.toLowerCase(), 'propose'), authorityGrantId: operatorGrant, bodyId: operatorBody, edgeParticipant: 'DELEGATE', right: 'PROPOSE' },
          { id: gameBalanceId('right', organizationId, decision.toLowerCase(), 'execute'), authorityGrantId: operatorGrant, bodyId: operatorBody, edgeParticipant: 'DELEGATE', right: 'EXECUTE' },
        )
        if (approverBody !== operatorBody) {
          const approverGrant = gameBalanceId('authority', organizationId, decision.toLowerCase(), 'approver')
          grants.push({ id: approverGrant, fromBodyId: apexBody === approverBody ? operatorBody : apexBody, toBodyId: approverBody, decision, grantedOn: start })
          participation.push({ id: gameBalanceId('right', organizationId, decision.toLowerCase(), 'approve'), authorityGrantId: approverGrant, bodyId: approverBody, edgeParticipant: 'DELEGATE', right: 'APPROVE', approvalRequirement: 'ALL_OF' })
        }
      }
    }

    // FACILITY authorization: an APPROVED budget fact beside the existing salary lines. Permission to spend, never cash.
    const profile = world.organizationFinancialProfilesById[organizationId as never]
    if (profile !== undefined && String(profile.baseCurrencyCode) === market.currencyCode) {
      const authorization = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: market.currencyCode })
      const period = financeFiscalPeriodsOf(world, organizationId as never).find((item) => item.startsOn <= world.currentDate && item.endsOn >= world.currentDate)
      if (authorization.state === 'ACTIVE' && authorization.budgetId !== null && period !== undefined && !authorization.lines.some((line) => line.category === 'FACILITY')) {
        const budgetId = `${authorization.budgetId}:facility-authorization:${BDM_GAME_BALANCE_V1_ID.toLowerCase()}`
        const provenance = { kind: 'GAME_BALANCE_PRESET', id: BDM_GAME_BALANCE_V1_ID }
        budgets.push(createFinancialBudget({
          id: budgetId, organizationId, currencyCode: market.currencyCode, period: { kind: 'FISCAL_YEAR', startsOn: period.startsOn, endsOn: period.endsOn }, fiscalPeriodId: String(period.id), status: 'APPROVED',
          label: 'Salary authorization plus BDM_GAME_BALANCE_V1 facility authorization', createdOn: world.currentDate,
          approval: { authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: gameBalanceId('authority'), approvedOn: world.currentDate, provenance }, provenance,
        }))
        for (const line of authorization.lines) {
          budgetLines.push(createBudgetLine({
            id: `${budgetId}:${line.category}${line.teamId === undefined ? '' : `:${line.teamId}`}`, budgetId, organizationId, category: line.category, direction: 'EXPENSE', amount: { currencyCode: market.currencyCode, minorUnits: line.authorizedMinorUnits },
            ...(line.teamId === undefined ? {} : { teamId: line.teamId }), ...(line.organizationSectionId === undefined ? {} : { organizationSectionId: line.organizationSectionId }), provenance,
          }))
        }
        for (const [category, amount] of [['FACILITY', market.facilityAuthorizationMinorUnits[scale.band]], ['FACILITY_DEVELOPMENT', market.capitalAuthorizationMinorUnits[scale.band]]] as const) {
          budgetLines.push(createBudgetLine({ id: `${budgetId}:${category}`, budgetId, organizationId, category, direction: 'EXPENSE', amount: { currencyCode: market.currencyCode, minorUnits: amount }, teamId: String(team.id), purpose: `${BDM_GAME_BALANCE_V1_ID} facility authorization`, provenance }))
        }
      }
    }
  }

  const missingCost = gameBalanceCostRecords(start).filter((record) => world.facilityEconomyRecordsById[record.id] === undefined)
  if (places.length + institutions.length + budgets.length + missingCost.length === 0) return world
  return updateGameWorld(world, {
    places: [...Object.values(world.placesById), ...places],
    facilities: [...Object.values(world.facilitiesById), ...facilities],
    facilityComponents: [...Object.values(world.facilityComponentsById), ...components],
    facilityComponentConditionRecords: [...Object.values(world.facilityComponentConditionRecordsById), ...conditions],
    facilityMaintenanceNeeds: [...Object.values(world.facilityMaintenanceNeedsById), ...needs],
    facilityOwnershipInterests: [...Object.values(world.facilityOwnershipInterestsById), ...ownerships],
    facilityUsageRights: [...Object.values(world.facilityUsageRightsById), ...usageRights],
    governanceInstitutions: [...Object.values(world.governanceInstitutionsById), ...institutions],
    governanceUniverseProfiles: [...Object.values(world.governanceUniverseProfilesById), ...profiles],
    governanceBodies: [...Object.values(world.governanceBodiesById), ...bodies],
    governanceAppointments: [...Object.values(world.governanceAppointmentsById), ...appointments],
    governanceAuthorityGrants: [...Object.values(world.governanceAuthorityGrantsById), ...grants],
    governanceDecisionParticipationGrants: [...Object.values(world.governanceDecisionParticipationGrantsById), ...participation],
    financialBudgets: [...Object.values(world.financialBudgetsById), ...budgets],
    budgetLines: [...Object.values(world.budgetLinesById), ...budgetLines],
    facilityEconomyRecords: [...Object.values(world.facilityEconomyRecordsById), ...missingCost],
  })
}

export { BDM_BALANCE_ID_PREFIX, addDays }
