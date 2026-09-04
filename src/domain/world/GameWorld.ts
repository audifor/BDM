import type { Coach } from '@/domain/coach'
import type { Competition, PromotionRelegationResolution } from '@/domain/competition'
import { createConference, createConferenceMembership, type Conference, type ConferenceMembership } from '@/domain/conference'
import type { Draft, DraftPick } from '@/domain/draft'
import { createSportsEcosystem, DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, DEFAULT_NBA_LIKE_ECOSYSTEM_ID, DEFAULT_NCAA_LIKE_ECOSYSTEM_ID, type SportsEcosystem } from '@/domain/ecosystem'
import type { Country } from '@/domain/country'
import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { Game } from '@/domain/game'
import type {
  CoachId,
  CompetitionId,
  EcosystemId,
  ConferenceId,
  CountryId,
  GameId,
  PlayerId,
  SeasonId,
  TeamId,
} from '@/domain/ids'
import type { Player } from '@/domain/player'
import { calculateSeasonStandings, type Season, type SeasonHistoryRecord } from '@/domain/season'
import type { Team } from '@/domain/team'
import type { MatchStatLog } from '@/domain/stats/MatchStatLog'
import { createInjury, isInjuryActive, type InjuryRecord } from '@/domain/injury'
import type { InjuryId } from '@/domain/ids'
import type { ContractId } from '@/domain/ids'
import { createPlayerContract, type PlayerContract } from '@/domain/contract'
import { createTeamFinances, type TeamFinances } from '@/domain/finance'
import type { PlayerTransaction } from '@/domain/transaction'
import type { PlayerTransactionId } from '@/domain/ids'
import { createOrganizationKnowledge, createPlayerKnowledge, type OrganizationKnowledge, type PlayerKnowledgeRecord } from '@/domain/knowledge'
import { createEvaluatorProfile, type Evidence, type EvaluatorProfile, type EvaluatorReport, type ScoutingAssignment } from '@/domain/scouting'
import { deriveOrganizationEvaluationPolicy, type OrganizationEvaluationPolicy } from '@/domain/intelligence'
import type { Agency, Agent, ContractNegotiation, MarketKnowledge, MarketReality, MarketSignal, PlayerRepresentation, RolePromise } from '@/domain/market'
import { organizationIdForTeam, type OrganizationId } from '@/domain/ids'
import type { PlayerKnowledgeId } from '@/domain/ids'
import { createStaffPerson, createTeamStaffAssignment, staffRoleDefinition, type StaffPerson, type TeamStaffAssignment } from '@/domain/staff'
import type { StaffPersonId, TeamStaffAssignmentId } from '@/domain/ids'
import { createStaffEmployment, createStaffJobOpening, isStaffOfferCandidacyStateConsistent, type StaffCareerHistoryEntry, type StaffEmployment, type StaffInterview, type StaffJobCandidacy, type StaffJobCandidacyId, type StaffJobOffer, type StaffJobOfferId, type StaffJobOpening, type StaffJobOpeningId } from '@/domain/staffCareer'
import { createStaffContract, isStaffContractActiveOn, type StaffContract, type StaffContractId } from '@/domain/staffContract'
import { createStaffReputationProfile, type StaffReputationProfile } from '@/domain/staffReputation'
import { createDelegationOutcome, createResponsibility, validateResponsibilityAssignment, type DelegationOutcome, type DelegationOutcomeId, type Responsibility, type ResponsibilityId } from '@/domain/responsibility'
import { createStaffHumanContext, createStaffHumanState, createStaffExpectationProfile, createStaffReactionRecord, type StaffHumanContext, type StaffHumanContextId, type StaffHumanState, type StaffExpectationProfile, type StaffReactionRecord, type StaffReactionRecordId } from '@/domain/staffHumanState'
import { createStaffCultureState, type StaffCultureState } from '@/domain/staffCulture'
import { createStaffUnitCohesionState, type StaffUnitCohesionState } from '@/domain/staffUnitCohesion'
import { createStaffConflict, type StaffConflict } from '@/domain/staffConflict'
import { createStaffCareerAutonomyState, createStaffCareerRequest, type StaffCareerAutonomyState, type StaffCareerRequest } from '@/domain/staffCareerAutonomy'
import { createStaffPoliticalCase, type StaffPoliticalCase } from '@/domain/staffPolitics'
import { createCoachRpgProfile, type CoachRpgProfile } from '@/domain/coachRpg'
import { createCoachFinanceProfile, type CoachFinanceProfile } from '@/domain/coachFinances'
import { createCoachReputationProfile, createDefaultCoachReputationProfile, type CoachReputationProfile } from '@/domain/coachReputation'
import { createCoachEmployment, createCoachJobOpening, type CoachCareerHistoryEntry, type CoachEmployment, type CoachInterview, type CoachJobCandidacy, type CoachJobCandidacyId, type CoachJobOffer, type CoachJobOfferId, type CoachJobOpening, type CoachJobOpeningId } from '@/domain/coachCareer'
import { createStaffProfessionalProfile, type StaffProfessionalProfile } from '@/domain/staff'
import { relationshipKey, validateRelationshipProfile, type RelationshipProfile } from '@/domain/relationships'
import { generatePersonality, type Personality } from '@/domain/personality'
import { createMoraleProfile, type MoraleProfile } from '@/domain/morale'
import type { InboxItem, NewsItem } from '@/domain/inbox'
import { EMPTY_DEVELOPMENT_STIMULUS, type PlayerDevelopmentStimulus } from '@/domain/development/DevelopmentStimulus'
import { clampCareerFatigue } from '@/domain/careerFatigue/CareerFatigue'
import { clampTeamCohesion, createDefaultTrainingPlan, createIndividualTrainingPlan, createScheduledTrainingSession, createUserTrainingModule, findCollidingSession, type IndividualTrainingPlan, type ScheduledTrainingSession, type TeamTrainingPlan, type TrainingResponsibility, type TrainingSession, type UserTrainingModule } from '@/domain/training'
import { createDefaultTeamLineup, createDefaultTeamTacticalPlan, createOppositionScoutingReport, createPlaybook, createSavedPlay, oppositionScoutingReportId, validateTeamLineup, type OppositionScoutingReport, type Playbook, type SavedPlay, type TeamGamePlan, type TeamLineup, type TeamTacticalPlan } from '@/domain/tactics'
import { createSalaryRules, type SalaryRules } from '@/domain/salary'
import { createDeadMoneyCharge, createTeamSalaryException, type DeadMoneyCharge, type TeamSalaryException } from '@/domain/salary'
import { createDraftPickSwapRight, createFutureDraftPickRight, createPlayerRights, createRetainedSalaryObligation, createTradeRecord, createTradeRules, type DraftPickSwapRight, type FutureDraftPickRight, type PlayerRights, type RetainedSalaryObligation, type TradeRecord, type TradeRules } from '@/domain/trade'
import type { RecruitingActionRecord, RecruitingBoardEntry, RecruitingCommitment, RecruitingCycle, RecruitingInterest, RecruitingOffer, RecruitingVisit, RecruitProfile, RecruitSigning } from '@/domain/recruiting'
import type { EligibilityProfile, EligibilityRestriction, EligibilityRules } from '@/domain/eligibility'
import type { AcademicProfile, AcademicRules, AcademicSupportPlan, AcademicTermRecord } from '@/domain/academic'
import type { Collective, NilDeal, NilOpportunity, NilProfile, NilRules } from '@/domain/nil'
import type { Booster, BoosterContribution, BoosterRequest } from '@/domain/boosters'
import type { EnforcementFinding, EnforcementRules, Investigation, ProgramComplianceState, Sanction, Violation } from '@/domain/enforcement'
import type { EcosystemTransition } from '@/domain/career'
import { createMemory, type MemoryRecord } from '@/domain/memory'
import { createNarrativeThread, type NarrativeThread } from '@/domain/narrative'
import type { MediaInteraction, MediaOpportunity, MediaProfile } from '@/domain/media'
import { createBoardState, type BoardState } from '@/domain/board'
import type { CoachAchievement, CoachLegacyState, CoachTeamLegacy, CoachTenure } from '@/domain/legacy'

export const GAME_WORLD_SCHEMA_VERSION = 1 as const

