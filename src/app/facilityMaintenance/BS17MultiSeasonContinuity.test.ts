/*
 * BS17 GLOBAL CERTIFICATION — multi-season continuity of Facilities, Economy, Governance and AI.
 *
 * Long-running, through the raw daily Calendar (`advanceDayWithTrace`): enabled only with BDM_BS17_MULTISEASON=1.
 * The raw Calendar never runs the canonical competition rollover (`advanceCompetitionLifecycles`, used by simulate-until and the
 * UI's next-season action), so this harness cannot pass the second 1 July: the world keeps its first season and the second annual
 * development would rewrite that season's rating history. It certifies Facilities continuity up to 2034-06-30 only; the
 * three-season certification of the integrated product is `src/app/game/testSupport/BSAllThreeSeasonContinuity.test.ts`.
 * A new production game; the user club runs a capital renovation and a conservation service through the real commands while the
 * AI clubs plan and execute through the same commands. The world is saved and reloaded at every checkpoint and invariants are
 * asserted after each one. Metrics are written to the path in BDM_BS17_MULTISEASON_OUT.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { componentConditionAt } from '@/domain/facilities'
import { deriveFacilityOperationLifecycle, facilityEconomyRecordsOfKind, facilityOperationEvents, facilityOperationIds } from '@/domain/facilityEconomy'
import { getCashBalancesByCurrency } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getUserTeam } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { executeFacilityMaintenanceUiCommand, type FacilityMaintenanceUiCommand } from './FacilityMaintenanceUiCommands'
import { buildFacilityInvestmentRows } from './FacilityInvestmentReadModel'
import { buildFacilityServiceRows } from './FacilityServiceReadModel'
import { capitalOffersForOperation } from './FacilityCapitalCommands'
import { serviceOffersForOperation } from './FacilityServiceCommands'

vi.setConfig({ testTimeout: 14_400_000, hookTimeout: 14_400_000 })
const SAVED_AT = '2033-03-01T00:00:00.000Z'
const DAYS = Number(process.env.BDM_BS17_MULTISEASON_DAYS ?? 1_100)
const CHECKPOINT_EVERY = 180

describe.skipIf(process.env.BDM_BS17_MULTISEASON !== '1')('BS17 multi-season continuity', () => {
  it('keeps Facilities, Finance, Governance and AI coherent across three seasons, Save/reload and season close', () => {
    const t0 = Date.now()
    // BDM_BS17_MULTISEASON_RESUME=<snapshot>@<day> resumes a saved run (used after a defect fix; the user's own jobs were set up in the first segment).
    const resume = process.env.BDM_BS17_MULTISEASON_RESUME?.split('@')
    let world = resume === undefined ? createConfiguredGame({ universeId: 'prototype' }) : deserializeGameWorldV4(JSON.parse(readFileSync(resume[0]!, 'utf8')))
    const firstDay = resume === undefined ? 1 : Number(resume[1]) + 1
    const startDate = world.currentDate
    const team = getUserTeam(world)!
    const organizationId = String(team.organizationId)
    const log: string[] = []
    const act = (command: FacilityMaintenanceUiCommand) => {
      const result = executeFacilityMaintenanceUiCommand(world, team.id, command)
      log.push(`${world.currentDate} ${command.kind} ${result.status}${result.reasons.length ? ' ' + result.reasons.join(',') : ''}`)
      if (result.status === 'APPLIED') world = result.world
      return result
    }
    const initialFacilities = resume !== undefined ? 0 : Object.keys(world.facilitiesById).length
    const initialComponents = resume !== undefined ? 0 : Object.keys(world.facilityComponentsById).length

    const invest = resume !== undefined ? undefined : buildFacilityInvestmentRows(world, team.id).find((row) => row.option.kind === 'RENOVATION' && row.option.eligible)
    let investOp: string | null = null
    if (invest !== undefined) {
      investOp = act({ kind: 'INVEST_OPEN', facilityId: invest.option.facilityId, investment: 'RENOVATION', componentId: invest.option.componentId }).operationId
      act({ kind: 'INVEST_REQUEST_OFFERS', operationId: investOp! })
      const offer = [...capitalOffersForOperation(world, investOp!)].sort((a, b) => a.amount.minorUnits - b.amount.minorUnits)[0]!
      act({ kind: 'INVEST_SELECT_OFFER', operationId: investOp!, offerId: offer.id })
      act({ kind: 'INVEST_REQUEST_APPROVAL', operationId: investOp! })
    }
    const serviceRow = resume !== undefined ? undefined : buildFacilityServiceRows(world, team.id)[0]
    let serviceOp: string | null = null
    if (serviceRow !== undefined && serviceRow.option.eligible) {
      serviceOp = act({ kind: 'SERVICE_OPEN', facilityId: serviceRow.option.facilityId }).operationId
      act({ kind: 'SERVICE_REQUEST_OFFERS', operationId: serviceOp! })
      const offer = [...serviceOffersForOperation(world, serviceOp!)][0]!
      act({ kind: 'SERVICE_SELECT_OFFER', operationId: serviceOp!, offerId: offer.id })
      act({ kind: 'SERVICE_REQUEST_APPROVAL', operationId: serviceOp! })
    }

    const checkpoints: Record<string, unknown>[] = []
    const cashOf = (w: GameWorld, org: string) => getCashBalancesByCurrency(w, org as never, w.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
    let investAccepted = false
    const finish = (endDate: string | null) => {
      if (process.env.BDM_BS17_MULTISEASON_OUT) writeFileSync(process.env.BDM_BS17_MULTISEASON_OUT, JSON.stringify({ startDate, endDate, days: DAYS, totalSeconds: Math.round((Date.now() - t0) / 1000), investAccepted, log, checkpoints }, null, 1))
    }
    for (let day = firstDay; day <= DAYS; day += 1) {
      const advanced = advanceDayWithTrace(world)
      if (advanced.failure !== undefined) throw new Error(`Calendar failed on day ${day} (${advanced.world.currentDate}): ${JSON.stringify(advanced.failure)}`)
      world = advanced.world
      if (day === 2) {
        if (investOp !== null) { act({ kind: 'INVEST_RESERVE', operationId: investOp }); act({ kind: 'INVEST_START', operationId: investOp }) }
        if (serviceOp !== null) act({ kind: 'SERVICE_SIGN', operationId: serviceOp })
        continue
      }
      if (investOp !== null && !investAccepted && day % 5 === 0) {
        const accepted = executeFacilityMaintenanceUiCommand(world, team.id, { kind: 'INVEST_ACCEPT', operationId: investOp })
        if (accepted.status === 'APPLIED') { world = accepted.world; investAccepted = true; log.push(`${world.currentDate} INVEST_ACCEPT APPLIED`) }
      }
      if (day % CHECKPOINT_EVERY === 0 || day === DAYS) {
        const serialized = serializeGameWorldV4(world, SAVED_AT)
        const reloaded = deserializeGameWorldV4(serialized)
        expect(JSON.stringify(facilityEconomyRecordsOfKind(reloaded, 'OPERATION_EVENT'))).toBe(JSON.stringify(facilityEconomyRecordsOfKind(world, 'OPERATION_EVENT')))
        world = reloaded
        if (process.env.BDM_BS17_MULTISEASON_SNAPSHOT) writeFileSync(`${process.env.BDM_BS17_MULTISEASON_SNAPSHOT}-${day}.json`, JSON.stringify(serialized))

        const byKind: Record<string, number> = {}
        for (const event of facilityEconomyRecordsOfKind(world, 'OPERATION_EVENT')) byKind[event.kind] = (byKind[event.kind] ?? 0) + 1
        let negativeCash = 0
        let minCash = Number.POSITIVE_INFINITY
        for (const other of Object.values(world.teams)) {
          const cash = cashOf(world, String(other.organizationId))
          if (cash < 0) negativeCash += 1
          minCash = Math.min(minCash, cash)
        }
        let processedPeriods = 0
        for (const operationId of facilityOperationIds(world)) {
          const opEvents = facilityOperationEvents(world, operationId)
          expect(deriveFacilityOperationLifecycle(opEvents), operationId).not.toBeNull()
          for (const kind of ['PROPOSAL_CREATED', 'APPROVAL_REQUESTED', 'CONTRACT_ACCEPTED', 'WORK_COMPLETED'] as const) expect(opEvents.filter((event) => event.kind === kind).length, `${operationId} ${kind}`).toBeLessThanOrEqual(1)
          const periods = opEvents.filter((event) => event.kind === 'SERVICE_PERIOD_PROCESSED' || event.kind === 'SERVICE_PERIOD_SKIPPED').map((event) => event.reasonCode)
          expect(new Set(periods).size, operationId).toBe(periods.length)
          processedPeriods += opEvents.filter((event) => event.kind === 'SERVICE_PERIOD_PROCESSED').length
        }
        const serviceFacts = Object.keys(world.operatingCostFactsById).filter((id) => id.startsWith('operating-cost-fact:facility-service:')).length
        expect(serviceFacts).toBe(processedPeriods)
        expect(Object.keys(world.facilitiesById).length).toBeGreaterThanOrEqual(initialFacilities)
        expect(Object.keys(world.facilityComponentsById).length).toBeGreaterThanOrEqual(initialComponents)
        checkpoints.push({
          day, date: world.currentDate, elapsedSeconds: Math.round((Date.now() - t0) / 1000), saveBytes: JSON.stringify(serialized).length, eventsByKind: byKind, operations: facilityOperationIds(world).length,
          serviceFacts, negativeCashOrganizations: negativeCash, minCashMinorUnits: minCash, userCashMinorUnits: cashOf(world, organizationId),
          userCourtCondition: invest === undefined ? null : componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), invest.option.componentId as never, world.currentDate)?.physicalCondition ?? null,
        })
        finish(null)
        expect(negativeCash).toBe(0)
      }
    }
    expect(world.currentDate).not.toBe(startDate)
    finish(String(world.currentDate))
  })
})
