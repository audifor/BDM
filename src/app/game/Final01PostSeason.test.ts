import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { getContractFinancialSchedule } from '@/domain/finance'
import { deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { validateGameWorld } from '@/domain/world'

const directory = process.env.BDM_FINAL01_NATIVE_DIR
it.skipIf(!directory)('keeps the real renewal and release economically and historically coherent in the successor season', () => {
  const load = (name: string) => deserializeGameWorldSaveV4(JSON.parse(readFileSync(join(directory!, name+'.json'), 'utf8')))
  const before = load('after-native-advance'), after = load('25-release-player')
  const renewal = Object.values(after.retentionNegotiationsById).find(item => item.execution?.status === 'SIGNED')!
  expect(renewal).toBeDefined()
  const successor = after.contractsById[renewal.execution!.contractId]!, predecessor = after.contractsById[renewal.predecessorContractId]!
  expect(successor.predecessorContractId).toBe(predecessor.id)
  expect(successor.term.startsOn).toBe(predecessor.term.expiresOn)
  expect(successor.playerId).toBe(predecessor.playerId)
  const release = Object.values(after.playerTransactionsById).find(item => item.kind === 'released' && item.occurredOn === after.currentDate)!
  const oldContract = before.contractsById[release.contractId!]!, ended = after.contractsById[oldContract.id]!
  expect(ended.termination).toMatchObject({ reason: 'released', terminatedOn: after.currentDate })
  expect(after.teams[oldContract.teamId]!.rosterPlayerIds).not.toContain(oldContract.playerId)
  const schedule = (world: typeof before) => getContractFinancialSchedule(world, { organizationId: world.teams[oldContract.teamId]!.organizationId, currencyCode: 'EUR', includeConditional: false })
    .filter(entry => entry.contractId === oldContract.id && entry.effectiveOn > after.currentDate && entry.compensationStatus === 'GUARANTEED')
  expect(schedule(before).length).toBeGreaterThan(0)
  expect(schedule(after)).toEqual(schedule(before))
  for (const fact of Object.values(before.financialTransactionsById)) expect(after.financialTransactionsById[fact.id]).toEqual(fact)
  validateGameWorld(after)
  writeFileSync(join(directory!, 'post-season-operations-acceptance.json'), JSON.stringify({ passed:true, date:after.currentDate, renewalPlayerId:renewal.playerId, successorId:successor.id, releasedPlayerId:oldContract.playerId, guaranteedFuturePayrollEntries:schedule(after).length, originalFinancialHistoryUnchanged:true },null,2))
}, 300_000)
