import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import type { Draft, DraftPick } from '@/domain/draft'
import type { GameWorld } from '@/domain/world'

import { DraftScreen } from './DraftScreen'

describe('DraftScreen', () => {
  it('renders active draft status, current pick, available prospects and history for a user pick', () => {
    const { world, prospect } = draftFixture('inProgress', true)
    const markup = renderToStaticMarkup(createElement(DraftScreen, { world, onSelectProspect: () => undefined }))

    expect(markup).toContain('Status:')
    expect(markup).toContain('inProgress')
    expect(markup).toContain('Round 1')
    expect(markup).toContain(`Pick #1`)
    expect(markup).toContain(`${prospect.firstName} ${prospect.lastName}`)
    expect(markup).toContain('You are on the clock')
    expect(markup).toContain('SELECT')
    expect(markup).toContain('Draft history')
  })

  it('does not expose selection controls for an AI pick and displays transferred ownership', () => {
    const { world, originalTeam, ownerTeam } = draftFixture('inProgress', false)
    const markup = renderToStaticMarkup(createElement(DraftScreen, { world, onSelectProspect: () => undefined }))

    expect(markup).toContain(`${ownerTeam.name} is on the clock`)
    expect(markup).toContain('Selection is unavailable until your team owns the current pick.')
    expect(markup).not.toContain('>SELECT<')
    expect(markup).toContain(originalTeam.name)
    expect(markup).toContain(ownerTeam.name)
  })

  it('shows completed history without selection controls', () => {
    const { world, prospect } = draftFixture('completed', true)
    const markup = renderToStaticMarkup(createElement(DraftScreen, { world, onSelectProspect: () => undefined }))

    expect(markup).toContain('Draft completed')
    expect(markup).toContain(`${prospect.firstName} ${prospect.lastName}`)
    expect(markup).not.toContain('>SELECT<')
  })

  it('renders a simple empty state without creating a draft', () => {
    const markup = renderToStaticMarkup(createElement(DraftScreen, { world: createNewGame(), onSelectProspect: () => undefined }))
    expect(markup).toContain('No draft available')
    expect(markup).toContain('No Draft-specific Inbox integration in V1.')
  })
})

function draftFixture(status: Draft['status'], userOwnsPick: boolean) {
  const base = createNewGame()
  const userTeam = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
  const originalTeam = Object.values(base.teams).find((team) => team.id !== userTeam.id)!
  const ownerTeam = userOwnsPick ? userTeam : originalTeam
  const prospect = Object.values(base.players)[0]!
  const season = Object.values(base.seasons)[0]!
  const ecosystem = base.competitions[season.competitionId]!.ecosystemId
  const draft: Draft = { id: 'draft:screen', ecosystemId: ecosystem, sourceSeasonId: season.id, rules: { rounds: 1, orderMethod: 'reverseStandings', scheduledAfterDays: 0 }, scheduledOn: base.currentDate, status, prospectPlayerIds: [prospect.id] }
  const pick: DraftPick = { id: 'draft-pick:screen', draftId: draft.id, round: 1, order: 1, originalTeamId: originalTeam.id, ownerTeamId: ownerTeam.id, ...(status === 'completed' ? { selection: { playerId: prospect.id, teamId: ownerTeam.id } } : {}) }
  return { world: { ...base, draftsById: { [draft.id]: draft }, draftPicksById: { [pick.id]: pick } } as GameWorld, draft, prospect, originalTeam, ownerTeam }
}
