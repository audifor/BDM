import type { TeamId } from '@/domain/ids'
import { createTeamFinances, type TeamFinances } from '@/domain/finance'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
/** `staffSalaryBudget` (Wave 4A) is a deterministic, independent fraction of the player budget — a prototype constant, not derived from any player-cap rule (see Issue #19 §6/§10). */
const STAFF_BUDGET_RATIO = 0.12

export function generateInitialTeamFinances(teamId:TeamId,initialPayroll:number):TeamFinances{
  const factor=new SeededRandomSource(hashStringToSeed(`team-finance-player-budget-v1:${teamId}`)).nextFloat(1.1,1.3)
  const playerSalaryBudget=Math.max(500_000,Math.ceil(initialPayroll*factor/100_000)*100_000)
  const staffSalaryBudget=Math.max(100_000,Math.ceil(playerSalaryBudget*STAFF_BUDGET_RATIO/50_000)*50_000)
  return createTeamFinances({teamId,playerSalaryBudget,staffSalaryBudget})
}
