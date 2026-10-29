import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { getUserTeam } from '@/engine/calendar'
import { updateGameWorld, validateGameWorld } from '@/domain/world'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { advanceGameDayWithResultAsync } from './advanceGameDay'
import { createUniverseAcceptanceRunner } from './testSupport/WorldDbV2UniverseRunner'

const input = process.env.BDM_FINAL01_EXPIRY_SAVE
it.skipIf(!input)('advances the real Windows career past a signed free agent contract expiry and preserves its historical authorization', async () => {
  const before = deserializeGameWorldSaveV4(JSON.parse(readFileSync(input!, 'utf8')))
  const team = getUserTeam(before)!
  const negotiation = Object.values(before.negotiationsById).find(item => item.status === 'SIGNED' && item.signedContractId !== undefined)!
  const contract = before.contractsById[negotiation.signedContractId!]!
  expect(contract.term.expiresOn).toBe('2026-10-07')
  expect(team.rosterPlayerIds).toContain(contract.playerId)
  const runner = createUniverseAcceptanceRunner()
  try {
    let seed = 151617
    const result = await advanceGameDayWithResultAsync(before, runner, () => seed++)
    expect(result.status, JSON.stringify(result.failure)).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
    const after = result.world
    expect(after.currentDate).toBe(contract.term.expiresOn)
    expect(after.teams[team.id]!.rosterPlayerIds).not.toContain(contract.playerId)
    expect(after.contractsById[contract.id]).toEqual(contract)
    expect(after.negotiationsById[negotiation.id]).toEqual(negotiation)
    const expiration = Object.values(after.playerTransactionsById).filter(item => item.kind === 'contractExpired' && item.contractId === contract.id)
    expect(expiration).toHaveLength(1)
    expect(expiration[0]).toMatchObject({ playerId: contract.playerId, fromTeamId: team.id, occurredOn: contract.term.expiresOn })
    validateGameWorld(after)
    expect(() => updateGameWorld(after, { playerTransactions: Object.values(after.playerTransactionsById).filter(item => item.id !== expiration[0]!.id) })).toThrow()
    const restored = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(after, '2026-10-29T00:00:00Z'))))
    expect(projectPersistentWorldTruth(restored)).toEqual(projectPersistentWorldTruth(after))
    writeFileSync('.worlddb-v2/final-01/native-expiry-acceptance.json', JSON.stringify({ passed: true, date: after.currentDate, playerId: contract.playerId, contractId: contract.id, expirationId: expiration[0]!.id, authorizationPreserved: true, exactSaveRoundTrip: true }, null, 2))
  } finally { runner.dispose() }
}, 600_000)
