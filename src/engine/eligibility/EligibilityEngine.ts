import { compareGameDates, createGameDate, type GameDate } from '@/domain/date'
import type { CompetitionId, EcosystemId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import { createCollegeRuleset, createPlayerEnrollment, defaultEligibilityRules, type CollegeEligibilityAssessment, type CollegeEligibilityReason, type CollegeRuleset, type EligibilityProfile, type EligibilityResult, type PlayerEnrollment } from '@/domain/eligibility'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { isPlayerAvailable } from '@/domain/world'
import { initializeAcademicProfile } from '@/engine/academic'

export function collegeFixtureRulesets(ecosystemId: EcosystemId, eligibilityRules = defaultEligibilityRules(ecosystemId)): readonly CollegeRuleset[] {
  return [
    createCollegeRuleset({ id: `college-fixture:${ecosystemId}:v1`, version: 'V1', ecosystemId, effectiveFrom: createGameDate(1, 1, 1), effectiveTo: createGameDate(2035, 6, 30), minimumAcademicPerformance: 60, minimumAcademicProgress: 55, maximumEligibilitySeasons: eligibilityRules.maximumEligibilitySeasons, participationThreshold: eligibilityRules.participationThreshold, provenance: 'TEST / PRODUCT FIXTURE' }),
    createCollegeRuleset({ id: `college-fixture:${ecosystemId}:v2`, version: 'V2', ecosystemId, effectiveFrom: createGameDate(2035, 7, 1), minimumAcademicPerformance: 75, minimumAcademicProgress: 65, maximumEligibilitySeasons: eligibilityRules.maximumEligibilitySeasons, participationThreshold: eligibilityRules.participationThreshold, provenance: 'TEST / PRODUCT FIXTURE' }),
  ]
}

export function resolveCollegeRuleset(world: GameWorld, ecosystemId: EcosystemId, date: GameDate): CollegeRuleset | undefined {
  const matches = Object.values(world.collegeRulesetsById).filter((item) => item.ecosystemId === ecosystemId && compareGameDates(item.effectiveFrom, date) <= 0 && (item.effectiveTo === undefined || compareGameDates(date, item.effectiveTo) <= 0))
  return matches.length === 1 ? matches[0] : undefined
}

export function assessCollegeEligibility(world: GameWorld, input: { readonly playerId: PlayerId; readonly teamId: TeamId; readonly ecosystemId: EcosystemId; readonly onDate?: GameDate }): CollegeEligibilityAssessment | undefined {
  const date = input.onDate ?? world.currentDate
  const ruleset = resolveCollegeRuleset(world, input.ecosystemId, date)
  if (!ruleset) return undefined
  const enrollment = Object.values(world.playerEnrollmentsById).find((item) => item.playerId === input.playerId && item.teamId === input.teamId && item.ecosystemId === input.ecosystemId && item.status === 'active' && compareGameDates(item.startsOn, date) <= 0)
  const academic = Object.values(world.academicProfilesById).find((item) => item.playerId === input.playerId && item.programTeamId === input.teamId && item.ecosystemId === input.ecosystemId)
  const profile = Object.values(world.eligibilityProfilesById).find((item) => item.playerId === input.playerId && item.ecosystemId === input.ecosystemId && item.programTeamId === input.teamId)
  const seasonsUsed = profile?.seasonsUsed ?? 0
  const registrationIds = Object.values(world.playerRegistrationsById).filter((item) => item.playerId === input.playerId).sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.id.localeCompare(b.id)).map((item) => item.id)
  const restrictionIds = Object.values(world.eligibilityRestrictionsById).filter((item) => item.playerId === input.playerId && item.ecosystemId === input.ecosystemId && compareGameDates(item.startsAt, date) <= 0 && (item.endsAt === undefined || compareGameDates(date, item.endsAt) <= 0)).map((item) => item.id).sort()
  const activeRestriction = restrictionIds.length > 0
  const reasons: CollegeEligibilityReason[] = []
  if (!enrollment) reasons.push('NOT_ENROLLED')
  if (!academic || academic.performance < ruleset.minimumAcademicPerformance || academic.progress < ruleset.minimumAcademicProgress) reasons.push('ACADEMIC_REQUIREMENT_NOT_MET')
  if (seasonsUsed >= ruleset.maximumEligibilitySeasons) reasons.push('PARTICIPATION_LIMIT_REACHED')
  if (activeRestriction) reasons.push('ACTIVE_ELIGIBILITY_RESTRICTION')
  if (reasons.length === 0) reasons.push('ELIGIBLE')
  const id = `college-assessment:${date}:${input.ecosystemId}:${input.teamId}:${input.playerId}:${ruleset.version}`
  return Object.freeze({ id, playerId: input.playerId, teamId: input.teamId, ecosystemId: input.ecosystemId, assessedOn: date, eligible: reasons.length === 1 && reasons[0] === 'ELIGIBLE', reasons: Object.freeze(reasons), rulesetId: ruleset.id, rulesetVersion: ruleset.version, rulesetValues: Object.freeze({ minimumAcademicPerformance: ruleset.minimumAcademicPerformance, minimumAcademicProgress: ruleset.minimumAcademicProgress, maximumEligibilitySeasons: ruleset.maximumEligibilitySeasons, participationThreshold: ruleset.participationThreshold }), evidence: Object.freeze({ ...(enrollment ? { enrollmentId: enrollment.id } : {}), ...(academic ? { academicProfileId: academic.id, performance: academic.performance, progress: academic.progress } : {}), seasonsUsed, registrationIds: Object.freeze(registrationIds), restrictionIds: Object.freeze(restrictionIds) }) })
}

