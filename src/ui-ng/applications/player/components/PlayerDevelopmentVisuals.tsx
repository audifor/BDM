
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'
import type { PlayerDevelopmentModel } from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'
import { CATEGORY_TONE } from './DevelopmentBoardPanels'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

type Development = PlayerDevelopmentModel

export function DevelopmentHeroVisual({ data }: { readonly data: Development }) {
  const { overview, lifecycle } = data
  return <div className="po-dev-v2__hero" data-ng-region="development-hero">
    <section className="po-dev-v2__hero-tile is-stage">
      <span className="po-dev-v2__eyebrow">CAREER PHASE</span>
      <strong className="po-dev-v2__hero-value">{overview.careerStageLabel}</strong>
      <ol className="po-dev-v2__stages" aria-label="Career stages">{lifecycle.stages.map(stage =>
        <li key={stage.id} className={stage.isCurrent ? 'is-current' : ''}><i /><span>{stage.label}</span></li>
      )}</ol>

    </section>
    <section className={'po-dev-v2__hero-tile is-trend is-' + overview.trendTone}>
      <span className="po-dev-v2__eyebrow">AGE-BASED TREND</span>
      <div className="po-dev-v2__trend-reading"><b aria-hidden="true">{overview.trendTone === 'negative' ? '↘' : overview.trendTone === 'positive' ? '↗' : '→'}</b>
        <strong className="po-dev-v2__hero-value">{overview.trendLabel}</strong><span>/ transition</span></div>

    </section>
    <section className="po-dev-v2__hero-tile is-checkpoint">
      <span className="po-dev-v2__eyebrow">NEXT CHECKPOINT</span>
      <strong className="po-dev-v2__hero-value">{overview.nextEvaluationLabel}</strong>
      <span className="po-dev-v2__checkpoint-count">▦ &nbsp; {overview.nextEvaluationNote}</span>

    </section>
    <section className="po-dev-v2__hero-tile is-potential">
      <span className="po-dev-v2__eyebrow">SCOUTED POTENTIAL</span>
      <strong className="po-dev-v2__hero-value">{lifecycle.potentialStatus === 'available' ? lifecycle.potentialLabel : 'Unknown'}</strong>

    </section>
  </div>
}

export function DevelopmentFamilyVisual({ data, selected, onSelect }: {
  readonly data: Development; readonly selected: RatingCategory; readonly onSelect: (id: RatingCategory) => void
}) {
  const recorded = data.categoryCurve.some(entry => entry.points.length > 1)
  return <section className="po-dev-v2__panel po-dev-v2__families" data-ng-region="development-categories">
    <header className="po-dev-v2__panel-head"><h3>Category development</h3><span>8 FAMILIES</span></header>
    <div className="po-dev-v2__family-list">{data.categoryDevelopment.map(row =>
      <button type="button" key={row.id} aria-pressed={selected === row.id} onClick={() => onSelect(row.id)}
        className={'po-dev-v2__family is-' + CATEGORY_TONE[row.id] + (selected === row.id ? ' is-selected' : '')}>
        <span className="po-dev-v2__family-title"><i />{row.categoryLabel}</span>
        <strong>{row.current}</strong>
        <span className="po-dev-v2__family-meter"><i style={{ width: Math.max(0, Math.min(100, row.current)) + '%' }} /></span>
        <span className={'po-dev-v2__family-delta' + (row.trend < 0 ? ' is-down' : '')}>{recorded ? (row.trend > 0 ? '↑ +' : row.trend < 0 ? '↓ ' : '→ ') + row.trend : '—'}</span>
      </button>
    )}</div>

  </section>
}

