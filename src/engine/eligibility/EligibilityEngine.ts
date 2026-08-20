import { compareGameDates, type GameDate } from '@/domain/date'
import type { CompetitionId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import { defaultEligibilityRules, type EligibilityProfile, type EligibilityResult } from '@/domain/eligibility'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { isPlayerAvailable } from '@/domain/world'

export function evaluatePlayerEligibility(world: GameWorld, input: { readonly playerId: PlayerId; readonly teamId: TeamId; readonly competitionId: CompetitionId; readonly seasonId: SeasonId; readonly onDate?: GameDate }): EligibilityResult {
  const competition = world.competitions[input.competitionId]; const season = world.seasons[input.seasonId]; const ecosystem = competition && world.ecosystems[competition.ecosystemId]
  if (!competition || !season || season.competitionId !== competition.id || !world.teams[input.teamId]?.rosterPlayerIds.includes(input.playerId)) return { eligible: false, status: 'ineligible', reasons: ['INVALID_SEASON_CONTEXT'], seasonsRemaining: 0 }
  if (ecosystem?.kind !== 'ncaaLike') return { eligible: true, status: 'eligible', reasons: [], seasonsRemaining: 0 }
  const profile = Object.values(world.eligibilityProfilesById).find((item) => item.playerId === input.playerId && item.ecosystemId === ecosystem.id && item.programTeamId === input.teamId)
  if (!profile) return { eligible: false, status: 'ineligible', reasons: ['INVALID_SEASON_CONTEXT'], seasonsRemaining: 0 }
  const rules = world.eligibilityRulesByEcosystemId[ecosystem.id] ?? defaultEligibilityRules(ecosystem.id); const remaining = Math.max(0, rules.maximumEligibilitySeasons - profile.seasonsUsed)
  if (remaining === 0) return { eligible: false, status: 'exhausted', reasons: ['ELIGIBILITY_EXHAUSTED'], seasonsRemaining: 0 }
  const date = input.onDate ?? world.currentDate; const restricted = Object.values(world.eligibilityRestrictionsById).some((item) => item.playerId === input.playerId && item.ecosystemId === ecosystem.id && compareGameDates(item.startsAt, date) <= 0 && (item.endsAt === undefined || compareGameDates(date, item.endsAt) <= 0))
  return restricted ? { eligible: false, status: 'ineligible', reasons: ['ACTIVE_ELIGIBILITY_RESTRICTION'], seasonsRemaining: remaining } : { eligible: true, status: 'eligible', reasons: [], seasonsRemaining: remaining }
}

export function getEligiblePlayersForCompetition(world: GameWorld, teamId: TeamId, competitionId: CompetitionId, seasonId: SeasonId, onDate: GameDate): readonly PlayerId[] { return world.teams[teamId]!.rosterPlayerIds.filter((playerId) => evaluatePlayerEligibility(world, { playerId, teamId, competitionId, seasonId, onDate }).eligible) }
/** Shared application boundary: eligibility first, then ordinary player availability. */
export function getAvailablePlayersForCompetition(world: GameWorld, teamId: TeamId, competitionId: CompetitionId, seasonId: SeasonId, onDate: GameDate): readonly PlayerId[] { return getEligiblePlayersForCompetition(world, teamId, competitionId, seasonId, onDate).filter((playerId) => isPlayerAvailable(world, playerId, onDate)) }
export function initializeEligibility(world: GameWorld, playerId: PlayerId, teamId: TeamId, ecosystemId: keyof GameWorld['ecosystems']): GameWorld { if (world.ecosystems[ecosystemId]?.kind !== 'ncaaLike' || Object.values(world.eligibilityProfilesById).some((item) => item.playerId === playerId && item.ecosystemId === ecosystemId && item.programTeamId === teamId)) return world; const profile: EligibilityProfile = { id: `eligibility:${ecosystemId}:${teamId}:${playerId}`, playerId, ecosystemId, programTeamId: teamId, seasonsUsed: 0, seasonRecordsBySeasonId: {} }; return updateGameWorld(world, { eligibilityRulesByEcosystemId: { ...world.eligibilityRulesByEcosystemId, [ecosystemId]: world.eligibilityRulesByEcosystemId[ecosystemId] ?? defaultEligibilityRules(ecosystemId) }, eligibilityProfiles: [...Object.values(world.eligibilityProfilesById), profile] }) }
export function ensureNcaaEligibility(world: GameWorld): GameWorld {
  const existing = new Set(Object.values(world.eligibilityProfilesById).map((profile) => `${profile.ecosystemId}:${profile.programTeamId}:${profile.playerId}`))
  const profiles: EligibilityProfile[] = []
  const rules = { ...world.eligibilityRulesByEcosystemId }
  for (const competition of Object.values(world.competitions)) {
    const ecosystemId = competition.ecosystemId
    if (world.ecosystems[ecosystemId]?.kind !== 'ncaaLike') continue
    rules[ecosystemId] ??= defaultEligibilityRules(ecosystemId)
    for (const teamId of competition.participantTeamIds) for (const playerId of world.teams[teamId]!.rosterPlayerIds) {
      const key = `${ecosystemId}:${teamId}:${playerId}`
      if (!existing.has(key)) profiles.push({ id: `eligibility:${ecosystemId}:${teamId}:${playerId}`, playerId, ecosystemId, programTeamId: teamId, seasonsUsed: 0, seasonRecordsBySeasonId: {} })
    }
  }
  return profiles.length === 0 && Object.keys(rules).length === Object.keys(world.eligibilityRulesByEcosystemId).length ? world : updateGameWorld(world, { eligibilityRulesByEcosystemId: rules, eligibilityProfiles: [...Object.values(world.eligibilityProfilesById), ...profiles] })
}
export function recordEligibilityParticipation(world: GameWorld, gameId: keyof GameWorld['games']): GameWorld { const game=world.games[gameId]; const log=world.matchStatLogsByGameId[gameId]; if(!game||!log||world.ecosystems[world.competitions[game.competitionId]!.ecosystemId]?.kind!=='ncaaLike') return world; const profiles=Object.values(world.eligibilityProfilesById).map(profile=>{const appearances=log.playerLines.filter(line=>line.playerId===profile.playerId&&line.stats.secondsPlayed>0); if(appearances.length===0||profile.seasonRecordsBySeasonId[game.seasonId]?.gameIds.includes(gameId))return profile;const old=profile.seasonRecordsBySeasonId[game.seasonId]??{seasonId:game.seasonId,gamesParticipated:0,gameIds:[],eligibilityConsumed:false,resolved:false};return {...profile,seasonRecordsBySeasonId:{...profile.seasonRecordsBySeasonId,[game.seasonId]:{...old,gamesParticipated:old.gamesParticipated+1,gameIds:[...old.gameIds,gameId]}}}});return updateGameWorld(world,{eligibilityProfiles:profiles}) }
export function resolveEligibilitySeason(world: GameWorld, seasonId: SeasonId): GameWorld { const season=world.seasons[seasonId]; if(!season||world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]?.kind!=='ncaaLike')return world;const rules=world.eligibilityRulesByEcosystemId[world.competitions[season.competitionId]!.ecosystemId]??defaultEligibilityRules(world.competitions[season.competitionId]!.ecosystemId);const profiles=Object.values(world.eligibilityProfilesById).map(profile=>{const record=profile.seasonRecordsBySeasonId[seasonId]??{seasonId,gamesParticipated:0,gameIds:[],eligibilityConsumed:false,resolved:false};if(record.resolved)return profile;const consumed=record.gamesParticipated>rules.participationThreshold;return {...profile,seasonsUsed:profile.seasonsUsed+(consumed?1:0),seasonRecordsBySeasonId:{...profile.seasonRecordsBySeasonId,[seasonId]:{...record,eligibilityConsumed:consumed,resolved:true}}}});return updateGameWorld(world,{eligibilityProfiles:profiles}) }