export function recordCollegeEligibilityAssessment(world: GameWorld, input: { readonly playerId: PlayerId; readonly teamId: TeamId; readonly ecosystemId: EcosystemId; readonly onDate?: GameDate }): GameWorld {
  const assessment = assessCollegeEligibility(world, input)
  if (!assessment) return world
  const sameFacts = Object.values(world.collegeEligibilityAssessmentsById).find((item) => item.playerId === assessment.playerId && item.teamId === assessment.teamId && item.ecosystemId === assessment.ecosystemId && item.assessedOn === assessment.assessedOn && item.rulesetId === assessment.rulesetId && item.eligible === assessment.eligible && JSON.stringify(item.reasons) === JSON.stringify(assessment.reasons) && JSON.stringify(item.evidence) === JSON.stringify(assessment.evidence))
  if (sameFacts) return world
  const nextId = world.collegeEligibilityAssessmentsById[assessment.id] ? `${assessment.id}:${Object.keys(world.collegeEligibilityAssessmentsById).length + 1}` : assessment.id
  const stored = nextId === assessment.id ? assessment : Object.freeze({ ...assessment, id: nextId })
  return updateGameWorld(world, { collegeEligibilityAssessments: [...Object.values(world.collegeEligibilityAssessmentsById), stored] })
}

export type EnrollmentResult = { readonly ok: true; readonly world: GameWorld; readonly enrollment: PlayerEnrollment } | { readonly ok: false; readonly world: GameWorld; readonly reason: 'PLAYER_NOT_FOUND' | 'TEAM_NOT_FOUND' | 'TEAM_NOT_IN_COLLEGE_ECOSYSTEM' | 'PLAYER_NOT_ON_TEAM_ROSTER' | 'RULESET_UNAVAILABLE' | 'ACTIVE_ENROLLMENT_EXISTS' }

