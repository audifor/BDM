import { createHash } from 'node:crypto'
import { getPlayerContractStatus } from '@/domain/contract'
import type { GameWorld } from '@/domain/world'
import type { SaveGameEnvelopeV4 } from '@/save/GameWorldSaveV4'
import { stableStringify } from './TalentLongHorizonCertification'

/** Hash each JSON-safe record separately, retaining all persisted fields and array order. */
export function scalePayloadFingerprints(envelope: SaveGameEnvelopeV4): Record<string, string> {
  return Object.fromEntries(Object.entries(envelope.payload).map(([key, value]) => {
    const digest = createHash('sha256')
    if (Array.isArray(value)) {
      const records = key === 'personalities' || key === 'morale'
        ? [...value].sort((a, b) => String(a.coachId ?? a.personId).localeCompare(String(b.coachId ?? b.personId))) : value
      for (const record of records) digest.update(stableStringify(record)).update('\n')
    } else digest.update(stableStringify(value))
    return [key, digest.digest('hex')]
  }))
}

export function scaleWorldIdentity(world: GameWorld) {
  const ids = (records: object) => Object.keys(records).sort()
  const contracts = Object.values(world.contractsById)
  return {
    date: world.currentDate, persons: ids(world.personsById), players: ids(world.players),
    playerContracts: ids(world.contractsById), staffContracts: ids(world.staffContractsById),
    scheduledPlayerContracts: contracts.filter(contract => getPlayerContractStatus(contract, world.currentDate) === 'scheduled').map(contract => contract.id).sort(),
    rights: ids(world.playerRightsById), transactions: ids(world.playerTransactionsById),
    rosters: Object.fromEntries(Object.values(world.teams).map(team => [team.id, [...team.rosterPlayerIds]])),
    enrollments: ids(world.playerEnrollmentsById), commitments: ids(world.recruitingCommitmentsById),
    drafts: ids(world.draftsById), draftPicks: ids(world.draftPicksById), portal: ids(world.transferPortalEntriesById),
  }
}
