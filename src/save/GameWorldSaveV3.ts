import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createTeamFinances, type TeamFinances } from '@/domain/finance'
import { conferenceIdFromString, staffPersonIdFromString, teamIdFromString, type StaffPersonId } from '@/domain/ids'
import { createStaffEmployment, createStaffJobOpening, staffJobCandidacyIdFromString, staffJobOfferIdFromString, staffJobOpeningIdFromString, type StaffCareerHistoryEntry, type StaffEmployment, type StaffInterview, type StaffJobCandidacy, type StaffJobOffer, type StaffJobOpening } from '@/domain/staffCareer'
import { createStaffContract, staffContractIdFromString, type StaffContract } from '@/domain/staffContract'
import { createStaffReputationProfile, STAFF_REPUTATION_DIMENSIONS, type StaffReputationProfile } from '@/domain/staffReputation'
import { createStaffPoliticalAction, createStaffPoliticalAlliance, createStaffPoliticalCase, createStaffPoliticalFaction, POLITICAL_ACTION_KINDS, POLITICAL_AGENDAS, POLITICAL_CASE_SOURCE_KINDS, POLITICAL_STANCES, STAFF_POLITICAL_CASE_RESOLUTION_KINDS, STAFF_POLITICAL_CASE_STATUSES, type StaffPoliticalAction, type StaffPoliticalAlliance, type StaffPoliticalCase, type StaffPoliticalCaseResolutionKind, type StaffPoliticalFaction } from '@/domain/staffPolitics'
import { ensureStaffContractStructure, ensureStaffEmploymentStructure, ensureStaffReputationStructure } from '@/engine/world/StaffCareerEnrichment'
import { parseGameDate } from '@/domain/date'
import { createGovernanceAppointment, createGovernanceAuthorityGrant, createGovernanceBody, createGovernanceExpectationPeriod, createGovernanceExternalRelationship, createGovernanceInstitution, createGovernanceJobSecurityTransition, createGovernanceManagerEvaluation, createGovernanceManagerEvaluationPeriod, createGovernanceObjective, GOVERNANCE_BODY_KINDS, GOVERNANCE_DECISION_TYPES, GOVERNANCE_EXPECTATION_HORIZONS, GOVERNANCE_EXTERNAL_RELATIONSHIP_TYPES, GOVERNANCE_FACTOR_DIRECTIONS, GOVERNANCE_FACTOR_STATUSES, GOVERNANCE_JOB_SECURITY_STATES, GOVERNANCE_MANAGER_EVALUATION_FACTOR_KINDS, GOVERNANCE_OBJECTIVE_COMPARISONS, GOVERNANCE_OBJECTIVE_FAMILIES, GOVERNANCE_OBJECTIVE_METRICS, GOVERNANCE_ROLES, GOVERNANCE_UNIVERSES, type GovernanceAppointment, type GovernanceAuthorityGrant, type GovernanceBody, type GovernanceExpectationPeriod, type GovernanceExternalRelationship, type GovernanceInstitution, type GovernanceJobSecurityTransition, type GovernanceManagerEvaluation, type GovernanceManagerEvaluationFactorSource, type GovernanceManagerEvaluationPeriod, type GovernanceObjective } from '@/domain/governance'
import { deserializeGameWorldV2, migrateGameWorldSaveV1ToV2, serializeGameWorldV2, assertExactKeys, type GameWorldSaveV2, type SaveGameEnvelopeV2 } from './GameWorldSaveV2'
import type { SaveGameEnvelopeV1 } from './GameWorldSaveV1'

/**
 * Wave 4A save layer (Issue #19 §10). V1/V2 remain legacy-readable and unweakened. Runtime
 * serialization writes V3 only. V3 owns: the new Staff Career/Contract/Reputation collections
 * (via `staffCareerRuntime`, mirroring how V2 layers `scoutingRuntime`/`marketRuntime` on top of
 * V1) and the new `TeamFinances.staffSalaryBudget` field (strictly validated here rather than left
 * to V1's loose backfilling reader, per the "changed contract" rule).
 */
/** `staffCareerRuntime` is REQUIRED (Wave 4A review Blocker 3) — V3 is precisely the format that owns Staff Career state; tolerance for its absence belongs only to the V1/V2 migration path (`migrateGameWorldSaveV1ToV3`/`migrateGameWorldSaveV2ToV3`), never to a canonical V3 payload. */
export interface GameWorldSaveV3 extends GameWorldSaveV2 { readonly staffCareerRuntime: Readonly<Record<string, unknown>> }
export interface SaveGameEnvelopeV3 { readonly schemaVersion: 3; readonly savedAt: string; readonly payload: GameWorldSaveV3 }

export function migrateGameWorldSaveV1ToV3(value: SaveGameEnvelopeV1): SaveGameEnvelopeV3 {
  return migrateGameWorldSaveV2ToV3(migrateGameWorldSaveV1ToV2(value))
}

/**
 * `deserializeGameWorldV2` never runs Staff Career enrichment (it always loads with
 * `enrichLegacy: false`, since V2 itself is a legacy layer that owns no Staff Career state) — so a
 * genuinely pre-Wave-4A V2 save arrives here with EMPTY Staff Career collections. This migration is
 * the one place responsible for deterministically backfilling `StaffEmployment`/`CareerHistory`/
 * `StaffContract`/`StaffReputation` before handing the world to V3's serializer, exactly once, pure
 * and idempotent (re-running this migration on an already-enriched world is a no-op per-enrichment
 * function).
 */
export function migrateGameWorldSaveV2ToV3(value: SaveGameEnvelopeV2): SaveGameEnvelopeV3 {
  const payload = record(value.payload, 'Save V2 payload')
  const trainingStaffAssignments = parseScheduledTrainingStaffAssignments(payload.scheduledTrainingSessions)
  const compatibilityPayload = stripScheduledTrainingStaffAssignments(payload)
  const baseWorld = deserializeGameWorldV2({ ...value, payload: compatibilityPayload })
  const enriched = ensureStaffReputationStructure(ensureStaffContractStructure(ensureStaffEmploymentStructure(baseWorld)))
  const world = restoreScheduledTrainingStaffAssignments(enriched, trainingStaffAssignments)
  return { schemaVersion: 3, savedAt: value.savedAt, payload: v3Payload(value.payload, world) }
}

export function serializeGameWorldV3(world: GameWorld, savedAt: string): SaveGameEnvelopeV3 {
  const compatibilityPayload = serializeGameWorldV2(world, savedAt)
  return { schemaVersion: 3, savedAt: compatibilityPayload.savedAt, payload: v3Payload(compatibilityPayload.payload, world) }
}

