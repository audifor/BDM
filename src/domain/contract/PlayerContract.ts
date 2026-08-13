import { compareGameDates, type GameDate } from '@/domain/date'
import type { ContractId, PlayerId, TeamId } from '@/domain/ids'
export type PlayerContractKind='standard'
export interface PlayerContract { readonly id:ContractId;readonly playerId:PlayerId;readonly teamId:TeamId;readonly kind:PlayerContractKind;readonly term:{readonly startsOn:GameDate;readonly expiresOn:GameDate};readonly compensation:{readonly annualSalary:number} }
export type PlayerContractStatus='scheduled'|'active'|'expired'
export function createPlayerContract(input:PlayerContract):PlayerContract{if(input.kind!=='standard')throw new TypeError('Contract kind is invalid');if(compareGameDates(input.term.expiresOn,input.term.startsOn)<=0)throw new RangeError('Contract expiry must be after start');if(!Number.isInteger(input.compensation.annualSalary)||input.compensation.annualSalary<1||input.compensation.annualSalary>100_000_000)throw new RangeError('Contract annual salary must be an integer from 1 to 100000000');return{...input,term:{...input.term},compensation:{...input.compensation}}}
export function getPlayerContractStatus(contract:PlayerContract,onDate:GameDate):PlayerContractStatus{return compareGameDates(onDate,contract.term.startsOn)<0?'scheduled':compareGameDates(onDate,contract.term.expiresOn)<0?'active':'expired'}
