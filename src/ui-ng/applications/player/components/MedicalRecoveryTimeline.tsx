import type { MedicalRecoveryTimelineNodeModel } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'

export function MedicalRecoveryTimeline({
  nodes,
}: {
  readonly nodes: readonly MedicalRecoveryTimelineNodeModel[]
}) {
  return (
    <section className="pm-recovery" data-ng-region="medical-recovery-timeline">
      <header className="pm-panel-head">
        <span className="pm-panel-head__title">Recovery timeline</span>
      </header>
      {nodes.length === 0 ? (
        <p className="pm-panel-empty">No active recovery timeline.</p>
      ) : (
        <ol className="pm-recovery__track">
          {nodes.map((node) => (
            <li className={`pm-recovery-node pm-recovery-node--${node.state}`} key={node.id}>
              <span className="pm-recovery-node__marker" />
              <div className="pm-recovery-node__content">
                <span className="pm-recovery-node__label">{node.label}</span>
                <span className="pm-recovery-node__date">{node.dateLabel}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
