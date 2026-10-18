import type { CompetitionLeaderRow } from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'

/** Canonical box-score categories already produced by buildCompetitionWorkspaceModel. */
export const HOME_LEADER_CATEGORIES = [
  { id: 'points', label: 'Puntos', key: 'ppg', abbrev: 'PTS' },
  { id: 'rebounds', label: 'Rebotes', key: 'rpg', abbrev: 'REB' },
  { id: 'assists', label: 'Asistencias', key: 'apg', abbrev: 'AST' },
  { id: 'valuation', label: 'Valoración', key: 'vpg', abbrev: 'VAL' },
] as const

export type HomeLeaderCategory = (typeof HOME_LEADER_CATEGORIES)[number]['id']

export function rankHomeLeaders(
  leaders: readonly CompetitionLeaderRow[],
  category: HomeLeaderCategory,
  limit = 6,
): readonly CompetitionLeaderRow[] {
  const stat = HOME_LEADER_CATEGORIES.find((entry) => entry.id === category)!
  return [...leaders]
    .sort((a, b) => b[stat.key] - a[stat.key] || a.playerId.localeCompare(b.playerId))
    .slice(0, limit)
}
