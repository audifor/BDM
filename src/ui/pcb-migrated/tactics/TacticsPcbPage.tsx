import { useEffect, useMemo, useState } from 'react'
import type { GameWorld } from '@/domain/world'
import { getTeamLineup, getTeamRoster, resolveGameClockRules } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import type { Player } from '@/domain/player'
import { legacyRatingSignals } from '@/domain/player'
import type { PlayerId } from '@/domain/ids'
import { createEntityId } from '@/domain/ids'
import { getLineupAssignments, getLineupSlotForPlayer, LINEUP_SLOTS, type DefensiveMatchupAssignment, type LineupSlot, type Playbook, type SavedPlay, type TeamLineup, type TeamRotationIntent } from '@/domain/tactics'
import type { MatchTacticalPlan, TacticalLevel } from '@/engine/match'
import { INITIAL_FRAME } from './TacticsMigrationRepository'
import PcbTacticsCreator from './PcbTacticsCreator'
import PcbTacticsBoard from './PcbTacticsBoard'
import DraggableSubnav from '../club/components/DraggableSubnav'
import './TacticsPcbPage.css'

type Tab = 'board' | 'designer' | 'matchups' | 'rotations' | 'plays' | 'match'
const tabs: readonly [Tab, string][] = [['board', 'Pizarra'], ['designer', 'Diseñador'], ['matchups', 'Emparejamientos'], ['rotations', 'Rotaciones'], ['plays', 'Jugadas'], ['match', 'Partido']]
const paceOptions: readonly { readonly label: string; readonly value: TacticalLevel }[] = [{ label: 'Equilibrado', value: 0 }, { label: 'Rápido', value: 1 }, { label: 'Lento', value: -1 }]
const coverageOptions: readonly { readonly label: string; readonly value: 'Balanced' | 'Protect paint' | 'Pressure perimeter' }[] = [{ label: 'Drop', value: 'Balanced' }, { label: 'Switch', value: 'Protect paint' }, { label: 'Blitz', value: 'Pressure perimeter' }]
const defensePresets: Record<'Balanced' | 'Protect paint' | 'Pressure perimeter', { readonly interior: TacticalLevel; readonly perimeter: TacticalLevel }> = { Balanced: { interior: 0, perimeter: 0 }, 'Protect paint': { interior: 2, perimeter: -1 }, 'Pressure perimeter': { interior: -1, perimeter: 2 } }
function coveragePresetFor(defense: { readonly interior: TacticalLevel; readonly perimeter: TacticalLevel }): 'Balanced' | 'Protect paint' | 'Pressure perimeter' {
  if (defense.interior === 2 && defense.perimeter === -1) return 'Protect paint'
  if (defense.interior === -1 && defense.perimeter === 2) return 'Pressure perimeter'
  return 'Balanced'
}

/** Deterministic FIN/SHO/PMK/PDE/IDE/REB/ATH projection of the 35 canonical Player V2 ratings, for the board's compact display only - never persisted, never read from stale legacy data. */
function boardSummarySignals(player: Player) {
  return legacyRatingSignals(player.basketball.ratings)
}
function playerRating(player: Player): number {
  const signals = boardSummarySignals(player)
  const values = [signals.finishing, signals.shooting, signals.playmaking, signals.perimeterDefense, signals.interiorDefense, signals.rebounding, signals.athleticism]
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}
function toBoardRoster(players: readonly Player[], lineup: TeamLineup | undefined) {
  return players.map((player) => {
    const signals = boardSummarySignals(player)
    const pos = player.basketball.primaryPosition
    return {
      id: player.id,
      name: `${player.firstName} ${player.lastName}`,
      position: pos,
      rating: playerRating(player),
      lineupSlot: lineup === undefined ? undefined : getLineupSlotForPlayer(lineup, player.id),
      data: { attributes: { finishing: signals.finishing, shooting: signals.shooting, playmaking: signals.playmaking, perimeterDefense: signals.perimeterDefense, interiorDefense: signals.interiorDefense, rebounding: signals.rebounding, athleticism: signals.athleticism }, bio: { pos } },
    }
  })
}

