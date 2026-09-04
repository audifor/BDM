import type { HistoryInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'

export function HistoryDetailInspector({
  detail,
}: {
  readonly detail: HistoryInspectorDetail | undefined
}) {
  if (detail === undefined) {
    return (
      <div className="ph-inspector ph-inspector--empty" data-ng-region="history-inspector">
        <p className="ph-inspector__hint">Select a history event to inspect recorded details.</p>
      </div>
    )
  }

  if (detail.kind === 'contract') {
    return (
      <div className="ph-inspector" data-ng-region="history-inspector">
        <header className="ph-inspector__head">
          <span className="ph-inspector__title">{detail.teamName}</span>
          <span className="ph-inspector__meta">Contract</span>
        </header>
        <dl className="ph-inspector__list">
          <div>
            <dt>Term</dt>
            <dd>{detail.termLabel}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{detail.statusLabel}</dd>
          </div>
        </dl>
        <p className="ph-inspector__note">{detail.sourceNote}</p>
      </div>
    )
  }

  if (detail.kind === 'transaction') {
    return (
      <div className="ph-inspector" data-ng-region="history-inspector">
        <header className="ph-inspector__head">
          <span className="ph-inspector__title">{detail.transactionLabel}</span>
          <span className="ph-inspector__meta">Transaction</span>
        </header>
        <dl className="ph-inspector__list">
          <div>
            <dt>Date</dt>
            <dd>{detail.occurredOnLabel}</dd>
          </div>
          <div>
            <dt>Team</dt>
            <dd>{detail.teamContext}</dd>
          </div>
        </dl>
        <p className="ph-inspector__note">{detail.sourceNote}</p>
      </div>
    )
  }

  if (detail.kind === 'medical') {
    return (
      <div className="ph-inspector" data-ng-region="history-inspector">
        <header className="ph-inspector__head">
          <span className="ph-inspector__title">{detail.injuryLabel}</span>
          <span className="ph-inspector__meta">Medical</span>
        </header>
        <dl className="ph-inspector__list">
          <div>
            <dt>Severity</dt>
            <dd>{detail.severityLabel}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{detail.statusLabel}</dd>
          </div>
          <div>
            <dt>Injured</dt>
            <dd>{detail.injuredOnLabel}</dd>
          </div>
          <div>
            <dt>Expected return</dt>
            <dd>{detail.expectedReturnLabel}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{detail.durationLabel}</dd>
          </div>
        </dl>
        <p className="ph-inspector__note">{detail.sourceNote}</p>
      </div>
    )
  }

  if (detail.kind === 'trade') {
    return (
      <div className="ph-inspector" data-ng-region="history-inspector">
        <header className="ph-inspector__head">
          <span className="ph-inspector__title">Trade</span>
          <span className="ph-inspector__meta">{detail.executedOnLabel}</span>
        </header>
        <dl className="ph-inspector__list">
          <div>
            <dt>From</dt>
            <dd>{detail.fromTeamName}</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>{detail.toTeamName}</dd>
          </div>
        </dl>
        <p className="ph-inspector__note">{detail.sourceNote}</p>
      </div>
    )
  }

  if (detail.kind === 'draft') {
    return (
      <div className="ph-inspector" data-ng-region="history-inspector">
        <header className="ph-inspector__head">
          <span className="ph-inspector__title">{detail.teamName}</span>
          <span className="ph-inspector__meta">Draft</span>
        </header>
        <dl className="ph-inspector__list">
          <div>
            <dt>Date</dt>
            <dd>{detail.selectedOnLabel}</dd>
          </div>
          <div>
            <dt>Selection</dt>
            <dd>{detail.roundLabel}</dd>
          </div>
        </dl>
        <p className="ph-inspector__note">{detail.sourceNote}</p>
      </div>
    )
  }

  if (detail.kind === 'ecosystem') {
    return (
      <div className="ph-inspector" data-ng-region="history-inspector">
        <header className="ph-inspector__head">
          <span className="ph-inspector__title">{detail.transitionLabel}</span>
          <span className="ph-inspector__meta">{detail.effectiveOnLabel}</span>
        </header>
        <dl className="ph-inspector__list">
          <div>
            <dt>Route</dt>
            <dd>{detail.routeLabel}</dd>
          </div>
        </dl>
        <p className="ph-inspector__note">{detail.sourceNote}</p>
      </div>
    )
  }

  return (
    <div className="ph-inspector" data-ng-region="history-inspector">
      <header className="ph-inspector__head">
        <span className="ph-inspector__title">{detail.seasonLabel}</span>
        <span className="ph-inspector__meta">Season participation</span>
      </header>
      <dl className="ph-inspector__list">
        <div>
          <dt>Competition</dt>
          <dd>{detail.competitionLabel ?? '—'}</dd>
        </div>
        <div>
          <dt>Games</dt>
          <dd>{detail.gamesPlayed}</dd>
        </div>
        <div>
          <dt>PPG</dt>
          <dd>{detail.pointsPerGame}</dd>
        </div>
      </dl>
      <p className="ph-inspector__note">{detail.sourceNote}</p>
    </div>
  )
}
