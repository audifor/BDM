import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { getPlayerContractStatus } from '@/domain/contract'
import { repairRosterContractIntegrity } from '@/engine/market/RosterContractIntegrity'
import { playerIdFromString } from '@/domain/ids'

describe('BS15I annual Save V4 contract integrity', () => {
  for (const date of ['2033-10-01', '2034-10-01', '2035-10-01', '2036-10-01', '2037-10-01']) {
    it(`preserves all roster and contract authorities at ${date}`, () => {
      const savePrefix = process.env.BS15I_CHECKPOINT_SAVE_PREFIX
      if (savePrefix === undefined) return
      const world = deserializeGameWorldV4(JSON.parse(readFileSync(`${savePrefix}.${date}.json`, 'utf8')))
      expect(world.currentDate).toBe(date)
      const players = Object.values(world.players)
      expect(new Set(players.map(player => player.personId)).size).toBe(players.length)
      for (const enrollment of Object.values(world.playerEnrollmentsById)) {
        if (enrollment.status !== 'active' || enrollment.startsOn > world.currentDate || world.ecosystems[enrollment.ecosystemId]?.kind !== 'ncaaLike') continue
        expect(world.teams[enrollment.teamId]?.rosterPlayerIds).toContain(enrollment.playerId)
        expect(Object.values(world.academicProfilesById).some(profile => profile.playerId === enrollment.playerId && profile.programTeamId === enrollment.teamId && profile.ecosystemId === enrollment.ecosystemId)).toBe(true)
        expect(Object.values(world.eligibilityProfilesById).some(profile => profile.playerId === enrollment.playerId && profile.programTeamId === enrollment.teamId && profile.ecosystemId === enrollment.ecosystemId)).toBe(true)
      }
      expect(Object.keys(world.transferPortalRulesetsById).length).toBeGreaterThan(0)
      expect(world.players[playerIdFromString('generated-player-0001')]!.personId).toBe('person:player:generated-player-0001')
      const integrity = repairRosterContractIntegrity(world)
      expect(integrity.reports.filter(report => report.classification === 'RECOVERABLE' || report.classification === 'UNRECOVERABLE')).toEqual([])
      expect(integrity.world).toBe(world)
      for (const contract of Object.values(world.contractsById)) {
        if (getPlayerContractStatus(contract, world.currentDate) !== 'active') continue
        expect(world.players[contract.playerId]).toBeDefined()
        expect(world.players[contract.playerId]!.personId).toBeDefined()
        expect(world.personsById[world.players[contract.playerId]!.personId!]).toBeDefined()
        expect(world.teams[contract.teamId]!.rosterPlayerIds.filter(playerId => playerId === contract.playerId)).toHaveLength(1)
      }
      for (const transaction of Object.values(world.playerTransactionsById)) {
        if (transaction.kind !== 'signedFreeAgent') continue
        const contract = world.contractsById[transaction.contractId!]
        expect(contract).toBeDefined()
        expect(contract!.playerId).toBe(transaction.playerId)
        // Trades preserve the signing record while moving the contract's current Team.
        expect(world.teams[transaction.toTeamId!]).toBeDefined()
        expect(contract!.term.startsOn).toBe(transaction.occurredOn)
      }
      for (const negotiation of Object.values(world.negotiationsById)) {
        if (negotiation.status !== 'SIGNED') continue
        const contract = world.contractsById[negotiation.signedContractId!]
        const transaction = world.playerTransactionsById[negotiation.signedTransactionId!]
        expect(contract).toBeDefined()
        expect(transaction).toMatchObject({ kind: 'signedFreeAgent', playerId: negotiation.playerId, contractId: contract!.id, toTeamId: negotiation.teamId })
      }
      process.stdout.write(`[BS15I checkpoint integrity] ${JSON.stringify({ date,
        contracts: Object.keys(world.contractsById).length,
        signedTransactions: Object.values(world.playerTransactionsById).filter(transaction => transaction.kind === 'signedFreeAgent').length,
        drafts: Object.keys(world.draftsById).length,
        recruitingCycles: Object.keys(world.recruitingCyclesById).length,
        portalEntries: Object.keys(world.transferPortalEntriesById).length,
        portalRulesets: Object.keys(world.transferPortalRulesetsById).length,
      })}\n`)
    }, 60_000)
  }
})