export function TacticsPcbPage({
  world,
  plan,
  onChange,
  onReset,
  onLineupSlotChange,
  onLineupSlotClear,
  onUpdateRotationMinutes,
  onUpdateMatchups,
  onSaveGamePlanTacticalOverride,
  onSaveDesignerPlay,
  onDeleteDesignerPlay,
  onSaveDesignerPlaybook,
  onDeleteDesignerPlaybook,
}: {
  readonly world?: GameWorld
  readonly plan?: MatchTacticalPlan
  readonly onChange?: (plan: MatchTacticalPlan) => void
  readonly onReset?: () => void
  readonly onLineupSlotChange?: (slot: LineupSlot, playerId: PlayerId) => void
  readonly onLineupSlotClear?: (slot: LineupSlot) => void
  readonly onUpdateRotationMinutes?: (minutesByPeriod: Readonly<Record<PlayerId, readonly number[]>>) => void
  readonly onUpdateMatchups?: (matchups: readonly DefensiveMatchupAssignment[]) => void
  readonly onSaveGamePlanTacticalOverride?: (tacticalOverride: MatchTacticalPlan) => void
  readonly onSaveDesignerPlay?: (play: SavedPlay) => void
  readonly onDeleteDesignerPlay?: (playId: string) => void
  readonly onSaveDesignerPlaybook?: (playbook: Playbook) => void
  readonly onDeleteDesignerPlaybook?: (playbookId: string) => void
}) {
  const [tab, setTab] = useState<Tab>('board')
  const [tacticalRoles, setTacticalRoles] = useState<Record<string, unknown>>({})
  const team = useMemo(() => (world === undefined ? undefined : getUserTeam(world)), [world])
  const roster = useMemo(() => (world === undefined || team === undefined ? [] : getTeamRoster(world, team.id)), [world, team])
  const lineup = useMemo(() => (world === undefined || team === undefined ? undefined : getTeamLineup(world, team.id)), [world, team])
  const boardRoster = useMemo(() => toBoardRoster(roster, lineup), [roster, lineup])
  const nextGame = useMemo(() => (world === undefined ? undefined : getNextUserGame(world)), [world])
  const opponentTeam = useMemo(() => (world === undefined || nextGame === undefined || team === undefined ? undefined : world.teams[nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId]), [world, nextGame, team])
  const opponentRoster = useMemo(() => (world === undefined || opponentTeam === undefined ? [] : getTeamRoster(world, opponentTeam.id)), [world, opponentTeam])
  const clockRules = useMemo(() => (world === undefined || nextGame === undefined ? undefined : resolveGameClockRules(world, nextGame.competitionId)), [world, nextGame])
  const rotationIntent = useMemo(() => (world === undefined || team === undefined ? undefined : world.rotationPlansByTeamId[team.id]), [world, team])
  const gamePlanKey = nextGame === undefined || team === undefined ? undefined : `${nextGame.id}:${team.id}`
  const persistedMatchups = useMemo(() => (world === undefined || gamePlanKey === undefined ? [] : world.gamePlansByKey[gamePlanKey]?.matchups ?? []), [world, gamePlanKey])
  const persistedTacticalOverride = useMemo(() => (world === undefined || gamePlanKey === undefined ? undefined : world.gamePlansByKey[gamePlanKey]?.tacticalOverride as MatchTacticalPlan | undefined), [world, gamePlanKey])
  const savedPlays = useMemo(() => (world === undefined ? [] : Object.values(world.savedPlaysById)), [world])
  const playbooks = useMemo(() => (world === undefined ? [] : Object.values(world.playbooksById)), [world])
  return <section className="pcb-tactics" aria-label="Tácticas PCB migradas"><DraggableSubnav className="pcb-tactics__tabs" items={tabs.map(([id, label]) => ({ id, label, active: tab === id, onClick: () => setTab(id) }))} storageKey="pcbasket.subnav.tactics" />{tab === 'board' && <PcbTacticsBoard onLineupSlotChange={onLineupSlotChange} onLineupSlotClear={onLineupSlotClear} onRolesChange={(next: Record<string, unknown>) => { setTacticalRoles(next); window.localStorage.setItem('pcbasket.tactics.roles', JSON.stringify(next)) }} roster={boardRoster} tacticalRoles={tacticalRoles} teamId={team?.id} />}{tab === 'designer' && <PcbTacticsCreator onDeletePlay={onDeleteDesignerPlay} onDeletePlaybook={onDeleteDesignerPlaybook} onSavePlay={onSaveDesignerPlay} onSavePlaybook={onSaveDesignerPlaybook} playbooks={playbooks} savedPlays={savedPlays} />}{tab === 'matchups' && <Matchups gameKey={gamePlanKey} onUpdateMatchups={onUpdateMatchups} opponentRoster={opponentRoster} opponentTeam={opponentTeam} ourLineup={lineup} ourRoster={roster} persistedMatchups={persistedMatchups} />}{tab === 'rotations' && <Rotations clockRules={clockRules} lineup={lineup} onUpdateRotationMinutes={onUpdateRotationMinutes} rotationIntent={rotationIntent} roster={roster} />}{tab === 'plays' && <Plays onDeletePlay={onDeleteDesignerPlay} onSavePlay={onSaveDesignerPlay} savedPlays={savedPlays} />}{tab === 'match' && <MatchPlan gameKey={gamePlanKey} onChange={onChange} onReset={onReset} onSaveTacticalOverride={onSaveGamePlanTacticalOverride} persistedTacticalOverride={persistedTacticalOverride} plan={plan} world={world} />}</section>
}

