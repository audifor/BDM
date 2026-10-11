import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import type { RecruitProfile } from '@/domain/recruiting'

/** Bounded input scenario: existing Player, supplied recruiting memory, unchanged rules/resources. */
export function establishPortalContinuationScenario(world: GameWorld): GameWorld {
  const id = 'pathway-scenario:continuation-memory'
  if (world.recruitProfilesById[id] !== undefined || world.currentDate < '2033-01-20') return world
  const cycle = Object.values(world.recruitingCyclesById).find(item => item.status === 'open' && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike' && world.ecosystems[item.ecosystemId]?.category === 'men')
  if (!cycle || !Object.values(world.recruitProfilesById).some(profile => profile.cycleId === cycle.id)) return world
  const season = world.seasons[cycle.sourceSeasonId]!, competition = world.competitions[season.competitionId]!
  const source = world.teams[competition.participantTeamIds[0]!]!, destination = world.teams[competition.participantTeamIds[1]!]!
  const playerId = source.rosterPlayerIds[0]!
  const player = world.players[playerId]!
  const profile: RecruitProfile = {
    id, playerId, cycleId: cycle.id, origin: 'preCollege', position: player.basketball.primaryPosition, publicRank: 1, positionRank: 1, tier: 'rotation', preferences: { opportunity: 10, development: 5, competing: 5, coach: 10 }, status: 'arrived',
    recruitingRpg: {
      preferenceProfile: { importance: { playingTime: 10, roleClarity: 10, coachTrust: 10, familyTrust: 5, development: 5, winning: 5, prestige: 5, distance: 5, academics: 5, professionalPathway: 5, internationalSupport: 5 }, compensationSecurityImportance: 1, dealbreakers: [], decisionStyle: 'early' },
      intel: [], relationships: [
        { programTeamId: source.id, actor: 'headCoach', actorId: destination.coachId, familiarity: 80, rapport: 20, trust: 20, credibility: 20, updatedOn: world.currentDate },
        { programTeamId: destination.id, actor: 'headCoach', actorId: destination.coachId, familiarity: 80, rapport: 85, trust: 85, credibility: 85, updatedOn: world.currentDate },
      ], stakeholders: [], promises: [{ id: 'pathway-scenario:broken-role', programTeamId: source.id, topic: 'role', strength: 'explicit', detail: 'Previously assessed role assurance was not fulfilled.', madeOn: world.currentDate, fulfilled: false }], story: [`${world.currentDate}: certification imports an existing college Player's previously assessed broken role promise, low-trust relationship with the prior recruiting Coach and a known alternative Coach. No transfer outcome is supplied.`],
    },
  }
  return updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById), profile] })
}
