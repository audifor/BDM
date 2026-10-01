import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addYears } from '@/domain/date'
import { createPlayerContract, getPlayerContractStatus } from '@/domain/contract'
import { createOrganizationFinancialProfile, getContractFinancialSchedule } from '@/domain/finance'
import { contractIdFromString } from '@/domain/ids'
import { getActivePlayerContract, isPlayerFreeAgent, updateGameWorld, type GameWorld } from '@/domain/world'
import { assessContractRelease, executeContractRelease } from './ContractReleaseService'

function fixture(withFinance = true) {
  let world = createNewGame()
  const team = Object.values(world.teams)[0]!
  const playerId = team.rosterPlayerIds[0]!
  const contract = getActivePlayerContract(world, playerId)!
  if (withFinance) world = updateGameWorld(world, { organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId: team.organizationId, baseCurrencyCode: 'EUR' })] })
  return { world, team, playerId, contract }
}

describe('Contract release lifecycle', () => {
  it('previews and atomically releases an active contract, preserves terms, breaks RolePromise, and is idempotent', () => {
    const setup = fixture()
    const promise = { id: 'role-promise:release-test', playerId: setup.playerId, teamOrganizationId: setup.team.organizationId, role: 'STARTER' as const, acceptedOn: setup.world.currentDate, status: 'ACTIVE' as const }
    const world = updateGameWorld(setup.world, { rolePromises: [promise] })
    const preview = assessContractRelease(world, setup.team.id, setup.playerId)
    expect(preview.status).toBe('READY')
    if (preview.status !== 'READY') return
    expect(preview.contractIds).toEqual([setup.contract.id])

    const result = executeContractRelease(world, setup.team.id, setup.playerId)
    expect(result.status).toBe('RELEASED')
    if (result.status !== 'RELEASED') return
    const released = result.world.contractsById[setup.contract.id]!
    expect(released.term).toEqual(setup.contract.term)
    expect(released.compensation).toEqual(setup.contract.compensation)
    expect(released.termination).toEqual({ terminatedOn: world.currentDate, reason: 'released' })
    expect(result.world.teams[setup.team.id]!.rosterPlayerIds).not.toContain(setup.playerId)
    expect(isPlayerFreeAgent(result.world, setup.playerId)).toBe(true)
    expect(result.world.rolePromisesById[promise.id]!.status).toBe('BROKEN')
    expect(Object.values(result.world.playerTransactionsById).filter((item) => item.kind === 'released' && item.playerId === setup.playerId)).toHaveLength(1)

    const repeated = executeContractRelease(result.world, setup.team.id, setup.playerId)
    expect(repeated.status).toBe('ALREADY_TERMINATED')
    expect(repeated.world).toBe(result.world)
  })

  it('terminates a scheduled successor with its active predecessor and retains its guaranteed Finance schedule', () => {
    const setup = fixture()
    const successor = createPlayerContract({
      id: contractIdFromString(`contract:release-successor:${setup.playerId}`),
      playerId: setup.playerId,
      teamId: setup.team.id,
      kind: 'standard',
      predecessorContractId: setup.contract.id,
      term: { startsOn: setup.contract.term.expiresOn, expiresOn: addYears(setup.contract.term.expiresOn, 1) },
      compensation: { annualSalary: 900_000, years: [{ cashSalary: 900_000, capTreatment: { policy: 'NOT_APPLICABLE' }, guaranteedAmount: 300_000 }] },
    })
    const world = updateGameWorld(setup.world, { contracts: [...Object.values(setup.world.contractsById), successor], organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId: setup.team.organizationId, baseCurrencyCode: 'EUR' })] })
    const preview = assessContractRelease(world, setup.team.id, setup.playerId)
    expect(preview.status).toBe('READY')
    if (preview.status !== 'READY') return
    expect(preview.contractIds).toEqual([setup.contract.id, successor.id])
    expect(preview.financeConsequences).toContainEqual(expect.objectContaining({ contractId: successor.id, effectiveOn: successor.term.startsOn, currencyCode: 'EUR', amount: 300_000 }))

    const result = executeContractRelease(world, setup.team.id, setup.playerId)
    expect(result.status).toBe('RELEASED')
    if (result.status !== 'RELEASED') return
    expect(result.world.contractsById[setup.contract.id]!.termination).toEqual({ terminatedOn: world.currentDate, reason: 'released' })
    expect(result.world.contractsById[successor.id]!.termination).toEqual({ terminatedOn: world.currentDate, reason: 'released' })
    expect(getPlayerContractStatus(result.world.contractsById[successor.id]!, successor.term.startsOn)).toBe('terminated')
    expect(Object.values(result.world.contractsById)).toHaveLength(Object.values(world.contractsById).length)
    expect(Object.values(result.world.playerTransactionsById).filter((item) => item.kind === 'released' && item.playerId === setup.playerId)).toHaveLength(1)
  })

  it('preserves the canonical Finance schedule when the organization has not selected a display currency', () => {
    const setup = fixture(false)
    const preview = assessContractRelease(setup.world, setup.team.id, setup.playerId)
    expect(preview.status).toBe('READY')
    if (preview.status !== 'READY') return
    expect(preview.financeStatus).toBe('CURRENCY_POLICY_REQUIRED')
    expect(preview.financeConsequences.length).toBeGreaterThan(0)
    expect(preview.financeConsequences[0]).not.toHaveProperty('currencyCode')
    const result = executeContractRelease(setup.world, setup.team.id, setup.playerId)
    expect(result.status).toBe('RELEASED')
    if (result.status !== 'RELEASED') return
    const releasedContract = result.world.contractsById[setup.contract.id]!
    expect(releasedContract.compensation).toEqual(setup.contract.compensation)
    expect(releasedContract.termination?.reason).toBe('released')
    expect(getContractFinancialSchedule(result.world, { contractId: setup.contract.id, currencyCode: 'EUR', includeConditional: false }).length).toBeGreaterThan(0)
  })

  it('blocks capped contract release when no post-termination cap authority exists', () => {
    const setup = fixture()
    const capped = createPlayerContract({ ...setup.contract, compensation: { annualSalary: setup.contract.compensation.annualSalary, years: [{ cashSalary: setup.contract.compensation.annualSalary, capHit: setup.contract.compensation.annualSalary, guaranteedAmount: setup.contract.compensation.annualSalary, capTreatment: { policy: 'BASE_SALARY', capHit: setup.contract.compensation.annualSalary } }] } })
    const world = updateGameWorld(setup.world, { contracts: Object.values(setup.world.contractsById).map((item) => item.id === capped.id ? capped : item) })
    expect(assessContractRelease(world, setup.team.id, setup.playerId).status).toBe('ECONOMIC_TREATMENT_UNAVAILABLE')
    const result = executeContractRelease(world, setup.team.id, setup.playerId)
    expect(result.world).toBe(world)
    expect(result.status).toBe('ECONOMIC_TREATMENT_UNAVAILABLE')
  })

  it('leaves the world unchanged when Finance rejects the schedule', () => {
    const setup = fixture()
    const profile = createOrganizationFinancialProfile({ organizationId: setup.team.organizationId, baseCurrencyCode: 'EUR' })
    const rejectedFinanceWorld = {
      ...setup.world,
      organizationFinancialProfilesById: { ...setup.world.organizationFinancialProfilesById, [setup.team.organizationId]: { ...profile, baseCurrencyCode: 'EURX' as never } },
    } as GameWorld
    const result = executeContractRelease(rejectedFinanceWorld, setup.team.id, setup.playerId)
    expect(result.status).toBe('FINANCE_REJECTED')
    expect(result.world).toBe(rejectedFinanceWorld)
    expect(result.assessment.status).toBe('FINANCE_REJECTED')
  })
})