function Control({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) { return <label className="pcb-tactics__control">{label}<select onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option}>{option}</option>)}</select></label> }

/**
 * Real next-opponent defensive matchup assignment (Issue #9). No fake scouting players/opponent
 * identity: the opponent roster is the actual next scheduled opponent's real GameWorld roster,
 * always selectable regardless of scouting - scouting (not modeled yet) would only ever gate how
 * much *rating/threat detail* is knowable about them, never whether they can be assigned a defender.
 */
function Matchups({
  ourRoster,
  ourLineup,
  opponentTeam,
  opponentRoster,
  persistedMatchups,
  gameKey,
  onUpdateMatchups,
}: {
  readonly ourRoster: readonly Player[]
  readonly ourLineup?: TeamLineup
  readonly opponentTeam?: { readonly id: string; readonly name: string }
  readonly opponentRoster: readonly Player[]
  readonly persistedMatchups: readonly DefensiveMatchupAssignment[]
  readonly gameKey?: string
  readonly onUpdateMatchups?: (matchups: readonly DefensiveMatchupAssignment[]) => void
}) {
  const [query, setQuery] = useState('')
  const ourStarters = activeSquad(ourLineup, ourRoster).filter(({ slot }) => isLineupStarter(slot)).map(({ player }) => player)
  const [assignments, setAssignments] = useState<Record<string, string>>(() => Object.fromEntries(persistedMatchups.map((entry) => [entry.opponentPlayerId, entry.ourPlayerId])))
  const [reconciledKey, setReconciledKey] = useState(gameKey)
  // Reconcile local assignments whenever the upcoming game/opponent identity changes, so a
  // defender assigned for game A can never leak into game B's persisted matchups (Issue #9).
  if (gameKey !== reconciledKey) {
    setReconciledKey(gameKey)
    setAssignments(Object.fromEntries(persistedMatchups.map((entry) => [entry.opponentPlayerId, entry.ourPlayerId])))
  }
  const filteredOpponents = opponentRoster.filter((player) => `${player.firstName} ${player.lastName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const persist = (next: Record<string, string>) => {
    setAssignments(next)
    onUpdateMatchups?.(Object.entries(next).map(([opponentPlayerId, ourPlayerId]) => ({ ourPlayerId: ourPlayerId as PlayerId, opponentPlayerId: opponentPlayerId as PlayerId })))
  }
  const autoMatchup = () => {
    const next: Record<string, string> = {}
    opponentRoster.forEach((opponent, index) => {
      const defender = ourStarters[index % Math.max(1, ourStarters.length)]
      if (defender !== undefined) next[opponent.id] = defender.id
    })
    persist(next)
  }
  return (
    <main className="pcb-tactics__table-page">
      <header>
        <div>
          <h2>Matchups Defensivos</h2>
          <small>{opponentTeam === undefined ? 'Sin próximo rival programado' : `Rival: ${opponentTeam.name}`}</small>
        </div>
        <input aria-label="Buscar rival" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar rival" value={query} />
        <button disabled={opponentRoster.length === 0 || ourStarters.length === 0} onClick={autoMatchup} type="button">Auto-matchup</button>
        <button disabled={Object.keys(assignments).length === 0} onClick={() => persist({})} type="button">Reset</button>
      </header>
      <table>
        <thead>
          <tr><th>POS</th><th>JUGADOR RIVAL</th><th>DEFENSOR</th></tr>
        </thead>
        <tbody>
          {opponentTeam === undefined ? (
            <tr><td colSpan={3}>Sin próximo rival programado.</td></tr>
          ) : filteredOpponents.length === 0 ? (
            <tr><td colSpan={3}>Sin jugadores rivales disponibles.</td></tr>
          ) : (
            filteredOpponents.map((opponent) => (
              <tr key={opponent.id}>
                <td>{opponent.basketball.primaryPosition}</td>
                <td>{opponent.firstName} {opponent.lastName}</td>
                <td>
                  <select
                    aria-label={`Defensor de ${opponent.firstName} ${opponent.lastName}`}
                    onChange={(event) => persist(event.target.value === '' ? Object.fromEntries(Object.entries(assignments).filter(([id]) => id !== opponent.id)) : { ...assignments, [opponent.id]: event.target.value })}
                    value={assignments[opponent.id] ?? ''}
                  >
                    <option value="">Sin asignar</option>
                    {ourStarters.map((defender) => (
                      <option key={defender.id} value={defender.id}>{defender.firstName} {defender.lastName}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </main>
  )
}

function isLineupStarter(slot: LineupSlot): boolean {
  return LINEUP_SLOTS.indexOf(slot) < 5
}
/** The canonical active squad (starters + bench), in PG..C, B1..B7 order. Unassigned roster players are excluded. */
function activeSquad(lineup: TeamLineup | undefined, roster: readonly Player[]): readonly { readonly slot: LineupSlot; readonly player: Player }[] {
  if (lineup === undefined) return []
  const byId = new Map(roster.map((player) => [player.id, player]))
  return getLineupAssignments(lineup)
    .map(({ slot, playerId }) => ({ slot, player: byId.get(playerId) }))
    .filter((entry): entry is { readonly slot: LineupSlot; readonly player: Player } => entry.player !== undefined)
}
const DEFAULT_ROTATION_PERIOD_COUNT = 4
const DEFAULT_PERIOD_MINUTES = 10
const DEFAULT_OVERTIME_MINUTES = 5

/**
 * Regulation-period column labels for the rotation matrix, sized to the real resolved
 * CompetitionRules of the upcoming game (Issue #9) - never a user-controlled FIBA/NBA/NCAA
 * selector. Falls back to a neutral 4-period grid when no game/competition can be resolved yet.
 * An overtime column is always appended since OT is possible regardless of period count.
 */
function periodLabels(periodCount: number): readonly string[] {
  return [...Array.from({ length: periodCount }, (_, index) => `P${index + 1}`), 'OT']
}

const PLAYERS_ON_COURT = 5

type RotationPresetId = 'balanced' | 'short' | 'deep' | 'starters' | 'bench'
const rotationPresetLabels: Record<RotationPresetId, string> = { balanced: 'Equilibrada', short: 'Rotación corta', deep: 'Rotación profunda', starters: 'Titulares', bench: 'Banquillo' }

/** Fraction of a regulation period's minutes given to each starter, per preset - the rest is split evenly across the bench. */
const STARTER_SHARE_BY_PRESET: Record<Exclude<RotationPresetId, 'starters' | 'bench'>, number> = { balanced: 0.8, short: 0.75, deep: 0.6 }

/**
 * Deterministic, data-driven rotation presets (Issue #9 blocker 2). Each preset is a pure
 * function of the actual active-12 squad and the real resolved period length/count - never a
 * fixed 8/8/8/8 constant divorced from competition rules. Whenever there is at least one starter
 * and one bench player, every regulation period sums to exactly periodMinutes*5; OT always starts
 * unallocated (0) since it is conditional on the game actually reaching overtime.
 */
function buildRotationPreset(
  presetId: RotationPresetId,
  squad: readonly { readonly slot: LineupSlot; readonly player: Player }[],
  periodCount: number,
  periodMinutes: number,
): Record<string, number[]> {
  const starters = squad.filter(({ slot }) => isLineupStarter(slot)).map(({ player }) => player)
  const bench = squad.filter(({ slot }) => !isLineupStarter(slot)).map(({ player }) => player)
  const rowFor = (minutesPerPeriod: number) => [...Array.from({ length: periodCount }, () => minutesPerPeriod), 0]

  if (presetId === 'starters') {
    // Starters play the full period, bench rests - an honest "starters play the whole game" preset.
    return Object.fromEntries(squad.map(({ slot, player }) => [player.id, rowFor(isLineupStarter(slot) ? periodMinutes : 0)]))
  }
  if (presetId === 'bench') {
    // Inverts starters: up to 5 bench players play full minutes, starters rest.
    const activeBenchIds = new Set(bench.slice(0, PLAYERS_ON_COURT).map((player) => player.id))
    return Object.fromEntries(squad.map(({ player }) => [player.id, rowFor(activeBenchIds.has(player.id) ? periodMinutes : 0)]))
  }
  // balanced/short/deep: starters get a preset-specific majority share, bench splits the rest evenly.
  const starterShare = STARTER_SHARE_BY_PRESET[presetId]
  const starterMinutes = Math.round(periodMinutes * starterShare)
  const totalBenchMinutes = Math.max(0, periodMinutes * PLAYERS_ON_COURT - starterMinutes * starters.length)
  const benchMinutes = bench.length === 0 ? 0 : Math.round(totalBenchMinutes / bench.length)
  return Object.fromEntries(squad.map(({ slot, player }) => [player.id, rowFor(isLineupStarter(slot) ? starterMinutes : benchMinutes)]))
}

/** Stable identity of the active-12 squad, for reconciling local editing state when the canonical lineup changes. */
function squadIdentity(squad: readonly { readonly player: Player }[]): string {
  return squad.map(({ player }) => player.id).join(',')
}

function Rotations({
  lineup,
  roster,
  clockRules,
  rotationIntent,
  onUpdateRotationMinutes,
}: {
  readonly lineup?: TeamLineup
  readonly roster: readonly Player[]
  readonly clockRules?: { readonly periodCount: number; readonly periodSeconds?: number; readonly overtimeSeconds?: number }
  readonly rotationIntent?: TeamRotationIntent
  readonly onUpdateRotationMinutes?: (minutesByPeriod: Readonly<Record<PlayerId, readonly number[]>>) => void
}) {
  const squad = activeSquad(lineup, roster)
  const periodCount = clockRules?.periodCount ?? DEFAULT_ROTATION_PERIOD_COUNT
  const periodMinutes = clockRules?.periodSeconds !== undefined ? clockRules.periodSeconds / 60 : DEFAULT_PERIOD_MINUTES
  const overtimeMinutes = clockRules?.overtimeSeconds !== undefined ? clockRules.overtimeSeconds / 60 : DEFAULT_OVERTIME_MINUTES
  const columns = periodLabels(periodCount)
  // Per-column minute cap, resolved from the actual competition: regulation periods cap at
  // periodMinutes, the OT column caps at overtimeMinutes (Issue #9 blocker 3) - never a flat
  // constant that's wrong for NCAA men's 20-minute halves or NBA/FIBA/WNBA period lengths.
  const maxForColumn = (columnIndex: number) => (columnIndex < periodCount ? periodMinutes : overtimeMinutes)
  // Single source of truth for column geometry: header and every row share this exact template, so
  // a rotation grid sized to a non-5-column competition (e.g. 2 halves + OT) never desyncs (Issue #9/#8).
  const rowGridStyle = { gridTemplateColumns: `210px repeat(${columns.length},minmax(105px,1fr)) 60px` }
  const identity = squadIdentity(squad)
  // Initial per-player default before any explicit preset/edit: starters get a fixed baseline
  // share of the period, bench starts at rest. This is a rendering starting point only - the
  // actual data-driven presets (below) are what Issue #9 requires for real allocation logic.
  const defaultRowFor = (slot: LineupSlot) => [...Array.from({ length: periodCount }, () => (isLineupStarter(slot) ? Math.round(periodMinutes * 0.8) : 0)), 0]
  const buildInitialMinutes = () => Object.fromEntries(squad.map(({ slot, player }) => [player.id, rotationIntent?.minutesByPeriod?.[player.id] !== undefined ? [...rotationIntent.minutesByPeriod[player.id]!] : defaultRowFor(slot)]))
  const [minutes, setMinutes] = useState<Record<string, number[]>>(buildInitialMinutes)
  const [reconciledIdentity, setReconciledIdentity] = useState(identity)
  // Reconcile editing state whenever the canonical active-12 changes (a player is added, removed,
  // or swapped via Plantilla/Pizarra) - add new players at zero minutes, drop removed players'
  // stale rows entirely, so a save can never re-persist minutes for someone no longer active
  // (Issue #9 blocker 5).
  if (identity !== reconciledIdentity) {
    setReconciledIdentity(identity)
    setMinutes((current) => Object.fromEntries(squad.map(({ player }) => [player.id, current[player.id] ?? Array.from({ length: columns.length }, () => 0)])))
  }
  const [saved, setSaved] = useState(false)
  const update = (id: string, period: number, value: number) => { setSaved(false); setMinutes((current) => ({ ...current, [id]: (current[id] ?? Array.from({ length: columns.length }, () => 0)).map((minute, index) => index === period ? Math.max(0, Math.min(maxForColumn(index), value)) : minute) })) }
  const applyPreset = (presetId: RotationPresetId) => { setSaved(false); setMinutes(buildRotationPreset(presetId, squad, periodCount, periodMinutes)) }
  const resetMinutes = () => { setSaved(false); setMinutes(Object.fromEntries(squad.map(({ player }) => [player.id, Array.from({ length: columns.length }, () => 0)]))) }
  const save = () => { onUpdateRotationMinutes?.(minutes as Record<PlayerId, readonly number[]>); setSaved(true) }
  const totalForPeriod = (period: number) => squad.reduce((sum, { player }) => sum + (minutes[player.id]?.[period] ?? 0), 0)
  const invalidPeriods = Array.from({ length: periodCount }, (_, period) => period).filter((period) => totalForPeriod(period) !== periodMinutes * PLAYERS_ON_COURT)
  return <main className="pcb-tactics__rotation"><header><div><h2>Matriz de Rotación</h2><small>Configuración temporal de sesión</small></div><label className="pcb-tactics__control">Preset<select aria-label="Preset de rotación" onChange={(event) => applyPreset(event.target.value as RotationPresetId)} value="">
    <option disabled value="">Elegir preset...</option>
    {(Object.keys(rotationPresetLabels) as RotationPresetId[]).map((id) => <option key={id} value={id}>{rotationPresetLabels[id]}</option>)}
  </select></label><button onClick={resetMinutes} type="button">Reset</button><button className="is-primary" onClick={save} type="button">Guardar</button>{saved && invalidPeriods.length === 0 && <em>Guardado</em>}</header>{invalidPeriods.length > 0 && <p className="pcb-tactics__rotation-warning" role="alert">Minutos totales inválidos en {invalidPeriods.map((period) => columns[period]).join(', ')}: cada periodo debe sumar {periodMinutes * PLAYERS_ON_COURT} minutos entre los 5 jugadores en pista.</p>}<div className="pcb-tactics__rotation-grid"><div className="is-head" style={rowGridStyle}><span>Jugador</span>{columns.map((column) => <span key={column}>{column}</span>)}<span>Total</span></div>{squad.length === 0 ? <p>No hay jugadores en la plantilla del usuario.</p> : squad.map(({ player }) => { const row = minutes[player.id] ?? Array.from({ length: columns.length }, () => 0); return <div key={player.id} style={rowGridStyle}><span><b>{player.basketball.primaryPosition}</b> {player.firstName} {player.lastName}</span>{row.map((value, period) => <span key={period}><input max={maxForColumn(period)} min="0" onChange={(event) => update(player.id, period, Number(event.target.value))} type="range" value={value} /><input max={maxForColumn(period)} min="0" onChange={(event) => update(player.id, period, Number(event.target.value))} type="number" value={value} /></span>)}<strong>{row.reduce((sum, value) => sum + value, 0)}</strong></div> })}</div></main>
}

/**
 * Jugadas catalog, reading/writing through the same canonical GameWorld-scoped play collection as
 * the Designer (Issue #9 blocker 8): a play saved here or in the Designer is immediately visible
 * in both places, persists with the actual save/career, and never leaks across careers.
 */
function Plays({
  savedPlays,
  onSavePlay,
  onDeletePlay,
}: {
  readonly savedPlays: readonly SavedPlay[]
  readonly onSavePlay?: (play: SavedPlay) => void
  readonly onDeletePlay?: (playId: string) => void
}) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const create = () => {
    if (!name.trim()) return
    const id = `library-${createEntityId()}`
    onSavePlay?.({ id, name, createdAt: new Date().toLocaleDateString(), frames: [INITIAL_FRAME()] })
    setSelected(id)
    setModal(false)
    setName('')
  }
  return <main className="pcb-tactics__plays"><header><div><h2>Catálogo de Jugadas</h2><small>{savedPlays.length} jugadas</small></div><button className="is-primary" onClick={() => setModal(true)} type="button">+ Nueva jugada</button></header><div className="pcb-tactics__play-list">{savedPlays.length === 0 && <p>Sin jugadas guardadas. Usa el Diseñador o crea una aquí.</p>}{savedPlays.map((play) => <article className={selected === play.id ? 'is-selected' : ''} key={play.id} onClick={() => setSelected(play.id)}><div><b>{play.name}</b><small>Set · Halfcourt · {play.createdAt}</small></div><button onClick={(event) => { event.stopPropagation(); onDeletePlay?.(play.id); if (selected === play.id) setSelected(null) }} type="button">Eliminar</button></article>)}</div>{modal && <Modal title="Nueva jugada" onClose={() => setModal(false)}><label>Nombre<input autoFocus onChange={(event) => setName(event.target.value)} value={name} /></label><footer><button onClick={() => setModal(false)} type="button">Cancelar</button><button className="is-primary" onClick={create} type="button">Crear</button></footer></Modal>}</main>
}
const DEFAULT_TACTICAL_PLAN: MatchTacticalPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }
const rotationOptions = ['Estándar', 'Corta', 'Profunda']
/**
 * Match Plan (Issue #9 blocker 7): the pace/coverage overrides here are real - they drive the
 * live coaching plan (`onChange`, consumed by `startLiveMatch`) - and "Guardar plan" now also
 * persists them as this specific upcoming game's real `TeamGamePlan.tacticalOverride`, the same
 * canonical record Matchups writes to. Notes and the rotation-preset label remain explicitly
 * session-only scratch inputs with no canonical backing; there is no fake "saved" confirmation for
 * them - only the tactical-override save gets a confirmation, and only while it is actually current.
 */
function MatchPlan({
  world,
  plan,
  onChange,
  onReset,
  gameKey,
  persistedTacticalOverride,
  onSaveTacticalOverride,
}: {
  readonly world?: GameWorld
  readonly plan?: MatchTacticalPlan
  readonly onChange?: (plan: MatchTacticalPlan) => void
  readonly onReset?: () => void
  readonly gameKey?: string
  readonly persistedTacticalOverride?: MatchTacticalPlan
  readonly onSaveTacticalOverride?: (tacticalOverride: MatchTacticalPlan) => void
}) {
  const [notes, setNotes] = useState('')
  const [rotation, setRotation] = useState('Estándar')
  const [scoutingOpen, setScoutingOpen] = useState(false)
  const [savedKey, setSavedKey] = useState<string | undefined>(undefined)
  const activePlan = plan ?? DEFAULT_TACTICAL_PLAN
  const nextGame = world === undefined ? undefined : getNextUserGame(world)
  const userTeam = world === undefined ? undefined : getUserTeam(world)
  const opponentTeam = world === undefined || nextGame === undefined || userTeam === undefined
    ? undefined
    : world.teams[nextGame.homeTeamId === userTeam.id ? nextGame.awayTeamId : nextGame.homeTeamId]
  const paceLabel = paceOptions.find((option) => option.value === activePlan.pace)?.label ?? 'Equilibrado'
  const coverageLabel = coverageOptions.find((option) => option.value === coveragePresetFor(activePlan.defense))?.label ?? 'Drop'
  // The save confirmation is honest only while the plan currently applied matches what was
  // actually persisted for this specific game; a game change or a further edit invalidates it.
  const isCurrentlySaved = savedKey === gameKey && persistedTacticalOverride !== undefined && JSON.stringify(persistedTacticalOverride) === JSON.stringify(activePlan)
  return <main className="pcb-tactics__match"><header><div><h2>Plan de Partido</h2><small>Preparación · sesión temporal</small></div><span>{opponentTeam === undefined ? 'Sin próximo rival programado' : opponentTeam.name}</span><button onClick={() => { setNotes(''); setRotation('Estándar'); setSavedKey(undefined); onReset?.() }} type="button">Reset</button><button className="is-primary" disabled={gameKey === undefined} onClick={() => { onSaveTacticalOverride?.(activePlan); setSavedKey(gameKey) }} type="button">Guardar plan</button></header>{isCurrentlySaved && <p className="pcb-tactics__notice">Overrides de ritmo/cobertura guardados para el próximo partido.</p>}<div className="pcb-tactics__match-grid"><section><h3>{opponentTeam === undefined ? 'Sin rival' : opponentTeam.name}</h3><dl><div><dt>Amenaza principal</dt><dd>Sin datos de scouting</dd></div><div><dt>Fortaleza</dt><dd>Sin datos de scouting</dd></div><div><dt>Debilidad</dt><dd>Sin datos de scouting</dd></div></dl><button onClick={() => setScoutingOpen(true)} type="button">Ver scouting</button></section><section><h3>Overrides</h3><Control label="Ritmo" onChange={(value) => { const option = paceOptions.find((item) => item.label === value); if (option !== undefined) onChange?.({ ...activePlan, pace: option.value }) }} options={paceOptions.map((option) => option.label)} value={paceLabel} /><Control label="Cobertura P&R" onChange={(value) => { const option = coverageOptions.find((item) => item.label === value); if (option !== undefined) onChange?.({ ...activePlan, defense: defensePresets[option.value] }) }} options={coverageOptions.map((option) => option.label)} value={coverageLabel} /><Control label="Rotación" onChange={setRotation} options={rotationOptions} value={rotation} /></section><section><h3>Notas del cuerpo técnico</h3><small>Notas temporales de esta sesión - no se guardan.</small><textarea onChange={(event) => setNotes(event.target.value)} value={notes} /><button onClick={() => navigator.clipboard?.writeText(notes)} type="button">Copiar plan</button></section></div>{scoutingOpen && <Modal onClose={() => setScoutingOpen(false)} title={`Scouting · ${opponentTeam === undefined ? 'Sin rival' : opponentTeam.name}`}><p>No hay informe de scouting disponible todavía.</p><footer><button onClick={() => setScoutingOpen(false)} type="button">Cerrar</button></footer></Modal>}</main>
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="pcb-tactics__modal" onMouseDown={onClose}><section onMouseDown={(event) => event.stopPropagation()}><header><h3>{title}</h3><button onClick={onClose} type="button">×</button></header>{children}</section></div> }
