/*
 * Coach · Overview — the character landing screen.
 *
 * Composition: character core / current status / personal economy in the first row (equal heights),
 * the six tab summaries in the second, the career timeline in the third. Everything reads from a
 * single `CoachOverviewModel`, so swapping the mock for real selectors is a one-prop change.
 */

import { CoachCareerTimeline } from '@/ui-ng/applications/coach/CoachCareerTimeline'
import {
  CharacterCorePanel,
  CurrentStatusPanel,
  PersonalEconomyPowerPanel,
} from '@/ui-ng/applications/coach/CoachOverviewPanels'
import { CoachOverviewSummaries } from '@/ui-ng/applications/coach/CoachOverviewSummaries'
import {
  COACH_OVERVIEW_MOCK,
  type CoachOverviewModel,
} from '@/ui-ng/applications/coach/coachOverviewMock'

import './coach-overview.css'

export function CoachOverviewScreen({
  model = COACH_OVERVIEW_MOCK,
  onOpenHistory,
  onOpenTab,
  onSelectStatus,
}: {
  readonly model?: CoachOverviewModel
  readonly onOpenHistory?: () => void
  readonly onOpenTab?: (tabId: string) => void
  readonly onSelectStatus?: (id: string) => void
}) {
  return (
    <div className="co-overview">
      <div className="co-overview__core">
        <CharacterCorePanel model={model} />
        <CurrentStatusPanel model={model} onSelectStatus={onSelectStatus} />
        <PersonalEconomyPowerPanel model={model} />
      </div>
      <CoachOverviewSummaries model={model} onOpenTab={onOpenTab} />
      <CoachCareerTimeline model={model} onOpenHistory={onOpenHistory} />
    </div>
  )
}
