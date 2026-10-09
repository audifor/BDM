import type { PlayerId, SeasonId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import { getPlayerSeasonStats, calculatePlayerStatAverages } from '@/engine/stats/PlayerHistory'

export type PromiseFulfillment = 'FULFILLED' | 'MOSTLY_FULFILLED' | 'UNCLEAR' | 'PARTIALLY_BROKEN' | 'BROKEN'
export type ContinuationTone = 'content' | 'unsettled' | 'concerned' | 'seriouslyConsideringPortal'

export interface CollegePromiseAssessment {
  readonly promiseId: string
  readonly topic: string
  readonly strength: string
  readonly fulfillment: PromiseFulfillment
  readonly explanation: string
}

export interface CollegeContinuationAssessment {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly seasonId: SeasonId
  readonly tone: ContinuationTone
  readonly stayPressure: number
  readonly leavePressure: number
  readonly reasons: readonly string[]
  readonly stayReasons: readonly string[]
  readonly leaveReasons: readonly string[]
  readonly majorStayReasons: readonly string[]
  readonly majorLeaveReasons: readonly string[]
  readonly unresolvedConcerns: readonly string[]
  readonly promiseAssessments: readonly CollegePromiseAssessment[]
  readonly experience: { readonly gamesPlayed: number; readonly gamesStarted: number; readonly minutesPerGame: number }
  readonly relationshipTrust: number | null
  readonly promiseTrustPenalty: number
  readonly academicContext?: { readonly performance: number; readonly progress: number }
  readonly activeNilDeals: number
  readonly coachingChange: boolean
  readonly compensationContext: { readonly athleticsAidMinorUnits: number; readonly institutionalBenefitsMinorUnits: number; readonly activeNilDeals: number }
}

/** Derived from recorded season experience and recruiting history; it is context, not a transfer probability. */
export function assessCollegeContinuation(world: GameWorld, playerId: PlayerId, teamId: TeamId, seasonId: SeasonId = world.currentSeasonId): CollegeContinuationAssessment | undefined {
  const team = world.teams[teamId]
  const player = world.players[playerId]
  if (!team || !player || !team.rosterPlayerIds.includes(player.id) || !world.seasons[seasonId]) return undefined
  const stats = getPlayerSeasonStats(world, player.id, seasonId)
  const averages = calculatePlayerStatAverages(stats)
  const profile = Object.values(world.recruitProfilesById).filter((item) => item.playerId === player.id).sort((a, b) => b.id.localeCompare(a.id))[0]
  const rpg = profile?.recruitingRpg
  const promises = (rpg?.promises ?? []).filter((promise) => promise.programTeamId === team.id)
  const promiseAssessments: CollegePromiseAssessment[] = promises.map((promise) => {
    if (!['role', 'playingOpportunity'].includes(promise.topic)) return { promiseId: promise.id, topic: promise.topic, strength: promise.strength, fulfillment: 'UNCLEAR', explanation: 'The current world does not contain an outcome measure for this promise.' }
    if (stats.gamesPlayed < 5 && promise.fulfilled === false) return { promiseId: promise.id, topic: promise.topic, strength: promise.strength, fulfillment: 'BROKEN', explanation: 'A prior canonical promise assessment records this promise as broken; sparse current-season appearances do not erase that outcome.' }
    if (stats.gamesPlayed === 0) return { promiseId: promise.id, topic: promise.topic, strength: promise.strength, fulfillment: 'UNCLEAR', explanation: 'No completed game minutes are recorded for this Player in the assessed season.' }
    const startRate = stats.gamesStarted / stats.gamesPlayed
    const expected = promise.strength === 'explicit' || promise.strength === 'assurance'
    if (averages.mpg >= (expected ? 20 : 12) || startRate >= (expected ? 0.55 : 0.3)) return { promiseId: promise.id, topic: promise.topic, strength: promise.strength, fulfillment: 'FULFILLED', explanation: `${stats.gamesStarted} starts and ${averages.mpg.toFixed(1)} minutes per game support the promised role.` }
    if (averages.mpg >= (expected ? 12 : 7) || startRate >= (expected ? 0.3 : 0.15)) return { promiseId: promise.id, topic: promise.topic, strength: promise.strength, fulfillment: 'MOSTLY_FULFILLED', explanation: 'Recorded starts and minutes show a meaningful role, though below the promise benchmark.' }
    if (stats.gamesPlayed < 5) return { promiseId: promise.id, topic: promise.topic, strength: promise.strength, fulfillment: 'UNCLEAR', explanation: 'Too few appearances are recorded to judge the promised role.' }
    return { promiseId: promise.id, topic: promise.topic, strength: promise.strength, fulfillment: expected ? 'BROKEN' : 'PARTIALLY_BROKEN', explanation: `${averages.mpg.toFixed(1)} minutes per game and ${stats.gamesStarted} starts fall below the promised-role benchmark.` }
  })
  const relationships = rpg?.relationships.filter((item) => item.programTeamId === team.id) ?? []
  const broken = promiseAssessments.filter((item) => item.fulfillment === 'BROKEN' || item.fulfillment === 'PARTIALLY_BROKEN')
  const unappliedBroken = broken.filter((item) => promises.find((promise) => promise.id === item.promiseId)?.fulfilled !== false)
  const promiseTrustPenalty = Math.min(20, unappliedBroken.reduce((sum, item) => sum + (item.strength === 'explicit' ? 10 : item.strength === 'assurance' ? 7 : item.strength === 'expectation' ? 4 : 2), 0))
  const rawTrust = relationships.length === 0 ? null : relationships.reduce((sum, item) => sum + item.trust, 0) / relationships.length
  const relationshipTrust = rawTrust === null ? null : Math.max(0, Math.round(rawTrust - promiseTrustPenalty))
  const headCoachId = team.coachId
  const relationshipLostWithCoach = headCoachId !== undefined && relationships.some((item) => item.actor === 'headCoach' && item.actorId !== undefined && item.actorId !== headCoachId)
  const academic = Object.values(world.academicProfilesById).find((item) => item.playerId === player.id && item.programTeamId === team.id)
  const activeNilDeals = Object.values(world.nilDealsById).filter((deal) => deal.playerId === player.id && deal.status === 'active').length
  const aidAgreement = Object.values(world.athleticsAidAgreementsById).filter((item) => item.playerId === player.id && item.teamId === team.id && ['signed', 'reduced'].includes(item.status) && item.effectiveFrom <= world.currentDate && item.effectiveTo >= world.currentDate).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
  const institutionalBenefitsMinorUnits = Object.values(world.settlementBenefitsAgreementsById).filter((item) => item.playerId === player.id && item.teamId === team.id && item.status === 'signed' && item.effectiveFrom <= world.currentDate && item.effectiveTo >= world.currentDate).reduce((sum, item) => sum + item.valueMinorUnits, 0)
  const currentSeasonGames = Object.values(world.games).filter((game) => game.seasonId === seasonId && game.status === 'completed' && (game.homeTeamId === team.id || game.awayTeamId === team.id))
  const wins = currentSeasonGames.filter((game) => game.result !== null && (game.homeTeamId === team.id ? game.result.homeScore > game.result.awayScore : game.result.awayScore > game.result.homeScore)).length
  let stayPressure = 0
  let leavePressure = 0
  const reasons: string[] = []
  const majorStayReasons: string[] = []
  const majorLeaveReasons: string[] = []
  const stayReasons: string[] = []
  const leaveReasons: string[] = []
  const unresolvedConcerns: string[] = []
  if (stats.gamesPlayed >= 5 && (averages.mpg >= 20 || stats.gamesStarted / stats.gamesPlayed >= 0.55)) { stayPressure += 2; const reason = `A substantial role was recorded: ${stats.gamesStarted} starts and ${averages.mpg.toFixed(1)} minutes per game.`; reasons.push(reason); stayReasons.push(reason); majorStayReasons.push(reason) }
  else if (stats.gamesPlayed >= 5 && averages.mpg < 10 && stats.gamesStarted === 0) { leavePressure += 2; const reason = `A limited role was recorded: ${stats.gamesStarted} starts and ${averages.mpg.toFixed(1)} minutes per game.`; reasons.push(reason); leaveReasons.push(reason); majorLeaveReasons.push(reason) }
  if (broken.length > 0) { leavePressure += broken.reduce((sum, item) => sum + (item.strength === 'explicit' ? 2 : item.strength === 'assurance' ? 1 : 0.5), 0); const reason = `${broken.length} role promise${broken.length === 1 ? ' was' : 's were'} not fulfilled to the stated benchmark; effective trust is reduced by ${promiseTrustPenalty} points.`; reasons.push(reason); leaveReasons.push(reason) }
  if (relationshipTrust !== null) {
    if (relationshipTrust >= 65) { stayPressure += 1; const reason = `Recorded recruiting relationship trust is strong (${relationshipTrust}).`; reasons.push(reason); stayReasons.push(reason) }
    else if (relationshipTrust < 40) { leavePressure += 1; const reason = `Recorded recruiting relationship trust is low (${relationshipTrust}).`; reasons.push(reason); leaveReasons.push(reason) }
  }
  if (relationshipLostWithCoach) { leavePressure += 1; const reason = 'The current Head Coach differs from the Head Coach associated with this Player’s recorded Recruiting relationship.'; reasons.push(reason); leaveReasons.push(reason); majorLeaveReasons.push(reason) }
  if (academic !== undefined && (academic.performance < 60 || academic.progress < 55)) { leavePressure += 0.5; const reason = `Academic context is a concern at ${academic.performance} performance and ${academic.progress} progress.`; reasons.push(reason); leaveReasons.push(reason) }
  if (currentSeasonGames.length > 0 && wins / currentSeasonGames.length >= 0.65) { stayPressure += 1; const reason = `The team won ${wins} of ${currentSeasonGames.length} completed games in the assessed season.`; reasons.push(reason); stayReasons.push(reason) }
  else if (currentSeasonGames.length > 0 && wins / currentSeasonGames.length <= 0.35) { leavePressure += 0.5; const reason = `The team won ${wins} of ${currentSeasonGames.length} completed games in the assessed season.`; reasons.push(reason); leaveReasons.push(reason) }
  if (aidAgreement !== undefined || institutionalBenefitsMinorUnits > 0) {
    const securityWeight = (rpg?.preferenceProfile.compensationSecurityImportance ?? 5) / 10
    const support = Math.min(1.5, securityWeight * (aidAgreement !== undefined ? 0.8 : 0) + securityWeight * Math.min(1, institutionalBenefitsMinorUnits / 250_000))
    stayPressure += support
    const reason = `Current institutional aid and benefits provide ${Math.round(support * 100) / 100} points of compensation security; third-party NIL is separate.`
    reasons.push(reason); stayReasons.push(reason)
  }
  const difference = leavePressure - stayPressure
  const tone: ContinuationTone = difference >= 3 ? 'seriouslyConsideringPortal' : difference >= 1.5 ? 'concerned' : difference >= 0.5 ? 'unsettled' : 'content'
  if (stats.gamesPlayed < 5) unresolvedConcerns.push('Season role is unresolved because fewer than five completed appearances are recorded.')
  if (promises.some((promise) => !['role', 'playingOpportunity'].includes(promise.topic))) unresolvedConcerns.push('Development, coaching, academic support, and pathway promise fulfillment cannot be measured from the available season context.')
  if (reasons.length === 0) reasons.push('There is not enough season or relationship evidence to distinguish a stay decision from transfer interest.')
  return { playerId: player.id, teamId: team.id, seasonId, tone, stayPressure, leavePressure, reasons, stayReasons, leaveReasons, majorStayReasons, majorLeaveReasons, unresolvedConcerns, promiseAssessments, experience: { gamesPlayed: stats.gamesPlayed, gamesStarted: stats.gamesStarted, minutesPerGame: averages.mpg }, relationshipTrust, promiseTrustPenalty, ...(academic === undefined ? {} : { academicContext: { performance: academic.performance, progress: academic.progress } }), activeNilDeals, coachingChange: relationshipLostWithCoach, compensationContext: { athleticsAidMinorUnits: aidAgreement?.valueMinorUnits ?? 0, institutionalBenefitsMinorUnits, activeNilDeals } }
}

/** Persists measured promise outcomes and their bounded trust consequence once in BS15E relationship history. */
export function recordCollegeContinuationAssessment(world: GameWorld, assessment: CollegeContinuationAssessment): GameWorld {
  const profile = Object.values(world.recruitProfilesById).find((item) => item.playerId === assessment.playerId && item.recruitingRpg?.promises.some((promise) => promise.programTeamId === assessment.teamId))
  const rpg = profile?.recruitingRpg
  if (profile === undefined || rpg === undefined) return world
  let trustLoss = 0
  const assessments = new Map(assessment.promiseAssessments.map((item) => [item.promiseId, item]))
  const promises = rpg.promises.map((promise) => {
    if (promise.programTeamId !== assessment.teamId) return promise
    const result = assessments.get(promise.id)
    if (result === undefined || result.fulfillment === 'UNCLEAR' || promise.fulfilled !== undefined) return promise
    if (result.fulfillment === 'MOSTLY_FULFILLED' || result.fulfillment === 'FULFILLED') return { ...promise, fulfilled: true }
    trustLoss += promise.strength === 'explicit' ? 10 : promise.strength === 'assurance' ? 7 : promise.strength === 'expectation' ? 4 : 2
    return { ...promise, fulfilled: false }
  })
  if (trustLoss === 0 && promises.every((promise, index) => promise === rpg.promises[index])) return world
  const boundedLoss = Math.min(20, trustLoss)
  const relationships = rpg.relationships.map((relationship) => relationship.programTeamId === assessment.teamId
    ? { ...relationship, trust: Math.max(0, relationship.trust - boundedLoss), updatedOn: world.currentDate }
    : relationship)
  const story = trustLoss === 0 ? rpg.story : [...rpg.story, `${world.currentDate}: recorded a bounded ${boundedLoss}-point trust consequence for a broken role promise.`].slice(-24)
  return updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.id === profile.id ? { ...item, recruitingRpg: { ...rpg, promises, relationships, story } } : item) })
}