export interface GameWorld {
  readonly schemaVersion: typeof GAME_WORLD_SCHEMA_VERSION
  readonly currentDate: GameDate
  readonly currentSeasonId: SeasonId
  readonly userCoachId: CoachId
  readonly countries: Readonly<Record<CountryId, Country>>
  readonly coaches: Readonly<Record<CoachId, Coach>>
  readonly players: Readonly<Record<PlayerId, Player>>
  readonly teams: Readonly<Record<TeamId, Team>>
  readonly competitions: Readonly<Record<CompetitionId, Competition>>
  readonly ecosystems: Readonly<Record<EcosystemId, SportsEcosystem>>
  readonly conferencesById: Readonly<Record<ConferenceId, Conference>>
  /** Current-cycle membership. Season snapshots retain historical truth. */
  readonly conferenceMemberships: readonly ConferenceMembership[]
  readonly seasons: Readonly<Record<SeasonId, Season>>
  readonly games: Readonly<Record<GameId, Game>>
  readonly matchStatLogsByGameId: Readonly<Record<GameId, MatchStatLog>>
  readonly seasonHistoryBySeasonId: Readonly<Record<SeasonId, SeasonHistoryRecord>>
  readonly injuriesById: Readonly<Record<InjuryId, InjuryRecord>>
  readonly contractsById: Readonly<Record<ContractId, PlayerContract>>
  readonly teamFinancesByTeamId: Readonly<Record<TeamId, TeamFinances>>
  readonly playerTransactionsById: Readonly<Record<PlayerTransactionId, PlayerTransaction>>
  readonly playerKnowledgeById: Readonly<Record<PlayerKnowledgeId, PlayerKnowledgeRecord>>
  readonly organizationKnowledge: readonly OrganizationKnowledge[]
  readonly evidenceById: Readonly<Record<string, Evidence>>
  readonly evaluatorProfilesByStaffId: Readonly<Record<StaffPersonId, EvaluatorProfile>>
  readonly scoutingAssignmentsById: Readonly<Record<string, ScoutingAssignment>>
  readonly evaluatorReportsById: Readonly<Record<string, EvaluatorReport>>
  readonly organizationEvaluationPoliciesById: Readonly<Record<OrganizationId, OrganizationEvaluationPolicy>>
  readonly agentsById: Readonly<Record<import('@/domain/ids').AgentId, Agent>>
  readonly agenciesById: Readonly<Record<import('@/domain/ids').AgencyId, Agency>>
  readonly playerRepresentations: readonly PlayerRepresentation[]
  readonly marketRealityByPlayerId: Readonly<Record<PlayerId, MarketReality>>
  readonly marketKnowledge: readonly MarketKnowledge[]
  readonly marketSignalsById: Readonly<Record<string, MarketSignal>>
  readonly negotiationsById: Readonly<Record<string, ContractNegotiation>>
  readonly rolePromisesById: Readonly<Record<string, RolePromise>>
  readonly staffPeopleById: Readonly<Record<StaffPersonId, StaffPerson>>
  readonly teamStaffAssignmentsById: Readonly<Record<TeamStaffAssignmentId, TeamStaffAssignment>>
  readonly responsibilitiesById: Readonly<Record<ResponsibilityId, Responsibility>>
  readonly delegationOutcomesById: Readonly<Record<DelegationOutcomeId, DelegationOutcome>>
  readonly oppositionScoutingReportsById: Readonly<Record<string, OppositionScoutingReport>>
  readonly coachProfessionalProfilesByCoachId: Readonly<Record<CoachId, StaffProfessionalProfile>>
  readonly coachRpgProfilesByCoachId: Readonly<Record<CoachId, CoachRpgProfile>>
  readonly coachFinancesByCoachId: Readonly<Record<CoachId, CoachFinanceProfile>>
  readonly coachReputationProfilesByCoachId: Readonly<Record<CoachId, CoachReputationProfile>>
  readonly coachEmploymentByCoachId: Readonly<Record<CoachId, CoachEmployment>>
  readonly coachCareerHistoryByCoachId: Readonly<Record<CoachId, readonly CoachCareerHistoryEntry[]>>
  readonly coachJobOpeningsById: Readonly<Record<CoachJobOpeningId, CoachJobOpening>>
  readonly coachJobCandidaciesById: Readonly<Record<CoachJobCandidacyId, CoachJobCandidacy>>
  readonly coachInterviewsByCandidacyId: Readonly<Record<CoachJobCandidacyId, CoachInterview>>
  readonly coachJobOffersById: Readonly<Record<CoachJobOfferId, CoachJobOffer>>
  readonly staffEmploymentByStaffId: Readonly<Record<StaffPersonId, StaffEmployment>>
  readonly staffCareerHistoryByStaffId: Readonly<Record<StaffPersonId, readonly StaffCareerHistoryEntry[]>>
  readonly staffJobOpeningsById: Readonly<Record<StaffJobOpeningId, StaffJobOpening>>
  readonly staffJobCandidaciesById: Readonly<Record<StaffJobCandidacyId, StaffJobCandidacy>>
  readonly staffInterviewsByCandidacyId: Readonly<Record<StaffJobCandidacyId, StaffInterview>>
  readonly staffJobOffersById: Readonly<Record<StaffJobOfferId, StaffJobOffer>>
  readonly staffContractsById: Readonly<Record<StaffContractId, StaffContract>>
  readonly staffReputationProfilesByStaffId: Readonly<Record<StaffPersonId, StaffReputationProfile>>
  readonly staffHumanContextsById: Readonly<Record<StaffHumanContextId, StaffHumanContext>>
  readonly staffHumanStatesByContextId: Readonly<Record<StaffHumanContextId, StaffHumanState>>
  readonly staffExpectationProfilesByContextId: Readonly<Record<StaffHumanContextId, StaffExpectationProfile>>
  readonly staffReactionRecordsById: Readonly<Record<StaffReactionRecordId, StaffReactionRecord>>
  /** Wave 5C — Organizational Culture, keyed by opaque `scopeKey` (= `TeamId` for this wave). Distinct from `teamCohesionByTeamId`. */
  readonly staffCultureStatesByScopeKey: Readonly<Record<string, StaffCultureState>>
  /** Wave 5C — Staff Unit Cohesion, keyed by `${teamId}:${department}`. Never the tactical/training `teamCohesionByTeamId`. */
  readonly staffUnitCohesionStatesByUnitKey: Readonly<Record<string, StaffUnitCohesionState>>
  readonly staffConflictsById: Readonly<Record<string, StaffConflict>>
  readonly staffCareerAutonomyByContextId: Readonly<Record<StaffHumanContextId, StaffCareerAutonomyState>>
  readonly staffCareerRequestsById: Readonly<Record<string, StaffCareerRequest>>
  readonly staffPoliticalCasesById: Readonly<Record<string, StaffPoliticalCase>>
  readonly relationshipsByKey: Readonly<Record<string, RelationshipProfile>>
  readonly personalitiesByPersonId: Readonly<Record<string, Personality>>
  readonly moraleByPersonId: Readonly<Record<string, MoraleProfile>>
  readonly inboxItemsById: Readonly<Record<string, InboxItem>>
  readonly newsItemsById: Readonly<Record<string, NewsItem>>
  readonly trainingPlansByTeamId: Readonly<Record<string, TeamTrainingPlan>>
  readonly individualTrainingPlansByPlayerId: Readonly<Record<string, IndividualTrainingPlan>>
  readonly trainingResponsibilitiesByTeamId: Readonly<Record<string, Readonly<Partial<Record<TrainingResponsibility, StaffPersonId>>>>>
  readonly tacticalPlansByTeamId: Readonly<Record<TeamId, TeamTacticalPlan>>
  /** Canonical persisted starters (PG/SG/SF/PF/C) + bench (B1-B7) match-squad, shared by Plantilla and Tactics. */
  readonly lineupsByTeamId: Readonly<Record<TeamId, TeamLineup>>
  readonly rotationPlansByTeamId: Readonly<Record<TeamId, import('@/domain/tactics').TeamRotationIntent>>
  readonly gamePlansByKey: Readonly<Record<string, TeamGamePlan>>
  /** Designer-authored plays and playbooks, scoped to this save/career (Issue #9: not a global cross-career store). */
  readonly savedPlaysById: Readonly<Record<string, SavedPlay>>
  readonly playbooksById: Readonly<Record<string, Playbook>>
  readonly trainingSessionsById: Readonly<Record<string, TrainingSession>>
  /** Persisted planner schedule: dated/timed training sessions, replacing the former UI-only planner scratchpad. */
  readonly scheduledTrainingSessionsById: Readonly<Record<string, ScheduledTrainingSession>>
  /** User-created training modules, composing the built-in catalog. */
  readonly userTrainingModulesById: Readonly<Record<string, UserTrainingModule>>
  readonly developmentStimulusByPlayerId: Readonly<Record<string, PlayerDevelopmentStimulus>>
  readonly careerFatigueByPlayerId: Readonly<Record<string, number>>
  readonly teamCohesionByTeamId: Readonly<Record<string, number>>
  readonly promotionRelegationResolutionsById: Readonly<Record<string, PromotionRelegationResolution>>
  readonly draftsById: Readonly<Record<string, Draft>>
  readonly draftPicksById: Readonly<Record<string, DraftPick>>
  readonly salaryRulesBySeasonId: Readonly<Record<SeasonId, SalaryRules>>
  readonly salaryExceptionsById: Readonly<Record<string, TeamSalaryException>>
  readonly deadMoneyChargesById: Readonly<Record<string, DeadMoneyCharge>>
  readonly tradeRulesBySeasonId: Readonly<Record<SeasonId, TradeRules>>
  readonly playerRightsById: Readonly<Record<string, PlayerRights>>
  readonly futureDraftPickRightsById: Readonly<Record<string, FutureDraftPickRight>>
  readonly draftPickSwapRightsById: Readonly<Record<string, DraftPickSwapRight>>
  readonly retainedSalaryObligationsById: Readonly<Record<string, RetainedSalaryObligation>>
  readonly tradeHistoryById: Readonly<Record<string, TradeRecord>>
  readonly recruitingCyclesById: Readonly<Record<string, RecruitingCycle>>
  readonly recruitProfilesById: Readonly<Record<string, RecruitProfile>>
  readonly recruitingInterests: readonly RecruitingInterest[]
  readonly recruitingBoards: readonly RecruitingBoardEntry[]
  readonly recruitingCapacityByProgramId: Readonly<Record<string, number>>
  readonly recruitingActionHistoryById: Readonly<Record<string, RecruitingActionRecord>>
  readonly recruitingOffersById: Readonly<Record<string, RecruitingOffer>>
  readonly recruitingVisitsById: Readonly<Record<string, RecruitingVisit>>
  readonly recruitingCommitmentsById: Readonly<Record<string, RecruitingCommitment>>
  readonly recruitSigningsById: Readonly<Record<string, RecruitSigning>>
  readonly eligibilityRulesByEcosystemId: Readonly<Record<EcosystemId, EligibilityRules>>
  readonly eligibilityProfilesById: Readonly<Record<string, EligibilityProfile>>
  readonly eligibilityRestrictionsById: Readonly<Record<string, EligibilityRestriction>>
  readonly academicRulesByEcosystemId: Readonly<Record<EcosystemId, AcademicRules>>
  readonly academicProfilesById: Readonly<Record<string, AcademicProfile>>
  readonly academicTermRecordsById: Readonly<Record<string, AcademicTermRecord>>
  readonly academicSupportPlansById: Readonly<Record<string, AcademicSupportPlan>>
  readonly nilRulesByEcosystemId: Readonly<Record<EcosystemId, NilRules>>
  readonly nilProfilesById: Readonly<Record<string, NilProfile>>
  readonly nilOpportunitiesById: Readonly<Record<string, NilOpportunity>>
  readonly nilDealsById: Readonly<Record<string, NilDeal>>
  readonly collectivesById: Readonly<Record<string, Collective>>
  readonly boostersById: Readonly<Record<string, Booster>>
  readonly boosterContributionsById: Readonly<Record<string, BoosterContribution>>
  readonly boosterRequestsById: Readonly<Record<string, BoosterRequest>>
  readonly enforcementRulesByEcosystemId: Readonly<Record<EcosystemId, EnforcementRules>>
  readonly violationsById: Readonly<Record<string, Violation>>
  readonly investigationsById: Readonly<Record<string, Investigation>>
  readonly findingsById: Readonly<Record<string, EnforcementFinding>>
  readonly sanctionsById: Readonly<Record<string, Sanction>>
  readonly programComplianceByProgramId: Readonly<Record<string, ProgramComplianceState>>
  readonly ecosystemTransitionsById: Readonly<Record<string, EcosystemTransition>>
  readonly memoriesById: Readonly<Record<string, MemoryRecord>>
  readonly narrativesById: Readonly<Record<string, NarrativeThread>>
  readonly mediaOpportunitiesById: Readonly<Record<string, MediaOpportunity>>
  readonly mediaInteractionsById: Readonly<Record<string, MediaInteraction>>
  readonly mediaProfilesByCoachId: Readonly<Record<string, MediaProfile>>
  readonly boardStatesByTeamId: Readonly<Record<string, BoardState>>
  readonly coachLegacyByCoachId: Readonly<Record<string, CoachLegacyState>>
  readonly coachAchievementsById: Readonly<Record<string, CoachAchievement>>
  readonly coachTenuresById: Readonly<Record<string, CoachTenure>>
  readonly coachTeamLegacyByKey: Readonly<Record<string, CoachTeamLegacy>>
}

export interface CreateGameWorldInput {
  currentDate: GameDate
  currentSeasonId?: SeasonId
  userCoachId: CoachId
  countries: readonly Country[]
  coaches: readonly Coach[]
  players: readonly Player[]
  teams: readonly Team[]
  competitions: readonly Competition[]
  ecosystems?: readonly SportsEcosystem[] | Readonly<Record<EcosystemId, SportsEcosystem>>
  conferences?: readonly Conference[]
  conferenceMemberships?: readonly ConferenceMembership[]
  seasons: readonly Season[]
  games: readonly Game[]
  matchStatLogs?: readonly MatchStatLog[]
  seasonHistory?: readonly SeasonHistoryRecord[]
  injuries?: readonly InjuryRecord[]
  contracts?: readonly PlayerContract[]
  teamFinances?: readonly TeamFinances[]
  playerTransactions?: readonly PlayerTransaction[]
  playerKnowledge?: readonly PlayerKnowledgeRecord[]
  organizationKnowledge?: readonly OrganizationKnowledge[]
  evidence?: readonly Evidence[]
  evaluatorProfilesByStaffId?: Readonly<Record<StaffPersonId, EvaluatorProfile>>
  scoutingAssignments?: readonly ScoutingAssignment[]
  evaluatorReports?: readonly EvaluatorReport[]
  organizationEvaluationPoliciesById?: Readonly<Record<OrganizationId, OrganizationEvaluationPolicy>>
  agents?: readonly Agent[]
  agencies?: readonly Agency[]
  playerRepresentations?: readonly PlayerRepresentation[]
  marketReality?: readonly MarketReality[]
  marketKnowledge?: readonly MarketKnowledge[]
  marketSignals?: readonly MarketSignal[]
  negotiations?: readonly ContractNegotiation[]
  rolePromises?: readonly RolePromise[]
  staffPeople?: readonly StaffPerson[]
  teamStaffAssignments?: readonly TeamStaffAssignment[]
  responsibilities?: readonly Responsibility[]
  delegationOutcomes?: readonly DelegationOutcome[]
  staffHumanContexts?: readonly StaffHumanContext[]
  staffHumanStates?: readonly StaffHumanState[]
  staffExpectationProfiles?: readonly StaffExpectationProfile[]
  staffReactionRecords?: readonly StaffReactionRecord[]
  staffCultureStates?: readonly StaffCultureState[]
  staffUnitCohesionStates?: readonly StaffUnitCohesionState[]
  staffConflicts?: readonly StaffConflict[]
  staffCareerAutonomyStates?: readonly StaffCareerAutonomyState[]
  staffCareerRequests?: readonly StaffCareerRequest[]
  staffPoliticalCases?: readonly StaffPoliticalCase[]
  oppositionScoutingReports?: readonly OppositionScoutingReport[]
  coachProfessionalProfilesByCoachId?: Readonly<Record<CoachId, StaffProfessionalProfile>>
  coachRpgProfilesByCoachId?: Readonly<Record<CoachId, CoachRpgProfile>>
  coachFinancesByCoachId?: Readonly<Record<CoachId, CoachFinanceProfile>>
  coachReputationProfilesByCoachId?: Readonly<Record<CoachId, CoachReputationProfile>>
  coachEmploymentByCoachId?: Readonly<Record<CoachId, CoachEmployment>>
  coachCareerHistoryByCoachId?: Readonly<Record<CoachId, readonly CoachCareerHistoryEntry[]>>
  coachJobOpeningsById?: Readonly<Record<CoachJobOpeningId, CoachJobOpening>>
  coachJobCandidaciesById?: Readonly<Record<CoachJobCandidacyId, CoachJobCandidacy>>
  coachInterviewsByCandidacyId?: Readonly<Record<CoachJobCandidacyId, CoachInterview>>
  coachJobOffersById?: Readonly<Record<CoachJobOfferId, CoachJobOffer>>
  staffEmploymentByStaffId?: Readonly<Record<StaffPersonId, StaffEmployment>>
  staffCareerHistoryByStaffId?: Readonly<Record<StaffPersonId, readonly StaffCareerHistoryEntry[]>>
  staffJobOpenings?: readonly StaffJobOpening[]
  staffJobCandidacies?: readonly StaffJobCandidacy[]
  staffInterviewsByCandidacyId?: Readonly<Record<StaffJobCandidacyId, StaffInterview>>
  staffJobOffers?: readonly StaffJobOffer[]
  staffContracts?: readonly StaffContract[]
  staffReputationProfilesByStaffId?: Readonly<Record<StaffPersonId, StaffReputationProfile>>
  relationshipsByKey?: Readonly<Record<string, RelationshipProfile>>
  personalitiesByPersonId?: Readonly<Record<string, Personality>>
  moraleByPersonId?: Readonly<Record<string, MoraleProfile>>
  inboxItemsById?: Readonly<Record<string, InboxItem>>
  newsItemsById?: Readonly<Record<string, NewsItem>>
  trainingPlansByTeamId?: Readonly<Record<string, TeamTrainingPlan>>
  individualTrainingPlansByPlayerId?: Readonly<Record<string, IndividualTrainingPlan>>
  trainingResponsibilitiesByTeamId?: Readonly<Record<string, Readonly<Partial<Record<TrainingResponsibility, StaffPersonId>>>>>
  tacticalPlansByTeamId?: Readonly<Record<TeamId, TeamTacticalPlan>>
  lineupsByTeamId?: Readonly<Record<TeamId, TeamLineup>>
  rotationPlansByTeamId?: Readonly<Record<TeamId, import('@/domain/tactics').TeamRotationIntent>>
  gamePlansByKey?: Readonly<Record<string, TeamGamePlan>>
  savedPlaysById?: Readonly<Record<string, SavedPlay>>
  playbooksById?: Readonly<Record<string, Playbook>>
  trainingSessionsById?: Readonly<Record<string, TrainingSession>>
  scheduledTrainingSessionsById?: Readonly<Record<string, ScheduledTrainingSession>>
  userTrainingModulesById?: Readonly<Record<string, UserTrainingModule>>
  developmentStimulusByPlayerId?: Readonly<Record<string, PlayerDevelopmentStimulus>>
  careerFatigueByPlayerId?: Readonly<Record<string, number>>
  teamCohesionByTeamId?: Readonly<Record<string, number>>
  promotionRelegationResolutions?: readonly PromotionRelegationResolution[]
  drafts?: readonly Draft[]
  draftPicks?: readonly DraftPick[]
  salaryRulesBySeasonId?: Readonly<Record<SeasonId, SalaryRules>>
  salaryExceptions?: readonly TeamSalaryException[]
  deadMoneyCharges?: readonly DeadMoneyCharge[]
  tradeRulesBySeasonId?: Readonly<Record<SeasonId, TradeRules>>
  playerRights?: readonly PlayerRights[]
  futureDraftPickRights?: readonly FutureDraftPickRight[]
  draftPickSwapRights?: readonly DraftPickSwapRight[]
  retainedSalaryObligations?: readonly RetainedSalaryObligation[]
  tradeHistory?: readonly TradeRecord[]
  recruitingCycles?: readonly RecruitingCycle[]
  recruitProfiles?: readonly RecruitProfile[]
  recruitingInterests?: readonly RecruitingInterest[]
  recruitingBoards?: readonly RecruitingBoardEntry[]
  recruitingCapacityByProgramId?: Readonly<Record<string, number>>
  recruitingActionHistory?: readonly RecruitingActionRecord[]
  recruitingOffers?: readonly RecruitingOffer[]
  recruitingVisits?: readonly RecruitingVisit[]
  recruitingCommitments?: readonly RecruitingCommitment[]
  recruitSignings?: readonly RecruitSigning[]
  eligibilityRulesByEcosystemId?: Readonly<Record<EcosystemId, EligibilityRules>>
  eligibilityProfiles?: readonly EligibilityProfile[]
  eligibilityRestrictions?: readonly EligibilityRestriction[]
  academicRulesByEcosystemId?: Readonly<Record<EcosystemId, AcademicRules>>
  academicProfiles?: readonly AcademicProfile[]
  academicTermRecords?: readonly AcademicTermRecord[]
  academicSupportPlans?: readonly AcademicSupportPlan[]
  nilRulesByEcosystemId?: Readonly<Record<EcosystemId, NilRules>>
  nilProfiles?: readonly NilProfile[]
  nilOpportunities?: readonly NilOpportunity[]
  nilDeals?: readonly NilDeal[]
  collectives?: readonly Collective[]
  boosters?: readonly Booster[]
  boosterContributions?: readonly BoosterContribution[]
  boosterRequests?: readonly BoosterRequest[]
  enforcementRulesByEcosystemId?: Readonly<Record<EcosystemId, EnforcementRules>>
  violations?: readonly Violation[]
  investigations?: readonly Investigation[]
  findings?: readonly EnforcementFinding[]
  sanctions?: readonly Sanction[]
  programComplianceByProgramId?: Readonly<Record<string, ProgramComplianceState>>
  ecosystemTransitions?: readonly EcosystemTransition[]
  memories?: readonly MemoryRecord[]
  narratives?: readonly NarrativeThread[]
  mediaOpportunitiesById?: Readonly<Record<string, MediaOpportunity>>
  mediaInteractionsById?: Readonly<Record<string, MediaInteraction>>
  mediaProfilesByCoachId?: Readonly<Record<string, MediaProfile>>
  boardStatesByTeamId?: Readonly<Record<string, BoardState>>
  coachLegacyByCoachId?: Readonly<Record<string, CoachLegacyState>>
  coachAchievementsById?: Readonly<Record<string, CoachAchievement>>
  coachTenuresById?: Readonly<Record<string, CoachTenure>>
  coachTeamLegacyByKey?: Readonly<Record<string, CoachTeamLegacy>>
}

