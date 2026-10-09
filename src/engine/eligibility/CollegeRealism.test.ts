import { describe, expect, it } from 'vitest'
import { createNcaaSimulatedGame } from '@/app/game/createNcaaSimulatedGame'
import { addDays, addYears } from '@/domain/date'
import { createAthleticsAidAgreement, createSettlementBenefitsAgreement } from '@/domain/collegeCompensation'
import { createGame } from '@/domain/game'
import { updateGameWorld } from '@/domain/world'
import { evaluateRecruitingChoice } from '@/engine/recruiting/RecruitingEngine'
import { assessCollegeContinuation } from './CollegeContinuationAssessment'
import { basketballTransferWindow } from '@/domain/eligibility'
import { submitTransferNotice } from './TransferPortalLifecycle'

describe('College career realism', () => {
  it('lets trust and aid support a stay while damaged trust and coaching change support a real Portal notice', () => {
    const base = createNcaaSimulatedGame()
    const season = base.seasons[base.currentSeasonId]!
    const competition = base.competitions[season.competitionId]!
    const team = base.teams[competition.participantTeamIds[0]!]!
    const [stayer, leaver] = team.rosterPlayerIds
    const final = Object.values(base.games).find((game) => game.seasonId === season.id && game.stakes === 'final')!
    const date = addDays(final.date, 1)
    const profile = (playerId: typeof stayer, trust: number, coachId: string) => ({ id: `realism:${playerId}`, playerId: playerId!, cycleId: 'realism', origin: 'preCollege' as const, position: base.players[playerId!]!.basketball.primaryPosition, publicRank: 1, positionRank: 1, tier: 'rotation' as const, preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'arrived' as const, recruitingRpg: { preferenceProfile: { importance: { playingTime: 5, roleClarity: 5, coachTrust: 5, familyTrust: 5, development: 5, winning: 5, prestige: 5, distance: 5, academics: 5, professionalPathway: 5, internationalSupport: 5 }, compensationSecurityImportance: 5, dealbreakers: [], decisionStyle: 'loyal' as const }, intel: [], relationships: [{ programTeamId: team.id, actor: 'headCoach' as const, actorId: coachId, familiarity: 50, rapport: 50, trust, credibility: trust, updatedOn: date }], stakeholders: [], promises: [], story: [] } })
    const aid = createAthleticsAidAgreement({ id: 'realism:stay-aid', playerId: stayer!, teamId: team.id, institutionId: team.organizationId, academicPeriod: season.label, valueMinorUnits: 200_000, effectiveFrom: season.startDate, effectiveTo: season.endDate, offeredOn: season.startDate, signedOn: season.startDate, status: 'signed', provenance: 'institutional-aid', history: [] })
    const world = updateGameWorld(base, { currentDate: date, games: Object.values(base.games).map((game) => game.id === final.id ? createGame({ ...game, status: 'completed', result: { homeScore: 70, awayScore: 68 } }) : game), recruitProfiles: [profile(stayer, 90, team.coachId!), profile(leaver, 20, 'former-head-coach')], athleticsAidAgreements: [aid] })
    const stay = assessCollegeContinuation(world, stayer!, team.id, season.id)!
    const leave = assessCollegeContinuation(world, leaver!, team.id, season.id)!
    expect(stay.stayPressure).toBeGreaterThan(stay.leavePressure)
    expect(leave.leavePressure).toBeGreaterThan(leave.stayPressure)
    const ruleset = Object.values(world.transferPortalRulesetsById).find((item) => item.ecosystemId === competition.ecosystemId)!
    expect(submitTransferNotice(world, { id: 'realism:leave-notice', playerId: leaver!, sourceTeamId: team.id, ecosystemId: competition.ecosystemId, rulesetId: ruleset.id }, basketballTransferWindow(final.date, ruleset))).toMatchObject({ ok: true })
  })

  it('allows prestige, role and trust, or legal compensation to lead for different Player priorities', () => {
    const base = createNcaaSimulatedGame()
    const season = base.seasons[base.currentSeasonId]!
    const competition = base.competitions[season.competitionId]!
    const [sourceId, prestigeId, roleId, moneyId] = competition.participantTeamIds
    const playerId = base.teams[sourceId!]!.rosterPlayerIds[0]!
    const date = base.currentDate
    const importance = { playingTime: 1, roleClarity: 1, coachTrust: 1, familyTrust: 1, development: 1, winning: 1, prestige: 1, distance: 1, academics: 1, professionalPathway: 1, internationalSupport: 1 }
    const relationships = [[prestigeId!, 30], [roleId!, 100], [moneyId!, 20]] as const
    const profile = { id: 'realism:recruit', playerId, cycleId: 'realism', origin: 'preCollege' as const, position: base.players[playerId]!.basketball.primaryPosition, publicRank: 1, positionRank: 1, tier: 'rotation' as const, preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'open' as const, recruitingRpg: { preferenceProfile: { importance, compensationSecurityImportance: 1, dealbreakers: [], decisionStyle: 'deliberate' as const }, intel: [], relationships: relationships.map(([programTeamId, trust]) => ({ programTeamId, actor: 'headCoach' as const, familiarity: 60, rapport: 60, trust, credibility: trust, updatedOn: date })), stakeholders: [], promises: [], story: [] } }
    const cap = Object.values(base.institutionBenefitsCapsById).find((item) => item.institutionId === base.teams[moneyId!]!.organizationId && item.status === 'open')!
    const moneyOffer = createSettlementBenefitsAgreement({ id: 'realism:legal-money', playerId, teamId: moneyId!, institutionId: base.teams[moneyId!]!.organizationId, capYear: cap.capYear, valueMinorUnits: 500_000, effectiveFrom: date, effectiveTo: addYears(date, 1), status: 'draft', reportingStatus: 'notSigned', provenance: 'institutional-offer' })
    const game = createGame({ id: 'realism:prestige-win' as never, seasonId: season.id, competitionId: competition.id, date, homeTeamId: prestigeId!, awayTeamId: sourceId!, status: 'completed', result: { homeScore: 90, awayScore: 60 } })
    const world = updateGameWorld(base, { games: [...Object.values(base.games), game], recruitProfiles: [profile], settlementBenefitsAgreements: [moneyOffer] })
    const roleProfile = { ...profile, recruitingRpg: { ...profile.recruitingRpg, preferenceProfile: { ...profile.recruitingRpg.preferenceProfile, importance: { ...importance, playingTime: 10, roleClarity: 10, coachTrust: 10, prestige: 1 }, compensationSecurityImportance: 1 } } }
    const moneyProfile = { ...profile, recruitingRpg: { ...profile.recruitingRpg, preferenceProfile: { ...profile.recruitingRpg.preferenceProfile, importance, compensationSecurityImportance: 10 } } }
    const prestigeProfile = { ...profile, recruitingRpg: { ...profile.recruitingRpg, preferenceProfile: { ...profile.recruitingRpg.preferenceProfile, importance: { ...importance, prestige: 10, winning: 10, coachTrust: 1 }, compensationSecurityImportance: 0 } } }
    expect(evaluateRecruitingChoice(world, roleProfile, roleId!).value).toBeGreaterThan(evaluateRecruitingChoice(world, roleProfile, moneyId!).value)
    expect(evaluateRecruitingChoice(world, moneyProfile, moneyId!).value).toBeGreaterThan(evaluateRecruitingChoice(world, moneyProfile, roleId!).value)
    expect(evaluateRecruitingChoice(world, prestigeProfile, prestigeId!).value).toBeGreaterThan(evaluateRecruitingChoice(world, prestigeProfile, roleId!).value)
  })
})