export function deserializeGameWorldV3(value: unknown): GameWorld {
  const envelope = record(value, 'Save V3 file')
  assertExactKeys(envelope, ['schemaVersion', 'savedAt', 'payload'], 'Save V3 envelope')
  if (envelope.schemaVersion !== 3) throw new Error('Unsupported save version')
  if (typeof envelope.savedAt !== 'string' || Number.isNaN(Date.parse(envelope.savedAt))) throw new TypeError('Save V3 savedAt must be an ISO-8601 timestamp')
  const payload = record(envelope.payload, 'Save V3 payload')
  const teamFinances = array(payload.teamFinances, 'Save V3 teamFinances').map(parseTeamFinancesV3)
  const runtime = parseStaffCareerRuntimeV3(payload.staffCareerRuntime)
  const trainingStaffAssignments = parseScheduledTrainingStaffAssignments(payload.scheduledTrainingSessions)
  // V2/V1 are legacy layers and do not own Staff Career. A current V3 session may carry concrete
  // execution-staff IDs, but validating those IDs requires V3 employment to exist. Strip only that
  // new field while constructing the compatibility world, restore V3 Staff Career, then restore the
  // assignments through updateGameWorld so the full canonical validator runs with employment live.
  const compatibilityPayload = stripScheduledTrainingStaffAssignments(payload)
  const world = deserializeGameWorldV2({ ...envelope, schemaVersion: 2, payload: compatibilityPayload })
  const withStaffCareer = updateGameWorld(world, {
    teamFinances,
    staffEmploymentByStaffId: runtime.staffEmploymentByStaffId,
    staffCareerHistoryByStaffId: runtime.staffCareerHistoryByStaffId,
    staffJobOpenings: runtime.staffJobOpenings,
    staffJobCandidacies: runtime.staffJobCandidacies,
    staffInterviewsByCandidacyId: runtime.staffInterviewsByCandidacyId,
    staffJobOffers: runtime.staffJobOffers,
    staffContracts: runtime.staffContracts,
    staffReputationProfilesByStaffId: runtime.staffReputationProfilesByStaffId,
    staffPoliticalCases: runtime.staffPoliticalCases,
    staffPoliticalActions: runtime.staffPoliticalActions,
    staffPoliticalAlliances: runtime.staffPoliticalAlliances,
    staffPoliticalFactions: runtime.staffPoliticalFactions,
    governanceInstitutions: runtime.governanceInstitutions,
    governanceBodies: runtime.governanceBodies,
    governanceAppointments: runtime.governanceAppointments,
    governanceAuthorityGrants: runtime.governanceAuthorityGrants,
    governanceExternalRelationships: runtime.governanceExternalRelationships,
    governanceExpectationPeriods: runtime.governanceExpectationPeriods,
    governanceObjectives: runtime.governanceObjectives,
    governanceManagerEvaluationPeriods: runtime.governanceManagerEvaluationPeriods,
    governanceManagerEvaluations: runtime.governanceManagerEvaluations,
    governanceJobSecurityTransitions: runtime.governanceJobSecurityTransitions,
  })
  return restoreScheduledTrainingStaffAssignments(withStaffCareer, trainingStaffAssignments)
}

function v3Payload(payload: GameWorldSaveV2, world: GameWorld): GameWorldSaveV3 {
  return {
    ...payload,
    teamFinances: Object.values(world.teamFinancesByTeamId).map((finances) => JSON.parse(JSON.stringify(finances)) as Readonly<Record<string, unknown>>),
    staffCareerRuntime: {
      staffEmployment: Object.entries(world.staffEmploymentByStaffId).map(([staffId, employment]) => ({ staffId, employment })),
      staffCareerHistory: Object.entries(world.staffCareerHistoryByStaffId).map(([staffId, history]) => ({ staffId, history })),
      staffJobOpenings: Object.values(world.staffJobOpeningsById),
      staffJobCandidacies: Object.values(world.staffJobCandidaciesById),
      staffInterviews: Object.values(world.staffInterviewsByCandidacyId),
      staffJobOffers: Object.values(world.staffJobOffersById),
      staffContracts: Object.values(world.staffContractsById),
      staffReputationProfiles: Object.entries(world.staffReputationProfilesByStaffId).map(([staffId, profile]) => ({ staffId, profile })),
      staffPoliticalCases: Object.values(world.staffPoliticalCasesById),
      staffPoliticalActions: Object.values(world.staffPoliticalActionsById),
      staffPoliticalAlliances: Object.values(world.staffPoliticalAlliancesById),
      staffPoliticalFactions: Object.values(world.staffPoliticalFactionsById),
      governanceInstitutions: Object.values(world.governanceInstitutionsById),
      governanceBodies: Object.values(world.governanceBodiesById),
      governanceAppointments: Object.values(world.governanceAppointmentsById),
      governanceAuthorityGrants: Object.values(world.governanceAuthorityGrantsById),
      governanceExternalRelationships: Object.values(world.governanceExternalRelationshipsById),
      governanceExpectationPeriods: Object.values(world.governanceExpectationPeriodsById),
      governanceObjectives: Object.values(world.governanceObjectivesById),
      governanceManagerEvaluationPeriods: Object.values(world.governanceManagerEvaluationPeriodsById),
      governanceManagerEvaluations: Object.values(world.governanceManagerEvaluationsById),
      governanceJobSecurityTransitions: Object.values(world.governanceJobSecurityTransitionsById),
    },
  }
}

function parseTeamFinancesV3(value: unknown): TeamFinances {
  const v = record(value, 'Team finances V3')
  assertExactKeys(v, ['teamId', 'playerSalaryBudget', 'staffSalaryBudget'], 'Team finances V3')
  return createTeamFinances({ teamId: teamIdFromString(text(v.teamId, 'Team finances teamId')), playerSalaryBudget: integer(v.playerSalaryBudget, 'Team finances playerSalaryBudget'), staffSalaryBudget: integer(v.staffSalaryBudget, 'Team finances staffSalaryBudget') })
}

