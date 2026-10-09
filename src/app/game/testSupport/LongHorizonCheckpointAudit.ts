import { rankAiRecruitingTargets } from '@/engine/recruiting/RecruitingEngine'
import { assessCollegeEligibility } from '@/engine/eligibility/EligibilityEngine'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { expect } from 'vitest'
import { calculateAge } from '@/domain/player'
import { addYears, parseGameDate, type GameDate } from '@/domain/date'
import { getPlayerContractStatus } from '@/domain/contract'
import { deriveCollegeEligibilityClock, resolveCollegeRuleset } from '@/engine/eligibility'
import { rankNcaaWalkOnCandidates } from '@/engine/recruiting/NcaaWalkOnIntake'
import { evaluateAiDraftProspect } from '@/engine/draft/DraftEngine'
import { getRecruitingPlanningRoster } from '@/engine/recruiting/RecruitingRosterPlanning'
import { nbaDraftRulesForYear } from '@/domain/draft'
import type { PlayerId } from '@/domain/ids'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { validateGameWorld, getWorldValidationReport, type GameWorld } from '@/domain/world'
import { assertLongHorizonIntegrity, runTalentLongHorizonCertification, stableStringify } from './TalentLongHorizonCertification'
import { readLargeSaveV4File, writeLargeSaveV4File } from './LargeSaveV4File'
import { createLongHorizonMutationGuard } from './LongHorizonMutationGuard'
import { collectNcaaContinuity } from './NcaaContinuityCertification'
import { scaleWorldIdentity } from './ScaleSaveCertification'
import { resolveSimulationDetail } from '@/app/worldSim/SimulationResolutionPolicy'

const MIN_PLAYABLE_ROSTER = 5
const CATASTROPHIC_PLAYER_LIMIT = 100_000

export interface Snapshot {
  readonly date: GameDate
  readonly playerIds: ReadonlySet<string>
  readonly ncaaPlayerIds: ReadonlySet<string>
}

