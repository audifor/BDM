import { applyUserCoachForJob, createCoachJobOpeningForTeam } from '@/app/coachCareer/CoachCareerService'
import { addDays } from '@/domain/date'
import { createGame } from '@/domain/game'
import { injuryIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { updateGameWorld, validateGameWorld, type GameWorld } from '@/domain/world'
import { getScheduledGamesToday, getUserTeam } from '@/engine/calendar'
import { createPreMatchMediaOpportunity } from '@/engine/media/MediaEngine'
import { bootstrap } from './M0Support'

/** SETUP only: a supported starter vacancy, then the real application/interview/offer flow. */
export function offerScenario() {
  const base = bootstrap([1])
  const vacant = Object.values(base.teams).find(team => team.coachId === undefined)!
  const opened = createCoachJobOpeningForTeam(base, { teamId: vacant.id })
  const applied = applyUserCoachForJob(opened.world, opened.opening.id)
  validateGameWorld(applied.world)
  return { world: applied.world, offer: Object.values(applied.world.coachJobOffersById).find(offer => offer.status === 'pending')!, candidacyId: applied.candidacyId }
}

/** SETUP only: valid important fixture through the Domain factory, then normal media creation. */
export function withMedia(world: GameWorld) {
  const user = getUserTeam(world)!
  const game = getScheduledGamesToday(world).find(game => [game.homeTeamId, game.awayTeamId].includes(user.id))!
  const staged = updateGameWorld(world, { games: Object.values(world.games).map(item => item.id === game.id ? createGame({ ...item, stakes: 'important' }) : item) })
  const prepared = createPreMatchMediaOpportunity(staged, game.id)
  validateGameWorld(prepared)
  return { world: prepared, opportunity: Object.values(prepared.mediaOpportunitiesById).find(item => item.status === 'pending')! }
}

/** SETUP only: existing RTP test-factory pattern, valid historical injury with review due today. */
export function withDueInjury(world: GameWorld) {
  const injury = createInjury({ id: injuryIdFromString('m0-rtp-due'), playerId: getUserTeam(world)!.rosterPlayerIds[0]!,
    kind: 'ankleSprain', severity: 'minor', injuredOn: addDays(world.currentDate, -10), expectedReturnDate: world.currentDate })
  const prepared = updateGameWorld(world, { injuries: [injury] })
  validateGameWorld(prepared)
  return prepared
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
