import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { GameWorld } from '@/domain/world'
import { getTeamLineup, getTeamRoster, resolveGameClockRules } from '@/domain/world'
import { getNextUserGame } from '@/engine/calendar'
import { getLineupAssignments, getLineupSlotForPlayer, isValidRotationMinutes, LINEUP_SLOTS } from '@/domain/tactics'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { Player } from '@/domain/player'
import type { MatchTacticalPlan, TacticalLevel } from '@/engine/match'
import { createDefaultTacticalPlan } from '@/engine/match'
import { useGameStore } from '@/stores/gameStore'
import { autoAssignDefensiveMatchups } from '@/ui/pcb-migrated/tactics/TacticsPcbPage'

type TacticsTab = 'matchups' | 'rotations' | 'match'
type Coverage = NonNullable<MatchTacticalPlan['defense']['pickAndRollCoverage']>
const coverageOptions: readonly Coverage[] = ['drop', 'switch', 'hedge', 'blitz']
const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const
const nameOf = (player: Player) => player.firstName + ' ' + player.lastName
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function Card({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return <section className={'ct-card ' + className}><header className="ct-card__head"><h2>{title}</h2>{note && <span>{note}</span>}</header><div className="ct-card__body">{children}</div></section>
}
function Empty({ text }: { text: string }) { return <p className="ct-empty">{text}</p> }
function StatStrip({ children }: { children: ReactNode }) { return <div className="ct-stats" aria-label="Resumen táctico">{children}</div> }
function Metric({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return <div className="ct-stat"><strong className={tone}>{value}</strong><small>{label}</small></div>
}
function PlayerButton({ player, onOpen }: { player: Player; onOpen?: (id: PlayerId) => void }) {
  return <button className="ct-player-link" type="button" onClick={() => onOpen?.(player.id)} disabled={!onOpen}>{nameOf(player)}</button>
}
function getMatch(world: GameWorld, teamId: TeamId) {
  const game = getNextUserGame(world)
  const opponentId = game === undefined ? undefined : game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId
  return { game, opponentId, opponent: opponentId === undefined ? undefined : world.teams[opponentId] }
}

export function CourtsideTacticsPanels({ tab, world, teamId, onOpenPlayer }: {
  tab: TacticsTab; world: GameWorld; teamId: TeamId; onOpenPlayer?: (id: PlayerId) => void
}) {
  const match = getMatch(world, teamId)
  if (tab === 'matchups') return <MatchupsPanel key={String(match.game?.id ?? 'no-game')} world={world} teamId={teamId} onOpenPlayer={onOpenPlayer} />
  if (tab === 'rotations') return <RotationsPanel world={world} teamId={teamId} onOpenPlayer={onOpenPlayer} />
  return <GamePlanPanel key={String(match.game?.id ?? 'no-game')} world={world} teamId={teamId} onOpenPlayer={onOpenPlayer} />
}

function MatchupsPanel({ world, teamId, onOpenPlayer }: { world: GameWorld; teamId: TeamId; onOpenPlayer?: (id: PlayerId) => void }) {
  const update = useGameStore(state => state.updateGamePlanMatchups)
  const { game, opponentId, opponent } = getMatch(world, teamId)
  const own = useMemo(() => getTeamRoster(world, teamId), [world, teamId])
  const opposing = useMemo(() => opponentId === undefined ? [] : getTeamRoster(world, opponentId), [world, opponentId])
  const saved = game === undefined ? [] : world.gamePlansByKey[String(game.id) + ':' + String(teamId)]?.matchups ?? []
  const [chosenId, setChosenId] = useState<PlayerId | null>(opposing[0]?.id ?? null)
  const chosen = opposing.find(player => player.id === chosenId) ?? opposing[0]
  const report = game === undefined ? undefined : Object.values(world.oppositionScoutingReportsById).find(item => item.gameId === game.id && item.teamId === teamId)
  const selected = chosen === undefined ? undefined : saved.find(item => item.opponentPlayerId === chosen.id)
  const defender = own.find(item => item.id === selected?.ourPlayerId)
  const starterIds = new Set(Object.values(getTeamLineup(world, teamId)?.starters ?? {}).filter((id): id is PlayerId => id !== undefined))
  const selectDefender = (opponentPlayerId: PlayerId, defenderId: PlayerId | null) => {
    const next = saved.filter(item => item.opponentPlayerId !== opponentPlayerId && item.ourPlayerId !== defenderId)
    if (defenderId !== null) next.push({ opponentPlayerId, ourPlayerId: defenderId })
    update(next)
  }
  const autoAssign = () => {
    const map = autoAssignDefensiveMatchups(opposing, own, starterIds)
    update(Object.entries(map).map(([opponentPlayerId, ourPlayerId]) => ({ opponentPlayerId: opponentPlayerId as PlayerId, ourPlayerId: ourPlayerId as PlayerId })))
  }
  return <>
    <StatStrip>
      <Metric value={opposing.length} label="Jugadores rivales" tone="ct-green" />
      <Metric value={saved.length} label="Defensores asignados" />
      <Metric value={report?.flaggedPlayerIds.length ?? 0} label="Amenazas identificadas" tone="ct-orange" />
      <Metric value={report === undefined ? 'SIN INFORME' : report.qualityScore + '/100'} label="Scouting disponible" />
      <div className="ct-stats__actions"><button type="button" onClick={autoAssign} disabled={!own.length || !opposing.length}>AUTOASIGNAR</button><button type="button" onClick={() => update([])} disabled={!saved.length}>RESTABLECER</button></div>
    </StatStrip>
    <div className="ct-columns ct-columns--duels">
      <Card title="RIVALES" note={opponent?.name ?? 'Sin próximo rival'}>
        {!opposing.length && <Empty text="No hay un rival programado con jugadores disponibles." />}
        <div className="ct-rival-list">{opposing.map(player => <button key={player.id} type="button" className={'ct-rival' + (chosen?.id === player.id ? ' is-selected' : '')} onClick={() => setChosenId(player.id)}>
          <span className="ct-pos">{player.basketball.primaryPosition}</span>
          <span className="ct-rival__name" title={nameOf(player)}>{nameOf(player)}</span>
          {report?.flaggedPlayerIds.includes(player.id) && <span className="ct-rival__threat" title="Amenaza identificada por scouting">!</span>}
          <span className="ct-rival__def" title={own.find(p => p.id === saved.find(m => m.opponentPlayerId === player.id)?.ourPlayerId)?.lastName ?? 'Sin defensor asignado'}>{own.find(p => p.id === saved.find(m => m.opponentPlayerId === player.id)?.ourPlayerId)?.lastName ?? 'SIN ASIGNAR'}</span>
        </button>)}</div>
      </Card>
      <Card title="CARA A CARA" note="DUELO DEFENSIVO">
        {chosen === undefined ? <Empty text="Selecciona un jugador rival para preparar su defensa." /> : <>
          <div className="ct-duel">
            <div><small>MI DEFENSOR</small><strong>{defender?.basketball.primaryPosition ?? 'SIN ASIGNAR'}</strong>{defender ? <PlayerButton player={defender} onOpen={onOpenPlayer} /> : <p>Elige un defensor</p>}</div>
            <span className="ct-duel__vs">VS</span>
            <div><small>RIVAL</small><strong>{chosen.basketball.primaryPosition}</strong><PlayerButton player={chosen} onOpen={onOpenPlayer} /></div>
          </div>
          <div className="ct-fact-grid"><div><small>Altura rival</small><b>{chosen.bio.heightCm} cm</b></div><div><small>Altura defensor</small><b>{defender ? defender.bio.heightCm + ' cm' : 'Sin asignar'}</b></div><div><small>Alerta de scouting</small><b>{report?.flaggedPlayerIds.includes(chosen.id) ? 'Amenaza identificada' : 'No confirmada'}</b></div></div>
          <p className="ct-hint">Los atributos desconocidos del rival no se muestran. Las recomendaciones se basan en el informe disponible y los datos públicos.</p>
        </>}
      </Card>
      <Card title="ASIGNACIÓN DEFENSIVA" note="GUARDADO EN PARTIDA">
        {chosen ? <>
          <label className="ct-field">Defensor asignado<select aria-label={'Defensor de ' + nameOf(chosen)} value={selected?.ourPlayerId ?? ''} onChange={event => selectDefender(chosen.id, event.target.value ? event.target.value as PlayerId : null)}>
            <option value="">Sin asignar</option>
            {own.map(player => <option key={player.id} value={player.id} disabled={saved.some(item => item.ourPlayerId === player.id && item.opponentPlayerId !== chosen.id)}>{player.basketball.primaryPosition} · {nameOf(player)}</option>)}
          </select></label>
          <div className="ct-hint ct-hint--affirm">La elección del defensor se guarda en el plan del próximo partido y llega al motor.</div>
          <h3 className="ct-subheading">Instrucciones individuales</h3>
          <p className="ct-hint">Presión, orientación del ataque y coberturas particulares requieren un modelo canónico de instrucciones por rival. No se simulan aquí como opciones guardadas.</p>
        </> : <Empty text="No hay enfrentamiento seleccionable." />}
      </Card>
    </div>
  </>
}

type RotationPreset = 'Equilibrada' | 'Corta' | 'Profunda'
const rotate = (ids: readonly PlayerId[], periods: number, periodMinutes: number, preset: RotationPreset): Record<string, number[]> => {
  const depth = preset === 'Corta' ? Math.min(ids.length, 7) : preset === 'Profunda' ? ids.length : Math.min(ids.length, 10)
  const result: Record<string, number[]> = Object.fromEntries(ids.map(id => [id, Array.from({ length: periods }, () => 0)]))
  if (depth < 5) return result
  for (let q = 0; q < periods; q++) {
    // Assign one playing minute at a time, keeping every player below the period limit.
    const totalUnits = Math.round(periodMinutes * 5)
    const shares = preset === 'Corta' ? [5, 5, 5, 5, 5, 2, 2] : preset === 'Profunda' ? ids.map(() => 1) : ids.map((_, i) => i < 5 ? 3 : 1)
    const counts = new Array(depth).fill(0) as number[]
    for (let minute = 0; minute < totalUnits; minute++) {
      let chosen = 0; let best = Number.POSITIVE_INFINITY
      for (let i = 0; i < depth; i++) {
        if (counts[i]! >= periodMinutes) continue
        const score = (counts[i]! + 0.5) / (shares[i] ?? 1)
        if (score < best) { best = score; chosen = i }
      }
      if (best !== Number.POSITIVE_INFINITY) counts[chosen]! += 1
    }
    ids.slice(0, depth).forEach((id, index) => { result[id]![q] = counts[index]! })
  }
  return result
}

/**
 * Reallocate a single regulation period without losing five-player accounting.
 * The slider the coach moves is authoritative. Other players compensate one minute
 * at a time, respecting their period caps and preserving the total when it was valid.
 */
export function rebalanceRotationSlider(
  current: Readonly<Record<string, readonly number[]>>,
  playerIds: readonly string[],
  playerId: string,
  period: number,
  requestedMinutes: number,
  periodMinutes: number,
): Record<string, number[]> {
  const updated = Object.fromEntries(playerIds.map(id => [id, [...(current[id] ?? [])]])) as Record<string, number[]>
  const currentMinutes = updated[playerId]?.[period] ?? 0
  const target = Math.round(clamp(requestedMinutes, 0, periodMinutes))
  const totalBefore = playerIds.reduce((sum, id) => sum + (updated[id]?.[period] ?? 0), 0)
  if (playerIds.length < 5 || totalBefore !== 5 * periodMinutes) {
    if (updated[playerId]) updated[playerId][period] = target
    return updated
  }
  const others = playerIds.filter(id => id !== playerId)
  const minimum = Math.max(0, 5 * periodMinutes - others.length * periodMinutes)
  const adjustedTarget = clamp(target, minimum, periodMinutes)
  let remaining = Math.abs(adjustedTarget - currentMinutes)
  const raisingTarget = adjustedTarget > currentMinutes
  updated[playerId]![period] = adjustedTarget
  // Each pass finds the player best placed to absorb one minute of change.
  while (remaining > 0) {
    const available = others.filter(id => raisingTarget
      ? (updated[id]?.[period] ?? 0) > 0
      : (updated[id]?.[period] ?? 0) < periodMinutes)
    if (!available.length) break
    available.sort((a, b) => raisingTarget
      ? (updated[b]?.[period] ?? 0) - (updated[a]?.[period] ?? 0)
      : (updated[a]?.[period] ?? 0) - (updated[b]?.[period] ?? 0))
    const partner = available[0]!
    updated[partner]![period] += raisingTarget ? -1 : 1
    remaining -= 1
  }
  if (remaining > 0) updated[playerId]![period] += raisingTarget ? -remaining : remaining
  return updated
}

function RotationsPanel({ world, teamId, onOpenPlayer }: { world: GameWorld; teamId: TeamId; onOpenPlayer?: (id: PlayerId) => void }) {
  const saveMinutes = useGameStore(state => state.updateRotationMinutes)
  const assignSlot = useGameStore(state => state.setLineupSlot)
  const clearSlot = useGameStore(state => state.clearLineupSlot)
  const { game, opponent } = getMatch(world, teamId)
  const rules = game === undefined ? undefined : resolveGameClockRules(world, game.competitionId)
  const periodCount = rules?.periodCount ?? 4
  const periodMinutes = (rules?.periodSeconds ?? 600) / 60
  const lineup = getTeamLineup(world, teamId)
  const all = getTeamRoster(world, teamId)
  const byId = new Map(all.map(p => [p.id, p]))
  const assignments = getLineupAssignments(lineup)
  const selectedPlayers = assignments.map(item => byId.get(item.playerId)).filter((p): p is Player => p !== undefined)
  const ids = selectedPlayers.map(p => p.id)
  const selectionKey = ids.join('|') + ':' + periodCount + ':' + periodMinutes
  const [preset, setPreset] = useState<RotationPreset>('Equilibrada')
  const [draft, setDraft] = useState<{ key: string; minutes: Record<string, number[]> } | null>(null)
  const [saved, setSaved] = useState(false)
  const [query, setQuery] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const stored = world.rotationPlansByTeamId[teamId]?.minutesByPeriod
  const storedSelection = stored && Object.fromEntries(ids.map(id => [id, Array.from({ length: periodCount }, (_, q) => stored[id]?.[q] ?? 0)]))
  const storedValid = storedSelection !== undefined && stored !== undefined && ids.length >= 5
    && isValidRotationMinutes(storedSelection as Record<PlayerId, readonly number[]>, ids, Array.from({ length: periodCount }, () => periodMinutes))
    && ids.every(id => stored[id]?.length === periodCount && stored[id]!.every(v => Number.isFinite(v) && v >= 0 && v <= periodMinutes))
  const effective = draft?.key === selectionKey ? draft.minutes : storedValid ? storedSelection! : rotate(ids, periodCount, periodMinutes, preset)
  const periodTotals = Array.from({ length: periodCount }, (_, q) =>
    selectedPlayers.reduce((sum, p) => sum + (effective[p.id]?.[q] ?? 0), 0))
  const total = periodTotals.reduce((sum, minutes) => sum + minutes, 0)
  const valid = selectedPlayers.length >= 5
    && selectedPlayers.length <= LINEUP_SLOTS.length
    && periodTotals.every((sum, q) => sum === 5 * periodMinutes
      && ids.every(id => {
        const amount = effective[id]?.[q]
        return amount !== undefined && Number.isFinite(amount) && amount >= 0 && amount <= periodMinutes
      }))
    && isValidRotationMinutes(effective as Record<PlayerId, readonly number[]>, ids, Array.from({ length: periodCount }, () => periodMinutes))
  const inRotation = new Set(ids)
  const visibleRoster = all.filter(p => (nameOf(p) + ' ' + p.basketball.primaryPosition).toLowerCase().includes(query.trim().toLowerCase()))
  const togglePlayer = (player: Player) => {
    setSaved(false)
    setSelectionError('')
    setDraft(null)
    const assigned = getLineupSlotForPlayer(lineup, player.id)
    if (assigned !== undefined) {
      clearSlot(assigned)
      return
    }
    const used = new Set(assignments.map(a => a.slot))
    // Fill the canonical starting five before the bench, preferring the player's natural position.
    const chosen = (['PG', 'SG', 'SF', 'PF', 'C'] as const).includes(player.basketball.primaryPosition)
      && !used.has(player.basketball.primaryPosition)
      ? player.basketball.primaryPosition
      : LINEUP_SLOTS.find(slot => !used.has(slot))
    if (chosen === undefined) {
      setSelectionError('Hay doce plazas ocupadas. Retira a un convocado antes de añadir otro.')
      return
    }
    assignSlot(chosen, player.id)
  }
  const sliderChange = (id: PlayerId, q: number, value: number) => {
    setSaved(false)
    setDraft({ key: selectionKey, minutes: rebalanceRotationSlider(effective, ids, id, q, value, periodMinutes) })
  }
  const choosePreset = (next: RotationPreset) => {
    setPreset(next)
    setDraft({ key: selectionKey, minutes: rotate(ids, periodCount, periodMinutes, next) })
    setSaved(false)
  }
  return <>
    <StatStrip>
      <Metric value={selectedPlayers.length + ' / 12'} label="Convocados" tone="ct-green"/>
      <Metric value={total + ' / ' + periodCount * periodMinutes * 5} label="Minutos asignados"/>
      <Metric value={periodTotals.filter(v => v === periodMinutes * 5).length + ' / ' + periodCount} label="Periodos completos"/>
      <Metric value={periodMinutes + "'"} label="Duración periodo"/>
      <div className="ct-stats__actions"><button className="ct-primary" type="button" disabled={!valid} onClick={() => { saveMinutes(effective as Record<PlayerId, readonly number[]>); setSaved(true) }}>GUARDAR ROTACIÓN</button></div>
    </StatStrip>
    <div className="ct-columns ct-columns--rotation ct-columns--rotation-picker">
      <Card title="CONVOCATORIA" note={selectedPlayers.length + ' / ' + LINEUP_SLOTS.length + ' JUGADORES'}>
        <label className="ct-field ct-roster-search">Buscar jugador
          <input aria-label="Buscar jugador para rotación" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre o posición"/>
        </label>
        <div className="ct-roster-list" aria-label="Selección de jugadores para rotación">
          {visibleRoster.map(player => <button key={player.id} type="button"
            className={'ct-roster-item' + (inRotation.has(player.id) ? ' is-selected' : '')}
            aria-pressed={inRotation.has(player.id)}
            aria-label={(inRotation.has(player.id) ? 'Retirar ' : 'Convocar ') + nameOf(player)}
            onClick={() => togglePlayer(player)}>
            <span className="ct-pos">{player.basketball.primaryPosition}</span>
            <span className="ct-roster-name">{nameOf(player)}</span>
            <span className="ct-roster-status">{inRotation.has(player.id) ? '✓' : '+'}</span>
          </button>)}
          {visibleRoster.length === 0 && <Empty text="No hay jugadores que coincidan con la búsqueda."/>}
        </div>
        {selectionError && <p className="ct-hint" role="alert">{selectionError}</p>}
        <p className="ct-hint">Selecciona de 5 a 12 jugadores. La convocatoria se sincroniza con Pizarra y Plantilla.</p>
      </Card>
      <Card title="CRONOLOGÍA DE MINUTOS" note={valid ? 'LISTA PARA GUARDAR' : 'AJUSTE NECESARIO'}>
        <div className="ct-rotation-toolbar">
          <span>{game ? 'VS ' + (opponent?.name ?? 'RIVAL') : 'PLAN DE EQUIPO'}</span>
          <div aria-label="Distribución automática">{(['Equilibrada','Corta','Profunda'] as const).map(choice =>
            <button type="button" key={choice} className={'ct-rotation-preset'+(preset===choice?' is-selected':'')}
              onClick={() => choosePreset(choice)}>{choice}</button>)}</div>
        </div>
        {selectedPlayers.length === 0
          ? <Empty text="Convoca jugadores desde la columna izquierda para activar los deslizadores de minutos."/>
          : <div className="ct-rotation-scroll" style={{ '--ct-periods': periodCount } as CSSProperties}>
            <div className="ct-rot-head"><span>JUGADOR</span>{Array.from({ length: periodCount },(_,q)=><b key={q}>{periodCount===2?'H':'Q'}{q+1}</b>)}<span>TOTAL</span></div>
            {selectedPlayers.map(player => <div className="ct-rot-row" key={player.id}>
              <PlayerButton player={player} onOpen={onOpenPlayer}/>
              {Array.from({ length: periodCount },(_,q) => {
                const minutes = effective[player.id]?.[q] ?? 0
                return <label className="ct-rot-slider" key={q}>
                  <span>{minutes}'</span>
                  <input type="range" min={ids.length === 5 ? periodMinutes : 0} max={periodMinutes} step="1"
                    disabled={ids.length <= 5}
                    value={minutes}
                    aria-label={nameOf(player) + ' · periodo ' + (q+1)}
                    style={{ '--ct-fill': (minutes / periodMinutes * 100) + '%' } as CSSProperties}
                    onChange={e => sliderChange(player.id, q, Number(e.target.value))}/>
                </label>
              })}
              <strong>{(effective[player.id] ?? []).reduce((sum,n)=>sum+n,0)}'</strong>
            </div>)}
            <div className="ct-rot-footer"><span>MINUTOS</span>{periodTotals.map((v,q)=><b className={v===periodMinutes*5?'ct-green':'ct-orange'} key={q}>{v}/{periodMinutes*5}</b>)}<strong>{total}</strong></div>
          </div>}
        <p className="ct-hint" role={valid || selectedPlayers.length < 5 ? 'status' : 'alert'}>
          {saved ? 'Rotación guardada en la partida.' :
            selectedPlayers.length < 5 ? 'Convoca al menos cinco jugadores para distribuir el tiempo.' :
            selectedPlayers.length === 5 ? 'Los cinco deben jugar todos los minutos. Convoca un sexto para poder ajustar su carga.' :
            valid ? 'Arrastra los deslizadores. Los minutos se compensan entre jugadores de ese periodo y el total se mantiene válido.' :
            'Cada periodo debe sumar exactamente cinco jugadores en pista. Elige un preset para equilibrarlo.'}
        </p>
      </Card>
      <Card title="ANÁLISIS" note="CARGA DE MINUTOS">
        <h3 className="ct-subheading">Reparto total</h3>
        {selectedPlayers.map(player => <div className="ct-load-row" key={player.id}>
          <span title={nameOf(player)}>{player.lastName}</span>
          <div><i style={{width: ((effective[player.id] ?? []).reduce((s,v)=>s+v,0)/(periodCount*periodMinutes)*100)+'%'}}/></div>
          <b>{(effective[player.id] ?? []).reduce((s,v)=>s+v,0)}'</b>
        </div>)}
        {selectedPlayers.length === 0 && <Empty text="Convoca jugadores para ver y comparar su carga."/>}
        <p className="ct-hint">La carga es el tiempo previsto, no una predicción de fatiga.</p>
      </Card>
    </div>
  </>
}

function GamePlanPanel({ world, teamId }: { world: GameWorld; teamId: TeamId; onOpenPlayer?: (id: PlayerId) => void }) {
  const save = useGameStore(state => state.updateGamePlanTacticalOverride)
  const { game, opponent } = getMatch(world, teamId)
  const persisted = game === undefined ? undefined : world.gamePlansByKey[String(game.id)+':'+String(teamId)]?.tacticalOverride as MatchTacticalPlan | undefined
  const base = persisted ?? world.tacticalPlansByTeamId[teamId]?.instructions ?? createDefaultTacticalPlan()
  const [active, setActive] = useState<'A' | 'B'>('A')
  const [draft, setDraft] = useState<Record<'A' | 'B', MatchTacticalPlan>>({ A: { ...createDefaultTacticalPlan(), ...base }, B: { ...createDefaultTacticalPlan(), ...base } })
  const [didSave, setDidSave] = useState(false)
  const plan = draft[active]
  const report = game === undefined ? undefined : Object.values(world.oppositionScoutingReportsById).find(item => item.gameId === game.id && item.teamId === teamId)
  const setPlan = (next: MatchTacticalPlan) => { setDraft(prev => ({ ...prev, [active]: next })); setDidSave(false) }
  const selectCoverage = (coverage: Coverage) => setPlan({ ...plan, defense: { ...plan.defense, pickAndRollCoverage: coverage } })
  const changePace = (pace: TacticalLevel) => setPlan({ ...plan, pace })
  const savePlan = () => { if (!game) return; save(plan); setDidSave(true) }
  return <>
    <StatStrip><Metric value={game?.date ?? 'SIN PARTIDO'} label="Próximo encuentro" tone="ct-green"/><Metric value={opponent?.name ?? 'Sin rival'} label="Adversario"/><Metric value={'PLAN '+active} label="Borrador activo"/><Metric value={report?.qualityScore === undefined ? 'SIN INFORME' : report.qualityScore+'/100'} label="Calidad del scouting"/><div className="ct-stats__actions"><button type="button" className="ct-primary" disabled={!game} onClick={savePlan}>APLICAR AL PARTIDO</button></div></StatStrip>
    <div className="ct-columns ct-columns--game">
      <Card title="INFORME DE OPOSICIÓN" note={opponent?.name ?? 'Sin rival'}><div className="ct-opponent"><strong>{opponent?.name ?? 'No hay próximo partido programado'}</strong><span>{report ? 'Informe disponible · ' + report.generatedOn : 'Scouting no disponible'}</span></div>
        {report ? <><h3 className="ct-subheading">Señales identificadas</h3><p className="ct-hint">{report.flaggedPlayerIds.length} jugadores señalados como amenazas. {report.recommendedDefensiveEmphasis ? 'Se recomienda proteger ' + (report.recommendedDefensiveEmphasis==='interior'?'la pintura.':'el perímetro.') : 'Sin énfasis defensivo específico.'}</p>{report.recommendedPaceAdjustment !== undefined && <p className="ct-hint">Ajuste de ritmo recomendado: {report.recommendedPaceAdjustment>0?'+':''}{report.recommendedPaceAdjustment}</p>}</> : <Empty text="No existe todavía un informe de oposición para este encuentro. No se inventan amenazas ni porcentajes."/>}
      </Card>
      <Card title="PLAN DE PARTIDO" note="BORRADORES A / B">
        <div className="ct-switch"><button aria-pressed={active==='A'} type="button" onClick={() => { setActive('A'); setDidSave(false) }}>PLAN A</button><button aria-pressed={active==='B'} type="button" onClick={() => { setActive('B'); setDidSave(false) }}>PLAN B</button></div>
        <div className="ct-game-hero"><small>ESTRATEGIA SELECCIONADA</small><strong>{active==='A'?'PLAN PRINCIPAL':'PLAN ALTERNATIVO'}</strong><p>Ritmo: {plan.pace > 0 ? 'Rápido' : plan.pace < 0 ? 'Lento' : 'Equilibrado'} · Defensa del bloqueo: {(plan.defense.pickAndRollCoverage ?? 'switch').toUpperCase()}</p></div>
        <div className="ct-fact-grid"><div><small>Quinteto</small><b>Según Pizarra</b></div><div><small>Rotación</small><b>Según Rotaciones</b></div><div><small>Defensores</small><b>Según Emparejamientos</b></div></div>
        <p className="ct-hint">Planes A y B son borradores de esta sesión. «Aplicar al partido» guarda exclusivamente el plan seleccionado como override del próximo encuentro.</p>
        {didSave && <p role="status" className="ct-hint ct-hint--affirm">Plan seleccionado guardado en el GameWorld del próximo partido.</p>}
      </Card>
      <Card title="DECISIONES" note="ANTES DEL SALTO INICIAL">
        <label className="ct-field">Ritmo<select aria-label="Ritmo del plan de partido" value={plan.pace} onChange={e => changePace(Number(e.target.value) as TacticalLevel)}>{[-2,-1,0,1,2].map((v,i)=><option value={v} key={v}>{['Muy lento','Lento','Equilibrado','Rápido','Muy rápido'][i]}</option>)}</select></label>
        <label className="ct-field">Cobertura Pick & Roll<select aria-label="Cobertura Pick and Roll" value={plan.defense.pickAndRollCoverage ?? 'switch'} onChange={e => selectCoverage(e.target.value as Coverage)}>{coverageOptions.map(v=><option value={v} key={v}>{v.toUpperCase()}</option>)}</select></label>
        <label className="ct-field">Protección de la pintura<select aria-label="Protección de pintura" value={plan.defense.interior} onChange={e => { const value=Number(e.target.value) as TacticalLevel; setPlan({ ...plan, defense: value===2?{...plan.defense,interior:2,perimeter:-1}:value===-1?{...plan.defense,interior:-1,perimeter:2}:{...plan.defense,interior:0,perimeter:0} }) }}><option value="0">Equilibrada</option><option value="2">Priorizar pintura</option><option value="-1">Presión perimetral</option></select></label>
        <p className="ct-hint">Los ajustes de ritmo, énfasis defensivo y cobertura se almacenan como instrucciones tácticas canónicas. Las jugadas dibujadas no se presentan como ejecutadas por el motor.</p>
      </Card>
    </div>
  </>
}
