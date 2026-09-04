import type {
  MedicalFatigueModel,
  MedicalRiskModel,
} from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'

export function MedicalFatigueInstrument({
  fatigue,
  risk,
  riskUnavailableLabel,
}: {
  readonly fatigue: MedicalFatigueModel
  readonly risk: MedicalRiskModel | null
  readonly riskUnavailableLabel: string | null
}) {
  return (
    <section className="pm-fatigue" data-ng-region="medical-fatigue">
      <header className="pm-panel-head">
        <span className="pm-panel-head__title">Career load</span>
        <span className={`pm-fatigue__load pm-fatigue__load--${fatigue.loadTone}`}>{fatigue.loadLabel}</span>
      </header>
      <div className="pm-fatigue__body">
        <div className="pm-fatigue__readout">
          <span className="pm-stat-value pm-stat-value--primary ng-type-numeric">{fatigue.value}</span>
          <span className="pm-stat-label pm-stat-label--secondary">Career fatigue · 0–100</span>
        </div>
        <div aria-hidden="true" className="pm-fatigue__track">
          <span className="pm-fatigue__fill" style={{ width: `${fatigue.value}%` }} />
        </div>
        <p className="pm-fatigue__note">
          Daily passive recovery · {fatigue.dailyRecoveryRate} per day when not training
        </p>
        {risk !== null ? (
          <div className="pm-fatigue__risk">
            <div className="pm-fatigue__risk-head">
              <span className="pm-stat-label pm-stat-label--secondary">Injury risk</span>
              <span className={`pm-fatigue__risk-value pm-fatigue__risk-value--${risk.riskBand} ng-type-numeric`}>
                {risk.displayLabel}
              </span>
            </div>
            {risk.primaryReason !== null && (
              <p className="pm-fatigue__risk-reason">{risk.primaryReason}</p>
            )}
          </div>
        ) : riskUnavailableLabel !== null ? (
          <p className="pm-fatigue__note">{riskUnavailableLabel}</p>
        ) : null}
      </div>
    </section>
  )
}