export function enrollPlayer(world: GameWorld, input: { readonly playerId: PlayerId; readonly teamId: TeamId; readonly ecosystemId: EcosystemId; readonly actionId?: string }): EnrollmentResult {
  if (!world.players[input.playerId]) return { ok: false, world, reason: 'PLAYER_NOT_FOUND' }
  const team = world.teams[input.teamId]
  if (!team) return { ok: false, world, reason: 'TEAM_NOT_FOUND' }
  if (world.ecosystems[input.ecosystemId]?.kind !== 'ncaaLike' || !Object.values(world.competitions).some((competition) => competition.ecosystemId === input.ecosystemId && competition.participantTeamIds.includes(team.id))) return { ok: false, world, reason: 'TEAM_NOT_IN_COLLEGE_ECOSYSTEM' }
  if (!team.rosterPlayerIds.includes(input.playerId)) return { ok: false, world, reason: 'PLAYER_NOT_ON_TEAM_ROSTER' }
  if (!resolveCollegeRuleset(world, input.ecosystemId, world.currentDate)) return { ok: false, world, reason: 'RULESET_UNAVAILABLE' }
  const active = Object.values(world.playerEnrollmentsById).find((item) => item.playerId === input.playerId && item.ecosystemId === input.ecosystemId && item.status === 'active')
  if (active) return active.teamId === team.id ? { ok: true, world, enrollment: active } : { ok: false, world, reason: 'ACTIVE_ENROLLMENT_EXISTS' }
  const sourceRegistration = Object.values(world.playerRegistrationsById).filter((item) => item.playerId === input.playerId && item.teamId === team.id && item.endsOn === undefined).sort((a, b) => b.startsOn.localeCompare(a.startsOn) || b.id.localeCompare(a.id))[0]
  const generatedId = `enrollment:${input.ecosystemId}:${team.id}:${input.playerId}:${world.currentDate}`
  const baseId = input.actionId ?? generatedId
  const id = world.playerEnrollmentsById[baseId] ? `${baseId}:${Object.keys(world.playerEnrollmentsById).length + 1}` : baseId
  const enrollment = createPlayerEnrollment({ id, playerId: input.playerId, ecosystemId: input.ecosystemId, teamId: team.id, organizationId: team.organizationId, startsOn: world.currentDate, status: 'active', ...(sourceRegistration ? { sourceRegistrationId: sourceRegistration.id } : {}) })
  const withProfiles = initializeAcademicProfile(initializeEligibility(world, input.playerId, team.id, input.ecosystemId), input.playerId, team.id, input.ecosystemId)
  return { ok: true, world: updateGameWorld(withProfiles, { playerEnrollments: [...Object.values(withProfiles.playerEnrollmentsById), enrollment] }), enrollment }
}

export function endPlayerEnrollment(world: GameWorld, enrollmentId: string, endedOn: GameDate = world.currentDate): GameWorld {
  const enrollment = world.playerEnrollmentsById[enrollmentId]
  if (!enrollment || enrollment.status === 'ended') return world
  return updateGameWorld(world, { playerEnrollments: Object.values(world.playerEnrollmentsById).map((item) => item.id === enrollmentId ? { ...item, status: 'ended' as const, endsOn: endedOn } : item) })
}

export function evaluatePlayerEligibility(world: GameWorld, input: { readonly playerId: PlayerId; readonly teamId: TeamId; readonly competitionId: CompetitionId; readonly seasonId: SeasonId; readonly onDate?: GameDate }): EligibilityResult {
  const competition = world.competitions[input.competitionId]; const season = world.seasons[input.seasonId]; const ecosystem = competition && world.ecosystems[competition.ecosystemId]
  if (!competition || !season || season.competitionId !== competition.id || !world.teams[input.teamId]?.rosterPlayerIds.includes(input.playerId)) return { eligible: false, status: 'ineligible', reasons: ['INVALID_SEASON_CONTEXT'], seasonsRemaining: 0 }
  if (ecosystem?.kind !== 'ncaaLike') return { eligible: true, status: 'eligible', reasons: [], seasonsRemaining: 0 }
  const profile = Object.values(world.eligibilityProfilesById).find((item) => item.playerId === input.playerId && item.ecosystemId === ecosystem.id && item.programTeamId === input.teamId)
  const assessment = assessCollegeEligibility(world, { playerId: input.playerId, teamId: input.teamId, ecosystemId: ecosystem.id, onDate: input.onDate })
  const ruleset = assessment ? world.collegeRulesetsById[assessment.rulesetId] : undefined
  const remaining = Math.max(0, (ruleset?.maximumEligibilitySeasons ?? defaultEligibilityRules(ecosystem.id).maximumEligibilitySeasons) - (profile?.seasonsUsed ?? 0))
  if (!profile || !assessment) return { eligible: false, status: 'ineligible', reasons: ['INVALID_SEASON_CONTEXT'], seasonsRemaining: remaining }
  const reasons: EligibilityResult['reasons'][number][] = []
  if (assessment.reasons.includes('NOT_ENROLLED')) reasons.push('NOT_IN_NCAA_PROGRAM')
  if (assessment.reasons.includes('PARTICIPATION_LIMIT_REACHED') || remaining === 0) reasons.push('ELIGIBILITY_EXHAUSTED')
  if (assessment.reasons.includes('ACTIVE_ELIGIBILITY_RESTRICTION')) reasons.push('ACTIVE_ELIGIBILITY_RESTRICTION')
  if (assessment.reasons.includes('ACADEMIC_REQUIREMENT_NOT_MET')) reasons.push('ACADEMIC_REQUIREMENT_NOT_MET')
  if (reasons.length) return { eligible: false, status: remaining === 0 ? 'exhausted' : 'ineligible', reasons: [...new Set(reasons)], seasonsRemaining: remaining }
  return { eligible: true, status: 'eligible', reasons: [], seasonsRemaining: remaining }
}

