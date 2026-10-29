import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { addYears } from '@/domain/date'
import { createPlayerContract } from '@/domain/contract'
import { contractIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { reconcileExpiredPlayerContracts } from '@/engine/market/ContractLifecycle'
import { deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'

it('retains the signing authority through an actual expiry, including a renewed successor', () => {
  const world = deserializeGameWorldSaveV4(JSON.parse(gunzipSync(readFileSync('docs/playable/evidence/final-01/counter-fee-refused.save.json.gz')).toString('utf8')))
  const signing = Object.values(world.negotiationsById).find(item => item.status === 'SIGNED' && item.signedContractId !== undefined)!
  const original = world.contractsById[signing.signedContractId!]!
  const atExpiry = updateGameWorld(world, { currentDate: original.term.expiresOn })
  const withoutEvidence = Object.values(atExpiry.teams).map(team => team.id === original.teamId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter(id => id !== original.playerId) } : team)
  expect(() => updateGameWorld(atExpiry, { teams: withoutEvidence })).toThrow(/player signing effects/)
  const expired = reconcileExpiredPlayerContracts(atExpiry, original.term.expiresOn)
  expect(expired.teams[original.teamId]!.rosterPlayerIds).not.toContain(original.playerId)
  expect(expired.negotiationsById[signing.id]).toEqual(signing)
  expect(Object.values(expired.playerTransactionsById).filter(t => t.kind === 'contractExpired' && t.contractId === original.id)).toHaveLength(1)
  expect(reconcileExpiredPlayerContracts(expired, original.term.expiresOn)).toBe(expired)

  const successor = createPlayerContract({ id: contractIdFromString('final01:renewed-successor'), playerId: original.playerId, teamId: original.teamId, kind: 'standard', predecessorContractId: original.id, term: { startsOn: original.term.expiresOn, expiresOn: addYears(original.term.expiresOn, 1) }, compensation: original.compensation })
  const renewed = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), successor], currentDate: successor.term.expiresOn })
  const expiredSuccessor = reconcileExpiredPlayerContracts(renewed, successor.term.expiresOn)
  expect(expiredSuccessor.teams[original.teamId]!.rosterPlayerIds).not.toContain(original.playerId)
  expect(Object.values(expiredSuccessor.playerTransactionsById).filter(t => t.kind === 'contractExpired' && t.contractId === successor.id)).toHaveLength(1)
}, 60_000)
