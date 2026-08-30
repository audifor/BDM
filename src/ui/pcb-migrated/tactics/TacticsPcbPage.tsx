import { useMemo, useState } from 'react'
import type { GameWorld } from '@/domain/world'
import { getTeamRoster } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import type { Player } from '@/domain/player'
import type { MatchTacticalPlan, TacticalLevel } from '@/engine/match'
import { INITIAL_FRAME, TacticsMigrationRepository, type SavedPlay } from './TacticsMigrationRepository'
import PcbTacticsCreator from './PcbTacticsCreator'
import PcbTacticsBoard from './PcbTacticsBoard'
import DraggableSubnav from '../club/components/DraggableSubnav'
import './TacticsPcbPage.css'

type Tab = 'board' | 'designer' | 'matchups' | 'rotations' | 'plays' | 'match'
const tabs: readonly [Tab, string][] = [['board', 'Pizarra'], ['designer', 'Diseñador'], ['matchups', 'Emparejamientos'], ['rotations', 'Rotaciones'], ['plays', 'Jugadas'], ['match', 'Partido']]
const repo = new TacticsMigrationRepository()
const paceOptions: readonly { readonly label: string; readonly value: TacticalLevel }[] = [{ label: 'Equilibrado', value: 0 }, { label: 'Rápido', value: 1 }, { label: 'Lento', value: -1 }]
const coverageOptions: readonly { readonly label: string; readonly value: 'Balanced' | 'Protect paint' | 'Pressure perimeter' }[] = [{ label: 'Drop', value: 'Balanced' }, { label: 'Switch', value: 'Protect paint' }, { label: 'Blitz', value: 'Pressure perimeter' }]
const defensePresets: Record<'Balanced' | 'Protect paint' | 'Pressure perimeter', { readonly interior: TacticalLevel; readonly perimeter: TacticalLevel }> = { Balanced: { interior: 0, perimeter: 0 }, 'Protect paint': { interior: 2, perimeter: -1 }, 'Pressure perimeter': { interior: -1, perimeter: 2 } }
function coveragePresetFor(defense: { readonly interior: TacticalLevel; readonly perimeter: TacticalLevel }): 'Balanced' | 'Protect paint' | 'Pressure perimeter' {
  if (defense.interior === 2 && defense.perimeter === -1) return 'Protect paint'
  if (defense.interior === -1 && defense.perimeter === 2) return 'Pressure perimeter'
  return 'Balanced'
}

function playerRating(player: Player): number {
  const ratings = player.basketball.ratings
  const values = [ratings.finishing, ratings.shooting, ratings.playmaking, ratings.perimeterDefense, ratings.interiorDefense, ratings.rebounding, ratings.athleticism]
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}
function toBoardRoster(players: readonly Player[]) {
  return players.map((player) => {
    const ratings = player.basketball.ratings
    const pos = player.basketball.primaryPosition
    return {
      id: player.id,
      name: `${player.firstName} ${player.lastName}`,
      position: pos,
      rating: playerRating(player),
      data: { attributes: { finishing: ratings.finishing, shooting: ratings.shooting, playmaking: ratings.playmaking, perimeterDefense: ratings.perimeterDefense, interiorDefense: ratings.interiorDefense, rebounding: ratings.rebounding, athleticism: ratings.athleticism }, bio: { pos } },
    }
  })
}

export function TacticsPcbPage({ world, plan, onChange, onReset }: { readonly world?: GameWorld; readonly plan?: MatchTacticalPlan; readonly onChange?: (plan: MatchTacticalPlan) => void; readonly onReset?: () => void }) {
  const [tab, setTab] = useState<Tab>('board')
  const [tacticalRoles, setTacticalRoles] = useState<Record<string, unknown>>({})
  const team = useMemo(() => (world === undefined ? undefined : getUserTeam(world)), [world])
  const roster = useMemo(() => (world === undefined || team === undefined ? [] : getTeamRoster(world, team.id)), [world, team])
  const boardRoster = useMemo(() => toBoardRoster(roster), [roster])
  return <section className="pcb-tactics" aria-label="Tácticas PCB migradas"><DraggableSubnav className="pcb-tactics__tabs" items={tabs.map(([id, label]) => ({ id, label, active: tab === id, onClick: () => setTab(id) }))} storageKey="pcbasket.subnav.tactics" />{tab === 'board' && <PcbTacticsBoard onRolesChange={(next: Record<string, unknown>) => { setTacticalRoles(next); window.localStorage.setItem('pcbasket.tactics.roles', JSON.stringify(next)) }} roster={boardRoster} tacticalRoles={tacticalRoles} teamId={team === undefined ? 0 : Number(team.id) || 1} />}{tab === 'designer' && <PcbTacticsCreator />}{tab === 'matchups' && <Matchups />}{tab === 'rotations' && <Rotations roster={roster} />}{tab === 'plays' && <Plays />}{tab === 'match' && <MatchPlan world={world} plan={plan} onChange={onChange} onReset={onReset} />}</section>
}

