import { expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { getFreeAgents } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { assessActiveContractRosterIntegrity } from '@/engine/market/RosterContractIntegrity'
import { executePlayerTransfer } from '@/app/transfer'
import { f3Store, f3World } from './testSupport/PlayableF3Support'
import { f3PlayTransfer, f3TransferCandidates } from './testSupport/PlayableF3TransferSupport'
import { WORLDDB_V2_COMPETITIONS } from './WorldDbV2Competitions'

it.skipIf(process.env.BDM_UNIVERSE_MARKET !== '1')('the global market executes an existing permitted contract between active leagues without cloning a person', () => {
  const out = resolve('.worlddb-v2/universe-05/market')
  mkdirSync(out, { recursive: true })
  const opening = deserializeGameWorldSaveV4(JSON.parse(readFileSync('.worlddb-v2/universe-05/day-30.json', 'utf8')))
  const user = getUserTeam(opening)!
  const snapshots = WORLDDB_V2_COMPETITIONS.map(c => JSON.parse(readFileSync(`.worlddb-v2/universe-05/${c.countryCode}-snapshot.json`, 'utf8')))
  const freeIds = new Set(getFreeAgents(opening).map(p => p.id))
  for (const snapshot of snapshots) expect(snapshot.freeAgents.some((p: { entity_id: string }) => freeIds.has(p.entity_id as never))).toBe(true)
  const sourceLeague = (teamId: string) => Object.values(opening.competitions).find(c => c.participantTeamIds.includes(teamId as never))!.id
  const foreignCandidates = f3TransferCandidates(opening, 200).filter(id => {
    const seller = Object.values(opening.teams).find(t => t.rosterPlayerIds.includes(id))!
    return sourceLeague(seller.id) !== sourceLeague(user.id)
  })
  expect(foreignCandidates.length).toBeGreaterThan(0)
  const attempts: unknown[] = []
  let executed = false
  for (const playerId of foreignCandidates.slice(0, 12)) {
    f3Store().replaceWorld(opening)
    const result = f3PlayTransfer(playerId)
    attempts.push({ playerId, status: result.status, stoppedAt: result.stoppedAt, log: result.log })
    if (result.status !== 'EXECUTED') continue
    const world = f3World(), transfer = world.playerTransferNegotiationsById[result.transferId!]!
    expect(sourceLeague(transfer.sellerTeamId)).not.toBe(sourceLeague(transfer.buyerTeamId))
    expect(world.teams[transfer.sellerTeamId]!.rosterPlayerIds).not.toContain(playerId)
    expect(world.teams[transfer.buyerTeamId]!.rosterPlayerIds).toContain(playerId)
    expect(world.players[playerId]!.personId).toBe(opening.players[playerId]!.personId)
    expect(Object.keys(world.players).sort()).toEqual(Object.keys(opening.players).sort())
    expect(assessActiveContractRosterIntegrity(world, playerId)).toBe('VALID')
    expect(executePlayerTransfer(world, transfer.id).status).toBe('ALREADY_EXECUTED')
    const save = serializeGameWorldV4(world, '2026-10-27T12:00:00Z')
    expect(projectPersistentWorldTruth(deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(save))))).toEqual(projectPersistentWorldTruth(world))
    writeFileSync(resolve(out, 'transferred.json'), JSON.stringify(save))
    executed = true
    break
  }
  writeFileSync(resolve(out, 'acceptance.json'), JSON.stringify({ passed: executed, policy: 'Existing BDM_TRANSFER_POLICY_V1 and generated contracts, Finance and Governance; no new international registration rules', attempts }, null, 2))
  expect(executed, JSON.stringify(attempts)).toBe(true)
}, 7_200_000)
