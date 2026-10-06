/*
 * MX0.5 final closure — club-scoped trade authority.
 *
 * TradeRules resolve from the manager's own club: club -> its competition -> the active
 * CompetitionSeason on the GameDate -> that edition's materialized TradeWindow.
 * `world.currentSeasonId` never decides a user-club trade, so a manager moving between ecosystems
 * (NBA-like, WNBA-like, FIBA/European-like) automatically gains or loses the corresponding Trade
 * authority. Every move goes through the canonical career service (opening -> application ->
 * interview -> offer -> accept), and the world's season pointer is never rewritten by hand.
 */
import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { applyUserCoachForJob, acceptCoachJobOffer } from '@/app/coachCareer'
import { proposeTradeNegotiation } from '@/app/trades'
import { addDays } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import type { Season } from '@/domain/season'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { resolveActiveCompetitionSeasonForTeam, resolveActiveCompetitionSeasonsForTeam } from '@/engine/competition'
import { getUserTeam } from '@/engine/calendar'
import { getTradeWindowStatus, resolveTradeSeasonAuthorityForTeam } from '@/engine/trade'

/** The canonical career path: an open head-coach job is applied for, offered, and accepted. */
function moveUserCoachToTeam(world: GameWorld, teamId: TeamId): GameWorld {
  const opening = Object.values(world.coachJobOpeningsById).find((item) => item.teamId === teamId && item.status === 'open')
  if (opening === undefined) throw new Error(`The world has no open head-coach job for ${teamId}`)
  const applied = applyUserCoachForJob(world, opening.id)
  const offer = Object.values(applied.world.coachJobOffersById).find((item) => item.jobOpeningId === opening.id && item.coachId === applied.world.userCoachId && item.status === 'pending')
  if (offer === undefined) throw new Error(`The application for ${teamId} produced no pending offer`)
  return acceptCoachJobOffer(applied.world, offer.id)
}

/** Trade season of the club that plays in the given ecosystem category. */
function tradeSeasonForCategory(world: GameWorld, category: 'men' | 'women'): Season {
  const season = Object.values(world.seasons).find((item) => {
    const competition = world.competitions[item.competitionId]
    return world.tradeRulesBySeasonId[item.id] !== undefined && competition !== undefined && world.ecosystems[competition.ecosystemId]!.category === category
  })
  if (season === undefined) throw new Error(`The shipped world has no ${category} trade season`)
  return season
}

function vacantClubId(world: GameWorld, season: Season): TeamId {
  const competition = world.competitions[season.competitionId]!
  const clubId = (season.participantTeamIds ?? competition.participantTeamIds).find((teamId) => world.teams[teamId]!.coachId === undefined)
  if (clubId === undefined) throw new Error(`The ${season.id} competition has no vacant club`)
  return clubId
}

