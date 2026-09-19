import type { OverviewGapModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'

/**
 * Reference elements the engine cannot produce yet, each with the reason.
 *
 * Every PLAYER page renders this instead of a placeholder number, so the missing data is visible
 * and the page never implies a reading it cannot support.
 */
export function GapList({ gaps }: { readonly gaps: readonly OverviewGapModel[] }) {
  if (gaps.length === 0) return null

  return (
    <ul className="po-gaps">
      {gaps.map((gap) => (
        <li className="po-gap" key={gap.id}>
          <span className="po-gap__label">{gap.label}</span>
          <span className="po-gap__reason">{gap.reason}</span>
        </li>
      ))}
    </ul>
  )
}
