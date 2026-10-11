import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { createNewGame } from '@/app/game/createNewGame'
import { addYears, parseGameDate } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { evaluateProfessionalAcquisition } from '@/engine/career/AiProfessionalPathways'
import { runTalentLongHorizonCertification } from './TalentLongHorizonCertification'
import { establishPortalContinuationScenario } from './PathwayTurnoverCertification'
import { assertNcaaViability, collectNcaaContinuity } from './NcaaContinuityCertification'
import { buildPlayerHistoryModel } from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'

function turnover(world: GameWorld) {
  const entries = Object.values(world.draftsById).flatMap(draft => draft.entries ?? [])
  const portal = Object.values(world.transferPortalEntriesById)
  const rights = Object.values(world.playerRightsById).filter(right => right.rightsType === 'draft')
  const pro = Object.values(world.ecosystemTransitionsById).filter(item => ['ncaaToNbaDraft', 'ncaaToNbaUndrafted', 'fibaToNba', 'fibaToNbaUndrafted'].includes(item.transitionType))
  const pool = entries.filter(entry => entry.history?.some(event => event.status === 'finalPool'))
  return {
    portalNotices: portal.length, portalAuthorizations: portal.filter(entry => entry.processedOn !== undefined).length,
    completedCollegeTransfers: portal.filter(entry => entry.movement !== undefined).length,
    draftDeclarations: entries.filter(entry => entry.declaredOn !== undefined).length,
    finalPoolEntries: pool.length, finalPoolDistinctPlayers: new Set(pool.map(entry => entry.playerId)).size,
    drafted: Object.values(world.draftPicksById).filter(pick => pick.selection !== undefined).length,
    undraftedEntries: entries.filter(entry => entry.status === 'undrafted').length,
    rightsCreated: rights.length, rightsSigned: rights.filter(right => right.contractId !== undefined).length,
    rightsRemainingUnsigned: rights.filter(right => right.contractId === undefined).length,
    proContractsCreated: pro.filter(item => item.contractId !== undefined).length,
    ncaaProExits: pro.filter(item => item.transitionType.startsWith('ncaa')).length,
    internationalProExits: pro.filter(item => item.transitionType.startsWith('fiba')).length,
    ncaaArrivals: Object.values(world.recruitSigningsById).filter(signing => world.recruitProfilesById[signing.recruitId]?.status === 'arrived').length,
    ncaaNewTalentArrivals: Object.values(world.recruitSigningsById).filter(signing => world.recruitProfilesById[signing.recruitId]?.status === 'arrived' && world.recruitProfilesById[signing.recruitId]?.origin !== 'transfer').length,
  }
}

