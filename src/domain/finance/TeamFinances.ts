import type { TeamId } from '@/domain/ids'
/** `staffSalaryBudget` (Wave 4A) is independent of `playerSalaryBudget`/player SalaryRules/cap/apron — a separate Staff-only budget pool. */
export interface TeamFinances{readonly teamId:TeamId;readonly playerSalaryBudget:number;readonly staffSalaryBudget:number}
export function createTeamFinances(input:TeamFinances):TeamFinances{
  if(!Number.isInteger(input.playerSalaryBudget)||input.playerSalaryBudget<1||input.playerSalaryBudget>1_000_000_000)throw new RangeError('Team player salary budget must be an integer from 1 to 1000000000')
  if(!Number.isInteger(input.staffSalaryBudget)||input.staffSalaryBudget<0||input.staffSalaryBudget>1_000_000_000)throw new RangeError('Team staff salary budget must be an integer from 0 to 1000000000')
  return{...input}
}
