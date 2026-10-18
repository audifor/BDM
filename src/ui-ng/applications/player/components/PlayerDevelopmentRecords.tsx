import { useMemo, useState } from 'react'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { PlayerTruthRatingKey } from '@/domain/player'
import type { PlayerDevelopmentModel } from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'
import { ratingCategory, ratingLabel } from '@/ui-ng/applications/player/data/ratingCatalog'

type RecordTab = 'stimulus' | 'drivers' | 'projection' | 'notes'
type RatingDelta = { readonly before: number; readonly after: number; readonly delta: number }

export function PlayerDevelopmentRecords({
  world, playerId, development,
}: {
  readonly world: GameWorld | null
  readonly playerId: PlayerId
  readonly development: PlayerDevelopmentModel
}) {
  const [trainingLimit, setTrainingLimit] = useState(12)
  const [stimulusLimit, setStimulusLimit] = useState(40)
  const [activeTab, setActiveTab] = useState<RecordTab>('stimulus')

  const training = useMemo(() => world === null ? [] : Object.values(world.scheduledTrainingSessionsById)
    .flatMap((session) => {
      const participant = session.execution?.participants.find((entry) => entry.playerId === playerId)
      return participant === undefined ? [] : [{ session, participant }]
    }).sort((left, right) => right.session.date.localeCompare(left.session.date)), [world, playerId])

  const checkpoints = useMemo(() =>
    [...(world?.playerRatingHistoryByPlayerId[playerId] ?? [])].reverse(), [world, playerId])

  const stimulusEvents = useMemo(() => world === null ? [] :
    Object.values(world.developmentStimulusEventsById)
      .filter((event) => event.playerId === playerId)
      .sort((a,b) => b.date.localeCompare(a.date)), [world, playerId])

  return <section className="po-dev-v2__records" data-ng-region="development-records">
    <div className="po-dev-v2__record-stats" aria-label="Development records totals">
      <div><span>TRAINING SESSIONS</span><strong>{training.length}</strong><small>Completed sessions</small></div>
      <div><span>RATING CHECKPOINTS</span><strong>{checkpoints.length}</strong><small>Saved season changes</small></div>
      <div><span>STIMULUS SOURCES</span><strong>{stimulusEvents.length}</strong><small>Match and training entries</small></div>
    </div>
    <div className="po-dev-v2__records-grid">
      <section className="po-dev-v2__record-column" data-ng-region="player-training-history">
        <header className="po-dev-v2__record-head"><div><span className="po-dev-v2__record-icon">◎</span><h3>Training sessions</h3></div><b>{training.length}</b></header>
        <div className="po-dev-v2__records-list">
          {training.length === 0 ? <RecordEmpty icon="◎" label="NO SESSIONS YET" hint="Completed training will appear here" /> :
            <ol className="po-dev-v2__training-log">{training.slice(0,trainingLimit).map(({session,participant}) => {
              const execution = session.execution!
              const event = participant.developmentStimulusEventId === undefined ? undefined : world?.developmentStimulusEventsById[participant.developmentStimulusEventId]
              const amount = event === undefined ? null : Object.values(event.byRating).reduce<number>((sum,value)=>sum+(value??0),0)
              const staff = execution.executingStaffPersonIds.map(id=>{
                const person=world?.staffPeopleById[id]
                return person ? [person.identity.firstName,person.identity.lastName].join(' ') : 'Unassigned'
              }).join(', ') || 'Unassigned'
              return <li key={session.id}>
                <span className="po-dev-v2__record-date">{session.date}</span>
                <div className="po-dev-v2__session-heading"><strong>{execution.moduleName}</strong><span>{String(participant.participation)}</span></div>
                <div className="po-dev-v2__session-metrics">
                  <span>FATIGUE <b className={participant.careerFatigueDelta>0?'is-negative':''}>{participant.careerFatigueDelta>0?'+':''}{participant.careerFatigueDelta.toFixed(1)}</b></span>
                  <span>STIMULUS <b>{amount === null ? '—' : amount.toFixed(2)}</b></span>
                </div>
                <details><summary>Session details</summary>
                  <div className="po-dev-v2__session-more"><span>Staff: {staff}</span>
                    <span>Injuries: {participant.injuryIds.length === 0 ? 'None' : participant.injuryIds.map(id=>world?.injuriesById[id]?.kind ?? 'Injury').join(', ')}</span>
                  </div>
                </details>
              </li>
            })}</ol>}
        </div>
        {training.length > trainingLimit && <button type="button" className="po-dev-v2__load-more" onClick={()=>setTrainingLimit(n=>n+12)}>SHOW 12 MORE <span>{training.length-trainingLimit} remaining</span></button>}
      </section>

      <section className="po-dev-v2__record-column" data-ng-region="player-rating-truth-history">
        <header className="po-dev-v2__record-head"><div><span className="po-dev-v2__record-icon">↗</span><h3>Rating checkpoints</h3></div><b>{checkpoints.length}</b></header>
        <div className="po-dev-v2__records-list">
          {checkpoints.length === 0 ? <RecordEmpty icon="↗" label="FIRST CHECKPOINT PENDING" hint={development.overview.nextEvaluationLabel} /> :
            <div className="po-dev-v2__checkpoint-list">{checkpoints.map(checkpoint=>{
              const changes = Object.entries(checkpoint.truthDeltas ?? {}) as [PlayerTruthRatingKey,RatingDelta][]
              const total = changes.reduce((sum,[,delta])=>sum+delta.delta,0)
              const growing = changes.filter(([,delta])=>delta.delta>0).length
              const falling = changes.filter(([,delta])=>delta.delta<0).length
              return <details key={checkpoint.cycleId ?? String(checkpoint.seasonId)}>
                <summary>
                  <span className="po-dev-v2__checkpoint-date">{checkpoint.checkpointDate ?? String(checkpoint.seasonId)}</span>
                  <strong>{changes.length ? changes.length+' ATTRIBUTE CHANGES' : 'LEGACY CHECKPOINT'}</strong>
                  <span className={'po-dev-v2__checkpoint-net '+(total<0?'is-negative':'')}>{changes.length ? (total>0?'+':'')+total : '—'}</span>
                  <span className="po-dev-v2__checkpoint-breakdown"><b>↑ {growing}</b><b>↓ {falling}</b></span>
                </summary>
                {changes.length ? <ul>{changes.sort(([a],[b])=>ratingCategory(a).localeCompare(ratingCategory(b)) || a.localeCompare(b)).map(([key,delta])=>
                  <li key={key}><span>{ratingLabel(key)}</span><small>{delta.before} → {delta.after}</small><strong className={delta.delta<0?'is-negative':'is-positive'}>{delta.delta>0?'+':''}{delta.delta}</strong></li>
                )}</ul> : <p className="po-dev-v2__record-note">No canonical 80-attribute changes were recorded for this checkpoint.</p>}
              </details>
            })}</div>}
          <section className="po-dev-v2__movers">
            <h4>RATING MOVERS</h4>
            {development.longitudinal.movers.length ? development.longitudinal.movers.slice(0,8).map(row=>
              <div key={row.id}><span>{row.label}</span><strong className={row.delta<0?'is-negative':'is-positive'}>{row.delta>0?'+':''}{row.delta}</strong></div>
            ) : <span className="po-dev-v2__record-note">No rating movement recorded</span>}
          </section>
        </div>
      </section>

      <section className="po-dev-v2__record-column" data-ng-region="development-record-intelligence">
        <header className="po-dev-v2__record-head"><div><span className="po-dev-v2__record-icon">◇</span><h3>Development intelligence</h3></div></header>
        <div className="po-dev-v2__record-tabs" role="group" aria-label="Record intelligence view">
          {([['stimulus','STIMULUS'],['drivers','FACTORS'],['projection','SCOUTING'],['notes','NOTES']] as const).map(([id,label])=>
            <button type="button" key={id} aria-pressed={activeTab===id} onClick={()=>setActiveTab(id)}>{label}</button>)}
        </div>
        <div className="po-dev-v2__records-list">
          {activeTab==='stimulus' && <div data-ng-region="development-stimulus-sources">
            {stimulusEvents.length===0 ? <RecordEmpty icon="◇" label="NO SOURCES RECORDED" hint="Training and matches generate stimulus entries" /> :
              <ol className="po-dev-v2__stimulus-history">{stimulusEvents.slice(0,stimulusLimit).map(event=>{
                const values = Object.entries(event.byRating).filter(([,n])=>n!==undefined && n>0).sort((a,b)=>(b[1]??0)-(a[1]??0))
                const total = values.reduce((sum,[,value])=>sum+(value??0),0)
                return <li key={event.id}><div><span>{event.date}</span><b>{event.sourceType==='match'?'MATCH':'TRAINING'}</b></div>
                  <strong>+{total.toFixed(2)} <small>stimulus</small></strong>
                  {values.length>0 && <div className="po-dev-v2__stimulus-tags">{values.slice(0,3).map(([key,value])=><span key={key}>{ratingLabel(key as PlayerTruthRatingKey)} +{(value??0).toFixed(2)}</span>)}</div>}
                </li>
              })}</ol>}
            {stimulusEvents.length>stimulusLimit && <button className="po-dev-v2__load-more" type="button" onClick={()=>setStimulusLimit(n=>n+40)}>SHOW 40 MORE <span>{stimulusEvents.length-stimulusLimit} remaining</span></button>}
          </div>}
          {activeTab==='drivers' && <div className="po-dev-v2__driver-list" data-ng-region="development-drivers">
            {development.drivers.map(row=><div key={row.id}><i className={'is-'+row.tone} /><span><strong>{row.label}</strong><small>{row.valueLabel}</small></span><b className={'is-'+row.tone}>{row.tone==='positive'?'↑':row.tone==='negative'?'↓':'·'}</b></div>)}
          </div>}
          {activeTab==='projection' && <div className="po-dev-v2__record-projection" data-ng-region="development-projection">
            <h4>SCOUTING PROJECTION</h4>
            {development.projection.status==='available'
              ? <div className="po-dev-v2__projection-levels">{development.projection.outcomes.map(row=><div key={row.id}><span>{row.label}</span><strong>{row.rangeLabel}</strong><small>{row.domainLabel}</small></div>)}</div>
              : <RecordEmpty icon="◎" label="NO AUTHORIZED PROJECTION" hint="Scouting assessment is required" />}
            <small>Scouting evaluations are estimates, never exact internal ceilings.</small>
          </div>}
          {activeTab==='notes' && <div className="po-dev-v2__record-notes" data-ng-region="development-declared-gaps">
            <h4>DATA BOUNDARIES</h4>
            {development.gaps.map(gap=><details key={gap.id}><summary>{gap.label}</summary><p>{gap.reason}</p></details>)}
            <small>Missing data is never filled with simulated or invented values.</small>
          </div>}
        </div>
      </section>
    </div>
  </section>
}

function RecordEmpty({ icon, label, hint }: { readonly icon:string;readonly label:string;readonly hint:string }) {
  return <div className="po-dev-v2__record-empty"><span aria-hidden="true">{icon}</span><strong>{label}</strong><small>{hint}</small></div>
}
