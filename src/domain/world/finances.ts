import type { GameDate } from '@/domain/date'
import { getContractYearCompensation, getPlayerContractStatus } from '@/domain/contract'
import { isStaffContractActiveOn } from '@/domain/staffContract'
import type { SeasonId, TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
export type TeamFinancialStatus='healthy'|'tight'|'overBudget'
export interface TeamFinancialSnapshot{readonly teamId:TeamId;readonly playerSalaryBudget:number;readonly currentPlayerPayroll:number;readonly remainingPlayerSalaryBudget:number;readonly budgetUsageRatio:number;readonly status:TeamFinancialStatus}
export function calculateTeamPlayerPayroll(world:GameWorld,teamId:TeamId,onDate:GameDate=world.currentDate,seasonId:SeasonId=world.currentSeasonId):number{return Object.values(world.contractsById).filter(c=>c.teamId===teamId&&getPlayerContractStatus(c,onDate)==='active').reduce((sum,c)=>sum+getContractYearCompensation(c,onDate).capHit,0)+Object.values(world.deadMoneyChargesById).filter(charge=>charge.teamId===teamId&&charge.seasonId===seasonId).reduce((sum,charge)=>sum+charge.amount,0)}
export function getTeamFinancialSnapshot(world:GameWorld,teamId:TeamId,onDate:GameDate=world.currentDate):TeamFinancialSnapshot{const budget=world.teamFinancesByTeamId[teamId]?.playerSalaryBudget;if(budget===undefined)throw new Error(`Missing Team finances for ${teamId}`);const payroll=calculateTeamPlayerPayroll(world,teamId,onDate);const usage=payroll/budget;return{teamId,playerSalaryBudget:budget,currentPlayerPayroll:payroll,remainingPlayerSalaryBudget:budget-payroll,budgetUsageRatio:usage,status:usage<=.85?'healthy':usage<=1?'tight':'overBudget'}}
export function canTeamAffordAdditionalSalary(world:GameWorld,teamId:TeamId,additionalAnnualSalary:number,onDate:GameDate=world.currentDate):boolean{if(!Number.isInteger(additionalAnnualSalary)||additionalAnnualSalary<0)throw new RangeError('Additional annual salary must be a non-negative integer');const s=getTeamFinancialSnapshot(world,teamId,onDate);return s.currentPlayerPayroll+additionalAnnualSalary<=s.playerSalaryBudget}

/**
 * Wave 4A (Issue #19 §6). `activeAnnualSalary` is DERIVED from active `StaffContract` rows on
 * `onDate` — never stored/persisted. Independent of player `SalaryRules`/cap/apron and of
 * `TeamFinancialSnapshot` above; no player salary-cap code is reused here.
 */
export interface TeamStaffPayroll { readonly teamId: TeamId; readonly activeAnnualSalary: number; readonly budget: number; readonly remainingBudget: number }
export function calculateTeamStaffPayroll(world: GameWorld, teamId: TeamId, onDate: GameDate = world.currentDate): number {
  return Object.values(world.staffContractsById).filter((contract) => contract.teamId === teamId && isStaffContractActiveOn(contract, onDate)).reduce((sum, contract) => sum + contract.compensation.annualSalary, 0)
}
export function getTeamStaffPayroll(world: GameWorld, teamId: TeamId, onDate: GameDate = world.currentDate): TeamStaffPayroll {
  const budget = world.teamFinancesByTeamId[teamId]?.staffSalaryBudget
  if (budget === undefined) throw new Error(`Missing Team finances for ${teamId}`)
  const activeAnnualSalary = calculateTeamStaffPayroll(world, teamId, onDate)
  return { teamId, activeAnnualSalary, budget, remainingBudget: budget - activeAnnualSalary }
}
/** Single canonical Staff-budget check — used by both the manual offer-creation path and the AI autopilot, never bypassed by a UI-only check (Issue #19 §6). */
export function canTeamAffordAdditionalStaffSalary(world: GameWorld, teamId: TeamId, additionalAnnualSalary: number, onDate: GameDate = world.currentDate): boolean {
  if (!Number.isFinite(additionalAnnualSalary) || additionalAnnualSalary < 0) throw new RangeError('Additional Staff annual salary must be a non-negative finite number')
  const payroll = getTeamStaffPayroll(world, teamId, onDate)
  return payroll.activeAnnualSalary + additionalAnnualSalary <= payroll.budget
}
