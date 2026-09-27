import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer, signFreeAgent } from '@/app/market'
import { updateGameWorld } from '@/domain/world'
import { repairRosterContractIntegrity } from './RosterContractIntegrity'

describe('roster and active contract integrity repair', () => {
  it('classifies matching roster and active contract as already valid', () => {
    const world = createNewGame()
    const playerId = Object.values(world.contractsById)[0]!.playerId
    const result = repairRosterContractIntegrity(world)
    expect(result.world).toBe(world)
    expect(result.reports.find((report) => report.targetEntity === playerId)).toMatchObject({ classification: 'ALREADY_VALID', worldChanged: false })
  })

  it('fails safely on a team mismatch without a complete transaction trail', () => {
    const world = createNewGame()
    const contract = Object.values(world.contractsById)[0]!
    const otherTeam = Object.values(world.teams).find((team) => team.id !== contract.teamId)!
    const mismatched = updateGameWorld(world, { contracts: Object.values(world.contractsById).map((item) => item.id === contract.id ? { ...item, teamId: otherTeam.id } : item) })
    const result = repairRosterContractIntegrity(mismatched)

    expect(result.world).toBe(mismatched)
    expect(result.reports.find((report) => report.targetEntity === contract.playerId)).toMatchObject({ classification: 'UNRECOVERABLE', worldChanged: false, actionApplied: 'Neither roster membership nor contract authority was changed.' })
    expect(result.reports.find((report) => report.targetEntity === contract.playerId)?.diagnostics[0]?.code).toBe('ROSTER_CONTRACT_TEAM_MISMATCH')
  })

  it('repairs a stale roster only when release and signing transactions prove the completed move', () => {
    const base = createNewGame()
    const sourceTeam = Object.values(base.teams)[0]!
    const targetTeam = Object.values(base.teams).find((team) => team.id !== sourceTeam.id)!
    const playerId = sourceTeam.rosterPlayerIds[0]!
    const funded = updateGameWorld(base, { teamFinances: Object.values(base.teamFinancesByTeamId).map((item) => item.teamId === targetTeam.id ? { ...item, playerSalaryBudget: 100_000_000 } : item) })
    const released = releasePlayer(funded, sourceTeam.id, playerId)
    const signed = signFreeAgent(released, targetTeam.id, playerId)
    const staleMembership = updateGameWorld(signed, { teams: Object.values(signed.teams).map((team) => team.id === sourceTeam.id ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, playerId] } : team.id === targetTeam.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== playerId) } : team) })

    const result = repairRosterContractIntegrity(staleMembership)
    expect(result.world.teams[sourceTeam.id]!.rosterPlayerIds).not.toContain(playerId)
    expect(result.world.teams[targetTeam.id]!.rosterPlayerIds).toContain(playerId)
    expect(result.reports.find((report) => report.targetEntity === playerId)).toMatchObject({ classification: 'RECOVERABLE', worldChanged: true })
    expect(repairRosterContractIntegrity(result.world).world).toBe(result.world)
  })

  it('restores an unrostered player only from a matching active signing transaction', () => {
    const base = createNewGame()
    const sourceTeam = Object.values(base.teams)[0]!
    const targetTeam = Object.values(base.teams).find((team) => team.id !== sourceTeam.id)!
    const playerId = sourceTeam.rosterPlayerIds[0]!
    const funded = updateGameWorld(base, { teamFinances: Object.values(base.teamFinancesByTeamId).map((item) => item.teamId === targetTeam.id ? { ...item, playerSalaryBudget: 100_000_000 } : item) })
    const signed = signFreeAgent(releasePlayer(funded, sourceTeam.id, playerId), targetTeam.id, playerId)
    const unrostered = updateGameWorld(signed, { teams: Object.values(signed.teams).map((team) => team.id === targetTeam.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== playerId) } : team) })

    const result = repairRosterContractIntegrity(unrostered)
    expect(result.world.teams[targetTeam.id]!.rosterPlayerIds).toContain(playerId)
    expect(result.reports.find((report) => report.targetEntity === playerId)).toMatchObject({ classification: 'RECOVERABLE', worldChanged: true })
  })

  it('keeps duplicate-roster membership a hard GameWorld invariant', () => {
    const world = createNewGame()
    const source = Object.values(world.teams)[0]!
    const target = Object.values(world.teams).find((team) => team.id !== source.id)!
    const playerId = source.rosterPlayerIds[0]!
    expect(() => updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === target.id ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, playerId] } : team) })).toThrow(/belongs to more than one team roster/)
  })
})
