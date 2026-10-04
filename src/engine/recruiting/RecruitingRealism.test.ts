import { describe, expect, it } from 'vitest'

import { createNcaaSimulatedGame } from '@/app/game'
import { addDays, createGameDate } from '@/domain/date'
import { organizationIdForTeam } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { updateGameWorld } from '@/domain/world'
import { applyMatchResult } from '@/engine/match'
import { getEligibleScoutingEvaluators, progressScoutingAssignments, requestScouting } from '@/engine/scouting/ScoutingEngine'
import { addRecruitingBoardEntry, arriveSignedRecruits, discoverRecruitingTalentCandidate, evaluateRecruitingChoice, makeRecruitingOffer, performRecruitingAction, promiseRecruitingRole, resolveRecruitingCommitments, selectAiNegotiationResponse, signCommittedRecruit } from './RecruitingEngine'
import { openAiRecruitingNegotiation, respondToRecruitingConcern } from './RecruitingNegotiationEngine'
import { performRecruitingGrayAction } from './RecruitingGrayActionEngine'
import { recruitingRulesetForSeason } from '@/domain/recruiting'

describe('Recruiting three-program realism certification', () => {
  it('lets known priorities, trust, role fit, and credible assurances beat a prestige-led rival while gray play trades gain for risk', () => {
    let world = createNcaaSimulatedGame()
    const cycle = Object.values(world.recruitingCyclesById).find((item) => item.status === 'open')!
    const competition = Object.values(world.competitions).find((item) => item.ecosystemId === cycle.ecosystemId)!
    const programs = competition.participantTeamIds.filter((teamId) => Object.values(world.teamStaffAssignmentsById).some((assignment) => assignment.teamId === teamId)).slice(0, 3)
    const [programA, programB, programC] = programs
    expect(programC).toBeDefined()
    if (!programA || !programB || !programC) return
    const discovered = discoverRecruitingTalentCandidate(world, cycle.id, programB)
    expect(discovered.ok).toBe(true)
    if (!discovered.ok) return
    world = discovered.value
    const recruit = Object.values(world.recruitProfilesById).find((item) => item.cycleId === cycle.id)!
    expect(Object.keys(recruit.recruitingRpg!.preferenceProfile.importance).length).toBeGreaterThanOrEqual(4)
    expect(['early', 'balanced', 'visitDriven']).toContain(recruit.recruitingRpg!.preferenceProfile.decisionStyle)
    expect(Object.keys(recruit.recruitingRpg!.intel.find((item) => item.programTeamId === programB)?.beliefs ?? {})).toHaveLength(0)
    world = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.id === recruit.id ? { ...item, recruitingRpg: { ...item.recruitingRpg!, preferenceProfile: { importance: { playingTime: 10, roleClarity: 9, coachTrust: 10, familyTrust: 8, development: 3, winning: 1, prestige: 1, distance: 5, academics: 3, professionalPathway: 2, internationalSupport: 2 }, dealbreakers: [], decisionStyle: 'visitDriven' as const }, stakeholders: [{ id: 'three-program-parent', role: 'parent' as const, influence: 70, preference: 'familyTrust' as const, attitudeByProgram: { [String(programA)]: -20, [String(programB)]: 25, [String(programC)]: 0 } }] } } : item) })

    const candidatePosition = world.recruitProfilesById[recruit.id]!.position
    const [selectedA, selectedB, selectedC] = programs
    if (!selectedA || !selectedB || !selectedC) return
    const teamB = world.teams[selectedB]!
    world = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === selectedB ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((playerId) => world.players[playerId]?.basketball.primaryPosition !== candidatePosition) } : team) })
    const publicRivalGame = Object.values(world.games).find((game) => game.homeTeamId === selectedA || game.awayTeamId === selectedA)
    if (publicRivalGame) world = applyMatchResult(world, { gameId: publicRivalGame.id, homeTeamId: publicRivalGame.homeTeamId, awayTeamId: publicRivalGame.awayTeamId, homeScore: publicRivalGame.homeTeamId === selectedA ? 92 : 71, awayScore: publicRivalGame.awayTeamId === selectedA ? 92 : 71 })

    const scoutingStaff = getEligibleScoutingEvaluators(world, selectedB, 'FULL_REPORT')[0]
    if (scoutingStaff !== undefined) {
      let scouting = requestScouting(world, { organizationId: organizationIdForTeam(selectedB), playerId: recruit.playerId, missionType: 'FULL_REPORT', evaluatorStaffId: scoutingStaff })
      for (let day = 0; day < 12 && Object.values(scouting.scoutingAssignmentsById).some((item) => item.status !== 'COMPLETED' && item.status !== 'CANCELLED'); day += 1) scouting = progressScoutingAssignments(updateGameWorld(scouting, { currentDate: addDays(scouting.currentDate, 1) }))
      world = scouting
      expect(world.organizationKnowledge.some((item) => item.organizationId === organizationIdForTeam(selectedB) && item.subjectPlayerId === recruit.playerId)).toBe(true)
    }

    const controlledAction = (teamId: typeof selectedB, kind: 'contact'|'pitch'|'visit') => {
      const result = performRecruitingAction(world, cycle.id, recruit.id, teamId, kind)
      expect(result.ok, result.ok ? undefined : result.reason).toBe(true)
      if (result.ok) world = result.value
    }
    world = addRecruitingBoardEntry(world, { programTeamId: selectedA, recruitId: recruit.id, priority: 'normal' })
    world = addRecruitingBoardEntry(world, { programTeamId: selectedB, recruitId: recruit.id, priority: 'high' })
    world = addRecruitingBoardEntry(world, { programTeamId: selectedC, recruitId: recruit.id, priority: 'normal' })
    controlledAction(selectedB, 'contact')
    world = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
    controlledAction(selectedB, 'pitch')
    world = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
    controlledAction(selectedB, 'contact')
    controlledAction(selectedB, 'contact')
    expect(Object.keys(world.recruitProfilesById[recruit.id]!.recruitingRpg!.intel.find((item) => item.programTeamId === selectedB)?.beliefs ?? {}).length).toBeGreaterThanOrEqual(2)
    world = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
    controlledAction(selectedB, 'visit')
    const assurance = promiseRecruitingRole(world, cycle.id, recruit.id, selectedB, 'explicit')
    expect(assurance.ok).toBe(true)
    if (assurance.ok) world = assurance.value
    const aiNegotiation = openAiRecruitingNegotiation(world, cycle.id, recruit.id, selectedB)
    expect(aiNegotiation.ok).toBe(true)
    if (aiNegotiation.ok) {
      expect(aiNegotiation.negotiation.currentConcerns.length).toBeGreaterThan(0)
      const topic = aiNegotiation.negotiation.unresolvedTopics[0]!
      const programIntel = aiNegotiation.world.recruitProfilesById[recruit.id]!.recruitingRpg!.intel.find((item) => item.programTeamId === selectedB)
      const relationship = aiNegotiation.world.recruitProfilesById[recruit.id]!.recruitingRpg!.relationships.find((item) => item.programTeamId === selectedB && item.actor === 'program')
      const selectedResponse = selectAiNegotiationResponse({ cycleId: cycle.id, programTeamId: selectedB, recruitId: recruit.id, date: aiNegotiation.world.currentDate, topic, intelConfidence: programIntel?.confidence ?? 0, trust: relationship?.trust ?? 50, credibility: relationship?.credibility ?? 50, hasOpenPosition: true, communication: 70 })
      const answer = respondToRecruitingConcern(aiNegotiation.world, aiNegotiation.negotiation.id, topic, selectedResponse)
      expect(answer.ok).toBe(true)
      if (answer.ok) world = answer.world
    }
    world = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })

    const grayBaseline = world
    const gray = performRecruitingGrayAction(grayBaseline, cycle.id, recruit.id, selectedC, { tactic: 'unsupportedAllegation', targetProgramTeamId: selectedA, evidenceSource: 'unsupported' })
    expect(gray.ok).toBe(true)
    if (gray.ok) {
      const event = gray.value.recruitProfilesById[recruit.id]!.recruitingRpg!.negativeEvents!.at(-1)!
      expect(event.shortTermEffect).toBeGreaterThan(0)
      expect(event.legality).toBe('MISLEADING')
      expect(gray.value.recruitingInterests.find((item) => item.recruitId === recruit.id && item.programTeamId === selectedC)?.value).toBeGreaterThan(grayBaseline.recruitingInterests.find((item) => item.recruitId === recruit.id && item.programTeamId === selectedC)?.value ?? 0)
      expect(gray.value.recruitProfilesById[recruit.id]!.recruitingRpg!.relationships.find((item) => item.programTeamId === selectedC && item.actor === 'program')!.credibility).toBeLessThan(50)
      world = gray.value
    }

    const resolveVariant = (startingWorld: typeof world) => {
      let variant = startingWorld
      for (const teamId of [selectedA, selectedB, selectedC]) {
        const offer = makeRecruitingOffer(variant, cycle.id, recruit.id, teamId)
        expect(offer.ok, offer.ok ? undefined : offer.reason).toBe(true)
        if (offer.ok) variant = offer.value
      }
      return resolveRecruitingCommitments(updateGameWorld(variant, { recruitingCycles: Object.values(variant.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, rules: { ...item.rules, commitmentThreshold: -100 } } : item) }), cycle.id)
    }
    const cleanOutcome = resolveVariant(grayBaseline)
    const outcome = resolveVariant(world)
    world = outcome
    const aChoice = evaluateRecruitingChoice(world, world.recruitProfilesById[recruit.id]!, selectedA).value
    const bChoice = evaluateRecruitingChoice(world, world.recruitProfilesById[recruit.id]!, selectedB).value
    expect(aChoice).toBeDefined()
    expect(bChoice).toBeGreaterThan(aChoice)
    expect(outcome.recruitingCommitmentsById[`commitment:${cycle.id}:${recruit.id}`]?.programTeamId).toBe(selectedB)
    expect(outcome.recruitProfilesById[recruit.id]!.recruitingRpg!.negotiations?.find((item) => item.programTeamId === selectedB)?.terminalState).toBe('committed')
    expect(cleanOutcome.recruitingCommitmentsById[`commitment:${cycle.id}:${recruit.id}`]?.programTeamId).toBe(selectedB)
    expect(world.teams[selectedA]!.rosterPlayerIds.filter((playerId) => world.players[playerId]?.basketball.primaryPosition === candidatePosition).length).toBeGreaterThan(world.teams[selectedB]!.rosterPlayerIds.filter((playerId) => world.players[playerId]?.basketball.primaryPosition === candidatePosition).length)
    expect(teamB.id).toBe(selectedB)

    const sourceSeason = outcome.seasons[cycle.sourceSeasonId]!
    let signingYear = Math.max(Number(sourceSeason.startDate.slice(0, 4)), Number(outcome.currentDate.slice(0, 4)))
    const secondWednesdayOfNovember = (year: number) => {
      const days = Array.from({ length: 14 }, (_, index) => index + 1).filter((day) => new Date(Date.UTC(year, 10, day)).getUTCDay() === 3)
      return createGameDate(year, 11, days[1]!)
    }
    if (secondWednesdayOfNovember(signingYear) <= outcome.currentDate) signingYear += 1
    const readyToSign = updateGameWorld(outcome, {
      currentDate: secondWednesdayOfNovember(signingYear),
      recruitingCycles: Object.values(outcome.recruitingCyclesById).map((item) => item.id === cycle.id ? {
        ...item,
        calendar: recruitingRulesetForSeason('men', signingYear),
        institutionalSigningPolicies: [{ programTeamId: selectedB, seasonId: cycle.sourceSeasonId, finalAidSigningDate: createGameDate(signingYear + 1, 8, 1), provenance: 'SIMULATED_CARRY_FORWARD' as const, basedOnSeasonId: cycle.sourceSeasonId }],
      } : item),
    })
    const signed = signCommittedRecruit(readyToSign, cycle.id, recruit.id)
    expect(signed.ok, signed.ok ? undefined : signed.reason).toBe(true)
    if (!signed.ok) return
    expect(signed.value.recruitProfilesById[recruit.id]!.recruitingRpg!.negotiations?.find((item) => item.programTeamId === selectedB)?.terminalState).toBe('committed')
    const targetSeason = createSeason({ id: cycle.targetSeasonId as never, competitionId: competition.id, label: `${signingYear + 1}-${String(signingYear + 2).slice(-2)}`, startDate: createGameDate(signingYear + 1, 10, 1), endDate: createGameDate(signingYear + 2, 7, 31), participantTeamIds: competition.participantTeamIds })
    const arrived = arriveSignedRecruits(updateGameWorld(signed.value, { currentDate: createGameDate(signingYear + 1, 10, 15), currentSeasonId: cycle.targetSeasonId, seasons: [...Object.values(signed.value.seasons), targetSeason] }))
    expect(arrived.recruitProfilesById[recruit.id]!.status).toBe('arrived')
    expect(arrived.teams[selectedB]!.rosterPlayerIds.filter((playerId) => playerId === recruit.playerId)).toHaveLength(1)
  })
})
