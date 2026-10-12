import { useMemo, useState } from 'react'
import type { GameWorld } from '@/domain/world'
import { getTeamLineup, getTeamRoster, resolveGameClockRules } from '@/domain/world'
import { getNextUserGame } from '@/engine/calendar'
import { getLineupAssignments, isValidRotationMinutes, type DefensiveMatchupAssignment } from '@/domain/tactics'
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

function Card({ title, note, children, className = '' }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return <section className={'ct-card ' + className}><header className="ct-card__head"><h2>{title}</h2>{note && <span>{note}</span>}</header><div className="ct-card__body">{children}</div></section>
}
function Empty({ text }: { text: string }) { return <p className="ct-empty">{text}</p> }
function StatStrip({ children }: { children: React.ReactNode }) { return <div className="ct-stats" aria-label="Resumen táctico">{children}</div> }
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
          <span className="ct-pos">{player.basketball.primaryPosition}</span><span className="ct-rival__name">{nameOf(player)}<small>{report?.flaggedPlayerIds.includes(player.id) ? 'Señalado en el scouting' : 'Sin amenaza confirmada'}</small></span>
          <b>{saved.some(item => item.opponentPlayerId === player.id) ? '✓' : '·'}</b>
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

function RotationsPanel({ world, teamId, onOpenPlayer }: { world: GameWorld; teamId: TeamId; onOpenPlayer?: (id: PlayerId) => void }) {
  const saveMinutes = useGameStore(state => state.updateRotationMinutes)
  const { game } = getMatch(world, teamId)
  const rules = game === undefined ? undefined : resolveGameClockRules(world, game.competitionId)
  const periodCount = rules?.periodCount ?? 4
  const periodMinutes = (rules?.periodSeconds ?? 600) / 60
  const lineup = getTeamLineup(world, teamId)
  const all = getTeamRoster(world, teamId)
  const selectedPlayers = getLineupAssignments(lineup).map(item => all.find(p => p.id === item.playerId)).filter((p): p is Player => p !== undefined)
  const ids = selectedPlayers.map(player => player.id)
  const stored = world.rotationPlansByTeamId[teamId]?.minutesByPeriod
  const [preset, setPreset] = useState<RotationPreset>('Equilibrada')
  const [draft, setDraft] = useState<Record<string, number[]> | null>(null)
  const effective = draft ?? (stored ? Object.fromEntries(ids.map(id => [id, Array.from({ length: periodCount }, (_, q) => stored[id]?.[q] ?? 0)])) : rotate(ids, periodCount, periodMinutes, preset))
  const [saved, setSaved] = useState(false)
  const valid = selectedPlayers.length >= 5 && isValidRotationMinutes(effective as Record<PlayerId, readonly number[]>, ids, Array.from({ length: periodCount }, () => periodMinutes))
  const total = selectedPlayers.reduce((sum, p) => sum + (effective[p.id] ?? []).reduce((a,b) => a+b, 0), 0)
  const periodTotals = Array.from({ length: periodCount }, (_, q) => selectedPlayers.reduce((sum,p) => sum + (effective[p.id]?.[q] ?? 0),0))
  const edit = (id: PlayerId, q: number, value: number) => {
    setSaved(false)
    setDraft(Object.fromEntries(ids.map(playerId => [playerId, Array.from({ length: periodCount }, (_, j) => playerId === id && j === q ? clamp(value,0,periodMinutes) : effective[playerId]?.[j] ?? 0)])))
  }
  const choosePreset = (next: RotationPreset) => { setPreset(next); setDraft(rotate(ids, periodCount, periodMinutes, next)); setSaved(false) }
  return <>
    <StatStrip><Metric value={selectedPlayers.length} label="Jugadores en rotación" tone="ct-green"/><Metric value={total + ' / ' + periodCount*periodMinutes*5} label="Minutos asignados"/><Metric value={periodTotals.filter(n => n === 5*periodMinutes).length + ' / ' + periodCount} label="Periodos completos"/><Metric value={periodMinutes + "'"} label="Duración periodo"/><div className="ct-stats__actions"><button type="button" className="ct-primary" disabled={!valid} onClick={() => { saveMinutes(effective as Record<PlayerId, readonly number[]>); setSaved(true) }}>GUARDAR ROTACIÓN</button></div></StatStrip>
    <div className="ct-columns ct-columns--rotation">
      <Card title="GESTIÓN" note="PRESSETS"><h3 className="ct-subheading">Plan de minutos</h3>{(['Equilibrada','Corta','Profunda'] as const).map(choice => <button className={'ct-list-action'+(preset===choice?' is-selected':'')} type="button" key={choice} onClick={() => choosePreset(choice)}>{choice}<span>↗</span></button>)}<p className="ct-hint">Los minutos se ajustan por jugador y periodo según la duración real de la competición.</p></Card>
      <Card title="CRONOLOGÍA DE MINUTOS" note={valid ? 'LISTA PARA GUARDAR' : 'AJUSTE NECESARIO'}>
        {!selectedPlayers.length ? <Empty text="Selecciona jugadores para el partido desde Pizarra."/> : <div className="ct-rotation-scroll"><div className="ct-rot-head"><span>JUGADOR</span>{Array.from({ length: periodCount },(_,q)=><b key={q}>{periodCount===2?'H':'Q'}{q+1}</b>)}<span>TOTAL</span></div>{selectedPlayers.map(player => <div className="ct-rot-row" key={player.id}><PlayerButton player={player} onOpen={onOpenPlayer}/>{Array.from({ length: periodCount },(_,q)=><label key={q} className="ct-rot-min"><input aria-label={nameOf(player)+' · periodo '+(q+1)} type="number" min="0" max={periodMinutes} step="1" value={effective[player.id]?.[q] ?? 0} onChange={e => edit(player.id,q,Number(e.target.value))}/><span style={{width: ((effective[player.id]?.[q] ?? 0)/periodMinutes*100)+'%'}}/></label>)}<strong>{(effective[player.id] ?? []).reduce((sum,n)=>sum+n,0)}'</strong></div>)}<div className="ct-rot-footer"><span>MINUTOS</span>{periodTotals.map((v,q)=><b className={v===periodMinutes*5?'ct-green':'ct-orange'} key={q}>{v}/{periodMinutes*5}</b>)}<strong>{total}</strong></div></div>}
        <p className="ct-hint" role={valid ? 'status' : 'alert'}>{saved ? 'Rotación guardada en la partida.' : valid ? 'Asignación válida. Guarda para aplicar al próximo partido.' : 'Cada periodo debe sumar exactamente cinco jugadores en pista. Corrige las columnas marcadas.'}</p>
      </Card>
      <Card title="ANÁLISIS" note="CARGA"><h3 className="ct-subheading">Minutos por jugador</h3>{selectedPlayers.map(player => <div className="ct-load-row" key={player.id}><span>{player.lastName}</span><div><i style={{width: (((effective[player.id] ?? []).reduce((s,v)=>s+v,0))/(periodCount*periodMinutes)*100)+'%'}}/></div><b>{(effective[player.id] ?? []).reduce((s,v)=>s+v,0)}'</b></div>)}<p className="ct-hint">La carga mostrada representa los minutos planificados, no una predicción de fatiga.</p></Card>
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