export function getEligiblePlayersForCompetition(world: GameWorld, teamId: TeamId, competitionId: CompetitionId, seasonId: SeasonId, onDate: GameDate): readonly PlayerId[] { const team=world.teams[teamId]; return team ? team.rosterPlayerIds.filter((playerId) => evaluatePlayerEligibility(world, { playerId, teamId, competitionId, seasonId, onDate }).eligible) : [] }
export function getAvailablePlayersForCompetition(world: GameWorld, teamId: TeamId, competitionId: CompetitionId, seasonId: SeasonId, onDate: GameDate): readonly PlayerId[] { return getEligiblePlayersForCompetition(world, teamId, competitionId, seasonId, onDate).filter((playerId) => isPlayerAvailable(world, playerId, onDate)) }

export function initializeEligibility(world: GameWorld, playerId: PlayerId, teamId: TeamId, ecosystemId: EcosystemId): GameWorld { if (world.ecosystems[ecosystemId]?.kind !== 'ncaaLike' || Object.values(world.eligibilityProfilesById).some((item) => item.playerId === playerId && item.ecosystemId === ecosystemId && item.programTeamId === teamId)) return world; const profile: EligibilityProfile = { id: `eligibility:${ecosystemId}:${teamId}:${playerId}`, playerId, ecosystemId, programTeamId: teamId, seasonsUsed: 0, seasonRecordsBySeasonId: {} }; return updateGameWorld(world, { eligibilityRulesByEcosystemId: { ...world.eligibilityRulesByEcosystemId, [ecosystemId]: world.eligibilityRulesByEcosystemId[ecosystemId] ?? defaultEligibilityRules(ecosystemId) }, eligibilityProfiles: [...Object.values(world.eligibilityProfilesById), profile] }) }

