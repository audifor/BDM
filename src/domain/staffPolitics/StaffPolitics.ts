/**
 * Shared vocabulary for the future staff-politics slices.  These are catalogues only:
 * political cases, positions, blocs, and actions have no state in Wave 5F1.
 */
export const POLITICAL_AGENDAS = ['CAREER', 'RESPONSIBILITY', 'STAFFING', 'TRAINING', 'TACTICS', 'SCOUTING', 'ROSTER', 'RECRUITING', 'MEDICAL'] as const
export type PoliticalAgenda = typeof POLITICAL_AGENDAS[number]

export const POLITICAL_CASE_SOURCE_KINDS = ['CAREER_REQUEST', 'DELEGATION_OUTCOME', 'STAFF_JOB_CANDIDACY'] as const
export type PoliticalCaseSourceKind = typeof POLITICAL_CASE_SOURCE_KINDS[number]

export const POLITICAL_STANCES = ['SUPPORT', 'OPPOSE', 'MEDIATE'] as const
export type PoliticalStance = typeof POLITICAL_STANCES[number]

export const POLITICAL_ACTION_KINDS = ['ENDORSE', 'LOBBY', 'COORDINATE', 'MEDIATE'] as const
export type PoliticalActionKind = typeof POLITICAL_ACTION_KINDS[number]

export const POLITICAL_BLOC_KINDS = ['ALLIANCE', 'FACTION'] as const
export type PoliticalBlocKind = typeof POLITICAL_BLOC_KINDS[number]
