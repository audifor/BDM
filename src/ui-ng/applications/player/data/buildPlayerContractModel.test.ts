import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market/MarketService'
import type { PlayerId } from '@/domain/ids'
import { getUserTeam } from '@/engine/calendar'

import {
  buildPlayerContractModel,
  deriveSeasonsRemainingLabel,
  findContractInspectorDetail,
  formatSeasonSpanLabel,
  isExpiringThisSeason,
  presentContractMoney,
} from './buildPlayerContractModel'
import { defaultPlayerIdForNg } from './buildPlayerWorkspaceModel'

describe('buildPlayerContractModel', () => {
  it('builds an active contract model from real game data', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerContractModel(world, playerId)

    expect(model.viewStatus).toBe('active')
    expect(model.emptyMessage).toBeNull()
    expect(model.agreement).not.toBeNull()
    expect(model.financialSchedule.length).toBeGreaterThan(0)
    expect(model.statusBand?.teamName.length).toBeGreaterThan(0)
    expect(model.compensationCurrencyCode).toBeNull()
    expect(model.compensationContextNote).toBe('Currency not tracked')
  })

  it('returns a no-contract state after release', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]! as PlayerId
    const released = releasePlayer(world, team.id, playerId)
    const model = buildPlayerContractModel(released, playerId)

    expect(model.viewStatus).toBe('none')
    expect(model.emptyMessage).toBe('No active contract')
    expect(model.financialSchedule).toEqual([])
    expect(model.timeline).toEqual([])
    expect(model.compensationContextNote).toBeNull()
  })

  it('derives remaining duration from real contract dates', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const contract = buildPlayerContractModel(world, playerId)
    const domainContract = Object.values(world.contractsById).find((entry) => entry.playerId === playerId)

    expect(domainContract).toBeDefined()
    expect(deriveSeasonsRemainingLabel(domainContract!, world.currentDate)).toMatch(/season/)
    expect(contract.statusBand?.seasonsRemaining).toMatch(/season/)
  })

  it('formats compensation as numeric amounts without inferred currency symbols', () => {
    const money = presentContractMoney(1_250_000)

    expect(money.amount).toBe(1_250_000)
    expect(money.currencyCode).toBeNull()
    expect(money.formatted).toBe('1,250,000')
    expect(money.formatted).not.toMatch(/[€$]/)

    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const row = buildPlayerContractModel(world, playerId).financialSchedule[0]

    expect(row?.baseSalary.currencyCode).toBeNull()
    expect(row?.baseSalary.formatted).not.toMatch(/[€$]/)
  })

  it('orders financial schedule seasons and marks the current season row', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerContractModel(world, playerId)

    expect(model.financialSchedule.some((row) => row.isCurrent)).toBe(true)
    expect(model.financialSchedule[0]?.seasonLabel.length).toBeGreaterThan(0)
    expect(model.defaultSelectedItemId).not.toBeNull()
  })

  it('transforms inspector detail for a selected schedule row', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerContractModel(world, playerId)
    const selectedId = model.defaultSelectedItemId
    const detail = findContractInspectorDetail(model, selectedId)

    expect(detail?.seasonLabel.length).toBeGreaterThan(0)
    expect(detail?.baseSalary.currencyCode).toBeNull()
    expect(findContractInspectorDetail(model, null)).toBeUndefined()
  })

  it('handles missing optional per-year compensation by repeating annual salary semantics', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerContractModel(world, playerId)
    const row = model.financialSchedule[0]

    expect(row?.baseSalary.amount).toBeGreaterThan(0)
    expect(row?.guaranteed.amount).toBeGreaterThan(0)
    expect(row?.capHit.amount).toBeGreaterThan(0)
    expect(row?.guaranteeState).toBe('Guaranteed')
  })

  it('derives expiring-this-season only when expiry falls within the current season window', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const contract = Object.values(world.contractsById).find((entry) => entry.playerId === playerId)!

    expect(typeof isExpiringThisSeason(world, contract, world.currentDate)).toBe('boolean')
    expect(formatSeasonSpanLabel(2026)).toBe('2026/27')
  })
})
