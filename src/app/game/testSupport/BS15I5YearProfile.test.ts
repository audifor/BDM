import { it } from 'vitest'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { createNewGame } from '@/app/game/createNewGame'
import { runTalentLongHorizonCertification } from './TalentLongHorizonCertification'
import { addYears } from '@/domain/date'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { PlayerId } from '@/domain/ids'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { assertNcaaViability, collectNcaaContinuity } from './NcaaContinuityCertification'
import { calculateAge } from '@/domain/player'

it('BS15I five-year continuous/reloaded certification profile', async () => {
  if (process.env.BS15I_CERTIFY_5Y !== '1') return
  const certifySavePath = process.env.BS15I_CERTIFY_SAVE_PATH
  if (certifySavePath === undefined) throw new Error('BS15I_CERTIFY_SAVE_PATH must be configured before certification simulation starts')
  let world: GameWorld
  if (process.env.BS15I_CERTIFY_START_SAVE !== undefined) {
    world = deserializeGameWorldV4(JSON.parse(readFileSync(process.env.BS15I_CERTIFY_START_SAVE, 'utf8')))
  } else {
    const start = createNewGame({ seed: 15015 })
    const coachId = Object.keys(start.coachEmploymentByCoachId).find(id => start.coachEmploymentByCoachId[id as keyof typeof start.coachEmploymentByCoachId]?.status === 'unemployed') as GameWorld['userCoachId']
    if (!coachId) throw new Error('No unemployed coach for full AI five-year profile')
    world = updateGameWorld(start, { userCoachId: coachId })
  }
  if (process.env.BS15I_CERTIFY_START_SAVE !== undefined && !['2035-10-01', '2036-10-01'].includes(world.currentDate)) {
    throw new Error(`Certification resume Save must be the Y3 or Y4 boundary; got ${world.currentDate}`)
  }
  const fiveYearCheckpoints = Array.from({ length: 5 }, (_, index) => addYears(world.currentDate, index + 1))
  const targetDate = process.env.BS15I_CERTIFY_TARGET_DATE === undefined
    ? fiveYearCheckpoints[4]!
    : parseGameDate(process.env.BS15I_CERTIFY_TARGET_DATE)
  const checkpoints = fiveYearCheckpoints.filter(date => date > world.currentDate && date <= targetDate)
  const baselineNcaa = process.env.BS15I_CERTIFY_NCAA === '1' ? collectNcaaContinuity(world) : undefined
  if (baselineNcaa !== undefined) assertNcaaViability(world)
  const baseline = { date: world.currentDate, annual: collectIntegratedYearMetrics(world, world, 0), ...(baselineNcaa === undefined ? {} : { ncaa: summarizeNcaa(baselineNcaa) }) }
  process.stdout.write(`[BS15I certification start] ${JSON.stringify({ date: world.currentDate, players: baseline.annual.population.players, active: baseline.annual.population.active, materialized: baseline.annual.population.materialized, ncaa: baseline.ncaa ?? null })}\n`)
  const rows: unknown[] = []
  const baselineWorldRepairSigningIds = new Set(Object.values(world.playerTransactionsById).filter(transaction => transaction.kind === 'signedFreeAgent' && transaction.provenance === 'WORLD_REPAIR').map(transaction => transaction.id))
  const commitmentRejectionEventsByPlayer = new Map<string, number>()
  let previousCheckpointWorld = world
  let previousElapsedMs = 0
  const result = await runTalentLongHorizonCertification({
    world,
    targetDate,
    seed: 15015,
    // The certification consumes exactly one seed per resolved Game. Restore the same
    // sequence when continuing a successful Save V4 boundary instead of restarting it.
    initialSeedDraws: Object.values(world.games).filter(game => game.status === 'completed').length,
    checkpointDates: checkpoints,
    saveReloadDates: checkpoints,
    deepIntegrityDates: checkpoints,
    maximumRuntimeMs: 120 * 60 * 1000,
    onProgress: (checkpoint, checkpointWorld) => {
      const ncaa = process.env.BS15I_CERTIFY_NCAA === '1' ? collectNcaaContinuity(checkpointWorld) : undefined
      const annual = collectIntegratedYearMetrics(previousCheckpointWorld, checkpointWorld, checkpoint.elapsedMs - previousElapsedMs)
      previousCheckpointWorld = checkpointWorld
      previousElapsedMs = checkpoint.elapsedMs
      const memory = recordAnnualMemory()
      const worldRepairSignings = Object.values(checkpointWorld.playerTransactionsById).filter(transaction => transaction.kind === 'signedFreeAgent' && transaction.provenance === 'WORLD_REPAIR' && !baselineWorldRepairSigningIds.has(transaction.id))
      const preemptedPendingSignings = worldRepairSignings.filter(transaction => Object.values(checkpointWorld.recruitSigningsById).some(signing => {
        if (signing.playerId !== transaction.playerId || signing.signedOn > transaction.occurredOn) return false
        const season = checkpointWorld.seasons[signing.targetSeasonId]
        const cycle = checkpointWorld.recruitingCyclesById[signing.cycleId]
        const competition = season === undefined ? undefined : checkpointWorld.competitions[season.competitionId]
        return season !== undefined && competition !== undefined && cycle !== undefined && cycle.targetSeasonId === signing.targetSeasonId
          && competition.ecosystemId === cycle.ecosystemId && competition.participantTeamIds.includes(signing.programTeamId)
          && season.startDate >= transaction.occurredOn && season.endDate >= transaction.occurredOn
      }))
      const commitmentRejectionAudit = {
        worldRepairSignings: worldRepairSignings.length,
        pendingBindingCommitmentRejectionEvents: [...commitmentRejectionEventsByPlayer.values()].reduce((sum, count) => sum + count, 0),
        distinctPendingBindingPlayersRejected: commitmentRejectionEventsByPlayer.size,
        pendingDestinationPreemptions: preemptedPendingSignings.length,
      }
      const checkpointSavePath = `${certifySavePath}.${checkpoint.date}.json`
      const checkpointSaveJson = JSON.stringify(serializeGameWorldV4(checkpointWorld, `${checkpoint.date}T00:00:00.000Z`))
      writeFileSync(checkpointSavePath, checkpointSaveJson)
      let persistedSaveBytes: number | undefined
      if (checkpoint.date === targetDate) {
        writeFileSync(certifySavePath, checkpointSaveJson)
        persistedSaveBytes = statSync(certifySavePath).size
        if (persistedSaveBytes !== Buffer.byteLength(checkpointSaveJson)) throw new Error(`Persisted Y5 Save size mismatch at ${certifySavePath}`)
      }
      const row = {
        ...checkpoint,
        annual,
        ...(ncaa === undefined ? {} : { ncaa: summarizeNcaa(ncaa) }),
        memory,
        worldRepairAudit: commitmentRejectionAudit,
        ...(persistedSaveBytes === undefined ? {} : { exactSavePath: certifySavePath, persistedSaveBytes }),
      }
      rows.push(row)
      process.stdout.write(`[BS15I annual checkpoint] ${JSON.stringify({ date: checkpoint.date, elapsedMs: annual.runtimeMs, players: annual.population.players, active: annual.population.active, retired: annual.population.retired, materialized: annual.population.materialized, ncaa: row.ncaa === undefined ? null : { enrolled: row.ncaa.enrolled, eligible: row.ncaa.eligible, min: row.ncaa.minimumEligibleTeam, max: row.ncaa.maximumEligibleTeam, teamsBelowMinimum: row.ncaa.teamsBelowMinimum }, memory, saveBytes: checkpoint.saveBytes, saveMs: checkpoint.saveMs, loadMs: checkpoint.loadMs })}\n`)
      writeFileSync(process.env.BS15I_CERTIFY_METRICS_PATH ?? 'C:/Temp/BS15I-rescue2-5y.json', JSON.stringify({ baseline, checkpoints: rows }, null, 2))
      if (ncaa !== undefined) assertNcaaViability(checkpointWorld)
    },
    onDayAdvance: result => {
      for (const report of result.repairReports) for (const diagnostic of report.diagnostics) {
        if (report.sourceDomain !== 'WORLD_REPAIR' || diagnostic.code !== 'PENDING_BINDING_ROSTER_COMMITMENT') continue
        commitmentRejectionEventsByPlayer.set(report.targetEntity, (commitmentRejectionEventsByPlayer.get(report.targetEntity) ?? 0) + 1)
      }
    },
  })
  const finalSaveJson = JSON.stringify(serializeGameWorldV4(result.world, `${result.world.currentDate}T00:00:00.000Z`))
  writeFileSync(certifySavePath, finalSaveJson)
  if (statSync(certifySavePath).size !== Buffer.byteLength(finalSaveJson)) throw new Error(`Final persisted Save size mismatch at ${certifySavePath}`)
  if (result.timedOutAt !== undefined) throw new Error(`Five-year watchdog reached at ${result.timedOutAt}`)
  if (result.stopReason !== undefined) throw new Error(`Five-year canonical simulation stopped: ${JSON.stringify(result.stopReason)}`)
  if (result.world.currentDate !== targetDate) throw new Error(`Long-horizon simulation ended at ${result.world.currentDate}, expected ${targetDate}`)
  if (process.env.BS15I_CERTIFY_NCAA === '1') {
    assertNcaaViability(result.world)
    writeFileSync(process.env.BS15I_CERTIFY_NCAA_PATH ?? 'C:/Temp/BS15I-NCAA-latest-horizon.json', JSON.stringify(summarizeNcaa(collectNcaaContinuity(result.world)), null, 2))
  }
  if (rows.length !== checkpoints.length) throw new Error(`Expected ${checkpoints.length} annual checkpoints; got ${rows.length}`)
  process.stdout.write(`[BS15I horizon complete] ${JSON.stringify({ elapsedMs: result.elapsedMs, targetDate, currentDate: result.world.currentDate, checkpoints: rows.length, players: Object.keys(result.world.players).length, games: Object.values(result.world.games).filter(game => game.status === 'completed').length })}\n`)
}, 125 * 60 * 1000)

