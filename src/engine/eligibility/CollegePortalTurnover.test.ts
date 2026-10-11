import { writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { updateGameWorld } from '@/domain/world'
import { addDays } from '@/domain/date'
import { advanceDay } from '@/engine/calendar'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { performRecruitingAction } from '@/engine/recruiting'
import { assessCollegeContinuation } from './CollegeContinuationAssessment'
import { runCollegeRosterContinuationAndTransferAI } from './CollegeTransferAI'
import { establishPortalContinuationScenario } from '@/app/game/testSupport/PathwayTurnoverCertification'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

it('completes an AI Portal route at default thresholds with canonically exhausted contact budgets, then reloads/replays it', () => {
  let world = createNewGame({ seed: 15015 })
  const unemployed = Object.keys(world.coachEmploymentByCoachId).find(id => world.coachEmploymentByCoachId[id as keyof typeof world.coachEmploymentByCoachId]?.status === 'unemployed')!
  world = advanceDay(updateGameWorld(world, { userCoachId: unemployed as never }))
  world = advanceDay(updateGameWorld(world, { currentDate: '2032-12-29' as never }))
  const cycle = Object.values(world.recruitingCyclesById).find(item => item.status === 'open' && world.ecosystems[item.ecosystemId]?.category === 'men' && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')!
  const season = world.seasons[cycle.sourceSeasonId]!, competition = world.competitions[season.competitionId]!
  for (const game of Object.values(world.games).filter(item => item.seasonId === season.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 70, awayScore: 68 })
  world = finalizeSeason(world, season.id)
  const ordinary = Object.values(world.recruitProfilesById).filter(item => item.cycleId === cycle.id && item.status === 'open')
  for (const [programIndex, programId] of competition.participantTeamIds.entries()) {
    for (let day = 0; (world.recruitingCapacityByProgramId[programId] ?? 0) > 0 && day < 15; day++) {
      world = updateGameWorld(world, { currentDate: addDays('2033-01-20' as never, day) })
      const kind = world.recruitingCapacityByProgramId[programId]! >= cycle.rules.costs.pitch ? 'pitch' : 'contact'
      const recruitId = ordinary[(programIndex * 5 + day + 10) % ordinary.length]!.id
      const action = performRecruitingAction(world, cycle.id, recruitId, programId, kind)
      expect(action.ok, action.ok ? undefined : JSON.stringify({ reason: action.reason, programId, day, kind, remaining: world.recruitingCapacityByProgramId[programId], recruitId, rules: cycle.rules })).toBe(true)
      if (action.ok) world = action.value
    }
    expect(world.recruitingCapacityByProgramId[programId]).toBe(0)
  }
  world = establishPortalContinuationScenario(updateGameWorld(world, { currentDate: '2033-02-04' as never }))
  const seed = world.recruitProfilesById['pathway-scenario:continuation-memory']!
  const sourceId = competition.participantTeamIds[0]!, playerId = seed.playerId, personId = world.players[playerId]!.personId
  const assessment = assessCollegeContinuation(world, playerId, sourceId, season.id)!
  expect(assessment.leavePressure).toBeGreaterThan(assessment.stayPressure + 1)
  expect(cycle.rules.commitmentThreshold).toBe(60)
  let entry
  for (let day = 0; day < 15; day++) {
    world = runCollegeRosterContinuationAndTransferAI(updateGameWorld(world, { currentDate: addDays('2033-02-04' as never, day) }), cycle.id)
    entry = world.transferPortalEntriesById[`ai-portal:${cycle.id}:${playerId}`]
    if (entry?.status === 'completed') break
  }
  expect(entry?.status, JSON.stringify({ entry, offers: Object.values(world.recruitingOffersById).filter(item => item.recruitId.includes('ai-portal')), profiles: Object.values(world.recruitProfilesById).filter(item => item.playerId === playerId) })).toBe('completed')
  expect(entry!.educationalModuleCompletedOn).toBeDefined()
  expect(entry!.processedOn).toBeDefined()
  expect(entry!.movement!.sourceTeamId).toBe(sourceId)
  expect(world.teams[sourceId]!.rosterPlayerIds).not.toContain(playerId)
  expect(world.teams[entry!.destinationTeamId!]!.rosterPlayerIds.filter(id => id === playerId)).toHaveLength(1)
  expect(world.players[playerId]!.personId).toBe(personId)
  expect(world.playerEnrollmentsById[entry!.movement!.sourceEnrollmentId]!.status).toBe('ended')
  expect(world.playerEnrollmentsById[entry!.movement!.destinationEnrollmentId]!.status).toBe('active')
  expect(world.collegeEligibilityAssessmentsById[entry!.movement!.eligibilityAssessmentId]).toBeDefined()
  const saved = serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`)
  const restored = deserializeGameWorldV4(saved)
  expect(runCollegeRosterContinuationAndTransferAI(restored, cycle.id)).toBe(restored)
  expect(restored.transferPortalEntriesById[entry!.id]!.movement).toEqual(entry!.movement)
  writeFileSync('C:/Temp/BS15I-pathway-portal-completed-save-v4.json', JSON.stringify(saved))
  process.stdout.write(`[BS15I AI Portal] ${JSON.stringify({ playerId, personId, sourceId, destinationId: entry!.destinationTeamId, entryId: entry!.id, completedOn: entry!.movement!.transferredOn, commitmentThreshold: cycle.rules.commitmentThreshold })}\n`)
}, 60_000)
