import { createElement } from 'react'
import type { PlayerId } from '@/domain/ids'
import { getPlayerContractStatus } from '@/domain/contract'
import type { Draft } from '@/domain/draft'
import type { GameWorld } from '@/domain/world'
import { assessNbaDraftEligibility, getDraftPicks } from '@/engine/draft'

export interface DraftPlayerReadModel {
  readonly states: readonly string[]
  readonly reasons: readonly string[]
}

export function getDraftPlayerReadModel(world: GameWorld, draft: Draft, playerId: PlayerId): DraftPlayerReadModel {
  const entry = draft.entries?.find((candidate) => candidate.playerId === playerId)
  const selected = getDraftPicks(world, draft.id).some((pick) => pick.selection?.playerId === playerId)
  const eligibility = assessNbaDraftEligibility(world, playerId, draft)
  const states: string[] = []
  const reasons: string[] = []
  if (selected || entry?.status === 'drafted') states.push('DRAFTED')
  else if (entry?.status === 'undrafted') states.push('UNDRAFTED')
  else if (entry?.status === 'finalPool') states.push('FINAL_POOL')
  else if (entry?.status === 'declaredEarlyEntry') states.push('DECLARED')
  else if (eligibility.eligible) states.push('ELIGIBLE')
  else states.push('NOT_ELIGIBLE')

  if (entry !== undefined && ['withdrawnNCAAEligible', 'withdrawnNCAAIneligible', 'withdrawnNBA'].includes(entry.status)) {
    states.push('WITHDRAWN')
    reasons.push('This Player has already withdrawn from the Draft entry.')
  }
  const rights = Object.values(world.playerRightsById).find((item) => item.playerId === playerId && item.rightsType === 'draft')
  if (rights !== undefined) {
    states.push('RIGHTS_HELD')
    const contract = rights.contractId === undefined ? undefined : Object.values(world.contractsById).find((item) => item.id === rights.contractId)
    if (contract === undefined) {
      states.push('UNSIGNED')
      reasons.push('Draft rights are held, but no professional contract is signed; the Player has not joined the roster.')
    } else {
      states.push('SIGNED')
      if (Object.values(world.teams).some((team) => team.rosterPlayerIds.includes(playerId))) states.push('ROSTERED')
    }
  }

  if (!eligibility.eligible && entry === undefined) reasons.push(`Player is not Draft eligible: ${eligibility.reason}.`)
  if (entry === undefined && draft.rules.earlyEntryDeadline !== undefined && world.currentDate > draft.rules.earlyEntryDeadline) reasons.push(`The declaration deadline (${draft.rules.earlyEntryDeadline}) has passed.`)
  if (selected) reasons.push('This Player has already been selected and cannot be selected again.')
  if ((entry?.status === 'declaredEarlyEntry' || entry?.status === 'finalPool') && draft.rules.collegeWithdrawalDeadline !== undefined && world.currentDate > draft.rules.collegeWithdrawalDeadline) {
    reasons.push(`The NCAA return deadline (${draft.rules.collegeWithdrawalDeadline}) has passed; withdrawal cannot restore college eligibility.`)
  }
  if ((entry?.status === 'declaredEarlyEntry' || entry?.status === 'finalPool') && draft.rules.finalWithdrawalDeadline !== undefined && world.currentDate > draft.rules.finalWithdrawalDeadline) {
    reasons.push(`The NBA withdrawal deadline (${draft.rules.finalWithdrawalDeadline}) has passed; withdrawal is no longer available.`)
  }

  const rosterTeam = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(playerId))
  const sourceEcosystemId = rosterTeam === undefined ? undefined : Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(rosterTeam.id))?.ecosystemId
  const isInternational = sourceEcosystemId !== undefined && world.ecosystems[sourceEcosystemId]?.kind === 'fibaLike'
  if (isInternational) {
    const activeContract = Object.values(world.contractsById).find((contract) => contract.playerId === playerId && getPlayerContractStatus(contract, world.currentDate) === 'active')
    if (activeContract !== undefined) reasons.push(`The active source contract with ${world.teams[activeContract.teamId]?.name ?? activeContract.teamId} must be released before the Player can arrive in the NBA.`)
  }

  return { states: [...new Set(states)], reasons: [...new Set(reasons)] }
}

export function DraftPlayerStatus({ world, draft, playerId }: { readonly world: GameWorld; readonly draft: Draft; readonly playerId: PlayerId }) {
  const model = getDraftPlayerReadModel(world, draft, playerId)
  return createElement('div', { 'aria-label': 'Draft Player status' },
    createElement('p', null, `State: ${model.states.join(' · ')}`),
    ...model.reasons.map((reason) => createElement('p', { key: reason, role: 'status' }, reason)),
  )
}
