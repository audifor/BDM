import type { TeamId } from '@/domain/ids'
import { createTeamFinances, type TeamFinances } from '@/domain/finance'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
export function generateInitialTeamFinances(teamId:TeamId,initialPayroll:number):TeamFinances{const factor=new SeededRandomSource(hashStringToSeed(`team-finance-player-budget-v1:${teamId}`)).nextFloat(1.1,1.3);return createTeamFinances({teamId,playerSalaryBudget:Math.max(500_000,Math.ceil(initialPayroll*factor/100_000)*100_000)})}
