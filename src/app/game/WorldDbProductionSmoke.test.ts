import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertWorldDbGameBootstrapSliceV1, type WorldDbGameBootstrapSelectionV1, type WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import { teamIdFromString } from '@/domain/ids'
import { createMatchPlayerProfile, simulateMatchDetailed, applyCompletedMatch } from '@/engine/match'
import { SeededRandomSource } from '@/engine/random'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { bootstrapGameWorldFromWorldDb } from './WorldDbGameBootstrap'
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS } from '@/domain/player'
import { buildPlayerWorkspaceModel } from '@/ui-ng/applications/player/data/buildPlayerWorkspaceModel'
import { buildCoachOverviewModel } from '@/ui-ng/applications/coach/coachOverviewModel'

const slicePath = process.env.BDM_WORLD_DB_SLICE_JSON
const runProductionSmoke = slicePath !== undefined && existsSync(slicePath)

describe.runIf(runProductionSmoke)('World DB production Spain ACB smoke', () => {
  it('materializes the real slice, derives the first game and applies a real MatchEngine result', () => {
    const value: unknown = JSON.parse(readFileSync(slicePath!, 'utf8'))
    assertWorldDbGameBootstrapSliceV1(value)
    const slice: WorldDbGameBootstrapSliceV1 = value
    const selectedTeam = slice.teams[7]!
    const selectedTeamId = teamIdFromString(selectedTeam.teamId)
    const selection: WorldDbGameBootstrapSelectionV1 = { source: slice.source, ecosystemId: slice.ecosystem.ecosystemId, competitionId: slice.competition.competitionId, competitionSeasonId: slice.season.competitionSeasonId, teamId: selectedTeamId }
    const world = bootstrapGameWorldFromWorldDb(slice, selection, { contentId: 'production-smoke', contentHash: '0'.repeat(64), worldDbSchema: slice.source.schemaId })
    expect(Object.keys(world.teams)).toHaveLength(18)
    expect(Object.keys(world.players)).toHaveLength(270)
    expect(Object.keys(world.staffPeopleById)).toHaveLength(90)
    expect(Object.keys(world.personsById)).toHaveLength(slice.persons.length)
    expect(Object.keys(world.games)).toHaveLength(306)
    const team = world.teams[selectedTeamId]!
    expect(team.name).toBe(selectedTeam.name)
    expect(team.rosterPlayerIds).toHaveLength(15)
    expect(team.coachId).toBe(world.userCoachId)
    const teamStaff = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.teamId === team.id)
    expect(teamStaff).toHaveLength(5)
    expect(teamStaff.filter((assignment) => assignment.role === 'headCoach')).toHaveLength(1)
    const headCoachAssignment = teamStaff.find((assignment) => assignment.role === 'headCoach')!
    const coach = world.coaches[team.coachId!]!
    const coachStaff = world.staffPeopleById[headCoachAssignment.staffPersonId]!
    const coachPerson = world.personsById[coachStaff.personId!]!
    expect(coach.staffProfileId).toBe(headCoachAssignment.staffPersonId)
    expect(coach.personId).toBe(coachStaff.personId)
    expect(coachPerson.profileRefs).toContainEqual({ kind: 'staff', profileId: coachStaff.id })
    expect(coachPerson.id).not.toMatch(/^person:coach:/)
    expect(Object.keys(world.staffPeopleById)).toEqual(expect.arrayContaining(slice.staffProfiles.map((profile) => profile.staffId)))
    expect(coachStaff.professional.attributes).not.toEqual(Object.fromEntries(Object.keys(coachStaff.professional.attributes).map((key) => [key, 50])))
    const coachProfileModel = buildCoachOverviewModel(world)
    expect(coachProfileModel.staffProfile).toBe(coachStaff)
    expect(coachProfileModel.attributes.map((attribute) => attribute.value)).toEqual(Object.values(coachStaff.professional.attributes))
    expect(coachProfileModel.identity.role).toBe('Head Coach')
    expect(coachProfileModel.identity.club).toBe(selectedTeam.name)

    for (const sourcePlayer of slice.players) {
      const player = world.players[sourcePlayer.playerId as keyof typeof world.players]!
      expect(Object.keys(player.basketball.ratings)).toHaveLength(PLAYER_TRUTH_RATING_KEYS.length)
      expect(Object.keys(player.basketball.ratings)).toEqual(PLAYER_TRUTH_RATING_KEYS)
      expect(PLAYER_TRUTH_RATING_KEYS.map((key) => player.basketball.ratings[key])).toEqual(
        PLAYER_TRUTH_RATING_KEYS.map((key) => sourcePlayer.ratings[key]),
      )
      expect(Object.keys(player.basketball.tendencies)).toEqual(PLAYER_TRUTH_TENDENCY_KEYS)
    }
    const realRosterPlayer = world.players[team.rosterPlayerIds[0]!]!
    const workspaceModel = buildPlayerWorkspaceModel(world, realRosterPlayer.id)!
    expect(workspaceModel.player).toBe(realRosterPlayer)
    expect(workspaceModel.person).toBe(world.personsById[realRosterPlayer.personId!]!)
    expect(workspaceModel.attributes.allRatings).toHaveLength(80)
    expect(workspaceModel.attributes.allRatings.map((rating) => rating.value)).toEqual(
      PLAYER_TRUTH_RATING_KEYS.map((key) => realRosterPlayer.basketball.ratings[key]),
    )
    expect(workspaceModel.attributes.categories.reduce((count, category) => count + category.all.length, 0)).toBe(80)
    expect(Object.values(world.games).filter((scheduled) => scheduled.homeTeamId === team.id || scheduled.awayTeamId === team.id)).toHaveLength(34)
    const game = Object.values(world.games)
      .filter((scheduled) => scheduled.homeTeamId === team.id || scheduled.awayTeamId === team.id)
      .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))[0]!
    const home = world.teams[game.homeTeamId]!
    const away = world.teams[game.awayTeamId]!
    const squads = { home: home.rosterPlayerIds, away: away.rosterPlayerIds }
    const lineups = { home: squads.home.slice(0, 5), away: squads.away.slice(0, 5) }
    const profiles = { home: squads.home.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)), away: squads.away.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)) }
    const simulation = simulateMatchDetailed({ world, gameId: game.id, homeStrength: { teamId: game.homeTeamId, value: 50 }, awayStrength: { teamId: game.awayTeamId, value: 50 }, squads, lineups, playerProfiles: profiles, random: new SeededRandomSource(101), decisionRandom: new SeededRandomSource(202), actorRandom: new SeededRandomSource(303) })
    const completed = applyCompletedMatch(world, simulation)
    expect(completed.games[game.id]?.status).toBe('completed')

    const saved = serializeGameWorldV1(completed, '2026-09-19T00:00:00.000Z')
    const reloaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(reloaded.teams[selectedTeamId]?.coachId).toBe(world.teams[selectedTeamId]?.coachId)
    expect(Object.keys(reloaded.players)).toHaveLength(270)
    expect(Object.keys(reloaded.staffPeopleById)).toHaveLength(90)
    expect(Object.keys(reloaded.personsById)).toHaveLength(slice.persons.length)
    expect(Object.keys(reloaded.competitions)).toHaveLength(1)
    expect(Object.keys(reloaded.seasons)).toHaveLength(1)
    expect(Object.keys(reloaded.games)).toHaveLength(306)
    expect(reloaded.games[game.id]).toEqual(completed.games[game.id])
    expect(reloaded.teams[team.id]?.rosterPlayerIds).toHaveLength(15)
    expect(reloaded.teams[team.id]?.coachId).toBe(reloaded.userCoachId)
    expect(Object.values(reloaded.teamStaffAssignmentsById).filter((assignment) => assignment.teamId === team.id)).toHaveLength(5)
    expect(reloaded.coaches[coach.id]?.staffProfileId).toBe(coachStaff.id)
    expect(reloaded.coaches[coach.id]?.personId).toBe(coachPerson.id)
    expect(reloaded.personsById[coachPerson.id]?.profileRefs).toContainEqual({ kind: 'staff', profileId: coachStaff.id })
    expect(Object.keys(reloaded.players[realRosterPlayer.id]!.basketball.ratings)).toEqual(PLAYER_TRUTH_RATING_KEYS)
  })
})