function parseStaffCareerRuntimeV3(value: unknown): {
  readonly staffEmploymentByStaffId: Readonly<Record<string, StaffEmployment>>
  readonly staffCareerHistoryByStaffId: Readonly<Record<string, readonly StaffCareerHistoryEntry[]>>
  readonly staffJobOpenings: readonly StaffJobOpening[]
  readonly staffJobCandidacies: readonly StaffJobCandidacy[]
  readonly staffInterviewsByCandidacyId: Readonly<Record<string, StaffInterview>>
  readonly staffJobOffers: readonly StaffJobOffer[]
  readonly staffContracts: readonly StaffContract[]
  readonly staffReputationProfilesByStaffId: Readonly<Record<string, StaffReputationProfile>>
  readonly staffPoliticalCases: readonly StaffPoliticalCase[]
  readonly staffPoliticalActions: readonly StaffPoliticalAction[]
  readonly staffPoliticalAlliances: readonly StaffPoliticalAlliance[]
  readonly staffPoliticalFactions: readonly StaffPoliticalFaction[]
  readonly governanceInstitutions: readonly GovernanceInstitution[]
  readonly governanceBodies: readonly GovernanceBody[]
  readonly governanceAppointments: readonly GovernanceAppointment[]
  readonly governanceAuthorityGrants: readonly GovernanceAuthorityGrant[]
  readonly governanceExternalRelationships: readonly GovernanceExternalRelationship[]
  readonly governanceExpectationPeriods: readonly GovernanceExpectationPeriod[]
  readonly governanceObjectives: readonly GovernanceObjective[]
  readonly governanceManagerEvaluationPeriods: readonly GovernanceManagerEvaluationPeriod[]
  readonly governanceManagerEvaluations: readonly GovernanceManagerEvaluation[]
  readonly governanceJobSecurityTransitions: readonly GovernanceJobSecurityTransition[]
} {
  // `value` is required for a canonical V3 payload (Blocker 3) — `record()` throws if it is
  // `undefined`/missing, so there is no "treat absence as empty" fallback here anymore.
  const runtime = record(value, 'Staff career runtime V3')
  assertExactKeys(runtime, ['staffEmployment', 'staffCareerHistory', 'staffJobOpenings', 'staffJobCandidacies', 'staffInterviews', 'staffJobOffers', 'staffContracts', 'staffReputationProfiles', ...(runtime.staffPoliticalCases === undefined ? [] : ['staffPoliticalCases']), ...(runtime.staffPoliticalActions === undefined ? [] : ['staffPoliticalActions']), ...(runtime.staffPoliticalAlliances === undefined ? [] : ['staffPoliticalAlliances']), ...(runtime.staffPoliticalFactions === undefined ? [] : ['staffPoliticalFactions']), ...(runtime.governanceInstitutions === undefined ? [] : ['governanceInstitutions']), ...(runtime.governanceBodies === undefined ? [] : ['governanceBodies']), ...(runtime.governanceAppointments === undefined ? [] : ['governanceAppointments']), ...(runtime.governanceAuthorityGrants === undefined ? [] : ['governanceAuthorityGrants']), ...(runtime.governanceExternalRelationships === undefined ? [] : ['governanceExternalRelationships']), ...(runtime.governanceExpectationPeriods === undefined ? [] : ['governanceExpectationPeriods']), ...(runtime.governanceObjectives === undefined ? [] : ['governanceObjectives']), ...(runtime.governanceManagerEvaluationPeriods === undefined ? [] : ['governanceManagerEvaluationPeriods']), ...(runtime.governanceManagerEvaluations === undefined ? [] : ['governanceManagerEvaluations']), ...(runtime.governanceJobSecurityTransitions === undefined ? [] : ['governanceJobSecurityTransitions'])], 'Staff career runtime V3')

  const staffEmploymentByStaffId = Object.fromEntries(array(runtime.staffEmployment, 'Staff career runtime staffEmployment').map((entry) => {
    const e = record(entry, 'Staff employment V3'); assertExactKeys(e, ['staffId', 'employment'], 'Staff employment V3')
    return [staffPersonIdFromString(text(e.staffId, 'Staff employment staffId')), parseStaffEmploymentV3(e.employment)]
  }))
  const staffCareerHistoryByStaffId = Object.fromEntries(array(runtime.staffCareerHistory, 'Staff career runtime staffCareerHistory').map((entry) => {
    const e = record(entry, 'Staff career history V3'); assertExactKeys(e, ['staffId', 'history'], 'Staff career history V3')
    return [staffPersonIdFromString(text(e.staffId, 'Staff career history staffId')), array(e.history, 'Staff career history entries').map(parseStaffCareerHistoryEntryV3)]
  }))
  const staffJobOpenings = array(runtime.staffJobOpenings, 'Staff career runtime staffJobOpenings').map(parseStaffJobOpeningV3)
  const staffJobCandidacies = array(runtime.staffJobCandidacies, 'Staff career runtime staffJobCandidacies').map(parseStaffJobCandidacyV3)
  const staffInterviewsByCandidacyId = Object.fromEntries(array(runtime.staffInterviews, 'Staff career runtime staffInterviews').map((entry) => {
    const e = record(entry, 'Staff interview V3'); assertExactKeys(e, ['candidacyId', 'status'], 'Staff interview V3')
    const candidacyId = staffJobCandidacyIdFromString(text(e.candidacyId, 'Staff interview candidacyId'))
    return [candidacyId, { candidacyId, status: enumValue(e.status, ['scheduled', 'completed'], 'Staff interview status') as StaffInterview['status'] }]
  }))
  const staffJobOffers = array(runtime.staffJobOffers, 'Staff career runtime staffJobOffers').map(parseStaffJobOfferV3)
  const staffContracts = array(runtime.staffContracts, 'Staff career runtime staffContracts').map(parseStaffContractV3)
  const staffReputationProfilesByStaffId = Object.fromEntries(array(runtime.staffReputationProfiles, 'Staff career runtime staffReputationProfiles').map((entry) => {
    const e = record(entry, 'Staff reputation profile V3'); assertExactKeys(e, ['staffId', 'profile'], 'Staff reputation profile V3')
    return [staffPersonIdFromString(text(e.staffId, 'Staff reputation staffId')), parseStaffReputationProfileV3(e.profile)]
  }))
  const staffPoliticalCases = runtime.staffPoliticalCases === undefined ? [] : array(runtime.staffPoliticalCases, 'Staff career runtime staffPoliticalCases').map(parseStaffPoliticalCaseV3)
  const staffPoliticalActions = runtime.staffPoliticalActions === undefined ? [] : array(runtime.staffPoliticalActions, 'Staff career runtime staffPoliticalActions').map(parseStaffPoliticalActionV3)
  const staffPoliticalAlliances = runtime.staffPoliticalAlliances === undefined ? [] : array(runtime.staffPoliticalAlliances, 'Staff career runtime staffPoliticalAlliances').map(parseStaffPoliticalAllianceV3)
  const staffPoliticalFactions = runtime.staffPoliticalFactions === undefined ? [] : array(runtime.staffPoliticalFactions, 'Staff career runtime staffPoliticalFactions').map(parseStaffPoliticalFactionV3)
  const governanceInstitutions = runtime.governanceInstitutions === undefined ? [] : array(runtime.governanceInstitutions, 'Governance institutions').map(parseGovernanceInstitutionV3)
  const governanceBodies = runtime.governanceBodies === undefined ? [] : array(runtime.governanceBodies, 'Governance bodies').map(parseGovernanceBodyV3)
  const governanceAppointments = runtime.governanceAppointments === undefined ? [] : array(runtime.governanceAppointments, 'Governance appointments').map(parseGovernanceAppointmentV3)
  const governanceAuthorityGrants = runtime.governanceAuthorityGrants === undefined ? [] : array(runtime.governanceAuthorityGrants, 'Governance authority grants').map(parseGovernanceAuthorityGrantV3)
  const governanceExternalRelationships = runtime.governanceExternalRelationships === undefined ? [] : array(runtime.governanceExternalRelationships, 'Governance external relationships').map(parseGovernanceExternalRelationshipV3)
  const governanceExpectationPeriods = runtime.governanceExpectationPeriods === undefined ? [] : array(runtime.governanceExpectationPeriods, 'Governance expectation periods').map(parseGovernanceExpectationPeriodV3)
  const governanceObjectives = runtime.governanceObjectives === undefined ? [] : array(runtime.governanceObjectives, 'Governance objectives').map(parseGovernanceObjectiveV3)
  const governanceManagerEvaluationPeriods = runtime.governanceManagerEvaluationPeriods === undefined ? [] : array(runtime.governanceManagerEvaluationPeriods, 'Governance manager evaluation periods').map(parseGovernanceManagerEvaluationPeriodV3)
  const governanceManagerEvaluations = runtime.governanceManagerEvaluations === undefined ? [] : array(runtime.governanceManagerEvaluations, 'Governance manager evaluations').map(parseGovernanceManagerEvaluationV3)
  const governanceJobSecurityTransitions = runtime.governanceJobSecurityTransitions === undefined ? [] : array(runtime.governanceJobSecurityTransitions, 'Governance job-security transitions').map(parseGovernanceJobSecurityTransitionV3)

  return { staffEmploymentByStaffId, staffCareerHistoryByStaffId, staffJobOpenings, staffJobCandidacies, staffInterviewsByCandidacyId, staffJobOffers, staffContracts, staffReputationProfilesByStaffId, staffPoliticalCases, staffPoliticalActions, staffPoliticalAlliances, staffPoliticalFactions, governanceInstitutions, governanceBodies, governanceAppointments, governanceAuthorityGrants, governanceExternalRelationships, governanceExpectationPeriods, governanceObjectives, governanceManagerEvaluationPeriods, governanceManagerEvaluations, governanceJobSecurityTransitions }
}