export function snapshot(world: GameWorld): Snapshot {
  const ncaaTeams = new Set(Object.values(world.competitions)
    .filter(competition => world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike')
    .flatMap(competition => competition.participantTeamIds))
  return {
    date: world.currentDate,
    playerIds: new Set(Object.keys(world.players)),
    ncaaPlayerIds: new Set([...ncaaTeams].flatMap(teamId => world.teams[teamId]?.rosterPlayerIds ?? [])),
  }
}

export function collectLongevityMetrics(world: GameWorld, previous: Snapshot, current: Snapshot, runtimeMs: number, checkpoint?: { readonly saveBytes?: number; readonly saveMs?: number; readonly loadMs?: number; readonly semanticDigest?: string }, deep = false) {
  const players = Object.values(world.players)
  const active = players.filter(player => player.careerEnd === undefined)
  const rostered = new Set(Object.values(world.teams).flatMap(team => team.rosterPlayerIds))
  const unrostered = active.filter(player => !rostered.has(player.id))
  const ages: Record<string, number> = { '<18': 0, '18-21': 0, '22-25': 0, '26-29': 0, '30-34': 0, '35+': 0 }
  for (const player of active) {
    const age = calculateAge(player.bio.dateOfBirth, world.currentDate)
    const bucket = age < 18 ? '<18' : age <= 21 ? '18-21' : age <= 25 ? '22-25' : age <= 29 ? '26-29' : age <= 34 ? '30-34' : '35+'
    ages[bucket] += 1
  }
  const activeEnrollments = Object.values(world.playerEnrollmentsById).filter(item => item.status === 'active' && item.startsOn <= world.currentDate && (item.endsOn === undefined || item.endsOn >= world.currentDate))
  const activeRights = Object.values(world.playerRightsById).filter(item => item.status === 'active' && (item.expiresAt === undefined || item.expiresAt > world.currentDate))
  const activeContracts = Object.values(world.contractsById).filter(item => getPlayerContractStatus(item, world.currentDate) === 'active')
  const proEcosystems = new Set(Object.values(world.ecosystems).filter(item => item.kind === 'nbaLike' || item.kind === 'fibaLike').map(item => item.id))
  const proTeams = new Set(Object.values(world.competitions).filter(item => proEcosystems.has(item.ecosystemId)).flatMap(item => item.participantTeamIds))
  const proRoster = new Set([...proTeams].flatMap(teamId => world.teams[teamId]?.rosterPlayerIds ?? []))
  const proExperienced = new Set<PlayerId>([
    ...activeContracts.map(item => item.playerId),
    ...Object.values(world.playerTransactionsById).filter(item => item.kind === 'released' || item.kind === 'contractExpired' || item.kind === 'signedFreeAgent').map(item => item.playerId),
    ...Object.values(world.ecosystemTransitionsById).filter(item => proEcosystems.has(item.toEcosystemId)).map(item => item.playerId),
  ])
  const unrosteredClassifications = deep ? classifyUnrostered(world, unrostered) : undefined
  const careerEnds = players.filter(player => player.careerEnd !== undefined && player.careerEnd.endedOn > previous.date && player.careerEnd.endedOn <= world.currentDate).length
  const inPeriod = (date: string) => date > previous.date && date <= world.currentDate
  const newPlayers = [...current.playerIds].filter(id => !previous.playerIds.has(id)).length
  const ncaaRosterEntrantsAtCheckpoint = [...current.ncaaPlayerIds].filter(id => !previous.ncaaPlayerIds.has(id)).length
  const ncaaRosterExitsAtCheckpoint = [...previous.ncaaPlayerIds].filter(id => !current.ncaaPlayerIds.has(id)).length
  const admittedEnrollments = new Set(Object.values(world.collegeEligibilityAssessmentsById).filter(item => item.eligible && item.evidence.enrollmentId !== undefined).map(item => item.evidence.enrollmentId!))
  const collegeEnrollments = Object.values(world.playerEnrollmentsById).filter(item => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
  const ncaaEnrollmentStarts = collegeEnrollments.filter(item => inPeriod(item.startsOn)).length
  const ncaaArrivals = collegeEnrollments.filter(item => inPeriod(item.startsOn) && admittedEnrollments.has(item.id)).length
  const ncaaRejectedAdmissionAttempts = collegeEnrollments.filter(item => inPeriod(item.startsOn) && item.status === 'ended' && item.endsOn === item.startsOn && !admittedEnrollments.has(item.id)).length
  const ncaaExits = collegeEnrollments.filter(item => item.status === 'ended' && item.endsOn !== undefined && inPeriod(item.endsOn) && (admittedEnrollments.has(item.id) || item.startsOn <= previous.date && previous.ncaaPlayerIds.has(item.playerId))).length
  const ncaaProExits = Object.values(world.ecosystemTransitionsById).filter(item => world.ecosystems[item.fromEcosystemId]?.kind === 'ncaaLike' && proEcosystems.has(item.toEcosystemId) && inPeriod(item.effectiveDate)).length
  const portalTransfers = Object.values(world.transferPortalEntriesById).filter(item => item.status === 'completed' && item.movement !== undefined && inPeriod(item.movement.transferredOn)).length
  const proEntries = Object.values(world.ecosystemTransitionsById).filter(item => proEcosystems.has(item.toEcosystemId) && inPeriod(item.effectiveDate)).length
  const releases = Object.values(world.playerTransactionsById).filter(item => item.kind === 'released' && inPeriod(item.occurredOn)).length
  const ncaa = collectNcaaContinuity(world)
  const ncaaEligible = ncaa.eligible
  assertNcaaMinimum(world, ncaa)
  const report = {
    date: world.currentDate,
    population: { persons: Object.keys(world.personsById).length, players: players.length, active: active.length, rostered: rostered.size, activeUnrostered: unrostered.length, retired: players.length - active.length, careerEnded: players.length - active.length, materialized: Object.keys(world.talentMaterializationsByCandidateKey).length },
    agesActive: ages,
    agesNcaa: ageSummary(world, [...current.ncaaPlayerIds]),
    agesPro: ageSummary(world, [...proRoster]),
    agesUnrostered: ageSummary(world, unrostered.map(player => player.id)),
    flowsSincePreviousCheckpoint: { from: previous.date, newPlayers, ncaaArrivals, portalTransfers, ncaaExits, ncaaProExits, ncaaEnrollmentStarts, ncaaRejectedAdmissionAttempts, ncaaRosterEntrantsAtCheckpoint, ncaaRosterExitsAtCheckpoint, proEntries, releases, retirementsOrCareerEnds: careerEnds, walkOnAdmissions: Object.values(world.playerTransactionsById).filter(item=>item.kind === 'ncaaWalkOn' && inPeriod(item.occurredOn)).length },
    ncaa: { enrolled: ncaa.enrolled, eligible: ncaaEligible, minimumEligibleTeam: Math.min(...ncaa.teams.map(team => team.eligible)), teamsBelowMinimum: ncaa.teams.filter(team => team.deficit > 0).length, lowestEligibleTeams: [...ncaa.teams].sort((a, b) => a.eligible - b.eligible).slice(0, 5).map(team => ({ teamId: team.teamId, rostered: team.rostered, enrolled: team.enrolled, eligible: team.eligible })) },
    pro: { rostered: proRoster.size, contracted: new Set(activeContracts.map(item => item.playerId)).size, freeOrUnrostered: [...proExperienced].filter(id => world.players[id]?.careerEnd === undefined && !rostered.has(id) && !activeContracts.some(contract => contract.playerId === id)).length, rightsHeld: new Set(activeRights.map(item => item.playerId)).size },
    unrosteredClassification: { count: unrostered.length, percentOfActive: active.length === 0 ? 0 : unrostered.length * 100 / active.length, groups: unrosteredClassifications },
    storageAndPerformance: { annualRuntimeMs: runtimeMs, saveEstimatedBytes: checkpoint?.saveBytes, saveSerializeMs: checkpoint?.saveMs, saveReloadMs: checkpoint?.loadMs, rssBytes: process.memoryUsage().rss, heapAfterGc: memoryAfterGc() },
    collections: { contracts: Object.keys(world.contractsById).length, portalEntries: Object.keys(world.transferPortalEntriesById).length, drafts: Object.keys(world.draftsById).length, draftRights: Object.keys(world.playerRightsById).length, scheduledTrainingRecords: Object.keys(world.scheduledTrainingSessionsById).length, trainingSessionsById: Object.keys(world.trainingSessionsById).length },
  }
  return report
}

export function classifyUnrostered(world: GameWorld, players: readonly GameWorld['players'][keyof GameWorld['players']][]) {
  const rules = Object.values(world.ecosystems).filter(item => item.kind === 'ncaaLike').map(item => resolveCollegeRuleset(world, item.id, world.currentDate)).filter(item => item !== undefined)
  const counts: Record<string, number> = { recruitableProspect: 0, ncaaTransition: 0, portal: 0, draftOrRights: 0, professionalPendingArrival: 0, genuineFreeAgent: 0, recentlyReleased: 0, internationalPathway: 0, legitimateInactivePathway: 0, staleOrDead: 0, unknown: 0 }
  for (const player of players) {
    const profiles = Object.values(world.recruitProfilesById).filter(item => item.playerId === player.id)
    const activeEnrollment = Object.values(world.playerEnrollmentsById).some(item => item.playerId === player.id && item.status === 'active' && item.startsOn <= world.currentDate && (item.endsOn === undefined || item.endsOn >= world.currentDate))
    const futureEnrollment = Object.values(world.playerEnrollmentsById).some(item => item.playerId === player.id && item.status === 'active' && item.startsOn > world.currentDate)
    const pendingSigning = Object.values(world.recruitSigningsById).some(item => item.playerId === player.id && (world.seasons[item.targetSeasonId]?.startDate ?? item.signedOn) > world.currentDate)
    const portal = Object.values(world.transferPortalEntriesById).some(item => item.playerId === player.id && (item.status === 'noticePending' || item.status === 'authorized'))
    const rights = Object.values(world.playerRightsById).some(item => item.playerId === player.id && item.status === 'active' && (item.expiresAt === undefined || item.expiresAt > world.currentDate))
    const draft = Object.values(world.draftsById).some(item => item.entries?.some(entry => entry.playerId === player.id && ['considering', 'declaredEarlyEntry', 'finalPool'].includes(entry.status)))
    const activeOrScheduledContract = Object.values(world.contractsById).some(item => item.playerId === player.id && ['active', 'scheduled'].includes(getPlayerContractStatus(item, world.currentDate)))
    const lastRelease = Object.values(world.playerTransactionsById).filter(item => item.playerId === player.id && item.kind === 'released').sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))[0]
    const lastPathway = player.pathwayHistory?.at(-1)
    const historicalPro = Object.values(world.playerTransactionsById).some(item => item.playerId === player.id && ['released', 'contractExpired', 'signedFreeAgent'].includes(item.kind))
    const withinCollegeClock = rules.some(rule => {
      const clock = deriveCollegeEligibilityClock(world, player.id, rule)
      return clock === undefined || world.currentDate < addYears(clock.startsOn, rule.eligibilityClock!.periodYears)
    })
    const category = calculateAge(player.bio.dateOfBirth, world.currentDate) > 46 ? 'staleOrDead'
      : pendingSigning || futureEnrollment || profiles.some(item => item.status === 'incoming' || item.status === 'signed') || activeEnrollment
      ? 'ncaaTransition'
      : portal ? 'portal'
      : rights || draft ? 'draftOrRights'
      : activeOrScheduledContract ? 'professionalPendingArrival'
      : withinCollegeClock && profiles.some(item => item.status === 'open' || item.status === 'committed') ? 'recruitableProspect'
      : lastRelease !== undefined && daysSince(lastRelease.occurredOn, world.currentDate) <= 365 ? 'recentlyReleased'
      : lastPathway?.source === 'INTERNATIONAL_CLUB' ? 'internationalPathway'
      : historicalPro ? 'genuineFreeAgent'
      : lastPathway !== undefined || profiles.length > 0 ? 'legitimateInactivePathway'
      : 'unknown'
    counts[category] += 1
  }
  if (counts.staleOrDead) throw new Error(`Career lifecycle left ${counts.staleOrDead} active unrostered Players older than the annual exit boundary at ${world.currentDate}`)
  return counts
}