export class GameWorldValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'GameWorldValidationError'
  }
}

export function createGameWorld(input: CreateGameWorldInput): GameWorld {
  const seasons = indexById(input.seasons, 'Season')
  const currentSeasonId = input.currentSeasonId ?? selectLegacyCurrentSeasonId(seasons)
  const currentDate = parseGameDate(input.currentDate)
  const employment = coachCareerForCoaches(input.coaches, input.teams, currentDate, input.coachEmploymentByCoachId, input.coachCareerHistoryByCoachId)
  const suppliedEcosystems = input.ecosystems === undefined ? [createSportsEcosystem({ id: DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, name: 'Virelia Basketball Federation', kind: 'fibaLike' })] : Array.isArray(input.ecosystems) ? input.ecosystems : Object.values(input.ecosystems)
  const ecosystems = [
    ...suppliedEcosystems,
    ...(input.competitions.some((competition) => competition.ecosystemId === DEFAULT_NBA_LIKE_ECOSYSTEM_ID) && !suppliedEcosystems.some((ecosystem) => ecosystem.id === DEFAULT_NBA_LIKE_ECOSYSTEM_ID) ? [createSportsEcosystem({ id: DEFAULT_NBA_LIKE_ECOSYSTEM_ID, name: 'Orinthian Franchise Basketball', kind: 'nbaLike' })] : []),
    ...(input.competitions.some((competition) => competition.ecosystemId === DEFAULT_NCAA_LIKE_ECOSYSTEM_ID) && !suppliedEcosystems.some((ecosystem) => ecosystem.id === DEFAULT_NCAA_LIKE_ECOSYSTEM_ID) ? [createSportsEcosystem({ id: DEFAULT_NCAA_LIKE_ECOSYSTEM_ID, name: 'Asteria Collegiate Basketball', kind: 'ncaaLike' })] : []),
  ]
  for (const competition of input.competitions) {
    if (ecosystems.some((ecosystem) => ecosystem.id === competition.ecosystemId)) continue
    const id = String(competition.ecosystemId)
    const kind = id.endsWith('0002') ? 'nbaLike' : id.endsWith('0003') ? 'ncaaLike' : 'fibaLike'
    ecosystems.push(createSportsEcosystem({ id: competition.ecosystemId, name: `Legacy ${competition.name} ecosystem`, kind, category: competition.gender === 'male' ? 'men' : 'women' }))
  }
  const snapshotMemberships = input.seasons.flatMap((season) => season.conferenceMembershipSnapshot ?? [])
  const memberships = input.conferenceMemberships ?? snapshotMemberships
  const conferences = input.conferences ?? [...new Set(memberships.map((membership) => membership.conferenceId))].map((id) => {
    const membership = memberships.find((item) => item.conferenceId === id)!
    const season = seasons[membership.seasonId]!
    return createConference({ id, ecosystemId: input.competitions.find((competition) => competition.id === season.competitionId)!.ecosystemId, name: `Conference ${id}` })
  })
  const world: GameWorld = {
    schemaVersion: GAME_WORLD_SCHEMA_VERSION,
    currentDate,
    currentSeasonId,
    userCoachId: input.userCoachId,
    countries: indexById(input.countries, 'Country'),
    coaches: indexById(input.coaches, 'Coach'),
    players: indexById(input.players, 'Player'),
    teams: indexById(input.teams, 'Team'),
    competitions: indexById(input.competitions, 'Competition'),
    ecosystems: indexById(ecosystems, 'Sports ecosystem'),
    conferencesById: indexById(conferences.map(createConference), 'Conference'),
    conferenceMemberships: Object.freeze(memberships.map(createConferenceMembership)),
    seasons,
    games: indexById(input.games, 'Game'),
    matchStatLogsByGameId: indexLogsByGameId(input.matchStatLogs ?? []),
    seasonHistoryBySeasonId: indexHistoryBySeasonId(input.seasonHistory ?? []),
    injuriesById: indexById(input.injuries ?? [], 'Injury'),
    contractsById: indexById(input.contracts ?? [], 'Contract'),
    teamFinancesByTeamId: indexTeamFinances(input.teamFinances ?? []),
    playerTransactionsById: indexById(input.playerTransactions ?? [], 'Player transaction'),
    playerKnowledgeById: indexById(input.playerKnowledge ?? [], 'Player knowledge'),
    organizationKnowledge: Object.freeze((input.organizationKnowledge ?? []).map(createOrganizationKnowledge)),
    evidenceById: indexById(input.evidence ?? [], 'Evidence'),
    evaluatorProfilesByStaffId: Object.freeze(Object.fromEntries(Object.entries(input.evaluatorProfilesByStaffId ?? {}).map(([id, profile]) => [id, createEvaluatorProfile(profile)]))) as Readonly<Record<StaffPersonId, EvaluatorProfile>>,
    scoutingAssignmentsById: indexById(input.scoutingAssignments ?? [], 'Scouting assignment'),
    evaluatorReportsById: indexById(input.evaluatorReports ?? [], 'Evaluator report'),
    organizationEvaluationPoliciesById: organizationPolicies(input.teams, input.organizationEvaluationPoliciesById),
    agentsById: indexById(input.agents ?? [], 'Agent'), agenciesById: indexById(input.agencies ?? [], 'Agency'), playerRepresentations: Object.freeze([...(input.playerRepresentations ?? [])]), marketRealityByPlayerId: Object.freeze(Object.fromEntries((input.marketReality ?? []).map(item => [item.playerId, item]))), marketKnowledge: Object.freeze([...(input.marketKnowledge ?? [])]), marketSignalsById: indexById(input.marketSignals ?? [], 'Market signal'), negotiationsById: indexById(input.negotiations ?? [], 'Negotiation'), rolePromisesById: indexById(input.rolePromises ?? [], 'Role promise'),
    staffPeopleById: indexById(input.staffPeople ?? [], 'Staff person'),
    teamStaffAssignmentsById: indexById(input.teamStaffAssignments ?? [], 'Staff assignment'),
    responsibilitiesById: indexById(input.responsibilities ?? [], 'Responsibility'),
    delegationOutcomesById: indexById(input.delegationOutcomes ?? [], 'Delegation outcome'),
    oppositionScoutingReportsById: indexById(input.oppositionScoutingReports ?? [], 'Opposition scouting report'),
    coachProfessionalProfilesByCoachId: input.coachProfessionalProfilesByCoachId ?? {},
    coachRpgProfilesByCoachId: input.coachRpgProfilesByCoachId ?? {},
    coachFinancesByCoachId: coachFinancesForCoaches(input.coaches, input.coachFinancesByCoachId),
    coachReputationProfilesByCoachId: coachReputationProfilesForCoaches(input.coaches, input.coachReputationProfilesByCoachId),
    coachEmploymentByCoachId: employment.byCoachId,
    coachCareerHistoryByCoachId: employment.historyByCoachId,
    coachJobOpeningsById: Object.freeze({ ...(input.coachJobOpeningsById ?? {}) }),
    coachJobCandidaciesById: Object.freeze({ ...(input.coachJobCandidaciesById ?? {}) }),
    coachInterviewsByCandidacyId: Object.freeze({ ...(input.coachInterviewsByCandidacyId ?? {}) }),
    coachJobOffersById: Object.freeze({ ...(input.coachJobOffersById ?? {}) }),
    staffEmploymentByStaffId: Object.freeze({ ...(input.staffEmploymentByStaffId ?? {}) }),
    staffCareerHistoryByStaffId: Object.freeze({ ...(input.staffCareerHistoryByStaffId ?? {}) }),
    staffJobOpeningsById: indexById(input.staffJobOpenings ?? [], 'Staff job opening'),
    staffJobCandidaciesById: indexById(input.staffJobCandidacies ?? [], 'Staff job candidacy'),
    staffInterviewsByCandidacyId: Object.freeze({ ...(input.staffInterviewsByCandidacyId ?? {}) }),
    staffJobOffersById: indexById(input.staffJobOffers ?? [], 'Staff job offer'),
    staffContractsById: indexById(input.staffContracts ?? [], 'Staff contract'),
    staffReputationProfilesByStaffId: Object.freeze({ ...(input.staffReputationProfilesByStaffId ?? {}) }),
    staffHumanContextsById: indexById(input.staffHumanContexts ?? [], 'Staff human context'),
    staffHumanStatesByContextId: indexHumanStatesByContextId(input.staffHumanStates ?? []),
    staffExpectationProfilesByContextId: indexExpectationProfilesByContextId(input.staffExpectationProfiles ?? []),
    staffReactionRecordsById: indexById(input.staffReactionRecords ?? [], 'Staff reaction record'),
    staffCultureStatesByScopeKey: indexCultureStatesByScopeKey(input.staffCultureStates ?? []),
    staffUnitCohesionStatesByUnitKey: indexUnitCohesionStatesByUnitKey(input.staffUnitCohesionStates ?? []),
    staffConflictsById: indexById(input.staffConflicts ?? [], 'Staff conflict'),
    staffCareerAutonomyByContextId: indexCareerAutonomyByContextId((input.staffCareerAutonomyStates ?? []).map(createStaffCareerAutonomyState)),
    staffCareerRequestsById: indexById((input.staffCareerRequests ?? []).map(createStaffCareerRequest), 'Staff career request'),
    staffPoliticalCasesById: indexById((input.staffPoliticalCases ?? []).map(createStaffPoliticalCase), 'Staff political case'),
    relationshipsByKey: Object.freeze({ ...(input.relationshipsByKey ?? {}) }),
    personalitiesByPersonId: peopleProfiles([...input.coaches, ...input.players, ...(input.staffPeople ?? [])], input.personalitiesByPersonId, generatePersonality),
    moraleByPersonId: peopleProfiles([...input.coaches, ...input.players, ...(input.staffPeople ?? [])], input.moraleByPersonId, createMoraleProfile),
    inboxItemsById: Object.freeze({ ...(input.inboxItemsById ?? {}) }), newsItemsById: Object.freeze({ ...(input.newsItemsById ?? {}) }),
    trainingPlansByTeamId: Object.freeze(Object.fromEntries(input.teams.map((team)=>[team.id,input.trainingPlansByTeamId?.[team.id]??createDefaultTrainingPlan(team.id)]))), individualTrainingPlansByPlayerId: Object.freeze(Object.fromEntries(Object.entries(input.individualTrainingPlansByPlayerId??{}).map(([id,plan])=>[id,createIndividualTrainingPlan(plan)]))), trainingResponsibilitiesByTeamId: Object.freeze(Object.fromEntries(Object.entries(input.trainingResponsibilitiesByTeamId??{}).map(([id,responsibilities])=>[id,Object.freeze({...responsibilities})]))), tacticalPlansByTeamId:Object.freeze(Object.fromEntries(input.teams.map(team=>[team.id,input.tacticalPlansByTeamId?.[team.id]??createDefaultTeamTacticalPlan(team.id)]))),lineupsByTeamId:Object.freeze(Object.fromEntries(input.teams.map(team=>[team.id,input.lineupsByTeamId?.[team.id]??createDefaultTeamLineup(team.id)]))),rotationPlansByTeamId:Object.freeze({...input.rotationPlansByTeamId}),gamePlansByKey:Object.freeze({...input.gamePlansByKey}), savedPlaysById:Object.freeze(Object.fromEntries(Object.entries(input.savedPlaysById??{}).map(([id,play])=>[id,createSavedPlay(play)]))), playbooksById:Object.freeze(Object.fromEntries(Object.entries(input.playbooksById??{}).map(([id,playbook])=>[id,createPlaybook(playbook)]))), trainingSessionsById:Object.freeze({...(input.trainingSessionsById??{})}),
    scheduledTrainingSessionsById: Object.freeze(Object.fromEntries(Object.entries(input.scheduledTrainingSessionsById ?? {}).map(([id, session]) => [id, createScheduledTrainingSession(session)]))),
    userTrainingModulesById: Object.freeze(Object.fromEntries(Object.entries(input.userTrainingModulesById ?? {}).map(([id, module]) => [id, createUserTrainingModule(module)]))),
    developmentStimulusByPlayerId:Object.freeze(Object.fromEntries(input.players.map((player)=>[player.id,input.developmentStimulusByPlayerId?.[player.id]??{playerId:player.id,byRating:{...EMPTY_DEVELOPMENT_STIMULUS}}]))), careerFatigueByPlayerId:Object.freeze(Object.fromEntries(input.players.map((player)=>[player.id,clampCareerFatigue(input.careerFatigueByPlayerId?.[player.id]??0)]))),
    teamCohesionByTeamId: Object.freeze(Object.fromEntries(input.teams.map((team) => [team.id, clampTeamCohesion(input.teamCohesionByTeamId?.[team.id] ?? 50)]))),
    promotionRelegationResolutionsById: indexById(input.promotionRelegationResolutions ?? [], 'Promotion/relegation resolution'),
    draftsById: indexById(input.drafts ?? [], 'Draft'),
    draftPicksById: indexById(input.draftPicks ?? [], 'Draft pick'),
    salaryRulesBySeasonId: Object.freeze({ ...(input.salaryRulesBySeasonId ?? {}) }),
    salaryExceptionsById: indexById(input.salaryExceptions ?? [], 'Salary exception'),
    deadMoneyChargesById: indexById(input.deadMoneyCharges ?? [], 'Dead money charge'),
    tradeRulesBySeasonId: Object.freeze({ ...(input.tradeRulesBySeasonId ?? {}) }),
    playerRightsById: indexById(input.playerRights ?? [], 'Player rights'),
    futureDraftPickRightsById: indexById(input.futureDraftPickRights ?? [], 'Future draft pick right'),
    draftPickSwapRightsById: indexById(input.draftPickSwapRights ?? [], 'Draft pick swap right'),
    retainedSalaryObligationsById: indexById(input.retainedSalaryObligations ?? [], 'Retained salary obligation'),
    tradeHistoryById: indexById(input.tradeHistory ?? [], 'Trade record'),
    recruitingCyclesById: indexById(input.recruitingCycles ?? [], 'Recruiting cycle'),
    recruitProfilesById: indexById(input.recruitProfiles ?? [], 'Recruit profile'),
    recruitingInterests: Object.freeze([...(input.recruitingInterests ?? [])]),
    recruitingBoards: Object.freeze([...(input.recruitingBoards ?? [])]),
    recruitingCapacityByProgramId: Object.freeze({ ...(input.recruitingCapacityByProgramId ?? {}) }),
    recruitingActionHistoryById: indexById(input.recruitingActionHistory ?? [], 'Recruiting action'),
    recruitingOffersById: indexById(input.recruitingOffers ?? [], 'Recruiting offer'),
    recruitingVisitsById: indexById(input.recruitingVisits ?? [], 'Recruiting visit'),
    recruitingCommitmentsById: indexById(input.recruitingCommitments ?? [], 'Recruiting commitment'),
    recruitSigningsById: indexById(input.recruitSignings ?? [], 'Recruit signing'),
    eligibilityRulesByEcosystemId: Object.freeze({ ...(input.eligibilityRulesByEcosystemId ?? {}) }),
    eligibilityProfilesById: indexById(input.eligibilityProfiles ?? [], 'Eligibility profile'),
    eligibilityRestrictionsById: indexById(input.eligibilityRestrictions ?? [], 'Eligibility restriction'),
    academicRulesByEcosystemId: Object.freeze({ ...(input.academicRulesByEcosystemId ?? {}) }), academicProfilesById: indexById(input.academicProfiles ?? [], 'Academic profile'), academicTermRecordsById: indexById(input.academicTermRecords ?? [], 'Academic term record'), academicSupportPlansById: indexById(input.academicSupportPlans ?? [], 'Academic support plan'),
    nilRulesByEcosystemId:Object.freeze({...(input.nilRulesByEcosystemId??{})}),nilProfilesById:indexById(input.nilProfiles??[],'NIL profile'),nilOpportunitiesById:indexById(input.nilOpportunities??[],'NIL opportunity'),nilDealsById:indexById(input.nilDeals??[],'NIL deal'),collectivesById:indexById(input.collectives??[],'Collective'),
    boostersById:indexById(input.boosters??[],'Booster'),boosterContributionsById:indexById(input.boosterContributions??[],'Booster contribution'),boosterRequestsById:indexById(input.boosterRequests??[],'Booster request'),
    enforcementRulesByEcosystemId: Object.freeze({ ...(input.enforcementRulesByEcosystemId ?? {}) }), violationsById: indexById(input.violations ?? [], 'Violation'), investigationsById: indexById(input.investigations ?? [], 'Investigation'), findingsById: indexById(input.findings ?? [], 'Finding'), sanctionsById: indexById(input.sanctions ?? [], 'Sanction'), programComplianceByProgramId: Object.freeze({ ...(input.programComplianceByProgramId ?? {}) }),
    ecosystemTransitionsById:indexById(input.ecosystemTransitions??[],'Ecosystem transition'),
    memoriesById:indexById((input.memories??[]).map(createMemory),'Memory'),
    narrativesById:indexById((input.narratives??[]).map(createNarrativeThread),'Narrative'),
    mediaOpportunitiesById: Object.freeze({ ...(input.mediaOpportunitiesById ?? {}) }),
    mediaInteractionsById: Object.freeze({ ...(input.mediaInteractionsById ?? {}) }),
    mediaProfilesByCoachId: Object.freeze({ ...(input.mediaProfilesByCoachId ?? {}) }),
    boardStatesByTeamId: Object.freeze(Object.fromEntries(Object.entries(input.boardStatesByTeamId ?? {}).map(([teamId, state]) => [teamId, createBoardState(state)]))),
    coachLegacyByCoachId: Object.freeze({ ...(input.coachLegacyByCoachId ?? {}) }), coachAchievementsById: Object.freeze({ ...(input.coachAchievementsById ?? {}) }), coachTenuresById: Object.freeze({ ...(input.coachTenuresById ?? {}) }), coachTeamLegacyByKey: Object.freeze({ ...(input.coachTeamLegacyByKey ?? {}) }),
  }

  validateWorld(world)
  return world
}

