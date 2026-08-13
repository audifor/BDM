import type { TeamId } from '@/domain/ids'
export interface TeamFinances{readonly teamId:TeamId;readonly playerSalaryBudget:number}
export function createTeamFinances(input:TeamFinances):TeamFinances{if(!Number.isInteger(input.playerSalaryBudget)||input.playerSalaryBudget<1||input.playerSalaryBudget>1_000_000_000)throw new RangeError('Team player salary budget must be an integer from 1 to 1000000000');return{...input}}
