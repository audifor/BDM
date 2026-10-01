import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createPlayerContract, getPlayerContractStatus } from '@/domain/contract'
import { addDays, addYears } from '@/domain/date'
import { contractIdFromString } from '@/domain/ids'
import { releasePlayer, signFreeAgent } from '@/app/market'
import { updateGameWorld } from '@/domain/world'
import { assessActiveContractRosterIntegrity, repairRosterContractIntegrity } from './RosterContractIntegrity'

describe('roster and active contract integrity repair', () => {
  it('terminates a scheduled binding successor with its active predecessor', () => {
    const world = createNewGame()
    const predecessor = Object.values(world.contractsById)[0]!
    const successor = createPlayerContract({ id: contractIdFromString(`release-successor:${predecessor.id}`), playerId: predecessor.playerId, teamId: predecessor.teamId, kind: 'standard', predecessorContractId: predecessor.id, term: { startsOn: predecessor.term.expiresOn, expiresOn: addYears(predecessor.term.expiresOn, 1) }, compensation: { annualSalary: predecessor.compensation.annualSalary } })
    const chained = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), successor] })
    const released = releasePlayer(chained, predecessor.teamId, predecessor.playerId)
    expect(released.contractsById[predecessor.id]!.termination).toEqual({ terminatedOn: world.currentDate, reason: 'released' })
    expect(released.contractsById[successor.id]!.termination).toEqual({ terminatedOn: world.currentDate, reason: 'released' })
    expect(getPlayerContractStatus(released.contractsById[successor.id]!, successor.term.startsOn)).toBe('terminated')
    expect(released.teams[predecessor.teamId]!.rosterPlayerIds).not.toContain(predecessor.playerId)
  })

  it('answers the BS11C precondition only for one active contract at the unique roster team', () => {
    const world = createNewGame()
    const contract = Object.values(world.contractsById)[0]!
    expect(assessActiveContractRosterIntegrity(world, contract.playerId)).toBe('VALID')
    const mismatch = updateGameWorld(world, { contracts: Object.values(world.contractsById).map((item) => item.id === contract.id ? { ...item, teamId: Object.values(world.teams).find((team) => team.id !== contract.teamId)!.id } : item) })
    expect(assessActiveContractRosterIntegrity(mismatch, contract.playerId)).toBe('INVALID')
    const duplicate = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), { ...contract, id: `${contract.id}:duplicate` as typeof contract.id }] })
    expect(assessActiveContractRosterIntegrity(duplicate, contract.playerId)).toBe('AMBIGUOUS')
  })

  it('keeps a scheduled future contract separate from current roster membership', () => {
    const world = createNewGame()
    const contract = Object.values(world.contractsById)[0]!
    const { termination: _termination, ...contractWithoutTermination } = contract
    const scheduled = createPlayerContract({ ...contractWithoutTermination, id: contractIdFromString(`future:${contract.id}`), term: { startsOn: addDays(world.currentDate, 30), expiresOn: addDays(world.currentDate, 395) } })
    const futureOnly = updateGameWorld(world, {
      contracts: [...Object.values(world.contractsById).filter((item) => item.playerId !== contract.playerId), scheduled],
      teams: Object.values(world.teams).map((team) => ({ ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== contract.playerId) })),
    })
    const result = repairRosterContractIntegrity(futureOnly)
    expect(result.world).toBe(futureOnly)
    expect(result.reports.find((report) => report.targetEntity === contract.playerId)?.classification).toBe('ALREADY_VALID')
    expect(assessActiveContractRosterIntegrity(futureOnly, contract.playerId)).toBe('UNKNOWN')
  })

  it('does not infer a contract requirement from roster membership without contract history', () => {
    const world = createNewGame()
    const contract = Object.values(world.contractsById)[0]!
    const noContractHistory = updateGameWorld(world, { contracts: Object.values(world.contractsById).filter((item) => item.playerId !== contract.playerId) })
    const result = repairRosterContractIntegrity(noContractHistory)
    expect(result.world).toBe(noContractHistory)
    expect(result.reports.find((report) => report.targetEntity === contract.playerId)).toMatchObject({ classification: 'NOT_APPLICABLE', worldChanged: false })
  })
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
