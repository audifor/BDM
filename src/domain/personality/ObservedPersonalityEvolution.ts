import { createPersonality, hasFullSemanticPersonality, type Personality } from './Personality'
import type { GameDate } from '@/domain/date'
import type { MoraleEvent } from '@/domain/morale'

/** Exact observed-event kind/dimension mapping from WorldDB PERSON-23H.
 * These are allowed event kinds, NOT claims about someone's biography.
 * The real source event must be committed to BDM's morale-event ledger first.
 */
export const OBSERVED_PERSONALITY_RULES = [
  {
    "kind": "ROTATION_PROMOTION",
    "dimension": "competitiveness",
    "minAge": 15
  },
  {
    "kind": "ROTATION_REDUCTION",
    "dimension": "frustrationTolerance",
    "minAge": 15
  },
  {
    "kind": "STARTER_DEBUT",
    "dimension": "socialConfidence",
    "minAge": 15
  },
  {
    "kind": "BENCHING_STREAK",
    "dimension": "resilience",
    "minAge": 15
  },
  {
    "kind": "ROLE_CHANGE",
    "dimension": "adaptability",
    "minAge": 15
  },
  {
    "kind": "POSITION_RETRAINING",
    "dimension": "curiosity",
    "minAge": 15
  },
  {
    "kind": "MATCH_WINNING_SHOT",
    "dimension": "composure",
    "minAge": 15
  },
  {
    "kind": "CLOSE_GAME_MISTAKE",
    "dimension": "accountability",
    "minAge": 15
  },
  {
    "kind": "DEFENSIVE_BREAKTHROUGH",
    "dimension": "achievementDrive",
    "minAge": 15
  },
  {
    "kind": "SCORING_BREAKTHROUGH",
    "dimension": "goalFocus",
    "minAge": 15
  },
  {
    "kind": "SEASON_BEST_PERFORMANCE",
    "dimension": "recognitionNeed",
    "minAge": 15
  },
  {
    "kind": "PLAYOFF_EXIT",
    "dimension": "resilience",
    "minAge": 15
  },
  {
    "kind": "CHAMPIONSHIP_WIN",
    "dimension": "teamOrientation",
    "minAge": 15
  },
  {
    "kind": "TRAINING_BREAKTHROUGH",
    "dimension": "workEthic",
    "minAge": 15
  },
  {
    "kind": "TACTICAL_ROLE_CONFLICT",
    "dimension": "coachability",
    "minAge": 15
  },
  {
    "kind": "NEW_CONTRACT_SIGNED",
    "dimension": "contractualCommitment",
    "minAge": 18
  },
  {
    "kind": "CONTRACT_EXTENSION_DECLINED",
    "dimension": "loyalty",
    "minAge": 18
  },
  {
    "kind": "CONTRACT_OFFER_ACCEPTED",
    "dimension": "decisionPatience",
    "minAge": 18
  },
  {
    "kind": "CONTRACT_OFFER_REJECTED",
    "dimension": "decisiveness",
    "minAge": 18
  },
  {
    "kind": "TRANSFER_REQUESTED",
    "dimension": "ambition",
    "minAge": 18
  },
  {
    "kind": "TRANSFER_COMPLETED",
    "dimension": "adaptability",
    "minAge": 18
  },
  {
    "kind": "LOAN_OR_ASSIGNMENT",
    "dimension": "flexibility",
    "minAge": 18
  },
  {
    "kind": "TEAM_RELEASE",
    "dimension": "resilience",
    "minAge": 18
  },
  {
    "kind": "NEW_CLUB_JOINED",
    "dimension": "culturalOpenness",
    "minAge": 18
  },
  {
    "kind": "CAPTAINCY_OFFERED",
    "dimension": "leadership",
    "minAge": 18
  },
  {
    "kind": "CAPTAINCY_REMOVED",
    "dimension": "statusSeeking",
    "minAge": 18
  },
  {
    "kind": "AGENT_CHANGED",
    "dimension": "trust",
    "minAge": 18
  },
  {
    "kind": "SALARY_DISPUTE",
    "dimension": "recognitionNeed",
    "minAge": 18
  },
  {
    "kind": "CAREER_MILESTONE",
    "dimension": "achievementDrive",
    "minAge": 18
  },
  {
    "kind": "RETIREMENT_DECISION",
    "dimension": "selfReflection",
    "minAge": 18
  },
  {
    "kind": "TEAMMATE_SUPPORT",
    "dimension": "empathy",
    "minAge": 15
  },
  {
    "kind": "TEAMMATE_CONFLICT",
    "dimension": "temperament",
    "minAge": 15
  },
  {
    "kind": "TEAMMATE_RECONCILIATION",
    "dimension": "conflictResolution",
    "minAge": 15
  },
  {
    "kind": "MENTORSHIP_STARTED",
    "dimension": "leadership",
    "minAge": 15
  },
  {
    "kind": "MENTORSHIP_ENDED",
    "dimension": "loyalty",
    "minAge": 15
  },
  {
    "kind": "COACH_PRAISE",
    "dimension": "recognitionNeed",
    "minAge": 15
  },
  {
    "kind": "COACH_CRITICISM",
    "dimension": "coachability",
    "minAge": 15
  },
  {
    "kind": "TEAM_MEETING",
    "dimension": "communication",
    "minAge": 15
  },
  {
    "kind": "LOCKER_ROOM_DISPUTE",
    "dimension": "conflictResolution",
    "minAge": 15
  },
  {
    "kind": "TEAM_COHESION_RECOVERY",
    "dimension": "teamOrientation",
    "minAge": 15
  },
  {
    "kind": "TEAM_CAPTAIN_APPOINTED",
    "dimension": "leadership",
    "minAge": 15
  },
  {
    "kind": "TRUST_BREACH",
    "dimension": "trust",
    "minAge": 15
  },
  {
    "kind": "TRUST_REBUILT",
    "dimension": "reciprocity",
    "minAge": 15
  },
  {
    "kind": "TACTICAL_DISAGREEMENT",
    "dimension": "flexibility",
    "minAge": 15
  },
  {
    "kind": "SQUAD_REUNION",
    "dimension": "socialConfidence",
    "minAge": 15
  },
  {
    "kind": "PRESS_PRAISE",
    "dimension": "mediaComfort",
    "minAge": 15
  },
  {
    "kind": "PRESS_CRITICISM",
    "dimension": "stressTolerance",
    "minAge": 15
  },
  {
    "kind": "INTERVIEW_COMPLETED",
    "dimension": "communication",
    "minAge": 15
  },
  {
    "kind": "PUBLIC_APOLOGY",
    "dimension": "accountability",
    "minAge": 15
  },
  {
    "kind": "SOCIAL_MEDIA_BACKLASH",
    "dimension": "emotionalStability",
    "minAge": 15
  },
  {
    "kind": "SOCIAL_MEDIA_SUPPORT",
    "dimension": "socialConfidence",
    "minAge": 15
  },
  {
    "kind": "COMMUNITY_EVENT",
    "dimension": "empathy",
    "minAge": 15
  },
  {
    "kind": "CHARITY_PARTICIPATION",
    "dimension": "reciprocity",
    "minAge": 15
  },
  {
    "kind": "PUBLIC_LEADERSHIP_STATEMENT",
    "dimension": "publicResponsibility",
    "minAge": 15
  },
  {
    "kind": "SPONSOR_APPEARANCE",
    "dimension": "mediaComfort",
    "minAge": 15
  },
  {
    "kind": "FAN_SUPPORT",
    "dimension": "trust",
    "minAge": 15
  },
  {
    "kind": "FAN_DISCONTENT",
    "dimension": "frustrationTolerance",
    "minAge": 15
  },
  {
    "kind": "MEDIA_RUMOUR_CONFIRMED",
    "dimension": "honesty",
    "minAge": 15
  },
  {
    "kind": "MEDIA_RUMOUR_REFUTED",
    "dimension": "integrity",
    "minAge": 15
  },
  {
    "kind": "PUBLIC_CREDIT_SHARED",
    "dimension": "teamOrientation",
    "minAge": 15
  },
  {
    "kind": "TRAINING_TARGET_REACHED",
    "dimension": "persistence",
    "minAge": 15
  },
  {
    "kind": "TRAINING_TARGET_MISSED",
    "dimension": "resilience",
    "minAge": 15
  },
  {
    "kind": "POSITION_MASTERY",
    "dimension": "learningOrientation",
    "minAge": 15
  },
  {
    "kind": "SKILL_REGRESSION",
    "dimension": "selfReflection",
    "minAge": 15
  },
  {
    "kind": "FITNESS_GOAL_REACHED",
    "dimension": "discipline",
    "minAge": 15
  },
  {
    "kind": "RETURN_TO_PLAY_CLEARED",
    "dimension": "stressTolerance",
    "minAge": 15
  },
  {
    "kind": "REHAB_SETBACK_RECORDED",
    "dimension": "resilience",
    "minAge": 15
  },
  {
    "kind": "RECOVERY_MILESTONE",
    "dimension": "persistence",
    "minAge": 15
  },
  {
    "kind": "PERSONAL_BEST_RECORDED",
    "dimension": "achievementDrive",
    "minAge": 15
  },
  {
    "kind": "COACHING_COURSE_COMPLETED",
    "dimension": "curiosity",
    "minAge": 15
  },
  {
    "kind": "YOUTH_PROMOTION",
    "dimension": "learningOrientation",
    "minAge": 15
  },
  {
    "kind": "SENIOR_DEBUT",
    "dimension": "socialConfidence",
    "minAge": 15
  },
  {
    "kind": "TEAM_SCOUTING_REPORT",
    "dimension": "accountability",
    "minAge": 15
  },
  {
    "kind": "TACTICAL_LEARNING_MILESTONE",
    "dimension": "tacticalAwareness",
    "minAge": 15
  },
  {
    "kind": "PROFESSIONAL_REVIEW",
    "dimension": "conscientiousness",
    "minAge": 15
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