function parseStaffPoliticalAllianceV3(value: unknown): StaffPoliticalAlliance { const item = record(value, 'Staff political alliance V3'); assertExactKeys(item, ['id', 'teamId', 'memberIds', 'formedOn', 'lastReinforcedOn', 'status', 'sharedAgendaWeights', 'coordinationScore', 'cohesionScore'], 'Staff political alliance V3'); return createStaffPoliticalAlliance({ id: text(item.id, 'Staff political alliance ID'), teamId: teamIdFromString(text(item.teamId, 'Staff political alliance Team')), memberIds: array(item.memberIds, 'Staff political alliance members').map((id) => staffPersonIdFromString(text(id, 'Staff political alliance member'))), formedOn: parseGameDate(text(item.formedOn, 'Staff political alliance formedOn')), lastReinforcedOn: parseGameDate(text(item.lastReinforcedOn, 'Staff political alliance lastReinforcedOn')), status: enumValue(item.status, ['ACTIVE', 'DORMANT', 'DISSOLVED'], 'Staff political alliance status') as never, sharedAgendaWeights: record(item.sharedAgendaWeights, 'Staff political alliance agendas') as never, coordinationScore: integer(item.coordinationScore, 'Staff political alliance score'), cohesionScore: integer(item.cohesionScore, 'Staff political alliance cohesion') }) }
function parseGovernanceFactorSourceV3(value: unknown): GovernanceManagerEvaluationFactorSource { const item=record(value,'Governance factor source V3'); const kind=text(item.kind,'Governance factor source kind'); if(kind==='BG2_OBJECTIVE_EVALUATION'){assertExactKeys(item,['kind','objectiveId'],'BG2 objective source');return {kind,objectiveId:text(item.objectiveId,'Objective ID')}} if(kind==='BG2_OBJECTIVE_SET_EVALUATION'){assertExactKeys(item,['kind','objectiveIds'],'BG2 objective set source');return {kind,objectiveIds:array(item.objectiveIds,'Objective IDs').map((id)=>text(id,'Objective ID'))}} if(kind==='GOVERNANCE_BODY'){assertExactKeys(item,['kind','bodyId'],'Governance body source');return {kind,bodyId:text(item.bodyId,'Body ID')}} if(kind==='STAFF_POLITICS'){assertExactKeys(item,['kind','teamId','politicalCaseIds','politicalActionIds'],'Staff politics source');return {kind,teamId:text(item.teamId,'Politics team'),politicalCaseIds:array(item.politicalCaseIds,'Political cases').map((id)=>text(id,'Political case')),politicalActionIds:array(item.politicalActionIds,'Political actions').map((id)=>text(id,'Political action'))}} if(kind==='STAFF_EMPLOYMENT'){assertExactKeys(item,['kind','staffId'],'Staff employment source');return {kind,staffId:text(item.staffId,'Staff ID')}} if(kind==='STAFF_CONTRACT'){assertExactKeys(item,['kind','staffId','contractId'],'Staff contract source');return {kind,staffId:text(item.staffId,'Staff ID'),contractId:text(item.contractId,'Contract ID')}} if(kind==='PRIOR_MANAGER_EVALUATION'){assertExactKeys(item,['kind','evaluationId'],'Prior evaluation source');return {kind,evaluationId:text(item.evaluationId,'Evaluation ID')}} if(kind==='GOVERNANCE_INCIDENT'){assertExactKeys(item,['kind','incidentId','incidentKind'],'Incident source');return {kind,incidentId:text(item.incidentId,'Incident ID'),incidentKind:enumValue(item.incidentKind,['COMPLIANCE','INSTITUTIONAL'],'Incident kind') as never}} throw new TypeError('Unknown governance factor source kind') }
function parseGovernanceManagerEvaluationPeriodV3(value: unknown): GovernanceManagerEvaluationPeriod { const item=record(value,'Governance manager evaluation period V3');assertExactKeys(item,['id','institutionId','universe','manager','startedOn',...(item.endedOn===undefined?[]:['endedOn'])],'Governance manager evaluation period V3');const manager=record(item.manager,'Governance manager');assertExactKeys(manager,['kind','id'],'Governance manager');return createGovernanceManagerEvaluationPeriod({id:text(item.id,'Evaluation period ID'),institutionId:text(item.institutionId,'Institution ID'),universe:enumValue(item.universe,GOVERNANCE_UNIVERSES,'Universe') as never,manager:{kind:enumValue(manager.kind,['COACH','STAFF'],'Manager kind') as never,id:text(manager.id,'Manager ID')},startedOn:parseGameDate(text(item.startedOn,'Period start')),...(item.endedOn===undefined?{}:{endedOn:parseGameDate(text(item.endedOn,'Period end'))})}) }
function parseGovernanceManagerEvaluationV3(value: unknown): GovernanceManagerEvaluation { const item=record(value,'Governance manager evaluation V3');assertExactKeys(item,['id','evaluationPeriodId','evaluatorBodyId','evaluatedOn','objectiveEvaluations','factors'],'Governance manager evaluation V3');return createGovernanceManagerEvaluation({id:text(item.id,'Evaluation ID'),evaluationPeriodId:text(item.evaluationPeriodId,'Evaluation period ID'),evaluatorBodyId:text(item.evaluatorBodyId,'Body ID'),evaluatedOn:parseGameDate(text(item.evaluatedOn,'Evaluation date')),objectiveEvaluations:array(item.objectiveEvaluations,'Objective evaluations') as never,factors:array(item.factors,'Factors').map((value)=>{const factor=record(value,'Governance factor V3');assertExactKeys(factor,['id','kind','status','weight','direction','source',...(factor.normalizedValue===undefined?[]:['normalizedValue']),...(factor.critical===undefined?[]:['critical'])],'Governance factor V3');return {id:text(factor.id,'Factor ID'),kind:enumValue(factor.kind,GOVERNANCE_MANAGER_EVALUATION_FACTOR_KINDS,'Factor kind') as never,status:enumValue(factor.status,GOVERNANCE_FACTOR_STATUSES,'Factor status') as never,weight:finite(factor.weight,'Factor weight'),direction:enumValue(factor.direction,GOVERNANCE_FACTOR_DIRECTIONS,'Factor direction') as never,...(factor.normalizedValue===undefined?{}:{normalizedValue:finite(factor.normalizedValue,'Factor value')}),source:parseGovernanceFactorSourceV3(factor.source),...(factor.critical===undefined?{}:{critical:factor.critical===true?true:(()=>{throw new TypeError('Factor critical')})()})}})}) }
function parseGovernanceJobSecurityTransitionV3(value: unknown): GovernanceJobSecurityTransition { const item=record(value,'Governance job-security transition V3');assertExactKeys(item,['id','managerId','institutionId','bodyId','evaluationId','nextState','effectiveOn','triggerKinds','sourceFactorIds',...(item.previousState===undefined?[]:['previousState'])],'Governance job-security transition V3');return createGovernanceJobSecurityTransition({id:text(item.id,'Transition ID'),managerId:text(item.managerId,'Manager ID'),institutionId:text(item.institutionId,'Institution ID'),bodyId:text(item.bodyId,'Body ID'),evaluationId:text(item.evaluationId,'Evaluation ID'),...(item.previousState===undefined?{}:{previousState:enumValue(item.previousState,GOVERNANCE_JOB_SECURITY_STATES,'Previous state') as never}),nextState:enumValue(item.nextState,GOVERNANCE_JOB_SECURITY_STATES,'Next state') as never,effectiveOn:parseGameDate(text(item.effectiveOn,'Effective date')),triggerKinds:array(item.triggerKinds,'Trigger kinds').map((kind)=>enumValue(kind,GOVERNANCE_MANAGER_EVALUATION_FACTOR_KINDS,'Trigger kind') as never),sourceFactorIds:array(item.sourceFactorIds,'Source factor IDs').map((id)=>text(id,'Source factor ID'))}) }
function parseGovernanceInstitutionV3(value: unknown): GovernanceInstitution { const item = record(value, 'Governance institution V3'); assertExactKeys(item, ['id', 'universe', 'name', 'teamIds', ...(item.ecosystemId === undefined ? [] : ['ecosystemId']), ...(item.parentInstitutionId === undefined ? [] : ['parentInstitutionId'])], 'Governance institution V3'); return createGovernanceInstitution({ id: text(item.id, 'Governance institution ID'), universe: enumValue(item.universe, GOVERNANCE_UNIVERSES, 'Governance universe') as GovernanceInstitution['universe'], name: text(item.name, 'Governance institution name'), teamIds: array(item.teamIds, 'Governance institution teams').map((id) => teamIdFromString(text(id, 'Governance institution team'))), ...(item.ecosystemId === undefined ? {} : { ecosystemId: text(item.ecosystemId, 'Governance institution ecosystem') as never }), ...(item.parentInstitutionId === undefined ? {} : { parentInstitutionId: text(item.parentInstitutionId, 'Governance parent institution') }) }) }
function parseGovernanceBodyV3(value: unknown): GovernanceBody { const item = record(value, 'Governance body V3'); assertExactKeys(item, ['id', 'institutionId', 'kind', 'name'], 'Governance body V3'); return createGovernanceBody({ id: text(item.id, 'Governance body ID'), institutionId: text(item.institutionId, 'Governance body institution'), kind: enumValue(item.kind, GOVERNANCE_BODY_KINDS, 'Governance body kind') as GovernanceBody['kind'], name: text(item.name, 'Governance body name') }) }
function parseGovernanceAppointmentV3(value: unknown): GovernanceAppointment { const item = record(value, 'Governance appointment V3'); assertExactKeys(item, ['id', 'bodyId', 'actor', 'role', 'startedOn', ...(item.endedOn === undefined ? [] : ['endedOn'])], 'Governance appointment V3'); const actor = record(item.actor, 'Governance appointment actor'); assertExactKeys(actor, ['kind', 'id'], 'Governance appointment actor'); return createGovernanceAppointment({ id: text(item.id, 'Governance appointment ID'), bodyId: text(item.bodyId, 'Governance appointment body'), actor: { kind: enumValue(actor.kind, ['COACH', 'STAFF', 'EXTERNAL'], 'Governance actor kind') as GovernanceAppointment['actor']['kind'], id: text(actor.id, 'Governance actor ID') }, role: enumValue(item.role, GOVERNANCE_ROLES, 'Governance role') as GovernanceAppointment['role'], startedOn: parseGameDate(text(item.startedOn, 'Governance appointment start')), ...(item.endedOn === undefined ? {} : { endedOn: parseGameDate(text(item.endedOn, 'Governance appointment end')) }) }) }
function parseGovernanceAuthorityGrantV3(value: unknown): GovernanceAuthorityGrant { const item = record(value, 'Governance authority grant V3'); assertExactKeys(item, ['id', 'fromBodyId', 'toBodyId', 'decision', 'grantedOn', ...(item.revokedOn === undefined ? [] : ['revokedOn'])], 'Governance authority grant V3'); return createGovernanceAuthorityGrant({ id: text(item.id, 'Governance authority grant ID'), fromBodyId: text(item.fromBodyId, 'Governance authority source'), toBodyId: text(item.toBodyId, 'Governance authority target'), decision: enumValue(item.decision, GOVERNANCE_DECISION_TYPES, 'Governance decision') as GovernanceAuthorityGrant['decision'], grantedOn: parseGameDate(text(item.grantedOn, 'Governance authority date')), ...(item.revokedOn === undefined ? {} : { revokedOn: parseGameDate(text(item.revokedOn, 'Governance authority revoke date')) }) }) }
function parseGovernanceExternalRelationshipV3(value: unknown): GovernanceExternalRelationship { const item = record(value, 'Governance external relationship V3'); assertExactKeys(item, ['id', 'externalRef', 'relationshipType', 'startedOn', ...(item.institutionId === undefined ? [] : ['institutionId']), ...(item.bodyId === undefined ? [] : ['bodyId']), ...(item.endedOn === undefined ? [] : ['endedOn'])], 'Governance external relationship V3'); const externalRef = record(item.externalRef, 'Governance external reference V3'); assertExactKeys(externalRef, ['kind', 'id'], 'Governance external reference V3'); const kind = enumValue(externalRef.kind, ['CONFERENCE', 'NIL_COLLECTIVE', 'DONOR_ECOSYSTEM', 'BOOSTER_ECOSYSTEM', 'REGULATORY_BODY'], 'Governance external reference kind') as GovernanceExternalRelationship['externalRef']['kind']; const id = text(externalRef.id, 'Governance external reference ID'); return createGovernanceExternalRelationship({ id: text(item.id, 'Governance external relationship ID'), ...(item.institutionId === undefined ? {} : { institutionId: text(item.institutionId, 'Governance external relationship institution') }), ...(item.bodyId === undefined ? {} : { bodyId: text(item.bodyId, 'Governance external relationship body') }), externalRef: kind === 'CONFERENCE' ? { kind, id: conferenceIdFromString(id) } : { kind, id }, relationshipType: enumValue(item.relationshipType, GOVERNANCE_EXTERNAL_RELATIONSHIP_TYPES, 'Governance external relationship type') as GovernanceExternalRelationship['relationshipType'], startedOn: parseGameDate(text(item.startedOn, 'Governance external relationship start')), ...(item.endedOn === undefined ? {} : { endedOn: parseGameDate(text(item.endedOn, 'Governance external relationship end')) }) }) }
function parseGovernanceExpectationPeriodV3(value: unknown): GovernanceExpectationPeriod { const item = record(value, 'Governance expectation period V3'); assertExactKeys(item, ['id', 'institutionId', 'universe', 'startedOn', ...(item.endedOn === undefined ? [] : ['endedOn'])], 'Governance expectation period V3'); return createGovernanceExpectationPeriod({ id: text(item.id, 'Governance expectation period ID'), institutionId: text(item.institutionId, 'Governance expectation institution'), universe: enumValue(item.universe, GOVERNANCE_UNIVERSES, 'Governance expectation universe') as GovernanceExpectationPeriod['universe'], startedOn: parseGameDate(text(item.startedOn, 'Governance expectation start')), ...(item.endedOn === undefined ? {} : { endedOn: parseGameDate(text(item.endedOn, 'Governance expectation end')) }) }) }
function parseGovernanceObjectiveV3(value: unknown): GovernanceObjective { const item = record(value, 'Governance objective V3'); assertExactKeys(item, ['id', 'expectationPeriodId', 'family', 'horizon', 'metric', 'comparison', 'target', 'tolerance', 'importance', 'evaluationStartsOn', 'evaluationEndsOn', ...(item.partialTolerance === undefined ? [] : ['partialTolerance']), ...(item.ownerInstitutionId === undefined ? [] : ['ownerInstitutionId']), ...(item.ownerBodyId === undefined ? [] : ['ownerBodyId'])], 'Governance objective V3'); const target=record(item.target,'Governance objective target'); const targetKind=enumValue(target.kind,['NUMERIC','BOOLEAN','RANGE'],'Governance objective target kind'); const parsedTarget=targetKind==='RANGE'?(assertExactKeys(target,['kind','minimum','maximum'],'Governance range target'),{kind:'RANGE' as const,minimum:finite(target.minimum,'minimum'),maximum:finite(target.maximum,'maximum')}):targetKind==='BOOLEAN'?(assertExactKeys(target,['kind','value'],'Governance boolean target'),{kind:'BOOLEAN' as const,value:typeof target.value==='boolean'?target.value:(()=>{throw new TypeError('boolean target')})()}):(assertExactKeys(target,['kind','value'],'Governance numeric target'),{kind:'NUMERIC' as const,value:finite(target.value,'target')}); return createGovernanceObjective({ id: text(item.id, 'Governance objective ID'), expectationPeriodId: text(item.expectationPeriodId, 'Governance objective period'), ...(item.ownerInstitutionId === undefined ? {} : { ownerInstitutionId: text(item.ownerInstitutionId, 'Governance objective institution') }), ...(item.ownerBodyId === undefined ? {} : { ownerBodyId: text(item.ownerBodyId, 'Governance objective body') }), family: enumValue(item.family, GOVERNANCE_OBJECTIVE_FAMILIES, 'Governance objective family') as GovernanceObjective['family'], horizon: enumValue(item.horizon, GOVERNANCE_EXPECTATION_HORIZONS, 'Governance objective horizon') as GovernanceObjective['horizon'], metric: enumValue(item.metric, GOVERNANCE_OBJECTIVE_METRICS, 'Governance objective metric') as GovernanceObjective['metric'], comparison: enumValue(item.comparison, GOVERNANCE_OBJECTIVE_COMPARISONS, 'Governance objective comparison') as GovernanceObjective['comparison'], target: parsedTarget, tolerance: finite(item.tolerance, 'Governance objective tolerance'), ...(item.partialTolerance === undefined ? {} : { partialTolerance: finite(item.partialTolerance, 'Governance objective partial tolerance') }), importance: integer(item.importance, 'Governance objective importance'), evaluationStartsOn: parseGameDate(text(item.evaluationStartsOn, 'Governance objective evaluation start')), evaluationEndsOn: parseGameDate(text(item.evaluationEndsOn, 'Governance objective evaluation end')) }) }
function parseStaffPoliticalFactionV3(value: unknown): StaffPoliticalFaction { const item = record(value, 'Staff political faction V3'); assertExactKeys(item, ['id', 'teamId', 'memberIds', 'leaderId', 'formedOn', 'lastReinforcedOn', 'status', 'dominantAgendas', 'cohesionScore', 'influenceScore'], 'Staff political faction V3'); return createStaffPoliticalFaction({ id: text(item.id, 'Staff political faction ID'), teamId: teamIdFromString(text(item.teamId, 'Staff political faction Team')), memberIds: array(item.memberIds, 'Staff political faction members').map((id) => staffPersonIdFromString(text(id, 'Staff political faction member'))), leaderId: staffPersonIdFromString(text(item.leaderId, 'Staff political faction leader')), formedOn: parseGameDate(text(item.formedOn, 'Staff political faction formedOn')), lastReinforcedOn: parseGameDate(text(item.lastReinforcedOn, 'Staff political faction lastReinforcedOn')), status: enumValue(item.status, ['ACTIVE', 'DORMANT', 'DISSOLVED'], 'Staff political faction status') as never, dominantAgendas: array(item.dominantAgendas, 'Staff political faction agendas').map((agenda) => enumValue(agenda, POLITICAL_AGENDAS, 'Staff political faction agenda') as never), cohesionScore: integer(item.cohesionScore, 'Staff political faction cohesion'), influenceScore: integer(item.influenceScore, 'Staff political faction influence') }) }

