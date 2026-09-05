import { parseGameDate, type GameDate } from "@/domain/date";
import type { GovernanceUniverse } from "./Governance";

export const GOVERNANCE_OBJECTIVE_FAMILIES = [
  "SPORTING_RESULTS", "COMPETITION_PERFORMANCE", "FINANCIAL_DISCIPLINE", "PAYROLL_DISCIPLINE",
  "PLAYER_DEVELOPMENT", "YOUTH_ACADEMY_USAGE", "RECRUITING", "NIL_STRATEGY",
  "STAFF_STRUCTURE", "STYLE_IDENTITY", "ROSTER_CONSTRUCTION", "DOMESTIC_PLAYER_USAGE",
  "FACILITIES", "INSTITUTIONAL_PRESTIGE", "COMPLIANCE_ACADEMIC", "FAN_COMMERCIAL",
  "NATIONAL_TEAM_DEVELOPMENT",
] as const;
export type GovernanceObjectiveFamily = (typeof GOVERNANCE_OBJECTIVE_FAMILIES)[number];
export const GOVERNANCE_EXPECTATION_HORIZONS = ["SHORT", "MEDIUM", "LONG"] as const;
export type GovernanceExpectationHorizon = (typeof GOVERNANCE_EXPECTATION_HORIZONS)[number];
export const GOVERNANCE_OBJECTIVE_METRICS = ["LEAGUE_FINISH_POSITION","WIN_PERCENTAGE","PLAYOFF_QUALIFICATION","PLAYOFF_ROUND_REACHED","CUP_ROUND_REACHED","TOURNAMENT_QUALIFICATION","TOURNAMENT_ROUND_REACHED","CONFERENCE_FINISH_POSITION","QUALIFICATION_SUCCESS","BUDGET_VARIANCE","OPERATING_RESULT","PAYROLL_TO_BUDGET_RATIO","ROSTER_COST","TAX_POSITION","DEBT_CHANGE","YOUNG_PLAYER_MINUTES_SHARE","ACADEMY_PLAYER_MINUTES_SHARE","PLAYER_DEVELOPMENT_SCORE","HOMEGROWN_USAGE","DOMESTIC_PLAYER_USAGE","ROSTER_AGE_PROFILE","ROSTER_CONTINUITY","STAFF_STRUCTURE_COMPLETENESS","STAFF_DEVELOPMENT_SCORE","RECRUITING_CLASS_STRENGTH","RECRUIT_RETENTION","TRANSFER_RETENTION","NIL_STRATEGY_EXECUTION","STYLE_IDENTITY_ADHERENCE","TACTICAL_IDENTITY_ADHERENCE","PRESTIGE_CHANGE","ATTENDANCE","FAN_ENGAGEMENT","FACILITY_PROGRESS","COMMERCIAL_PERFORMANCE","ACADEMIC_STANDARD","COMPLIANCE_STANDARD","PLAYER_POOL_DEVELOPMENT","YOUTH_PATHWAY_USAGE","NATIONAL_TEAM_RANKING","QUALIFICATION_PIPELINE"] as const;
export type GovernanceObjectiveMetric = (typeof GOVERNANCE_OBJECTIVE_METRICS)[number];
export const GOVERNANCE_OBJECTIVE_COMPARISONS = ["AT_LEAST","AT_MOST","EXACT_OR_TOLERANCE","BETWEEN","BOOLEAN_SUCCESS"] as const;
export type GovernanceObjectiveComparison = (typeof GOVERNANCE_OBJECTIVE_COMPARISONS)[number];
export const GOVERNANCE_OBJECTIVE_STATUSES = ["NOT_STARTED","IN_PROGRESS","MET","EXCEEDED","PARTIALLY_MET","MISSED","NOT_EVALUABLE"] as const;
export type GovernanceObjectiveStatus = (typeof GOVERNANCE_OBJECTIVE_STATUSES)[number];
const FAMILY_METRICS: Readonly<Record<GovernanceObjectiveFamily, readonly GovernanceObjectiveMetric[]>> = { SPORTING_RESULTS:["LEAGUE_FINISH_POSITION","WIN_PERCENTAGE","PLAYOFF_QUALIFICATION","PLAYOFF_ROUND_REACHED","CUP_ROUND_REACHED"], COMPETITION_PERFORMANCE:["TOURNAMENT_QUALIFICATION","TOURNAMENT_ROUND_REACHED","CONFERENCE_FINISH_POSITION","QUALIFICATION_SUCCESS"], FINANCIAL_DISCIPLINE:["BUDGET_VARIANCE","OPERATING_RESULT","DEBT_CHANGE"], PAYROLL_DISCIPLINE:["PAYROLL_TO_BUDGET_RATIO","ROSTER_COST","TAX_POSITION"], PLAYER_DEVELOPMENT:["YOUNG_PLAYER_MINUTES_SHARE","PLAYER_DEVELOPMENT_SCORE"], YOUTH_ACADEMY_USAGE:["ACADEMY_PLAYER_MINUTES_SHARE"], RECRUITING:["RECRUITING_CLASS_STRENGTH","RECRUIT_RETENTION","TRANSFER_RETENTION"], NIL_STRATEGY:["NIL_STRATEGY_EXECUTION"], STAFF_STRUCTURE:["STAFF_STRUCTURE_COMPLETENESS","STAFF_DEVELOPMENT_SCORE"], STYLE_IDENTITY:["STYLE_IDENTITY_ADHERENCE","TACTICAL_IDENTITY_ADHERENCE"], ROSTER_CONSTRUCTION:["ROSTER_AGE_PROFILE","ROSTER_CONTINUITY"], DOMESTIC_PLAYER_USAGE:["HOMEGROWN_USAGE","DOMESTIC_PLAYER_USAGE"], FACILITIES:["FACILITY_PROGRESS"], INSTITUTIONAL_PRESTIGE:["PRESTIGE_CHANGE"], COMPLIANCE_ACADEMIC:["ACADEMIC_STANDARD","COMPLIANCE_STANDARD"], FAN_COMMERCIAL:["ATTENDANCE","FAN_ENGAGEMENT","COMMERCIAL_PERFORMANCE"], NATIONAL_TEAM_DEVELOPMENT:["PLAYER_POOL_DEVELOPMENT","YOUTH_PATHWAY_USAGE","NATIONAL_TEAM_RANKING","QUALIFICATION_PIPELINE"] };
export type GovernanceObjectiveTarget = { readonly kind:"NUMERIC"; readonly value:number } | { readonly kind:"BOOLEAN"; readonly value:boolean } | { readonly kind:"RANGE"; readonly minimum:number; readonly maximum:number };
export type GovernanceObjectiveMetricValueType = "NUMBER" | "BOOLEAN";
const BOOLEAN_METRICS = new Set<GovernanceObjectiveMetric>(["PLAYOFF_QUALIFICATION","TOURNAMENT_QUALIFICATION","QUALIFICATION_SUCCESS"]);
export const governanceObjectiveMetricValueType = (metric: GovernanceObjectiveMetric): GovernanceObjectiveMetricValueType => BOOLEAN_METRICS.has(metric) ? "BOOLEAN" : "NUMBER";