export function assertAnnualIntegrity(world: GameWorld): void {
  for (const competition of Object.values(world.competitions)) {
    if (world.ecosystems[competition.ecosystemId]?.kind !== 'ncaaLike') continue
    for (const teamId of competition.participantTeamIds) for (const playerId of world.teams[teamId]!.rosterPlayerIds) {
      const assessment = assessCollegeEligibility(world, { playerId, teamId, ecosystemId: competition.ecosystemId })
      expect(assessment?.reasons.filter(reason => reason === 'ELIGIBILITY_CLOCK_EXPIRED' || reason === 'PARTICIPATION_LIMIT_REACHED'), `permanently exhausted NCAA member ${playerId} on ${teamId}`).toEqual([])
    }
  }

  const entries = Object.entries(world.players)
  const playerIds = new Set<string>()
  for (const [key, player] of entries) {
    if (key !== player.id || playerIds.has(player.id)) throw new Error(`Longevity integrity failure at ${world.currentDate}: duplicate or mismatched PlayerId ${player.id}`)
    if (!player.personId || !world.personsById[player.personId]) throw new Error(`Orphan Player/Person identity ${player.id} at ${world.currentDate}`)
    playerIds.add(player.id)
  }
  const rostered = new Set<string>()
  for (const team of Object.values(world.teams)) for (const playerId of team.rosterPlayerIds) {
    if (world.players[playerId]?.careerEnd) throw new Error(`Retired Player ${playerId} remains rostered at ${world.currentDate}`)
    if (world.players[playerId] === undefined) throw new Error(`Longevity integrity failure at ${world.currentDate}: orphan roster Player ${playerId} on ${team.id}`)
    if (rostered.has(playerId)) throw new Error(`Longevity integrity failure at ${world.currentDate}: duplicate roster owner for ${playerId}`)
    rostered.add(playerId)
  }
  const materialized = new Set<string>()
  for (const item of Object.values(world.talentMaterializationsByCandidateKey)) {
    if (world.players[item.playerId] === undefined || materialized.has(item.playerId)) throw new Error(`Longevity integrity failure at ${world.currentDate}: duplicate or orphan materialization ${item.candidateKey}`)
    materialized.add(item.playerId)
  }
  const activeContracts = new Map<string, string>()
  for (const contract of Object.values(world.contractsById)) {
    if (getPlayerContractStatus(contract, world.currentDate) !== 'active') continue
    const prior = activeContracts.get(contract.playerId)
    if (prior !== undefined || !world.teams[contract.teamId]?.rosterPlayerIds.includes(contract.playerId)) throw new Error(`Longevity integrity failure at ${world.currentDate}: impossible active contract ownership for ${contract.playerId}`)
    activeContracts.set(contract.playerId, contract.id)
  }
  if (entries.length > CATASTROPHIC_PLAYER_LIMIT) throw new Error(`Longevity population bound exceeded at ${world.currentDate}: ${entries.length} Players`)
  for (const competition of Object.values(world.competitions)) {
    for (const teamId of competition.participantTeamIds) {
      const rosterSize = world.teams[teamId]?.rosterPlayerIds.length ?? 0
      if (rosterSize < MIN_PLAYABLE_ROSTER) throw new Error(`Longevity roster failure at ${world.currentDate}: ${teamId} has ${rosterSize} rostered Players`)
    }
  }
}