function parseStaffPoliticalActionV3(value: unknown): StaffPoliticalAction {
  const item = record(value, 'Staff political action V3')
  assertExactKeys(item, ['id', 'caseId', 'teamId', 'kind', 'stance', 'actorIds', 'performedOn', ...(item.target === undefined ? [] : ['target'])], 'Staff political action V3')
  const target = item.target === undefined ? undefined : (() => { const raw = record(item.target, 'Staff political action target V3'); assertExactKeys(raw, ['kind', 'id'], 'Staff political action target V3'); const kind = text(raw.kind, 'Staff political action target kind'); if (kind !== 'COACH' && kind !== 'STAFF') throw new RangeError('Invalid Staff political action target kind'); return kind === 'COACH' ? { kind: 'COACH' as const, id: text(raw.id, 'Staff political action target ID') } : { kind: 'STAFF' as const, id: staffPersonIdFromString(text(raw.id, 'Staff political action target ID')) } })()
  return createStaffPoliticalAction({ id: text(item.id, 'Staff political action ID'), caseId: text(item.caseId, 'Staff political action case ID'), teamId: teamIdFromString(text(item.teamId, 'Staff political action team ID')), kind: enumValue(item.kind, POLITICAL_ACTION_KINDS, 'Staff political action kind') as StaffPoliticalAction['kind'], stance: enumValue(item.stance, POLITICAL_STANCES, 'Staff political action stance') as StaffPoliticalAction['stance'], actorIds: array(item.actorIds, 'Staff political action actor IDs').map((actorId) => staffPersonIdFromString(text(actorId, 'Staff political action actor ID'))), ...(target === undefined ? {} : { target }), performedOn: parseGameDate(text(item.performedOn, 'Staff political action performedOn')) })
}

