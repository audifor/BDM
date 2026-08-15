import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { getCompetitionsForEcosystem, getEcosystemForCompetition, getEcosystemForTeam, getGamesForCompetition } from '@/domain/world'
import { addDays } from '@/domain/date'
import { getCompetitionTemporalStatus, isCompetitionActiveOnDate } from './index'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason, getCompetitionChampion } from '@/engine/season'

describe('FIBA-like ecosystem', () => {
  it('keeps independent competition windows on one global calendar', () => {
    const world = createNewGame()
    const competitions = Object.values(world.competitions).sort((a, b) => a.id.localeCompare(b.id))
    const [domestic, continental] = competitions
    const domesticSeason = Object.values(world.seasons).find((season) => season.competitionId === domestic!.id)!
    const continentalSeason = Object.values(world.seasons).find((season) => season.competitionId === continental!.id)!

    expect(getEcosystemForCompetition(world, domestic!.id).kind).toBe('fibaLike')
    expect(getCompetitionsForEcosystem(world, domestic!.ecosystemId)).toHaveLength(2)
    expect(getEcosystemForTeam(world, domestic!.participantTeamIds[0]!)!.id).toBe(domestic!.ecosystemId)
    expect(domesticSeason.startDate < continentalSeason.startDate).toBe(true)
    expect(getCompetitionTemporalStatus(world, continental!.id, domesticSeason.startDate)).toBe('scheduled')
    expect(isCompetitionActiveOnDate(world, domestic!.id, continentalSeason.startDate)).toBe(true)
    expect(isCompetitionActiveOnDate(world, continental!.id, continentalSeason.startDate)).toBe(true)
  })

  it('allows the later competition to complete while the domestic one continues', () => {
    const world = createNewGame()
    const continental = Object.values(world.competitions).sort((a, b) => a.id.localeCompare(b.id))[1]!
    const completed = getGamesForCompetition(world, continental.id).reduce((current, game) => applyMatchResult(current, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 }), world)
    const season = Object.values(completed.seasons).find((candidate) => candidate.competitionId === continental.id)!
    const finalized = finalizeSeason(completed, season.id)

    expect(getCompetitionTemporalStatus(finalized, continental.id, addDays(season.startDate, 1))).toBe('completed')
    expect(getCompetitionChampion(finalized, continental.id)).toBeDefined()
    expect(getCompetitionTemporalStatus(finalized, finalized.currentSeasonId === season.id ? continental.id : Object.values(finalized.competitions).find((item) => item.id !== continental.id)!.id)).toBe('active')
  })
})
