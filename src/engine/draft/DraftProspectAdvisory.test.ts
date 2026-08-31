import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { createDraftForCompletedSeason, generateDraftProspects, getAvailableDraftProspects, getCurrentDraftPick, openDraft, progressDraftAi } from './DraftEngine'
import { progressDraftProspectAdvisories } from './DraftProspectAdvisory'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

function createOpenDraftWorld(rounds: number): { world: GameWorld; draftId: string; seasonId: keyof GameWorld['seasons'] } {
  let world = createNewGame()
  const nba = Object.values(world.ecosystems).find((ecosystem) => ecosystem.kind === 'nbaLike')!
  const season = Object.values(world.seasons).find((candidate) => world.competitions[candidate.competitionId]!.ecosystemId === nba.id)!
  for (const game of Object.values(world.games).filter((candidate) => candidate.seasonId === season.id)) {
    world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 100, awayScore: 90 })
  }
  world = finalizeSeason(world, season.id)
  world = updateGameWorld(world, { drafts: [], draftPicks: [], players: Object.values(world.players).filter((player) => !player.id.startsWith('draft-prospect:')) })
  world = createDraftForCompletedSeason(world, nba.id, season.id, { rounds, orderMethod: 'reverseStandings', scheduledAfterDays: 1 }, [])
  const draftId = Object.values(world.draftsById).find((draft) => draft.sourceSeasonId === season.id)!.id
  if (world.draftsById[draftId]!.prospectPlayerIds.length === 0) world = generateDraftProspects(world, draftId, rounds * 4)
  const scheduledOn = world.draftsById[draftId]!.scheduledOn
  return { world: updateGameWorld(world, { currentDate: addDays(scheduledOn, -1) }), draftId, seasonId: season.id }
}

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, mode: 'advisory' | 'userControlled' | 'organizational' = 'advisory') {
  const staffId = staffPersonIdFromString(`draft-advisory-staff-${role}-${teamId}`)
  const withStaff = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Dra', lastName: 'Ft' }, professional: { attributes: flatAttributes } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`draft-advisory-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
  })
  const id = `responsibility:${teamId}:prospectReport` as never
  const delegated = updateGameWorld(withStaff, {
    responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind: 'prospectReport', mode, ...(mode === 'advisory' ? { holderStaffId: staffId } : {}) }],
  })
  return { world: delegated, staffId }
}

function openedDraftOnTheClock(rounds: number) {
  const initial = createOpenDraftWorld(rounds)
  const opened = openDraft(updateGameWorld(initial.world, { currentDate: initial.world.draftsById[initial.draftId]!.scheduledOn }), initial.draftId)
  const pick = getCurrentDraftPick(opened, initial.draftId)!
  return { world: opened, draftId: initial.draftId, teamId: pick.ownerTeamId }
}

describe('progressDraftProspectAdvisories', () => {
  it('draft advice uses the existing prospectReport responsibility seam, applied: false', () => {
    const { world, draftId, teamId } = openedDraftOnTheClock(1)
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'collegeScout')
    const progressed = progressDraftProspectAdvisories(withStaff, draftId)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectReport')
    expect(outcome).toBeDefined()
    expect(outcome!.applied).toBe(false)
    expect(outcome!.payload.draftId).toBe(draftId)
  })

  it('recommends a prospect from getAvailableDraftProspects only', () => {
    const { world, draftId, teamId } = openedDraftOnTheClock(1)
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'collegeScout')
    const progressed = progressDraftProspectAdvisories(withStaff, draftId)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectReport')!
    expect(getAvailableDraftProspects(world, draftId)).toContain(outcome.payload.recommendedPlayerId)
  })

  it('userControlled produces no Staff-authored draft outcome', () => {
    const { world, draftId, teamId } = openedDraftOnTheClock(1)
    const { world: withStaff } = withStaffInRole(world, teamId, 'collegeScout', 'userControlled')
    const before = Object.keys(withStaff.delegationOutcomesById).length
    const progressed = progressDraftProspectAdvisories(withStaff, draftId)
    expect(Object.keys(progressed.delegationOutcomesById)).toHaveLength(before)
  })

  it('exactly once per (responsibility, draft, pick): repeated processing does not spam duplicate outcomes', () => {
    const { world, draftId, teamId } = openedDraftOnTheClock(1)
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'collegeScout')
    const once = progressDraftProspectAdvisories(withStaff, draftId)
    const twice = progressDraftProspectAdvisories(once, draftId)
    const outcomes = Object.values(twice.delegationOutcomesById).filter((item) => item.staffId === staffId && item.kind === 'prospectReport')
    expect(outcomes).toHaveLength(1)
  })

  it('never calls makeDraftSelection: no draft pick is ever consumed/selected by the advisory pass', () => {
    const { world, draftId, teamId } = openedDraftOnTheClock(1)
    const { world: withStaff } = withStaffInRole(world, teamId, 'collegeScout')
    const progressed = progressDraftProspectAdvisories(withStaff, draftId)
    expect(getCurrentDraftPick(progressed, draftId)).toEqual(getCurrentDraftPick(withStaff, draftId))
    expect(progressed.draftPicksById).toEqual(withStaff.draftPicksById)
  })

  it('existing AI Draft behavior remains unchanged when no Staff advisory is requested', () => {
    const { world, draftId } = createOpenDraftWorld(1)
    const opened = openDraft(updateGameWorld(world, { currentDate: world.draftsById[draftId]!.scheduledOn }), draftId)
    const withoutAdvisory = progressDraftAi(opened, draftId)
    const withAdvisoryFirst = progressDraftAi(progressDraftProspectAdvisories(opened, draftId), draftId)
    expect(withAdvisoryFirst.draftPicksById).toEqual(withoutAdvisory.draftPicksById)
    expect(withAdvisoryFirst.teams).toEqual(withoutAdvisory.teams)
  })

  it('does not leak hidden Player truth: recommendation is unaffected by directly mutated ratings unless OrganizationKnowledge changes', () => {
    const { world, draftId, teamId } = openedDraftOnTheClock(1)
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'collegeScout')
    const before = progressDraftProspectAdvisories(withStaff, draftId)
    const beforeOutcome = Object.values(before.delegationOutcomesById).find((item) => item.staffId === staffId)!
    const mutatedRatings = updateGameWorld(withStaff, { players: Object.values(withStaff.players).map((player) => ({ ...player, basketball: { ...player.basketball, ratings: { ...player.basketball.ratings, threePointShooting: 100, passing: 100 } } })) })
    const after = progressDraftProspectAdvisories(mutatedRatings, draftId)
    const afterOutcome = Object.values(after.delegationOutcomesById).find((item) => item.staffId === staffId)!
    expect(afterOutcome.payload.recommendedPlayerId).toBe(beforeOutcome.payload.recommendedPlayerId)
  })
})
