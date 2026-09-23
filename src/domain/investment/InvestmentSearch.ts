import { compareGameDates, type GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world/GameWorld'
import { getActiveInvestorInterests, type OrganizationInvestorInterest } from './OrganizationInvestorInterest'
import { deriveOrganizationCapitalRaiseStatusAt, type OrganizationCapitalRaise } from './OrganizationCapitalRaise'
import { deriveOrganizationInvestmentProposalStatus, type OrganizationInvestmentProposal } from './OrganizationInvestmentProposal'

export function findActiveCapitalRaises(world: GameWorld, onDate: GameDate = world.currentDate): readonly OrganizationCapitalRaise[] {
  return Object.values(world.organizationCapitalRaisesById)
    .filter((raise) => {
      const events = Object.values(world.organizationCapitalRaiseEventsById).filter((event) => event.capitalRaiseId === raise.id)
      const status = deriveOrganizationCapitalRaiseStatusAt(events, onDate)
      return (status === 'OPENED' || status === 'REOPENED') && compareGameDates(raise.openedOn, onDate) <= 0
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function findMatchingInvestorInterestsForCapitalRaise(world: GameWorld, capitalRaiseId: OrganizationCapitalRaise['id'], onDate: GameDate = world.currentDate): readonly OrganizationInvestorInterest[] {
  const raise = world.organizationCapitalRaisesById[capitalRaiseId]
  if (raise === undefined) return Object.freeze([])
  if (!findActiveCapitalRaises(world, onDate).some((candidate) => candidate.id === raise.id)) return Object.freeze([])
  return getActiveInvestorInterests(world, raise.organizationId, onDate)
}

export function findMatchingInvestmentProposalsForCapitalRaise(world: GameWorld, capitalRaiseId: OrganizationCapitalRaise['id']): readonly OrganizationInvestmentProposal[] {
  return Object.values(world.organizationInvestmentProposalsById)
    .filter((proposal) => proposal.capitalRaiseId === capitalRaiseId && deriveOrganizationInvestmentProposalStatus(Object.values(world.organizationInvestmentProposalEventsById).filter((event) => event.proposalId === proposal.id)) !== 'REJECTED')
    .sort((left, right) => left.id.localeCompare(right.id))
}
