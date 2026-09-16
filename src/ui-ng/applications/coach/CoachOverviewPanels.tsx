/*
 * Coach · Overview — the three macro-panels of the first row.
 * Character Core is the visual anchor; Current Status and Personal Economy & Power support it.
 */

import type { CoachOverviewModel } from '@/ui-ng/applications/coach/coachOverviewMock'
import {
  HorizontalValueBar,
  MiniDonutChart,
  OverviewPanelHeader,
  RadarChart,
  SegmentedMeter,
} from '@/ui-ng/applications/coach/CoachOverviewCharts'
import { OverviewGlyph } from '@/ui-ng/applications/coach/CoachOverviewGlyph'

export function CharacterCorePanel({ model }: { readonly model: CoachOverviewModel }) {
  const { identity, attributes, personality } = model
  const xpPercent = Math.min(100, (identity.careerXp.current / identity.careerXp.max) * 100)

  return (
    <section className="ng-canon__panel ng-holo-panel co-panel co-panel--core">
      <OverviewPanelHeader icon="userRound" title="Character core" />
      <div className="co-core">
        <div className="co-core__identity">
          <div className="co-identity__top">
            <span className="co-identity__name">{identity.name}</span>
            <span className="co-identity__level">Lv {identity.level}</span>
          </div>
          <p className="co-identity__role">
            {identity.role}
            <span className="co-identity__role-sep" aria-hidden />
            {identity.club}
          </p>

          <dl className="co-identity__rows">
            {identity.rows.map((row) => (
              <div className="co-identity__row" key={row.id} title={row.tooltip}>
                <dt>{row.label}</dt>
                <dd className={row.tone === undefined ? undefined : `co-tone-text--${row.tone}`}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="co-identity__xp">
            <div className="co-identity__xp-head">
              <span className="co-block__title">Career XP</span>
              <span className="co-identity__xp-value">
                {identity.careerXp.current.toLocaleString('en-US')}
                <span className="co-identity__xp-max">
                  {' / '}
                  {identity.careerXp.max.toLocaleString('en-US')}
                </span>
              </span>
            </div>
            <span
              aria-label={`Career XP ${identity.careerXp.current} of ${identity.careerXp.max}`}
              className="co-identity__xp-track"
              role="img"
            >
              <span className="co-identity__xp-fill" style={{ width: `${xpPercent}%` }} />
            </span>
          </div>

          <div className="co-identity__points" title="Unspent development points">
            <span className="co-identity__points-label">Development points</span>
            <span className="co-identity__points-box">{identity.developmentPoints}</span>
          </div>
        </div>

        <div className="co-core__attributes">
          <p className="co-block__title">Character attributes</p>
          <RadarChart label="Character attributes" points={attributes} />
        </div>

        <div className="co-core__personality">
          <p className="co-block__title">Personality dimensions</p>
          <div className="co-core__traits">
            {personality.traits.map((trait) => (
              <HorizontalValueBar
                key={trait.id}
                label={trait.label}
                title={trait.tooltip}
                tone={trait.tone}
                value={trait.value}
              />
            ))}
          </div>
          <p className="co-core__motto">{personality.motto}</p>
        </div>
      </div>
    </section>
  )
}

export function CurrentStatusPanel({
  model,
  onSelectStatus,
}: {
  readonly model: CoachOverviewModel
  readonly onSelectStatus?: (id: string) => void
}) {
  return (
    <section className="ng-canon__panel ng-holo-panel co-panel co-panel--status">
      <OverviewPanelHeader
        aside={<span className="co-panel__hint">What&apos;s happening now</span>}
        icon="activity"
        title="Current status"
      />
      <ul className="co-status">
        {model.status.map((row) => (
          <li className="co-status__item" key={row.id}>
            <button
              className={`co-status__row co-tone-edge--${row.tone}`}
              onClick={onSelectStatus === undefined ? undefined : () => onSelectStatus(row.id)}
              title={row.tooltip}
              type="button"
            >
              <span className={`co-status__icon co-tone-text--${row.tone}`}>
                <OverviewGlyph name={row.icon} size={15} />
              </span>
              <span className="co-status__body">
                <span className="co-status__title">{row.title}</span>
                <span className="co-status__detail">{row.detail}</span>
              </span>
              <span className={`co-status__badge co-tone-text--${row.tone}`}>{row.badge}</span>
              <OverviewGlyph className="co-status__chevron" name="chevronRight" size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="co-status__risk">
        <p className="co-block__title">Heat / Risk monitor</p>
        <div className="co-status__risk-rows">
          {model.risks.map((risk) => (
            <SegmentedMeter
              key={risk.id}
              filled={risk.filled}
              label={risk.label}
              title={risk.tooltip}
              tone={risk.tone}
              total={risk.total}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export function PersonalEconomyPowerPanel({ model }: { readonly model: CoachOverviewModel }) {
  return (
    <section className="ng-canon__panel ng-holo-panel co-panel co-panel--economy">
      <OverviewPanelHeader
        aside={<span className="co-panel__hint">Resources. Influence. Leverage.</span>}
        icon="wallet"
        title="Personal economy & power"
      />
      <div className="co-economy">
        <div className="co-economy__resources">
          <p className="co-block__title">Resources</p>
          <ul className="co-resource-list">
            {model.finances.map((row) => (
              <li className="co-resource" key={row.id} title={row.tooltip}>
                <span className={`co-resource__icon co-tone-text--${row.tone ?? 'cyan'}`}>
                  <OverviewGlyph name={row.icon} size={14} />
                </span>
                <span className="co-resource__label">{row.label}</span>
                <span className={`co-resource__value co-tone-text--${row.tone ?? 'neutral'}`}>
                  {row.value}
                </span>
              </li>
            ))}
          </ul>

          <div className="co-favors">
            <div className="co-favors__item">
              <span className="co-favors__label">Favors Owed</span>
              <span className="co-favors__value">{model.favors.owed}</span>
            </div>
            <div className="co-favors__item">
              <span className="co-favors__label">Favors Held</span>
              <span className="co-favors__value co-tone-text--gold">{model.favors.held}</span>
            </div>
          </div>

          <ul className="co-network-list">
            {model.network.map((row) => (
              <li className="co-network" key={row.id} title={row.tooltip}>
                <span className="co-network__label">{row.label}</span>
                <span className={`co-network__value co-tone-text--${row.tone}`}>{row.value}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="co-economy__power">
          <p className="co-block__title">Fund allocation</p>
          <MiniDonutChart
            centerCaption={model.allocation.caption}
            centerValue={model.allocation.total}
            label="Fund allocation"
            slices={model.allocation.slices}
          />
          <div className="co-power">
            <div className="co-power__head">
              <span className="co-block__title">Power status</span>
              <span className="co-power__standing co-tone-text--gold">{model.power.label}</span>
            </div>
            <SegmentedMeter
              filled={model.power.filled}
              label="Leverage"
              title={model.power.tooltip}
              tone="gold"
              total={model.power.total}
            />
            <p className="co-power__caption">{model.power.caption}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