export function assertEffectiveRules(world: GameWorld): void {
  const ncaaEcosystems = Object.values(world.ecosystems).filter(item => item.kind === 'ncaaLike')
  for (const ecosystem of ncaaEcosystems) if (resolveCollegeRuleset(world, ecosystem.id, world.currentDate) === undefined) throw new Error(`No effective NCAA ruleset for ${ecosystem.id} at ${world.currentDate}`)
  const currentYear = Number(world.currentDate.slice(0, 4))
  const draftRules = nbaDraftRulesForYear(currentYear)
  if (draftRules.effectiveFrom === undefined || draftRules.effectiveFrom > currentYear || (draftRules.effectiveThrough !== undefined && draftRules.effectiveThrough < currentYear)) throw new Error(`No effective NBA Draft rules for ${currentYear}`)
}

export function memoryAfterGc() {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  gc?.()
  gc?.()
  const { heapUsed, heapTotal, rss, external, arrayBuffers } = process.memoryUsage()
  return { gcAvailable: gc !== undefined, heapUsedBytes: heapUsed, heapTotalBytes: heapTotal, rssBytes: rss, externalBytes: external, arrayBuffersBytes: arrayBuffers }
}

export function daysSince(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

export function dayDifference(from: string, to: string): number {
  return daysSince(from, to)
}

export function requiredEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new Error(`${name} must be configured before the longevity run`)
  return value
}

