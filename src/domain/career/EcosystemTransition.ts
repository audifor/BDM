import type { EcosystemId, PlayerId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
export type EcosystemTransitionType='ncaaToNbaDraft'|'ncaaToFiba'|'fibaToNba'|'nbaToFiba'
export interface EcosystemTransition{readonly id:string;readonly playerId:PlayerId;readonly fromEcosystemId:EcosystemId;readonly toEcosystemId:EcosystemId;readonly fromTeamId?:TeamId;readonly toTeamId?:TeamId;readonly effectiveDate:GameDate;readonly transitionType:EcosystemTransitionType;readonly sourceSystem:string}
