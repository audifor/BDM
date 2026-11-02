// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { getUserTeam } from '@/engine/calendar'
import { evaluateTransferFee, transferFeeAuthorization } from '@/app/transfer'
import { addDays } from '@/domain/date'
import { createAuthorizedEconomicEvent, processOperatingCostEconomicEvent } from '@/domain/finance'
import { assessSellerAskingFee } from '@/engine/transfer'
import { useGameStore } from '@/stores/gameStore'
import { createF3Day0, f3AdvanceDay, f3Store, f3World } from '@/app/game/testSupport/PlayableF3Support'
import { f3TransferCandidates, f3TransferFor } from '@/app/game/testSupport/PlayableF3TransferSupport'
import { MarketWorkspace } from './MarketWorkspace'

afterEach(cleanup)
vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 })
it('shows the real compensation refusal before accepting a counter, independently of available salary budget', async () => {
  const opening = await createF3Day0()
  f3Store().replaceWorld(opening)
  const team = getUserTeam(opening)!
  const playerId = f3TransferCandidates(opening)[0]!
  const seller = Object.values(opening.teams).find(item => item.rosterPlayerIds.includes(playerId))!
  const ask = assessSellerAskingFee(opening, seller.id, playerId)!
  f3Store().proposeTransfer(team.id, playerId, Math.round(ask.askingFee * 0.8 / 1_000) * 1_000)
  const proposed = f3TransferFor(team.id, playerId)!
  f3AdvanceDay()
  const countered = f3TransferFor(team.id, playerId)!
  expect(countered.clubStatus).toBe('CLUB_COUNTERED')
  const transfer = f3World().playerTransferNegotiationsById[proposed.id]!
  const fee = transfer.clubRounds.at(-1)!.response!.counterFee!
  const headroom = transferFeeAuthorization(f3World(), team.id).headroomMinorUnits!
  const event = createAuthorizedEconomicEvent({
    id: 'final01:test:fee-capacity', eventType: 'OPERATING_COST_RECOGNITION', sourceAuthority: 'FUTURE_COST_ENGINE', sourceEntityId: 'final01:test:fee-capacity',
    organizationId: team.organizationId, effectiveOn: f3World().currentDate, dueOn: addDays(f3World().currentDate, 30), amount: { currencyCode: 'EUR', minorUnits: Math.max(1, headroom - 1_000) },
    provenance: { kind: 'TEST_PENDING_OPERATION', id: 'final01:test:fee-capacity' }, idempotencyKey: 'final01:test:fee-capacity', teamId: team.id, expenseCategory: 'TRANSFER_FEE',
  })
  const occupied = processOperatingCostEconomicEvent(f3World(), event, { recognize: false })
  expect(occupied.status).toBe('accepted')
  f3Store().replaceWorld(occupied.world)
  expect(evaluateTransferFee(f3World(), team.id, fee, transfer.id).allowed).toBe(false)
  useGameStore.getState().replaceWorld(f3World())
  window.history.replaceState({}, '', '/?ui=ng&app=market&marketTab=operations')
  render(<MarketWorkspace initialTab="operations" />)
  const transfers = screen.getByTestId('market-transfers')
  expect(within(transfers).getByText(/Es una partida distinta del salario/)).toBeInTheDocument()
  expect(within(transfers).getByText(/Finance no autoriza esta compensación/)).toBeInTheDocument()
  expect(within(transfers).getByText(/La petición supera el margen autorizado para compensaciones/)).toBeInTheDocument()
  expect(transfers.textContent).not.toContain('INSUFFICIENT_AUTHORIZED_HEADROOM')
  const accept = within(transfers).getByRole('button', { name: 'Aceptar la compensación del club' })
  expect(accept).toBeDisabled()
  const before = useGameStore.getState().world
  fireEvent.click(accept)
  expect(useGameStore.getState().world).toBe(before)
}, 900_000)
