import type { CanonicalRatingKey, LegacyPlayerRatings, Player } from '@/domain/player'
import type { DataGridColumn } from '@/ui/dataGrid/types'
import {
  organizationDimensionForCanonicalRating,
  organizationDimensionForSummarySignal,
  type RosterRatingEvaluationLookup,
  rosterRatingDisplay,
  rosterRatingExportValue,
  rosterRatingSortValue,
} from './rosterRatingPresentation'

function scoutAwareNumericColumn(
  id: string,
  label: string,
  lookup: RosterRatingEvaluationLookup,
  dimensionForPlayer: (player: Player) => string,
): DataGridColumn<Player> {
  return {
    id,
    label,
    defaultWidth: id.startsWith('summary-') ? 68 : 92,
    minWidth: id.startsWith('summary-') ? 56 : 72,
    numeric: true,
    sortable: true,
    sortValue: (player) => rosterRatingSortValue(lookup(player, dimensionForPlayer(player))),
    exportValue: (player) => rosterRatingExportValue(lookup(player, dimensionForPlayer(player))),
    render: (player) => (
      <span className="canonical-roster__rating" title={label}>
        {rosterRatingDisplay(lookup(player, dimensionForPlayer(player)))}
      </span>
    ),
  }
}

export function scoutAwareSummaryColumn(
  lookup: RosterRatingEvaluationLookup,
  key: keyof LegacyPlayerRatings,
  label: string,
): DataGridColumn<Player> {
  const dimension = organizationDimensionForSummarySignal(key)
  return scoutAwareNumericColumn(`summary-${key}`, label, lookup, () => dimension)
}

export function scoutAwareRatingColumn(
  lookup: RosterRatingEvaluationLookup,
  key: CanonicalRatingKey,
  label: string,
): DataGridColumn<Player> {
  const dimension = organizationDimensionForCanonicalRating(key)
  return scoutAwareNumericColumn(`rating-${key}`, label, lookup, () => dimension)
}
