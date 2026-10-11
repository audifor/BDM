import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays, addYears } from '@/domain/date'
import { createAthleticsAidAgreement } from '@/domain/collegeCompensation'
import { createGame } from '@/domain/game'
import type { MatchStatLog, PlayerGameStatLine } from '@/domain/stats/MatchStatLog'
import { updateGameWorld } from '@/domain/world'
import { chooseAiDraftProspect, createDraftForCompletedSeason, declareDraftEntry, getAiDraftBoard, getAvailableDraftProspects, getCurrentDraftPick, getDraftCandidates, makeDraftSelection, openDraft, withdrawDraftEntry } from '@/engine/draft'
import { advisePlayerCareerPathway } from './ProfessionalPathwayDecision'
import { finalizeSeason } from '@/engine/season'
import { applyMatchResult } from '@/engine/match'
import { nbaDraftRulesForYear } from '@/domain/draft'
import { signUndraftedPlayerToNba } from './EcosystemTransitions'
import { getEligibleScoutingEvaluators, progressScoutingAssignments, requestScouting } from '@/engine/scouting/ScoutingEngine'
import { estimatePlayerDraftOutlook } from './ProfessionalPathwayDecision'

describe('game-backed Player Draft decision realism', () => {
  it('lets a strong-context Player return and a weak-context Player stay in the same Draft', () => {
    let world = createNewGame()
    const ncaaCompetition = Object.values(world.competitions).find((competition) => world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike' && world.ecosystems[competition.ecosystemId]?.category === 'men')!
    const ncaaSeason = Object.values(world.seasons).find((season) => season.competitionId === ncaaCompetition.id)!
    const recruitingCycle = Object.values(world.recruitingCyclesById).find((cycle) => cycle.ecosystemId === ncaaCompetition.ecosystemId)!
    const [teamAId, teamBId] = ncaaCompetition.participantTeamIds
    const teamA = world.teams[teamAId!]!, teamB = world.teams[teamBId!]!
    const playerAId = teamA.rosterPlayerIds[0]!, playerBId = teamB.rosterPlayerIds[0]!
    const playerAPersonId = world.players[playerAId]!.personId, playerBPersonId = world.players[playerBId]!.personId
    const opponentAId = ncaaCompetition.participantTeamIds.find((id) => id !== teamAId && id !== teamBId)!
    const opponentBId = ncaaCompetition.participantTeamIds.find((id) => id !== teamBId && id !== teamAId)!
    const sample = Object.values(world.games).filter((game) => game.seasonId === ncaaSeason.id).sort((left, right) => left.date.localeCompare(right.date)).at(-1)!
    const extraGames = Array.from({ length: 10 }, (_, index) => {
      const supported = index < 5
      const teamId = supported ? teamAId! : teamBId!
      const opponentId = supported ? opponentAId : opponentBId
      return createGame({ ...sample, id: `decision-realism:extra-game:${index}` as typeof sample.id, date: addDays(sample.date, index + 1), homeTeamId: teamId, awayTeamId: opponentId, status: 'scheduled', result: null })
    })
    world = updateGameWorld(world, { games: [...Object.values(world.games), ...extraGames] })
    const gamesA = extraGames.slice(0, 5), gamesB = extraGames.slice(5)
    expect(gamesA).toHaveLength(5)
    expect(gamesB).toHaveLength(5)
    const completedIds = new Set([...gamesA, ...gamesB].map((game) => game.id))
    const logs: MatchStatLog[] = []
    const completedGames = Object.values(world.games).map((game) => {
      if (!completedIds.has(game.id)) return game
      const teamId = game.homeTeamId === teamAId || game.awayTeamId === teamAId ? teamAId! : teamBId!
      const playerId = teamId === teamAId ? playerAId : playerBId
      const supported = teamId === teamAId
      const targetTeam = world.teams[teamId]!
      const opponentTeamId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId
      const isHome = game.homeTeamId === teamId
      const starters = targetTeam.rosterPlayerIds.filter((id) => id !== playerId).slice(0, supported ? 4 : 5)
      const teamLines = createLines({ playerIds: starters, playerId, teamId, opponentTeamId, isHome, started: true, points: [24, 24, 23, 23, 0], targetPoints: 6, targetSeconds: supported ? 1800 : 180, targetStarted: supported, targetTeam: true })
      const opponent = world.teams[opponentTeamId]!
      const opponentLines = createLines({ playerIds: opponent.rosterPlayerIds.slice(0, 5), teamId: opponentTeamId, opponentTeamId: teamId, isHome: !isHome, started: true, points: [18, 18, 18, 18, 18], targetTeam: false })
      const homePoints = isHome ? 100 : 90
      const awayPoints = isHome ? 90 : 100
      const resultGame = createGame({ ...game, status: 'completed', result: { homeScore: homePoints, awayScore: awayPoints } })
      logs.push({ gameId: game.id, competitionId: game.competitionId, seasonId: game.seasonId, gameDate: game.date, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, finalScore: { home: homePoints, away: awayPoints }, playerLines: [...(isHome ? teamLines : opponentLines), ...(isHome ? opponentLines : teamLines)] })
      return resultGame
    })
    const latestRoleGameDate = [...gamesA, ...gamesB].map((game) => game.date).sort().at(-1)!
    const profile = (id: string, playerId: typeof playerAId, trust: number, professionalImportance: number) => ({
      id, playerId: playerId!, cycleId: recruitingCycle.id, origin: 'preCollege' as const, position: world.players[playerId!]!.basketball.primaryPosition,
      publicRank: 1, positionRank: 1, tier: 'rotation' as const, preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'arrived' as const,
      recruitingRpg: {
        preferenceProfile: { importance: { playingTime: 5, roleClarity: 5, coachTrust: 5, familyTrust: 5, development: 5, winning: 5, prestige: 5, distance: 5, academics: 5, professionalPathway: professionalImportance, internationalSupport: 5 }, compensationSecurityImportance: trust > 50 ? 10 : 1, dealbreakers: [], decisionStyle: 'deliberate' as const },
        intel: [], relationships: [{ programTeamId: playerId === playerAId ? teamA.id : teamB.id, actor: 'headCoach' as const, actorId: playerId === playerAId ? teamA.coachId : teamB.coachId, familiarity: 80, rapport: trust, trust, credibility: trust, updatedOn: latestRoleGameDate }], stakeholders: [], promises: [], story: [],
      },
      education: { highSchoolGraduationYear: 2031, completedUsHighSchool: true, enrolledAtUsCollege: true },
    })
    const profiles = [profile('decision-realism:player-a', playerAId, 90, 5), profile('decision-realism:player-b', playerBId, 20, 10)]
    const aid = createAthleticsAidAgreement({ id: 'decision-realism:aid-a', playerId: playerAId, teamId: teamA.id, institutionId: teamA.organizationId, academicPeriod: ncaaSeason.label, valueMinorUnits: 200_000, effectiveFrom: ncaaSeason.startDate, effectiveTo: ncaaSeason.endDate, offeredOn: ncaaSeason.startDate, signedOn: ncaaSeason.startDate, status: 'signed', provenance: 'institutional-aid', history: [] })
    world = updateGameWorld(world, { currentDate: latestRoleGameDate, games: completedGames, matchStatLogs: logs, recruitProfiles: [...Object.values(world.recruitProfilesById), ...profiles], athleticsAidAgreements: [...Object.values(world.athleticsAidAgreementsById), aid] })
    expect(advisePlayerCareerPathway(world, playerAId, teamA.id, ncaaSeason.id).outlook).toBe('borderline')
    expect(advisePlayerCareerPathway(world, playerBId, teamB.id, ncaaSeason.id).outlook).toBe('borderline')
    expect(advisePlayerCareerPathway(world, playerAId, teamA.id, ncaaSeason.id).decision).toBe('stayCollege')
    expect(advisePlayerCareerPathway(world, playerBId, teamB.id, ncaaSeason.id).decision).toBe('testDraft')

    const nbaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]?.kind === 'nbaLike')!
    for (const game of Object.values(world.games).filter((candidate) => candidate.seasonId === nbaSeason.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
    world = finalizeSeason(world, nbaSeason.id)
    const draft = Object.values(world.draftsById).find((candidate) => candidate.sourceSeasonId === nbaSeason.id)!
    world = updateGameWorld(world, { currentDate: draft.rules.earlyEntryDeadline! })
    world = declareDraftEntry(world, draft.id, playerAId)
    world = declareDraftEntry(world, draft.id, playerBId)
    expect(advisePlayerCareerPathway(world, playerAId, teamA.id, ncaaSeason.id).decision).toBe('withdrawDraft')
    expect(advisePlayerCareerPathway(world, playerBId, teamB.id, ncaaSeason.id).decision).toBe('remainInDraft')

    const returned = withdrawDraftEntry(world, draft.id, playerAId)
    expect(returned.players[playerAId]!.personId).toBe(playerAPersonId)
    expect(returned.playerEnrollmentsById).toEqual(world.playerEnrollmentsById)
    expect(returned.teams[teamA.id]!.rosterPlayerIds).toContain(playerAId)
    expect(getDraftCandidates(returned, draft.id)).not.toContain(playerAId)
    expect(returned.draftsById[draft.id]!.entries?.find((entry) => entry.playerId === playerAId)?.status).toBe('withdrawnNCAAEligible')
    expect(world.players[playerBId]!.personId).toBe(playerBPersonId)
    expect(world.draftsById[draft.id]!.entries?.find((entry) => entry.playerId === playerBId)?.status).toBe('declaredEarlyEntry')
  }, 30_000)

  it('separates an optimistic public advisory from weak league-wide NBA knowledge and carries the Player through the undrafted market', () => {
    let world = createNewGame()
    const ncaaCompetition = Object.values(world.competitions).find((competition) => world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike' && world.ecosystems[competition.ecosystemId]?.category === 'men')!
    const ncaaSeason = Object.values(world.seasons).find((season) => season.competitionId === ncaaCompetition.id)!
    const nba = Object.values(world.ecosystems).find((ecosystem) => ecosystem.kind === 'nbaLike')!
    const nbaSeason = Object.values(world.seasons).find((season) => world.competitions[season.competitionId]?.ecosystemId === nba.id)!
    const sourceTeamId = ncaaCompetition.participantTeamIds[0]!
    const sourceTeam = world.teams[sourceTeamId]!
    const candidates = sourceTeam.rosterPlayerIds.slice(0, 5)
    const targetId = candidates[0]!
    const personId = world.players[targetId]!.personId
    const gameTemplate = Object.values(world.games).find((game) => game.seasonId === ncaaSeason.id)!
    const opponentTeamId = ncaaCompetition.participantTeamIds.find((id) => id !== sourceTeamId)!
    const extraGames = Array.from({ length: 5 }, (_, index) => createGame({ ...gameTemplate, id: `misjudgment:game:${index}` as typeof gameTemplate.id, date: addDays(gameTemplate.date, index + 1), homeTeamId: sourceTeamId, awayTeamId: opponentTeamId, status: 'scheduled', result: null }))
    const statLogs: MatchStatLog[] = []
    const games = [...Object.values(world.games), ...extraGames]
    const completedGames = games.map((game, index) => {
      if (!extraGames.some((candidate) => candidate.id === game.id)) return game
      const sourceLines = candidates.map((playerId, candidateIndex) => ({ playerId: playerId as PlayerGameStatLine['playerId'], teamId: sourceTeamId as PlayerGameStatLine['teamId'], opponentTeamId: opponentTeamId as PlayerGameStatLine['opponentTeamId'], isHome: true, started: true, stats: { ...statSnapshot(playerId, candidateIndex === 0 ? 8 : 22, 1800), rebounds: candidateIndex === 0 ? 0 : 5, assists: candidateIndex === 0 ? 0 : 3 } }))
      const opposingTeam = world.teams[opponentTeamId]!
      const opponentLines = opposingTeam.rosterPlayerIds.slice(0, 5).map((playerId) => ({ playerId: playerId as PlayerGameStatLine['playerId'], teamId: opponentTeamId as PlayerGameStatLine['teamId'], opponentTeamId: sourceTeamId as PlayerGameStatLine['opponentTeamId'], isHome: false, started: true, stats: statSnapshot(playerId, 18, 1800) }))
      const finalScore = { homeScore: 96, awayScore: 90 }
      statLogs.push({ gameId: game.id, competitionId: game.competitionId, seasonId: game.seasonId, gameDate: game.date, homeTeamId: sourceTeamId as MatchStatLog['homeTeamId'], awayTeamId: opponentTeamId as MatchStatLog['awayTeamId'], finalScore: { home: finalScore.homeScore, away: finalScore.awayScore }, playerLines: [...sourceLines, ...opponentLines] })
      return createGame({ ...game, status: 'completed', result: finalScore })
    })
    const lastGameDate = extraGames.at(-1)!.date
    const education = candidates.map((playerId, index) => ({ id: `misjudgment:education:${playerId}`, playerId, cycleId: Object.values(world.recruitingCyclesById).find((cycle) => cycle.ecosystemId === ncaaCompetition.ecosystemId)!.id, origin: 'preCollege' as const, position: world.players[playerId]!.basketball.primaryPosition, publicRank: index + 1, positionRank: index + 1, tier: 'strong' as const, preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'arrived' as const, education: { highSchoolGraduationYear: 2030, completedUsHighSchool: true, enrolledAtUsCollege: true } }))
    world = updateGameWorld(world, { currentDate: lastGameDate, games: completedGames, matchStatLogs: [...Object.values(world.matchStatLogsByGameId), ...statLogs], recruitProfiles: [...Object.values(world.recruitProfilesById), ...education] })
    expect(advisePlayerCareerPathway(world, targetId, sourceTeamId, ncaaSeason.id).outlook).toBe('borderline')
    const existingPlayerCount = Object.keys(world.players).length
    for (const game of Object.values(world.games).filter((candidate) => candidate.seasonId === nbaSeason.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
    world = finalizeSeason(world, nbaSeason.id)
    world = updateGameWorld(world, { drafts: [], draftPicks: [], players: Object.values(world.players).filter((player) => !player.id.startsWith('draft-prospect:')) })
    world = createDraftForCompletedSeason(world, nba.id, nbaSeason.id, nbaDraftRulesForYear(2045, 1), [])
    const draft = Object.values(world.draftsById).find((candidate) => candidate.sourceSeasonId === nbaSeason.id)!
    world = updateGameWorld(world, { currentDate: draft.rules.earlyEntryDeadline! })
    for (const playerId of candidates) world = declareDraftEntry(world, draft.id, playerId)
    world = openDraft(updateGameWorld(world, { currentDate: draft.scheduledOn }), draft.id)

    const dimensions = ['finishing', 'shooting', 'creation', 'perimeterDefense', 'interiorDefense', 'rebounding', 'physical', 'potential:physical']
    const leagueKnowledge = Object.values(world.teams).filter((team) => Object.values(world.competitions).some((competition) => competition.ecosystemId === nba.id && competition.participantTeamIds.includes(team.id))).flatMap((team) => candidates.map((playerId, index) => ({ organizationId: team.organizationId, subjectPlayerId: playerId, dimensions: Object.fromEntries(dimensions.map((dimension) => [dimension, { coverage: 1, confidence: 1, assessedAt: world.currentDate, provenance: 'scoutReport' as const, estimate: index === 0 ? 5 : 99, uncertainty: 1 }])) })))
    world = updateGameWorld(world, { organizationKnowledge: [...world.organizationKnowledge, ...leagueKnowledge] })
    for (const team of Object.values(world.teams).filter((candidate) => Object.values(world.competitions).some((competition) => competition.ecosystemId === nba.id && competition.participantTeamIds.includes(candidate.id)))) {
      const board = getAiDraftBoard(world, draft.id, team.id)
      expect(board.findIndex((row) => row.playerId === targetId)).toBeGreaterThanOrEqual(4)
      expect(board[0]?.playerId).not.toBe(targetId)
    }
    expect(Object.keys(world.players)).toHaveLength(existingPlayerCount)
    while (getCurrentDraftPick(world, draft.id) !== undefined) {
      const pick = getCurrentDraftPick(world, draft.id)!
      const chosen = chooseAiDraftProspect(world, draft.id, pick.ownerTeamId)!
      expect(chosen).not.toBe(targetId)
      world = makeDraftSelection(world, draft.id, pick.ownerTeamId, chosen)
    }
    expect(getAvailableDraftProspects(world, draft.id)).toHaveLength(0)
    expect(world.draftsById[draft.id]!.entries?.find((entry) => entry.playerId === targetId)?.status).toBe('undrafted')
    const nbaTeam = world.teams[Object.values(world.competitions).find((competition) => competition.ecosystemId === nba.id)!.participantTeamIds[0]!]!
    const signed = signUndraftedPlayerToNba(world, { id: 'transition:misjudgment-undrafted', playerId: targetId, draftId: draft.id, toTeamId: nbaTeam.id })
    expect(signed.players[targetId]!.personId).toBe(personId)
    expect(signed.teams[nbaTeam.id]!.rosterPlayerIds).toContain(targetId)
    expect(Object.values(signed.contractsById).some((contract) => contract.playerId === targetId && contract.teamId === nbaTeam.id)).toBe(true)
    expect(signed.ecosystemTransitionsById['transition:misjudgment-undrafted']?.playerId).toBe(targetId)
  }, 30_000)

  it('records a timely return, then lets improved game production and a new scouting report support the next declaration', () => {
    let world = createNewGame()
    const collegeCompetition = Object.values(world.competitions).find((competition) => world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike' && world.ecosystems[competition.ecosystemId]?.category === 'men')!
    const collegeSeason = Object.values(world.seasons).find((season) => season.competitionId === collegeCompetition.id)!
    const ncaaTeamId = collegeCompetition.participantTeamIds[0]!
    const playerId = world.teams[ncaaTeamId]!.rosterPlayerIds[0]!
    const personId = world.players[playerId]!.personId
    const nba = Object.values(world.ecosystems).find((ecosystem) => ecosystem.kind === 'nbaLike')!
    const nbaSeason = Object.values(world.seasons).find((season) => world.competitions[season.competitionId]?.ecosystemId === nba.id)!
    const recruitingCycleId = Object.values(world.recruitingCyclesById).find((cycle) => cycle.ecosystemId === collegeCompetition.ecosystemId)!.id
    const sourceGame = Object.values(world.games).find((game) => game.seasonId === collegeSeason.id)!
    const opponentTeamId = collegeCompetition.participantTeamIds.find((id) => id !== ncaaTeamId)!
    const games = Array.from({ length: 5 }, (_, index) => createGame({ ...sourceGame, id: `breakout:return:${index}` as typeof sourceGame.id, date: addDays(sourceGame.date, index + 1), homeTeamId: ncaaTeamId, awayTeamId: opponentTeamId, status: 'scheduled', result: null }))
    const playerLines = (breakout: boolean): MatchStatLog['playerLines'] => {
      const team = world.teams[ncaaTeamId]!
      const opponents = world.teams[opponentTeamId]!
      return [
        ...team.rosterPlayerIds.slice(0, 5).map((id, index) => ({ playerId: id as PlayerGameStatLine['playerId'], teamId: ncaaTeamId as PlayerGameStatLine['teamId'], opponentTeamId: opponentTeamId as PlayerGameStatLine['opponentTeamId'], isHome: true, started: true, stats: statSnapshot(id, id === playerId ? breakout ? 24 : 8 : breakout ? 14 : 18, 1800) })),
        ...opponents.rosterPlayerIds.slice(0, 5).map((id) => ({ playerId: id as PlayerGameStatLine['playerId'], teamId: opponentTeamId as PlayerGameStatLine['teamId'], opponentTeamId: ncaaTeamId as PlayerGameStatLine['opponentTeamId'], isHome: false, started: true, stats: statSnapshot(id, 18, 1800) })),
      ]
    }
    const logs = games.map((game) => ({ gameId: game.id, competitionId: game.competitionId, seasonId: game.seasonId, gameDate: game.date, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, finalScore: { home: 80, away: 90 }, playerLines: playerLines(false) }))
    const completed = games.map((game) => createGame({ ...game, status: 'completed', result: { homeScore: 80, awayScore: 90 } }))
    const recruitProfile = { id: `breakout:education:${playerId}`, playerId, cycleId: recruitingCycleId, origin: 'preCollege' as const, position: world.players[playerId]!.basketball.primaryPosition, publicRank: 1, positionRank: 1, tier: 'strong' as const, preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'arrived' as const, recruitingRpg: { preferenceProfile: { importance: { playingTime: 5, roleClarity: 5, coachTrust: 5, familyTrust: 5, development: 5, winning: 5, prestige: 5, distance: 5, academics: 5, professionalPathway: 4, internationalSupport: 5 }, compensationSecurityImportance: 8, dealbreakers: [], decisionStyle: 'deliberate' as const }, intel: [], relationships: [{ programTeamId: ncaaTeamId, actor: 'headCoach' as const, actorId: world.teams[ncaaTeamId]!.coachId, familiarity: 90, rapport: 90, trust: 90, credibility: 90, updatedOn: games.at(-1)!.date }], stakeholders: [], promises: [], story: [] }, education: { highSchoolGraduationYear: Number(collegeSeason.startDate.slice(0, 4)) - 1, completedUsHighSchool: true, enrolledAtUsCollege: true } }
    const aid = createAthleticsAidAgreement({ id: `breakout:aid:${playerId}`, playerId, teamId: ncaaTeamId, institutionId: world.teams[ncaaTeamId]!.organizationId, academicPeriod: collegeSeason.label, valueMinorUnits: 200_000, effectiveFrom: collegeSeason.startDate, effectiveTo: collegeSeason.endDate, offeredOn: collegeSeason.startDate, signedOn: collegeSeason.startDate, status: 'signed', provenance: 'institutional-aid', history: [] })
    world = updateGameWorld(world, { currentDate: games.at(-1)!.date, games: [...Object.values(world.games), ...completed], matchStatLogs: [...Object.values(world.matchStatLogsByGameId), ...logs], recruitProfiles: [...Object.values(world.recruitProfilesById), recruitProfile], athleticsAidAgreements: [...Object.values(world.athleticsAidAgreementsById), aid] })
    const yearN = Number(nbaSeason.startDate.slice(0, 4)) + 1
    const rulesN = nbaDraftRulesForYear(yearN, 1)
    for (const game of Object.values(world.games).filter((candidate) => candidate.seasonId === nbaSeason.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
    world = finalizeSeason(world, nbaSeason.id)
    world = updateGameWorld(world, { drafts: [], draftPicks: [], players: Object.values(world.players).filter((player) => !player.id.startsWith('draft-prospect:')) })
    world = createDraftForCompletedSeason(world, nba.id, nbaSeason.id, rulesN, [])
    const firstDraft = Object.values(world.draftsById).find((draft) => draft.sourceSeasonId === nbaSeason.id)!
    world = updateGameWorld(world, { currentDate: rulesN.earlyEntryDeadline! })
    world = declareDraftEntry(world, firstDraft.id, playerId)
    expect(estimatePlayerDraftOutlook(world, playerId, collegeSeason.id).band).toBe('borderline')
    world = updateGameWorld(world, { currentDate: addDays(rulesN.collegeWithdrawalDeadline!, -1) })
    world = withdrawDraftEntry(world, firstDraft.id, playerId)
    expect(world.draftsById[firstDraft.id]!.entries?.find((entry) => entry.playerId === playerId)?.status).toBe('withdrawnNCAAEligible')
    expect(world.players[playerId]!.personId).toBe(personId)

    const nextSeasonId = `season:${nba.id}:breakout-${yearN + 1}` as typeof nbaSeason.id
    const nextSeason = { ...nbaSeason, id: nextSeasonId, label: `${yearN + 1}-${String(yearN + 2).slice(-2)}`, startDate: addYears(nbaSeason.startDate, 1), endDate: addYears(nbaSeason.endDate, 1) }
    const collegeNextSeasonId = `season:${collegeCompetition.id}:breakout-${yearN + 1}` as typeof collegeSeason.id
    const collegeNextSeason = { ...collegeSeason, id: collegeNextSeasonId, label: `${yearN}-${String(yearN + 1).slice(-2)}`, startDate: addYears(collegeSeason.startDate, 1), endDate: addYears(collegeSeason.endDate, 1) }
    const nextGames = Object.values(world.games).filter((game) => game.seasonId === nbaSeason.id && game.status === 'completed').map((game, index) => createGame({ ...game, id: `${game.id}:breakout-next` as typeof game.id, seasonId: nextSeasonId, date: addYears(game.date, 1), status: 'scheduled', result: null }))
    const breakoutGames = games.map((game) => createGame({ ...game, id: `${game.id}:breakout-next` as typeof game.id, seasonId: collegeNextSeasonId, date: addYears(game.date, 1), status: 'completed', result: { homeScore: 80, awayScore: 90 } }))
    world = updateGameWorld(world, { currentDate: games.at(-1)!.date, seasons: [...Object.values(world.seasons), nextSeason, collegeNextSeason], games: [...Object.values(world.games), ...nextGames, ...breakoutGames] })
    for (const game of nextGames) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
    world = finalizeSeason(world, nextSeasonId)
    const improvedLogs = breakoutGames.map((game) => ({ gameId: game.id, competitionId: game.competitionId, seasonId: game.seasonId, gameDate: game.date, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, finalScore: { home: 80, away: 90 }, playerLines: playerLines(true) }))
    world = updateGameWorld(world, { currentDate: addYears(games.at(-1)!.date, 1), matchStatLogs: [...Object.values(world.matchStatLogsByGameId), ...improvedLogs] })
    expect(estimatePlayerDraftOutlook(world, playerId, collegeNextSeasonId).band).toBe('lottery')

    const scoutingTeam = world.teams[Object.values(world.competitions).find((competition) => competition.ecosystemId === nba.id)!.participantTeamIds[0]!]!
    const evaluator = getEligibleScoutingEvaluators(world, scoutingTeam.id, 'FULL_REPORT')[0]!
    world = requestScouting(world, { organizationId: scoutingTeam.organizationId, playerId, missionType: 'FULL_REPORT', evaluatorStaffId: evaluator, teamContextId: scoutingTeam.id })
    for (let day = 0; day < 12 && Object.values(world.scoutingAssignmentsById).some((assignment) => assignment.subjectPlayerId === playerId && assignment.status !== 'COMPLETED' && assignment.status !== 'CANCELLED'); day += 1) {
      world = progressScoutingAssignments(updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) }))
    }
    expect(Object.values(world.evaluatorReportsById).some((report) => report.subjectPlayerId === playerId && report.organizationId === scoutingTeam.organizationId)).toBe(true)
    expect(world.organizationKnowledge.some((knowledge) => knowledge.subjectPlayerId === playerId && knowledge.organizationId === scoutingTeam.organizationId)).toBe(true)

    const rulesNext = nbaDraftRulesForYear(yearN + 1, 1)
    world = createDraftForCompletedSeason(world, nba.id, nextSeasonId, rulesNext, [])
    const nextDraft = Object.values(world.draftsById).find((draft) => draft.sourceSeasonId === nextSeasonId)!
    world = updateGameWorld(world, { currentDate: rulesNext.earlyEntryDeadline! })
    world = declareDraftEntry(world, nextDraft.id, playerId)
    expect(estimatePlayerDraftOutlook(world, playerId, collegeNextSeasonId).band).toBe('lottery')
    expect(world.draftsById[nextDraft.id]!.entries?.find((entry) => entry.playerId === playerId)?.status).toBe('declaredEarlyEntry')
    expect(world.players[playerId]!.personId).toBe(personId)
  }, 30_000)
})

function createLines(input: { playerIds: readonly string[]; playerId?: string; teamId: string; opponentTeamId: string; isHome: boolean; started: boolean; points: readonly number[]; targetPoints?: number; targetSeconds?: number; targetStarted?: boolean; targetTeam: boolean }): PlayerGameStatLine[] {
  const lines = input.playerIds.map((playerId, index) => ({ playerId: playerId as PlayerGameStatLine['playerId'], teamId: input.teamId as PlayerGameStatLine['teamId'], opponentTeamId: input.opponentTeamId as PlayerGameStatLine['opponentTeamId'], isHome: input.isHome, started: input.started, stats: statSnapshot(playerId, input.points[index] ?? 0, 1800) }))
  if (input.targetTeam && input.playerId !== undefined) lines.push({ playerId: input.playerId as PlayerGameStatLine['playerId'], teamId: input.teamId as PlayerGameStatLine['teamId'], opponentTeamId: input.opponentTeamId as PlayerGameStatLine['opponentTeamId'], isHome: input.isHome, started: input.targetStarted ?? false, stats: { ...statSnapshot(input.playerId, input.targetPoints ?? 0, input.targetSeconds ?? 0), rebounds: 3, assists: 2 } })
  return lines
}

function statSnapshot(playerId: string, points: number, secondsPlayed: number) {
  return { playerId: playerId as PlayerGameStatLine['playerId'], secondsPlayed, points, fieldGoalsMade: 0, fieldGoalsAttempted: 0, twoPointMade: 0, twoPointAttempted: 0, threePointMade: 0, threePointAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, foulsCommitted: 0, plusMinus: 0 }
}