/** Rebuilds through the canonical validator while preserving unrelated world state. */
export function updateGameWorld(world: GameWorld, patch: Partial<CreateGameWorldInput>): GameWorld {
  const remainingPatch = { ...patch } as Record<string, unknown>
  const worldPatch: Record<string, unknown> = {}

  for (const [inputKey, worldKey] of Object.entries(collectionPatchTargets)) {
    const value = remainingPatch[inputKey]
    if (value === undefined) continue
    delete remainingPatch[inputKey]
    worldPatch[worldKey] = collectionPatchIndexers[inputKey]!(value)
  }

  const patched = { ...world, ...remainingPatch, ...worldPatch } as GameWorld
  const updated = (worldPatch.coaches !== undefined || worldPatch.players !== undefined || worldPatch.staffPeopleById !== undefined)
    ? {
        ...patched,
        personalitiesByPersonId: peopleProfiles([...Object.values(patched.coaches), ...Object.values(patched.players), ...Object.values(patched.staffPeopleById)], patched.personalitiesByPersonId, generatePersonality),
        moraleByPersonId: peopleProfiles([...Object.values(patched.coaches), ...Object.values(patched.players), ...Object.values(patched.staffPeopleById)], patched.moraleByPersonId, createMoraleProfile),
      }
    : patched
  validateWorld(updated)
  return updated
}

const collectionPatchTargets: Readonly<Record<string, string>> = {
  countries: 'countries', coaches: 'coaches', players: 'players', teams: 'teams', competitions: 'competitions', ecosystems: 'ecosystems', conferences: 'conferencesById', seasons: 'seasons', games: 'games', matchStatLogs: 'matchStatLogsByGameId', seasonHistory: 'seasonHistoryBySeasonId', injuries: 'injuriesById', contracts: 'contractsById', teamFinances: 'teamFinancesByTeamId', playerTransactions: 'playerTransactionsById', playerKnowledge: 'playerKnowledgeById', evidence: 'evidenceById', scoutingAssignments: 'scoutingAssignmentsById', evaluatorReports: 'evaluatorReportsById', agents:'agentsById',agencies:'agenciesById',marketReality:'marketRealityByPlayerId',marketSignals:'marketSignalsById',negotiations:'negotiationsById',rolePromises:'rolePromisesById', staffPeople: 'staffPeopleById', teamStaffAssignments: 'teamStaffAssignmentsById', responsibilities: 'responsibilitiesById', delegationOutcomes: 'delegationOutcomesById', oppositionScoutingReports: 'oppositionScoutingReportsById', staffJobOpenings: 'staffJobOpeningsById', staffJobCandidacies: 'staffJobCandidaciesById', staffJobOffers: 'staffJobOffersById', staffContracts: 'staffContractsById', staffHumanContexts: 'staffHumanContextsById', staffHumanStates: 'staffHumanStatesByContextId', staffExpectationProfiles: 'staffExpectationProfilesByContextId', staffReactionRecords: 'staffReactionRecordsById', staffCultureStates: 'staffCultureStatesByScopeKey', staffUnitCohesionStates: 'staffUnitCohesionStatesByUnitKey', staffConflicts: 'staffConflictsById', staffCareerAutonomyStates: 'staffCareerAutonomyByContextId', staffCareerRequests: 'staffCareerRequestsById', staffPoliticalCases: 'staffPoliticalCasesById', promotionRelegationResolutions: 'promotionRelegationResolutionsById', drafts: 'draftsById', draftPicks: 'draftPicksById', salaryExceptions: 'salaryExceptionsById', deadMoneyCharges: 'deadMoneyChargesById', playerRights: 'playerRightsById', futureDraftPickRights: 'futureDraftPickRightsById', draftPickSwapRights: 'draftPickSwapRightsById', retainedSalaryObligations: 'retainedSalaryObligationsById', tradeHistory: 'tradeHistoryById', recruitingCycles: 'recruitingCyclesById', recruitProfiles: 'recruitProfilesById', recruitingActionHistory: 'recruitingActionHistoryById', recruitingOffers: 'recruitingOffersById', recruitingVisits: 'recruitingVisitsById', recruitingCommitments: 'recruitingCommitmentsById', recruitSignings: 'recruitSigningsById', eligibilityProfiles: 'eligibilityProfilesById', eligibilityRestrictions: 'eligibilityRestrictionsById', academicProfiles: 'academicProfilesById', academicTermRecords: 'academicTermRecordsById', academicSupportPlans: 'academicSupportPlansById', nilProfiles: 'nilProfilesById', nilOpportunities: 'nilOpportunitiesById', nilDeals: 'nilDealsById', collectives: 'collectivesById', boosters: 'boostersById', boosterContributions: 'boosterContributionsById', boosterRequests: 'boosterRequestsById', violations: 'violationsById', investigations: 'investigationsById', findings: 'findingsById', sanctions: 'sanctionsById', ecosystemTransitions:'ecosystemTransitionsById', memories:'memoriesById', narratives:'narrativesById',
}

const collectionPatchIndexers: Readonly<Record<string, (value: unknown) => unknown>> = {
  ...Object.fromEntries(Object.keys(collectionPatchTargets).map((key) => [key, (value: unknown) => indexById(value as readonly { readonly id: string }[], key)])),
  matchStatLogs: (value) => indexLogsByGameId(value as readonly MatchStatLog[]),
  seasonHistory: (value) => indexHistoryBySeasonId(value as readonly SeasonHistoryRecord[]),
  teamFinances: (value) => indexTeamFinances(value as readonly TeamFinances[]),
  marketReality: (value) => Object.freeze(Object.fromEntries((value as readonly MarketReality[]).map((item) => [item.playerId, item]))),
  staffHumanStates: (value) => indexHumanStatesByContextId(value as readonly StaffHumanState[]),
  staffExpectationProfiles: (value) => indexExpectationProfilesByContextId(value as readonly StaffExpectationProfile[]),
  staffCultureStates: (value) => indexCultureStatesByScopeKey(value as readonly StaffCultureState[]),
  staffUnitCohesionStates: (value) => indexUnitCohesionStatesByUnitKey(value as readonly StaffUnitCohesionState[]),
  staffCareerAutonomyStates: (value) => indexCareerAutonomyByContextId(value as readonly StaffCareerAutonomyState[]),
  staffConflicts: (value) => indexById(value as readonly StaffConflict[], 'Staff conflict'),
}