function recordAnnualMemory() {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  gc?.()
  gc?.()
  const { heapUsed, rss } = process.memoryUsage()
  return { gcAvailable: gc !== undefined, heapUsedBytes: heapUsed, rssBytes: rss }
}

function summarizeNcaa(ncaa: ReturnType<typeof collectNcaaContinuity>) {
  const eligibleCounts = ncaa.teams.map(team => team.eligible).sort((a, b) => a - b)
  return {
    date: ncaa.date,
    rostered: ncaa.rostered,
    enrolled: ncaa.enrolled,
    eligible: ncaa.eligible,
    minimumEligibleTeam: eligibleCounts[0] ?? null,
    medianEligibleTeam: eligibleCounts.length === 0 ? null : eligibleCounts.length % 2 === 1 ? eligibleCounts[(eligibleCounts.length - 1) / 2]! : (eligibleCounts[eligibleCounts.length / 2 - 1]! + eligibleCounts[eligibleCounts.length / 2]!) / 2,
    maximumEligibleTeam: eligibleCounts.at(-1) ?? null,
    teamsBelowMinimum: ncaa.teams.filter(team => team.deficit > 0).length,
    signedTotal: ncaa.signedTotal,
    successfulArrivals: ncaa.successfulArrivals,
    transfersIn: ncaa.transfersIn,
    transfersOut: ncaa.transfersOut,
    proExits: ncaa.proExits,
    rawTalentCapacity: ncaa.rawTalentCapacity,
    talentMaterializations: ncaa.talentMaterializations,
    recruitingPoolSize: ncaa.recruitingPoolSize,
  }
}

