import type { ConferenceId, EcosystemId, SeasonId, TeamId } from '@/domain/ids'
import { conferenceIdFromString } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

/** Structural NCAA-like grouping. Teams remain the canonical sporting entities. */
export interface Conference { readonly id: ConferenceId; readonly ecosystemId: EcosystemId; readonly name: string }
export interface ConferenceMembership { readonly conferenceId: ConferenceId; readonly teamId: TeamId; readonly seasonId: SeasonId }
export function createConference(input: Conference): Conference { return Object.freeze({ id: conferenceIdFromString(requireNonEmptyString(input.id, 'Conference id')), ecosystemId: input.ecosystemId, name: requireNonEmptyString(input.name, 'Conference name') }) }
export function createConferenceMembership(input: ConferenceMembership): ConferenceMembership { return Object.freeze({ ...input }) }