export function semanticDigest(world: GameWorld): string {
  const hash = createHash('sha256')
  const payload = serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`).payload
  for (const key of Object.keys(payload).sort()) {
    const value = payload[key as keyof typeof payload]
    hash.update(key)
    if (Array.isArray(value)) {
      // These two collections are person-keyed maps; factory reconstruction groups
      // coaches and Players differently without changing their records.
      const items = key === 'personalities' || key === 'morale' ? [...value].sort((a,b)=>String((a as Record<string,unknown>).coachId ?? (a as Record<string,unknown>).personId).localeCompare(String((b as Record<string,unknown>).coachId ?? (b as Record<string,unknown>).personId))) : value
      for (const item of items) hash.update(stableStringify(item)).update('\n')
    } else hash.update(stableStringify(value)).update('\n')
  }
  return hash.digest('hex')
}

export function ageSummary(world: GameWorld, ids: readonly string[]) {
  const ages = ids.map(id=>calculateAge(world.players[id as keyof GameWorld['players']]!.bio.dateOfBirth, world.currentDate)).sort((a,b)=>a-b)
  const buckets: Record<string, number> = { '<18':0, '18-21':0, '22-25':0, '26-29':0, '30-34':0, '35+':0 }
  for (const age of ages) buckets[age < 18 ? '<18' : age <= 21 ? '18-21' : age <= 25 ? '22-25' : age <= 29 ? '26-29' : age <= 34 ? '30-34' : '35+']!++
  return { count: ages.length, minimum: ages[0], maximum: ages.at(-1), mean: ages.length ? ages.reduce((sum,age)=>sum+age,0)/ages.length : undefined, buckets }
}

export function assertNcaaMinimum(world: GameWorld, ncaa: ReturnType<typeof collectNcaaContinuity>) {
  const deficits = ncaa.teams.filter(team => team.eligible < MIN_PLAYABLE_ROSTER)
  if (deficits.length) throw new Error(`NCAA eligible deficit at ${world.currentDate}: ${JSON.stringify(deficits.map(team => ({ teamId: team.teamId, eligible: team.eligible, reasons: team.reasons })))}`)
}

export function rollingFiveYearFlows(outputDir: string, current: ReturnType<typeof collectLongevityMetrics>) {
  const year = Number(current.date.slice(0, 4)) - 2032
  const annual = [current.flowsSincePreviousCheckpoint]
  for (let prior = year - 4; prior < year; prior += 1) {
    const path = `${outputDir}/BS15I-long-y${prior}-metrics.json`
    if (!existsSync(path)) continue
    const report = JSON.parse(readFileSync(path, 'utf8')) as { checkpoints: ReturnType<typeof collectLongevityMetrics>[] }
    const row = report.checkpoints.at(-1)
    if (row?.date === `${2032 + prior}-10-01`) annual.push(row.flowsSincePreviousCheckpoint)
  }
  const totals = { newPlayers: 0, ncaaArrivals: 0, portalTransfers: 0, ncaaExits: 0, ncaaProExits: 0, proEntries: 0, releases: 0, retirementsOrCareerEnds: 0, walkOnAdmissions: 0 }
  for (const flow of annual) for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += flow[key] ?? 0
  if (year >= 20 && annual.length === 5 && totals.retirementsOrCareerEnds === 0) throw new Error(`No career exits in mature five-year window ending ${current.date}`)
  return { from: `${2032 + year - 5}-10-01`, through: current.date, annualCheckpoints: annual.length, complete: annual.length === 5, ...totals, netActiveEntries: totals.newPlayers - totals.retirementsOrCareerEnds }
}

export function generationalReplacement(world: GameWorld) {
  const rostered = new Set(Object.values(world.teams).flatMap(team => team.rosterPlayerIds))
  const materialized = new Map(Object.values(world.talentMaterializationsByCandidateKey).map(item => [item.playerId, item]))
  const groups: Record<string, { total: number; active: number; careerEnded: number; rostered: number; birthYears: Record<string, number> }> = {}
  for (const player of Object.values(world.players)) {
    const origin = materialized.get(player.id)
    const group = groups[origin ? `generation:${origin.generationYear}` : 'initialPopulation'] ??= { total: 0, active: 0, careerEnded: 0, rostered: 0, birthYears: {} }
    group.total += 1
    group[player.careerEnd ? 'careerEnded' : 'active'] += 1
    if (rostered.has(player.id)) group.rostered += 1
    const birthYear = player.bio.dateOfBirth.slice(0, 4)
    group.birthYears[birthYear] = (group.birthYears[birthYear] ?? 0) + 1
  }
  return groups
}

export function cohortJourneyExamples(world: GameWorld) {
  const materializations = Object.values(world.talentMaterializationsByCandidateKey)
  const generations = [...new Set(materializations.map(item => item.generationYear))].sort((a,b) => a-b)
  const selected = [generations[0], generations[Math.floor(generations.length / 2)], generations.at(-1)]
  return selected.map((year, index) => {
    const candidates = materializations.filter(item => item.generationYear === year)
    const transactions = Object.values(world.playerTransactionsById)
    const enrollments = Object.values(world.playerEnrollmentsById)
    const movementCount = (id: PlayerId) => transactions.filter(item => item.playerId === id).length + enrollments.filter(item => item.playerId === id).length
    const origin = [...candidates].sort((a,b) => movementCount(b.playerId)-movementCount(a.playerId) || a.playerId.localeCompare(b.playerId))[0]
    if (!origin) return { period: ['early', 'middle', 'late'][index], generationYear: year }
    const player = world.players[origin.playerId]!
    return { period: ['early', 'middle', 'late'][index], selection: 'most canonical acquisition/enrollment events within selected generation; PlayerId tie-break', origin, playerId: player.id, personId: player.personId, dateOfBirth: player.bio.dateOfBirth, age: calculateAge(player.bio.dateOfBirth, world.currentDate), careerEnd: player.careerEnd, currentRoster: Object.values(world.teams).find(team => team.rosterPlayerIds.includes(player.id))?.id, precollegeHistory: player.pathwayHistory, enrollments: enrollments.filter(item => item.playerId === player.id), transactions: transactions.filter(item => item.playerId === player.id), ecosystemTransitions: Object.values(world.ecosystemTransitionsById).filter(item => item.playerId === player.id), portal: Object.values(world.transferPortalEntriesById).filter(item => item.playerId === player.id), draftEntries: Object.values(world.draftsById).flatMap(item => (item.entries ?? []).filter(entry => entry.playerId === player.id)), professionalContracts: Object.values(world.contractsById).filter(item => item.playerId === player.id) }
  })
}

export function assertKnowledgeRankingFairness(world: GameWorld) {
  // Counterfactual audit only: no canonical world or saved truth is changed.
  const counterfactual: GameWorld = { ...world, players: Object.fromEntries(Object.values(world.players).map(player => [player.id, { ...player, basketball: { ...player.basketball, ratings: { ...player.basketball.ratings, ...Object.fromEntries(Object.entries(player.basketball.ratings).map(([key, value]) => [key, 101 - value])) } } }])) }
  const college = Object.values(world.competitions).find(item => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')!
  const collegeTeam = college.participantTeamIds.find(id => world.teams[id]?.coachId !== world.userCoachId)!
  const before = rankNcaaWalkOnCandidates(world, collegeTeam)
  const recruitingCycles = Object.values(world.recruitingCyclesById).filter(item => item.ecosystemId === college.ecosystemId && item.closesOn >= world.currentDate)
  for (const cycle of recruitingCycles) expect(rankAiRecruitingTargets(counterfactual, cycle.id, collegeTeam)).toEqual(rankAiRecruitingTargets(world, cycle.id, collegeTeam))
  expect(rankNcaaWalkOnCandidates(counterfactual, collegeTeam)).toEqual(before)
  const pro = Object.values(world.competitions).find(item => world.ecosystems[item.ecosystemId]?.kind === 'nbaLike')!
  const proTeam = pro.participantTeamIds.find(id => world.teams[id]?.coachId !== world.userCoachId)!
  const prospects = Object.values(world.players).filter(player => !player.careerEnd && player.gender === world.teams[proTeam]!.gender).map(player => player.id)
  const draftPriorities = (candidate: GameWorld) => prospects.map(id => evaluateAiDraftProspect(candidate, proTeam, id).priorityScore)
  expect(draftPriorities(counterfactual)).toEqual(draftPriorities(world))
  return { counterfactual: 'invert every hidden rating; preserve organization knowledge, public position and commitments', ncaaTeam: collegeTeam, availableWalkOnCandidates: before.length, professionalTeam: proTeam, evaluatedDraftPlayers: prospects.length, matchingKnowledgeRankings: true, recruitingCyclesAudited: recruitingCycles.map(item => item.id) }
}

/** Return only scalars so the reload world leaves the stack before retained-heap GC. */
export function verifyPersistedSave(checkpointWorld: GameWorld, path: string, bytes: number, serializeMs: number, deep: boolean, beforeDigest?: string) {
  const reloadStart = performance.now()
  const restored = deserializeGameWorldV4(readLargeSaveV4File(path))
  assertAnnualIntegrity(restored)
  assertEffectiveRules(restored)
  if (deep) assertLongHorizonIntegrity(restored)
  expect(scaleWorldIdentity(restored)).toEqual(scaleWorldIdentity(checkpointWorld))
  expect(restored.currentDate).toBe(checkpointWorld.currentDate)
  expect(Object.keys(restored.players)).toEqual(Object.keys(checkpointWorld.players))
  expect(Object.keys(restored.personsById)).toEqual(Object.keys(checkpointWorld.personsById))
  for (const team of Object.values(checkpointWorld.teams)) expect(restored.teams[team.id]?.rosterPlayerIds).toEqual(team.rosterPlayerIds)
  for (const player of Object.values(checkpointWorld.players)) expect(restored.players[player.id]?.personId).toBe(player.personId)
  expect(restored.talentMaterializationsByCandidateKey).toEqual(checkpointWorld.talentMaterializationsByCandidateKey)
  const semanticRoundTrip = deep && semanticDigest(restored) === beforeDigest
  const reloadMs = performance.now() - reloadStart
  const reloadMemory = memoryAfterGc()
  return { path, bytes, serializeMs, reloadMs, semanticRoundTrip, reloadMemory, contractsBefore: Object.keys(checkpointWorld.contractsById).length, contractsAfter: Object.keys(restored.contractsById).length, staffContractsBefore: Object.keys(checkpointWorld.staffContractsById).length, staffContractsAfter: Object.keys(restored.staffContractsById).length }
}

export function recruitingForecasts(world: GameWorld) {
  return Object.values(world.competitions).filter(item => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike').flatMap(competition => competition.participantTeamIds.map(teamId => {
    const cycle = Object.values(world.recruitingCyclesById).filter(item => item.ecosystemId === competition.ecosystemId && item.closesOn > world.currentDate).sort((a,b) => a.opensOn.localeCompare(b.opensOn))[0]
    const projected = getRecruitingPlanningRoster(world, teamId, cycle?.id)
    const rostered = world.teams[teamId]!.rosterPlayerIds
    return { teamId, cycleId: cycle?.id, rostered: rostered.length, projectedRetained: projected.length, projectedDepartures: rostered.filter(id => !projected.includes(id)), planningMinimumNeed: Math.max(0, 5 - projected.length), planningRotationNeedBeforeIncoming: Math.max(0, 7 - projected.length) }
  }))
}
