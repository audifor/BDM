// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNcaaSimulatedGame } from '@/app/game/createNcaaSimulatedGame'
import { createTransferPortalEntry } from '@/domain/eligibility'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { TransferPortalWorkspace } from '@/ui-ng/applications/talent/TransferPortalWorkspace'
import { buildTalentAttentionItems } from './TalentAttentionProjection'

afterEach(cleanup)

describe('TransferPortalWorkspace', () => {
  it('shows own pending Portal status and invokes the canonical education action', () => {
    const initial = createNcaaSimulatedGame()
    const team = getUserTeam(initial)!
    const playerId = team.rosterPlayerIds[0]!
    const competition = Object.values(initial.competitions).find((item) => item.participantTeamIds.includes(team.id))!
    const rules = Object.values(initial.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    const entry = createTransferPortalEntry({
      id: 'bs15h-own-portal-entry',
      playerId,
      sourceTeamId: team.id,
      ecosystemId: competition.ecosystemId,
      rulesetId: rules.id,
      notifiedOn: initial.currentDate,
      status: 'noticePending',
    })
    const world = updateGameWorld(initial, { transferPortalEntries: [entry] })
    useGameStore.getState().replaceWorld(world)

    render(<TransferPortalWorkspace />)
    expect(screen.getByText(/Your roster/)).toBeInTheDocument()
    expect(screen.getByText('Unknown · no program assessment')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter Portal eligibility' }), { target: { value: 'Blocked' } })
    expect(screen.queryByText(/Your roster/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter Portal eligibility' }), { target: { value: 'Unknown' } })
    expect(screen.getByText(/Your roster/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Complete education module' }))

    expect(useGameStore.getState().world?.transferPortalEntriesById[entry.id]?.educationalModuleCompletedOn).toBe(world.currentDate)
    expect(screen.getAllByText(/processing due/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Process notice' }))
    const authorized = useGameStore.getState().world!
    expect(authorized.transferPortalEntriesById[entry.id]?.status).toBe('authorized')
    expect(buildTalentAttentionItems(authorized).some((item) => item.id === `own-portal:${entry.id}`)).toBe(true)
    expect(buildTalentAttentionItems(authorized).some((item) => item.id === `retention:${entry.id}`)).toBe(false)
  })
})
