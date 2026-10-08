import { it, vi } from 'vitest'
import { Session } from 'node:inspector'
import { writeFileSync } from 'node:fs'
import { createNewGame } from '@/app/game'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'

const measured = vi.hoisted(() => ({ updateMs: 0, updates: 0, batchedUpdates: 0, portalMs: 0, portalCalls: 0 }))
vi.mock('@/domain/world', async (original) => {
  const actual = await original<typeof import('@/domain/world')>()
  return { ...actual, updateGameWorld: (...args: Parameters<typeof actual.updateGameWorld>) => {
    const start = performance.now()
    try { return actual.updateGameWorld(...args) }
    finally { measured.updateMs += performance.now() - start; measured.updates++ }
  }, updateGameWorldBatch: (world: GameWorld, execute: Parameters<typeof actual.updateGameWorldBatch>[1]) => {
    const start = performance.now()
    let operationMs = 0
    try { return actual.updateGameWorldBatch(world, (initial, apply) => {
      const operationStart = performance.now()
      try { return execute(initial, (current, patch) => {
        const buildStart = performance.now()
        try { return apply(current, patch) }
        finally { measured.updateMs += performance.now() - buildStart; measured.batchedUpdates++ }
      }) }
      finally { operationMs += performance.now() - operationStart }
    }) }
    finally { measured.updateMs += performance.now() - start - operationMs; measured.updates++ }
  } }
})
vi.mock('@/engine/eligibility/CollegeTransferAI', async (original) => {
  const actual = await original<typeof import('@/engine/eligibility/CollegeTransferAI')>()
  return { ...actual, runCollegeRosterContinuationAndTransferAI: (...args: Parameters<typeof actual.runCollegeRosterContinuationAndTransferAI>) => {
    const start = performance.now()
    try { return actual.runCollegeRosterContinuationAndTransferAI(...args) }
    finally { measured.portalMs += performance.now() - start; measured.portalCalls++ }
  } }
})

it('BS15I three consecutive 30-day profile windows', async () => {
  if (process.env.BS15I_PROFILE_90 !== '1') return
  let world = createNewGame({ seed: 15015 })
  const coachId = Object.keys(world.coachEmploymentByCoachId).find(id => world.coachEmploymentByCoachId[id as keyof typeof world.coachEmploymentByCoachId]?.status === 'unemployed') as GameWorld['userCoachId']
  if (!coachId) throw new Error('No unemployed coach for full AI profile')
  world = updateGameWorld(world, { userCoachId: coachId })
  let state = 15015
  const seed = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0)
  const label = process.env.BS15I_PROFILE_LABEL ?? 'before'
  const session = new Session()
  session.connect()
  const post = (method: string, params = {}) => new Promise<any>((resolve, reject) => session.post(method as any, params, (error, value) => error ? reject(error) : resolve(value)))
  await post('Profiler.enable')
  await post('Profiler.setSamplingInterval', { interval: 10000 })
  await post('Profiler.start')
  const windows = []
  try {
    for (let window = 1; window <= 3; window++) {
      const before = snapshot(world)
      Object.assign(measured, { updateMs: 0, updates: 0, batchedUpdates: 0, portalMs: 0, portalCalls: 0 })
      const phases: Record<string, { ms: number; calls: number; meanMs?: number }> = {}
      const started = performance.now()
      const cpuStarted = process.cpuUsage()
      const target = addDays(world.currentDate, 30)
      const result = simulateUntilDate(world, target, seed, {
        onSeasonLifecycle: (ms) => record('SEASON_LIFECYCLE', ms),
        onDayAdvance: (result) => { for (const phase of result.phases) if (phase.ran && phase.elapsedMs !== undefined) record(phase.phaseId, phase.elapsedMs) },
      })
      world = result.world
      if (world.currentDate !== target) throw new Error(`Profile stopped: ${result.stopReason.type}`)
      const wallMs = performance.now() - started
      const after = snapshot(world)
      for (const value of Object.values(phases)) value.meanMs = value.ms / value.calls
      const cpu = process.cpuUsage(cpuStarted)
      const row = { window, cpuMs: (cpu.user + cpu.system) / 1000, date: world.currentDate, wallMs, gamesResolved: after.completedGames - before.completedGames, before, after, phases, worldUpdates: { ...measured } }
      windows.push(row)
      process.stdout.write(`[BS15I 90 ${label}] ${JSON.stringify(row)}\n`)
      await new Promise(resolve => setTimeout(resolve, 0))
      function record(id: string, ms: number) { const prior = phases[id] ?? { ms: 0, calls: 0 }; phases[id] = { ms: prior.ms + ms, calls: prior.calls + 1 } }
    }
  } finally {
    const { profile } = await post('Profiler.stop')
    const scripts: { scriptId: string; url: string }[] = []
    session.on('Debugger.scriptParsed', ({ params }) => { if (params.url.endsWith('/domain/world/GameWorld.ts')) scripts.push(params) })
    await post('Debugger.enable')
    for (const script of scripts) {
      const { scriptSource } = await post('Debugger.getScriptSource', { scriptId: script.scriptId })
      writeFileSync(`C:/Temp/BS15I-${label}-world-source.js`, scriptSource)
    }
    writeFileSync(`C:/Temp/BS15I-${label}.cpuprofile`, JSON.stringify(profile))
    writeFileSync(`C:/Temp/BS15I-${label}-90.json`, JSON.stringify(windows, null, 2))
    session.disconnect()
  }
}, 900000)

function snapshot(world: GameWorld) {
  const sessions = Object.values(world.scheduledTrainingSessionsById)
  const players = Object.keys(world.players).length
  const historical = Object.values(world.players).filter(player => player.careerEnd !== undefined).length
  return { players, activePlayers: players - historical, historicalPlayers: historical,
    completedGames: Object.values(world.games).filter(game => game.status === 'completed').length,
    scoutingAssignments: Object.keys(world.scoutingAssignmentsById).length, scoutingReports: Object.keys(world.evaluatorReportsById).length,
    territoryAssignments: Object.keys(world.scoutingTerritoryAssignmentsById).length,
    scoutingCollections: Object.fromEntries(Object.entries(world).filter(([key]) => /scouting|report|awareness|organizationKnowledge/i.test(key)).map(([key, value]) => [key, Object.keys(value as object).length])),
    trainingPlans: Object.keys(world.trainingPlansByTeamId).length, individualPlans: Object.keys(world.individualTrainingPlansByPlayerId).length,
    trainingSessions: sessions.length, completedTrainingSessions: sessions.filter(session => session.status === 'completed').length,
    developmentEvents: Object.keys(world.developmentStimulusEventsById).length,
    memory: process.memoryUsage() }
}
