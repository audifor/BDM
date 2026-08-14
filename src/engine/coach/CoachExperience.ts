import {
  createCoachRpgProfile,
  type CoachRpgProfile,
} from '@/domain/coachRpg'
import type { CoachId } from '@/domain/ids'
import {
  createStaffProfessionalProfile,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
  type StaffProfessionalAttributeKey,
  type StaffProfessionalProfile,
} from '@/domain/staff'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { calculateEffectiveCoachLearningCost } from './CoachSpecialization'

/** Only match experience is productive in 040.3; more sources can join later. */
export type CoachExperienceSourceKind = 'match'

export interface CoachExperienceGain {
  readonly byAttribute: Readonly<Partial<Record<StaffProfessionalAttributeKey, number>>>
  readonly globalDevelopmentProgress: number
}

export interface CoachExperienceApplication {
  readonly professionalProfile: StaffProfessionalProfile
  readonly rpgProfile: CoachRpgProfile
}

export interface CoachMatchExperienceContext {
  readonly ownStrength: number
  readonly opponentStrength: number
  readonly won: boolean
  readonly scoreMargin: number
}

export const COACH_DEVELOPMENT_POINT_PROGRESS_COST = 100

const MATCH_ATTRIBUTE_EXPERIENCE: Readonly<Partial<Record<StaffProfessionalAttributeKey, number>>> = {
  coaching: 0.8,
  tacticalKnowledge: 0.55,
  playerDevelopment: 0.05,
  analysis: 0.35,
  leadership: 0.2,
  communication: 0.1,
  motivation: 0.1,
  discipline: 0.05,
  adaptability: 0.2,
}
const MATCH_GLOBAL_DEVELOPMENT_PROGRESS = 1

export function createCoachExperienceGain(input: CoachExperienceGain): CoachExperienceGain {
  const byAttribute = input.byAttribute as Record<string, number>
  for (const [attribute, value] of Object.entries(byAttribute)) {
    if (!STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.includes(attribute as StaffProfessionalAttributeKey)) {
      throw new RangeError(`Invalid Coach experience attribute: ${attribute}`)
    }
    requireFiniteNonNegative(value, `Coach experience ${attribute}`)
  }
  requireFiniteNonNegative(input.globalDevelopmentProgress, 'Coach global development progress')
  return {
    byAttribute: { ...input.byAttribute },
    globalDevelopmentProgress: normalizeCoachExperience(input.globalDevelopmentProgress),
  }
}

/** Bootstrap cost curve. Future aptitude or learning traits may adjust this boundary. */
export function getCoachAttributeExperienceCost(currentAttributeValue: number): number {
  if (!Number.isInteger(currentAttributeValue) || currentAttributeValue < 0 || currentAttributeValue > 100) {
    throw new RangeError('Coach professional attribute must be an integer from 0 to 100')
  }
  return normalizeCoachExperience(20 + currentAttributeValue * currentAttributeValue * 0.12)
}

export function normalizeCoachExperience(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Coach experience must be finite')
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000
}

/**
 * The 040.3 ledger is available, consumable XP rather than lifetime history.
 * A later career-history system may add separate lifetime reporting if needed.
 */
export function applyCoachExperienceGain(
  professionalProfile: StaffProfessionalProfile,
  rpgProfile: CoachRpgProfile,
  gain: CoachExperienceGain,
): CoachExperienceApplication {
  const professional = createStaffProfessionalProfile(professionalProfile)
  const rpg = createCoachRpgProfile(rpgProfile)
  const validatedGain = createCoachExperienceGain(gain)
  const attributes = { ...professional.attributes }
  const experience = { ...rpg.professionalExperience.byAttribute }

  for (const attribute of STAFF_PROFESSIONAL_ATTRIBUTE_KEYS) {
    let available = normalizeCoachExperience(experience[attribute] + (validatedGain.byAttribute[attribute] ?? 0))
    let value = attributes[attribute]
    while (value < 100 && available >= calculateEffectiveCoachLearningCost(getCoachAttributeExperienceCost(value), rpg, attribute)) {
      available = normalizeCoachExperience(available - calculateEffectiveCoachLearningCost(getCoachAttributeExperienceCost(value), rpg, attribute))
      value += 1
    }
    attributes[attribute] = value
    experience[attribute] = available
  }

  const totalProgress = normalizeCoachExperience(rpg.development.globalProgress + validatedGain.globalDevelopmentProgress)
  const generatedPoints = Math.floor(totalProgress / COACH_DEVELOPMENT_POINT_PROGRESS_COST)
  const globalProgress = normalizeCoachExperience(totalProgress - generatedPoints * COACH_DEVELOPMENT_POINT_PROGRESS_COST)

  return {
    professionalProfile: createStaffProfessionalProfile({ attributes }),
    rpgProfile: createCoachRpgProfile({
      ...rpg,
      professionalExperience: { byAttribute: experience },
      development: {
        globalProgress,
        developmentPoints: rpg.development.developmentPoints + generatedPoints,
      },
    }),
  }
}

