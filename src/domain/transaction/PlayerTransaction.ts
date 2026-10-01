import type { ContractId, PlayerId, PlayerTransactionId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
export type PlayerTransactionKind='contractExpired'|'released'|'signedFreeAgent'|'traded'
export interface PlayerTransaction{readonly id:PlayerTransactionId;readonly playerId:PlayerId;readonly kind:PlayerTransactionKind;readonly occurredOn:GameDate;readonly fromTeamId?:TeamId;readonly toTeamId?:TeamId;readonly contractId?:ContractId;readonly sourceTradeId?:string;readonly provenance?:'MARKET'|'WORLD_REPAIR'}
