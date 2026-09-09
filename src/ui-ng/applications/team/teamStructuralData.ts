export const TEAM_DETAIL_TABS = [
  'overview',
  'roster',
  'staff',
  'tactics',
  'schedule',
  'results',
  'competitions',
  'finances',
  'facilities',
  'history',
] as const

export type TeamDetailTabId = (typeof TEAM_DETAIL_TABS)[number]

export const TEAM_DETAIL_TAB_LABELS: Readonly<Record<TeamDetailTabId, string>> = {
  overview: 'Overview',
  roster: 'Roster',
  staff: 'Staff',
  tactics: 'Tactics',
  schedule: 'Schedule',
  results: 'Results',
  competitions: 'Competitions',
  finances: 'Finances',
  facilities: 'Facilities',
  history: 'History',
}

/** V1 road-map: only Overview has content; Roster opens the real roster workspace. */
export const TEAM_DETAIL_ROSTER_TAB = 'roster' as const

/** Tabs kept visible but not yet implemented in TEAM DETAIL V1. */
export const TEAM_DETAIL_PREPARED_TABS: readonly TeamDetailTabId[] = TEAM_DETAIL_TABS.filter(
  (tab) => tab !== 'overview' && tab !== TEAM_DETAIL_ROSTER_TAB,
)

export function parseTeamDetailTabId(value: string | null): TeamDetailTabId {
  if (value !== null && TEAM_DETAIL_TABS.includes(value as TeamDetailTabId)) {
    return value as TeamDetailTabId
  }
  return 'overview'
}