it('certifies five years of canonical Portal/pro turnover, replacement and annual Save V4 continuity', async () => {
  if (process.env.BS15I_PATHWAY_CERTIFY !== '1') return
  const fresh = createNewGame({ seed: 15015 })
  const coachId = Object.keys(fresh.coachEmploymentByCoachId).find(id => fresh.coachEmploymentByCoachId[id as keyof typeof fresh.coachEmploymentByCoachId]?.status === 'unemployed') as GameWorld['userCoachId']
  expect(coachId).toBeDefined()
  const world = process.env.BS15I_PATHWAY_START_SAVE === undefined ? updateGameWorld(fresh, { userCoachId: coachId }) : deserializeGameWorldV4(JSON.parse(readFileSync(process.env.BS15I_PATHWAY_START_SAVE, 'utf8')))
  const targetDate = parseGameDate(process.env.BS15I_PATHWAY_TARGET_DATE ?? '2037-10-01')
  const dates = Array.from({ length: 5 }, (_, i) => addYears(fresh.currentDate, i + 1)).filter(date => date > world.currentDate && date <= targetDate)
  const prefix = 'C:/Temp/BS15I-pathway-save-v4'
  const rows = process.env.BS15I_PATHWAY_START_SAVE === undefined ? [] : (JSON.parse(readFileSync('C:/Temp/BS15I-pathway-five-year-metrics.json', 'utf8')) as { date: string; elapsedMs: number }[]).filter(row => row.date <= world.currentDate)
  const prefixElapsed = rows.at(-1)?.elapsedMs ?? 0
  const phases: Record<string, number> = {}
  const decisions: Record<string, { evaluations: number; attempted: number; signed: number; blockers: Record<string, number> }> = {}
  let previous = turnover(world), previousElapsed = prefixElapsed
  let savedPortal = Object.values(world.transferPortalEntriesById).some(entry => entry.movement !== undefined)
  let savedPro = Object.keys(world.ecosystemTransitionsById).length > 0
  const saveRoute = (current: GameWorld, route: string) => {
    const envelope = serializeGameWorldV4(current, `${current.currentDate}T00:00:00.000Z`)
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(envelope)))
    expect(restored.ecosystemTransitionsById).toEqual(current.ecosystemTransitionsById)
    expect(restored.transferPortalEntriesById).toEqual(current.transferPortalEntriesById)
    for (const team of Object.values(current.teams)) expect(restored.teams[team.id]!.rosterPlayerIds).toEqual(team.rosterPlayerIds)
    for (const entry of Object.values(current.transferPortalEntriesById).filter(item => item.movement !== undefined)) {
      expect(restored.players[entry.playerId]!.personId).toBe(current.players[entry.playerId]!.personId)
      expect(buildPlayerHistoryModel(restored, entry.playerId)!.items.some(item => item.id === `career:portal:${entry.id}`)).toBe(true)
    }
    for (const transition of Object.values(current.ecosystemTransitionsById)) {
      expect(restored.players[transition.playerId]!.personId).toBe(current.players[transition.playerId]!.personId)
      expect(buildPlayerHistoryModel(restored, transition.playerId)!.items.some(item => item.id === `ecosystem:${transition.id}`)).toBe(true)
    }
    writeFileSync(`C:/Temp/BS15I-pathway-integrated-${route}-save-v4.json`, JSON.stringify(envelope))
  }
  const result = await runTalentLongHorizonCertification({
    world, targetDate, seed: 15015, initialSeedDraws: Object.values(world.games).filter(game => game.status === 'completed').length,
    prepareWorldBeforeChunk: establishPortalContinuationScenario,
    checkpointDates: dates, saveReloadDates: dates, deepIntegrityDates: dates,
    maximumRuntimeMs: 180 * 60 * 1000,
    onDayAdvance: day => {
      if (day.status === 'FAILED') {
        writeFileSync('C:/Temp/BS15I-pathway-day-failure.json', JSON.stringify({ date: day.world.currentDate, failure: day.failure, repairReports: day.repairReports }, null, 2))
        writeFileSync('C:/Temp/BS15I-pathway-failed-save-v4.json', JSON.stringify(serializeGameWorldV4(day.world, `${day.world.currentDate}T00:00:00.000Z`)))
      }
      for (const phase of day.phases) {
        if (phase.ran && phase.elapsedMs !== undefined) phases[phase.phaseId] = (phases[phase.phaseId] ?? 0) + phase.elapsedMs
        if (phase.phaseId !== 'PROFESSIONAL_PATHWAYS') continue
        for (const diagnostic of phase.diagnostics) {
          if (!diagnostic.sourceId || !diagnostic.code.startsWith('AI_PROFESSIONAL_')) continue
          const row = decisions[diagnostic.sourceId] ?? { evaluations: 0, attempted: 0, signed: 0, blockers: {} }
          row.evaluations++
          if (diagnostic.message.includes('attempted=true')) row.attempted++
          if (diagnostic.code === 'AI_PROFESSIONAL_SIGNED') row.signed++
          else row.blockers[diagnostic.code] = (row.blockers[diagnostic.code] ?? 0) + 1
          decisions[diagnostic.sourceId] = row
        }
      }
      if (!savedPortal && Object.values(day.world.transferPortalEntriesById).some(entry => entry.movement !== undefined)) { saveRoute(day.world, 'portal'); savedPortal = true; process.stdout.write(`[pathway Portal completed] ${day.world.currentDate}\n`) }
      if (!savedPro && Object.keys(day.world.ecosystemTransitionsById).length > 0) { saveRoute(day.world, 'professional'); savedPro = true; process.stdout.write(`[pathway pro completed] ${day.world.currentDate}\n`) }
      if (day.world.currentDate.endsWith('-01')) process.stdout.write(`[pathway progress] ${day.world.currentDate}\n`)
    },
    onProgress: (checkpoint, current) => {
      const cumulative = turnover(current), ncaa = collectNcaaContinuity(current)
      const annual = Object.fromEntries(Object.entries(cumulative).map(([key, value]) => [key, value - previous[key as keyof typeof previous]]))
      const elapsedMs = prefixElapsed + checkpoint.elapsedMs
      const row = { ...checkpoint, elapsedMs, annualRuntimeMs: elapsedMs - previousElapsed, annual, cumulative, phases: { ...phases }, ncaa }
      rows.push(row)
      writeFileSync('C:/Temp/BS15I-pathway-five-year-metrics.json', JSON.stringify(rows, null, 2))
      writeFileSync(`${prefix}.${checkpoint.date}.json`, JSON.stringify(serializeGameWorldV4(current, `${checkpoint.date}T00:00:00.000Z`)))
      writeFileSync('C:/Temp/BS15I-pathway-checkpoint-decisions.json', JSON.stringify({ date: current.currentDate, decisions }, null, 2))
      process.stdout.write(`[pathway checkpoint] ${JSON.stringify({ date: checkpoint.date, elapsedMs, annualRuntimeMs: row.annualRuntimeMs, annual, cumulative, ncaa: { enrolled: ncaa.enrolled, eligible: ncaa.eligible, minimumEligible: Math.min(...ncaa.teams.map(team => team.eligible)) } })}\n`)
      assertNcaaViability(current)
      previous = cumulative; previousElapsed = elapsedMs
      for (const key of Object.keys(phases)) delete phases[key]
    },
  })
  writeFileSync(`${prefix}.${result.world.currentDate}.json`, JSON.stringify(serializeGameWorldV4(result.world, `${result.world.currentDate}T00:00:00.000Z`)))
  const final = turnover(result.world)
  const unsignedRights = Object.values(result.world.playerRightsById).filter(right => right.rightsType === 'draft' && right.contractId === undefined).map(right => {
    const pick = Object.values(result.world.draftPicksById).find(item => item.selection?.playerId === right.playerId)
    return { right, personId: result.world.players[right.playerId]?.personId, evaluation: pick ? evaluateProfessionalAcquisition(result.world, { playerId: right.playerId, teamId: right.ownerTeamId, draftId: pick.draftId, rightsId: right.id }) : { blocker: 'NO_CANONICAL_DRAFT_PICK' } }
  })
  const routes = { portal: Object.values(result.world.transferPortalEntriesById).filter(entry => entry.movement !== undefined), professional: Object.values(result.world.ecosystemTransitionsById).map(item => ({ ...item, personId: result.world.players[item.playerId]?.personId })), unsignedRights, decisions, final, elapsedMs: prefixElapsed + result.elapsedMs, resumedFrom: world.currentDate, prefixElapsedMs: prefixElapsed, stopReason: result.stopReason, timedOutAt: result.timedOutAt }
  writeFileSync('C:/Temp/BS15I-pathway-five-year-routes.json', JSON.stringify(routes, null, 2))
  expect(result.stopReason).toBeUndefined(); expect(result.timedOutAt).toBeUndefined(); expect(result.world.currentDate).toBe(targetDate)
  assertNcaaViability(result.world)
  if (targetDate === '2033-02-20') expect(final.completedCollegeTransfers).toBeGreaterThan(0)
  if (targetDate === '2037-10-01') {
    expect(final.completedCollegeTransfers).toBeGreaterThan(0)
    expect(final.ncaaProExits).toBeGreaterThan(0)
    expect(final.rightsSigned).toBeGreaterThan(0)
    expect(final.ncaaArrivals).toBeGreaterThan(0)
    expect(unsignedRights.every(row => row.evaluation.blocker !== undefined)).toBe(true)
    expect(rows).toHaveLength(5)
  }
  process.stdout.write(`[pathway horizon complete] ${JSON.stringify({ targetDate, elapsedMs: prefixElapsed + result.elapsedMs, resumedFrom: world.currentDate, final })}\n`)
}, 185 * 60 * 1000)
