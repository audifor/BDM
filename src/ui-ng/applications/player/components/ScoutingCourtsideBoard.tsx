import { useMemo, useState } from 'react'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { PlayerWorkspaceModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'
import type { PlayerScoutingModel } from '@/ui-ng/applications/player/data/buildPlayerScoutingModel'
import { buildScoutingRosterComparison } from '@/ui-ng/applications/player/data/buildScoutingRosterComparison'
import { ratingCategory, CATEGORY_LABELS, type RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'
import { getUserTeam } from '@/engine/calendar'

const COMPARE_FAMILIES: readonly RatingCategory[] = [
  'shooting','finishing','ballHandling','playmaking','offBall','defense','physical','mental',
]

type ActionId = 'assign-scout' | 'request-report' | 'watch-next-game' |
  'increase-priority' | 'end-scouting' | 'detailed-report' | 'contract-route'

interface Props {
  readonly world: GameWorld
  readonly model: PlayerWorkspaceModel
  readonly scouting: PlayerScoutingModel
  readonly assignmentSummary: string | null
  readonly nextGameLabel: string | null
  readonly requestReason: string | null
  readonly canIncrease: boolean
  readonly canCancel: boolean
  readonly hasReport: boolean
  readonly onAction: (id: ActionId) => void
  readonly onOpenScoutingCentre: () => void
}

const knowledgeText = (value: string) => value === 'known' ? 'VERIFIED' : value === 'estimated' ? 'ESTIMATED' : value === 'low' ? 'LOW CONFIDENCE' : 'NOT SCOUTED'

export function ScoutingRosterComparison({ world, inspectedId }: {
  readonly world: GameWorld
  readonly inspectedId: PlayerId
}) {
  const team = getUserTeam(world)
  const eligible = useMemo(() => {
    if (team === undefined) return []
    const subject = world.players[inspectedId]
    return team.rosterPlayerIds
      .filter(id => id !== inspectedId && world.players[id] !== undefined)
      .map(id => ({ id, player: world.players[id]! }))
      .sort((a,b) =>
        Number(b.player.basketball.primaryPosition === subject?.basketball.primaryPosition) -
        Number(a.player.basketball.primaryPosition === subject?.basketball.primaryPosition) ||
        a.player.lastName.localeCompare(b.player.lastName))
  }, [world, team, inspectedId])
  const [chosenId, setChosenId] = useState<PlayerId | null>(null)
  const [family, setFamily] = useState<RatingCategory>('shooting')
  const selectedId = eligible.some(row => row.id === chosenId) ? chosenId : eligible[0]?.id ?? null
  const rows = useMemo(() => selectedId === null ? [] :
    buildScoutingRosterComparison(world, inspectedId, selectedId), [world, inspectedId, selectedId])
  const matched = rows.filter(row => ratingCategory(row.id) === family)
  const verified = matched.filter(row => row.subject !== null)
  const ownName = eligible.find(row => row.id === selectedId)?.player
  const subjectName = world.players[inspectedId]
  return <section className="po-scv3__card po-scv3__compare" data-ng-region="scouting-roster-compare">
    <div className="po-scv3__card-head"><strong>ROSTER COMPARISON</strong><span>FM-STYLE · SAME ATTRIBUTE</span></div>
    <div className="po-scv3__compare-tools">
      <label>OUR PLAYER
        <select aria-label="Compare against my player"
          value={selectedId ?? ''} onChange={event => setChosenId(event.target.value as PlayerId)}>
          {eligible.length === 0 && <option value="">No teammates available</option>}
          {eligible.map(({id,player}) => <option key={id} value={id}>
            {player.firstName} {player.lastName} · {player.basketball.primaryPosition}
          </option>)}
        </select>
      </label>
      <label>ATTRIBUTE FAMILY
        <select aria-label="Comparison attribute family" value={family}
          onChange={event => setFamily(event.target.value as RatingCategory)}>
          {COMPARE_FAMILIES.map(key => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}
        </select>
      </label>
    </div>
    <div className="po-scv3__compare-key" aria-label="Comparison legend">
      <span>SCOUT SUBJECT: {subjectName?.lastName ?? '—'}</span><span>OUR PLAYER: {ownName?.lastName ?? '—'}</span>
    </div>
    {selectedId === null ? <p className="po-scv3__empty">No other own-roster player is available for comparison.</p> :
      verified.length === 0
        ? <div className="po-scv3__compare-locked">
            <strong>NO COMPARABLE INDIVIDUAL ATTRIBUTES YET</strong>
            <p>Our player's ratings are known. The subject's {CATEGORY_LABELS[family].toLowerCase()} values remain unknown until scouting evaluates the same individual attributes.</p>
            <small>Never compare estimated category strength with an exact 80-rating family average.</small>
          </div>
        : <div className="po-scv3__compare-rows">
            {verified.slice(0,7).map(row => {
              const difference = row.subject === null ? null : row.subject - row.own
              return <div className="po-scv3__compare-row" key={row.id} title={row.isEstimate ? 'Scouting estimate, not Player Truth' : 'Both values are roster ratings'}>
                <span className="po-scv3__compare-name">{row.label}</span>
                <div className="po-scv3__compare-pair">
                  <div><span style={{width: `${row.subject ?? 0}%`}} /></div>
                  <div><span style={{width: `${row.own}%`}} /></div>
                </div>
                <span className="po-scv3__compare-value">{row.subject === null ? '?' :
                  row.isEstimate ? `≈${row.low}–${row.high}` : row.subject}</span>
                <span className="po-scv3__compare-value">{row.own}</span>
                <span className="po-scv3__compare-delta">{difference === null ? '—' :
                  `≈${difference > 0 ? '+' : ''}${difference}`}</span>
              </div>
            })}
            <small className="po-scv3__compare-footnote">{verified.length} / {matched.length} individual attributes supported in this family. Green marks the scouting subject, muted bar our player. ≈ indicates uncertainty, not a verified advantage.</small>
          </div>}
  </section>
}

export function ScoutingCourtsideBoard({
  world, model, scouting, assignmentSummary, nextGameLabel, requestReason, canIncrease,
  canCancel, hasReport, onAction, onOpenScoutingCentre,
}: Props) {
  const [focusRoute, setFocusRoute] = useState<ActionId>('request-report')
  const [intelligenceFocus, setIntelligenceFocus] = useState('shooting')
  const [bottomTab, setBottomTab] = useState<'reports' | 'games'>('reports')
  const own = model.knowledgeAccess.kind === 'own-roster'
  const status = scouting.statusPanel
  const known = scouting.attributes
  const focused = known.find(row => row.id === intelligenceFocus) ?? known[0]
  const isUnscouted = known.length === 0
  const coverage = status?.knownDimensionCount ?? 0
  const level = coverage === 0 ? 'NOT SCOUTED' : status!.knowledgeCoverage >= .75 ? 'DEEP COVERAGE' :
    status!.knowledgeCoverage >= .4 ? 'PARTIAL REPORT' : 'INITIAL COVERAGE'
  const routes: readonly { id: ActionId; title: string; subtitle: string; disabled: boolean }[] = [
    {id:'assign-scout',title:'QUICK LOOK',subtitle:'First evaluation',disabled:requestReason!==null},
    {id:'request-report',title:'FULL REPORT',subtitle:'Deep scouting mission',disabled:requestReason!==null},
    {id:'watch-next-game',title:'WATCH GAME',subtitle:nextGameLabel ?? 'No fixture',disabled:requestReason!==null||nextGameLabel===null},
    {id:'contract-route',title:'CONTACT ROUTES',subtitle:'Contract opportunities',disabled:own},
  ]
  const chosenRoute = routes.find(route => route.id===focusRoute) ?? routes[1]!
  return <div className="po-scv3" data-ng-region="player-scouting">
    <div className="po-scv3__status-row">
      <section className="po-scv3__stat"><small>SCOUTING COVERAGE</small><strong>{own ? 'INTERNAL EVALUATION' : level}</strong>
        <span>{coverage} evaluated domains · {status?.knowledgeLabel ?? 'Unknown'}</span></section>
      <section className="po-scv3__stat"><small>REPORT RELIABILITY</small><strong>{coverage === 0 ? 'UNKNOWN' : (status?.confidenceLabel ?? 'Unknown').toUpperCase()}</strong>
        <span>{status?.disagreementLabel ?? 'No evaluated source'}</span></section>
      <section className="po-scv3__stat"><small>LAST ASSESSED</small><strong>{status?.lastScoutedLabel ?? 'NO REPORT'}</strong>
        <span>{status?.observerLabel ?? 'No evaluator'}</span></section>
      <section className="po-scv3__stat po-scv3__stat--action"><small>NEXT MANAGER STEP</small>
        <strong>{canCancel ? 'SCOUT ASSIGNED' : requestReason === null ? 'REQUEST SCOUTING' : 'REVIEW CAPACITY'}</strong>
        <button type="button" onClick={canCancel ? () => onAction('detailed-report') : requestReason === null ? () => onAction('request-report') : onOpenScoutingCentre}
          disabled={canCancel && !hasReport}>
          {canCancel && hasReport ? 'OPEN REPORT ↗' : canCancel ? 'IN PROGRESS' : requestReason === null ? 'REQUEST REPORT ↗' : 'SCOUTING CENTRE ↗'}
        </button>
      </section>
    </div>

    <div className="po-scv3__workspace">
      <div className="po-scv3__primary">
        <section className="po-scv3__card po-scv3__snapshot">
          <div className="po-scv3__card-head"><strong>PLAYER SNAPSHOT</strong><span>{own ? 'OWN PLAYER' : 'AUTHORIZED SCOUTING ONLY'}</span></div>
          <div className="po-scv3__snapshot-title">
            <small>REPORTED PLAY STYLE</small>
            <strong>{scouting.archetypeTitle === 'Insufficient scouting information' ? 'STYLE NOT VERIFIED' : scouting.archetypeTitle.toUpperCase()}</strong>
            <p>{scouting.archetypeRoleTitle === 'Insufficient reports' ? 'A reliable archetype requires more scouted dimensions.' : scouting.archetypeRoleTitle}</p>
          </div>
          <div className="po-scv3__snapshot-signals">
            <div><h4>STRENGTH SIGNALS</h4>{scouting.strengths.length===0 ? <small>Not established</small> : scouting.strengths.slice(0,3).map(row=>
              <span key={row.id}>+ {row.label} <b>{row.rangeLabel}</b></span>)}</div>
            <div><h4>CONCERN SIGNALS</h4>{scouting.weaknesses.length===0 ? <small>Not established</small> : scouting.weaknesses.slice(0,3).map(row=>
              <span key={row.id}>− {row.label} <b>{row.rangeLabel}</b></span>)}</div>
          </div>
          <div className="po-scv3__coverage-grid">
            {scouting.knowledgeAreas.filter(area=>['attributes','physical','potential'].includes(area.id)).map(area=>
              <div key={area.id}><small>{area.label.toUpperCase()}</small><strong>{area.coverageLabel}</strong>
                <span className="po-scv3__track"><span style={{width:`${Math.round(area.coverage*100)}%`}} /></span></div>)}
          </div>
          <div className="po-scv3__snapshot-note">Projection and personality remain UNKNOWN unless an authorized report supports them. No hidden potential is exposed.</div>
        </section>
        <ScoutingRosterComparison world={world} inspectedId={model.identity.playerId} />
      </div>

      <section className="po-scv3__card po-scv3__intelligence">
        <div className="po-scv3__card-head"><strong>SCOUTING INTELLIGENCE</strong><span>{known.length} EVALUATED DIMENSIONS</span></div>
        {isUnscouted
          ? <div className="po-scv3__intelligence-empty">
              <strong>NO EVALUATION ON FILE</strong>
              <p>Request a scouting assignment to develop a source-backed picture of this player's abilities.</p>
              {requestReason===null
                ? <button onClick={()=>onAction('assign-scout')} type="button">ASSIGN SCOUT ↗</button>
                : <button onClick={onOpenScoutingCentre} type="button">OPEN SCOUTING CENTRE ↗</button>}
              <small>{requestReason ?? 'Unknown is not a zero rating.'}</small>
            </div>
          : <>
              <div className="po-scv3__matrix-head"><span>AREA</span><span>SCOUTED RANGE</span><span>KNOWLEDGE</span></div>
              <div className="po-scv3__matrix">
                {known.map(row => <button type="button" key={row.id} onClick={()=>setIntelligenceFocus(row.id)}
                    aria-pressed={focused?.id===row.id}
                    className={'po-scv3__matrix-row'+(focused?.id===row.id?' is-selected':'')}>
                    <span>{row.label}</span><strong>{row.rangeLabel}</strong>
                    <span className={'po-scv3__knowledge is-'+row.knowledgeState}>{knowledgeText(row.knowledgeState)}</span>
                  </button>)}
              </div>
              {focused !== undefined && <div className="po-scv3__matrix-focus">
                <div><small>SELECTED EVALUATION</small><strong>{focused.label}</strong></div>
                <span>{focused.certaintyNote} · {focused.confidence===null?'Confidence unknown':`Confidence ${Math.round(focused.confidence*100)}%`}</span>
                <p>{focused.rangeLabel}. {focused.knowledgeState === 'known' ? 'Supported by organizational evaluations.' : 'Estimate is uncertain and may change with further scouting.'}</p>
              </div>}
            </>}
        <div className="po-scv3__coverage-note">
          <strong>KNOWLEDGE GAPS</strong>
          <span>{scouting.knowledgeAreas.filter(area=>area.knowledgeState==='unknown').map(area=>area.label).join(' · ') || 'All modeled knowledge areas evaluated'}</span>
        </div>
      </section>

      <div className="po-scv3__right">
        <section className="po-scv3__card po-scv3__fit">
          <div className="po-scv3__card-head"><strong>FIT & DECISION</strong><span>{own?'DEVELOPMENT REVIEW':'ACQUISITION READ'}</span></div>
          <div className="po-scv3__fit-banner">
            <div><small>TACTICAL TEAM FIT</small><strong>NOT EVALUATED</strong></div>
            <div><small>POTENTIAL</small><strong>{scouting.potentialOutcomes.every(outcome=>outcome.knowledgeState==='unknown')?'UNKNOWN':'SCOUTED RANGES'}</strong></div>
          </div>
          <h4>WHAT WE KNOW</h4>
          <p>{known.length>0?`${known.length} broad dimensions have evaluated evidence. ${scouting.consensus.length} evaluators have filed reports.`:'No reliable report yet. Do not infer quality, character or availability.'}</p>
          <h4>WHAT TO LEARN NEXT</h4>
          <p>{scouting.knowledgeAreas.filter(area=>area.knowledgeState==='unknown').slice(0,2).map(area=>area.label).join(' · ') || 'Refresh aging evaluations and investigate disagreement'}</p>
        </section>
        <section className="po-scv3__card po-scv3__routes">
          <div className="po-scv3__card-head"><strong>ACTION ROUTES</strong><span>{own?'INTERNAL':'TARGET'} · GAMEPLAY</span></div>
          <div className="po-scv3__route-options">
            {routes.map(route=><button type="button" key={route.id} aria-pressed={focusRoute===route.id}
              onClick={()=>setFocusRoute(route.id)} className={focusRoute===route.id?'is-selected':''}
              disabled={route.disabled && route.id==='contract-route'}>{route.title}</button>)}
          </div>
          <div className="po-scv3__route-detail">
            <strong>{chosenRoute.title}</strong>
            <p>{chosenRoute.subtitle}</p>
            <small>{assignmentSummary ?? requestReason ?? 'Assignment and evaluator choice are confirmed in the canonical scouting dialog.'}</small>
            <button type="button" onClick={()=>onAction(chosenRoute.id)} disabled={chosenRoute.disabled}>
              {chosenRoute.id==='contract-route'?'VIEW CONTRACT ROUTES ↗':chosenRoute.id==='watch-next-game'?'REQUEST GAME OBSERVATION ↗':'CONTINUE ↗'}
            </button>
          </div>
          {canCancel && <div className="po-scv3__assignment-controls">
            <button type="button" onClick={()=>onAction('increase-priority')} disabled={!canIncrease}>RAISE PRIORITY</button>
            <button type="button" onClick={()=>onAction('end-scouting')}>CANCEL ASSIGNMENT</button>
            {hasReport && <button type="button" onClick={()=>onAction('detailed-report')}>LATEST FILED REPORT</button>}
          </div>}
        </section>
        <section className="po-scv3__card po-scv3__source">
          <div className="po-scv3__card-head"><strong>SOURCE NETWORK</strong><span>{scouting.consensus.length} EVALUATORS</span></div>
          {scouting.consensus.length===0 ? <p className="po-scv3__empty">No staff report sources recorded.</p> :
            <div className="po-scv3__source-list">{scouting.consensus.slice(0,4).map(row=><div key={row.id}>
              <strong>{row.scoutLabel}</strong><span>{row.knowledgeLabel}</span><small>{row.opinionLabel} · {row.dateLabel}</small>
            </div>)}</div>}
        </section>
      </div>
    </div>

    <section className="po-scv3__card po-scv3__timeline">
      <div className="po-scv3__card-head"><strong>REPORT EVIDENCE</strong>
        <div className="po-scv3__inline-tabs" role="tablist" aria-label="Scouting evidence view">
          <button role="tab" aria-selected={bottomTab==='reports'} onClick={()=>setBottomTab('reports')} type="button">SCOUT REPORTS</button>
          <button role="tab" aria-selected={bottomTab==='games'} onClick={()=>setBottomTab('games')} type="button">GAME STATS</button>
        </div>
      </div>
      {bottomTab==='reports' ?
        scouting.noteTimeline.length===0 ? <p className="po-scv3__empty">No scout report has been filed. Recorded match statistics are separate from scouting observations.</p> :
        <div className="po-scv3__timeline-items">{scouting.noteTimeline.slice(0,4).map(note=><div key={note.id}>
          <span>{note.dateLabel}</span><strong>{note.title}</strong><small>{note.detail}</small>
        </div>)}</div>
      : scouting.observedGames.length===0 ? <p className="po-scv3__empty">No recorded games available for this player.</p> :
        <div className="po-scv3__timeline-items">{scouting.observedGames.slice(0,4).map(game=><div key={game.id}>
          <span>{game.dateLabel}</span><strong>{game.opponent} · {game.competitionLabel}</strong>
          <small>{game.minutes} MIN · {game.points} PTS · {game.rebounds} REB · {game.assists} AST</small>
        </div>)}</div>}
    </section>
  </div>
}