function Control({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) { return <label className="pcb-tactics__control">{label}<select onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option}>{option}</option>)}</select></label> }

function Matchups() {
  const [query, setQuery] = useState('')
  return <main className="pcb-tactics__table-page"><header><div><h2>Matchups Defensivos</h2><small>Sin datos de scouting del próximo rival</small></div><input aria-label="Buscar rival" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar rival" value={query} /><button disabled type="button">Auto-matchup</button><button disabled type="button">Reset</button></header><table><thead><tr><th>POS</th><th>JUGADOR RIVAL</th><th>AMENAZA</th><th>ALTURA</th><th>DEFENSOR</th><th>PRESIÓN</th><th>P&R</th><th>DIRECCIÓN</th></tr></thead><tbody><tr><td colSpan={8}>No hay datos de scouting del rival disponibles todavía.</td></tr></tbody></table></main>
}

function Rotations({ roster }: { readonly roster: readonly Player[] }) { const [minutes, setMinutes] = useState<Record<string, number[]>>(() => Object.fromEntries(roster.map((player, index) => [player.id, index < 5 ? [8, 8, 8, 8, 0] : [0, 0, 0, 0, 0]]))); const [league, setLeague] = useState('FIBA'); const [saved, setSaved] = useState(false); const update = (id: string, quarter: number, value: number) => setMinutes((current) => ({ ...current, [id]: (current[id] ?? [0, 0, 0, 0, 0]).map((minute, index) => index === quarter ? Math.max(0, Math.min(10, value)) : minute) }))
  const preset = () => setMinutes(Object.fromEntries(roster.map((player, index) => [player.id, index < 5 ? [8, 8, 8, 8, 0] : [2, 2, 2, 2, 0]])))
  return <main className="pcb-tactics__rotation"><header><div><h2>Matriz de Rotación</h2><small>Configuración temporal de sesión</small></div><select onChange={(event) => setLeague(event.target.value)} value={league}><option>FIBA</option><option>NBA</option><option>NCAA</option></select><button onClick={preset} type="button">Auto-generar</button><button onClick={preset} type="button">Reset</button><button className="is-primary" onClick={() => setSaved(true)} type="button">Guardar</button>{saved && <em>Guardado</em>}</header><div className="pcb-tactics__rotation-grid"><div className="is-head"><span>Jugador</span>{['Q1', 'Q2', 'Q3', 'Q4', 'OT'].map((quarter) => <span key={quarter}>{quarter}</span>)}<span>Total</span></div>{roster.length === 0 ? <p>No hay jugadores en la plantilla del usuario.</p> : roster.map((player) => { const row = minutes[player.id] ?? [0, 0, 0, 0, 0]; return <div draggable key={player.id}><span><b>{player.basketball.primaryPosition}</b> {player.firstName} {player.lastName}</span>{row.map((value, quarter) => <span key={quarter}><input max="10" min="0" onChange={(event) => update(player.id, quarter, Number(event.target.value))} type="range" value={value} /><input max="10" min="0" onChange={(event) => update(player.id, quarter, Number(event.target.value))} type="number" value={value} /></span>)}<strong>{row.reduce((sum, value) => sum + value, 0)}</strong></div> })}</div></main> }

function Plays() { const [plays, setPlays] = useState<SavedPlay[]>(repo.loadPlays()); const [name, setName] = useState(''); const [selected, setSelected] = useState<string | null>(null); const [modal, setModal] = useState(false); const create = () => { if (!name.trim()) return; const play = repo.savePlay({ id: `library-${Date.now()}`, name, frames: [INITIAL_FRAME()], createdAt: new Date().toLocaleDateString() }); setPlays(repo.loadPlays()); setSelected(play.id); setModal(false); setName('') }
  return <main className="pcb-tactics__plays"><header><div><h2>Catálogo de Jugadas</h2><small>{plays.length} jugadas</small></div><button className="is-primary" onClick={() => setModal(true)} type="button">+ Nueva jugada</button></header><div className="pcb-tactics__play-list">{plays.length === 0 && <p>Sin jugadas guardadas. Usa el Diseñador o crea una aquí.</p>}{plays.map((play) => <article className={selected === play.id ? 'is-selected' : ''} key={play.id} onClick={() => setSelected(play.id)}><div><b>{play.name}</b><small>Set · Halfcourt · {play.createdAt}</small></div><button onClick={(event) => { event.stopPropagation(); repo.deletePlay(play.id); setPlays(repo.loadPlays()); if (selected === play.id) setSelected(null) }} type="button">Eliminar</button></article>)}</div>{modal && <Modal title="Nueva jugada" onClose={() => setModal(false)}><label>Nombre<input autoFocus onChange={(event) => setName(event.target.value)} value={name} /></label><footer><button onClick={() => setModal(false)} type="button">Cancelar</button><button className="is-primary" onClick={create} type="button">Crear</button></footer></Modal>}</main> }
