import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { contractIdFromString } from '@/domain/ids'
import { createPlayerContract } from '@/domain/contract'
import type { Draft, DraftEntry } from '@/domain/draft'
import type { GameWorld } from '@/domain/world'
import { DraftPlayerStatus } from './DraftPlayerStatus'

function fixture() {
  const base = createNewGame()
  const player = Object.values(base.players).find((item) => !Object.values(base.playerEnrollmentsById).some((enrollment) => enrollment.playerId === item.id))!
  const nba = Object.values(base.teams).find((team) => Object.values(base.competitions).some((competition) => competition.participantTeamIds.includes(team.id) && base.ecosystems[competition.ecosystemId]?.kind === 'nbaLike'))!
  const draft: Draft = { id: 'ui-blocked-draft', ecosystemId: Object.values(base.competitions).find((competition) => competition.participantTeamIds.includes(nba.id))!.ecosystemId, sourceSeasonId: base.currentSeasonId, rules: { rounds: 1, orderMethod: 'reverseStandings', scheduledAfterDays: 0, earlyEntryDeadline: '2033-04-24' as never, collegeWithdrawalDeadline: '2033-05-27' as never, finalWithdrawalDeadline: '2033-06-13' as never }, scheduledOn: '2033-06-23' as never, status: 'scheduled', prospectPlayerIds: [] }
  return { base, playerId: player.id, nbaTeamId: nba.id, draft, world: { ...base, draftsById: { ...base.draftsById, [draft.id]: draft } } as GameWorld }
}

function markup(world: GameWorld, draft: Draft, playerId: keyof GameWorld['players']) {
  return renderToStaticMarkup(createElement(DraftPlayerStatus, { world, draft, playerId: playerId as never }))
}

describe('Draft Player status UI blocked reasons', () => {
  it('renders user-facing reasons for ineligibility, deadlines, withdrawals and selections', () => {
    const { world, playerId, draft } = fixture()
    const ineligibleDraft = { ...draft, rules: { ...draft.rules, minimumAgeDuringDraftYear: 99 } }
    expect(markup(world, ineligibleDraft, playerId)).toContain('Player is not Draft eligible')

    expect(markup({ ...world, currentDate: '2033-04-25' as never }, draft, playerId)).toContain('The declaration deadline (2033-04-24) has passed.')
    const declared: DraftEntry = { id: 'ui-entry', draftId: draft.id, playerId, status: 'declaredEarlyEntry', entryType: 'early', sourcePathway: 'college', declaredOn: '2033-04-20' as never, provenance: 'PRODUCT_ABSTRACTION' }
    const lateCollegeDraft = { ...draft, entries: [declared] }
    expect(markup({ ...world, currentDate: '2033-06-01' as never }, lateCollegeDraft, playerId)).toContain('The NCAA return deadline (2033-05-27) has passed; withdrawal cannot restore college eligibility.')
    expect(markup({ ...world, currentDate: '2033-06-14' as never }, lateCollegeDraft, playerId)).toContain('The NBA withdrawal deadline (2033-06-13) has passed; withdrawal is no longer available.')

    const withdrawn = { ...lateCollegeDraft, entries: [{ ...declared, status: 'withdrawnNCAAEligible' as const }] }
    expect(markup(world, withdrawn, playerId)).toContain('This Player has already withdrawn from the Draft entry.')
    const pickId = 'ui-pick' as never
    const selectedWorld = { ...world, draftPicksById: { ...world.draftPicksById, [pickId]: { id: pickId, draftId: draft.id, round: 1, order: 1, originalTeamId: Object.keys(world.teams)[0] as never, ownerTeamId: Object.keys(world.teams)[0] as never, selection: { playerId, teamId: Object.keys(world.teams)[0] as never } } } }
    expect(markup(selectedWorld, draft, playerId)).toContain('This Player has already been selected and cannot be selected again.')
  })

  it('distinguishes rights, unsigned, signed, rostered and active-source-contract states', () => {
    const { world, playerId, nbaTeamId, draft } = fixture()
    const rightsId = 'ui-rights' as never
    const rights = { id: rightsId, playerId, ownerTeamId: nbaTeamId, rightsType: 'draft' as const, status: 'active' as const }
    const held = { ...world, playerRightsById: { ...world.playerRightsById, [rightsId]: rights } }
    expect(markup(held, draft, playerId)).toContain('RIGHTS_HELD · UNSIGNED')

    const contractId = contractIdFromString('ui-rights-contract')
    const contract = createPlayerContract({ id: contractId, playerId, teamId: nbaTeamId, kind: 'standard', term: { startsOn: world.currentDate, expiresOn: '2035-06-23' as never }, compensation: { annualSalary: 500_000 } })
    const signedRights = { ...rights, contractId }
    const signed = { ...held, playerRightsById: { ...held.playerRightsById, [rightsId]: signedRights }, contractsById: { ...held.contractsById, [contractId]: contract } }
    expect(markup(signed, draft, playerId)).toContain('SIGNED')
    const rostered = { ...signed, teams: { ...signed.teams, [nbaTeamId]: { ...signed.teams[nbaTeamId]!, rosterPlayerIds: [...signed.teams[nbaTeamId]!.rosterPlayerIds, playerId] } } }
    expect(markup(rostered, draft, playerId)).toContain('ROSTERED')

    const fibaCompetition = Object.values(world.competitions).find((competition) => world.ecosystems[competition.ecosystemId]?.kind === 'fibaLike')!
    const fibaTeamId = fibaCompetition.participantTeamIds[0]!
    const internationalPlayerId = world.teams[fibaTeamId]!.rosterPlayerIds[0]!
    const sourceContractId = contractIdFromString('ui-source-contract')
    const sourceContract = createPlayerContract({ id: sourceContractId, playerId: internationalPlayerId, teamId: fibaTeamId, kind: 'standard', term: { startsOn: world.currentDate, expiresOn: '2035-06-23' as never }, compensation: { annualSalary: 500_000 } })
    const withSourceContract = { ...world, contractsById: { ...world.contractsById, [sourceContractId]: sourceContract } }
    expect(markup(withSourceContract, draft, internationalPlayerId)).toContain('active source contract')
  })
})