describe('club-scoped trade authority', () => {
  it('resolves the active CompetitionSeason from club participation, never from world.currentSeasonId', () => {
    const world = createNewGame()
    const nbaSeason = tradeSeasonForCategory(world, 'men')
    const nbaCompetition = world.competitions[nbaSeason.competitionId]!
    const nbaClubId = nbaCompetition.participantTeamIds[0]!
    const userClub = getUserTeam(world)!
    const inNbaSeason = updateGameWorld(world, { currentDate: nbaSeason.startDate })

    // The NBA club's own edition is resolved even though the world pointer still selects the FIBA competition.
    expect(inNbaSeason.currentSeasonId).not.toBe(nbaSeason.id)
    expect(resolveActiveCompetitionSeasonForTeam(inNbaSeason, nbaClubId, nbaSeason.startDate)?.id).toBe(nbaSeason.id)
    expect(resolveTradeSeasonAuthorityForTeam(inNbaSeason, nbaClubId)!.season.id).toBe(nbaSeason.id)
    expect(resolveTradeSeasonAuthorityForTeam(inNbaSeason, nbaClubId)!.rules).toBe(inNbaSeason.tradeRulesBySeasonId[nbaSeason.id])

    // A FIBA-like club has no trade authority at all, even though world.currentSeasonId names its competition.
    const fibaSeasons = resolveActiveCompetitionSeasonsForTeam(inNbaSeason, userClub.id, world.currentDate)
    expect(fibaSeasons.some((season) => season.id === inNbaSeason.currentSeasonId)).toBe(true)
    expect(resolveTradeSeasonAuthorityForTeam(inNbaSeason, userClub.id)).toBeUndefined()

    // Resolution is deterministic: most recently started active edition first, then by id.
    const sorted = [...fibaSeasons].sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id))
    expect(fibaSeasons.map((season) => season.id)).toEqual(sorted.map((season) => season.id))
  })

  it('gives the user club NBA-like trade authority after a canonical move to an NBA club', () => {
    const world = createNewGame()
    const nbaSeason = tradeSeasonForCategory(world, 'men')
    const nbaEcosystem = world.ecosystems[world.competitions[nbaSeason.competitionId]!.ecosystemId]!
    const nbaClubId = vacantClubId(world, nbaSeason)
    const pointerBeforeMove = world.currentSeasonId

    const moved = moveUserCoachToTeam(world, nbaClubId)
    expect(getUserTeam(moved)!.id).toBe(nbaClubId)
    // The career move never rewrites the global season pointer: authority comes from the club.
    expect(moved.currentSeasonId).toBe(pointerBeforeMove)

    // Before its competition season starts the new club has no active edition and therefore no trade authority.
    expect(resolveTradeSeasonAuthorityForTeam(moved, nbaClubId, world.currentDate)).toBeUndefined()

    const authority = resolveTradeSeasonAuthorityForTeam(moved, nbaClubId, nbaSeason.startDate)!
    expect(authority.season.id).toBe(nbaSeason.id)
    expect(authority.rules).toBe(moved.tradeRulesBySeasonId[nbaSeason.id])
    expect(nbaEcosystem.tradeDeadlinePolicy).toEqual({ kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 0.65 })
    const proposal = { seasonId: authority.season.id, ecosystemId: authority.rules.ecosystemId }
    // The competition's own first regular-season date is where its window opens.
    expect(authority.rules.tradeWindow!.opensOn).toBe(nbaSeason.startDate)
    expect(getTradeWindowStatus(updateGameWorld(moved, { currentDate: nbaSeason.startDate }), proposal)).toBe('OPEN')
    expect(getTradeWindowStatus(updateGameWorld(moved, { currentDate: authority.rules.tradeWindow!.closesOn! }), proposal)).toBe('OPEN')
    expect(getTradeWindowStatus(updateGameWorld(moved, { currentDate: addDays(authority.rules.tradeWindow!.closesOn!, 1) }), proposal)).toBe('CLOSED')
  })

  it('gives the user club WNBA-like trade authority after a canonical move to a WNBA club', () => {
    const world = createNewGame()
    const menSeason = tradeSeasonForCategory(world, 'men')
    const womenSeason = tradeSeasonForCategory(world, 'women')
    const womenEcosystem = world.ecosystems[world.competitions[womenSeason.competitionId]!.ecosystemId]!
    const womenClubId = vacantClubId(world, womenSeason)
    const pointerBeforeMove = world.currentSeasonId

    const moved = moveUserCoachToTeam(world, womenClubId)
    expect(getUserTeam(moved)!.id).toBe(womenClubId)
    expect(moved.currentSeasonId).toBe(pointerBeforeMove)

    const authority = resolveTradeSeasonAuthorityForTeam(moved, womenClubId, womenSeason.startDate)!
    expect(authority.season.id).toBe(womenSeason.id)
    expect(authority.rules).toBe(moved.tradeRulesBySeasonId[womenSeason.id])
    expect(womenEcosystem.category).toBe('women')
    expect(womenEcosystem.tradeDeadlinePolicy).toEqual({ kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 0.65 })
    // Never the NBA-like rules merely because both use the Trade negotiation machinery.
    expect(authority.season.id).not.toBe(menSeason.id)
    expect(authority.rules).not.toBe(moved.tradeRulesBySeasonId[menSeason.id])

    const proposal = { seasonId: authority.season.id, ecosystemId: authority.rules.ecosystemId }
    expect(getTradeWindowStatus(updateGameWorld(moved, { currentDate: authority.rules.tradeWindow!.opensOn! }), proposal)).toBe('OPEN')
    expect(getTradeWindowStatus(updateGameWorld(moved, { currentDate: authority.rules.tradeWindow!.closesOn! }), proposal)).toBe('OPEN')
    expect(getTradeWindowStatus(updateGameWorld(moved, { currentDate: addDays(authority.rules.tradeWindow!.closesOn!, 1) }), proposal)).toBe('CLOSED')
  })

  it('removes NBA/WNBA trade authority when the manager moves to a FIBA/European club', () => {
    const world = createNewGame()
    const nbaSeason = tradeSeasonForCategory(world, 'men')
    const nbaClubId = vacantClubId(world, nbaSeason)
    const inNba = moveUserCoachToTeam(world, nbaClubId)
    expect(resolveTradeSeasonAuthorityForTeam(inNba, nbaClubId, nbaSeason.startDate)).toBeDefined()

    // The shipped FIBA-like competition is the same ecosystem kind the ACB universe uses: Market,
    // contracts and registration, never the NBA-style Trade system.
    const europeanClubId = getUserTeam(world)!.id
    const moved = moveUserCoachToTeam(inNba, europeanClubId)
    expect(getUserTeam(moved)!.id).toBe(europeanClubId)
    expect(resolveTradeSeasonAuthorityForTeam(moved, europeanClubId)).toBeUndefined()

    // A package that the old club's NBA window made legal is no longer the user club's authority.
    const staleProposal = {
      id: 'stale-nba-authority',
      ecosystemId: moved.competitions[nbaSeason.competitionId]!.ecosystemId,
      seasonId: nbaSeason.id,
      participantTeamIds: [europeanClubId, world.competitions[nbaSeason.competitionId]!.participantTeamIds[0]!],
      movements: [
        { asset: { kind: 'player' as const, playerId: moved.teams[europeanClubId]!.rosterPlayerIds[0]! }, fromTeamId: europeanClubId, toTeamId: world.competitions[nbaSeason.competitionId]!.participantTeamIds[0]! },
      ],
    }
    const result = proposeTradeNegotiation(moved, staleProposal, europeanClubId, { kind: 'USER' })
    expect(result.status).toBe('BLOCKED')
    expect(result.reasons).toContain('TRADE_SEASON_OR_ECOSYSTEM_UNAVAILABLE')
  })

  it('keeps the ACB universe outside the NBA/WNBA trade mechanism for its clubs', () => {
    const world = createAcbTestGame()
    const user = getUserTeam(world)!
    const season = Object.values(world.seasons).find((item) => world.competitions[item.competitionId]!.participantTeamIds.includes(user.id))!

    // Preseason: the club has no active edition yet, so it has no trade authority of any kind.
    expect(resolveActiveCompetitionSeasonForTeam(world, user.id, world.currentDate)).toBeUndefined()
    expect(resolveTradeSeasonAuthorityForTeam(world, user.id, world.currentDate)).toBeUndefined()
    // Once its own league is under way the club resolves that edition -- and still no Trade authority,
    // because the ACB ecosystem has no NBA/WNBA-style trade rules.
    expect(resolveActiveCompetitionSeasonForTeam(world, user.id, season.startDate)?.id).toBe(season.id)
    expect(resolveTradeSeasonAuthorityForTeam(world, user.id, season.startDate)).toBeUndefined()
  })
})