export function deriveCoachMatchExperienceGain(context: CoachMatchExperienceContext): CoachExperienceGain {
  requirePositiveFinite(context.ownStrength, 'Own Team strength')
  requirePositiveFinite(context.opponentStrength, 'Opponent Team strength')
  if (!Number.isInteger(context.scoreMargin) || context.scoreMargin < 0) {
    throw new RangeError('Match score margin must be a non-negative integer')
  }

  const difficulty = clamp(context.opponentStrength / context.ownStrength, 0.75, 1.35)
  const result = context.won ? 1.05 : 1
  const closeness = getMatchClosenessFactor(context.scoreMargin)
  const generalFactor = difficulty * result * closeness
  const adaptabilityFactor = generalFactor * (context.scoreMargin <= 5 ? 1.25 : 1)

  return createCoachExperienceGain({
    byAttribute: Object.fromEntries(
      Object.entries(MATCH_ATTRIBUTE_EXPERIENCE).map(([attribute, base]) => [
        attribute,
        normalizeCoachExperience(base! * (attribute === 'adaptability' ? adaptabilityFactor : generalFactor)),
      ]),
    ) as Partial<Record<StaffProfessionalAttributeKey, number>>,
    globalDevelopmentProgress: normalizeCoachExperience(MATCH_GLOBAL_DEVELOPMENT_PROGRESS * generalFactor),
  })
}

/** Returns the original world unchanged for legacy saves whose 040.5 profiles are absent. */
export function applyCoachExperienceToWorld(world: GameWorld, coachId: CoachId, gain: CoachExperienceGain): GameWorld {
  const professional = world.coachProfessionalProfilesByCoachId[coachId]
  const rpg = world.coachRpgProfilesByCoachId[coachId]
  if (professional === undefined || rpg === undefined) return world

  const applied = applyCoachExperienceGain(professional, rpg, gain)
  return rebuildWorld(world, {
    ...world.coachProfessionalProfilesByCoachId,
    [coachId]: applied.professionalProfile,
  }, {
    ...world.coachRpgProfilesByCoachId,
    [coachId]: applied.rpgProfile,
  })
}

function rebuildWorld(
  world: GameWorld,
  professionalProfiles: GameWorld['coachProfessionalProfilesByCoachId'],
  rpgProfiles: GameWorld['coachRpgProfilesByCoachId'],
): GameWorld {
  return createGameWorld({
    currentDate: world.currentDate, currentSeasonId: world.currentSeasonId, userCoachId: world.userCoachId,
    countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), competitions: Object.values(world.competitions), seasons: Object.values(world.seasons), games: Object.values(world.games), matchStatLogs: Object.values(world.matchStatLogsByGameId), seasonHistory: Object.values(world.seasonHistoryBySeasonId), injuries: Object.values(world.injuriesById), contracts: Object.values(world.contractsById), teamFinances: Object.values(world.teamFinancesByTeamId), playerTransactions: Object.values(world.playerTransactionsById), playerKnowledge: Object.values(world.playerKnowledgeById), staffPeople: Object.values(world.staffPeopleById), teamStaffAssignments: Object.values(world.teamStaffAssignmentsById), coachProfessionalProfilesByCoachId: professionalProfiles, coachRpgProfilesByCoachId: rpgProfiles, coachReputationProfilesByCoachId: world.coachReputationProfilesByCoachId, coachEmploymentByCoachId: world.coachEmploymentByCoachId, coachCareerHistoryByCoachId: world.coachCareerHistoryByCoachId, coachJobOpeningsById: world.coachJobOpeningsById, coachJobCandidaciesById: world.coachJobCandidaciesById, coachInterviewsByCandidacyId: world.coachInterviewsByCandidacyId, coachJobOffersById: world.coachJobOffersById, relationshipsByKey: world.relationshipsByKey,
  })
}

function getMatchClosenessFactor(margin: number): number { if (margin <= 5) return 1.15; if (margin <= 10) return 1.08; if (margin <= 20) return 1; return 0.92 }
function requireFiniteNonNegative(value: number, name: string): void { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`) }
function requirePositiveFinite(value: number, name: string): void { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`) }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)) }