function validateWorld(world: GameWorld): void {
  requireEntity(world.seasons, world.currentSeasonId, 'Current season')
  requireEntity(world.coaches, world.userCoachId, 'User coach')

  for (const coach of Object.values(world.coaches)) {
    requireEntity(world.countries, coach.nationalityId, `Coach ${coach.id} nationality`)
  }

  for (const player of Object.values(world.players)) {
    requireEntity(world.countries, player.nationalityId, `Player ${player.id} nationality`)
    if (compareGameDates(player.bio.dateOfBirth, world.currentDate) >= 0) throw new GameWorldValidationError(`Player ${player.id} date of birth must be before current date`)
  }

  const rosteredPlayerIds = new Set<PlayerId>()
  const assignedCoachIds = new Set<CoachId>()

  for (const team of Object.values(world.teams)) {
    requireEntity(world.countries, team.countryId, `Team ${team.id} country`)

    for (const playerId of team.rosterPlayerIds) {
      const player = requireEntity(world.players, playerId, `Team ${team.id} roster`)
      if (player.gender !== team.gender) {
        throw new GameWorldValidationError(
          `Team ${team.id} has Player ${player.id} with a different gender`,
        )
      }
      if (rosteredPlayerIds.has(playerId)) {
        throw new GameWorldValidationError(`Player ${playerId} belongs to more than one team roster`)
      }
      rosteredPlayerIds.add(playerId)
    }

    if (team.coachId !== undefined) {
      requireEntity(world.coaches, team.coachId, `Team ${team.id} coach`)
      if (assignedCoachIds.has(team.coachId)) {
        throw new GameWorldValidationError(`Coach ${team.coachId} is assigned to more than one team`)
      }
      assignedCoachIds.add(team.coachId)
    }

    const lineup = world.lineupsByTeamId[team.id]
    if (lineup !== undefined) {
      try {
        validateTeamLineup(lineup, team.rosterPlayerIds)
      } catch (error) {
        throw new GameWorldValidationError(error instanceof Error ? error.message : `Team ${team.id} has an invalid lineup`)
      }
    }
  }

  const scheduledSessions = Object.values(world.scheduledTrainingSessionsById)
  for (const session of scheduledSessions) {
    requireEntity(world.teams, session.teamId, `Scheduled training session ${session.id} team`)
    if (session.playerId !== undefined) requireEntity(world.players, session.playerId, `Scheduled training session ${session.id} player`)
    const collision = findCollidingSession(session, scheduledSessions)
    if (collision !== undefined) throw new GameWorldValidationError(`Scheduled training session ${session.id} collides with session ${collision.id}`)
    const assigned = session.assignedStaffPersonIds
    if (assigned !== undefined) {
      if (new Set(assigned).size !== assigned.length) throw new GameWorldValidationError(`Scheduled training session ${session.id} has duplicate staff assignments`)
      for (const staffId of assigned) {
        requireEntity(world.staffPeopleById, staffId, `Scheduled training session ${session.id} staff`)
        const employment = world.staffEmploymentByStaffId[staffId]
        const assignment = Object.values(world.teamStaffAssignmentsById).some((item) => item.staffPersonId === staffId && item.teamId === session.teamId)
        if (employment?.status !== 'employed' || employment.teamId !== session.teamId || !assignment) throw new GameWorldValidationError(`Scheduled training session ${session.id} staff ${staffId} is not actively assigned to its team`)
      }
    }
  }

  for (const playbook of Object.values(world.playbooksById)) {
    for (const playId of playbook.playIds) requireEntity(world.savedPlaysById, playId, `Playbook ${playbook.id} play`)
  }

  for (const competition of Object.values(world.competitions)) {
    requireEntity(world.ecosystems, competition.ecosystemId, `Competition ${competition.id} ecosystem`)
    for (const teamId of competition.participantTeamIds) {
      const team = requireEntity(world.teams, teamId, `Competition ${competition.id} participant`)
      if (team.gender !== competition.gender) {
        throw new GameWorldValidationError(
          `Competition ${competition.id} has Team ${team.id} with a different gender`,
        )
      }
    }
  }

  for (const transition of Object.values(world.ecosystemTransitionsById)) {
    requireEntity(world.players, transition.playerId, `Ecosystem transition ${transition.id} player`)
    requireEntity(world.ecosystems, transition.fromEcosystemId, `Ecosystem transition ${transition.id} origin ecosystem`)
    requireEntity(world.ecosystems, transition.toEcosystemId, `Ecosystem transition ${transition.id} destination ecosystem`)
    if (transition.fromEcosystemId === transition.toEcosystemId) throw new GameWorldValidationError(`Ecosystem transition ${transition.id} must cross ecosystems`)
    if (transition.fromTeamId !== undefined) requireEntity(world.teams, transition.fromTeamId, `Ecosystem transition ${transition.id} origin team`)
    if (transition.toTeamId !== undefined) requireEntity(world.teams, transition.toTeamId, `Ecosystem transition ${transition.id} destination team`)
  }

  for (const conference of Object.values(world.conferencesById)) {
    createConference(conference)
    const ecosystem = requireEntity(world.ecosystems, conference.ecosystemId, `Conference ${conference.id} ecosystem`)
    if (ecosystem.kind !== 'ncaaLike') throw new GameWorldValidationError(`Conference ${conference.id} must belong to an NCAA-like ecosystem`)
  }
  const membershipKeys = new Set<string>()
  for (const membership of world.conferenceMemberships) {
    createConferenceMembership(membership); const conference = requireEntity(world.conferencesById, membership.conferenceId, 'Conference membership conference'); const season = requireEntity(world.seasons, membership.seasonId, 'Conference membership season'); const competition = requireEntity(world.competitions, season.competitionId, 'Conference membership competition')
    if (competition.ecosystemId !== conference.ecosystemId || !((season.participantTeamIds ?? competition.participantTeamIds).includes(membership.teamId)) || !membershipKeys.add(`${membership.seasonId}:${membership.teamId}`)) throw new GameWorldValidationError('Conference membership is invalid or not unique')
  }

  for (const ecosystem of Object.values(world.ecosystems)) {
    for (const tier of ecosystem.domesticTiers) requireEntity(world.competitions, tier.competitionId, `Domestic tier ${tier.level} competition`)
    for (const rule of ecosystem.tierMovementRules) {
      const upper = requireEntity(world.competitions, rule.upperCompetitionId, 'Tier movement upper competition'); const lower = requireEntity(world.competitions, rule.lowerCompetitionId, 'Tier movement lower competition')
      const upperTier = ecosystem.domesticTiers.find((tier) => tier.competitionId === upper.id); const lowerTier = ecosystem.domesticTiers.find((tier) => tier.competitionId === lower.id)
      if (upper.ecosystemId !== ecosystem.id || lower.ecosystemId !== ecosystem.id || upperTier === undefined || lowerTier === undefined || lowerTier.level !== upperTier.level + 1 || rule.exchangeCount > upper.participantTeamIds.length || rule.exchangeCount > lower.participantTeamIds.length) throw new GameWorldValidationError('Tier movement rule is invalid for ecosystem hierarchy')
    }
  }

  for (const season of Object.values(world.seasons)) {
    requireEntity(world.competitions, season.competitionId, `Season ${season.id} competition`)
    const participants = season.participantTeamIds ?? world.competitions[season.competitionId]!.participantTeamIds
    if (new Set(participants).size !== participants.length) throw new GameWorldValidationError(`Season ${season.id} has duplicate participants`)
    for (const teamId of participants) requireEntity(world.teams, teamId, `Season ${season.id} participant`)
  }

  for (const game of Object.values(world.games)) {
    const season = requireEntity(world.seasons, game.seasonId, `Game ${game.id} season`)
    const competition = requireEntity(world.competitions, game.competitionId, `Game ${game.id} competition`)
    const homeTeam = requireEntity(world.teams, game.homeTeamId, `Game ${game.id} home team`)
    const awayTeam = requireEntity(world.teams, game.awayTeamId, `Game ${game.id} away team`)

    if (season.competitionId !== competition.id) {
      throw new GameWorldValidationError(`Game ${game.id} competition does not match its season`)
    }
    const participants = season.participantTeamIds ?? competition.participantTeamIds
    if (!participants.includes(homeTeam.id)) {
      throw new GameWorldValidationError(`Game ${game.id} home Team ${homeTeam.id} is not a participant`)
    }
    if (!participants.includes(awayTeam.id)) {
      throw new GameWorldValidationError(`Game ${game.id} away Team ${awayTeam.id} is not a participant`)
    }
    if (homeTeam.gender !== competition.gender || awayTeam.gender !== competition.gender) {
      throw new GameWorldValidationError(`Game ${game.id} teams must match the competition gender`)
    }
    if (
      compareGameDates(game.date, season.startDate) < 0 ||
      compareGameDates(game.date, season.endDate) > 0
    ) {
      throw new GameWorldValidationError(`Game ${game.id} date is outside its season range`)
    }
  }
  const teamDates = new Set<string>()
  for (const game of Object.values(world.games)) for (const teamId of [game.homeTeamId, game.awayTeamId]) {
    const key = `${teamId}:${game.date}`
    if (teamDates.has(key)) throw new GameWorldValidationError(`Team ${teamId} has multiple Games on ${game.date}`)
    teamDates.add(key)
  }
  for (const log of Object.values(world.matchStatLogsByGameId)) validateMatchStatLog(world, log)
  for (const injury of Object.values(world.injuriesById)) validateInjury(world, injury)
  for (const contract of Object.values(world.contractsById)) { createPlayerContract(contract); requireEntity(world.players,contract.playerId,`Contract ${contract.id} Player`); requireEntity(world.teams,contract.teamId,`Contract ${contract.id} Team`) }
  for (const finances of Object.values(world.teamFinancesByTeamId)) { createTeamFinances(finances); requireEntity(world.teams,finances.teamId,`Team finances ${finances.teamId} Team`) }
  for (const transaction of Object.values(world.playerTransactionsById)) { requireEntity(world.players,transaction.playerId,`Transaction ${transaction.id} Player`); if(transaction.fromTeamId)requireEntity(world.teams,transaction.fromTeamId,`Transaction ${transaction.id} from Team`); if(transaction.toTeamId)requireEntity(world.teams,transaction.toTeamId,`Transaction ${transaction.id} to Team`); if(transaction.contractId)requireEntity(world.contractsById,transaction.contractId,`Transaction ${transaction.id} Contract`) }
  const pairs = new Set<string>(); for (const knowledge of Object.values(world.playerKnowledgeById)) { createPlayerKnowledge(knowledge); requireEntity(world.teams, knowledge.observerTeamId, 'Knowledge observer Team'); requireEntity(world.players, knowledge.subjectPlayerId, 'Knowledge subject Player'); const pair=`${knowledge.observerTeamId}:${knowledge.subjectPlayerId}`; if(pairs.has(pair)) throw new GameWorldValidationError('Duplicate Player knowledge observer and subject'); pairs.add(pair) }
  for (const knowledge of world.organizationKnowledge) { createOrganizationKnowledge(knowledge); requireEntity(world.players, knowledge.subjectPlayerId, 'Organization knowledge subject Player') }
  for (const evidence of Object.values(world.evidenceById)) { requireEntity(world.players, evidence.subjectPlayerId, 'Evidence subject Player') }
  for (const [staffId, profile] of Object.entries(world.evaluatorProfilesByStaffId) as [StaffPersonId, EvaluatorProfile][]) { requireEntity(world.staffPeopleById, staffId, 'Evaluator profile staff'); createEvaluatorProfile(profile) }
  for (const assignment of Object.values(world.scoutingAssignmentsById)) { requireEntity(world.players, assignment.subjectPlayerId, 'Scouting assignment subject Player'); requireEntity(world.staffPeopleById, assignment.evaluatorStaffId, 'Scouting assignment evaluator') }
  for (const report of Object.values(world.evaluatorReportsById)) { requireEntity(world.players, report.subjectPlayerId, 'Evaluator report subject Player'); requireEntity(world.staffPeopleById, report.evaluatorStaffId, 'Evaluator report evaluator'); for (const evidenceId of report.evidenceIds) requireEntity(world.evidenceById, evidenceId, 'Evaluator report Evidence') }
  for (const [organizationId, policy] of Object.entries(world.organizationEvaluationPoliciesById) as [OrganizationId, OrganizationEvaluationPolicy][]) { if (!Object.values(world.teams).some((team) => organizationIdForTeam(team.id) === organizationId) || Object.values(policy).some((value) => !Number.isInteger(value) || value < 0 || value > 100)) throw new GameWorldValidationError('Organization evaluation policy is invalid') }
  const assignedStaff = new Set<StaffPersonId>(); for (const person of Object.values(world.staffPeopleById)) createStaffPerson(person); for (const assignment of Object.values(world.teamStaffAssignmentsById)) { createTeamStaffAssignment(assignment); requireEntity(world.staffPeopleById, assignment.staffPersonId, 'Staff assignment person'); requireEntity(world.teams, assignment.teamId, 'Staff assignment team'); if (assignedStaff.has(assignment.staffPersonId)) throw new GameWorldValidationError('Staff person has multiple active assignments'); assignedStaff.add(assignment.staffPersonId) }
  const responsibilityKeys = new Set<string>()
  for (const responsibility of Object.values(world.responsibilitiesById)) {
    createResponsibility(responsibility)
    requireEntity(world.teams, responsibility.teamId, `Responsibility ${responsibility.id} Team`)
    const key = `${responsibility.teamId}:${responsibility.kind}`
    if (responsibilityKeys.has(key)) throw new GameWorldValidationError(`Team ${responsibility.teamId} has more than one Responsibility of kind ${responsibility.kind}`)
    responsibilityKeys.add(key)
    if (responsibility.holderStaffId !== undefined) {
      const holder = requireEntity(world.staffPeopleById, responsibility.holderStaffId, `Responsibility ${responsibility.id} holder`)
      const holderAssignment = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.staffPersonId === responsibility.holderStaffId)
      if (holderAssignment === undefined || holderAssignment.teamId !== responsibility.teamId) throw new GameWorldValidationError(`Responsibility ${responsibility.id} holder is not on Team ${responsibility.teamId}`)
      const result = validateResponsibilityAssignment(responsibility.kind, responsibility.mode, holderAssignment.role, holder)
      if (!result.ok) throw new GameWorldValidationError(`Responsibility ${responsibility.id} holder is ineligible: ${result.reason}`)
    } else {
      const result = validateResponsibilityAssignment(responsibility.kind, responsibility.mode, undefined, undefined)
      if (!result.ok) throw new GameWorldValidationError(`Responsibility ${responsibility.id} is invalid: ${result.reason}`)
    }
  }
  for (const outcome of Object.values(world.delegationOutcomesById)) {
    createDelegationOutcome(outcome)
    requireEntity(world.responsibilitiesById, outcome.responsibilityId, `Delegation outcome ${outcome.id} Responsibility`)
    requireEntity(world.staffPeopleById, outcome.staffId, `Delegation outcome ${outcome.id} Staff`)
  }
  for (const context of Object.values(world.staffHumanContextsById)) {
    createStaffHumanContext(context)
    requireEntity(world.staffPeopleById, context.staffId, `Staff human context ${context.id} Staff`)
    requireEntity(world.teams, context.teamId, `Staff human context ${context.id} Team`)
  }
  for (const state of Object.values(world.staffCareerAutonomyByContextId)) {
    createStaffCareerAutonomyState(state)
    const context = requireEntity(world.staffHumanContextsById, state.contextId, `Staff career autonomy ${state.contextId} context`)
    if (context.staffId !== state.staffId || context.teamId !== state.teamId) throw new GameWorldValidationError(`Staff career autonomy ${state.contextId} does not match its employment context`)
  }
  for (const request of Object.values(world.staffCareerRequestsById)) {
    createStaffCareerRequest(request)
    const context = requireEntity(world.staffHumanContextsById, request.contextId, `Staff career request ${request.id} context`)
    if (context.staffId !== request.staffId || context.teamId !== request.teamId) throw new GameWorldValidationError(`Staff career request ${request.id} does not match its context`)
    if (request.status === 'OPEN' && context.endedOn !== undefined) throw new GameWorldValidationError(`Open Staff career request ${request.id} has ended context`)
  }
  for (const politicalCase of Object.values(world.staffPoliticalCasesById)) {
    createStaffPoliticalCase(politicalCase)
    requireEntity(world.teams, politicalCase.teamId, `Staff political case ${politicalCase.id} Team`)
    if (politicalCase.subjectStaffId !== undefined) requireEntity(world.staffPeopleById, politicalCase.subjectStaffId, `Staff political case ${politicalCase.id} Staff`)
  }
  const openCareerRequests = new Set<string>()
  for (const request of Object.values(world.staffCareerRequestsById)) if (request.status === 'OPEN') {
    const key = `${request.contextId}:${request.kind}:${request.targetRoleId ?? request.targetResponsibilityKind ?? ''}`
    if (openCareerRequests.has(key)) throw new GameWorldValidationError(`Duplicate open Staff career request ${key}`)
    openCareerRequests.add(key)
  }
  for (const state of Object.values(world.staffHumanStatesByContextId)) {
    createStaffHumanState(state)
    requireEntity(world.staffHumanContextsById, state.contextId, `Staff human state context`)
    requireEntity(world.staffPeopleById, state.staffId, `Staff human state ${state.contextId} Staff`)
  }
  for (const profile of Object.values(world.staffExpectationProfilesByContextId)) {
    createStaffExpectationProfile(profile)
    requireEntity(world.staffHumanContextsById, profile.contextId, `Staff expectation profile context`)
    requireEntity(world.staffPeopleById, profile.staffId, `Staff expectation profile ${profile.contextId} Staff`)
  }
  for (const reaction of Object.values(world.staffReactionRecordsById)) {
    createStaffReactionRecord(reaction)
    requireEntity(world.staffHumanContextsById, reaction.contextId, `Staff reaction record ${reaction.id} context`)
    requireEntity(world.staffPeopleById, reaction.staffId, `Staff reaction record ${reaction.id} Staff`)
  }
  // Wave 5C — shape validation only. Culture/Cohesion scope keys are opaque adapter strings
  // (Team-as-Organization / Team×Department proxies), so no cross-referential Team lookup is asserted:
  // a Team removal must never invalidate an otherwise well-formed save.
  for (const state of Object.values(world.staffCultureStatesByScopeKey)) createStaffCultureState(state)
  for (const state of Object.values(world.staffUnitCohesionStatesByUnitKey)) createStaffUnitCohesionState(state)
  for (const conflict of Object.values(world.staffConflictsById)) createStaffConflict(conflict)
  const oppositionReportKeys = new Set<string>()
  for (const report of Object.values(world.oppositionScoutingReportsById)) {
    createOppositionScoutingReport(report)
    if (report.id !== oppositionScoutingReportId(report.teamId, report.gameId)) throw new GameWorldValidationError(`Opposition scouting report ${report.id} id does not match its (team, game) identity`)
    const key = `${report.teamId}:${report.gameId}`
    if (oppositionReportKeys.has(key)) throw new GameWorldValidationError(`Team ${report.teamId} has more than one Opposition scouting report for Game ${report.gameId}`)
    oppositionReportKeys.add(key)
    requireEntity(world.teams, report.teamId, `Opposition scouting report ${report.id} Team`)
    requireEntity(world.teams, report.opponentTeamId, `Opposition scouting report ${report.id} opponent Team`)
    const game = requireEntity(world.games, report.gameId, `Opposition scouting report ${report.id} Game`)
    if (!((game.homeTeamId === report.teamId && game.awayTeamId === report.opponentTeamId) || (game.awayTeamId === report.teamId && game.homeTeamId === report.opponentTeamId))) throw new GameWorldValidationError(`Opposition scouting report ${report.id} team/opponent do not match Game ${report.gameId} participants`)
    requireEntity(world.staffPeopleById, report.authoredByStaffId, `Opposition scouting report ${report.id} author`)
    const authorAssignment = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.staffPersonId === report.authoredByStaffId)
    if (authorAssignment === undefined || authorAssignment.teamId !== report.teamId) throw new GameWorldValidationError(`Opposition scouting report ${report.id} author is not Staff assigned to Team ${report.teamId}`)
    const opponentRoster = new Set(world.teams[report.opponentTeamId]!.rosterPlayerIds)
    for (const playerId of report.flaggedPlayerIds) if (!opponentRoster.has(playerId)) throw new GameWorldValidationError(`Opposition scouting report ${report.id} flagged Player ${playerId} is not on opponent Team ${report.opponentTeamId}'s roster`)
  }
  for (const [coachId, profile] of Object.entries(world.coachProfessionalProfilesByCoachId) as [CoachId, StaffProfessionalProfile][]) { requireEntity(world.coaches, coachId, 'Coach professional profile'); createStaffProfessionalProfile(profile) }
  for (const [coachId, profile] of Object.entries(world.coachRpgProfilesByCoachId) as [CoachId, CoachRpgProfile][]) { requireEntity(world.coaches, coachId, 'Coach RPG profile'); createCoachRpgProfile(profile) }
  for (const [coachId, profile] of Object.entries(world.coachFinancesByCoachId) as [CoachId, CoachFinanceProfile][]) { requireEntity(world.coaches, coachId, 'Coach finance profile'); createCoachFinanceProfile(profile) }
  for (const [coachId, profile] of Object.entries(world.coachReputationProfilesByCoachId) as [CoachId, CoachReputationProfile][]) { requireEntity(world.coaches, coachId, 'Coach reputation profile'); createCoachReputationProfile(profile) }
  for (const memory of Object.values(world.memoriesById)) validateMemory(world, memory)
  for (const narrative of Object.values(world.narrativesById)) createNarrativeThread(narrative)
  for (const [key, profile] of Object.entries(world.relationshipsByKey)) {
    validateRelationshipProfile(profile)
    if (key !== relationshipKey(profile.sourceId, profile.targetId)) throw new GameWorldValidationError(`Relationship key does not match people: ${key}`)
    if (!hasRelationshipPerson(world, profile.sourceId) || !hasRelationshipPerson(world, profile.targetId)) throw new GameWorldValidationError(`Relationship references missing person: ${key}`)
  }
  for (const [coachId, employment] of Object.entries(world.coachEmploymentByCoachId) as [CoachId, CoachEmployment][]) {
    requireEntity(world.coaches, coachId, 'Coach employment')
    createCoachEmployment(employment)
    const assignedTeam = Object.values(world.teams).find((team) => team.coachId === coachId)
    if (employment.status === 'employed' && (assignedTeam === undefined || employment.teamId !== assignedTeam.id)) throw new GameWorldValidationError(`Coach ${coachId} employment does not match Team assignment`)
    if (employment.status === 'unemployed' && assignedTeam !== undefined) throw new GameWorldValidationError(`Coach ${coachId} employment does not match Team assignment`)
  }
  for (const [coachId, history] of Object.entries(world.coachCareerHistoryByCoachId) as [CoachId, readonly CoachCareerHistoryEntry[]][]) for (let index = 0; index < history.length; index += 1) { const entry = history[index]!; if (entry.coachId !== coachId || (entry.kind === 'appointment' && entry.reason !== 'initialAppointment' && entry.reason !== 'hired') || (entry.kind === 'departure' && entry.reason !== 'fired' && entry.reason !== 'acceptedOtherJob')) throw new GameWorldValidationError(`Coach career history does not match Coach ${coachId}`); if (index > 0 && compareGameDates(history[index - 1]!.date, entry.date) > 0) throw new GameWorldValidationError(`Coach career history is not ordered for Coach ${coachId}`); requireEntity(world.teams, entry.teamId, 'Coach career history Team') }
  for (const opening of Object.values(world.coachJobOpeningsById)) { createCoachJobOpening(opening); requireEntity(world.teams, opening.teamId, 'Coach job opening Team') }
  for (const candidacy of Object.values(world.coachJobCandidaciesById)) { requireEntity(world.coaches, candidacy.coachId, 'Coach candidacy Coach'); requireEntity(world.coachJobOpeningsById, candidacy.jobOpeningId, 'Coach candidacy opening') }
  for (const [candidacyId, interview] of Object.entries(world.coachInterviewsByCandidacyId) as [CoachJobCandidacyId, CoachInterview][]) if (interview.candidacyId !== candidacyId || world.coachJobCandidaciesById[candidacyId] === undefined) throw new GameWorldValidationError(`Coach interview references missing candidacy ${candidacyId}`)
  for (const offer of Object.values(world.coachJobOffersById)) { requireEntity(world.coaches, offer.coachId, 'Coach offer Coach'); requireEntity(world.teams, offer.teamId, 'Coach offer Team'); requireEntity(world.coachJobOpeningsById, offer.jobOpeningId, 'Coach offer opening') }
  for (const [staffId, employment] of Object.entries(world.staffEmploymentByStaffId) as [StaffPersonId, StaffEmployment][]) {
    requireEntity(world.staffPeopleById, staffId, 'Staff employment')
    createStaffEmployment(employment)
    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.staffPersonId === staffId)
    if (employment.status === 'employed') {
      if (assignment === undefined || assignment.teamId !== employment.teamId || assignment.role !== employment.roleId) throw new GameWorldValidationError(`Staff ${staffId} employment does not match Team assignment`)
    } else if (assignment !== undefined) throw new GameWorldValidationError(`Staff ${staffId} employment does not match Team assignment`)
  }
  for (const [staffId, history] of Object.entries(world.staffCareerHistoryByStaffId) as [StaffPersonId, readonly StaffCareerHistoryEntry[]][]) for (let index = 0; index < history.length; index += 1) {
    const entry = history[index]!
    if (entry.staffId !== staffId) throw new GameWorldValidationError(`Staff career history does not match Staff ${staffId}`)
    if (entry.kind === 'appointment' && !(['initialAppointment', 'hired', 'promoted', 'reassigned'] as const).includes(entry.reason)) throw new GameWorldValidationError(`Staff career history has an invalid appointment reason for Staff ${staffId}`)
    if (entry.kind === 'departure' && !(['fired', 'resigned', 'acceptedOtherJob', 'retired'] as const).includes(entry.reason)) throw new GameWorldValidationError(`Staff career history has an invalid departure reason for Staff ${staffId}`)
    if (index > 0 && compareGameDates(history[index - 1]!.date, entry.date) > 0) throw new GameWorldValidationError(`Staff career history is not ordered for Staff ${staffId}`)
    requireEntity(world.teams, entry.teamId, 'Staff career history Team')
    if (entry.kind === 'appointment') staffRoleDefinition(entry.roleId) // throws RangeError if unknown
  }
  for (const opening of Object.values(world.staffJobOpeningsById)) { createStaffJobOpening(opening); requireEntity(world.teams, opening.teamId, `Staff job opening ${opening.id} Team`); staffRoleDefinition(opening.roleId) }
  const staffJobOpeningOpenKeys = new Set<string>()
  for (const opening of Object.values(world.staffJobOpeningsById)) {
    if (opening.status !== 'open') continue
    const key = `${opening.teamId}:${opening.roleId}`
    if (staffJobOpeningOpenKeys.has(key)) throw new GameWorldValidationError(`Team ${opening.teamId} has more than one open Staff job opening for role ${opening.roleId}`)
    staffJobOpeningOpenKeys.add(key)
  }
  for (const candidacy of Object.values(world.staffJobCandidaciesById)) { requireEntity(world.staffPeopleById, candidacy.staffId, `Staff candidacy ${candidacy.id} Staff`); requireEntity(world.staffJobOpeningsById, candidacy.jobOpeningId, `Staff candidacy ${candidacy.id} opening`); if (candidacy.origin !== undefined && candidacy.origin !== 'teamIdentified' && candidacy.origin !== 'staffApplied') throw new GameWorldValidationError(`Staff candidacy ${candidacy.id} has invalid origin`) }
  for (const [candidacyId, interview] of Object.entries(world.staffInterviewsByCandidacyId) as [StaffJobCandidacyId, StaffInterview][]) if (interview.candidacyId !== candidacyId || world.staffJobCandidaciesById[candidacyId] === undefined) throw new GameWorldValidationError(`Staff interview references missing candidacy ${candidacyId}`)
  for (const offer of Object.values(world.staffJobOffersById)) {
    requireEntity(world.staffPeopleById, offer.staffId, `Staff offer ${offer.id} Staff`)
    requireEntity(world.teams, offer.teamId, `Staff offer ${offer.id} Team`)
    const opening = requireEntity(world.staffJobOpeningsById, offer.jobOpeningId, `Staff offer ${offer.id} opening`)
    // Full semantic consistency (Issue #19 review Blocker 6): an offer must genuinely belong to the
    // opening it references (same Team) and to a real candidacy for the same (opening, Staff) pair
    // — never a combination the state machine could not have legitimately produced.
    if (opening.teamId !== offer.teamId) throw new GameWorldValidationError(`Staff offer ${offer.id} Team does not match its opening's Team`)
    const candidacy = Object.values(world.staffJobCandidaciesById).find((item) => item.jobOpeningId === offer.jobOpeningId && item.staffId === offer.staffId)
    if (candidacy === undefined) throw new GameWorldValidationError(`Staff offer ${offer.id} has no matching Staff candidacy for the same opening and Staff`)
    // Issue #19 review Blocker 2: the offer's status must be one the state machine could actually
    // have produced together with its candidacy's current status — see the centralized
    // `isStaffOfferCandidacyStateConsistent` matrix.
    if (!isStaffOfferCandidacyStateConsistent(offer.status, candidacy.status)) throw new GameWorldValidationError(`Staff offer ${offer.id} status ${offer.status} is inconsistent with its Staff candidacy ${candidacy.id} status ${candidacy.status}`)
  }
  const staffPendingOfferKeys = new Set<StaffPersonId>()
  for (const offer of Object.values(world.staffJobOffersById)) {
    if (offer.status !== 'pending') continue
    if (staffPendingOfferKeys.has(offer.staffId)) throw new GameWorldValidationError(`Staff ${offer.staffId} has more than one pending Staff job offer`)
    staffPendingOfferKeys.add(offer.staffId)
  }
  const staffActiveContractKeys = new Set<StaffPersonId>()
  for (const contract of Object.values(world.staffContractsById)) {
    createStaffContract(contract)
    requireEntity(world.staffPeopleById, contract.staffId, `Staff contract ${contract.id} Staff`)
    requireEntity(world.teams, contract.teamId, `Staff contract ${contract.id} Team`)
    // Active-on-the-CURRENT-date, via the single canonical `isStaffContractActiveOn` semantics —
    // never `termination === undefined` alone, which would wrongly treat a lapsed (past-expiresOn)
    // contract as active and a scheduled-but-not-yet-effective termination as inactive.
    if (isStaffContractActiveOn(contract, world.currentDate)) {
      if (staffActiveContractKeys.has(contract.staffId)) throw new GameWorldValidationError(`Staff ${contract.staffId} has more than one active Staff contract`)
      staffActiveContractKeys.add(contract.staffId)
      const employment = world.staffEmploymentByStaffId[contract.staffId]
      if (employment?.status !== 'employed' || employment.teamId !== contract.teamId) throw new GameWorldValidationError(`Staff contract ${contract.id} does not match Staff ${contract.staffId} employment`)
    }
  }
  for (const [staffId, profile] of Object.entries(world.staffReputationProfilesByStaffId) as [StaffPersonId, StaffReputationProfile][]) { requireEntity(world.staffPeopleById, staffId, 'Staff reputation profile'); createStaffReputationProfile(profile) }
  for (const history of Object.values(world.seasonHistoryBySeasonId)) validateSeasonHistory(world, history)
  for (const resolution of Object.values(world.promotionRelegationResolutionsById)) validatePromotionRelegationResolution(world, resolution)
  for (const draft of Object.values(world.draftsById)) validateDraft(world, draft)
  for (const pick of Object.values(world.draftPicksById)) validateDraftPick(world, pick)
  for (const [seasonId, rules] of Object.entries(world.salaryRulesBySeasonId) as [SeasonId, SalaryRules][]) { requireEntity(world.seasons, seasonId, 'Salary rules season'); createSalaryRules(rules); if (rules.seasonId !== seasonId) throw new GameWorldValidationError('Salary rules season does not match key') }
  for (const exception of Object.values(world.salaryExceptionsById)) { createTeamSalaryException(exception); requireEntity(world.teams, exception.teamId, 'Salary exception Team'); requireEntity(world.seasons, exception.seasonId, 'Salary exception season') }
  for (const charge of Object.values(world.deadMoneyChargesById)) { createDeadMoneyCharge(charge); requireEntity(world.teams, charge.teamId, 'Dead money Team'); requireEntity(world.seasons, charge.seasonId, 'Dead money season') }
  for (const [seasonId, rules] of Object.entries(world.tradeRulesBySeasonId) as [SeasonId, TradeRules][]) { requireEntity(world.seasons, seasonId, 'Trade rules season'); createTradeRules(rules); if (rules.seasonId !== seasonId) throw new GameWorldValidationError('Trade rules season does not match key'); requireEntity(world.ecosystems, rules.ecosystemId, 'Trade rules ecosystem') }
  for (const rights of Object.values(world.playerRightsById)) { createPlayerRights(rights); requireEntity(world.players, rights.playerId, 'Player rights Player'); requireEntity(world.teams, rights.ownerTeamId, 'Player rights Team'); requireEntity(world.ecosystems, rights.ecosystemId, 'Player rights ecosystem') }
  for (const right of Object.values(world.futureDraftPickRightsById)) { createFutureDraftPickRight(right); requireEntity(world.teams, right.originalTeamId, 'Future pick original Team'); requireEntity(world.teams, right.ownerTeamId, 'Future pick owner Team'); requireEntity(world.ecosystems, right.ecosystemId, 'Future pick ecosystem'); if (right.conditionalRecipientTeamId !== undefined) requireEntity(world.teams, right.conditionalRecipientTeamId, 'Future pick conditional Team') }
  for (const right of Object.values(world.draftPickSwapRightsById)) { createDraftPickSwapRight(right); requireEntity(world.teams, right.holderTeamId, 'Swap right holder Team'); requireEntity(world.teams, right.counterpartTeamId, 'Swap right counterpart Team'); requireEntity(world.ecosystems, right.ecosystemId, 'Swap right ecosystem') }
  for (const obligation of Object.values(world.retainedSalaryObligationsById)) { createRetainedSalaryObligation(obligation); requireEntity(world.players, obligation.playerId, 'Retained salary Player'); requireEntity(world.teams, obligation.retainingTeamId, 'Retained salary retaining Team'); requireEntity(world.teams, obligation.receivingTeamId, 'Retained salary receiving Team'); requireEntity(world.seasons, obligation.seasonId, 'Retained salary season') }
  for (const trade of Object.values(world.tradeHistoryById)) { createTradeRecord(trade); requireEntity(world.ecosystems, trade.ecosystemId, 'Trade ecosystem'); requireEntity(world.seasons, trade.seasonId, 'Trade season'); for (const teamId of trade.participantTeamIds) requireEntity(world.teams, teamId, 'Trade participant Team') }
}

