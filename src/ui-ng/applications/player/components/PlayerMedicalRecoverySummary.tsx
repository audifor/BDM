import type { PlayerMedicalModel } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'

/** Reads the existing four engine-backed availability milestones without
 * inventing treatment phases, clearance dates or recovery percentages. */
export function PlayerMedicalRecoverySummary({ medical }: { readonly medical: PlayerMedicalModel }) {
  if (medical.activeInjury === null) return null
  const byId = new Map(medical.recoveryMilestones.map(item => [item.id, item]))
  const training = byId.get('training')
  const match = byId.get('match-play')
  const season = byId.get('season')
  const states = [training, match, season].filter((value): value is NonNullable<typeof value> => value !== undefined)
  return <section className="po-med-recovery-summary" data-ng-region="medical-recovery-timeline">
    <header>
      <span>RECOVERY OUTLOOK</span>
      <small>Recorded injury · current availability</small>
    </header>
    <div className="po-med-recovery-summary__next">
      <div><small>NEXT RECORDED REVIEW</small><strong>{medical.activeInjury.reviewDueLabel}</strong></div>
      <span aria-hidden="true">✚</span>
    </div>
    <div className="po-med-recovery-summary__states">
      {states.map(item => <div key={item.id} className={'is-' + item.tone}>
        <span>{item.label.toUpperCase()}</span>
        <strong>{item.stateLabel}</strong>
      </div>)}
    </div>
  </section>
}
