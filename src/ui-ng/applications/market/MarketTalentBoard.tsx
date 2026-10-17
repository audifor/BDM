import { useMemo, useState } from 'react'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { isPlayerFreeAgent } from '@/domain/world'
import { RequestScoutingModal } from '@/ui-ng/applications/scouting/ScoutingModals'
import type { RequestScoutingInput } from '@/app/scouting'
import { navigateToStaff } from '@/ui-ng/workspace/workspaceApps'
import { marketTargetId, type MarketTarget, type MarketTargetPriority } from '@/domain/market/MarketTarget'
import { buildScoutingWorkspaceModel } from '@/ui-ng/applications/scouting/buildScoutingWorkspaceModel'
import { buildScoutingRosterComparison } from '@/ui-ng/applications/player/data/buildScoutingRosterComparison'
import { scoutingRosterBenchmarks } from '@/ui-ng/applications/player/data/buildPlayerScoutingDecision'
import { positionEvidenceKeys } from '@/ui-ng/applications/player/data/scoutingPositionEvidence'
import type { ScoutingKnowledgeRow } from '@/ui-ng/applications/scouting/scoutingWorkspaceModel'
import './market-talent-board.css'

type Mode = 'explore' | 'targets'
interface Props {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly mode: Mode
  readonly targets: readonly MarketTarget[]
  readonly onAddTarget: (id: PlayerId) => string | null
  readonly onArchiveTarget: (id: PlayerId) => string | null
  readonly onTargetPriority: (id: PlayerId, priority: MarketTargetPriority) => string | null
  readonly onTargetNote: (id: PlayerId, note: string) => string | null
  readonly comparisonIds: readonly PlayerId[]
  readonly onToggleComparison: (playerId: PlayerId) => void
  readonly onOpenPlayer: (playerId: PlayerId) => void
  readonly onOpenScouting: () => void
  readonly onOpenOperations: () => void
  readonly onRequestScouting: (input: RequestScoutingInput) => string | null
  readonly onOpenFreeAgent: (playerId: PlayerId) => void
}

const STATES = { UNKNOWN: 'Sin observar', DISCOVERED: 'Descubierto', QUICK_LOOK: 'Primera valoración', PARTIAL: 'Parcial', DETAILED: 'Detallado' } as const
const POSITIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'] as const

function pct(value: string) { return value === '—' ? null : Number.parseFloat(value) }
function hasKnowledge(row: ScoutingKnowledgeRow) { return row.knownRatingCount > 0 || row.knownDomains.length > 0 }
function playerName(world: GameWorld, playerId: PlayerId): string {
  const player = world.players[playerId]
  return player === undefined ? 'Jugador' : `${player.firstName} ${player.lastName}`
}