/**
 * GovernanceExpectationPeriod + GovernanceObjective are the source of truth for
 * Governance V2 institutional expectations. BoardState.confidence is legacy only
 * and is neither an input nor an output of BG2 evaluation.
 */
export interface GovernanceExpectationPeriod {
  readonly id: string;
  readonly institutionId: string;
  readonly universe: GovernanceUniverse;
  readonly startedOn: GameDate;
  readonly endedOn?: GameDate;
}
/** A weighted, independently evaluable objective owned by a formal institution or body. */
export interface GovernanceObjective {
  readonly id: string;
  readonly expectationPeriodId: string;
  readonly ownerInstitutionId?: string;
  readonly ownerBodyId?: string;
  readonly family: GovernanceObjectiveFamily;
  readonly horizon: GovernanceExpectationHorizon;
  readonly metric: GovernanceObjectiveMetric;
  readonly comparison: GovernanceObjectiveComparison;
  readonly target: GovernanceObjectiveTarget;
  readonly tolerance: number;
  readonly partialTolerance?: number;
  readonly importance: number;
  readonly evaluationStartsOn: GameDate;
  readonly evaluationEndsOn: GameDate;
}
export interface GovernanceObjectiveEvaluationInput { readonly metric: GovernanceObjectiveMetric; readonly value?: number | boolean }
export interface GovernanceObjectiveEvaluation { readonly objectiveId:string; readonly evaluatedOn:GameDate; readonly status:GovernanceObjectiveStatus; readonly measuredValue?:number|boolean; readonly target:GovernanceObjectiveTarget; readonly normalizedAchievement:number; readonly withinTolerance:boolean }
export interface GovernanceObjectiveSetEvaluation { readonly objectiveWeights: Readonly<Record<string,number>>; readonly weightedContributions: Readonly<Record<string,number>>; readonly evaluableObjectiveIds: readonly string[]; readonly excludedObjectiveIds: readonly string[]; readonly expectationAttainment:number }

