import { useMemo, useState } from 'react'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { PlayerWorkspaceModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'
import type { PlayerScoutingModel } from '@/ui-ng/applications/player/data/buildPlayerScoutingModel'
import { buildScoutingRosterComparison } from '@/ui-ng/applications/player/data/buildScoutingRosterComparison'
import { buildPlayerScoutingDecision, scoutingRosterBenchmarks, type ScoutingBenchmarkMode } from '@/ui-ng/applications/player/data/buildPlayerScoutingDecision'
import { ratingCategory, CATEGORY_LABELS, type RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'
import { getUserTeam } from '@/engine/calendar'

const COMPARE_FAMILIES: readonly RatingCategory[] = [
  'shooting','finishing','ballHandling','playmaking','offBall','defense','physical','mental',
]

type ActionId = 'assign-scout' | 'request-report' | 'watch-next-game' |
  'increase-priority' | 'end-scouting' | 'detailed-report' | 'contract-route' | 'development-route' | 'performance-route'

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

const knowledgeText = (value: string, certaintyNote: string) =>
  certaintyNote === 'High uncertainty' ? 'WIDE UNCERTAINTY' :
  certaintyNote === 'Qualitative descriptor' ? 'QUALITATIVE' :
  value === 'known' ? 'VERIFIED' : value === 'estimated' ? 'ESTIMATED' :
  value === 'low' ? 'LOW CONFIDENCE' : 'NOT SCOUTED'

export function ScoutingRosterComparison({ world, inspectedId, comparisonId, onChange, benchmarkMode, onBenchmarkMode, family, onFamilyChange }: {
  readonly world: GameWorld
  readonly inspectedId: PlayerId
  readonly comparisonId: PlayerId | null
  readonly onChange: (id: PlayerId) => void
  readonly benchmarkMode: ScoutingBenchmarkMode
  readonly onBenchmarkMode: (mode: ScoutingBenchmarkMode) => void
  readonly family: RatingCategory
  readonly onFamilyChange: (family: RatingCategory) => void
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
  const [showAll, setShowAll] = useState(false)
  const selectedId = eligible.some(row => row.id === comparisonId) ? comparisonId : eligible[0]?.id ?? null
  const rows = useMemo(() => selectedId === null ? [] :
    buildScoutingRosterComparison(world, inspectedId, selectedId), [world, inspectedId, selectedId])
  const matched = rows.filter(row => ratingCategory(row.id) === family)
  const verified = matched.filter(row => row.subject !== null)
  const rankedRows = [...verified].sort((a,b)=>
    Math.abs((b.subject ?? 0)-b.own)-Math.abs((a.subject ?? 0)-a.own))
  const ownName = eligible.find(row => row.id === selectedId)?.player
  const subjectName = world.players[inspectedId]
  return <section className="po-scv3__card po-scv3__compare" data-ng-region="scouting-roster-compare">
    <div className="po-scv3__card-head"><strong>HEAD-TO-HEAD · OUR ROSTER</strong><span>80 ATTRIBUTES · SAME KEY · NO HIDDEN RATINGS</span></div>
    <div className="po-scv3__benchmark-modes" role="group" aria-label="Roster benchmark">
      <button type="button" aria-pressed={benchmarkMode==='role-peer'}
        onClick={()=>onBenchmarkMode('role-peer')}>ROLE PEER</button>
      <button type="button" aria-pressed={benchmarkMode==='rating-leader'}
        onClick={()=>onBenchmarkMode('rating-leader')}>POSITION RATING LEADER</button>
      <button type="button" aria-pressed={benchmarkMode==='manual'}
        onClick={()=>onBenchmarkMode('manual')}>CHOOSE PLAYER</button>
    </div>
    <div className="po-scv3__compare-tools">
      <label>OUR PLAYER
        <select aria-label="Compare against my player"
          value={selectedId ?? ''} onChange={event => {onBenchmarkMode('manual');onChange(event.target.value as PlayerId)}}>
          {eligible.length === 0 && <option value="">No teammates available</option>}
          {eligible.map(({id,player}) => <option key={id} value={id}>
            {player.firstName} {player.lastName} · {player.basketball.primaryPosition}
          </option>)}
        </select>
      </label>
      <label>ATTRIBUTE FAMILY
        <select aria-label="Comparison attribute family" value={family}
          onChange={event => {onFamilyChange(event.target.value as RatingCategory);setShowAll(false)}}>
          {COMPARE_FAMILIES.map(key => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}
        </select>
      </label>
    </div>
    <div className="po-scv3__compare-key" aria-label="Comparison legend">
      <span className="po-scv3__key-subject">SUBJECT: {subjectName?.lastName ?? '—'} · LIME</span>
      <span>BENCHMARK: {ownName?.lastName ?? '—'} · {benchmarkMode==='rating-leader' ? 'HIGHEST 80-RATING MEAN' : benchmarkMode==='role-peer' ? 'POSITION PEER' : 'MANUAL'} · MUTED</span>
    </div>
    {selectedId === null ? <p className="po-scv3__empty">No other own-roster player is available for comparison.</p> :
      verified.length === 0
        ? <div className="po-scv3__compare-locked">
            <strong>NO COMPARABLE INDIVIDUAL ATTRIBUTES YET</strong>
            <p>Our player's ratings are known. The subject's {CATEGORY_LABELS[family].toLowerCase()} values remain unknown until scouting evaluates the same individual attributes.</p>
            <small>Never compare estimated category strength with an exact 80-rating family average.</small>
          </div>
        : <div className="po-scv3__compare-rows">
            <div className="po-scv3__compare-column-head"><span>ATTRIBUTE</span><span>PLAYER / OURS</span><span>SCOUT</span><span>OURS</span><span>EDGE</span></div>
            {(showAll ? rankedRows : rankedRows.slice(0,8)).map(row => {
              const difference = row.subject === null ? null : row.subject - row.own
              const supportedAdvantage = row.low !== null && row.low >= row.own + 5
              const supportedConcern = row.high !== null && row.high <= row.own - 5
              return <div className="po-scv3__compare-row" key={row.id} title={row.isEstimate ? 'Scouting estimate, not Player Truth' : 'Both values are roster ratings'}>
                <span className="po-scv3__compare-name">{row.label}</span>
                <div className="po-scv3__compare-pair">
                  <div><span style={{width: `${row.subject ?? 0}%`}} /></div>
                  <div><span style={{width: `${row.own}%`}} /></div>
                </div>
                <span className="po-scv3__compare-value">{row.subject === null ? '?' :
                  row.isEstimate ? `≈${row.low}–${row.high}` : row.subject}</span>
                <span className="po-scv3__compare-value">{row.own}</span>
                <span className={'po-scv3__compare-delta ' + (supportedAdvantage ? 'is-up' : supportedConcern ? 'is-down' : 'is-overlap')}>
                  {difference === null ? '—' : row.isEstimate
                    ? supportedAdvantage ? `+≥${row.low! - row.own}`
                      : supportedConcern ? `−≥${row.own - row.high!}` : 'OVERLAP'
                    : `${difference > 0 ? '+' : ''}${difference}`}</span>
              </div>
            })}
            {rankedRows.length > 8 && <button type="button" className="po-scv3__compare-more"
              aria-expanded={showAll} onClick={()=>setShowAll(value=>!value)}>
              {showAll ? 'SHOW TOP 8' : `SHOW ALL ${rankedRows.length} ATTRIBUTES`}
            </button>}
            <small className="po-scv3__compare-footnote">{verified.length} / {matched.length} comparable in this family. Ranked by largest observed difference. +≥ and −≥ require non-overlapping bounds. OVERLAP means no proven advantage.</small>
          </div>}
  </section>
}

export function ScoutingCourtsideBoard({
  world, model, scouting, assignmentSummary, nextGameLabel, requestReason, canIncrease,
  canCancel, hasReport, onAction, onOpenScoutingCentre,
}: Props) {
  const [focusRoute, setFocusRoute] = useState<ActionId>('request-report')
  const [intelligenceFocus, setIntelligenceFocus] = useState('shooting')
  const [bottomTab, setBottomTab] = useState<'reports' | 'sources' | 'games'>('reports')
  const [comparisonId, setComparisonId] = useState<PlayerId | null>(null)
  const [benchmarkMode, setBenchmarkMode] = useState<ScoutingBenchmarkMode>('rating-leader')
  const [family, setFamily] = useState<RatingCategory>('shooting')
  const [evidenceScope, setEvidenceScope] = useState<'overall' | 'family'>('family')
  const own = model.knowledgeAccess.kind === 'own-roster'
  const team = getUserTeam(world)
  const rosterBenchmarks = useMemo(() => scoutingRosterBenchmarks(world, model.identity.playerId),
    [world, model.identity.playerId])
  const manualId = comparisonId !== null && team?.rosterPlayerIds.includes(comparisonId) && comparisonId !== model.identity.playerId
    ? comparisonId : null
  const eligibleComparisonId = benchmarkMode === 'rating-leader' ? rosterBenchmarks.ratingLeader
    : benchmarkMode === 'role-peer' ? rosterBenchmarks.rolePeer
    : manualId ?? rosterBenchmarks.rolePeer
  const comparator = eligibleComparisonId === null ? null : world.players[eligibleComparisonId]
  const comparable = useMemo(() => eligibleComparisonId === null ? [] :
    buildScoutingRosterComparison(world, model.identity.playerId, eligibleComparisonId),
    [world, model.identity.playerId, eligibleComparisonId])
  const verdict = buildPlayerScoutingDecision({
    own, rows: comparable, scouting,
    comparatorName: comparator === null || comparator === undefined ? null : comparator.lastName,
  })
  const familyRows = comparable.filter(row => ratingCategory(row.id) === family)
  const scopedRows = evidenceScope === 'family' ? familyRows : comparable
  const supportedRows = scopedRows.filter(row => row.low !== null && row.high !== null)
  const advantages = supportedRows.filter(row => row.low! >= row.own + 5)
    .sort((a,b) => (b.low! - b.own) - (a.low! - a.own))
  const concerns = supportedRows.filter(row => row.high! <= row.own - 5)
    .sort((a,b) => (b.own - b.high!) - (a.own - a.high!))
  const comparatorName = comparator?.lastName ?? 'our benchmark'
  const comparisonArgument = (row: (typeof comparable)[number], better: boolean) =>
    `${row.label}: ${own ? '' : 'at least '}${better ? '+' : '−'}${better ? row.low! - row.own : row.own - row.high!} vs ${comparatorName}`
  const internalCategories = own ? model.attributes.categories : []
  const strongestOwn = [...internalCategories].sort((a,b)=>b.profileValue-a.profileValue)
  const weakestOwn = [...internalCategories].sort((a,b)=>a.profileValue-b.profileValue)
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
    own
      ? {id:'development-route',title:'DEVELOPMENT',subtitle:'Internal player plan',disabled:false}
      : {id:'contract-route',title:'CONTACT ROUTES',subtitle:'Contract opportunities',disabled:false},
  ]
  const chosenRoute = routes.find(route => route.id===focusRoute) ?? routes[1]!
  return <div className="po-scv3" data-ng-region="player-scouting">
    <div className="po-scv3__status-row">
      <section className="po-scv3__stat"><small>{own ? 'SCOUT REPORT COVERAGE' : 'SCOUTING COVERAGE'}</small>
        <strong>{own ? (coverage === 0 ? 'NO FILED REPORT' : level) : level}</strong>
        <span>{coverage} scouted domains · {coverage === 0 ? 'No scout evaluation' : (status?.knowledgeLabel ?? 'Unknown')}</span></section>
      <section className="po-scv3__stat"><small>SOURCE CONFIDENCE</small><strong>{coverage === 0 ? 'UNKNOWN' : (status?.confidenceLabel ?? 'Unknown').toUpperCase()}</strong>
        <span>{coverage === 0 ? 'No evaluator report' : `Rating-range uncertainty is separate`}</span></section>
      <section className="po-scv3__stat"><small>LAST ASSESSED</small><strong>{status?.lastScoutedLabel ?? 'NO REPORT'}</strong>
        <span>{status?.observerLabel ?? 'No evaluator'}</span></section>
      <section className="po-scv3__stat po-scv3__stat--action"><small>NEXT MANAGER STEP</small>
        <strong>{canCancel ? 'SCOUT ASSIGNED' : requestReason === null ? (hasReport ? 'UPDATE REPORT' : 'REQUEST SCOUTING') : 'REVIEW CAPACITY'}</strong>
        <button type="button" onClick={canCancel ? () => onAction('detailed-report') : requestReason === null ? () => onAction('request-report') : onOpenScoutingCentre}
          disabled={canCancel && !hasReport}>
          {canCancel && hasReport ? 'OPEN REPORT ↗' : canCancel ? 'IN PROGRESS' : requestReason === null ? (hasReport ? 'REQUEST UPDATE ↗' : 'REQUEST REPORT ↗') : 'SCOUTING CENTRE ↗'}
        </button>
      </section>
    </div>

    <section className={'po-scv3__verdict is-' + verdict.tone} data-ng-region="scouting-decision-verdict">
      <div className="po-scv3__verdict-core">
        <small>{own ? 'OUR SQUAD · EVIDENCE-BASED ROLE REVIEW' : 'RECRUITMENT · EVIDENCE-BASED SPORTING VERDICT'}</small>
        <strong>{verdict.headline}</strong>
        <p>{verdict.meaning}</p>
      </div>
      <div className="po-scv3__verdict-proof" title="These are comparable individual rating keys, not scouting-domain coverage or confidence.">
        <div><b>{verdict.comparableCount}<span>/80</span></b><small>INDIVIDUAL RATINGS COMPARED</small></div>
        <div><b>{verdict.confirmedAdvantageCount}</b><small>{own ? 'RATING ADVANTAGES' : 'BOUNDED ADVANTAGES'}</small></div>
        <div><b>{verdict.confirmedConcernCount}</b><small>{own ? 'RATING WEAKNESSES' : 'BOUNDED CONCERNS'}</small></div>
      </div>
      <div className="po-scv3__verdict-action">
        <span>{verdict.basis} · {verdict.evidenceCount} filed reports · vs {comparatorName} ({benchmarkMode === 'rating-leader' ? 'highest 80-rating mean, not starter' : benchmarkMode === 'role-peer' ? 'position peer' : 'manual'})</span>
        <button type="button" onClick={() => onAction(own ? 'development-route' :
          verdict.status === 'insufficient' ? 'request-report' : 'contract-route')}
          disabled={!own && verdict.status === 'insufficient' && requestReason !== null}>
          {own ? 'REVIEW DEVELOPMENT ↗' : verdict.status === 'insufficient' ? 'GET EVIDENCE ↗' : 'EXPLORE SIGNING ↗'}
        </button>
      </div>
    </section>
    <div className="po-scv3__workspace">
      <div className="po-scv3__primary">
        <ScoutingRosterComparison world={world} inspectedId={model.identity.playerId}
          comparisonId={eligibleComparisonId} onChange={setComparisonId}
          benchmarkMode={benchmarkMode} onBenchmarkMode={setBenchmarkMode}
          family={family} onFamilyChange={setFamily} />
        {!own && known.length > 0 && (scouting.strengths.length > 0 || scouting.weaknesses.length > 0 || scouting.archetypeTitle !== 'Insufficient scouting information') && <section className="po-scv3__card po-scv3__snapshot">
          <div className="po-scv3__card-head"><strong>SCOUT'S PLAYER PROFILE</strong><span>REPORTED · NOT PLAYER TRUTH</span></div>
          <div className="po-scv3__snapshot-title">
            <strong>{scouting.archetypeTitle === 'Insufficient scouting information'
              ? 'STYLE NOT VERIFIED' : scouting.archetypeTitle.toUpperCase()}</strong>
            <p>{scouting.archetypeRoleTitle === 'Insufficient reports'
              ? 'Archetype requires more reliable dimensions.' : scouting.archetypeRoleTitle}</p>
          </div>
          <div className="po-scv3__snapshot-signals">
            <div><h4>SCOUTED STRENGTHS</h4>{scouting.strengths.length===0 ? <small>Not established</small> :
              scouting.strengths.slice(0,2).map(row=><span key={row.id}>+ {row.label}<b>{row.rangeLabel}</b></span>)}</div>
            <div><h4>SCOUTED CONCERNS</h4>{scouting.weaknesses.length===0 ? <small>Not established</small> :
              scouting.weaknesses.slice(0,2).map(row=><span key={row.id}>− {row.label}<b>{row.rangeLabel}</b></span>)}</div>
          </div>
        </section>}
      </div>

      <section className="po-scv3__card po-scv3__intelligence">
        <div className="po-scv3__card-head"><strong>{own ? 'WHY THIS PLAYER MATTERS' : 'SCOUTING INTELLIGENCE'}</strong>
          <span>{own ? 'DIRECT RATINGS · COMPARATIVE EVIDENCE' : `${known.length} EVALUATED DIMENSIONS`}</span></div>
        {own && <>
          <div className="po-scv3__evidence-scope" role="group" aria-label="Comparison evidence scope">
            <button type="button" aria-pressed={evidenceScope === 'family'} onClick={()=>setEvidenceScope('family')}>{CATEGORY_LABELS[family].toUpperCase()}</button>
            <button type="button" aria-pressed={evidenceScope === 'overall'} onClick={()=>setEvidenceScope('overall')}>ALL 80 ATTRIBUTES</button>
          </div>
          <div className="po-scv3__internal po-scv3__internal--reasons">
          <div className="po-scv3__reason-group">
            <h4>WHY CHOOSE HIM · {evidenceScope === 'family' ? CATEGORY_LABELS[family].toUpperCase() : 'ALL ATTRIBUTES'}</h4>
            {advantages.length === 0
              ? <span>No clear advantage in this comparison.</span>
              : advantages.slice(0,3).map(row=><span className="is-advantage" key={row.id}>+ {comparisonArgument(row,true)}</span>)}
          </div>
          <div className="po-scv3__reason-group">
            <h4>WHY NOT · TRADE-OFFS</h4>
            {concerns.length === 0
              ? <span>No clear concern in this comparison.</span>
              : concerns.slice(0,3).map(row=><span className="is-concern" key={row.id}>− {comparisonArgument(row,false)}</span>)}
          </div>
          <div className="po-scv3__reason-next">
            <h4>COACHING DECISION</h4>
            <p>{verdict.nextStep}</p>
            <small>{supportedRows.length} comparable attributes in this view. Ratings alone do not establish match performance or tactical fit.</small>
          </div>
        </div></>}
        {!own && (isUnscouted
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
                    <span className={'po-scv3__knowledge is-'+row.knowledgeState}>{knowledgeText(row.knowledgeState, row.certaintyNote)}</span>
                  </button>)}
              </div>
              {focused !== undefined && <div className="po-scv3__matrix-focus">
                <div><small>SELECTED EVALUATION</small><strong>{focused.label}</strong></div>
                <span>{focused.certaintyNote} · {focused.confidence===null?'Confidence unknown':`Confidence ${Math.round(focused.confidence*100)}%`}</span>
                <p>{focused.rangeLabel}. {focused.knowledgeState === 'known' ? 'Supported by organizational evaluations.' : 'Estimate is uncertain and may change with further scouting.'}</p>
              </div>}
            </>)}
        <div className="po-scv3__coverage-note">
          <strong>KNOWLEDGE GAPS</strong>
          <span>{scouting.knowledgeAreas.filter(area=>area.knowledgeState==='unknown').map(area=>area.label).join(' · ') || 'All modeled knowledge areas evaluated'}</span>
        </div>
      </section>

      <div className="po-scv3__right">
        <section className="po-scv3__card po-scv3__fit">
          <div className="po-scv3__card-head"><strong>MANAGER CALL</strong><span>{own?'KEEP · DEVELOP · REVIEW':'MONITOR · INVESTIGATE · PURSUE'}</span></div>
          <div className="po-scv3__fit-banner">
            <div><small>TACTICAL READ</small><strong>{scouting.consensus.some(row=>row.tacticalFitLabel!==null) ? 'SCOUT REPORT ON FILE' : 'NOT EVALUATED'}</strong></div>
            <div><small>POTENTIAL</small><strong>{scouting.potentialOutcomes.every(outcome=>outcome.knowledgeState==='unknown')?'UNKNOWN':'SCOUTED RANGES'}</strong></div>
          </div>
          <div className="po-scv3__call">
            <strong>{own ? 'KEEP / DEVELOP' : verdict.status === 'supported' ? 'INVESTIGATE A MOVE' : 'MONITOR / SCOUT'}</strong>
            <p>{verdict.nextStep}</p>
            <div className="po-scv3__call-actions">
              <button type="button" onClick={()=>onAction(own ? 'development-route' : verdict.status === 'supported' ? 'contract-route' : 'request-report')}
                disabled={!own && verdict.status !== 'supported' && requestReason !== null}>
                {own ? 'DEVELOPMENT ↗' : verdict.status === 'supported' ? 'CONTACT PATHWAYS ↗' : 'REFRESH SCOUTING ↗'}
              </button>
              <button type="button" onClick={()=>own ? onAction('performance-route') : setBottomTab('reports')}>
                {own ? 'PERFORMANCE ↗' : 'VIEW EVIDENCE ↓'}
              </button>
            </div>
          </div>
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
              {chosenRoute.id==='contract-route'?'VIEW CONTRACT ROUTES ↗':chosenRoute.id==='development-route'?'OPEN DEVELOPMENT ↗':chosenRoute.id==='watch-next-game'?'REQUEST GAME OBSERVATION ↗':'CONTINUE ↗'}
            </button>
          </div>
          {canCancel && <div className="po-scv3__assignment-controls">
            <button type="button" onClick={()=>onAction('increase-priority')} disabled={!canIncrease}>RAISE PRIORITY</button>
            <button type="button" onClick={()=>onAction('end-scouting')}>CANCEL ASSIGNMENT</button>
            {hasReport && <button type="button" onClick={()=>onAction('detailed-report')}>LATEST FILED REPORT</button>}
          </div>}
        </section>

      </div>
    </div>

    <section className="po-scv3__card po-scv3__timeline">
      <div className="po-scv3__card-head"><strong>REPORT EVIDENCE & SOURCES</strong>
        <div className="po-scv3__inline-tabs" role="tablist" aria-label="Scouting evidence view">
          <button role="tab" aria-selected={bottomTab==='reports'} onClick={()=>setBottomTab('reports')} type="button">SCOUT REPORTS</button>
          <button role="tab" aria-selected={bottomTab==='sources'} onClick={()=>setBottomTab('sources')} type="button">EVALUATORS ({scouting.consensus.length})</button>
          <button role="tab" aria-selected={bottomTab==='games'} onClick={()=>setBottomTab('games')} type="button">GAME STATS</button>
        </div>
      </div>
      {bottomTab==='reports' ?
        scouting.noteTimeline.length===0 ? <p className="po-scv3__empty">No scout report has been filed. Recorded match statistics are separate from scouting observations.</p> :
        <div className="po-scv3__timeline-items">{scouting.noteTimeline.slice(0,4).map(note=><div key={note.id}>
          <span>{note.dateLabel}</span><strong>{note.title}</strong><small>{note.detail}</small>
        </div>)}</div>
      : bottomTab==='sources' ?
        scouting.consensus.length===0 ? <p className="po-scv3__empty">No staff scouting reports have been filed.</p> :
        <div className="po-scv3__timeline-items">{scouting.consensus.slice(0,4).map(row=><div key={row.id}>
          <span>{row.dateLabel}</span><strong>{row.scoutLabel} · {row.knowledgeLabel}</strong><small>{row.opinionLabel}</small>
        </div>)}{hasReport && <button type="button" onClick={()=>onAction('detailed-report')}>OPEN LATEST REPORT ↗</button>}</div>
      : scouting.observedGames.length===0 ? <p className="po-scv3__empty">No recorded games available for this player.</p> :
        <div className="po-scv3__timeline-items">{scouting.observedGames.slice(0,4).map(game=><div key={game.id}>
          <span>{game.dateLabel}</span><strong>{game.opponent} · {game.competitionLabel}</strong>
          <small>{game.minutes} MIN · {game.points} PTS · {game.rebounds} REB · {game.assists} AST</small>
        </div>)}</div>}
    </section>
  </div>
}
