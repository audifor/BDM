import { describe, expect, it } from 'vitest'
import { createPlayerContract, contractReviewDecisionIdFor } from '@/domain/contract'
import { addDays } from '@/domain/date'
import { contractIdFromString } from '@/domain/ids'
import { clearPlayerFromLineup, createDefaultTeamLineup } from '@/domain/tactics'
import { updateGameWorld } from '@/domain/world'
import { createNewGame } from '@/app/game'
import { assessClubNeeds, assessContractReviewOutlook } from '@/engine/clubNeeds'
import { recordContractReviewDecision } from './ContractReviewService'

function reviewFixture() {
  const base = createNewGame()
  const team = Object.values(base.teams).find((candidate) => candidate.coachId === base.userCoachId)!
  const playerId = team.rosterPlayerIds[0]!
  const position = base.players[playerId]!.basketball.primaryPosition
  const contract = createPlayerContract({ id: contractIdFromString(`bs11b-review:${team.id}`), teamId: team.id, playerId, kind: 'standard', term: { startsOn: addDays(base.currentDate, -30), expiresOn: addDays(base.currentDate, 120) }, compensation: { annualSalary: 1_000_000 } })
  const lineup = base.lineupsByTeamId[team.id]!
  const world = updateGameWorld(base, {
    contracts: [...Object.values(base.contractsById).filter((item) => item.playerId !== playerId), contract],
    lineupsByTeamId: { ...base.lineupsByTeamId, [team.id]: { ...lineup, starters: { ...lineup.starters, [position]: playerId } } },
  })
  return { world, team, playerId, contract }
}

