import { beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getRecruitingPlanningRoster, getTeamRecruitingNeeds, rankAiRecruitingTargets } from './RecruitingEngine'
import { teamIdFromString } from '@/domain/ids'
import { getRecruitingRoleOpportunity } from './RecruitingRosterPlanning'
import { openAiRecruitingNegotiation, respondToRecruitingConcern } from './RecruitingNegotiationEngine'
import { selectAiNegotiationResponse } from './RecruitingEngine'
import { recruitingRulesetForSeason } from '@/domain/recruiting'

let beforeDepartures: GameWorld | undefined
beforeAll(() => {
  const path = process.env.BS15I_REPLACEMENT_REPRO_SAVE
  if (path) beforeDepartures = deserializeGameWorldV4(JSON.parse(readFileSync(path, 'utf8')))
}, 30_000)

it('plans the incoming class for actual exposed upperclassmen without moving or retaining them', () => {
  if (!beforeDepartures) return
  const world = beforeDepartures
  const teamId = teamIdFromString('generated-team-0018')
  const cycle = Object.values(world.recruitingCyclesById).find(item => item.id === 'recruiting:generated-ecosystem-0003:generated-season-0019')!
  const roster = getRecruitingPlanningRoster(world, teamId, cycle.id)
  const actual = world.teams[teamId]!.rosterPlayerIds
  expect(roster.length, JSON.stringify({ actual, roster, needs: getTeamRecruitingNeeds(world, teamId, cycle.id) })).toBeLessThan(actual.length)
  expect(actual).toContain('generated-player-0208')
  expect(actual).toContain('generated-player-0210')
  expect(actual).toContain('generated-player-0211')
  expect(['generated-player-0208', 'generated-player-0210', 'generated-player-0211'].some(id => !roster.includes(id as never))).toBe(true)
  expect(getRecruitingPlanningRoster(world, teamId)).toBe(actual)
  expect(getTeamRecruitingNeeds(world, teamId, cycle.id)).not.toEqual(getTeamRecruitingNeeds(world, teamId))
  expect(world.teams[teamId]!.rosterPlayerIds).toBe(actual)
  const changed = updateGameWorld(world, { players: Object.values(world.players).map(player => !actual.includes(player.id) ? player : { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map(key => [key, 1])) as typeof player.basketball.ratings } }) })
  expect(getRecruitingPlanningRoster(changed, teamId, cycle.id)).toEqual(roster)
  expect(rankAiRecruitingTargets(changed, cycle.id, teamId).map(item => item.id)).toEqual(rankAiRecruitingTargets(world, cycle.id, teamId).map(item => item.id))
  process.stdout.write(`[turnover planning] ${JSON.stringify({ date: world.currentDate, teamId, cycleId: cycle.id, actual, forecast: roster, currentNeeds: getTeamRecruitingNeeds(world, teamId), incomingNeeds: getTeamRecruitingNeeds(world, teamId, cycle.id) })}\n`)
}, 60_000)

it('keeps the two accepted prefix years unchanged before any automatic Draft exposure', () => {
  const prefix = process.env.BS15I_REPLACEMENT_PREFIX
  if (!prefix) return
  for (const year of [2033, 2034]) {
    const world = deserializeGameWorldV4(JSON.parse(readFileSync(`${prefix}.${year}-10-01.json`, 'utf8')))
    for (const cycle of Object.values(world.recruitingCyclesById).filter(item => item.opensOn <= world.currentDate)) {
      for (const team of Object.values(world.teams).filter(item => Object.values(world.competitions).some(competition => competition.ecosystemId === cycle.ecosystemId && competition.participantTeamIds.includes(item.id)))) {
        expect(getRecruitingPlanningRoster(world, team.id, cycle.id)).toEqual(team.rosterPlayerIds)
      }
    }
  }
}, 60_000)

it('uses the same incoming role context when a low-confidence known concern receives a factual reply', () => {
  if (!beforeDepartures) return
  const teamId = teamIdFromString('generated-team-0018')
  const cycleId = 'recruiting:generated-ecosystem-0003:generated-season-0019'
  const recruitId = Object.values(beforeDepartures.recruitProfilesById).find(profile => profile.cycleId === cycleId && profile.position === 'C' && profile.status === 'open')!.id
  const date = beforeDepartures.currentDate
  const world = updateGameWorld(beforeDepartures, {
    currentDate: date,
    // A lawful open correspondence fixture at the saved date, without rewinding
    // the world's later materializations or supplying any signing outcome.
    recruitingCycles: Object.values(beforeDepartures.recruitingCyclesById).map(cycle => cycle.id === cycleId ? { ...cycle, status: 'open', calendar: recruitingRulesetForSeason('men', 2035) } : cycle),
    recruitProfiles: Object.values(beforeDepartures.recruitProfilesById).map(item => item.id === recruitId ? { ...item, status: 'open', recruitingRpg: { ...item.recruitingRpg!, negotiations: [], intel: [{ programTeamId: teamId, beliefs: { playingTime: 'high' }, confidence: 15, discoveredOn: date, sources: ['direct contact'] }] } } : item),
  })
  const current = world.recruitProfilesById[recruitId]!
  expect(getRecruitingRoleOpportunity(world, current, teamId)).toBeGreaterThanOrEqual(54)
  expect(getRecruitingRoleOpportunity(world, { ...current, origin: 'transfer' }, teamId)).toBeLessThan(54)
  const opened = openAiRecruitingNegotiation(world, cycleId, recruitId, teamId)
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  const topic = opened.negotiation.unresolvedTopics[0]!
  const kind = selectAiNegotiationResponse({ cycleId, recruitId, programTeamId: teamId, date, topic, intelConfidence: 15, trust: 50, credibility: 50, hasOpenPosition: true, communication: 50 })
  expect(kind).toBe('factualReassurance')
  const replied = respondToRecruitingConcern(opened.world, opened.negotiation.id, topic, kind)
  expect(replied.ok).toBe(true)
  if (!replied.ok) return
  expect(replied.negotiation.programResponses.at(-1)!.response).toBe('receptive')
  expect(replied.negotiation.resolvedTopics).toContain(topic)
}, 60_000)