export function MarketTalentBoard({ world, teamId, mode, targets, onAddTarget, onArchiveTarget, onTargetPriority, onTargetNote, comparisonIds, onToggleComparison, onOpenPlayer, onOpenScouting, onOpenOperations, onRequestScouting, onOpenFreeAgent }: Props) {
  const [query, setQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [scoutingTarget, setScoutingTarget] = useState<PlayerId | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [noteEdit, setNoteEdit] = useState<{ id: PlayerId; text: string } | null>(null)
  const changeTarget = (action: () => string | null) => { const message = action(); setActionError(message) }
  const [position, setPosition] = useState<string>('ALL')
  const [status, setStatus] = useState<'ALL' | 'KNOWN' | 'FREE' | 'ACTIVE'>('ALL')
  const [selectedId, setSelectedId] = useState<PlayerId | null>(null)
  const model = useMemo(() => buildScoutingWorkspaceModel(world), [world])
  const team = world.teams[teamId]
  if (team === undefined || model === null) return null
  // All identities come from the canonical addressable list, never from world.players globally.
  const addressable = model.knowledge.filter((row) => !row.isOwnRoster)
  const savedIds = new Set(targets.map((target) => target.playerId))
  const rows = addressable.filter((row) =>
    (position === 'ALL' || row.position === position) &&
    (status === 'ALL' || status === 'KNOWN' && hasKnowledge(row) ||
      status === 'FREE' && isPlayerFreeAgent(world, row.playerId) ||
      status === 'ACTIVE' && row.activeAssignment !== null) &&
    `${row.name} ${row.clubName} ${row.countryName} ${row.competitionName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const ordered = [...rows].sort((a, b) =>
    Number(comparisonIds.includes(b.playerId)) - Number(comparisonIds.includes(a.playerId)) ||
    Number(hasKnowledge(b)) - Number(hasKnowledge(a)) || a.name.localeCompare(b.name))
  const selected = addressable.find((row) => row.playerId === selectedId) ?? ordered[0] ?? null
  const benchmarks = selected === null ? null : scoutingRosterBenchmarks(world, selected.playerId)
  const ownPeerId = benchmarks?.rolePeer ?? null
  const ownPeerName = ownPeerId === null ? null : playerName(world, ownPeerId)
  const visibleRatings = selected === null || ownPeerId === null ? [] :
    buildScoutingRosterComparison(world, selected.playerId, ownPeerId)
      .filter((item) => positionEvidenceKeys(world.players[selected.playerId]!.basketball.primaryPosition).includes(item.id))
      .slice(0, 8)
  const compared = comparisonIds.map((id) => addressable.find((row) => row.playerId === id)).filter((row): row is ScoutingKnowledgeRow => row !== undefined)
  const activeReports = selected === null ? [] : model.reports.filter((report) => report.playerId === selected.playerId).slice(0, 3)
  return <div className="market-talent" data-testid={mode === 'explore' ? 'market-explore' : 'market-targets'}>
    <div className="market-talent__compact-head"><strong>{mode === 'targets' ? 'OBJETIVOS · ' + targets.length : 'EXPLORAR JUGADORES · ' + ordered.length}</strong>
      {mode === 'targets' ? <button className="market-cs__primary" onClick={() => setPickerOpen(true)} type="button">+ Añadir objetivo</button> : null}
      <button className="market-cs__secondary" onClick={onOpenScouting} type="button">Scouting →</button>
    </div>
    {actionError !== null ? <p className="market-talent__error" role="alert">{actionError} <button type="button" onClick={() => setActionError(null)}>×</button></p> : null}
    {scoutingTarget !== null ? <RequestScoutingModal key={scoutingTarget} world={world} teamId={teamId} playerId={scoutingTarget} onClose={() => setScoutingTarget(null)} onSubmit={onRequestScouting} /> : null}
    {mode === 'targets' && pickerOpen ? <div className="market-target-picker__overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false) }}>
      <section className="market-target-picker" role="dialog" aria-modal="true" aria-label="Añadir objetivos">
        <header><h3>Añadir objetivo</h3><button onClick={() => setPickerOpen(false)} aria-label="Cerrar selector" type="button">×</button></header>
        <input aria-label="Buscar jugador para objetivo" placeholder="Buscar jugador, club o país" value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} />
        <div className="market-target-picker__list">
          {addressable.filter((row) => (row.name + ' ' + row.clubName + ' ' + row.countryName).toLocaleLowerCase().includes(pickerQuery.toLocaleLowerCase())).slice(0, 60).map((row) =>
            <div key={row.playerId}><span><b>{row.name}</b><small>{row.position} · {row.clubName} · {STATES[row.knowledgeState]}</small></span>
              <button onClick={() => changeTarget(() => savedIds.has(row.playerId) ? onArchiveTarget(row.playerId) : onAddTarget(row.playerId))} type="button">
                {savedIds.has(row.playerId) ? 'Archivar' : 'Añadir'}
              </button></div>)}
        </div>
      </section>
    </div> : null}
    {mode === 'explore' ? <><div className="market-talent__toolbar">
      <label>Buscar<input aria-label="Buscar objetivos" placeholder="Nombre, país, liga o club" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>Posición<select aria-label="Posición de objetivos" value={position} onChange={(event) => setPosition(event.target.value)}>{POSITIONS.map((p) => <option value={p} key={p}>{p === 'ALL' ? 'Todas' : p}</option>)}</select></label>
      <label>Situación<select aria-label="Situación de objetivos" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="ALL">Todos</option><option value="KNOWN">Con informes</option><option value="FREE">Agentes libres</option><option value="ACTIVE">En observación</option></select></label>
      <span className="market-talent__count">{rows.length} visibles · {targets.length} objetivos</span>
    </div>
    <div className="market-talent__grid">
      <section className="market-talent__catalog" aria-label="Candidatos de mercado">
        <div className="market-talent__tablehead"><span>Jugador</span><span>Perfil</span><span>Conocimiento</span><span>Mesa</span></div>
        {ordered.length === 0 ? <div className="market-talent__empty">Tu red no conoce jugadores que coincidan con estos filtros. Inicia un foco de scouting.</div> :
          ordered.slice(0, 120).map((row) => <div className={'market-talent__candidate' + (selected?.playerId === row.playerId ? ' is-selected' : '')} key={row.playerId}>
            <button className="market-talent__player" onClick={() => setSelectedId(row.playerId)} type="button"><strong>{row.name}</strong><small>{row.clubName} · {row.countryName}</small></button>
            <div><b>{row.position}</b><small>{row.age} años</small></div>
            <div><span className="market-talent__knowledge">{STATES[row.knowledgeState]}</span><small>Confianza: {row.confidenceLabel}</small></div>
            <button className={'market-talent__add' + (comparisonIds.includes(row.playerId) ? ' is-added' : '')}
              title={savedIds.has(row.playerId) ? 'Archivar objetivo' : 'Guardar como objetivo'}
              aria-label={(savedIds.has(row.playerId) ? 'Archivar ' : 'Añadir objetivo ') + row.name}
              onClick={() => changeTarget(() => savedIds.has(row.playerId) ? onArchiveTarget(row.playerId) : onAddTarget(row.playerId))} type="button">{savedIds.has(row.playerId) ? '✓' : '+'}</button>
          </div>)}
      </section>
      <aside className="market-talent__inspector" aria-label="Expediente de scouting">
        {selected === null ? <div className="market-talent__empty">Selecciona un jugador para consultar sus evidencias.</div> : <>
          <div className="market-talent__inspector-top"><span className="market-cs__kicker">EXPEDIENTE · INFORMES</span><span className="market-talent__quality">{selected.knowledgeState === 'UNKNOWN' ? 'SIN EVIDENCIA' : 'EVIDENCIA DISPONIBLE'}</span></div>
          <h3>{selected.name}</h3><p className="market-talent__bio">{selected.position} · {selected.age} años · {selected.clubName}</p>
          <div className="market-talent__gauges">
            <div><small>Cobertura</small><strong>{selected.coverageLabel}</strong><div><span style={{ width: `${pct(selected.coverageLabel) ?? 0}%` }} /></div></div>
            <div><small>Confianza</small><strong>{selected.confidenceLabel}</strong><div><span style={{ width: `${pct(selected.confidenceLabel) ?? 0}%` }} /></div></div>
            <div><small>Frescura</small><strong>{selected.freshnessLabel}</strong><div><span style={{ width: `${pct(selected.freshnessLabel) ?? 0}%` }} /></div></div>
          </div>
          <div className="market-talent__notice"><b>Desacuerdo entre evaluadores:</b> {selected.disagreement === 'HIGH' ? 'Alto.' : selected.disagreement === 'MODERATE' ? 'Moderado.' : 'Bajo o no detectado.'}</div>
          <div className="market-talent__subheading"><strong>Comparación posicional</strong><small>{ownPeerName ?? 'Sin par de misma posición'}</small></div>
          {visibleRatings.length > 0 ? <div className="market-talent__ratings"><div className="market-talent__ratings-head"><span>Atributo</span><span>Objetivo</span><span>Tu jugador</span></div>
            {visibleRatings.map((rating) => <div key={rating.id}><span>{rating.label}</span><strong>{rating.subject === null ? '?' : `${rating.subject} [${rating.low}–${rating.high}]`}</strong><b>{rating.own}</b></div>)}
          </div> : <p className="market-talent__empty">Sin jugador comparable de la misma posición.</p>}
          <div className="market-talent__subheading"><strong>Informes registrados</strong><small>{activeReports.length} mostrados</small></div>
          {activeReports.length === 0 ? <p className="market-talent__empty">Sin informes registrados para este jugador.</p> :
            <div className="market-talent__reports">{activeReports.map((report) => <div key={report.id}><b>{report.missionLabel}</b><span>{report.evaluatorName} · {report.createdLabel}</span><small>Confianza {report.confidenceLabel}</small></div>)}</div>}
          <div className="market-talent__inspector-actions"><button className="market-cs__primary" onClick={() => setScoutingTarget(selected.playerId)} type="button" disabled={selected.activeAssignment !== null}>{selected.activeAssignment === null ? 'Solicitar informe' : 'Observación en curso'}</button>
            {isPlayerFreeAgent(world, selected.playerId) ? <button className="market-cs__secondary" onClick={() => onOpenFreeAgent(selected.playerId)} type="button">Contactar agente libre</button> : null}
            <button className="market-cs__secondary" onClick={() => onOpenPlayer(selected.playerId)} type="button">Ficha completa</button></div>
        </>}
      </aside>
    </div></> : null}
    {mode === 'targets' ? <section className="market-talent__saved" aria-label="Objetivos guardados">
      <div className="market-talent__saved-head"><strong>LISTA DE OBJETIVOS</strong><span>Prioridad · Informes · Acciones</span></div>
      {targets.length === 0 ? <div className="market-talent__empty">Sin objetivos registrados.</div> :
      <div className="market-talent__saved-list">{targets.map((target) => {
        const row = addressable.find((candidate) => candidate.playerId === target.playerId)
        const knownPlayer = world.players[target.playerId]
        const displayName = knownPlayer === undefined ? 'Jugador' : `${knownPlayer.firstName} ${knownPlayer.lastName}`
        const reports = model.reports.filter((report) => report.playerId === target.playerId)
        const assignments = model.assignments.filter((assignment) => assignment.playerId === target.playerId && (assignment.status === 'ACTIVE' || assignment.status === 'QUEUED'))
        const isComparing = comparisonIds.includes(target.playerId)
        return <div className="market-talent__saved-row" key={target.id}>
          <div className="market-talent__saved-person"><button type="button" onClick={() => onOpenPlayer(target.playerId)}>{displayName}</button><small>{row?.position ?? knownPlayer?.basketball.primaryPosition ?? '—'} · {row?.clubName ?? '—'}</small></div>
          <select aria-label={'Prioridad ' + displayName} value={target.priority} onChange={(event) => changeTarget(() => onTargetPriority(target.playerId, event.target.value as MarketTargetPriority))}>
            <option value="HIGH">Alta</option><option value="NORMAL">Normal</option><option value="LOW">Baja</option>
          </select>
          <div className="market-talent__saved-report"><strong>{reports.length} informes</strong><small>{assignments.length > 0 ? 'En observación' : row?.confidenceLabel !== '—' ? 'Confianza ' + (row?.confidenceLabel ?? '—') : 'Sin evaluar'}</small></div>
          <div className="market-talent__saved-buttons">
            <button type="button" disabled={!isComparing && comparisonIds.length >= 3} onClick={() => onToggleComparison(target.playerId)}>{isComparing ? 'Quitar comparación' : 'Comparar'}</button>
            <button type="button" disabled={assignments.length > 0} onClick={() => setScoutingTarget(target.playerId)}>Informe</button>
            {isPlayerFreeAgent(world, target.playerId) ? <button type="button" onClick={() => onOpenFreeAgent(target.playerId)}>Contactar</button> : null}
            <button type="button" onClick={() => setNoteEdit({ id: target.playerId, text: target.note })}>Nota</button>
            <button type="button" onClick={() => changeTarget(() => onArchiveTarget(target.playerId))}>Archivar</button>
          </div>
          <div className="market-talent__saved-history"><span>{target.note || 'Sin notas'} · {target.history.length} cambios</span>
            {reports[0]?.evaluatorName ? <span>Último informe: {reports[0].evaluatorName}</span> : null}
          </div>
        </div>
      })}</div>}
    </section> : null}
    {noteEdit !== null ? <div className="market-target-picker__overlay" onMouseDown={(event) => { if (event.currentTarget === event.target) setNoteEdit(null) }}>
      <section className="market-target-picker market-target-picker--note" role="dialog" aria-modal="true" aria-label="Nota de objetivo">
        <header><h3>Nota de objetivo</h3><button onClick={() => setNoteEdit(null)} type="button" aria-label="Cerrar nota">×</button></header>
        <textarea aria-label="Observaciones del objetivo" maxLength={500} rows={4} value={noteEdit.text} onChange={(event) => setNoteEdit({ ...noteEdit, text: event.target.value })}/>
        <div className="market-talent__saved-buttons"><button type="button" onClick={() => {
          const message = onTargetNote(noteEdit.id, noteEdit.text); setActionError(message)
          if (message === null) setNoteEdit(null)
        }}>Guardar nota</button></div>
        <h4>Historial</h4>
        <div className="market-target-picker__list">{targets.find((target) => target.playerId === noteEdit.id)?.history.slice().reverse().map((event,index) =>
          <div key={index}><b>{event.date}</b><small>{event.kind.replaceAll('_',' ')} {event.detail ?? ''}</small></div>)}</div>
      </section>
    </div> : null}
    {mode === 'targets' ? <section className="market-talent__comparison">
      <header><div><span className="market-cs__kicker">COMPARACIÓN</span><h3>Hasta tres jugadores</h3></div><small>Hasta 3 jugadores</small></header>
      {compared.length === 0 ? <div className="market-talent__empty">Selecciona hasta tres objetivos para comparar.</div> :
        <div className="market-talent__compare-cards">{compared.map((row) => <article key={row.playerId}>
          <div><b>{row.position}</b><button aria-label={'Quitar ' + row.name} onClick={() => onToggleComparison(row.playerId)} type="button">×</button></div>
          <h4>{row.name}</h4><p>{row.clubName}</p>
          <dl><div><dt>Cobertura</dt><dd>{row.coverageLabel}</dd></div><div><dt>Confianza</dt><dd>{row.confidenceLabel}</dd></div><div><dt>Frescura</dt><dd>{row.freshnessLabel}</dd></div><div><dt>Desacuerdo</dt><dd>{row.disagreement === 'HIGH' ? 'Alto' : row.disagreement === 'MODERATE' ? 'Medio' : 'Bajo'}</dd></div></dl>
          <div className="market-talent__card-actions"><button className="market-cs__secondary" onClick={() => setScoutingTarget(row.playerId)} type="button" disabled={row.activeAssignment !== null}>Informar</button>
          {isPlayerFreeAgent(world,row.playerId) ? <button className="market-cs__secondary" onClick={() => onOpenFreeAgent(row.playerId)} type="button">Contactar</button> : null}
          <button className="market-cs__secondary" onClick={() => onOpenPlayer(row.playerId)} type="button">Ficha</button></div>
        </article>)}</div>}
      {compared.length > 0 ? <div className="market-talent__compare-footer"><span>Los atributos no observados aparecen como «?».</span><button className="market-cs__secondary" onClick={onOpenOperations} type="button">Consultar operaciones →</button></div> : null}
    </section> : null}
  </div>
}