function parseStaffPoliticalCaseV3(value: unknown): StaffPoliticalCase {
  const item = record(value, 'Staff political case V3')
  assertExactKeys(item, ['id', 'scopeKey', 'teamId', 'sourceKind', 'sourceId', 'agenda', 'openedOn', 'lastEvaluatedOn', 'status', ...(item.subjectStaffId === undefined ? [] : ['subjectStaffId']), ...(item.resolution === undefined ? [] : ['resolution']), ...(item.positions === undefined ? [] : ['positions'])], 'Staff political case V3')
  const resolution = item.resolution === undefined ? undefined : (() => {
    const raw = record(item.resolution, 'Staff political case resolution V3')
    assertExactKeys(raw, ['kind', 'resolvedOn'], 'Staff political case resolution V3')
    return { kind: enumValue(raw.kind, STAFF_POLITICAL_CASE_RESOLUTION_KINDS, 'Staff political case resolution kind') as StaffPoliticalCaseResolutionKind, resolvedOn: parseGameDate(text(raw.resolvedOn, 'Staff political case resolution date')) }
  })()
  const positions = item.positions === undefined ? [] : array(item.positions, 'Staff political case positions V3').map((value) => { const position = record(value, 'Staff political position V3'); assertExactKeys(position, ['actorId', 'stance', 'since', 'lastEvaluatedOn'], 'Staff political position V3'); return { actorId: staffPersonIdFromString(text(position.actorId, 'Staff political position actor')), stance: enumValue(position.stance, POLITICAL_STANCES, 'Staff political position stance') as import('@/domain/staffPolitics').PoliticalStance, since: parseGameDate(text(position.since, 'Staff political position since')), lastEvaluatedOn: parseGameDate(text(position.lastEvaluatedOn, 'Staff political position last evaluated')) } })
  return createStaffPoliticalCase({ id: text(item.id, 'Staff political case id'), scopeKey: text(item.scopeKey, 'Staff political case scope key'), teamId: teamIdFromString(text(item.teamId, 'Staff political case team ID')), sourceKind: enumValue(item.sourceKind, POLITICAL_CASE_SOURCE_KINDS, 'Staff political case source kind') as StaffPoliticalCase['sourceKind'], sourceId: text(item.sourceId, 'Staff political case source ID'), agenda: enumValue(item.agenda, POLITICAL_AGENDAS, 'Staff political case agenda') as StaffPoliticalCase['agenda'], ...(item.subjectStaffId === undefined ? {} : { subjectStaffId: staffPersonIdFromString(text(item.subjectStaffId, 'Staff political case subject staff ID')) }), openedOn: parseGameDate(text(item.openedOn, 'Staff political case openedOn')), lastEvaluatedOn: parseGameDate(text(item.lastEvaluatedOn, 'Staff political case lastEvaluatedOn')), status: enumValue(item.status, STAFF_POLITICAL_CASE_STATUSES, 'Staff political case status') as StaffPoliticalCase['status'], positions, ...(resolution === undefined ? {} : { resolution }) })
}

