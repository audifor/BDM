import type {
  CoachId,
  CompetitionId,
  ContractId,
  GameId,
  PlayerId,
  StaffPersonId,
  TeamId,
} from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

/** Known entity types are convenience names; the string protocol remains open to future types. */
export const KNOWN_ENTITY_TYPES = [
  'player',
  'staff',
  'team',
  'coach',
  'competition',
  'match',
  'contract',
  'coachJobOffer',
] as const

export type KnownEntityType = (typeof KNOWN_ENTITY_TYPES)[number]
export type EntityType = KnownEntityType | (string & {})

export type EntityIdForType<Type extends EntityType> =
  Type extends 'player' ? PlayerId :
  Type extends 'staff' ? StaffPersonId :
  Type extends 'team' ? TeamId :
  Type extends 'coach' ? CoachId :
  Type extends 'competition' ? CompetitionId :
  Type extends 'match' ? GameId :
  Type extends 'contract' ? ContractId :
  string

/** A lightweight reference. Domain objects never travel through the action protocol. */
export interface EntityRef<Type extends EntityType = EntityType, Id extends string = EntityIdForType<Type>> {
  readonly type: Type
  readonly id: Id
}

export type PlayerEntityRef = EntityRef<'player', PlayerId>
export type StaffEntityRef = EntityRef<'staff', StaffPersonId>
export type TeamEntityRef = EntityRef<'team', TeamId>
export type CoachEntityRef = EntityRef<'coach', CoachId>
export type CompetitionEntityRef = EntityRef<'competition', CompetitionId>
export type MatchEntityRef = EntityRef<'match', GameId>
export type ContractEntityRef = EntityRef<'contract', ContractId>
export type CoachJobOfferEntityRef = EntityRef<'coachJobOffer', string>

export function createEntityRef<Type extends EntityType, Id extends string>(type: Type, id: Id): EntityRef<Type, Id> {
  return {
    type: requireNonEmptyString(type, 'Entity type') as Type,
    id: requireNonEmptyString(id, 'Entity id') as Id,
  }
}