export function DevelopmentCurveVisual({ data, selected, onSelect }: {
  readonly data: Development; readonly selected: RatingCategory; readonly onSelect: (id: RatingCategory) => void
}) {
  const focus = data.categoryCurve.find(entry => entry.id === selected)
  const recorded = data.categoryCurve.some(entry => entry.points.length > 1)
  const x = (index: number, total: number) => 6 + (total < 2 ? 0 : index / (total - 1) * 88)
  const y = (value: number) => 91 - Math.max(0, Math.min(100, value)) * .8
  return <section className="po-dev-v2__panel po-dev-v2__curve" data-ng-region="development-curve">
    <header className="po-dev-v2__panel-head"><h3>Career development curve</h3><span>{recorded ? 'RECORDED' : 'AWAITING CHECKPOINT'}</span></header>
    <div className="po-dev-v2__curve-reading"><span>{focus?.label ?? 'Selected family'}</span><strong>{focus?.points.at(-1) ?? '—'}</strong>{recorded && <small>{((focus?.delta ?? 0) > 0 ? '+' : '') + (focus?.delta ?? 0) + ' recorded'}</small>}</div>
    {recorded ? <div className="po-dev-v2__chart-area">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={'Recorded category trajectory: ' + (focus?.label ?? '')}>
        {[10,30,50,70,90].map(n => <line key={n} x1={6} x2={94} y1={n} y2={n} className="po-dev-v2__chart-grid" vectorEffect="non-scaling-stroke" />)}
        {data.categoryCurve.filter(entry => entry.points.length > 1).map(entry =>
          <polyline key={entry.id} className={'po-dev-v2__chart-line is-' + CATEGORY_TONE[entry.id] + (entry.id === selected ? ' is-selected' : '')}
            points={entry.points.map((p,i) => x(i,entry.points.length).toFixed(1) + ',' + y(p).toFixed(1)).join(' ')} vectorEffect="non-scaling-stroke" />
        )}
        {focus?.points.map((p,i) => <circle key={i} className="po-dev-v2__chart-dot" cx={x(i,focus.points.length)} cy={y(p)} r={i === focus.points.length-1 ? 1.7 : 1} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="po-dev-v2__chart-axis"><span>FIRST RECORDED</span><span>CURRENT</span></div>
    </div> : <div className="po-dev-v2__empty-chart"><div aria-hidden="true"><i /><i /><i /><i /><i /></div><strong>NO RECORDED CURVE</strong></div>}
    <div className="po-dev-v2__curve-switcher" role="group" aria-label="Development curve family">{data.categoryCurve.map(row => <button key={row.id} type="button" aria-pressed={selected === row.id} onClick={() => onSelect(row.id)} className={'is-'+CATEGORY_TONE[row.id]}><i />{row.label}</button>)}</div>
  </section>
}

export function DevelopmentDetailVisual({ data, selected }: { readonly data: Development; readonly selected: RatingCategory }) {
  const detail = data.detailByCategory[selected]
  if (!detail) return null
  const hasHistory = data.categoryCurve.some(row => row.points.length > 1)
  return <section className={'po-dev-v2__panel po-dev-v2__detail is-' + CATEGORY_TONE[selected]} data-ng-region="development-detail">
    <header className="po-dev-v2__panel-head"><h3>Development detail</h3></header>
    <div className="po-dev-v2__detail-name"><b aria-hidden="true">◎</b><strong>{detail.categoryLabel.toUpperCase()}</strong></div>
    <div className="po-dev-v2__detail-stats"><div><span>CURRENT</span><strong>{detail.current}</strong></div><div><span>RECORDED Δ</span><strong className={detail.trend < 0 ? 'is-down' : ''}>{hasHistory ? (detail.trend > 0 ? '+' : '') + detail.trend : '—'}</strong></div></div>
    <div className="po-dev-v2__detail-meter"><i style={{width:Math.max(0,Math.min(100,detail.current))+'%'}} /></div>
    <div className="po-dev-v2__detail-rate"><span>DEVELOPMENT RATE</span><strong className={'is-'+detail.rateTone}>{detail.rateLabel}</strong></div>
    <div className="po-dev-v2__detail-lists">
      <div><span>IMPROVING</span>{detail.improvements.length ? <ul>{detail.improvements.map(x=><li key={x}>↑ {x}</li>)}</ul> : <small>Not recorded yet</small>}</div>
      <div><span>AREAS TO WORK</span><ul>{detail.toImprove.map(x=><li key={x}>◇ {x}</li>)}</ul></div>
    </div>

  </section>
}

export function DevelopmentTrainingVisual({ data }: { readonly data: Development }) {
  const plan = data.trainingPlan
  const ctx = data.trainingContext
  const intensity = ctx.individualPlanActive ? ctx.individualIntensity : ctx.teamIntensity
  return <section className="po-dev-v2__panel po-dev-v2__training" data-ng-region="development-training-plan">
    <header className="po-dev-v2__panel-head"><h3>Training plan</h3><span>{ctx.individualPlanActive ? 'INDIVIDUAL' : 'TEAM'}</span></header>
    <div className="po-dev-v2__training-focus"><b aria-hidden="true">◎</b><div><span>CURRENT FOCUS</span><strong>{plan.focusLabel}</strong></div></div>
    <div className="po-dev-v2__training-controls"><div><span>ASSIGNED INTENSITY</span><div className="po-dev-v2__intensity">{[1,2,3].map(n=><i key={n} className={plan.loadFill !== null && plan.loadFill >= n*28 ? 'is-on' : ''} />)}</div><strong>{intensity ?? 'Not assigned'}</strong></div>
      <button type="button" onClick={() => syncWorkspaceAppQuery('training','push')}>OPEN TRAINING ↗</button></div>
  </section>
}

export function DevelopmentStimulusVisual({ data }: { readonly data: Development }) {
  const effect = data.trainingEffect
  const max = Math.max(0, ...effect.rows.map(row => row.impact))
  return <section className="po-dev-v2__panel po-dev-v2__stimulus" data-ng-region="development-training-effect">
    <header className="po-dev-v2__panel-head"><h3>Season stimulus</h3><span>{effect.confidenceLabel}</span></header>
    {effect.rows.length ? <div className="po-dev-v2__stimulus-list">{effect.rows.map(row => <div key={row.id} className={'po-dev-v2__stimulus-row is-'+CATEGORY_TONE[row.id]}>
      <span>{row.label}</span><div><i style={{width:(max?row.impact/max*100:0)+'%'}} /></div><strong>{row.impact.toFixed(1)}</strong>
    </div>)}</div> : <div className="po-dev-v2__silent-state"><strong>NO CANONICAL STIMULUS YET</strong><span>Appears after recorded training activity</span></div>}

  </section>
}

export function DevelopmentTimelineVisual({ data }: { readonly data: Development }) {
  const events = data.longitudinal.events.slice(0,3)
  return <section className="po-dev-v2__panel po-dev-v2__timeline" data-ng-region="development-events">
    <header className="po-dev-v2__panel-head"><h3>Development events</h3><span>{data.longitudinal.events.length} LOGGED</span></header>
    {events.length ? <ol>{events.map(row=><li key={row.id} className={'is-'+row.kind} title={row.detail}><i>{row.kind==='injury' ? '+' : '◆'}</i><span>{row.dateLabel}</span><strong>{row.label}</strong><b>{row.impact === null ? '—' : (row.impact > 0 ? '+' : '') + row.impact}</b></li>)}</ol>
      : <div className="po-dev-v2__silent-state"><strong>NO EVENTS RECORDED</strong><span>Transitions and injuries form the timeline</span></div>}
  </section>
}