function parseStaffEmploymentV3(value: unknown): StaffEmployment {
  const v = record(value, 'Staff employment V3 value')
  const status = enumValue(v.status, ['employed', 'unemployed'], 'Staff employment status')
  if (status === 'unemployed') { assertExactKeys(v, ['status'], 'Staff employment V3 value (unemployed)'); return createStaffEmployment({ status: 'unemployed' }) }
  const keys = ['status', 'teamId', 'roleId', ...(v.startedOn === undefined ? [] : ['startedOn'])]
  assertExactKeys(v, keys, 'Staff employment V3 value (employed)')
  return createStaffEmployment({ status: 'employed', teamId: teamIdFromString(text(v.teamId, 'Staff employment teamId')), roleId: text(v.roleId, 'Staff employment roleId') as never, ...(v.startedOn === undefined ? {} : { startedOn: parseGameDate(text(v.startedOn, 'Staff employment startedOn')) }) })
}

function parseStaffCareerHistoryEntryV3(value: unknown): StaffCareerHistoryEntry {
  const v = record(value, 'Staff career history entry V3')
  const kind = enumValue(v.kind, ['appointment', 'departure'], 'Staff career history kind')
  if (kind === 'appointment') {
    assertExactKeys(v, ['kind', 'staffId', 'teamId', 'roleId', 'date', 'reason'], 'Staff career history appointment V3')
    return { kind: 'appointment', staffId: staffPersonIdFromString(text(v.staffId, 'Staff career history staffId')), teamId: teamIdFromString(text(v.teamId, 'Staff career history teamId')), roleId: text(v.roleId, 'Staff career history roleId') as never, date: parseGameDate(text(v.date, 'Staff career history date')), reason: enumValue(v.reason, ['initialAppointment', 'hired', 'promoted', 'reassigned'], 'Staff career history appointment reason') as never }
  }
  assertExactKeys(v, ['kind', 'staffId', 'teamId', 'date', 'reason'], 'Staff career history departure V3')
  return { kind: 'departure', staffId: staffPersonIdFromString(text(v.staffId, 'Staff career history staffId')), teamId: teamIdFromString(text(v.teamId, 'Staff career history teamId')), date: parseGameDate(text(v.date, 'Staff career history date')), reason: enumValue(v.reason, ['fired', 'resigned', 'acceptedOtherJob', 'retired'], 'Staff career history departure reason') as never }
}

function parseStaffJobOpeningV3(value: unknown): StaffJobOpening {
  const v = record(value, 'Staff job opening V3')
  assertExactKeys(v, ['id', 'teamId', 'roleId', 'status', 'createdOn'], 'Staff job opening V3')
  return createStaffJobOpening({ id: staffJobOpeningIdFromString(text(v.id, 'Staff job opening id')), teamId: teamIdFromString(text(v.teamId, 'Staff job opening teamId')), roleId: text(v.roleId, 'Staff job opening roleId') as never, status: enumValue(v.status, ['open', 'filled', 'closed'], 'Staff job opening status') as never, createdOn: parseGameDate(text(v.createdOn, 'Staff job opening createdOn')) })
}

function parseStaffJobCandidacyV3(value: unknown): StaffJobCandidacy {
  const v = record(value, 'Staff job candidacy V3')
  assertExactKeys(v, ['id', 'jobOpeningId', 'staffId', 'status', 'createdOn', ...(v.origin === undefined ? [] : ['origin'])], 'Staff job candidacy V3')
  return { id: staffJobCandidacyIdFromString(text(v.id, 'Staff job candidacy id')), jobOpeningId: staffJobOpeningIdFromString(text(v.jobOpeningId, 'Staff job candidacy opening')), staffId: staffPersonIdFromString(text(v.staffId, 'Staff job candidacy staffId')), status: enumValue(v.status, ['identified', 'interviewing', 'rejected', 'offered', 'withdrawn', 'hired'], 'Staff job candidacy status') as never, createdOn: parseGameDate(text(v.createdOn, 'Staff job candidacy createdOn')), ...(v.origin === undefined ? {} : { origin: enumValue(v.origin, ['teamIdentified', 'staffApplied'], 'Staff job candidacy origin') as import('@/domain/staffCareer').StaffJobCandidacyOrigin }) }
}

