import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { getCashAccountBalances } from '@/domain/finance'
import { staffPersonIdFromString } from '@/domain/ids'

const folder = process.env.BDM_FINAL01_NATIVE_DIR
it.skipIf(!folder)('certifies the actual Courtside payroll, transfer and dismissal checkpoints without injected operations', () => {
  const load = (name: string) => deserializeGameWorldSaveV4(JSON.parse(readFileSync(join(folder!, name+'.json'), 'utf8')))
  const before = load('20-transfer-approval'), transferred = load('21-transfer-complete')
  const operation = Object.values(transferred.playerTransferNegotiationsById).find(n => n.status === 'EXECUTED')!
  expect(operation).toBeDefined()
  const cash = (world: typeof before, organizationId: string) => getCashAccountBalances(world, organizationId).reduce((sum, account) => sum + account.balanceMinorUnits, 0)
  expect(cash(transferred, operation.buyerOrganizationId) - cash(before, operation.buyerOrganizationId)).toBe(-operation.execution!.feeMinorUnits)
  expect(cash(transferred, operation.sellerOrganizationId) - cash(before, operation.sellerOrganizationId)).toBe(operation.execution!.feeMinorUnits)
  expect(transferred.teams[operation.buyerTeamId]!.rosterPlayerIds).toContain(operation.playerId)
  expect(transferred.teams[operation.sellerTeamId]!.rosterPlayerIds).not.toContain(operation.playerId)
  expect(transferred.players[operation.playerId]!.personId).toBe(before.players[operation.playerId]!.personId)
  expect(transferred.contractsById[operation.sellerContractId]!.termination).toBeDefined()
  expect(transferred.contractsById[operation.execution!.buyerContractId]).toBeDefined()
  for (const fact of Object.values(before.financialTransactionsById)) expect(transferred.financialTransactionsById[fact.id]).toEqual(fact)

  const signed = Object.values(before.negotiationsById).find(n => n.status === 'SIGNED')!
  expect(signed).toBeDefined()
  const signingContract = Object.values(before.contractsById).find(c => c.playerId === signed.playerId)!
  expect(Object.values(before.expenseRecognitionsById).filter(e => e.dimensions?.contractId === signingContract.id && e.recognizedOn === signingContract.term.startsOn)).toHaveLength(1)
  expect(Object.values(before.matchStatLogsByGameId).filter(log => log.resolution === 'FULL')).toHaveLength(1)

  const dismissed = load('22-dismiss-staff'), staffId = staffPersonIdFromString('pbm:DYN_person:66494')
  expect(dismissed.staffEmploymentByStaffId[staffId]).toEqual({ status: 'unemployed' })
  expect(Object.values(dismissed.teamStaffAssignmentsById).some(a => a.staffPersonId === staffId)).toBe(false)
  expect(Object.values(dismissed.staffContractsById).some(c => c.staffId === staffId && c.termination !== undefined)).toBe(true)
  expect(Object.values(dismissed.staffJobOpeningsById).some(v => v.teamId === operation.buyerTeamId && v.roleId === 'regionalScout' && v.status === 'open')).toBe(true)
  for (const fact of Object.values(transferred.financialTransactionsById)) expect(dismissed.financialTransactionsById[fact.id]).toEqual(fact)
  writeFileSync(join(folder!, 'native-operations-acceptance.json'), JSON.stringify({ passed: true, date: dismissed.currentDate,
    transferId: operation.id, feeMinorUnits: operation.execution!.feeMinorUnits, cashConservedBetweenClubs: true,
    originalIdentityPreserved: true, freeAgentFirstPayrollExactlyOnce: true, staffDismissalWithHistoryPreserved: true }, null, 2))
}, 180_000)