function hasRelationshipPerson(world: GameWorld, id: string): boolean { return world.coaches[id as CoachId] !== undefined || world.players[id as PlayerId] !== undefined || world.staffPeopleById[id as StaffPersonId] !== undefined }

function validateInjury(world: GameWorld, injury: InjuryRecord): void {
  createInjury(injury)
  requireEntity(world.players, injury.playerId, `Injury ${injury.id} Player`)
  if (injury.sourceGameId !== undefined) { const game = requireEntity(world.games, injury.sourceGameId, `Injury ${injury.id} Game`); if (game.date !== injury.injuredOn) throw new GameWorldValidationError(`Injury ${injury.id} date does not match source Game`) }
  for (const other of Object.values(world.injuriesById)) if (other.id !== injury.id && other.playerId === injury.playerId && isInjuryActive(other, injury.injuredOn)) throw new GameWorldValidationError(`Injury ${injury.playerId} overlaps another injury`)
}

function selectLegacyCurrentSeasonId(seasons: Readonly<Record<SeasonId, Season>>): SeasonId {
  const ids = Object.keys(seasons) as SeasonId[]
  if (ids.length !== 1) throw new GameWorldValidationError('GameWorld requires currentSeasonId with multiple Seasons')
  return ids[0]!
}

function validateSeasonHistory(world: GameWorld, history: SeasonHistoryRecord): void {
  const season = requireEntity(world.seasons, history.seasonId, 'Season history season')
  const competition = requireEntity(world.competitions, history.competitionId, 'Season history competition')
  if (season.competitionId !== competition.id) throw new GameWorldValidationError(`Season history ${history.seasonId} competition does not match Season`)
  if (!Object.values(world.games).filter((game) => game.seasonId === season.id).every((game) => game.status === 'completed')) throw new GameWorldValidationError(`Season history ${history.seasonId} requires completed Games`)
  const participants = season.participantTeamIds ?? competition.participantTeamIds
  if (!participants.includes(history.championTeamId)) throw new GameWorldValidationError(`Season history ${history.seasonId} champion is not a participant`)
  if (history.finalStandings.length !== participants.length) throw new GameWorldValidationError(`Season history ${history.seasonId} standings must contain every participant`)
  const teams = new Set<TeamId>(); const positions = new Set<number>()
  for (const line of history.finalStandings) {
    if (!participants.includes(line.teamId) || teams.has(line.teamId)) throw new GameWorldValidationError(`Season history ${history.seasonId} has invalid standings teams`)
    if (!Number.isInteger(line.position) || line.position < 1 || line.position > participants.length || positions.has(line.position)) throw new GameWorldValidationError(`Season history ${history.seasonId} has invalid standings positions`)
    teams.add(line.teamId); positions.add(line.position)
  }
  if (history.finalStandings.find((line) => line.position === 1)?.teamId !== history.championTeamId) throw new GameWorldValidationError(`Season history ${history.seasonId} champion must be first`)
  const expected = calculateSeasonStandings(world, history.seasonId)
  if (history.finalStandings.length !== expected.length || history.finalStandings.some((line, index) => !sameStanding(line, expected[index]!))) throw new GameWorldValidationError(`Season history ${history.seasonId} standings do not match completed Games`)
}

