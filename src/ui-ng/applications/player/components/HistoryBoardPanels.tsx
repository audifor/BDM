import type {
  HistoryCareerTotalsModel,
  HistoryContractRowModel,
  HistoryHonourRowModel,
  HistoryInspectorDetail,
  HistoryMilestoneRowModel,
  HistoryTeamSeasonRowModel,
  HistoryTimelineEventModel,
} from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'
import type { OverviewGapModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'

/** Icon glyph per timeline event type, matching the reference's iconography. */
const EVENT_GLYPH: Record<HistoryTimelineEventModel['type'], string> = {
  debut: '★',
  breakout: '▮',
  transfer: '⇄',
  'career-high': '🏆',
  contract: '▤',
}

/* ── Band 1 · career timeline ── */

export function HistoryTimelinePanel({
  events,
  onSelect,
  selectedSelectionId,
}: {
  readonly events: readonly HistoryTimelineEventModel[]
  readonly onSelect: (selectionId: string) => void
  readonly selectedSelectionId: string | null
}) {
  return (
    <section className="po-hs-panel po-hs-timeline" data-ng-region="history-timeline">
      <header className="po-hs-panel__head">
        <span className="po-hs-panel__title">Career timeline</span>
      </header>
      {events.length === 0 ? (
        <p className="po-hs-empty">
          No career event has been recorded in this save yet: there is no game, contract or market
          record to date.
        </p>
      ) : (
        <div className="po-hs-timeline__track">
          <span aria-hidden className="po-hs-timeline__line" />
          {events.map((event) => {
            const selected = selectedSelectionId === event.selectionId
            return (
              <button
                aria-pressed={selected}
                className={`po-hs-node is-${event.type}${selected ? ' is-selected' : ''}`}
                key={event.id}
                onClick={() => onSelect(event.selectionId)}
                type="button"
              >
                <span aria-hidden className="po-hs-node__icon">
                  {EVENT_GLYPH[event.type]}
                </span>
                <span className="po-hs-node__date ng-type-numeric">{event.dateLabel}</span>
                <span className="po-hs-node__title">{event.title}</span>
                <span className="po-hs-node__subtitle">{event.subtitle}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ── Band 2 · team history ── */

export function HistoryTeamPanel({
  onSelect,
  rows,
  selectedSelectionId,
}: {
  readonly onSelect: (selectionId: string) => void
  readonly rows: readonly HistoryTeamSeasonRowModel[]
  readonly selectedSelectionId: string | null
}) {
  return (
    <section className="po-hs-panel po-hs-team" data-ng-region="history-team">
      <header className="po-hs-panel__head">
        <span className="po-hs-panel__title">Team history</span>
        <span className="po-hs-panel__meta ng-type-numeric">
          {rows.length} {rows.length === 1 ? 'season' : 'seasons'}
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="po-hs-empty">No season has been played in this save yet.</p>
      ) : (
        <div className="po-hs-table po-hs-team__table" role="table">
          <div className="po-hs-table__head is-team" role="row">
            <span role="columnheader">Season</span>
            <span role="columnheader">Team</span>
            <span role="columnheader">Competition</span>
            <span role="columnheader">Role</span>
            <span role="columnheader">GP</span>
            <span role="columnheader">MIN</span>
            <span role="columnheader">PTS</span>
            <span role="columnheader">REB</span>
            <span role="columnheader">AST</span>
            <span role="columnheader">VAL</span>
          </div>
          {rows.map((row) => (
            <button
              className={`po-hs-table__row is-team${row.selectionId === selectedSelectionId ? ' is-selected' : ''}`}
              key={row.id}
              onClick={() => onSelect(row.selectionId)}
              type="button"
            >
              <span className="ng-type-numeric">{row.seasonLabel}</span>
              <span className="po-hs-cell--name">
                <span aria-hidden className="po-hs-crest">
                  {crestOf(row.teamName)}
                </span>
                {row.teamName}
              </span>
              <span className="po-hs-cell--competition">
                <span aria-hidden className="po-hs-comp-mark">
                  ◆
                </span>
                {row.competitionLabel}
              </span>
              <span className="po-hs-cell--role">{row.roleLabel}</span>
              <span className="ng-type-numeric">{row.gamesPlayed}</span>
              <span className="ng-type-numeric">{row.minutesPerGame}</span>
              <span className="ng-type-numeric">{row.pointsPerGame}</span>
              <span className="ng-type-numeric">{row.reboundsPerGame}</span>
              <span className="ng-type-numeric">{row.assistsPerGame}</span>
              <span className="ng-type-numeric">{row.valuationPerGame}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/* ── Band 2 · contract history ── */

export function HistoryContractPanel({
  onSelect,
  rows,
  selectedSelectionId,
}: {
  readonly onSelect: (selectionId: string) => void
  readonly rows: readonly HistoryContractRowModel[]
  readonly selectedSelectionId: string | null
}) {
  return (
    <section className="po-hs-panel po-hs-contracts" data-ng-region="history-contracts">
      <header className="po-hs-panel__head">
        <span className="po-hs-panel__title">Contract history</span>
      </header>
      {rows.length === 0 ? (
        <p className="po-hs-empty">No contract is recorded for this player.</p>
      ) : (
        <div className="po-hs-table" role="table">
          <div className="po-hs-table__head is-contract" role="row">
            <span role="columnheader">Date</span>
            <span role="columnheader">Team</span>
            <span role="columnheader">Salary</span>
            <span role="columnheader">Status</span>
          </div>
          {rows.map((row) => (
            <button
              className={`po-hs-table__row is-contract${row.selectionId === selectedSelectionId ? ' is-selected' : ''}`}
              key={row.id}
              onClick={() => onSelect(row.selectionId)}
              type="button"
            >
              <span className="ng-type-numeric">{row.dateLabel}</span>
              <span className="po-hs-cell--name">
                <span aria-hidden className="po-hs-crest">
                  {crestOf(row.teamName)}
                </span>
                {row.teamName}
              </span>
              <span className="ng-type-numeric po-hs-cell--right">{row.salaryLabel}</span>
              <span className={`po-hs-status is-${row.tone}`}>{row.statusLabel}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/* ── Band 2 · honours ── */

export function HistoryHonoursPanel({
  honours,
  note,
  onSelect,
  selectedSelectionId,
}: {
  readonly honours: readonly HistoryHonourRowModel[]
  readonly note: string
  readonly onSelect: (selectionId: string) => void
  readonly selectedSelectionId: string | null
}) {
  return (
    <section className="po-hs-panel po-hs-honours" data-ng-region="history-honours">
      <header className="po-hs-panel__head">
        <span className="po-hs-panel__title">Honours &amp; milestones</span>
        <span className="po-hs-panel__meta ng-type-numeric">{honours.length}</span>
      </header>
      {honours.length === 0 ? (
        <p className="po-hs-empty">No honour can be read from the records this save holds.</p>
      ) : (
        <ul className="po-hs-honours__list">
          {honours.map((honour) => {
            const content = (
              <>
                <span aria-hidden className="po-hs-honours__icon">
                  {honour.id === 'career-high' ? '🏆' : '⭐'}
                </span>
                <span className="po-hs-honours__label">{honour.label}</span>
                {honour.seasonLabel !== null && (
                  <span className="po-hs-honours__season ng-type-numeric">{honour.seasonLabel}</span>
                )}
              </>
            )
            return (
              <li className={honour.selectionId === selectedSelectionId ? 'is-selected' : undefined} key={honour.id}>
                {honour.selectionId === null ? (
                  <span className="po-hs-honours__row">{content}</span>
                ) : (
                  <button
                    className="po-hs-honours__row is-clickable"
                    onClick={() => onSelect(honour.selectionId!)}
                    type="button"
                  >
                    {content}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="po-hs-note">{note}</p>
    </section>
  )
}

/* ── Band 3 · milestone tables ── */

export function HistoryMilestoneTable({
  columns,
  emptyMessage,
  onSelect,
  region,
  rows,
  selectedSelectionId,
  title,
  withValue,
}: {
  readonly columns: readonly string[]
  readonly emptyMessage: string
  readonly onSelect: (selectionId: string) => void
  readonly region: string
  readonly rows: readonly HistoryMilestoneRowModel[]
  readonly selectedSelectionId: string | null
  readonly title: string
  readonly withValue: boolean
}) {
  return (
    <section className="po-hs-panel po-hs-milestones" data-ng-region={region}>
      <header className="po-hs-panel__head">
        <span className="po-hs-panel__title">{title}</span>
      </header>
      {rows.length === 0 ? (
        <p className="po-hs-empty">{emptyMessage}</p>
      ) : (
        <div className="po-hs-table" role="table">
          <div className={`po-hs-table__head ${withValue ? 'is-milestone-value' : 'is-milestone'}`} role="row">
            {columns.map((column) => (
              <span key={column} role="columnheader">
                {column}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <button
              className={`po-hs-table__row ${withValue ? 'is-milestone-value' : 'is-milestone'}${
                row.selectionId === selectedSelectionId ? ' is-selected' : ''
              }`}
              key={row.id}
              onClick={() => onSelect(row.selectionId)}
              title={row.detail.length === 0 ? undefined : row.detail}
              type="button"
            >
              <span className="ng-type-numeric">{row.dateLabel}</span>
              <span className="po-hs-cell--event">{row.label}</span>
              {withValue && (
                <span className="ng-type-numeric po-hs-cell--right">{row.value ?? '—'}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** The international panel: the reference's table, with the reason no row can be filled. */
export function HistoryInternationalPanel({ gap }: { readonly gap: OverviewGapModel | undefined }) {
  return (
    <section className="po-hs-panel po-hs-milestones po-hs-international" data-ng-region="history-international">
      <header className="po-hs-panel__head">
        <span className="po-hs-panel__title">International career</span>
      </header>
      <div className="po-hs-table" role="table">
        <div className="po-hs-table__head is-international" role="row">
          <span role="columnheader">Team</span>
          <span role="columnheader">GP</span>
          <span role="columnheader">PTS</span>
          <span role="columnheader">REB</span>
          <span role="columnheader">AST</span>
        </div>
        <p className="po-hs-empty">
          {gap?.reason ?? 'National team appearances are not part of the world model.'}
        </p>
      </div>
    </section>
  )
}

/* ── Band 4 · career totals ── */

export function HistoryCareerTotalsStrip({
  totals,
}: {
  readonly totals: HistoryCareerTotalsModel
}) {
  const cells = [
    { id: 'games', label: 'GAMES', value: String(totals.games) },
    { id: 'min', label: 'MIN/GAME', value: totals.minutesPerGame },
    { id: 'pts', label: 'PTS/GAME', value: totals.pointsPerGame },
    { id: 'reb', label: 'REB/GAME', value: totals.reboundsPerGame },
    { id: 'ast', label: 'AST/GAME', value: totals.assistsPerGame },
    { id: 'val', label: 'VAL/GAME', value: totals.valuationPerGame },
  ]

  return (
    <section className="po-hs-panel po-hs-totals" data-ng-region="history-totals">
      <span className="po-hs-totals__title">Career totals (professional)</span>
      <span className="po-hs-totals__cells">
        {cells.map((cell) => (
          <span className="po-hs-totals__cell" key={cell.id}>
            <span className="po-hs-totals__value ng-type-numeric">{cell.value}</span>
            <span className="po-hs-stat__label">{cell.label}</span>
          </span>
        ))}
      </span>
      <span className="po-hs-note">{totals.note}</span>
    </section>
  )
}

/* ── Right column · history detail ── */

/** Box-score strip of the detail panel. Empty when the event carries no box score. */
function DetailStats({ stats }: { readonly stats: readonly { id: string; label: string; value: string }[] }) {
  if (stats.length === 0) return null
  return (
    <div className="po-hs-detail__stats">
      {stats.map((stat) => (
        <span className="po-hs-detail__stat" key={stat.id}>
          <span className="po-hs-detail__stat-value ng-type-numeric">{stat.value}</span>
          <span className="po-hs-stat__label">{stat.label}</span>
        </span>
      ))}
    </div>
  )
}

function DetailMeta({ rows }: { readonly rows: readonly { id: string; label: string; value: string }[] }) {
  return (
    <dl className="po-hs-detail__meta">
      {rows.map((row) => (
        <div key={row.id}>
          <dt className="po-hs-stat__label">{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HistoryDetailPanel({
  detail,
  onClose,
}: {
  readonly detail: HistoryInspectorDetail | undefined
  readonly onClose: () => void
}) {
  return (
    <section className="po-hs-panel po-hs-detail" data-ng-region="history-detail">
      <header className="po-hs-panel__head">
        <span className="po-hs-panel__title">History detail</span>
      </header>

      {detail === undefined ? (
        <p className="po-hs-empty">Select an event from the timeline or the history tables.</p>
      ) : detail.kind === 'milestone' ? (
        <>
          <div className="po-hs-detail__heading">
            <span aria-hidden className="po-hs-detail__icon">
              ★
            </span>
            <span className="po-hs-detail__title">{detail.title}</span>
            <span className="po-hs-detail__date ng-type-numeric">{detail.dateLabel}</span>
          </div>
          {detail.contextLabel !== null && (
            <p className="po-hs-detail__context">{detail.contextLabel}</p>
          )}
          <p className="po-hs-detail__text">{detail.description}</p>
          <div className="po-hs-detail__image" title={detail.imageNote}>
            <span className="po-hs-detail__image-note">{detail.imageNote}</span>
          </div>
          <DetailStats stats={detail.stats} />
          <DetailMeta rows={detail.metadata} />
          <span className="po-hs-note">{detail.sourceNote}</span>
        </>
      ) : (
        <>
          <div className="po-hs-detail__heading">
            <span aria-hidden className="po-hs-detail__icon">
              ★
            </span>
            <span className="po-hs-detail__title">{detail.kind}</span>
          </div>
          <DetailMeta rows={detailRows(detail)} />
          <span className="po-hs-note">{detail.sourceNote}</span>
        </>
      )}

      {detail !== undefined && (
        <button className="po-hs-detail__reset" onClick={onClose} type="button">
          Clear selection
        </button>
      )}
    </section>
  )
}

/** Rows for the record-backed detail kinds the page still shows without a box score. */
function detailRows(detail: Exclude<HistoryInspectorDetail, { kind: 'milestone' }>) {
  switch (detail.kind) {
    case 'contract':
      return [
        { id: 'team', label: 'Team', value: detail.teamName },
        { id: 'term', label: 'Term', value: detail.termLabel },
        { id: 'status', label: 'Status', value: detail.statusLabel },
      ]
    case 'transaction':
      return [
        { id: 'event', label: 'Event', value: detail.transactionLabel },
        { id: 'date', label: 'Date', value: detail.occurredOnLabel },
        { id: 'team', label: 'Team', value: detail.teamContext },
      ]
    case 'medical':
      return [
        { id: 'injury', label: 'Injury', value: detail.injuryLabel },
        { id: 'severity', label: 'Severity', value: detail.severityLabel },
        { id: 'status', label: 'Status', value: detail.statusLabel },
        { id: 'injured', label: 'Injured on', value: detail.injuredOnLabel },
        { id: 'return', label: 'Expected return', value: detail.expectedReturnLabel },
        { id: 'duration', label: 'Duration', value: detail.durationLabel },
      ]
    case 'trade':
      return [
        { id: 'date', label: 'Executed on', value: detail.executedOnLabel },
        { id: 'from', label: 'From', value: detail.fromTeamName },
        { id: 'to', label: 'To', value: detail.toTeamName },
      ]
    case 'draft':
      return [
        { id: 'date', label: 'Drafted on', value: detail.selectedOnLabel },
        { id: 'team', label: 'Team', value: detail.teamName },
        { id: 'pick', label: 'Selection', value: detail.roundLabel },
      ]
    case 'ecosystem':
      return [
        { id: 'transition', label: 'Transition', value: detail.transitionLabel },
        { id: 'date', label: 'Effective on', value: detail.effectiveOnLabel },
        { id: 'route', label: 'Route', value: detail.routeLabel },
      ]
    case 'season':
      return [
        { id: 'season', label: 'Season', value: detail.seasonLabel },
        { id: 'competition', label: 'Competition', value: detail.competitionLabel ?? '—' },
        { id: 'games', label: 'Games', value: String(detail.gamesPlayed) },
        { id: 'pts', label: 'Points per game', value: detail.pointsPerGame },
      ]
  }
}

/** Two or three letters taken from the club name, used as the small badge the reference draws. */
function crestOf(name: string): string {
  const words = name.split(' ').filter((word) => word.length > 2)
  if (words.length === 0) return name.slice(0, 3).toUpperCase()
  return words
    .slice(0, 3)
    .map((word) => word[0]!.toUpperCase())
    .join('')
}
