import type { GameDate } from '@/domain/date'
import { getPlayerContractStatus } from '@/domain/contract'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
export type TeamFinancialStatus='healthy'|'tight'|'overBudget'
export interface TeamFinancialSnapshot{readonly teamId:TeamId;readonly playerSalaryBudget:number;readonly currentPlayerPayroll:number;readonly remainingPlayerSalaryBudget:number;readonly budgetUsageRatio:number;readonly status:TeamFinancialStatus}
export function calculateTeamPlayerPayroll(world:GameWorld,teamId:TeamId,onDate:GameDate=world.currentDate):number{return Object.values(world.contractsById).filter(c=>c.teamId===teamId&&getPlayerContractStatus(c,onDate)==='active').reduce((sum,c)=>sum+c.compensation.annualSalary,0)}
export function getTeamFinancialSnapshot(world:GameWorld,teamId:TeamId,onDate:GameDate=world.currentDate):TeamFinancialSnapshot{const budget=world.teamFinancesByTeamId[teamId]?.playerSalaryBudget;if(budget===undefined)throw new Error(`Missing Team finances for ${teamId}`);const payroll=calculateTeamPlayerPayroll(world,teamId,onDate);const usage=payroll/budget;return{teamId,playerSalaryBudget:budget,currentPlayerPayroll:payroll,remainingPlayerSalaryBudget:budget-payroll,budgetUsageRatio:usage,status:usage<=.85?'healthy':usage<=1?'tight':'overBudget'}}
export function canTeamAffordAdditionalSalary(world:GameWorld,teamId:TeamId,additionalAnnualSalary:number,onDate:GameDate=world.currentDate):boolean{if(!Number.isInteger(additionalAnnualSalary)||additionalAnnualSalary<0)throw new RangeError('Additional annual salary must be a non-negative integer');const s=getTeamFinancialSnapshot(world,teamId,onDate);return s.currentPlayerPayroll+additionalAnnualSalary<=s.playerSalaryBudget}
