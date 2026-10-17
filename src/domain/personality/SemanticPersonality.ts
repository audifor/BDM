/** Exact semantic dimension names from BDM-DB PERSON 2.3-C.
 * New event effects remain game balance candidates, not measured psychology.
 * Do not rename independently of the canonical Rust source catalog.
 */
export const SEMANTIC_PERSONALITY_DEFINITIONS = [
  {
    "code": "ambition",
    "family": "MOTIVATION",
    "meaning": "Pursuit of increasingly demanding career goals"
  },
  {
    "code": "competitiveness",
    "family": "MOTIVATION",
    "meaning": "Desire to win against demanding opposition"
  },
  {
    "code": "achievementDrive",
    "family": "MOTIVATION",
    "meaning": "Motivation from personal mastery and results"
  },
  {
    "code": "statusSeeking",
    "family": "MOTIVATION",
    "meaning": "Value placed on prestige and formal status"
  },
  {
    "code": "persistence",
    "family": "MOTIVATION",
    "meaning": "Sustained effort after setbacks"
  },
  {
    "code": "goalFocus",
    "family": "MOTIVATION",
    "meaning": "Ability to prioritize long-term objectives"
  },
  {
    "code": "recognitionNeed",
    "family": "MOTIVATION",
    "meaning": "Importance of receiving external acknowledgement"
  },
  {
    "code": "professionalism",
    "family": "PROFESSIONAL",
    "meaning": "Reliable professional conduct and standards"
  },
  {
    "code": "discipline",
    "family": "PROFESSIONAL",
    "meaning": "Consistency in following routines and plans"
  },
  {
    "code": "preparation",
    "family": "PROFESSIONAL",
    "meaning": "Readiness before training and games"
  },
  {
    "code": "conscientiousness",
    "family": "PROFESSIONAL",
    "meaning": "Care and diligence in commitments"
  },
  {
    "code": "workEthic",
    "family": "PROFESSIONAL",
    "meaning": "Willingness to invest effort in improvement"
  },
  {
    "code": "accountability",
    "family": "PROFESSIONAL",
    "meaning": "Ownership of decisions and their consequences"
  },
  {
    "code": "coachability",
    "family": "PROFESSIONAL",
    "meaning": "Openness to constructive technical feedback"
  },
  {
    "code": "loyalty",
    "family": "ETHICS",
    "meaning": "Commitment to established people and organizations"
  },
  {
    "code": "fairness",
    "family": "ETHICS",
    "meaning": "Concern for fair treatment and rules"
  },
  {
    "code": "integrity",
    "family": "ETHICS",
    "meaning": "Consistency between stated values and actions"
  },
  {
    "code": "reciprocity",
    "family": "ETHICS",
    "meaning": "Tendency to return support and consideration"
  },
  {
    "code": "contractualCommitment",
    "family": "ETHICS",
    "meaning": "Respect for agreed professional obligations"
  },
  {
    "code": "honesty",
    "family": "ETHICS",
    "meaning": "Willingness to communicate information truthfully"
  },
  {
    "code": "resilience",
    "family": "EMOTIONAL",
    "meaning": "Recovery following disappointments and failures"
  },
  {
    "code": "temperament",
    "family": "EMOTIONAL",
    "meaning": "Regulation of emotional reactions under pressure"
  },
  {
    "code": "stressTolerance",
    "family": "EMOTIONAL",
    "meaning": "Capacity to function under sustained demands"
  },
  {
    "code": "impulseControl",
    "family": "EMOTIONAL",
    "meaning": "Ability to inhibit unhelpful immediate responses"
  },
  {
    "code": "emotionalStability",
    "family": "EMOTIONAL",
    "meaning": "Consistency of emotional state across events"
  },
  {
    "code": "frustrationTolerance",
    "family": "EMOTIONAL",
    "meaning": "Tolerance of unmet expectations"
  },
  {
    "code": "composure",
    "family": "EMOTIONAL",
    "meaning": "Calm decision making in decisive moments"
  },
  {
    "code": "teamOrientation",
    "family": "SOCIAL",
    "meaning": "Priority given to collective over individual benefit"
  },
  {
    "code": "empathy",
    "family": "SOCIAL",
    "meaning": "Sensitivity to others' experiences"
  },
  {
    "code": "communication",
    "family": "SOCIAL",
    "meaning": "Clarity in interpersonal exchanges"
  },
  {
    "code": "leadership",
    "family": "SOCIAL",
    "meaning": "Readiness to guide and support teammates"
  },
  {
    "code": "trust",
    "family": "SOCIAL",
    "meaning": "Readiness to rely on other people"
  },
  {
    "code": "conflictResolution",
    "family": "SOCIAL",
    "meaning": "Preference for constructive disagreement handling"
  },
  {
    "code": "adaptability",
    "family": "ADAPTATION",
    "meaning": "Adjustment to changes in context or role"
  },
  {
    "code": "curiosity",
    "family": "ADAPTATION",
    "meaning": "Interest in unfamiliar ideas and environments"
  },
  {
    "code": "learningOrientation",
    "family": "ADAPTATION",
    "meaning": "Preference for learning from new experiences"
  },
  {
    "code": "flexibility",
    "family": "ADAPTATION",
    "meaning": "Ability to modify routines when necessary"
  },
  {
    "code": "culturalOpenness",
    "family": "ADAPTATION",
    "meaning": "Comfort with different cultural settings"
  },
  {
    "code": "uncertaintyTolerance",
    "family": "ADAPTATION",
    "meaning": "Comfort with incomplete information"
  },
  {
    "code": "riskAppetite",
    "family": "DECISIONS",
    "meaning": "Willingness to accept uncertain outcomes"
  },
  {
    "code": "decisionPatience",
    "family": "DECISIONS",
    "meaning": "Deliberation before consequential decisions"
  },
  {
    "code": "decisiveness",
    "family": "DECISIONS",
    "meaning": "Willingness to commit once evidence is sufficient"
  },
  {
    "code": "tacticalAwareness",
    "family": "DECISIONS",
    "meaning": "Attention to patterns and game context"
  },
  {
    "code": "selfReflection",
    "family": "DECISIONS",
    "meaning": "Ability to reconsider past choices"
  },
  {
    "code": "mediaComfort",
    "family": "PUBLIC",
    "meaning": "Comfort with public questions and publicity"
  },
  {
    "code": "privacyPreference",
    "family": "PUBLIC",
    "meaning": "Preference for personal boundaries and privacy"
  },
  {
    "code": "socialConfidence",
    "family": "PUBLIC",
    "meaning": "Confidence when meeting unfamiliar people"
  },
  {
    "code": "publicResponsibility",
    "family": "PUBLIC",
    "meaning": "Awareness of consequences of public statements"
  },
  {
    "code": "controversyTolerance",
    "family": "PUBLIC",
    "meaning": "Tolerance of public disagreement and criticism"
  },
  {
    "code": "humor",
    "family": "PUBLIC",
    "meaning": "Tendency to use humor in social interactions"
  }
] as const
export const SEMANTIC_PERSONALITY_DIMENSIONS = SEMANTIC_PERSONALITY_DEFINITIONS.map((d) => d.code)
export type SemanticPersonalityDimension = typeof SEMANTIC_PERSONALITY_DEFINITIONS[number]['code']
export const SEMANTIC_PERSONALITY_MODEL_VERSION = 'PERSON-23C-SEMANTIC-FAMILIES-V1'
