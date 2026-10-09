import type { EcosystemId, PlayerId, SeasonId, StaffPersonId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import type { BasketballPosition } from '@/domain/primitives'
export type RecruitingStatus='scheduled'|'open'|'signing'|'completed'
export type RecruitOrigin='preCollege'|'international'|'academy'|'transfer'
export type Priority='high'|'normal'|'low'
export type RecruitAction='contact'|'pitch'|'visit'|'offer'
export interface RecruitingRules{readonly poolSize:number;readonly maxSignings:number;readonly maxOffers:number;readonly periodCapacity:number;readonly staffDailyCapacity?:number;readonly costs:Readonly<Record<RecruitAction,number>>;readonly commitmentThreshold:number}
export type RecruitingCalendarPeriod = 'recruiting'|'contact'|'evaluation'|'quiet'|'dead'|'shutdown'
export type RecruitingProspectGroup = 'all'|'seniorOrTwoYear'|'other'|'highSchoolOrTwoYear'
export type RecruitingEvaluationEvent = 'scholastic'|'certifiedNonscholastic'|'internationalTeam'|'approvedIntercollegiate'|'collegeBasketballAcademy'
export type RecruitingVisitRestriction = 'julyUnofficialOnly'|'julyAllVisits'
export interface RecruitingCalendarRule {
  readonly id: string
  readonly kind: 'fixedMonthDay'|'relativeWeekday'|'championshipRelative'|'eventDefined'|'sourceException'
  readonly period: RecruitingCalendarPeriod
  readonly priority?: number
  readonly startMonth: number
  readonly startDay: number
  readonly startYearOffset: 0|1
  readonly endMonth: number
  readonly endDay: number
  readonly endYearOffset: 0|1
  readonly prospectGroup?: RecruitingProspectGroup
  readonly allowedEvaluationEvents?: readonly RecruitingEvaluationEvent[]
  readonly visitRestriction?: RecruitingVisitRestriction
  readonly communicationBlackout?: boolean
  readonly personDayException?: boolean
  readonly startTime?: string
  readonly endTime?: string
  readonly sourceNote?: string
}
export interface RecruitingCalendarWindow {
  readonly startsOn: GameDate
  readonly endsOn: GameDate
  readonly period: RecruitingCalendarPeriod
  readonly priority?: number
  readonly ruleId?: string
  readonly prospectGroup?: RecruitingProspectGroup
  readonly allowedEvaluationEvents?: readonly RecruitingEvaluationEvent[]
  readonly visitRestriction?: RecruitingVisitRestriction
  readonly communicationBlackout?: boolean
  readonly personDayException?: boolean
  readonly startTime?: string
  readonly endTime?: string
}
export interface RecruitingSigningWindowRules {
  readonly earlyPeriod: { readonly month: 11; readonly ordinalWeekday: 2; readonly weekday: 3; readonly durationDays: 7; readonly opensAt: '07:00'; readonly prospectGroup: 'seniorOrTwoYear'|'highSchoolOrTwoYear' }
  readonly regularPeriod: { readonly anchor: 'basketballChampionship'; readonly daysAfterAnchor: 7; readonly nextWeekday: 3; readonly opensAt: '07:00'; readonly finalDateAuthority: 'institutionalAidPolicy' }
}
export type RecruitingRulesetProvenance = 'OFFICIAL_SOURCE'|'SIMULATED_CARRY_FORWARD'|'TEST_FIXTURE'|'LEGACY'
export interface RecruitingCalendar {
  readonly version: string
  readonly source: string
  readonly authority?: 'sourceBacked'|'simulatedCarryForward'|'testFixture'|'legacy'
  readonly provenance?: RecruitingRulesetProvenance
  readonly sourceSeason?: string
  readonly derivedSeason?: string
  readonly basedOnRulesetId?: string
  readonly annualProspectOpportunityLimit?: number
  readonly annualPersonDayLimit?: number
  readonly maximumDesignatedOffCampusRecruiters?: number
  readonly maximumSimultaneousOffCampusRecruiters?: number
  readonly maximumOfficialVisitLodgingNights?: number
  readonly signingWindowRules?: RecruitingSigningWindowRules
  readonly institutionalRegularSigningEndOn?: GameDate
  readonly template?: { readonly id: string; readonly sourceSeason: string; readonly rules: readonly RecruitingCalendarRule[] }
  readonly windows: readonly RecruitingCalendarWindow[]
}
export interface RecruitingInstitutionalSigningPolicy { readonly programTeamId: TeamId; readonly seasonId: SeasonId; readonly finalAidSigningDate: GameDate; readonly provenance: 'INSTITUTIONAL_POLICY'|'SIMULATED_CARRY_FORWARD'; readonly basedOnSeasonId?: SeasonId }
export interface RecruitingCycle{readonly id:string;readonly ecosystemId:EcosystemId;readonly sourceSeasonId:SeasonId;readonly targetSeasonId:SeasonId;readonly opensOn:GameDate;readonly signingOn:GameDate;readonly closesOn:GameDate;readonly status:RecruitingStatus;readonly rules:RecruitingRules;readonly calendar?:RecruitingCalendar;readonly institutionalSigningPolicies?:readonly RecruitingInstitutionalSigningPolicy[];readonly staffDesignations?:readonly RecruitingStaffDesignation[]}
export interface RecruitingStaffDesignation { readonly id: string; readonly programTeamId: TeamId; readonly staffId: StaffPersonId; readonly recruitingCycleId: string; readonly context: 'offCampusRecruiter'; readonly effectiveFrom: GameDate; readonly effectiveTo: GameDate; readonly active: boolean; readonly source: 'programAssignment'|'staffAttritionReplacement'; readonly reason: string }
export const RECRUITING_PREFERENCE_DIMENSIONS = ['playingTime','roleClarity','coachTrust','familyTrust','development','winning','prestige','distance','academics','professionalPathway','internationalSupport'] as const
export type RecruitingPreferenceDimension = typeof RECRUITING_PREFERENCE_DIMENSIONS[number]
export interface RecruitingPreferenceProfile { readonly importance: Readonly<Record<RecruitingPreferenceDimension, number>>; readonly compensationSecurityImportance?: number; readonly dealbreakers: readonly RecruitingPreferenceDimension[]; readonly decisionStyle: 'early'|'deliberate'|'visitDriven'|'deadlineDriven'|'volatile'|'loyal'; readonly internationalNeeds?: readonly ('language'|'relocation'|'academicTransition'|'familyDistance')[] }
export type RecruitingKnowledgeBand = 'low'|'moderate'|'high'
export interface RecruitingIntel { readonly programTeamId: TeamId; readonly beliefs: Partial<Readonly<Record<RecruitingPreferenceDimension, RecruitingKnowledgeBand>>>; readonly confidence: number; readonly discoveredOn: GameDate; readonly sources: readonly string[] }
export type RecruitingRelationshipActor = 'headCoach'|'recruiter'|'program'
export interface RecruitingRelationship { readonly programTeamId: TeamId; readonly actor: RecruitingRelationshipActor; readonly actorId?: string; readonly familiarity: number; readonly rapport: number; readonly trust: number; readonly credibility: number; readonly updatedOn: GameDate }
export type RecruitingStakeholderRole = 'parent'|'guardian'|'family'|'schoolCoach'|'academyCoach'|'clubCoach'|'mentor'
export interface RecruitingStakeholder { readonly id: string; readonly role: RecruitingStakeholderRole; readonly influence: number; readonly preference: RecruitingPreferenceDimension; readonly attitudeByProgram: Readonly<Record<string, number>> }
export type RecruitingPromiseTopic = 'role'|'playingOpportunity'|'development'|'coachInvolvement'|'academicSupport'|'pathway'
export interface RecruitingPromise { readonly id: string; readonly programTeamId: TeamId; readonly topic: RecruitingPromiseTopic; readonly strength: 'statement'|'expectation'|'assurance'|'explicit'; readonly detail: string; readonly madeOn: GameDate; readonly fulfilled?: boolean }
export type RecruitingNegotiationTopic = 'role'|'playingOpportunity'|'starterCompetition'|'position'|'tacticalUsage'|'developmentPlan'|'headCoachInvolvement'|'recruiterContinuity'|'rosterCompetition'|'academics'|'familyDistance'|'internationalAdaptation'|'visit'|'professionalPathway'|'decisionTiming'|'programStability'|'commercialEnvironment'
export type RecruitingConcernStatus = 'open'|'resolved'|'rejected'
export interface RecruitingConcern { readonly id: string; readonly topic: RecruitingNegotiationTopic; readonly raisedOn: GameDate; readonly description: string; readonly status: RecruitingConcernStatus }
export type RecruitingProspectRequest = 'clearerRole'|'strongerAssurance'|'headCoachMeeting'|'visit'|'moreTime'|'familyDiscussion'|'developmentExplanation'
export type RecruitingProgramResponseKind = 'factualReassurance'|'explanation'|'strengthenAssurance'|'promise'|'refuse'|'redirect'|'pressure'|'delay'
export type RecruitingProspectResponse = 'receptive'|'unconvinced'|'needsClarification'|'roleConcern'|'playingTimeConcern'|'rosterConcern'|'coachConcern'|'familyConcern'|'academicConcern'|'distanceConcern'|'wantsVisit'|'wantsHeadCoach'|'wantsMoreTime'|'wantsStrongerAssurance'|'cooling'|'readyToCommit'|'rejectsTopic'|'rejectsProgram'
export interface RecruitingProgramResponse { readonly topic: RecruitingNegotiationTopic; readonly kind: RecruitingProgramResponseKind; readonly response: RecruitingProspectResponse; readonly date: GameDate; readonly note: string }
export interface RecruitingNegotiation { readonly id: string; readonly cycleId: string; readonly recruitId: string; readonly programTeamId: TeamId; readonly stage: 'concernsRaised'|'counterposition'|'finalist'|'terminal'; readonly currentConcerns: readonly RecruitingConcern[]; readonly unresolvedTopics: readonly RecruitingNegotiationTopic[]; readonly resolvedTopics: readonly RecruitingNegotiationTopic[]; readonly prospectRequests: readonly RecruitingProspectRequest[]; readonly programResponses: readonly RecruitingProgramResponse[]; readonly promisesProposed: readonly string[]; readonly promisesAccepted: readonly string[]; readonly rejectedAsks: readonly RecruitingNegotiationTopic[]; readonly pressure: number; readonly lastMeaningfulInteraction?: GameDate; readonly terminalState: 'active'|'committed'|'rejected'|'withdrawn'|'expired' }
export type RecruitingClaimTruth = 'FACTUAL'|'SELECTIVE'|'EXAGGERATED'|'UNSUPPORTED'
export type RecruitingGrayTactic = 'rivalConcern'|'selectiveFraming'|'exaggeratedClaim'|'unsupportedAllegation'|'commitmentDestabilization'|'deadlineBluff'|'backchannelAttempt'|'impermissibleContact'|'questionableNILAssurance'|'impermissibleInducement'
export type RecruitingGrayLegality = 'LEGAL_FACTUAL'|'LEGAL_AGGRESSIVE'|'MISLEADING'|'RULE_VIOLATION'
export type RecruitingNegativeEvidenceSource = 'publicRoster'|'ownOrganizationKnowledge'|'ownRecruitingIntel'|'publicEvent'|'unsupported'
export interface RecruitingNegativeEvent { readonly id: string; readonly programTeamId: TeamId; readonly targetProgramTeamId?: TeamId; readonly tactic: RecruitingGrayTactic; readonly truth: RecruitingClaimTruth; readonly legality?: RecruitingGrayLegality; readonly evidenceSource?: RecruitingNegativeEvidenceSource; readonly date: GameDate; readonly shortTermEffect: number; readonly credibilityEffect: number; readonly stakeholderEffect: number; readonly detectionRisk: number; readonly detectionRoll?: number; readonly detected: boolean; readonly violationId?: string; readonly investigationId?: string }
export interface RecruitingRpgState { readonly preferenceProfile: RecruitingPreferenceProfile; readonly intel: readonly RecruitingIntel[]; readonly relationships: readonly RecruitingRelationship[]; readonly stakeholders: readonly RecruitingStakeholder[]; readonly promises: readonly RecruitingPromise[]; readonly negotiations?: readonly RecruitingNegotiation[]; readonly negativeEvents?: readonly RecruitingNegativeEvent[]; readonly story: readonly string[] }
export interface ProspectEducationContext { readonly highSchoolGraduationYear?: number; readonly completedUsHighSchool?: boolean; readonly enrolledAtUsCollege?: boolean; readonly yearsResidentOutsideUsBeforeDraft?: number; readonly yearsPlayingBasketballOutsideUsBeforeDraft?: number; readonly sophomoreConclusionOn?: GameDate; readonly dayAfterSophomoreConclusionOn?: GameDate; readonly sophomoreYearOpeningOn?: GameDate; readonly juniorYearOpeningOn?: GameDate; readonly seniorYearOpeningOn?: GameDate; readonly nontraditionalCalendar?: boolean }
export interface RecruitProfile{readonly id:string;readonly playerId:PlayerId;readonly cycleId:string;readonly origin:RecruitOrigin;readonly transferPortalEntryId?:string;readonly position:BasketballPosition;readonly prospectGroup?:RecruitingProspectGroup;readonly education?:ProspectEducationContext;readonly contactReleasedFromProgramId?:TeamId;readonly publicRank:number;readonly positionRank:number;readonly tier:'elite'|'strong'|'rotation'|'developmental';readonly preferences:Readonly<Record<'opportunity'|'development'|'competing'|'coach',number>>;readonly recruitingRpg?:RecruitingRpgState;readonly status:'open'|'committed'|'signed'|'incoming'|'arrived'|'ineligible'|'unsigned'}
export interface RecruitingInterest{readonly recruitId:string;readonly programTeamId:TeamId;readonly value:number}
export interface RecruitingBoardEntry{readonly programTeamId:TeamId;readonly recruitId:string;readonly priority:Priority}
export interface RecruitingOffer{readonly id:string;readonly cycleId:string;readonly recruitId:string;readonly programTeamId:TeamId;readonly status:'active'|'withdrawn'|'committed'|'signed';readonly madeOn:GameDate}
export interface RecruitingVisit{readonly id:string;readonly cycleId:string;readonly recruitId:string;readonly programTeamId:TeamId;readonly date:GameDate;readonly cost:number;readonly outcome:number;readonly type?:'official'|'unofficial';readonly startsOn?:GameDate;readonly endsOn?:GameDate;readonly lodgingNights?:number;readonly participants?:readonly string[];readonly sourceActionId?:string;readonly legalStatus?:'allowed'|'violation'}
export interface RecruitingActionRecord{readonly id:string;readonly cycleId:string;readonly recruitId:string;readonly programTeamId:TeamId;readonly kind:RecruitAction|'evaluation'|'negativeRecruiting'|'offer'|'promise'|'negotiation'|'headCoachIntervention';readonly date:GameDate;readonly cost:number;readonly effect:number;readonly countsAsOpportunity?:boolean;readonly staffPersonId?:string;readonly staffPersonIds?:readonly string[];readonly offCampus?:boolean;readonly eventType?:RecruitingEvaluationEvent}
export interface RecruitingCommitment{readonly id:string;readonly cycleId:string;readonly recruitId:string;readonly programTeamId:TeamId;readonly offerId:string;readonly committedOn:GameDate}
export type RecruitSigningAgreement = 'athleticsAidAgreement'|'settlementRelatedBenefitsAgreement'
export interface RecruitSigning{readonly id:string;readonly cycleId:string;readonly recruitId:string;readonly playerId:PlayerId;readonly programTeamId:TeamId;readonly targetSeasonId:SeasonId;readonly offerId:string;readonly signedOn:GameDate;readonly agreementType?:RecruitSigningAgreement}
export const defaultRecruitingRules:RecruitingRules=Object.freeze({poolSize:72,maxSignings:4,maxOffers:8,periodCapacity:10,staffDailyCapacity:6,costs:{contact:1,pitch:2,visit:3,offer:1},commitmentThreshold:60})