function validatePromotionRelegationResolution(world: GameWorld, resolution: PromotionRelegationResolution): void {
  if (resolution.id !== `promotion-relegation:${resolution.upperSeasonId}:${resolution.lowerSeasonId}`) throw new GameWorldValidationError('Promotion/relegation resolution ID is invalid')
  const upper = requireEntity(world.seasons, resolution.upperSeasonId, 'Resolution upper season'); const lower = requireEntity(world.seasons, resolution.lowerSeasonId, 'Resolution lower season')
  if (upper.competitionId !== resolution.upperCompetitionId || lower.competitionId !== resolution.lowerCompetitionId) throw new GameWorldValidationError('Promotion/relegation resolution seasons do not match competitions')
  const ecosystem = Object.values(world.ecosystems).find((item) => item.tierMovementRules.some((rule) => rule.upperCompetitionId === resolution.upperCompetitionId && rule.lowerCompetitionId === resolution.lowerCompetitionId))
  const rule = ecosystem?.tierMovementRules.find((item) => item.upperCompetitionId === resolution.upperCompetitionId && item.lowerCompetitionId === resolution.lowerCompetitionId)
  if (rule === undefined || resolution.promotedTeamIds.length !== rule.exchangeCount || resolution.relegatedTeamIds.length !== rule.exchangeCount || new Set([...resolution.promotedTeamIds, ...resolution.relegatedTeamIds]).size !== rule.exchangeCount * 2) throw new GameWorldValidationError('Promotion/relegation resolution is invalid')
  const upperTeams = upper.participantTeamIds ?? world.competitions[upper.competitionId]!.participantTeamIds; const lowerTeams = lower.participantTeamIds ?? world.competitions[lower.competitionId]!.participantTeamIds
  if (resolution.relegatedTeamIds.some((id) => !upperTeams.includes(id)) || resolution.promotedTeamIds.some((id) => !lowerTeams.includes(id))) throw new GameWorldValidationError('Promotion/relegation resolution teams are not source participants')
}

