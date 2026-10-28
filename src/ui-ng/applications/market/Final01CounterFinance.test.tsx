// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it } from 'vitest'
import { deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { getUserTeam } from '@/engine/calendar'
import { evaluateTransferFee } from '@/app/transfer'
import { useGameStore } from '@/stores/gameStore'
import { MarketWorkspace } from './MarketWorkspace'

afterEach(cleanup)
it('shows the real compensation refusal before accepting a counter, independently of available salary budget', () => {
  const world = deserializeGameWorldSaveV4(JSON.parse(gunzipSync(readFileSync('docs/playable/evidence/final-01/counter-fee-refused.save.json.gz')).toString('utf8')))
  const transfer = Object.values(world.playerTransferNegotiationsById).find(t => t.status === 'IN_PROGRESS')!
  const fee = transfer.clubRounds.at(-1)!.response!.counterFee!
  expect(evaluateTransferFee(world, getUserTeam(world)!.id, fee, transfer.id).allowed).toBe(false)
  useGameStore.getState().resetGame();useGameStore.getState().replaceWorld(world)
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
}, 30_000)
