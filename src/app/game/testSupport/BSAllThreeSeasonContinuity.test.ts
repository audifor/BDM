/*
 * BS ALL FINAL INTEGRATION — three-season continuity through the canonical production path.
 *
 * Opt-in (BDM_BS_ALL_THREE_SEASONS=1): a new production game (`createConfiguredGame`, BDM_GAME_BALANCE_V1) advanced with
 * `simulateUntilDate` in 30-day chunks — the same path the UI's "simulate until" uses, including the canonical competition
 * rollover (`advanceCompetitionLifecycles`) that a raw Calendar loop never performs. It crosses three 1 July development
 * checkpoints (2033, 2034, 2035) and three October season starts. The user club runs a renovation and a conservation service
 * through the real Facilities commands; AI clubs act on their own. As in the certified BS15I long-horizon profile, the run is
 * full-AI after the opening day (the user moves to an unemployed coach so no user breakpoint waits for a human); the club's
 * appointed manager (the former user coach) keeps acting on the club's own Facilities jobs with the same rights. Every 180 days the world is saved and reloaded and the
 * invariants below are asserted. Metrics are written to BDM_BS_ALL_OUT; Save snapshots to BDM_BS_ALL_SNAPSHOT-<day>.json.
 * BDM_BS_ALL_RESUME=<snapshot>@<day> resumes from a snapshot.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import { deriveFacilityOperationLifecycle, facilityEconomyRecordsOfKind, facilityOperationEvents, facilityOperationIds } from '@/domain/facilityEconomy'
import { getCashBalancesByCurrency } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { SeededRandomSource } from '@/engine/random'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { executeFacilityMaintenanceUiCommand, type FacilityMaintenanceUiCommand } from '@/app/facilityMaintenance/FacilityMaintenanceUiCommands'
import { buildFacilityInvestmentRows } from '@/app/facilityMaintenance/FacilityInvestmentReadModel'
import { buildFacilityServiceRows } from '@/app/facilityMaintenance/FacilityServiceReadModel'
import { acceptFacilityInvestmentWork, capitalOffersForOperation, reserveAndContractFacilityInvestment, startFacilityInvestmentWork } from '@/app/facilityMaintenance/FacilityCapitalCommands'
import { serviceOffersForOperation, signFacilityServiceContract } from '@/app/facilityMaintenance/FacilityServiceCommands'
import { updateGameWorld } from '@/domain/world'
import type { GovernanceActor } from '@/domain/governance'

vi.setConfig({ testTimeout: 48 * 60 * 60 * 1000, hookTimeout: 48 * 60 * 60 * 1000 })
const SAVED_AT = '2035-10-01T00:00:00.000Z'
const DAYS = Number(process.env.BDM_BS_ALL_DAYS ?? 1_095)
const CHECKPOINT_EVERY = 180
const CHUNK = 30

function cashOf(world: GameWorld, organizationId: string): number {
  return getCashBalancesByCurrency(world, organizationId as never, world.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
}

/** Invariants of the integrated candidate at a checkpoint. Throws on the first violation. */
function assertCheckpoint(world: GameWorld): Record<string, unknown> {
  // Player rating history: one entry per (player, season) and no entry for a season twice.
  let ratingEntries = 0
  for (const [playerId, history] of Object.entries(world.playerRatingHistoryByPlayerId)) {
    const seasons = history.map((entry) => entry.seasonId)
    expect(new Set(seasons).size, `rating history of ${playerId}`).toBe(seasons.length)
    ratingEntries += history.length
  }
  // Players and persons stay linked; no roster ownership is duplicated.
  const owners = new Map<string, string>()
  for (const team of Object.values(world.teams)) for (const playerId of team.rosterPlayerIds) {
    expect(world.players[playerId], `rostered player ${playerId}`).toBeDefined()
    expect(owners.has(playerId), `duplicate roster ownership ${playerId}`).toBe(false)
    owners.set(playerId, team.id)
  }
  // Facilities operations: derivable lifecycles, at most one fact of each kind, unique service periods matching Finance facts.
  let processedPeriods = 0
  const byKind: Record<string, number> = {}
  for (const event of facilityEconomyRecordsOfKind(world, 'OPERATION_EVENT')) byKind[event.kind] = (byKind[event.kind] ?? 0) + 1
  for (const operationId of facilityOperationIds(world)) {
    const events = facilityOperationEvents(world, operationId)
    expect(deriveFacilityOperationLifecycle(events), operationId).not.toBeNull()
    for (const kind of ['PROPOSAL_CREATED', 'APPROVAL_REQUESTED', 'CONTRACT_ACCEPTED', 'WORK_COMPLETED'] as const) expect(events.filter((event) => event.kind === kind).length, `${operationId} ${kind}`).toBeLessThanOrEqual(1)
    const periods = events.filter((event) => event.kind === 'SERVICE_PERIOD_PROCESSED' || event.kind === 'SERVICE_PERIOD_SKIPPED').map((event) => event.reasonCode)
    expect(new Set(periods).size, operationId).toBe(periods.length)
    processedPeriods += events.filter((event) => event.kind === 'SERVICE_PERIOD_PROCESSED').length
  }
  const serviceFacts = Object.keys(world.operatingCostFactsById).filter((id) => id.startsWith('operating-cost-fact:facility-service:')).length
  expect(serviceFacts).toBe(processedPeriods)
  let negativeCash = 0
  let minCash = Number.POSITIVE_INFINITY
  for (const team of Object.values(world.teams)) { const cash = cashOf(world, String(team.organizationId)); if (cash < 0) negativeCash += 1; minCash = Math.min(minCash, cash) }
  return {
    currentSeasonId: world.currentSeasonId, seasons: Object.keys(world.seasons).length, players: Object.keys(world.players).length, ratingEntries,
    developmentCycle: world.worldAnnualDevelopmentCycle?.lastAppliedCycleId ?? null, contracts: Object.keys(world.contractsById).length, staffContracts: Object.keys(world.staffContractsById).length,
    facilityOperations: facilityOperationIds(world).length, facilityEventsByKind: byKind, serviceFacts, negativeCashOrganizations: negativeCash, minCashMinorUnits: minCash,
    recognizedRevenueRecords: Object.keys(world.revenueRecognitionsById).length,
  }
}