const DEFAULT_TACTICAL_PLAN: MatchTacticalPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }
const rotationOptions = ['Estándar', 'Corta', 'Profunda']
function MatchPlan({ world, plan, onChange, onReset }: { readonly world?: GameWorld; readonly plan?: MatchTacticalPlan; readonly onChange?: (plan: MatchTacticalPlan) => void; readonly onReset?: () => void }) {
  const [notes, setNotes] = useState('Atacar el lado débil tras bloqueo directo.')
  const [saved, setSaved] = useState(false)
  const [rotation, setRotation] = useState('Estándar')
  const [scoutingOpen, setScoutingOpen] = useState(false)
  const activePlan = plan ?? DEFAULT_TACTICAL_PLAN
  const nextGame = world === undefined ? undefined : getNextUserGame(world)
  const userTeam = world === undefined ? undefined : getUserTeam(world)
  const opponentTeam = world === undefined || nextGame === undefined || userTeam === undefined
    ? undefined
    : world.teams[nextGame.homeTeamId === userTeam.id ? nextGame.awayTeamId : nextGame.homeTeamId]
  const paceLabel = paceOptions.find((option) => option.value === activePlan.pace)?.label ?? 'Equilibrado'
  const coverageLabel = coverageOptions.find((option) => option.value === coveragePresetFor(activePlan.defense))?.label ?? 'Drop'
  return <main className="pcb-tactics__match"><header><div><h2>Plan de Partido</h2><small>Preparación · sesión temporal</small></div><span>{opponentTeam === undefined ? 'Sin próximo rival programado' : opponentTeam.name}</span><button onClick={() => { setNotes(''); setSaved(false); setRotation('Estándar'); onReset?.() }} type="button">Reset</button><button className="is-primary" onClick={() => setSaved(true)} type="button">Guardar plan</button></header>{saved && <p className="pcb-tactics__notice">Plan guardado para esta sesión.</p>}<div className="pcb-tactics__match-grid"><section><h3>{opponentTeam === undefined ? 'Sin rival' : opponentTeam.name}</h3><dl><div><dt>Amenaza principal</dt><dd>Sin datos de scouting</dd></div><div><dt>Fortaleza</dt><dd>Sin datos de scouting</dd></div><div><dt>Debilidad</dt><dd>Sin datos de scouting</dd></div></dl><button onClick={() => setScoutingOpen(true)} type="button">Ver scouting</button></section><section><h3>Overrides</h3><Control label="Ritmo" onChange={(value) => { const option = paceOptions.find((item) => item.label === value); if (option !== undefined) onChange?.({ ...activePlan, pace: option.value }) }} options={paceOptions.map((option) => option.label)} value={paceLabel} /><Control label="Cobertura P&R" onChange={(value) => { const option = coverageOptions.find((item) => item.label === value); if (option !== undefined) onChange?.({ ...activePlan, defense: defensePresets[option.value] }) }} options={coverageOptions.map((option) => option.label)} value={coverageLabel} /><Control label="Rotación" onChange={setRotation} options={rotationOptions} value={rotation} /></section><section><h3>Notas del cuerpo técnico</h3><textarea onChange={(event) => setNotes(event.target.value)} value={notes} /><button onClick={() => navigator.clipboard?.writeText(notes)} type="button">Copiar plan</button></section></div>{scoutingOpen && <Modal onClose={() => setScoutingOpen(false)} title={`Scouting · ${opponentTeam === undefined ? 'Sin rival' : opponentTeam.name}`}><p>No hay informe de scouting disponible todavía.</p><footer><button onClick={() => setScoutingOpen(false)} type="button">Cerrar</button></footer></Modal>}</main>
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="pcb-tactics__modal" onMouseDown={onClose}><section onMouseDown={(event) => event.stopPropagation()}><header><h3>{title}</h3><button onClick={onClose} type="button">×</button></header>{children}</section></div> }