function validateDraft(world: GameWorld, draft: Draft): void {
  const ecosystem = requireEntity(world.ecosystems, draft.ecosystemId, 'Draft ecosystem')
  const season = world.seasons[draft.sourceSeasonId]
  if (ecosystem.kind !== 'nbaLike' || season === undefined || world.competitions[season.competitionId]?.ecosystemId !== ecosystem.id || (draft.status !== 'scheduled' && world.seasonHistoryBySeasonId[draft.sourceSeasonId] === undefined) || !Number.isInteger(draft.rules.rounds) || draft.rules.rounds < 1 || !Number.isInteger(draft.rules.scheduledAfterDays) || draft.rules.scheduledAfterDays < 0 || draft.rules.orderMethod !== 'reverseStandings') throw new GameWorldValidationError('Draft is invalid')
  for (const playerId of draft.prospectPlayerIds) requireEntity(world.players, playerId, 'Draft prospect')
  if (new Set(draft.prospectPlayerIds).size !== draft.prospectPlayerIds.length) throw new GameWorldValidationError('Draft has duplicate prospects')
}
function validateDraftPick(world: GameWorld, pick: DraftPick): void {
  const draft = requireEntity(world.draftsById, pick.draftId, 'Draft pick draft')
  requireEntity(world.teams, pick.originalTeamId, 'Draft pick original Team'); requireEntity(world.teams, pick.ownerTeamId, 'Draft pick owner Team')
  if (!Number.isInteger(pick.round) || pick.round < 1 || pick.round > draft.rules.rounds || !Number.isInteger(pick.order) || pick.order < 1 || Object.values(world.draftPicksById).some((other) => other.id !== pick.id && other.draftId === pick.draftId && other.order === pick.order)) throw new GameWorldValidationError('Draft pick is invalid')
  if (pick.selection !== undefined) { if (!draft.prospectPlayerIds.includes(pick.selection.playerId) || pick.selection.teamId !== pick.ownerTeamId || Object.values(world.draftPicksById).some((other) => other.id !== pick.id && other.selection?.playerId === pick.selection!.playerId)) throw new GameWorldValidationError('Draft pick selection is invalid') }
}

function sameStanding(a: SeasonHistoryRecord['finalStandings'][number], b: SeasonHistoryRecord['finalStandings'][number]): boolean {
  return a.position === b.position && a.teamId === b.teamId && a.played === b.played && a.wins === b.wins && a.losses === b.losses && a.pointsFor === b.pointsFor && a.pointsAgainst === b.pointsAgainst && a.pointDifference === b.pointDifference
}

function validateMatchStatLog(world: GameWorld, log: MatchStatLog): void {
  const game = requireEntity(world.games, log.gameId, 'MatchStatLog game')
  if (game.status !== 'completed' || game.result === null) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} requires completed Game`)
  if (log.homeTeamId !== game.homeTeamId || log.awayTeamId !== game.awayTeamId || log.competitionId !== game.competitionId || log.seasonId !== game.seasonId || log.gameDate !== game.date) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} metadata does not match Game`)
  if (log.finalScore.home !== game.result.homeScore || log.finalScore.away !== game.result.awayScore) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} score does not match Game`)
  const players = new Set<PlayerId>()
  for (const line of log.playerLines) {
    requireEntity(world.players, line.playerId, `MatchStatLog ${log.gameId} Player`)
    if (players.has(line.playerId)) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} has duplicate Player ${line.playerId}`)
    players.add(line.playerId)
    if (!((line.teamId === log.homeTeamId && line.opponentTeamId === log.awayTeamId && line.isHome) || (line.teamId === log.awayTeamId && line.opponentTeamId === log.homeTeamId && !line.isHome))) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} has invalid Team context`)
  }
  const homeLines = log.playerLines.filter((line) => line.isHome)
  const awayLines = log.playerLines.filter((line) => !line.isHome)
  if (homeLines.reduce((sum, line) => sum + line.stats.points, 0) !== log.finalScore.home || awayLines.reduce((sum, line) => sum + line.stats.points, 0) !== log.finalScore.away) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} player points do not match score`)
  if (homeLines.filter((line) => line.started).length !== 5 || awayLines.filter((line) => line.started).length !== 5) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} requires five starters per Team`)
}

function indexById<Id extends string, Entity extends { readonly id: Id }>(
  entities: readonly Entity[],
  entityName: string,
): Readonly<Record<Id, Entity>> {
  const indexed = Object.create(null) as Record<Id, Entity>

  for (const entity of entities) {
    if (Object.hasOwn(indexed, entity.id)) {
      throw new GameWorldValidationError(`Duplicate ${entityName} ID: ${entity.id}`)
    }
    indexed[entity.id] = entity
  }

  return Object.freeze(indexed)
}

function indexHumanStatesByContextId(states: readonly StaffHumanState[]): Readonly<Record<StaffHumanContextId, StaffHumanState>> {
  const indexed = Object.create(null) as Record<StaffHumanContextId, StaffHumanState>
  for (const state of states) {
    if (Object.hasOwn(indexed, state.contextId)) throw new GameWorldValidationError(`Duplicate Staff human state for context ${state.contextId}`)
    indexed[state.contextId] = state
  }
  return Object.freeze(indexed)
}

function indexCultureStatesByScopeKey(states: readonly StaffCultureState[]): Readonly<Record<string, StaffCultureState>> {
  const indexed = Object.create(null) as Record<string, StaffCultureState>
  for (const state of states) {
    if (Object.hasOwn(indexed, state.scopeKey)) throw new GameWorldValidationError(`Duplicate Staff culture state for scope ${state.scopeKey}`)
    indexed[state.scopeKey] = state
  }
  return Object.freeze(indexed)
}

function indexUnitCohesionStatesByUnitKey(states: readonly StaffUnitCohesionState[]): Readonly<Record<string, StaffUnitCohesionState>> {
  const indexed = Object.create(null) as Record<string, StaffUnitCohesionState>
  for (const state of states) {
    if (Object.hasOwn(indexed, state.unitKey)) throw new GameWorldValidationError(`Duplicate Staff unit cohesion state for unit ${state.unitKey}`)
    indexed[state.unitKey] = state
  }
  return Object.freeze(indexed)
}

function indexExpectationProfilesByContextId(profiles: readonly StaffExpectationProfile[]): Readonly<Record<StaffHumanContextId, StaffExpectationProfile>> {
  const indexed = Object.create(null) as Record<StaffHumanContextId, StaffExpectationProfile>
  for (const profile of profiles) {
    if (Object.hasOwn(indexed, profile.contextId)) throw new GameWorldValidationError(`Duplicate Staff expectation profile for context ${profile.contextId}`)
    indexed[profile.contextId] = profile
  }
  return Object.freeze(indexed)
}

function indexCareerAutonomyByContextId(states: readonly StaffCareerAutonomyState[]): Readonly<Record<StaffHumanContextId, StaffCareerAutonomyState>> {
  const indexed = Object.create(null) as Record<StaffHumanContextId, StaffCareerAutonomyState>
  for (const state of states) {
    if (Object.hasOwn(indexed, state.contextId)) throw new GameWorldValidationError(`Duplicate Staff career autonomy state for context ${state.contextId}`)
    indexed[state.contextId] = state
  }
  return Object.freeze(indexed)
}

function indexLogsByGameId(logs: readonly MatchStatLog[]): Readonly<Record<GameId, MatchStatLog>> {
  const indexed = Object.create(null) as Record<GameId, MatchStatLog>
  for (const log of logs) {
    if (Object.hasOwn(indexed, log.gameId)) throw new GameWorldValidationError(`Duplicate MatchStatLog Game ID: ${log.gameId}`)
    indexed[log.gameId] = log
  }
  return Object.freeze(indexed)
}

function indexHistoryBySeasonId(history: readonly SeasonHistoryRecord[]): Readonly<Record<SeasonId, SeasonHistoryRecord>> {
  const indexed = Object.create(null) as Record<SeasonId, SeasonHistoryRecord>
  for (const record of history) {
    if (Object.hasOwn(indexed, record.seasonId)) throw new GameWorldValidationError(`Duplicate Season history ID: ${record.seasonId}`)
    indexed[record.seasonId] = record
  }
  return Object.freeze(indexed)
}

function indexTeamFinances(finances: readonly TeamFinances[]): Readonly<Record<TeamId, TeamFinances>> { const indexed = Object.create(null) as Record<TeamId, TeamFinances>; for (const finance of finances) { if (Object.hasOwn(indexed, finance.teamId)) throw new GameWorldValidationError(`Duplicate Team finances ID: ${finance.teamId}`); indexed[finance.teamId] = finance } return Object.freeze(indexed) }

function peopleProfiles<Value>(people: readonly { readonly id: string }[], supplied: Readonly<Record<string, Value>> | undefined, create: (id: string) => Value): Readonly<Record<string, Value>> { const result: Record<string, Value> = {}; for (const person of people) result[person.id] = supplied?.[person.id] ?? create(person.id); return Object.freeze(result) }
function organizationPolicies(teams: readonly Team[], supplied: Readonly<Record<OrganizationId, OrganizationEvaluationPolicy>> | undefined): Readonly<Record<OrganizationId, OrganizationEvaluationPolicy>> { const policies = Object.create(null) as Record<OrganizationId, OrganizationEvaluationPolicy>; for (const team of teams) { const id=organizationIdForTeam(team.id), policy=supplied?.[id]??deriveOrganizationEvaluationPolicy(id); for(const value of Object.values(policy))if(!Number.isInteger(value)||value<0||value>100)throw new GameWorldValidationError('Organization evaluation policy is invalid'); policies[id]=Object.freeze({...policy}) } return Object.freeze(policies) }

function coachReputationProfilesForCoaches(coaches: readonly Coach[], supplied: Readonly<Record<CoachId, CoachReputationProfile>> | undefined): Readonly<Record<CoachId, CoachReputationProfile>> {
  const profiles = Object.create(null) as Record<CoachId, CoachReputationProfile>
  for (const coach of coaches) profiles[coach.id] = supplied?.[coach.id] === undefined ? createDefaultCoachReputationProfile() : createCoachReputationProfile(supplied[coach.id])
  if (supplied !== undefined) for (const coachId of Object.keys(supplied) as CoachId[]) if (!coaches.some((coach) => coach.id === coachId)) throw new GameWorldValidationError(`Coach reputation profile references missing ID ${coachId}`)
  return Object.freeze(profiles)
}
function coachFinancesForCoaches(coaches: readonly Coach[], supplied: Readonly<Record<CoachId, CoachFinanceProfile>> | undefined): Readonly<Record<CoachId, CoachFinanceProfile>> {
  return Object.fromEntries(coaches.map((coach) => [coach.id, createCoachFinanceProfile(supplied?.[coach.id] ?? { coachId: coach.id })])) as Readonly<Record<CoachId, CoachFinanceProfile>>
}
function validateMemory(world: GameWorld, memory: MemoryRecord): void {
  createMemory(memory)
  const exists = (kind: string, id: string) => kind === 'coach' ? world.coaches[id as CoachId] !== undefined : kind === 'player' ? world.players[id as PlayerId] !== undefined : kind === 'staff' ? world.staffPeopleById[id as StaffPersonId] !== undefined : kind === 'team' ? world.teams[id as TeamId] !== undefined : kind === 'competition' ? world.competitions[id as CompetitionId] !== undefined : kind === 'game' ? world.games[id as GameId] !== undefined : kind === 'season' ? world.seasons[id as SeasonId] !== undefined : kind === 'contract' ? world.contractsById[id as ContractId] !== undefined : false
  if (!exists(memory.owner.kind, memory.owner.id) || memory.entityRefs.some((item) => !exists(item.kind, item.id))) throw new GameWorldValidationError(`Memory ${memory.id} references a missing entity`)
  if (memory.relationshipImpact !== undefined && (world.coaches[memory.relationshipImpact.targetPersonId as CoachId] === undefined && world.players[memory.relationshipImpact.targetPersonId as PlayerId] === undefined && world.staffPeopleById[memory.relationshipImpact.targetPersonId as StaffPersonId] === undefined)) throw new GameWorldValidationError(`Memory ${memory.id} relationship impact references a missing person`)
}

function coachCareerForCoaches(coaches: readonly Coach[], teams: readonly Team[], currentDate: GameDate, suppliedEmployment: Readonly<Record<CoachId, CoachEmployment>> | undefined, suppliedHistory: Readonly<Record<CoachId, readonly CoachCareerHistoryEntry[]>> | undefined): { readonly byCoachId: Readonly<Record<CoachId, CoachEmployment>>; readonly historyByCoachId: Readonly<Record<CoachId, readonly CoachCareerHistoryEntry[]>> } {
  const byCoachId = Object.create(null) as Record<CoachId, CoachEmployment>
  const historyByCoachId = Object.create(null) as Record<CoachId, readonly CoachCareerHistoryEntry[]>
  for (const coach of coaches) {
    const assignedTeam = teams.find((team) => team.coachId === coach.id)
    byCoachId[coach.id] = suppliedEmployment?.[coach.id] === undefined ? createCoachEmployment(assignedTeam === undefined ? { status: 'unemployed' } : { status: 'employed', teamId: assignedTeam.id, startedOn: currentDate }) : createCoachEmployment(suppliedEmployment[coach.id])
    historyByCoachId[coach.id] = Object.freeze([...(suppliedHistory?.[coach.id] ?? (assignedTeam === undefined ? [] : [{ kind: 'appointment', coachId: coach.id, teamId: assignedTeam.id, date: currentDate, reason: 'initialAppointment' }]))])
  }
  for (const supplied of [suppliedEmployment, suppliedHistory]) if (supplied !== undefined) for (const coachId of Object.keys(supplied) as CoachId[]) if (!coaches.some((coach) => coach.id === coachId)) throw new GameWorldValidationError(`Coach career references missing ID ${coachId}`)
  return { byCoachId: Object.freeze(byCoachId), historyByCoachId: Object.freeze(historyByCoachId) }
}

function requireEntity<Id extends string, Entity>(
  collection: Readonly<Record<Id, Entity>>,
  id: Id,
  referenceName: string,
): Entity {
  const entity = collection[id]
  if (entity === undefined) {
    throw new GameWorldValidationError(`${referenceName} references missing ID ${id}`)
  }

  return entity
}
