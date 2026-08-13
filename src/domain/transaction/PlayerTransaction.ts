import type { ContractId, PlayerId, PlayerTransactionId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
export type PlayerTransactionKind='contractExpired'|'released'|'signedFreeAgent'
export interface PlayerTransaction{readonly id:PlayerTransactionId;readonly playerId:PlayerId;readonly kind:PlayerTransactionKind;readonly occurredOn:GameDate;readonly fromTeamId?:TeamId;readonly toTeamId?:TeamId;readonly contractId?:ContractId}
