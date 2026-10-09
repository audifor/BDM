import { getPlayerContractStatus } from '@/domain/contract'
import type { GameWorld } from '@/domain/world'

/** Daily checks follow actual immutable roster/contract mutations, never historical ledgers. */
export function createLongHorizonMutationGuard(initial: GameWorld) {
  let previous = initial
  const owners = new Map<string, string>()
  for (const team of Object.values(initial.teams)) for (const id of team.rosterPlayerIds) {
    if (owners.has(id)) throw new Error(`Duplicate roster owner for ${id}`)
    owners.set(id, team.id)
  }
  const materializedPlayers = new Map(Object.values(initial.talentMaterializationsByCandidateKey).map(item => [item.playerId, item.candidateKey]))
  if (materializedPlayers.size !== Object.keys(initial.talentMaterializationsByCandidateKey).length) throw new Error('Duplicate initial materialization identity')
  return (world: GameWorld) => {
    if (previous.talentMaterializationsByCandidateKey !== world.talentMaterializationsByCandidateKey) {
      for (const key of Object.keys(previous.talentMaterializationsByCandidateKey)) if (!world.talentMaterializationsByCandidateKey[key]) throw new Error(`Materialization history removed at ${world.currentDate}: ${key}`)
      for (const [key, item] of Object.entries(world.talentMaterializationsByCandidateKey)) {
        const prior = previous.talentMaterializationsByCandidateKey[key]
        if (prior) {
          if (item.playerId !== prior.playerId || item.cohortId !== prior.cohortId || key !== item.candidateKey) throw new Error(`Historical materialization identity changed at ${world.currentDate}: ${key}`)
          continue
        }
        const player = world.players[item.playerId]
        if (key !== item.candidateKey || materializedPlayers.has(item.playerId) || !player || !player.personId || !world.personsById[player.personId]) throw new Error(`Duplicate or orphan materialization at ${world.currentDate}: ${key}`)
        materializedPlayers.set(item.playerId, key)
      }
    }
    const changed = Object.values(world.teams).filter(team => previous.teams[team.id]?.rosterPlayerIds !== team.rosterPlayerIds)
    for (const team of changed) for (const id of previous.teams[team.id]?.rosterPlayerIds ?? []) owners.delete(id)
    for (const team of changed) {
      if (team.rosterPlayerIds.length < 5 && Object.values(world.competitions).some(item => item.participantTeamIds.includes(team.id))) throw new Error(`Roster survival failure on ${team.id} at ${world.currentDate}`)
      if (new Set(team.rosterPlayerIds).size !== team.rosterPlayerIds.length) throw new Error(`Duplicate roster entry on ${team.id}`)
      for (const id of team.rosterPlayerIds) {
        const player = world.players[id]
        if (!player || player.careerEnd || !player.personId || !world.personsById[player.personId]) throw new Error(`Invalid active identity ${id} on ${team.id} at ${world.currentDate}`)
        if (owners.has(id)) throw new Error(`Duplicate roster owner for ${id} at ${world.currentDate}`)
        owners.set(id, team.id)
      }
    }
    if (previous.contractsById !== world.contractsById || changed.length > 0) {
      const active = new Set<string>()
      for (const contract of Object.values(world.contractsById)) {
        if (getPlayerContractStatus(contract, world.currentDate) !== 'active') continue
        if (active.has(contract.playerId) || owners.get(contract.playerId) !== contract.teamId || world.players[contract.playerId]?.careerEnd) throw new Error(`Active contract ownership failure for ${contract.playerId} at ${world.currentDate}`)
        active.add(contract.playerId)
      }
    }
    previous = world
  }
}
