import { describe, expect, it } from 'vitest'
import { createNcaaSimulatedGame } from '@/app/game/createNcaaSimulatedGame'
import { addDays } from '@/domain/date'
import { createGame } from '@/domain/game'
import { availableInstitutionBenefitsRoom, createInstitutionBenefitsCap, createSettlementBenefitsAgreement } from '@/domain/collegeCompensation'
import { updateGameWorld } from '@/domain/world'
import { createSeason } from '@/domain/season'
import { ensureTransferPortalRuleset } from './TransferPortalRulesLifecycle'
import { ensureInstitutionBenefitsCaps, signInstitutionBenefits } from './CollegeCompensationEngine'
import { ensureNcaaSportBudgets } from '@/engine/enforcement/EnforcementRemedies'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { calculateStandings } from '@/engine/competition/standings'
import { runCollegeRosterContinuationAndTransferAI } from './CollegeTransferAI'
import { completeCollegeTransfer } from '@/engine/recruiting/RecruitingEngine'
import { assessCollegeEligibility, ensureNcaaEligibility } from './EligibilityEngine'
import { assignAcademicSupport, resolveAcademicTerm } from '@/engine/academic'

describe('College transfer AI', () => {
  it.each([false, true])('runs canonical AI transfer lifecycle in %s future season', (future) => {
    let initial = createNcaaSimulatedGame()
    if (future) {
      const prior = initial.seasons[initial.currentSeasonId]!
      const priorCycle = Object.values(initial.recruitingCyclesById).find((item) => item.sourceSeasonId === prior.id && initial.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')!
      const futureSeason = createSeason({ ...prior, id: `${prior.id}:2045-46` as never, label: '2045-46', startDate: '2045-10-01' as never, endDate: '2046-05-15' as never })
      const priorFinal = Object.values(initial.games).find((game) => game.seasonId === prior.id && game.stakes === 'final')!
      const futureFinal = createGame({ ...priorFinal, id: `${priorFinal.id}:2045-46` as never, seasonId: futureSeason.id, date: '2046-03-30' as never, status: 'scheduled', result: null })
      initial = updateGameWorld(initial, { currentDate: '2046-03-31' as never, currentSeasonId: futureSeason.id, seasons: [...Object.values(initial.seasons), futureSeason], games: [...Object.values(initial.games), futureFinal], recruitingCycles: [...Object.values(initial.recruitingCyclesById), { ...priorCycle, id: `${priorCycle.id}:2045-46`, sourceSeasonId: futureSeason.id, targetSeasonId: `${futureSeason.id}:next` as never, opensOn: '2045-10-01' as never, signingOn: '2046-06-01' as never, closesOn: '2046-08-01' as never, status: 'open' as const }] })
      initial = ensureNcaaEligibility(ensureNcaaSportBudgets(ensureInstitutionBenefitsCaps(ensureTransferPortalRuleset(initial, futureSeason.id))))
    }
    const cycle = Object.values(initial.recruitingCyclesById).find((item) => item.sourceSeasonId === initial.currentSeasonId && initial.ecosystems[item.ecosystemId]?.kind === 'ncaaLike' && initial.ecosystems[item.ecosystemId]?.category === 'men')!
    const season = initial.seasons[cycle.sourceSeasonId]!
    const competition = initial.competitions[season.competitionId]!
    const source = competition.participantTeamIds.map((id) => initial.teams[id]!).find((team) => team.coachId !== initial.userCoachId && team.rosterPlayerIds.length > 0)!
    const playerId = source.rosterPlayerIds.find(id => assessCollegeEligibility(initial, { playerId: id, teamId: source.id, ecosystemId: cycle.ecosystemId })?.eligible)!
    const final = Object.values(initial.games).find((game) => game.seasonId === season.id && game.stakes === 'final')!
    const date = addDays(final.date, 1)
    const profile = {
      id: 'ai-continuation-source', playerId, cycleId: cycle.id, origin: 'preCollege' as const, position: initial.players[playerId]!.basketball.primaryPosition,
      publicRank: 1, positionRank: 1, tier: 'rotation' as const, preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'arrived' as const,
      recruitingRpg: { preferenceProfile: { importance: { playingTime: 5, roleClarity: 5, coachTrust: 5, familyTrust: 5, development: 5, winning: 5, prestige: 5, distance: 5, academics: 5, professionalPathway: 5, internationalSupport: 5 }, compensationSecurityImportance: 5, dealbreakers: [], decisionStyle: 'early' as const }, intel: [], relationships: [{ programTeamId: source.id, actor: 'headCoach' as const, actorId: 'departed-coach', familiarity: 50, rapport: 20, trust: 20, credibility: 20, updatedOn: date }], stakeholders: [], promises: [], story: [] },
    }
    const capYear = `${Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0)}-${String((Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) < 7 ? 0 : 1)) % 100).padStart(2, '0')}`
    const caps = competition.participantTeamIds.map((teamId) => {
      const institutionId = initial.teams[teamId]!.organizationId
      return createInstitutionBenefitsCap({ id: `cap:${institutionId}:${capYear}`, institutionId, capYear, annualCapMinorUnits: 300_000, currencyCode: 'USD', version: 'simulated-test', ...(future ? { provenance: 'SIMULATED_CARRY_FORWARD', basedOnCapId: `cap:${institutionId}:2044-45` } as const : { provenance: 'OFFICIAL_SOURCE', source: 'fixture' } as const), carryAdjustmentMinorUnits: 0, otherCommitmentsMinorUnits: 0 })
    })
    const world = updateGameWorld(initial, {
      currentDate: date,
      games: Object.values(initial.games).map((game) => game.id === final.id ? createGame({ ...game, status: 'completed', result: { homeScore: 70, awayScore: 68 } }) : game),
      recruitProfiles: [...Object.values(initial.recruitProfilesById), profile],
      institutionBenefitsCaps: [...Object.values(initial.institutionBenefitsCapsById).filter((item) => item.capYear !== capYear), ...caps],
      recruitingCycles: Object.values(initial.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status: 'open' as const, rules: { ...item.rules, commitmentThreshold: -100 } } : item),
    })
    const progressed = runCollegeRosterContinuationAndTransferAI(world, cycle.id)
    if (!future) {
      const hiddenChanged = updateGameWorld(world, { players: Object.values(world.players).map((player) => player.id === playerId ? { ...player, basketball: { ...player.basketball, ratings: { ...player.basketball.ratings, threePointShooting: 100, passing: 100 } } } : player) })
      const sameDecision = runCollegeRosterContinuationAndTransferAI(hiddenChanged, cycle.id)
      expect(sameDecision.transferPortalEntriesById[`ai-portal:${cycle.id}:${playerId}`]?.destinationTeamId).toBe(progressed.transferPortalEntriesById[`ai-portal:${cycle.id}:${playerId}`]?.destinationTeamId)
    }
    const entry = progressed.transferPortalEntriesById[`ai-portal:${cycle.id}:${playerId}`]
    expect(progressed.settlementBenefitsAgreementsById[`ai-retention:${cycle.id}:${playerId}`]?.status).toBe('signed')
    const sourceCap = progressed.institutionBenefitsCapsById[`cap:${source.organizationId}:${capYear}`]!
    expect(availableInstitutionBenefitsRoom(sourceCap, Object.values(progressed.settlementBenefitsAgreementsById))).toBe(50_000)
    const alternativeTransferOffer = createSettlementBenefitsAgreement({ id: 'ai-cap-choice:large-transfer', playerId: competition.participantTeamIds.map((id) => progressed.teams[id]!).find((item) => item.id !== source.id && item.rosterPlayerIds.length > 0)!.rosterPlayerIds[0]!, teamId: source.id, institutionId: source.organizationId, capYear, valueMinorUnits: 150_000, effectiveFrom: date, effectiveTo: season.endDate, status: 'draft', reportingStatus: 'notSigned', provenance: 'CAP_CHOICE_SCENARIO' })
    expect(signInstitutionBenefits(progressed, alternativeTransferOffer)).toMatchObject({ ok: false, reason: 'CAP_EXCEEDED' })
    const movement = completeCollegeTransfer(progressed, `transfer-recruit:${entry!.id}`)
    expect(entry?.status, movement.ok ? undefined : movement.reason).toBe('completed')
    expect(entry?.movement?.playerId).toBe(playerId)
    expect(progressed.players[playerId]).toEqual(initial.players[playerId])
    expect(progressed.recruitSigningsById[`signing:${cycle.id}:transfer-recruit:${entry?.id}`]).toBeDefined()
    if (future) {
      expect(progressed.transferPortalRulesetsById[`transfer:${cycle.ecosystemId}:${season.id}`]?.provenance).toBe('SIMULATED_CARRY_FORWARD')
      expect(Object.values(progressed.institutionBenefitsCapsById).find((item) => item.capYear === '2045-46' && item.institutionId === source.organizationId)?.provenance).toBe('SIMULATED_CARRY_FORWARD')
      expect(Object.values(progressed.collegeRulesetsById).some((item) => item.ecosystemId === cycle.ecosystemId)).toBe(true)
    }
    const destinationId = entry!.destinationTeamId!
    const transferProfile = progressed.recruitProfilesById[`transfer-recruit:${entry!.id}`]!
    expect(transferProfile.recruitingRpg?.negotiations?.some((item) => item.programTeamId === destinationId)).toBe(true)
    expect(transferProfile.recruitingRpg?.promises.some((item) => item.programTeamId === destinationId)).toBe(true)
    expect(progressed.athleticsAidAgreementsById[`ai-transfer-aid:${cycle.id}:${playerId}:${destinationId}`]?.status).toBe('signed')
    expect(progressed.settlementBenefitsAgreementsById[`ai-transfer-benefits:${cycle.id}:${playerId}:${destinationId}`]?.status).toBe('signed')
    expect(progressed.settlementBenefitsAgreementsById[`ai-transfer-benefits:${cycle.id}:${playerId}:${destinationId}`]?.financeTransactionId).toBeDefined()
    const standings = future ? calculateStandings(progressed, season.id) : []
    const saveable = future ? updateGameWorld(progressed, { seasonHistory: [...Object.values(progressed.seasonHistoryBySeasonId), { seasonId: season.id, competitionId: competition.id, completedOn: final.date, championTeamId: standings[0]!.teamId, finalStandings: standings }] }) : progressed
    const restored = deserializeGameWorldV4(serializeGameWorldV4(saveable, `${future ? '2046' : '2033'}-04-01T00:00:00.000Z`))
    expect(restored.transferPortalEntriesById[entry!.id]?.movement).toEqual(entry!.movement)
    expect(restored.settlementBenefitsAgreementsById[`ai-transfer-benefits:${cycle.id}:${playerId}:${destinationId}`]?.financeTransactionId).toBe(progressed.settlementBenefitsAgreementsById[`ai-transfer-benefits:${cycle.id}:${playerId}:${destinationId}`]?.financeTransactionId)
    expect(runCollegeRosterContinuationAndTransferAI(restored, cycle.id)).toBe(restored)
    expect(runCollegeRosterContinuationAndTransferAI(progressed, cycle.id)).toBe(progressed)
    const supportTerm = `portal-academic:${future}`
    const supported = assignAcademicSupport(restored, playerId, supportTerm, 'tutoring')
    expect(supported.ok).toBe(true)
    if (!supported.ok) throw new Error(supported.reason)
    expect(supported.value.academicSupportPlansById[`academic-support:${supportTerm}:${playerId}`]!.programTeamId).toBe(destinationId)
    const oldAcademic = Object.values(restored.academicProfilesById).find(item => item.playerId === playerId && item.programTeamId === source.id)!
    const destinationAcademic = Object.values(restored.academicProfilesById).find(item => item.playerId === playerId && item.programTeamId === destinationId)!
    const termWorld = resolveAcademicTerm(supported.value, supportTerm)
    expect(termWorld.academicProfilesById[oldAcademic.id]).toEqual(oldAcademic)
    expect(termWorld.academicProfilesById[destinationAcademic.id]!.performance).toBe(Math.min(100, destinationAcademic.performance + 5))
    expect(Object.values(termWorld.academicTermRecordsById).filter(item => item.playerId === playerId && item.termId === supportTerm)).toHaveLength(1)
  }, 30_000)
})
