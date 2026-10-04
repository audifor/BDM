// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createNcaaSimulatedGame } from '@/app/game/createNcaaSimulatedGame'
import { createTransferPortalEntry } from '@/domain/eligibility'
import { updateGameWorld } from '@/domain/world'
import { generateRecruitingPool } from '@/engine/recruiting'
import { RecruitingScreen } from './RecruitingScreen'

afterEach(cleanup)

describe('College Recruiting UI', () => {
  it('shows continuation, cap, Portal requirements, public production, knowledge, and separate compensation', () => {
    const base = createNcaaSimulatedGame()
    const season = base.seasons[base.currentSeasonId]!
    const competition = base.competitions[season.competitionId]!
    const source = competition.participantTeamIds.map((id) => base.teams[id]!).find((item) => item.coachId !== base.userCoachId && item.rosterPlayerIds.length > 0)!
    const ruleset = Object.values(base.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    const entry = createTransferPortalEntry({ id: 'ui:pending-transfer', playerId: source.rosterPlayerIds[0]!, sourceTeamId: source.id, ecosystemId: competition.ecosystemId, rulesetId: ruleset.id, notifiedOn: base.currentDate, status: 'noticePending' })
    const world = updateGameWorld(base, { transferPortalEntries: [entry] })
    const markup = render(<RecruitingScreen world={world} onAddTarget={vi.fn()} onRemoveTarget={vi.fn()} onAction={vi.fn(() => null)} onOffer={vi.fn(() => null)} />).container.textContent!
    for (const phrase of ['Institutional benefits cap room', 'Stay:', 'Leave:', 'Concerns:', 'Trust:', 'actual role', 'Coach change:', 'Aid:', 'Institutional benefits:', 'Third-party NIL:', 'Portal authorization: noticePending', 'Education module incomplete', 'Public production:', 'OrganizationKnowledge:', 'Transfer priority:', 'Eligibility:', 'Available cap room:', 'serious compliance sanctions']) expect(markup).toContain(phrase)
  })

  it.each([
    ['TRANSFER_PORTAL_AUTHORIZATION_REQUIRED', 'autorizacion del Portal'],
    ['CAP_EXCEEDED', 'limite institucional'],
    ['STAFF_ACTIVITY_SUSPENDED', 'Staff esta suspendido'],
    ['TRANSFER_DESTINATION_INELIGIBLE', 'elegibilidad deportiva'],
    ['RECRUIT_ALREADY_SIGNED', 'acuerdo terminal firmado'],
  ])('shows blocked action reason %s', (reason, expected) => {
    const base = createNcaaSimulatedGame()
    const cycle = Object.values(base.recruitingCyclesById).find((item) => base.ecosystems[item.ecosystemId]?.kind === 'ncaaLike' && base.ecosystems[item.ecosystemId]?.category === 'men')!
    const world = generateRecruitingPool(base, cycle.id)
    render(<RecruitingScreen world={world} onAddTarget={vi.fn()} onRemoveTarget={vi.fn()} onAction={vi.fn(() => reason)} onOffer={vi.fn(() => null)} />)
    fireEvent.click(screen.getAllByRole('button', { name: /CONTACT/ })[0]!)
    expect(screen.getByRole('status').textContent).toContain(expected)
  })
})