describe('contract review decisions', () => {
  it('derives one review candidate from the canonical BS9 key contract need', () => {
    const { world, team, playerId, contract } = reviewFixture()
    const need = assessClubNeeds(world, team.id).needs.find((item) => item.kind === 'CONTRACT_CONTINUITY' && item.relatedPlayerIds.includes(playerId))
    const reviews = assessContractReviewOutlook(world, team.id).reviews
    expect(need?.evidence[0]?.values.contractId).toBe(contract.id)
    expect(reviews.filter((item) => item.contractId === contract.id)).toHaveLength(1)
    expect(reviews.find((item) => item.contractId === contract.id)?.status).toBe('REVIEW_REQUIRED')
  })

  it('does not offer a review when multiple active contracts make the player state ambiguous', () => {
    const { world, team, contract } = reviewFixture()
    const duplicate = createPlayerContract({ id: contractIdFromString(`bs11b-review-duplicate:${team.id}`), teamId: team.id, playerId: contract.playerId, kind: 'standard', term: contract.term, compensation: contract.compensation })
    const ambiguous = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), duplicate] })
    expect(assessContractReviewOutlook(ambiguous, team.id).reviews.some((item) => item.playerId === contract.playerId)).toBe(false)
  })

  it.each(['PURSUE_EXTENSION', 'ALLOW_EXPIRY', 'REVIEW_RELEASE', 'DEFER'] as const)('%s persists only user intent and leaves contract/roster/market/Governance truth unchanged', (intent) => {
    const { world, team, playerId, contract } = reviewFixture()
    const result = recordContractReviewDecision(world, { teamId: team.id, contractId: contract.id, intent })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const next = result.world
    expect(next.contractsById[contract.id]).toEqual(contract)
    expect(next.teams[team.id]!.rosterPlayerIds).toEqual(world.teams[team.id]!.rosterPlayerIds)
    expect(next.playerTransactionsById).toEqual(world.playerTransactionsById)
    expect(next.negotiationsById).toEqual(world.negotiationsById)
    expect(next.governanceDecisionsById).toEqual(world.governanceDecisionsById)
    const decision = Object.values(next.contractReviewDecisionsById)[0]!
    expect(decision).toMatchObject({ teamId: team.id, playerId, contractId: contract.id, intent, decidedByCoachId: world.userCoachId })
    expect(decision.id).toBe(contractReviewDecisionIdFor(team.id, playerId, contract.id))
    if (intent === 'DEFER') expect(decision.reviewAgainOn).toBeDefined()
    else expect(decision.reviewAgainOn).toBeUndefined()
  })

  it('does not turn pursuit into secured retention or allow-expiry into a suppressed BS9 need', () => {
    const { world, team, playerId, contract } = reviewFixture()
    const pursued = recordContractReviewDecision(world, { teamId: team.id, contractId: contract.id, intent: 'PURSUE_EXTENSION' })
    expect(pursued.ok).toBe(true)
    if (!pursued.ok) return
    expect(assessContractReviewOutlook(pursued.world, team.id).reviews[0]?.status).toBe('PURSUE_EXTENSION')
    expect(assessClubNeeds(pursued.world, team.id).needs.some((need) => need.kind === 'CONTRACT_CONTINUITY' && need.relatedPlayerIds.includes(playerId))).toBe(true)
    const allowed = recordContractReviewDecision(world, { teamId: team.id, contractId: contract.id, intent: 'ALLOW_EXPIRY' })
    expect(allowed.ok).toBe(true)
    if (!allowed.ok) return
    expect(assessClubNeeds(allowed.world, team.id).needs.some((need) => need.kind === 'CONTRACT_CONTINUITY' && need.relatedPlayerIds.includes(playerId))).toBe(true)
  })

  it('fails closed for AI clubs and non-reviewable or successor-covered contracts', () => {
    const { world, team, contract } = reviewFixture()
    const aiTeam = Object.values(world.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== world.userCoachId)!
    expect(recordContractReviewDecision(world, { teamId: aiTeam.id, contractId: contract.id, intent: 'PURSUE_EXTENSION' })).toEqual({ ok: false, reason: 'TEAM_NOT_USER_CONTROLLED' })
    const successor = createPlayerContract({ id: contractIdFromString(`bs11b-successor:${team.id}`), teamId: team.id, playerId: contract.playerId, kind: 'standard', term: { startsOn: contract.term.expiresOn, expiresOn: addDays(contract.term.expiresOn, 365) }, compensation: { annualSalary: 1_000_000 } })
    const covered = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), successor] })
    expect(recordContractReviewDecision(covered, { teamId: team.id, contractId: contract.id, intent: 'PURSUE_EXTENSION' })).toEqual({ ok: false, reason: 'REVIEW_NOT_AVAILABLE' })
  })

  it('reopens a deferred review at its next actual season boundary using the same identity', () => {
    const { world, team, contract } = reviewFixture()
    const deferred = recordContractReviewDecision(world, { teamId: team.id, contractId: contract.id, intent: 'DEFER' })
    expect(deferred.ok).toBe(true)
    if (!deferred.ok) return
    const decision = Object.values(deferred.world.contractReviewDecisionsById)[0]!
    const outlookBefore = assessContractReviewOutlook(deferred.world, team.id)
    expect(outlookBefore.reviews.find((item) => item.id === decision.id)?.status).toBe('DEFERRED')
    const revisited = updateGameWorld(deferred.world, { currentDate: decision.reviewAgainOn! })
    const reopened = assessContractReviewOutlook(revisited, team.id).reviews.find((item) => item.id === decision.id)
    expect(reopened?.status).toBe(decision.reviewAgainOn! < contract.term.expiresOn ? 'REVIEW_REQUIRED' : 'RESOLVED_EXPIRED')
  })

  it('marks successor, player departure, expiry, and termination as resolved or stale history', () => {
    const { world, team, playerId, contract } = reviewFixture()
    const saved = recordContractReviewDecision(world, { teamId: team.id, contractId: contract.id, intent: 'ALLOW_EXPIRY' })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const successor = createPlayerContract({ id: contractIdFromString(`bs11b-resolver-successor:${team.id}`), teamId: team.id, playerId, kind: 'standard', term: { startsOn: contract.term.expiresOn, expiresOn: addDays(contract.term.expiresOn, 365) }, compensation: { annualSalary: 1_000_000 } })
    const covered = updateGameWorld(saved.world, { contracts: [...Object.values(saved.world.contractsById), successor] })
    expect(assessContractReviewOutlook(covered, team.id).reviews.find((item) => item.contractId === contract.id)?.status).toBe('RESOLVED_BY_SUCCESSOR')

    const departed = updateGameWorld(saved.world, {
      teams: Object.values(saved.world.teams).map((candidate) => candidate.id === team.id ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.filter((id) => id !== playerId) } : candidate),
      lineupsByTeamId: { ...saved.world.lineupsByTeamId, [team.id]: clearPlayerFromLineup(saved.world.lineupsByTeamId[team.id]!, playerId) },
    })
    expect(assessContractReviewOutlook(departed, team.id).reviews.find((item) => item.contractId === contract.id)?.status).toBe('RESOLVED_PLAYER_LEFT')

    const expired = updateGameWorld(saved.world, { currentDate: contract.term.expiresOn })
    expect(assessContractReviewOutlook(expired, team.id).reviews.find((item) => item.contractId === contract.id)?.status).toBe('RESOLVED_EXPIRED')
    const terminatedContract = createPlayerContract({ ...contract, termination: { terminatedOn: world.currentDate, reason: 'released' } })
    const terminated = updateGameWorld(saved.world, { contracts: Object.values(saved.world.contractsById).map((item) => item.id === contract.id ? terminatedContract : item) })
    expect(assessContractReviewOutlook(terminated, team.id).reviews.find((item) => item.contractId === contract.id)?.status).toBe('RESOLVED_TERMINATED')
  })
})