export function createGovernanceExpectationPeriod(value: GovernanceExpectationPeriod): GovernanceExpectationPeriod {
  if (!value.id.trim() || !value.institutionId.trim()) throw new RangeError("Invalid governance expectation period");
  const startedOn = parseGameDate(value.startedOn); const endedOn = value.endedOn === undefined ? undefined : parseGameDate(value.endedOn);
  if (endedOn !== undefined && endedOn < startedOn) throw new RangeError("Governance expectation period ends before it starts");
  return { ...value, startedOn, ...(endedOn === undefined ? {} : { endedOn }) };
}
export function createGovernanceObjective(value: GovernanceObjective): GovernanceObjective {
  const targetOk=(value.comparison==="BETWEEN"&&value.target.kind==="RANGE"&&value.target.minimum<=value.target.maximum)||(value.comparison==="BOOLEAN_SUCCESS"&&value.target.kind==="BOOLEAN")||(["AT_LEAST","AT_MOST","EXACT_OR_TOLERANCE"].includes(value.comparison)&&value.target.kind==="NUMERIC");
  if (!value.id.trim() || !value.expectationPeriodId.trim() || (value.ownerInstitutionId === undefined && value.ownerBodyId === undefined) || !FAMILY_METRICS[value.family]?.includes(value.metric) || !targetOk || (governanceObjectiveMetricValueType(value.metric)==="BOOLEAN") !== (value.target.kind==="BOOLEAN") || !GOVERNANCE_EXPECTATION_HORIZONS.includes(value.horizon) || !Number.isFinite(value.tolerance) || value.tolerance < 0 || (value.partialTolerance !== undefined && (!Number.isFinite(value.partialTolerance) || value.partialTolerance < value.tolerance)) || !Number.isInteger(value.importance) || value.importance < 1 || value.importance > 100) throw new RangeError("Invalid governance objective");
  const evaluationStartsOn = parseGameDate(value.evaluationStartsOn); const evaluationEndsOn = parseGameDate(value.evaluationEndsOn);
  if (evaluationEndsOn < evaluationStartsOn) throw new RangeError("Governance objective evaluation range is invalid");
  return { ...value, evaluationStartsOn, evaluationEndsOn };
}
export function normalizedGovernanceObjectiveWeights(objectives: readonly GovernanceObjective[]): Readonly<Record<string, number>> { const total=objectives.reduce((sum,item)=>sum+item.importance,0); return Object.fromEntries(objectives.map((item)=>[item.id,total===0?0:item.importance/total])); }
 export function evaluateGovernanceObjective(objective: GovernanceObjective,input: GovernanceObjectiveEvaluationInput|undefined,onDate:GameDate): GovernanceObjectiveEvaluation { const base={objectiveId:objective.id,evaluatedOn:onDate,target:objective.target}; if(onDate<objective.evaluationStartsOn)return {...base,status:"NOT_STARTED" as const,normalizedAchievement:0,withinTolerance:false}; if(input?.metric!==objective.metric||input.value===undefined)return {...base,status:"NOT_EVALUABLE" as const,normalizedAchievement:0,withinTolerance:false}; if((governanceObjectiveMetricValueType(objective.metric)==="BOOLEAN") !== (typeof input.value==="boolean"))return {...base,status:"NOT_EVALUABLE" as const,normalizedAchievement:0,withinTolerance:false}; const value=input.value; if(objective.target.kind==="BOOLEAN"){const met=value===objective.target.value;return {...base,status:met?"MET":onDate<objective.evaluationEndsOn?"IN_PROGRESS":"MISSED",measuredValue:value,normalizedAchievement:met?1:0,withinTolerance:met};} const numeric=value as number; const range=objective.target.kind==="RANGE"?objective.target:undefined; const target=range===undefined?(objective.target as {readonly kind:"NUMERIC";readonly value:number}).value:undefined; const met=range!==undefined?numeric>=range.minimum&&numeric<=range.maximum:objective.comparison==="AT_LEAST"?numeric>=target!:objective.comparison==="AT_MOST"?numeric<=target!:Math.abs(numeric-target!)<=objective.tolerance; const favorable=objective.comparison==="AT_LEAST"?numeric>target!+objective.tolerance:objective.comparison==="AT_MOST"?numeric<target!-objective.tolerance:false; const distance=range!==undefined?Math.min(Math.abs(numeric-range.minimum),Math.abs(numeric-range.maximum)):Math.abs(numeric-target!); const achievement=met?1:Math.max(0,1-distance/Math.max(1,Math.abs(target??range!.minimum))); const ended=onDate>=objective.evaluationEndsOn; const partial=!met&&ended&&objective.partialTolerance!==undefined&&distance<=objective.partialTolerance; return {...base,status:met?(favorable?"EXCEEDED":"MET"):ended?(partial?"PARTIALLY_MET":"MISSED"):"IN_PROGRESS",measuredValue:value,normalizedAchievement:achievement,withinTolerance:met}; }
export function aggregateGovernanceObjectiveEvaluations(objectives:readonly GovernanceObjective[],evaluations:readonly GovernanceObjectiveEvaluation[]):GovernanceObjectiveSetEvaluation { const byId=Object.fromEntries(evaluations.map((item)=>[item.objectiveId,item])); const ordered=[...objectives].sort((a,b)=>a.id.localeCompare(b.id)); const evaluable=ordered.filter((item)=>!['NOT_STARTED','NOT_EVALUABLE'].includes(byId[item.id]?.status??'NOT_EVALUABLE')); const weights=normalizedGovernanceObjectiveWeights(evaluable); const contributions=Object.fromEntries(evaluable.map((item)=>[item.id,(byId[item.id]?.normalizedAchievement??0)*(weights[item.id]??0)])); return {objectiveWeights:weights,weightedContributions:contributions,evaluableObjectiveIds:evaluable.map((item)=>item.id),excludedObjectiveIds:ordered.filter((item)=>!evaluable.includes(item)).map((item)=>item.id),expectationAttainment:Object.values(contributions).reduce((sum,value)=>sum+value,0)}; }
