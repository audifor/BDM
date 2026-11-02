import { expect, it } from 'vitest'
import { addYears } from '@/domain/date'
import { createPlayerContract } from '@/domain/contract'
import { contractIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { reconcileExpiredPlayerContracts } from '@/engine/market/ContractLifecycle'
import { createAcbTestGame } from './createAcbTestGame'

it('expires an active contract once and also expires its renewed successor', () => {
  const world = createAcbTestGame()
  const original = Object.values(world.contractsById).find(contract => contract.term.expiresOn > world.currentDate)!
  const atExpiry = updateGameWorld(world, { currentDate: original.term.expiresOn })
  const expired = reconcileExpiredPlayerContracts(atExpiry, original.term.expiresOn)
  expect(expired.teams[original.teamId]!.rosterPlayerIds).not.toContain(original.playerId)
  expect(Object.values(expired.playerTransactionsById).filter(t => t.kind === 'contractExpired' && t.contractId === original.id)).toHaveLength(1)
  expect(reconcileExpiredPlayerContracts(expired, original.term.expiresOn)).toBe(expired)

  const successor = createPlayerContract({ id: contractIdFromString('final01:renewed-successor'), playerId: original.playerId, teamId: original.teamId, kind: 'standard', predecessorContractId: original.id, term: { startsOn: original.term.expiresOn, expiresOn: addYears(original.term.expiresOn, 1) }, compensation: original.compensation })
  const renewed = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), successor], currentDate: successor.term.expiresOn })
  const expiredSuccessor = reconcileExpiredPlayerContracts(renewed, successor.term.expiresOn)
  expect(expiredSuccessor.teams[original.teamId]!.rosterPlayerIds).not.toContain(original.playerId)
  expect(Object.values(expiredSuccessor.playerTransactionsById).filter(t => t.kind === 'contractExpired' && t.contractId === successor.id)).toHaveLength(1)
}, 60_000)