function parseStaffJobOfferV3(value: unknown): StaffJobOffer {
  const v = record(value, 'Staff job offer V3')
  const keys = ['id', 'jobOpeningId', 'staffId', 'teamId', 'createdOn', 'status', ...(v.annualSalary === undefined ? [] : ['annualSalary'])]
  assertExactKeys(v, keys, 'Staff job offer V3')
  return { id: staffJobOfferIdFromString(text(v.id, 'Staff job offer id')), jobOpeningId: staffJobOpeningIdFromString(text(v.jobOpeningId, 'Staff job offer opening')), staffId: staffPersonIdFromString(text(v.staffId, 'Staff job offer staffId')), teamId: teamIdFromString(text(v.teamId, 'Staff job offer teamId')), ...(v.annualSalary === undefined ? {} : { annualSalary: finite(v.annualSalary, 'Staff job offer annualSalary') }), createdOn: parseGameDate(text(v.createdOn, 'Staff job offer createdOn')), status: enumValue(v.status, ['pending', 'accepted', 'declined', 'withdrawn'], 'Staff job offer status') as never }
}

function parseStaffContractV3(value: unknown): StaffContract {
  const v = record(value, 'Staff contract V3')
  const keys = ['id', 'staffId', 'teamId', 'kind', 'term', 'compensation', ...(v.termination === undefined ? [] : ['termination'])]
  assertExactKeys(v, keys, 'Staff contract V3')
  const term = record(v.term, 'Staff contract V3 term'); assertExactKeys(term, ['startsOn', 'expiresOn'], 'Staff contract V3 term')
  const compensation = record(v.compensation, 'Staff contract V3 compensation'); assertExactKeys(compensation, ['annualSalary'], 'Staff contract V3 compensation')
  const termination = v.termination === undefined ? undefined : (() => { const t = record(v.termination, 'Staff contract V3 termination'); assertExactKeys(t, ['effectiveOn', 'reason'], 'Staff contract V3 termination'); return { effectiveOn: parseGameDate(text(t.effectiveOn, 'Staff contract termination effectiveOn')), reason: enumValue(t.reason, ['performance', 'budgetCuts', 'roleEliminated', 'resigned'], 'Staff contract termination reason') as never } })()
  return createStaffContract({
    id: staffContractIdFromString(text(v.id, 'Staff contract id')),
    staffId: staffPersonIdFromString(text(v.staffId, 'Staff contract staffId')),
    teamId: teamIdFromString(text(v.teamId, 'Staff contract teamId')),
    kind: enumValue(v.kind, ['standard'], 'Staff contract kind') as 'standard',
    term: { startsOn: parseGameDate(text(term.startsOn, 'Staff contract startsOn')), expiresOn: parseGameDate(text(term.expiresOn, 'Staff contract expiresOn')) },
    compensation: { annualSalary: finite(compensation.annualSalary, 'Staff contract annualSalary') },
    ...(termination === undefined ? {} : { termination }),
  })
}

function parseStaffReputationProfileV3(value: unknown): StaffReputationProfile {
  const v = record(value, 'Staff reputation profile V3 value')
  assertExactKeys(v, ['values'], 'Staff reputation profile V3 value')
  const values = record(v.values, 'Staff reputation values V3')
  assertExactKeys(values, [...STAFF_REPUTATION_DIMENSIONS], 'Staff reputation values V3')
  return createStaffReputationProfile({ values: Object.fromEntries(STAFF_REPUTATION_DIMENSIONS.map((dimension) => [dimension, finite(values[dimension], `Staff reputation ${dimension}`)])) as never })
}

function parseScheduledTrainingStaffAssignments(value: unknown): Readonly<Record<string, readonly StaffPersonId[]>> {
  if (value === undefined) return Object.freeze({})
  const result: Record<string, readonly StaffPersonId[]> = {}
  for (const entry of array(value, 'Save scheduled training sessions')) {
    const session = record(entry, 'Save scheduled training session')
    if (session.assignedStaffPersonIds === undefined) continue
    const sessionId = text(session.id, 'Scheduled training session id')
    const staffIds = array(session.assignedStaffPersonIds, `Scheduled training session ${sessionId} assigned staff`).map((staffId) => staffPersonIdFromString(text(staffId, `Scheduled training session ${sessionId} assigned staff id`)))
    if (new Set(staffIds).size !== staffIds.length) throw new TypeError(`Scheduled training session ${sessionId} assigned staff must be unique`)
    result[sessionId] = Object.freeze(staffIds)
  }
  return Object.freeze(result)
}

function stripScheduledTrainingStaffAssignments(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.scheduledTrainingSessions === undefined) return payload
  const scheduledTrainingSessions = array(payload.scheduledTrainingSessions, 'Save scheduled training sessions').map((entry) => {
    const session = { ...record(entry, 'Save scheduled training session') }
    delete session.assignedStaffPersonIds
    return session
  })
  return { ...payload, scheduledTrainingSessions }
}

function restoreScheduledTrainingStaffAssignments(world: GameWorld, assignments: Readonly<Record<string, readonly StaffPersonId[]>>): GameWorld {
  if (Object.keys(assignments).length === 0) return world
  const scheduledTrainingSessionsById = { ...world.scheduledTrainingSessionsById }
  for (const [sessionId, staffIds] of Object.entries(assignments)) {
    const session = scheduledTrainingSessionsById[sessionId]
    if (session === undefined) throw new TypeError(`Scheduled training staff assignment references missing session ${sessionId}`)
    scheduledTrainingSessionsById[sessionId] = { ...session, assignedStaffPersonIds: staffIds }
  }
  return updateGameWorld(world, { scheduledTrainingSessionsById })
}

/** Canonical read dispatcher (Issue #19 §10): V1/V2 are migrated purely up to V3; runtime serialization writes V3 only. Supersedes `GameWorldSaveV2.deserializeGameWorldSave`, which remains for its own layer's direct V1/V2 tests. */
export function deserializeGameWorldSave(value: unknown): GameWorld {
  const version = (value as { schemaVersion?: unknown }).schemaVersion
  if (version === 1) return deserializeGameWorldV3(migrateGameWorldSaveV1ToV3(value as SaveGameEnvelopeV1))
  if (version === 2) return deserializeGameWorldV3(migrateGameWorldSaveV2ToV3(value as SaveGameEnvelopeV2))
  if (version === 3) return deserializeGameWorldV3(value)
  throw new Error('Unsupported save version')
}

function record(value: unknown, name: string): Record<string, unknown> { if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as Record<string, unknown> }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return value }
function text(value: unknown, name: string): string { if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string`); return value }
function finite(value: unknown, name: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`); return value }
function integer(value: unknown, name: string): number { const result = finite(value, name); if (!Number.isInteger(result)) throw new TypeError(`${name} must be an integer`); return result }
function enumValue(value: unknown, allowed: readonly string[], name: string): string { const result = text(value, name); if (!allowed.includes(result)) throw new TypeError(`${name} is invalid`); return result }
