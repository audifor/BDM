import { addYears, type GameDate } from '@/domain/date'
import { contractIdFromString, type TeamId } from '@/domain/ids'
import { calculateBootstrapAbilityProxy, type Player } from '@/domain/player'
import { createPlayerContract, type PlayerContract } from '@/domain/contract'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
export function generateInitialPlayerContract(player:Player,teamId:TeamId,startsOn:GameDate):PlayerContract{const years=new SeededRandomSource(hashStringToSeed(`player-contract-term-v1:${player.id}`)).nextInt(2,5);const ability=calculateBootstrapAbilityProxy(player.basketball.ratings);const base=100_000+Math.pow(Math.max(0,ability-40),2)*1_000;const variance=new SeededRandomSource(hashStringToSeed(`player-contract-salary-v1:${player.id}`)).nextFloat(.9,1.1);const salary=Math.max(80_000,Math.min(3_500_000,Math.round(base*variance/10_000)*10_000));return createPlayerContract({id:contractIdFromString(`contract:${player.id}:${teamId}:${startsOn}`),playerId:player.id,teamId,kind:'standard',term:{startsOn,expiresOn:addYears(startsOn,years)},compensation:{annualSalary:salary}})}
