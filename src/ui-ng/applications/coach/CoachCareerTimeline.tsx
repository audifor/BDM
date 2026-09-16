/*
 * Coach · Overview — recent career timeline.
 * A single horizontal rail with the chronological events hung off it, not a grid of cards.
 */

import type { CoachOverviewModel } from '@/ui-ng/applications/coach/coachOverviewMock'
import { OverviewGlyph } from '@/ui-ng/applications/coach/CoachOverviewGlyph'

/* Same affordance the Legacy timeline uses: an explicit chip for entries the domain does not back,
   so filler can never read as measured career data. */
function MockTag() {
  return (
    <span className="co-mock" title="Illustrative value: not backed by the simulation domain yet.">
      Mock
    </span>
  )
}

export function CoachCareerTimeline({
  model,
  onOpenHistory,
}: {
  readonly model: CoachOverviewModel
  readonly onOpenHistory?: () => void
}) {
  return (
    <section className="ng-canon__panel ng-holo-panel co-panel co-panel--timeline">
      <header className="co-panel__head">
        <h2 className="co-panel__heading">
          <OverviewGlyph className="co-panel__icon" name="stack" size={15} />
          <span className="co-panel__title">Recent career timeline</span>
          <span className="co-panel__subtitle">Key moments in your journey</span>
        </h2>
        <div className="co-panel__aside">
          <button className="co-link" onClick={onOpenHistory} type="button">
            View full career history
            <span aria-hidden className="co-link__arrow">
              →
            </span>
          </button>
        </div>
      </header>

      <ol className="co-timeline">
        {model.timeline.map((event) => (
          <li className="co-timeline__event" key={event.id}>
            <span className={`co-timeline__dot co-tone-bg--${event.tone}`} aria-hidden />
            <span className="co-timeline__date">
              {event.date}
              {event.mock === true ? <MockTag /> : null}
            </span>
            <span className="co-timeline__title">
              <span className={`co-timeline__icon co-tone-text--${event.tone}`}>
                <OverviewGlyph name={event.icon} size={13} />
              </span>
              {event.title}
            </span>
            <span className="co-timeline__highlight">{event.highlight}</span>
            <span className="co-timeline__detail">{event.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