function collectIntegratedYearMetrics(previous: GameWorld, current: GameWorld, runtimeMs: number) {
  const periodStart = previous.currentDate
  const inPeriod = (date: string | undefined) => date !== undefined && date > periodStart && date <= current.currentDate
  const ncaaCompetitions = Object.values(current.competitions).filter(competition => current.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike')
  const currentNcaaPlayers = new Set(ncaaCompetitions.flatMap(competition => competition.participantTeamIds.flatMap(teamId => current.teams[teamId]?.rosterPlayerIds ?? [])))
  const previousNcaaPlayers = new Set(Object.values(previous.competitions).filter(competition => previous.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike').flatMap(competition => competition.participantTeamIds.flatMap(teamId => previous.teams[teamId]?.rosterPlayerIds ?? [])))
  const newNcaaPlayers = [...currentNcaaPlayers].filter(playerId => !previousNcaaPlayers.has(playerId)).map(playerId => current.players[playerId as PlayerId]!).filter(Boolean)
  const previousRosteredPlayers = new Set(Object.values(previous.teams).flatMap(team => team.rosterPlayerIds))
  const currentRosteredPlayers = new Set(Object.values(current.teams).flatMap(team => team.rosterPlayerIds))
  const portalTransfers = Object.values(current.transferPortalEntriesById).filter(entry => entry.status === 'completed' && inPeriod(entry.movement?.transferredOn))
  const portalPlayerIds = new Set(portalTransfers.map(entry => entry.playerId))
  const sourceMix = { US_HIGH_SCHOOL: 0, JUCO: 0, INTERNATIONAL_CLUB: 0, ACADEMY_YOUTH: 0, OTHER_PRECOLLEGE: 0, PORTAL: 0, LEGACY_SYNTHETIC: 0, UNKNOWN: 0 }
  const genderSourceMix: Record<string, typeof sourceMix> = { male: { ...sourceMix }, female: { ...sourceMix } }
  const positions: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 }
  const ages: number[] = []
  for (const player of newNcaaPlayers) {
    const profile = Object.values(current.recruitProfilesById).find(item => item.playerId === player.id)
    let source: keyof typeof sourceMix
    if (portalPlayerIds.has(player.id) || profile?.origin === 'transfer') source = 'PORTAL'
    else {
      const pathway = player.pathwayHistory?.at(-1)?.source
      if (pathway !== undefined) source = pathway
      else if (!Object.values(current.talentMaterializationsByCandidateKey).some(item => item.playerId === player.id)) source = profile === undefined ? 'UNKNOWN' : 'LEGACY_SYNTHETIC'
      else source = 'UNKNOWN'
    }
    sourceMix[source] += 1
    genderSourceMix[player.gender]![source] += 1
    positions[player.basketball.primaryPosition] = (positions[player.basketball.primaryPosition] ?? 0) + 1
    ages.push(calculateAge(player.bio.dateOfBirth, current.currentDate))
  }
  const datedCount = <T>(values: readonly T[], getDate: (item: T) => string | undefined) => values.filter(item => inPeriod(getDate(item))).length
  const profiles = Object.values(current.recruitProfilesById)
  const previousProfileIds = new Set(Object.keys(previous.recruitProfilesById))
  const offers = Object.values(current.recruitingOffersById)
  const commitments = Object.values(current.recruitingCommitmentsById)
  const signings = Object.values(current.recruitSigningsById)
  const enrollments = Object.values(current.playerEnrollmentsById)
  const cohortCapacity = Object.values(current.talentCohortsById).reduce((sum, cohort) => sum + cohort.candidateCapacity, 0)
  const materializations = Object.values(current.talentMaterializationsByCandidateKey)
  const drafts = Object.values(current.draftsById).flatMap(draft => (draft.entries ?? []).map(entry => ({ ...entry, draftId: draft.id })))
  const transitions = Object.values(current.ecosystemTransitionsById).filter(transition => inPeriod(transition.effectiveDate))
  const proExitTransitions = transitions.filter(item => ['ncaaToNbaDraft', 'ncaaToNbaUndrafted', 'ncaaToFiba'].includes(item.transitionType))
  const rights = Object.values(current.playerRightsById).filter(right => inPeriod(right.acquiredAt))
  const professionalContracts = Object.values(current.contractsById).filter(contract => {
    if (!inPeriod(contract.term.startsOn)) return false
    const competition = Object.values(current.competitions).find(item => item.participantTeamIds.includes(contract.teamId))
    return competition === undefined || current.ecosystems[competition.ecosystemId]?.kind !== 'ncaaLike'
  })
  const sortedAges = [...ages].sort((a, b) => a - b)
  const median = sortedAges.length === 0 ? null : sortedAges.length % 2 ? sortedAges[(sortedAges.length - 1) / 2]! : (sortedAges[sortedAges.length / 2 - 1]! + sortedAges[sortedAges.length / 2]!) / 2
  const ageBuckets = { '17': 0, '18': 0, '19': 0, '20': 0, '21+': 0 }
  for (const age of ages) ageBuckets[age < 18 ? '17' : age >= 21 ? '21+' : String(age) as '18' | '19' | '20'] += 1
  const rosterByTeam = ncaaCompetitions.flatMap(competition => competition.participantTeamIds.map(teamId => ({ teamId, rostered: current.teams[teamId]?.rosterPlayerIds.length ?? 0 })))
  return {
    interval: { fromExclusive: periodStart, through: current.currentDate }, runtimeMs,
    population: { persons: Object.keys(current.personsById).length, players: Object.keys(current.players).length, active: Object.values(current.players).filter(player => player.careerEnd === undefined).length, retired: Object.values(current.players).filter(player => player.careerEnd !== undefined).length, unrosteredActive: Object.values(current.players).filter(player => player.careerEnd === undefined && !Object.values(current.teams).some(team => team.rosterPlayerIds.includes(player.id))).length, createdPlayers: Object.keys(current.players).filter(id => previous.players[id as PlayerId] === undefined).length, cohortCapacity, materialized: materializations.length, cumulativeMaterializations: materializations.length },
    turnover: {
      enteredWorld: Object.keys(current.players).filter(id => previous.players[id as PlayerId] === undefined).length,
      enteredNcaa: newNcaaPlayers.length,
      leftNcaa: [...previousNcaaPlayers].filter(playerId => !currentNcaaPlayers.has(playerId)).length,
      enteredProfessional: new Set(proExitTransitions.map(item => item.playerId)).size,
      becameFreeOrUnrostered: [...previousRosteredPlayers].filter(playerId => !currentRosteredPlayers.has(playerId) && current.players[playerId as PlayerId]?.careerEnd === undefined).length,
      careerEnded: Object.values(current.players).filter(player => player.careerEnd !== undefined && previous.players[player.id] !== undefined && previous.players[player.id]!.careerEnd === undefined).length,
    },
    intake: { newNcaaRosterPlayers: newNcaaPlayers.length, sourceMix, genderSourceMix, positions, ageBuckets, meanAge: ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null, medianAge: median, examples: newNcaaPlayers.slice(0, 3).map(player => ({ playerId: player.id, personId: player.personId, source: player.pathwayHistory?.at(-1)?.source ?? null, position: player.basketball.primaryPosition, age: calculateAge(player.bio.dateOfBirth, current.currentDate) })) },
    recruitingFunnel: { talentSupplyCohortsCreated: Object.keys(current.talentCohortsById).filter(id => previous.talentCohortsById[id] === undefined).length, materialized: datedCount(materializations, item => item.materializedOn), recruitProfilesCreated: profiles.filter(profile => !previousProfileIds.has(profile.id)).length, offers: datedCount(offers, item => item.madeOn), commitments: datedCount(commitments, item => item.committedOn), signings: datedCount(signings, item => item.signedOn), enrollments: datedCount(enrollments, item => item.startsOn), legacySyntheticArrivals: sourceMix.LEGACY_SYNTHETIC },
    portalFunnel: { notified: datedCount(Object.values(current.transferPortalEntriesById), item => item.notifiedOn), authorized: datedCount(Object.values(current.transferPortalEntriesById).filter(entry => entry.processedOn !== undefined), item => item.processedOn), completed: portalTransfers.length, recruited: profiles.filter(profile => profile.origin === 'transfer' && !previousProfileIds.has(profile.id)).length, committed: commitments.filter(commitment => inPeriod(commitment.committedOn) && current.recruitProfilesById[commitment.recruitId]?.origin === 'transfer').length },
    draftPro: { declarations: drafts.filter(entry => (entry.history ?? []).some(event => event.status === 'declaredEarlyEntry' && inPeriod(event.occurredOn))).length, automaticEntries: drafts.filter(entry => entry.entryType === 'automatic' && entry.status !== 'considering').length, finalPool: drafts.filter(entry => (entry.history ?? []).some(event => event.status === 'finalPool' && inPeriod(event.occurredOn))).length, drafted: drafts.filter(entry => (entry.history ?? []).some(event => event.status === 'drafted' && inPeriod(event.occurredOn))).length, undrafted: drafts.filter(entry => (entry.history ?? []).some(event => event.status === 'undrafted' && inPeriod(event.occurredOn))).length, rightsCreated: rights.length, rightsEvaluated: rights.filter(right => right.status === 'active').length, unsignedRights: Object.values(current.playerRightsById).filter(right => right.status === 'active' && right.contractId === undefined).length, proTransitions: proExitTransitions.length, proContractsStarted: professionalContracts.length },
    academic: { rosterByTeam, activeEnrollmentRecords: enrollments.filter(item => item.status === 'active' && item.startsOn <= current.currentDate && (item.endsOn === undefined || item.endsOn >= current.currentDate)).length },
    identityInputs: { uniqueMaterializationPlayers: new Set(materializations.map(item => item.playerId)).size, activeEnrollmentPlayers: new Set(enrollments.filter(item => item.status === 'active').map(item => item.playerId)).size },
  }
}
