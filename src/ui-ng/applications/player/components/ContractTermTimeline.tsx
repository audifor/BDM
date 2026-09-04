import type {
  ContractAgreementModel,
  ContractTimelineNodeModel,
} from '@/ui-ng/applications/player/data/buildPlayerContractModel'

export function ContractAgreementSummary({
  agreement,
}: {
  readonly agreement: ContractAgreementModel | null
}) {
  if (agreement === null) return null

  return (
    <section className="pc-agreement" data-ng-region="contract-agreement-summary">
      <header className="pc-panel-head">
        <span className="pc-panel-head__title">Current Agreement</span>
        <span className="pc-panel-head__meta">{agreement.statusLabel}</span>
      </header>
      <dl className="pc-agreement__grid">
        <div>
          <dt>Team</dt>
          <dd>{agreement.teamName}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{agreement.contractType}</dd>
        </div>
        <div>
          <dt>Start</dt>
          <dd>{agreement.startDate}</dd>
        </div>
        <div>
          <dt>End</dt>
          <dd>{agreement.endDate}</dd>
        </div>
        {agreement.remainingLabel !== null && (
          <div>
            <dt>Term</dt>
            <dd>{agreement.remainingLabel}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}

export function ContractTermTimeline({
  nodes,
  selectedItemId,
  onSelectItem,
}: {
  readonly nodes: readonly ContractTimelineNodeModel[]
  readonly selectedItemId: string | null
  readonly onSelectItem: (itemId: string) => void
}) {
  if (nodes.length === 0) {
    return (
      <section className="pc-timeline pc-timeline--empty" data-ng-region="contract-term-timeline">
        <header className="pc-panel-head">
          <span className="pc-panel-head__title">Contract Term</span>
        </header>
        <p className="pc-panel-empty">No contract term timeline available.</p>
      </section>
    )
  }

  return (
    <section className="pc-timeline" data-ng-region="contract-term-timeline">
      <header className="pc-panel-head">
        <span className="pc-panel-head__title">Contract Term</span>
        <span className="pc-panel-head__meta">{nodes.length} seasons</span>
      </header>
      <div className="pc-timeline__track">
        {nodes.map((node, index) => {
          const selected = selectedItemId === node.id
          return (
            <button
              aria-pressed={selected}
              className={`pc-timeline-node pc-timeline-node--${node.state}${selected ? ' is-selected' : ''}`}
              key={node.id}
              onClick={() => onSelectItem(node.id)}
              type="button"
            >
              <span className="pc-timeline-node__marker" />
              {index < nodes.length - 1 && <span className="pc-timeline-node__connector" />}
              <span className="pc-timeline-node__season">{node.seasonLabel}</span>
              {node.markerLabel !== null && (
                <span className="pc-timeline-node__marker-label">{node.markerLabel}</span>
              )}
              {node.guaranteeLabel !== null && (
                <span className="pc-timeline-node__guarantee">{node.guaranteeLabel}</span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