export function ensureNcaaEligibility(world: GameWorld): GameWorld {
  const rulesets = [...Object.values(world.collegeRulesetsById)]
  const profiles = [...Object.values(world.eligibilityProfilesById)]
  const enrollments = [...Object.values(world.playerEnrollmentsById)]
  const rules = { ...world.eligibilityRulesByEcosystemId }
  const rulesetEcosystems = new Set(rulesets.map((item) => item.ecosystemId))
  const profileKeys = new Set(profiles.map((item) => `${item.ecosystemId}:${item.programTeamId}:${item.playerId}`))
  const enrolledPlayers = new Set(enrollments.filter((item) => item.status === 'active').map((item) => `${item.ecosystemId}:${item.playerId}`))
  for (const competition of Object.values(world.competitions)) {
    const ecosystemId = competition.ecosystemId
    if (world.ecosystems[ecosystemId]?.kind !== 'ncaaLike') continue
    rules[ecosystemId] ??= defaultEligibilityRules(ecosystemId)
    if (!rulesetEcosystems.has(ecosystemId)) rulesets.push(...collegeFixtureRulesets(ecosystemId, rules[ecosystemId]))
    rulesetEcosystems.add(ecosystemId)
    for (const teamId of competition.participantTeamIds) for (const playerId of world.teams[teamId]!.rosterPlayerIds) {
      const profileKey = `${ecosystemId}:${teamId}:${playerId}`
      if (!profileKeys.has(profileKey)) {
        profiles.push({ id: `eligibility:${ecosystemId}:${teamId}:${playerId}`, playerId, ecosystemId, programTeamId: teamId, seasonsUsed: 0, seasonRecordsBySeasonId: {} })
        profileKeys.add(profileKey)
      }
      const enrollmentKey = `${ecosystemId}:${playerId}`
      if (!enrolledPlayers.has(enrollmentKey)) {
        const team = world.teams[teamId]!
        const registration = Object.values(world.playerRegistrationsById).find((item) => item.playerId === playerId && item.teamId === teamId && item.endsOn === undefined)
        enrollments.push(createPlayerEnrollment({ id: `enrollment:${ecosystemId}:${teamId}:${playerId}:${world.currentDate}`, playerId, ecosystemId, teamId, organizationId: team.organizationId, startsOn: world.currentDate, status: 'active', ...(registration ? { sourceRegistrationId: registration.id } : {}) }))
        enrolledPlayers.add(enrollmentKey)
      }
    }
  }
  if (rulesets.length === Object.keys(world.collegeRulesetsById).length && profiles.length === Object.keys(world.eligibilityProfilesById).length && enrollments.length === Object.keys(world.playerEnrollmentsById).length && Object.keys(rules).length === Object.keys(world.eligibilityRulesByEcosystemId).length) return world
  return updateGameWorld(world, { collegeRulesets: rulesets, eligibilityProfiles: profiles, playerEnrollments: enrollments, eligibilityRulesByEcosystemId: rules })
}

export function recordEligibilityParticipation(world: GameWorld, gameId: keyof GameWorld['games']): GameWorld { const game=world.games[gameId]; const log=world.matchStatLogsByGameId[gameId]; if(!game||!log||world.ecosystems[world.competitions[game.competitionId]!.ecosystemId]?.kind!=='ncaaLike') return world; const profiles=Object.values(world.eligibilityProfilesById).map(profile=>{const appearances=log.playerLines.filter(line=>line.playerId===profile.playerId&&line.stats.secondsPlayed>0); if(appearances.length===0||profile.seasonRecordsBySeasonId[game.seasonId]?.gameIds.includes(gameId))return profile;const old=profile.seasonRecordsBySeasonId[game.seasonId]??{seasonId:game.seasonId,gamesParticipated:0,gameIds:[],eligibilityConsumed:false,resolved:false};return {...profile,seasonRecordsBySeasonId:{...profile.seasonRecordsBySeasonId,[game.seasonId]:{...old,gamesParticipated:old.gamesParticipated+1,gameIds:[...old.gameIds,gameId]}}}});return updateGameWorld(world,{eligibilityProfiles:profiles}) }
export function resolveEligibilitySeason(world: GameWorld, seasonId: SeasonId): GameWorld { const season=world.seasons[seasonId]; if(!season||world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]?.kind!=='ncaaLike')return world;const ecosystemId=world.competitions[season.competitionId]!.ecosystemId, ruleset=resolveCollegeRuleset(world,ecosystemId,season.endDate),rules=world.eligibilityRulesByEcosystemId[ecosystemId]??defaultEligibilityRules(ecosystemId),threshold=ruleset?.participationThreshold??rules.participationThreshold;const profiles=Object.values(world.eligibilityProfilesById).map(profile=>{const record=profile.seasonRecordsBySeasonId[seasonId]??{seasonId,gamesParticipated:0,gameIds:[],eligibilityConsumed:false,resolved:false};if(record.resolved)return profile;const consumed=record.gamesParticipated>threshold;return {...profile,seasonsUsed:profile.seasonsUsed+(consumed?1:0),seasonRecordsBySeasonId:{...profile.seasonRecordsBySeasonId,[seasonId]:{...record,eligibilityConsumed:consumed,resolved:true}}}});return updateGameWorld(world,{eligibilityProfiles:profiles}) }