describe.skipIf(process.env.BDM_BS_ALL_THREE_SEASONS !== '1')('BS ALL: three-season continuity through the production path', () => {
  it('advances three complete seasons with rollover, development, Facilities, Finance, AI and Save/reload', async () => {
    const t0 = Date.now()
    const resume = process.env.BDM_BS_ALL_RESUME?.split('@')
    let world = resume === undefined ? createConfiguredGame({ universeId: 'prototype' }) : deserializeGameWorldV4(JSON.parse(readFileSync(resume[0]!, 'utf8')))
    const startDay = resume === undefined ? 0 : Number(resume[1])
    const originDate = (resume === undefined ? world.currentDate : addDays(world.currentDate, -startDay)) as GameDate
    const seed = new SeededRandomSource(17017)
    let seedDraws = 0
    const completed = Object.values(world.games).filter((game) => game.status === 'completed').length
    for (let draw = 0; draw < completed; draw += 1) { seed.nextInt(0, 0xffff_ffff); seedDraws += 1 }
    const createSeed = () => { seedDraws += 1; return seed.nextInt(0, 0xffff_ffff) }
    const team = getUserTeam(world)!
    const log: string[] = []
    const act = (command: FacilityMaintenanceUiCommand) => {
      const result = executeFacilityMaintenanceUiCommand(world, team.id, command)
      log.push(`${world.currentDate} ${command.kind} ${result.status}${result.reasons.length ? ' ' + result.reasons.join(',') : ''}`)
      if (result.status === 'APPLIED') world = result.world
      return result
    }
    let investOp: string | null = null
    let serviceOp: string | null = null
    if (resume === undefined) {
      const invest = buildFacilityInvestmentRows(world, team.id).find((row) => row.option.kind === 'RENOVATION' && row.option.eligible)
      if (invest !== undefined) {
        investOp = act({ kind: 'INVEST_OPEN', facilityId: invest.option.facilityId, investment: 'RENOVATION', componentId: invest.option.componentId }).operationId
        act({ kind: 'INVEST_REQUEST_OFFERS', operationId: investOp! })
        act({ kind: 'INVEST_SELECT_OFFER', operationId: investOp!, offerId: [...capitalOffersForOperation(world, investOp!)].sort((a, b) => a.amount.minorUnits - b.amount.minorUnits)[0]!.id })
        act({ kind: 'INVEST_REQUEST_APPROVAL', operationId: investOp! })
      }
      const service = buildFacilityServiceRows(world, team.id)[0]
      if (service !== undefined && service.option.eligible) {
        serviceOp = act({ kind: 'SERVICE_OPEN', facilityId: service.option.facilityId }).operationId
        act({ kind: 'SERVICE_REQUEST_OFFERS', operationId: serviceOp! })
        act({ kind: 'SERVICE_SELECT_OFFER', operationId: serviceOp!, offerId: serviceOffersForOperation(world, serviceOp!)[0]!.id })
        act({ kind: 'SERVICE_REQUEST_APPROVAL', operationId: serviceOp! })
      }
    }

    // Full-AI from here on (BS15I profile pattern). The original coach stays the club's appointed manager.
    const clubManager: GovernanceActor = { kind: 'COACH', id: world.userCoachId }
    if (resume === undefined) {
      const unemployed = Object.keys(world.coachEmploymentByCoachId).find((id) => world.coachEmploymentByCoachId[id as keyof typeof world.coachEmploymentByCoachId]?.status === 'unemployed') as GameWorld['userCoachId'] | undefined
      if (unemployed === undefined) throw new Error('No unemployed coach for the full-AI continuity run')
      world = updateGameWorld(world, { userCoachId: unemployed })
    }
    const checkpoints: Record<string, unknown>[] = []
    const transitions: string[] = []
    const write = (status: string) => {
      if (process.env.BDM_BS_ALL_OUT) writeFileSync(process.env.BDM_BS_ALL_OUT, JSON.stringify({ status, originDate, startDay, days: DAYS, date: world.currentDate, totalSeconds: Math.round((Date.now() - t0) / 1000), seedDraws, log, transitions, checkpoints }, null, 1))
    }
    let day = startDay
    let investDone = false
    let nextCheckpoint = Math.floor(startDay / CHECKPOINT_EVERY) * CHECKPOINT_EVERY + CHECKPOINT_EVERY
    while (day < DAYS) {
      const target = addDays(originDate, Math.min(DAYS, day + (day < 3 ? 1 : CHUNK), nextCheckpoint)) as GameDate
      const chunkStarted = Date.now()
      const result = simulateUntilDate(world, target, createSeed, {
        onDayAdvance: (advance) => { if (advance.status === 'FAILED') throw new Error(`DAY_FAILED ${advance.world.currentDate} ${JSON.stringify(advance.failure)}`) },
      })
      world = result.world
      for (const transition of result.seasonTransitions) transitions.push(`${world.currentDate} ${JSON.stringify(transition).slice(0, 160)}`)
      if (compareGameDates(world.currentDate, target) !== 0) { write('STOPPED'); throw new Error(`STOPPED at ${world.currentDate} before ${target}: ${JSON.stringify(result.stopReason).slice(0, 400)}`) }
      day = startDay + Math.round((Date.parse(world.currentDate) - Date.parse(addDays(originDate, startDay))) / 86_400_000)
      process.stdout.write(`[BS ALL progress] ${JSON.stringify({ day, date: world.currentDate, season: world.currentSeasonId, chunkSeconds: Math.round((Date.now() - chunkStarted) / 1000), rss: process.memoryUsage().rss })}\n`)
      // The club's own Facilities jobs, through the real commands and the appointed manager's rights.
      if (investOp !== null && !investDone) {
        const steps = [
          ['RESERVE', () => reserveAndContractFacilityInvestment(world, { teamId: team.id, operationId: investOp!, actor: clubManager })],
          ['START', () => startFacilityInvestmentWork(world, { teamId: team.id, operationId: investOp! })],
          ['ACCEPT', () => acceptFacilityInvestmentWork(world, { teamId: team.id, operationId: investOp!, actor: clubManager })],
        ] as const
        for (const [label, run] of steps) {
          const outcome = run()
          if (outcome.status === 'APPLIED') { world = outcome.world; log.push(`${world.currentDate} INVEST_${label} APPLIED`); if (label === 'ACCEPT') investDone = true } else if (process.env.BDM_BS_ALL_DEBUG) log.push(`${world.currentDate} INVEST_${label} ${outcome.status} ${outcome.reasons.join(',')} ${outcome.canonicalReasons.join(',')}`)
        }
      }
      if (serviceOp !== null) {
        const signed = signFacilityServiceContract(world, { teamId: team.id, operationId: serviceOp, actor: clubManager })
        if (signed.status === 'APPLIED') { world = signed.world; log.push(`${world.currentDate} SERVICE_SIGN APPLIED`) } else if (process.env.BDM_BS_ALL_DEBUG) log.push(`${world.currentDate} SERVICE_SIGN ${signed.status} ${signed.reasons.join(',')}`)
      }
      if (day >= nextCheckpoint || day >= DAYS) {
        const saveStarted = Date.now()
        const serialized = serializeGameWorldV4(world, SAVED_AT)
        const json = JSON.stringify(serialized)
        const reloaded = deserializeGameWorldV4(JSON.parse(json))
        const saveSeconds = (Date.now() - saveStarted) / 1000
        expect(JSON.stringify(facilityEconomyRecordsOfKind(reloaded, 'OPERATION_EVENT'))).toBe(JSON.stringify(facilityEconomyRecordsOfKind(world, 'OPERATION_EVENT')))
        expect(JSON.stringify(reloaded.playerRatingHistoryByPlayerId)).toBe(JSON.stringify(world.playerRatingHistoryByPlayerId))
        world = reloaded
        if (process.env.BDM_BS_ALL_SNAPSHOT) writeFileSync(`${process.env.BDM_BS_ALL_SNAPSHOT}-${day}.json`, json)
        checkpoints.push({ day, date: world.currentDate, elapsedSeconds: Math.round((Date.now() - t0) / 1000), saveBytes: json.length, saveSeconds, rss: process.memoryUsage().rss, ...assertCheckpoint(world) })
        write('RUNNING')
        nextCheckpoint += CHECKPOINT_EVERY
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    write('PASS')
  })
})
