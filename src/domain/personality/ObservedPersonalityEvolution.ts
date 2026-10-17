import { createPersonality, hasFullSemanticPersonality, type Personality } from './Personality'
import type { GameDate } from '@/domain/date'
import type { MoraleEvent } from '@/domain/morale'

/** Exact observed-event kind/dimension mapping from WorldDB PERSON-23H.
 * These are allowed event kinds, NOT claims about someone's biography.
 * The real source event must be committed to BDM's morale-event ledger first.
 */
export const OBSERVED_PERSONALITY_RULES = [
  {
    "code": "LIFE_ROTATION_PROMOTION",
    "kind": "ROTATION_PROMOTION",
    "family": "COURT",
    "dimension": "competitiveness",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_ROTATION_REDUCTION",
    "kind": "ROTATION_REDUCTION",
    "family": "COURT",
    "dimension": "frustrationTolerance",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_STARTER_DEBUT",
    "kind": "STARTER_DEBUT",
    "family": "COURT",
    "dimension": "socialConfidence",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_BENCHING_STREAK",
    "kind": "BENCHING_STREAK",
    "family": "COURT",
    "dimension": "resilience",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_ROLE_CHANGE",
    "kind": "ROLE_CHANGE",
    "family": "COURT",
    "dimension": "adaptability",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_POSITION_RETRAINING",
    "kind": "POSITION_RETRAINING",
    "family": "COURT",
    "dimension": "curiosity",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_MATCH_WINNING_SHOT",
    "kind": "MATCH_WINNING_SHOT",
    "family": "COURT",
    "dimension": "composure",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_CLOSE_GAME_MISTAKE",
    "kind": "CLOSE_GAME_MISTAKE",
    "family": "COURT",
    "dimension": "accountability",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_DEFENSIVE_BREAKTHROUGH",
    "kind": "DEFENSIVE_BREAKTHROUGH",
    "family": "COURT",
    "dimension": "achievementDrive",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_SCORING_BREAKTHROUGH",
    "kind": "SCORING_BREAKTHROUGH",
    "family": "COURT",
    "dimension": "goalFocus",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_SEASON_BEST_PERFORMANCE",
    "kind": "SEASON_BEST_PERFORMANCE",
    "family": "COURT",
    "dimension": "recognitionNeed",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_PLAYOFF_EXIT",
    "kind": "PLAYOFF_EXIT",
    "family": "COURT",
    "dimension": "resilience",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_CHAMPIONSHIP_WIN",
    "kind": "CHAMPIONSHIP_WIN",
    "family": "COURT",
    "dimension": "teamOrientation",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_TRAINING_BREAKTHROUGH",
    "kind": "TRAINING_BREAKTHROUGH",
    "family": "COURT",
    "dimension": "workEthic",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_TACTICAL_ROLE_CONFLICT",
    "kind": "TACTICAL_ROLE_CONFLICT",
    "family": "COURT",
    "dimension": "coachability",
    "minAge": 15,
    "sources": [
      "matchResult",
      "playingTime"
    ]
  },
  {
    "code": "LIFE_NEW_CONTRACT_SIGNED",
    "kind": "NEW_CONTRACT_SIGNED",
    "family": "CAREER",
    "dimension": "contractualCommitment",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_CONTRACT_EXTENSION_DECLINED",
    "kind": "CONTRACT_EXTENSION_DECLINED",
    "family": "CAREER",
    "dimension": "loyalty",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_CONTRACT_OFFER_ACCEPTED",
    "kind": "CONTRACT_OFFER_ACCEPTED",
    "family": "CAREER",
    "dimension": "decisionPatience",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_CONTRACT_OFFER_REJECTED",
    "kind": "CONTRACT_OFFER_REJECTED",
    "family": "CAREER",
    "dimension": "decisiveness",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_TRANSFER_REQUESTED",
    "kind": "TRANSFER_REQUESTED",
    "family": "CAREER",
    "dimension": "ambition",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_TRANSFER_COMPLETED",
    "kind": "TRANSFER_COMPLETED",
    "family": "CAREER",
    "dimension": "adaptability",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_LOAN_OR_ASSIGNMENT",
    "kind": "LOAN_OR_ASSIGNMENT",
    "family": "CAREER",
    "dimension": "flexibility",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_TEAM_RELEASE",
    "kind": "TEAM_RELEASE",
    "family": "CAREER",
    "dimension": "resilience",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_NEW_CLUB_JOINED",
    "kind": "NEW_CLUB_JOINED",
    "family": "CAREER",
    "dimension": "culturalOpenness",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_CAPTAINCY_OFFERED",
    "kind": "CAPTAINCY_OFFERED",
    "family": "CAREER",
    "dimension": "leadership",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_CAPTAINCY_REMOVED",
    "kind": "CAPTAINCY_REMOVED",
    "family": "CAREER",
    "dimension": "statusSeeking",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_AGENT_CHANGED",
    "kind": "AGENT_CHANGED",
    "family": "CAREER",
    "dimension": "trust",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_SALARY_DISPUTE",
    "kind": "SALARY_DISPUTE",
    "family": "CAREER",
    "dimension": "recognitionNeed",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_CAREER_MILESTONE",
    "kind": "CAREER_MILESTONE",
    "family": "CAREER",
    "dimension": "achievementDrive",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_RETIREMENT_DECISION",
    "kind": "RETIREMENT_DECISION",
    "family": "CAREER",
    "dimension": "selfReflection",
    "minAge": 18,
    "sources": [
      "careerEvent"
    ]
  },
  {
    "code": "LIFE_TEAMMATE_SUPPORT",
    "kind": "TEAMMATE_SUPPORT",
    "family": "TEAM",
    "dimension": "empathy",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_TEAMMATE_CONFLICT",
    "kind": "TEAMMATE_CONFLICT",
    "family": "TEAM",
    "dimension": "temperament",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_TEAMMATE_RECONCILIATION",
    "kind": "TEAMMATE_RECONCILIATION",
    "family": "TEAM",
    "dimension": "conflictResolution",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_MENTORSHIP_STARTED",
    "kind": "MENTORSHIP_STARTED",
    "family": "TEAM",
    "dimension": "leadership",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_MENTORSHIP_ENDED",
    "kind": "MENTORSHIP_ENDED",
    "family": "TEAM",
    "dimension": "loyalty",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_COACH_PRAISE",
    "kind": "COACH_PRAISE",
    "family": "TEAM",
    "dimension": "recognitionNeed",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_COACH_CRITICISM",
    "kind": "COACH_CRITICISM",
    "family": "TEAM",
    "dimension": "coachability",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_TEAM_MEETING",
    "kind": "TEAM_MEETING",
    "family": "TEAM",
    "dimension": "communication",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_LOCKER_ROOM_DISPUTE",
    "kind": "LOCKER_ROOM_DISPUTE",
    "family": "TEAM",
    "dimension": "conflictResolution",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_TEAM_COHESION_RECOVERY",
    "kind": "TEAM_COHESION_RECOVERY",
    "family": "TEAM",
    "dimension": "teamOrientation",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_TEAM_CAPTAIN_APPOINTED",
    "kind": "TEAM_CAPTAIN_APPOINTED",
    "family": "TEAM",
    "dimension": "leadership",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_TRUST_BREACH",
    "kind": "TRUST_BREACH",
    "family": "TEAM",
    "dimension": "trust",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_TRUST_REBUILT",
    "kind": "TRUST_REBUILT",
    "family": "TEAM",
    "dimension": "reciprocity",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_TACTICAL_DISAGREEMENT",
    "kind": "TACTICAL_DISAGREEMENT",
    "family": "TEAM",
    "dimension": "flexibility",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_SQUAD_REUNION",
    "kind": "SQUAD_REUNION",
    "family": "TEAM",
    "dimension": "socialConfidence",
    "minAge": 15,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_PRESS_PRAISE",
    "kind": "PRESS_PRAISE",
    "family": "PUBLIC",
    "dimension": "mediaComfort",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_PRESS_CRITICISM",
    "kind": "PRESS_CRITICISM",
    "family": "PUBLIC",
    "dimension": "stressTolerance",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_INTERVIEW_COMPLETED",
    "kind": "INTERVIEW_COMPLETED",
    "family": "PUBLIC",
    "dimension": "communication",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_PUBLIC_APOLOGY",
    "kind": "PUBLIC_APOLOGY",
    "family": "PUBLIC",
    "dimension": "accountability",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_SOCIAL_MEDIA_BACKLASH",
    "kind": "SOCIAL_MEDIA_BACKLASH",
    "family": "PUBLIC",
    "dimension": "emotionalStability",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_SOCIAL_MEDIA_SUPPORT",
    "kind": "SOCIAL_MEDIA_SUPPORT",
    "family": "PUBLIC",
    "dimension": "socialConfidence",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_COMMUNITY_EVENT",
    "kind": "COMMUNITY_EVENT",
    "family": "PUBLIC",
    "dimension": "empathy",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_CHARITY_PARTICIPATION",
    "kind": "CHARITY_PARTICIPATION",
    "family": "PUBLIC",
    "dimension": "reciprocity",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_PUBLIC_LEADERSHIP_STATEMENT",
    "kind": "PUBLIC_LEADERSHIP_STATEMENT",
    "family": "PUBLIC",
    "dimension": "publicResponsibility",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_SPONSOR_APPEARANCE",
    "kind": "SPONSOR_APPEARANCE",
    "family": "PUBLIC",
    "dimension": "mediaComfort",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_FAN_SUPPORT",
    "kind": "FAN_SUPPORT",
    "family": "PUBLIC",
    "dimension": "trust",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_FAN_DISCONTENT",
    "kind": "FAN_DISCONTENT",
    "family": "PUBLIC",
    "dimension": "frustrationTolerance",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_MEDIA_RUMOUR_CONFIRMED",
    "kind": "MEDIA_RUMOUR_CONFIRMED",
    "family": "PUBLIC",
    "dimension": "honesty",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_MEDIA_RUMOUR_REFUTED",
    "kind": "MEDIA_RUMOUR_REFUTED",
    "family": "PUBLIC",
    "dimension": "integrity",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_PUBLIC_CREDIT_SHARED",
    "kind": "PUBLIC_CREDIT_SHARED",
    "family": "PUBLIC",
    "dimension": "teamOrientation",
    "minAge": 15,
    "sources": [
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_TRAINING_TARGET_REACHED",
    "kind": "TRAINING_TARGET_REACHED",
    "family": "DEVELOPMENT",
    "dimension": "persistence",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_TRAINING_TARGET_MISSED",
    "kind": "TRAINING_TARGET_MISSED",
    "family": "DEVELOPMENT",
    "dimension": "resilience",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_POSITION_MASTERY",
    "kind": "POSITION_MASTERY",
    "family": "DEVELOPMENT",
    "dimension": "learningOrientation",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_SKILL_REGRESSION",
    "kind": "SKILL_REGRESSION",
    "family": "DEVELOPMENT",
    "dimension": "selfReflection",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_FITNESS_GOAL_REACHED",
    "kind": "FITNESS_GOAL_REACHED",
    "family": "DEVELOPMENT",
    "dimension": "discipline",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_RETURN_TO_PLAY_CLEARED",
    "kind": "RETURN_TO_PLAY_CLEARED",
    "family": "DEVELOPMENT",
    "dimension": "stressTolerance",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_REHAB_SETBACK_RECORDED",
    "kind": "REHAB_SETBACK_RECORDED",
    "family": "DEVELOPMENT",
    "dimension": "resilience",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_RECOVERY_MILESTONE",
    "kind": "RECOVERY_MILESTONE",
    "family": "DEVELOPMENT",
    "dimension": "persistence",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_PERSONAL_BEST_RECORDED",
    "kind": "PERSONAL_BEST_RECORDED",
    "family": "DEVELOPMENT",
    "dimension": "achievementDrive",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_COACHING_COURSE_COMPLETED",
    "kind": "COACHING_COURSE_COMPLETED",
    "family": "DEVELOPMENT",
    "dimension": "curiosity",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_YOUTH_PROMOTION",
    "kind": "YOUTH_PROMOTION",
    "family": "DEVELOPMENT",
    "dimension": "learningOrientation",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_SENIOR_DEBUT",
    "kind": "SENIOR_DEBUT",
    "family": "DEVELOPMENT",
    "dimension": "socialConfidence",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_RECOMMENDATION_ACCEPTED",
    "kind": "RECOMMENDATION_ACCEPTED",
    "family": "TEAM",
    "dimension": "recognitionNeed",
    "minAge": 18,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_TACTICAL_LEARNING_MILESTONE",
    "kind": "TACTICAL_LEARNING_MILESTONE",
    "family": "DEVELOPMENT",
    "dimension": "tacticalAwareness",
    "minAge": 15,
    "sources": [
      "developmentEvent"
    ]
  },
  {
    "code": "LIFE_RECOMMENDATION_REJECTED",
    "kind": "RECOMMENDATION_REJECTED",
    "family": "TEAM",
    "dimension": "frustrationTolerance",
    "minAge": 18,
    "sources": [
      "teamEvent",
      "professionalInteraction"
    ]
  },
  {
    "code": "LIFE_PROFESSIONAL_REVIEW",
    "kind": "PROFESSIONAL_REVIEW",
    "family": "CAREER",
    "dimension": "conscientiousness",
    "minAge": 18,
    "sources": [
      "professionalInteraction"
    ]
  }
] as const
export type ObservedPersonalityKind = typeof OBSERVED_PERSONALITY_RULES[number]['kind']
export const PERSONALITY_EVOLUTION_VERSION = 'PERSON-23I-EVENT-SOURCED-EVOLUTION-V1'

export interface PersonalityHistoryEntry {
  readonly sourceEventId: string
  readonly personId: string
  readonly occurredOn: GameDate
  readonly dimensionCode: string
  readonly previousValue: number
  readonly newValue: number
}
export type PersonalityHistoryByPersonId = Readonly<Record<string, readonly PersonalityHistoryEntry[]>>

function eventAge(birthDate: string, currentDate: GameDate): number {
  const year = Number(currentDate.slice(0, 4)) - Number(birthDate.slice(0, 4))
  return year - (currentDate.slice(5) < birthDate.slice(5) ? 1 : 0)
}

/** Apply an event only AFTER it exists in the canonical morale ledger.
 * Source event IDs dedupe retries and Save V4 reloads. Explicit context is
 * required: ordinary legacy morale/relationship events never mutate PERSON.
 * A score changes by at most three points, with no hidden annual drift.
 */
export function evolvePersonalityFromMoraleEvidence(
  personality: Personality,
  personId: string,
  birthDate: string | undefined,
  history: readonly PersonalityHistoryEntry[],
  event: MoraleEvent,
): { readonly personality: Personality; readonly history: readonly PersonalityHistoryEntry[] } {
  const rawKind = event.context.personalityEventKind
  if (rawKind === undefined || !hasFullSemanticPersonality(personality)) return { personality, history }
  if (typeof rawKind !== 'string') throw new TypeError('Personality observed event kind must be a string')
  const rule = OBSERVED_PERSONALITY_RULES.find((candidate) => candidate.kind === rawKind)
  if (rule === undefined) throw new RangeError(`Unrecognized observed PERSON event kind: ${rawKind}`)
  if (!(rule.sources as readonly string[]).includes(event.source)) {
    throw new RangeError(`Observed PERSON event kind ${rawKind} cannot come from ${event.source}`)
  }
  if (!event.id.trim() || event.personId !== personId || !Number.isInteger(event.delta) || event.delta === 0) {
    throw new RangeError('Observed personality experience requires a valid committed event')
  }
  if (birthDate === undefined || event.gameDate <= birthDate) {
    throw new RangeError('Observed personality experience requires DOB before event')
  }
  // The age guard follows the canonical 75-event WorldDB reference.
  if (eventAge(birthDate, event.gameDate) < rule.minAge) return { personality, history }
  if (history.some((record) => record.sourceEventId === event.id)) return { personality, history }
  if (history.length && event.gameDate < history[history.length - 1]!.occurredOn) {
    throw new RangeError('Personality experience occurred before existing journal history')
  }
  const before = personality.values[rule.dimension]
  if (before === undefined) throw new RangeError('Missing semantic personality dimension')
  const step = Math.ceil(Math.min(100, Math.abs(event.delta)) / 40)
  const after = Math.max(0, Math.min(100, before + Math.sign(event.delta) * step))
  const next = createPersonality({ values: { ...personality.values, [rule.dimension]: after } })
  const record: PersonalityHistoryEntry = {
    sourceEventId: event.id,
    personId,
    occurredOn: event.gameDate,
    dimensionCode: rule.dimension,
    previousValue: before,
    newValue: after,
  }
  return { personality: next, history: [...history, record] }
}

/** Read-back integrity check: journal history must match stored personality
 * deltas and preserve distinct stable event IDs per PERSON.
 */
export function validatePersonalityJournal(
  entries: readonly PersonalityHistoryEntry[],
  personId: string,
  latestDate: GameDate,
): readonly PersonalityHistoryEntry[] {
  const ids = new Set<string>()
  let lastDate: string | undefined
  for (const entry of entries) {
    if (!entry.sourceEventId || entry.personId !== personId || ids.has(entry.sourceEventId)
      || entry.occurredOn > latestDate || (lastDate !== undefined && entry.occurredOn < lastDate)
      || !OBSERVED_PERSONALITY_RULES.some((r) => r.dimension === entry.dimensionCode)
      || !Number.isInteger(entry.previousValue) || entry.previousValue < 0 || entry.previousValue > 100
      || !Number.isInteger(entry.newValue) || entry.newValue < 0 || entry.newValue > 100
      || Math.abs(entry.newValue - entry.previousValue) > 3
    ) throw new RangeError(`Invalid PERSON personality journal for ${personId}`)
    ids.add(entry.sourceEventId)
    lastDate = entry.occurredOn
  }
  return entries
}
