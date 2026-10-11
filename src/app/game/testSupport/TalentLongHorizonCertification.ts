import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import { createHash } from 'node:crypto'
import { getPlayerContractStatus } from '@/domain/contract'
import type { GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { SeededRandomSource } from '@/engine/random'
import { simulateUntilDate, type SimulateUntilObserver, type SimulateUntilStopReason } from '@/app/game/simulateUntilDate'

export interface TalentLongHorizonCertificationOptions {
  readonly world: GameWorld
  readonly targetDate: GameDate
  readonly seed: number
  readonly initialSeedDraws?: number
  readonly checkpointDates?: readonly GameDate[]
  readonly saveReloadDates?: readonly GameDate[]
  readonly deepIntegrityDates?: readonly GameDate[]
  readonly maximumRuntimeMs?: number
  readonly onProgress?: (checkpoint: TalentLongHorizonCheckpoint, world: GameWorld) => void
  readonly onDayAdvance?: SimulateUntilObserver['onDayAdvance']
  readonly onSeasonLifecycle?: SimulateUntilObserver['onSeasonLifecycle']
  readonly onSimulationBatch?: (elapsedMs: number) => void
  /** Establishes explicit canonical scenario inputs; never supplies pathway outcomes. */
  readonly prepareWorldBeforeChunk?: (world: GameWorld) => GameWorld
}

export interface TalentLongHorizonCheckpoint {
  readonly date: GameDate
  readonly elapsedMs: number
  readonly playerCount: number
  readonly activePlayerCount: number
  readonly retiredPlayerCount: number
  readonly cohortCount: number
  readonly latentCapacity: number
  readonly materializedCount: number
  readonly completedGameCount: number
  readonly rssBytes: number
  readonly saveBytes?: number
  readonly saveMs?: number
  readonly loadMs?: number
  readonly semanticDigest?: string
}

export interface TalentLongHorizonCertificationResult {
  readonly world: GameWorld
  readonly checkpoints: readonly TalentLongHorizonCheckpoint[]
  readonly timedOutAt?: GameDate
  readonly stopReason?: SimulateUntilStopReason
  readonly elapsedMs: number
}

/**
 * Test-only driver over the canonical simulate-until and Save V4 authorities. It chunks work
 * into at most 30-day windows so callers can observe progress and enforce a practical watchdog.
 */
export async function runTalentLongHorizonCertification(options: TalentLongHorizonCertificationOptions): Promise<TalentLongHorizonCertificationResult> {
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffff_ffff) throw new RangeError('Certification seed must be an unsigned 32-bit integer')
  const seedSource = new SeededRandomSource(options.seed)
  const initialSeedDraws = options.initialSeedDraws ?? 0
  if (!Number.isSafeInteger(initialSeedDraws) || initialSeedDraws < 0) throw new RangeError('Initial certification seed draws must be a nonnegative integer')
  for (let index = 0; index < initialSeedDraws; index += 1) seedSource.nextInt(0, 0xffff_ffff)
  const startedAt = performance.now()
  const checkpoints: TalentLongHorizonCheckpoint[] = []
  const checkpointDates = new Set(options.checkpointDates ?? [])
  const saveReloadDates = new Set(options.saveReloadDates ?? [])
  const deepIntegrityDates = new Set(options.deepIntegrityDates ?? [])
  let world = options.world

  while (compareGameDates(world.currentDate, options.targetDate) < 0) {
    if (options.prepareWorldBeforeChunk !== undefined) world = options.prepareWorldBeforeChunk(world)
    const chunkDate = addDays(world.currentDate, 30)
    let nextDate = compareGameDates(chunkDate, options.targetDate) < 0 ? chunkDate : options.targetDate
    for (const date of [...checkpointDates, ...saveReloadDates, ...deepIntegrityDates]) {
      if (compareGameDates(date, world.currentDate) > 0 && compareGameDates(date, nextDate) < 0) nextDate = date
    }

    const observer = options.onDayAdvance === undefined && options.onSeasonLifecycle === undefined
      ? undefined
      : { onDayAdvance: options.onDayAdvance, onSeasonLifecycle: options.onSeasonLifecycle }
    const batchStarted = performance.now()
    const result = simulateUntilDate(world, nextDate, () => seedSource.nextInt(0, 0xffff_ffff), observer)
    options.onSimulationBatch?.(performance.now() - batchStarted)
    world = result.world
    if (result.stopReason.type !== 'arrived' && compareGameDates(world.currentDate, nextDate) < 0) {
      return { world, checkpoints: Object.freeze(checkpoints), stopReason: result.stopReason, elapsedMs: performance.now() - startedAt }
    }

    let saveBytes: number | undefined
    let saveMs: number | undefined
    let loadMs: number | undefined
    let semanticDigest: string | undefined
    if (saveReloadDates.has(world.currentDate)) {
      const beforeReload = semanticSaveProjection(world)
      const beforeReloadCanonical = stableStringify(beforeReload)
      const saveStarted = performance.now()
      const envelope = serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`)
      saveBytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength
      saveMs = performance.now() - saveStarted
      const loadStarted = performance.now()
      world = deserializeGameWorldV4(JSON.parse(JSON.stringify(envelope)))
      loadMs = performance.now() - loadStarted
      const afterReload = semanticSaveProjection(world)
      const afterReloadCanonical = stableStringify(afterReload)
      if (afterReloadCanonical !== beforeReloadCanonical) {
        const changed = Object.keys(beforeReload).filter(key => stableStringify(beforeReload[key]!) !== stableStringify(afterReload[key]!))
        throw new Error(`Save V4 semantic state changed at ${world.currentDate}: ${JSON.stringify(changed.map(category => ({ category, before: beforeReload[category as keyof typeof beforeReload].length, after: afterReload[category as keyof typeof afterReload].length })))}`)
      }
      semanticDigest = createHash('sha256').update(beforeReloadCanonical).digest('hex')
    }
    if (deepIntegrityDates.has(world.currentDate)) assertLongHorizonIntegrity(world)
    if (checkpointDates.has(world.currentDate)) {
      const checkpoint = collectCheckpoint(world, performance.now() - startedAt, saveBytes, saveMs, loadMs, semanticDigest)
      checkpoints.push(checkpoint)
      options.onProgress?.(checkpoint, world)
    }

    if (options.maximumRuntimeMs !== undefined && performance.now() - startedAt >= options.maximumRuntimeMs) {
      return { world, checkpoints: Object.freeze(checkpoints), timedOutAt: world.currentDate, elapsedMs: performance.now() - startedAt }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  return { world, checkpoints: Object.freeze(checkpoints), elapsedMs: performance.now() - startedAt }
}

function collectCheckpoint(world: GameWorld, elapsedMs: number, saveBytes?: number, saveMs?: number, loadMs?: number, semanticDigest?: string): TalentLongHorizonCheckpoint {
  const playerCount = Object.keys(world.players).length
  const activePlayerCount = Object.values(world.players).filter((player) => player.careerEnd === undefined).length
  return {
    date: world.currentDate,
    elapsedMs,
    playerCount,
    activePlayerCount,
    retiredPlayerCount: playerCount - activePlayerCount,
    cohortCount: Object.keys(world.talentCohortsById).length,
    latentCapacity: Object.values(world.talentCohortsById).reduce((total, cohort) => total + cohort.candidateCapacity, 0),
    materializedCount: Object.keys(world.talentMaterializationsByCandidateKey).length,
    completedGameCount: Object.values(world.games).filter((game) => game.status === 'completed').length,
    rssBytes: typeof process === 'undefined' ? 0 : process.memoryUsage().rss,
    ...(saveBytes === undefined ? {} : { saveBytes }),
    ...(saveMs === undefined ? {} : { saveMs }),
    ...(loadMs === undefined ? {} : { loadMs }),
    ...(semanticDigest === undefined ? {} : { semanticDigest }),
  }
}

export function assertLongHorizonIntegrity(world: GameWorld): void {
  const players = Object.values(world.players)
  const people = Object.values(world.personsById)
  for (const [playerId, player] of Object.entries(world.players)) if (player.id !== playerId) throw new Error(`Player index key mismatch for ${playerId}`)
  for (const [personId, person] of Object.entries(world.personsById)) if (person.id !== personId) throw new Error(`Person index key mismatch for ${personId}`)
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error('Duplicate Player identity in certification world')
  if (new Set(people.map((person) => person.id)).size !== people.length) throw new Error('Duplicate Person identity in certification world')
  const rostered = new Set<string>()
  for (const team of Object.values(world.teams)) {
    if (new Set(team.rosterPlayerIds).size !== team.rosterPlayerIds.length) throw new Error(`Duplicate roster entry for Team ${team.id}`)
    for (const playerId of team.rosterPlayerIds) {
      if (world.players[playerId] === undefined) throw new Error(`Missing Player ${playerId} on Team ${team.id}`)
      if (world.players[playerId]!.careerEnd !== undefined) throw new Error(`Retired Player ${playerId} remains rostered`)
      if (rostered.has(playerId)) throw new Error(`Player ${playerId} is on multiple rosters`)
      rostered.add(playerId)
    }
  }
  for (const player of players) {
    const person = player.personId === undefined ? undefined : world.personsById[player.personId]
    if (person === undefined || person.id !== player.personId || !person.profileRefs.some(ref => ref.kind === 'player' && ref.profileId === player.id)) throw new Error(`Player ${player.id} has no canonical Person link`)
  }
  const materializedPlayers = new Set<string>()
  for (const [candidateKey, record] of Object.entries(world.talentMaterializationsByCandidateKey)) {
    if (candidateKey !== record.candidateKey) throw new Error(`Talent materialization key mismatch for ${candidateKey}`)
    if (world.players[record.playerId] === undefined) throw new Error(`Materialization ${record.candidateKey} references a missing Player`)
    if (materializedPlayers.has(record.playerId)) throw new Error(`Player ${record.playerId} was materialized by multiple Talent candidates`)
    materializedPlayers.add(record.playerId)
  }
  const activeEnrollments = new Set<string>()
  for (const enrollment of Object.values(world.playerEnrollmentsById).filter(item => item.status === 'active' && item.startsOn <= world.currentDate && (item.endsOn === undefined || item.endsOn >= world.currentDate))) {
    if (world.players[enrollment.playerId] === undefined) throw new Error(`Enrollment ${enrollment.id} references a missing Player`)
    if (activeEnrollments.has(enrollment.playerId)) throw new Error(`Player ${enrollment.playerId} has duplicate active enrollments`)
    if (!world.teams[enrollment.teamId]?.rosterPlayerIds.includes(enrollment.playerId)) throw new Error(`Enrollment ${enrollment.id} has no matching current roster membership`)
    activeEnrollments.add(enrollment.playerId)
  }
  for (const team of Object.values(world.teams)) {
    const isNcaa = Object.values(world.competitions).some(competition => competition.participantTeamIds.includes(team.id) && world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike')
    if (isNcaa) for (const playerId of team.rosterPlayerIds) if (!activeEnrollments.has(playerId)) throw new Error(`NCAA roster Player ${playerId} on ${team.id} has no active enrollment`)
  }
  const activeProfessionalContracts = new Set<string>()
  for (const contract of Object.values(world.contractsById)) {
    if (world.players[contract.playerId] === undefined) throw new Error(`Contract ${contract.id} references a missing Player`)
    if (getPlayerContractStatus(contract, world.currentDate) !== 'active') continue
    if (activeProfessionalContracts.has(contract.playerId)) throw new Error(`Player ${contract.playerId} has multiple active professional contracts`)
    activeProfessionalContracts.add(contract.playerId)
  }
  for (const transaction of Object.values(world.playerTransactionsById)) if (world.players[transaction.playerId] === undefined) throw new Error(`Player transaction ${transaction.id} references a missing Player`)
  const signedContractIds = new Set<string>()
  for (const transaction of Object.values(world.playerTransactionsById)) if (transaction.kind === 'signedFreeAgent' && transaction.contractId !== undefined) {
    if (signedContractIds.has(transaction.contractId)) throw new Error(`Contract ${transaction.contractId} has duplicate pro-signing transactions`)
    signedContractIds.add(transaction.contractId)
  }
  for (const draft of Object.values(world.draftsById)) for (const entry of draft.entries ?? []) if (world.players[entry.playerId] === undefined) throw new Error(`Draft ${draft.id} references a missing Player`)
  for (const pick of Object.values(world.draftPicksById)) if (pick.selection !== undefined && world.players[pick.selection.playerId] === undefined) throw new Error(`Draft pick ${pick.id} references a missing Player`)
  for (const right of Object.values(world.playerRightsById)) if (world.players[right.playerId] === undefined) throw new Error(`Draft rights ${right.id} references a missing Player`)
  for (const playerId of activeEnrollments) if (activeProfessionalContracts.has(playerId)) throw new Error(`Player ${playerId} is simultaneously NCAA enrolled and under an active professional contract`)
  for (const entry of Object.values(world.transferPortalEntriesById)) if (world.players[entry.playerId] === undefined) throw new Error(`Portal entry ${entry.id} references a missing Player`)
  for (const transition of Object.values(world.ecosystemTransitionsById)) if (world.players[transition.playerId] === undefined) throw new Error(`Ecosystem transition ${transition.id} references a missing Player`)
}

export function semanticSaveProjection(world: GameWorld): Readonly<Record<string, readonly unknown[]>> {
  const sortById = <T extends { readonly id: string }>(values: readonly T[]): readonly T[] => [...values].sort((a, b) => a.id.localeCompare(b.id))
  return {
    metadata: [{ currentDate: world.currentDate, currentSeasonId: world.currentSeasonId }],
    players: sortById(Object.values(world.players)),
    persons: sortById(Object.values(world.personsById)),
    rosters: Object.values(world.teams).map(team => ({ teamId: team.id, playerIds: [...team.rosterPlayerIds] })).sort((a, b) => a.teamId.localeCompare(b.teamId)),
    games: sortById(Object.values(world.games)),
    matchHistory: Object.entries(world.matchStatLogsByGameId).sort(([left], [right]) => left.localeCompare(right)).map(([gameId, log]) => ({ gameId, log })),
    seasonHistory: Object.entries(world.seasonHistoryBySeasonId).sort(([left], [right]) => left.localeCompare(right)).map(([seasonId, history]) => ({ seasonId, history })),
    enrollments: sortById(Object.values(world.playerEnrollmentsById)),
    injuries: sortById(Object.values(world.injuriesById)),
    contracts: sortById(Object.values(world.contractsById)),
    playerTransactions: sortById(Object.values(world.playerTransactionsById)),
    draftRights: sortById(Object.values(world.playerRightsById)),
    drafts: sortById(Object.values(world.draftsById)),
    draftPicks: sortById(Object.values(world.draftPicksById)),
    portal: sortById(Object.values(world.transferPortalEntriesById)),
    materializations: Object.values(world.talentMaterializationsByCandidateKey).sort((a, b) => a.candidateKey.localeCompare(b.candidateKey)),
    cohorts: sortById(Object.values(world.talentCohortsById)),
    registrations: sortById(Object.values(world.playerRegistrationsById)),
    eligibility: sortById(Object.values(world.collegeEligibilityAssessmentsById)),
    academics: sortById(Object.values(world.academicProfilesById)),
    academicTerms: sortById(Object.values(world.academicTermRecordsById)),
    academicSupport: sortById(Object.values(world.academicSupportPlansById)),
    recruiting: sortById(Object.values(world.recruitProfilesById)),
    recruitingCycles: sortById(Object.values(world.recruitingCyclesById)),
    recruitingInterests: [...world.recruitingInterests].sort((a, b) => `${a.programTeamId}:${a.recruitId}`.localeCompare(`${b.programTeamId}:${b.recruitId}`)),
    recruitingBoards: [...world.recruitingBoards].sort((a, b) => `${a.programTeamId}:${a.recruitId}`.localeCompare(`${b.programTeamId}:${b.recruitId}`)),
    recruitingCapacity: Object.entries(world.recruitingCapacityByProgramId).sort(([a], [b]) => a.localeCompare(b)).map(([teamId, capacity]) => ({ teamId, capacity })),
    offers: sortById(Object.values(world.recruitingOffersById)),
    recruitingVisits: sortById(Object.values(world.recruitingVisitsById)),
    commitments: sortById(Object.values(world.recruitingCommitmentsById)),
    signings: sortById(Object.values(world.recruitSigningsById)),
    recruitingHistory: sortById(Object.values(world.recruitingActionHistoryById)),
    trainingSessions: sortById(Object.values(world.trainingSessionsById)),
    scheduledTraining: sortById(Object.values(world.scheduledTrainingSessionsById)),
    trainingPlans: Object.entries(world.trainingPlansByTeamId).sort(([a], [b]) => a.localeCompare(b)).map(([teamId, plan]) => ({ teamId, plan })),
    trainingResponsibilities: Object.entries(world.trainingResponsibilitiesByTeamId).sort(([a], [b]) => a.localeCompare(b)).map(([teamId, responsibilities]) => ({ teamId, responsibilities })),
    developmentHistory: sortById(Object.values(world.developmentStimulusEventsById)),
    playerRatingHistory: Object.entries(world.playerRatingHistoryByPlayerId).sort(([left], [right]) => left.localeCompare(right)).map(([playerId, history]) => ({ playerId, history })),
    transitions: sortById(Object.values(world.ecosystemTransitionsById)),
  }
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}
