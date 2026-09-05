import { useEffect, useMemo, useState } from 'react'
import type { GameWorld } from '@/domain/world'
import { getTeamLineup, getTeamRoster, resolveGameClockRules } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import type { Player } from '@/domain/player'
import { legacyRatingSignals } from '@/domain/player'
import type { PlayerId, TeamId } from '@/domain/ids'
import { createEntityId, organizationIdForTeam } from '@/domain/ids'
import { formatRatingEvaluation, getOrganizationRatingEvaluation, intelligenceSortValue } from '@/domain/intelligence/OrganizationPlayerEvaluation'
import { getLineupAssignments, getLineupSlotForPlayer, isValidRotationMinutes, LINEUP_SLOTS, PLAYERS_ON_COURT, type DefensiveMatchupAssignment, type LineupSlot, type Playbook, type SavedPlay, type TeamLineup, type TeamRotationIntent } from '@/domain/tactics'
import type { MatchTacticalPlan, TacticalLevel } from '@/engine/match'
import { INITIAL_FRAME } from './TacticsMigrationRepository'
import PcbTacticsCreator from './PcbTacticsCreator'
import PcbTacticsBoard from './PcbTacticsBoard'
import DraggableSubnav from '../club/components/DraggableSubnav'
import { PlayerNameLink } from '@/ui/navigation/PlayerNameLink'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { PrecisionDivHead } from '@/ui-ng/components/PrecisionDivHead'
import { usePrecisionDivGrid, type PrecisionDivColumn } from '@/ui-ng/components/usePrecisionDivGrid'
import './TacticsPcbPage.css'

export type TacticsPcbTab = 'board' | 'designer' | 'matchups' | 'rotations' | 'plays' | 'match'
export const TACTICS_PCB_TABS: readonly [TacticsPcbTab, string][] = [['board', 'Pizarra'], ['designer', 'Diseñador'], ['matchups', 'Emparejamientos'], ['rotations', 'Rotaciones'], ['plays', 'Jugadas'], ['match', 'Partido']]
type Tab = TacticsPcbTab
const tabs = TACTICS_PCB_TABS
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
  variant = 'legacy',
  activeTab,
  onTabChange,
  onOpenPlayer,
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
  readonly variant?: 'legacy' | 'ng'
  readonly activeTab?: Tab
  readonly onTabChange?: (tab: Tab) => void
  readonly onOpenPlayer?: (playerId: PlayerId) => void
}) {
  const [internalTab, setInternalTab] = useState<Tab>('board')
  const tab = activeTab ?? internalTab
  const setTab = (next: Tab) => {
    onTabChange?.(next)
    if (activeTab === undefined) setInternalTab(next)
  }
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
  return <section className={`pcb-tactics${variant === 'ng' ? ' pcb-tactics--ng' : ''}`} aria-label="Tácticas PCB migradas">{variant === 'legacy' ? <DraggableSubnav className="pcb-tactics__tabs" items={tabs.map(([id, label]) => ({ id, label, active: tab === id, onClick: () => setTab(id) }))} storageKey="pcbasket.subnav.tactics" /> : null}{tab === 'board' && <PcbTacticsBoard onLineupSlotChange={onLineupSlotChange} onLineupSlotClear={onLineupSlotClear} onOpenPlayer={onOpenPlayer} onRolesChange={(next: Record<string, unknown>) => { setTacticalRoles(next); window.localStorage.setItem('pcbasket.tactics.roles', JSON.stringify(next)) }} roster={boardRoster} tacticalRoles={tacticalRoles} teamId={team?.id} />}{tab === 'designer' && <PcbTacticsCreator onDeletePlay={onDeleteDesignerPlay} onDeletePlaybook={onDeleteDesignerPlaybook} onSavePlay={onSaveDesignerPlay} onSavePlaybook={onSaveDesignerPlaybook} playbooks={playbooks} savedPlays={savedPlays} />}{tab === 'matchups' && <Matchups gameKey={gamePlanKey} onOpenPlayer={onOpenPlayer} onUpdateMatchups={onUpdateMatchups} opponentRoster={opponentRoster} opponentTeam={opponentTeam} ourLineup={lineup} ourRoster={roster} persistedMatchups={persistedMatchups} teamId={team?.id} world={world} />}{tab === 'rotations' && <Rotations clockRules={clockRules} lineup={lineup} onOpenPlayer={onOpenPlayer} onUpdateRotationMinutes={onUpdateRotationMinutes} rotationIntent={rotationIntent} roster={roster} />}{tab === 'plays' && <Plays onDeletePlay={onDeleteDesignerPlay} onSavePlay={onSaveDesignerPlay} savedPlays={savedPlays} />}{tab === 'match' && <MatchPlan gameKey={gamePlanKey} onChange={onChange} onReset={onReset} onSaveTacticalOverride={onSaveGamePlanTacticalOverride} persistedTacticalOverride={persistedTacticalOverride} plan={plan} world={world} />}</section>
}

function Control({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) { return <label className="pcb-tactics__control">{label}<select onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option}>{option}</option>)}</select></label> }

/**
 * Real next-opponent defensive matchup assignment (Issue #9). No fake scouting players/opponent
 * identity: the opponent roster is the actual next scheduled opponent's real GameWorld roster,
 * always selectable regardless of scouting - scouting (not modeled yet) would only ever gate how
 * much *rating/threat detail* is knowable about them, never whether they can be assigned a defender.
 */
const MATCHUP_PRESSURE = ['Gap', 'Normal', 'Intensa', 'Negar'] as const
const MATCHUP_PNR = ['Drop', 'Over', 'Under', 'Switch', 'Blitz'] as const
const MATCHUP_FORCE = ['Centro', 'Fondo', 'Débil', 'No'] as const
const MATCHUP_INSTRUCTION_DEFAULT = { pressure: 'Normal', pnr: 'Drop', force: 'Centro' } as const
const MATCHUP_HEIGHT_MISMATCH_CM = 12
const POSITION_ORDER: Readonly<Record<string, number>> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 }

type MatchupInstruction = { readonly pressure: string; readonly pnr: string; readonly force: string }

function positionRank(position: string): number {
  return POSITION_ORDER[position] ?? 99
}

function playerFullName(player: Player): string {
  return `${player.firstName} ${player.lastName}`
}

/** Position-first unique pairing. Never reads hidden ratings. */
export function autoAssignDefensiveMatchups(
  opponents: readonly Player[],
  defenders: readonly Player[],
  starterIds: ReadonlySet<string>,
): Record<string, string> {
  const unused = [...defenders].sort((left, right) => {
    const byStarter = Number(starterIds.has(right.id)) - Number(starterIds.has(left.id))
    if (byStarter !== 0) return byStarter
    const byPosition = positionRank(left.basketball.primaryPosition) - positionRank(right.basketball.primaryPosition)
    return byPosition !== 0 ? byPosition : left.id.localeCompare(right.id)
  })
  const sortedOpponents = [...opponents].sort((left, right) => {
    const byPosition = positionRank(left.basketball.primaryPosition) - positionRank(right.basketball.primaryPosition)
    return byPosition !== 0 ? byPosition : left.id.localeCompare(right.id)
  })
  const next: Record<string, string> = {}
  for (const opponent of sortedOpponents) {
    const samePositionStarter = unused.findIndex((defender) => defender.basketball.primaryPosition === opponent.basketball.primaryPosition && starterIds.has(defender.id))
    const samePosition = unused.findIndex((defender) => defender.basketball.primaryPosition === opponent.basketball.primaryPosition)
    const anyStarter = unused.findIndex((defender) => starterIds.has(defender.id))
    const pick = samePositionStarter >= 0 ? samePositionStarter : samePosition >= 0 ? samePosition : anyStarter >= 0 ? anyStarter : unused.length === 0 ? -1 : 0
    if (pick < 0) continue
    const [defender] = unused.splice(pick, 1)
    if (defender !== undefined) next[opponent.id] = defender.id
  }
  return next
}

function Matchups({
  ourRoster,
  ourLineup,
  opponentTeam,
  opponentRoster,
  persistedMatchups,
  gameKey,
  world,
  teamId,
  onUpdateMatchups,
  onOpenPlayer,
}: {
  readonly ourRoster: readonly Player[]
  readonly ourLineup?: TeamLineup
  readonly opponentTeam?: { readonly id: string; readonly name: string }
  readonly opponentRoster: readonly Player[]
  readonly persistedMatchups: readonly DefensiveMatchupAssignment[]
  readonly gameKey?: string
  readonly world?: GameWorld
  readonly teamId?: TeamId
  readonly onUpdateMatchups?: (matchups: readonly DefensiveMatchupAssignment[]) => void
  readonly onOpenPlayer?: (playerId: PlayerId) => void
}) {
  const [query, setQuery] = useState('')
  const [instructions, setInstructions] = useState<Record<string, MatchupInstruction>>({})
  const ourStarters = activeSquad(ourLineup, ourRoster).filter(({ slot }) => isLineupStarter(slot)).map(({ player }) => player)
  const starterIds = new Set(ourStarters.map((player) => player.id))
  const [assignments, setAssignments] = useState<Record<string, string>>(() => Object.fromEntries(persistedMatchups.map((entry) => [entry.opponentPlayerId, entry.ourPlayerId])))
  const [reconciledKey, setReconciledKey] = useState(gameKey)
  // Reconcile local assignments whenever the upcoming game/opponent identity changes, so a
  // defender assigned for game A can never leak into game B's persisted matchups (Issue #9).
  if (gameKey !== reconciledKey) {
    setReconciledKey(gameKey)
    setAssignments(Object.fromEntries(persistedMatchups.map((entry) => [entry.opponentPlayerId, entry.ourPlayerId])))
    setInstructions({})
  }
  const flaggedIds = useMemo(() => {
    if (world === undefined || teamId === undefined) return new Set<string>()
    return new Set(
      Object.values(world.oppositionScoutingReportsById)
        .filter((report) => report.teamId === teamId && (opponentTeam === undefined || report.opponentTeamId === opponentTeam.id))
        .flatMap((report) => report.flaggedPlayerIds),
    )
  }, [opponentTeam, teamId, world])
  const threatByOpponent = useMemo(() => {
    if (world === undefined || teamId === undefined) return new Map<string, { readonly label: string; readonly sort: number | undefined }>()
    const organizationId = organizationIdForTeam(teamId)
    return new Map(opponentRoster.map((player) => {
      const evaluation = getOrganizationRatingEvaluation({
        organizationId,
        playerId: player.id,
        dimension: 'shooting',
        knowledge: world.organizationKnowledge,
        currentDate: world.currentDate,
        publicPosition: player.basketball.primaryPosition,
      })
      const known = formatRatingEvaluation(evaluation)
      const flagged = flaggedIds.has(player.id)
      return [player.id, {
        label: flagged ? (known === '?' ? 'Alta' : `Alta · ${known}`) : known,
        sort: flagged ? 101 : intelligenceSortValue(evaluation),
      }] as const
    }))
  }, [flaggedIds, opponentRoster, teamId, world])
  const filteredOpponents = [...opponentRoster.filter((player) => playerFullName(player).toLocaleLowerCase().includes(query.toLocaleLowerCase()))].sort((left, right) => {
    const compare = positionRank(left.basketball.primaryPosition) - positionRank(right.basketball.primaryPosition)
    return compare !== 0 ? compare : left.id.localeCompare(right.id)
  })
  const persist = (next: Record<string, string>) => {
    setAssignments(next)
    onUpdateMatchups?.(Object.entries(next).map(([opponentPlayerId, ourPlayerId]) => ({ ourPlayerId: ourPlayerId as PlayerId, opponentPlayerId: opponentPlayerId as PlayerId })))
  }
  const updateInstruction = (opponentId: string, field: keyof MatchupInstruction, value: string) => {
    setInstructions((current) => ({ ...current, [opponentId]: { ...(current[opponentId] ?? MATCHUP_INSTRUCTION_DEFAULT), [field]: value } }))
  }
  const resetAll = () => {
    persist({})
    setInstructions({})
  }
  return (
    <main className="pcb-tactics__table-page">
      <header>
        <div>
          <h2>Matchups Defensivos</h2>
          <small>{opponentTeam === undefined ? 'Sin próximo rival programado' : `Rival: ${opponentTeam.name}`}</small>
        </div>
        <input aria-label="Buscar rival" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar rival" value={query} />
        <button disabled={opponentRoster.length === 0 || ourRoster.length === 0} onClick={() => persist(autoAssignDefensiveMatchups(opponentRoster, ourRoster, starterIds))} type="button">Auto-matchup</button>
        <button disabled={Object.keys(assignments).length === 0} onClick={resetAll} type="button">Reset</button>
      </header>
      <NgPrecisionTable
        className="pcb-tactics__matchups-table"
        columns={[
          ngCol<Player>(
            'pos',
            'POS',
            (opponent) => <span className="pcb-tactics__position ng-play-position">{opponent.basketball.primaryPosition}</span>,
            { value: (opponent) => positionRank(opponent.basketball.primaryPosition) },
          ),
          ngCol<Player>(
            'name',
            'JUGADOR RIVAL',
            (opponent) => {
              const name = playerFullName(opponent)
              return onOpenPlayer === undefined ? name : (
                <button className="pcb-tactics__player-link" onClick={() => onOpenPlayer(opponent.id)} type="button">{name}</button>
              )
            },
            { value: (opponent) => playerFullName(opponent) },
          ),
          ngCol<Player>(
            'threat',
            'AMENAZA',
            (opponent) => threatByOpponent.get(opponent.id)?.label ?? '?',
            { value: (opponent) => threatByOpponent.get(opponent.id)?.sort ?? -1 },
          ),
          ngCol<Player>(
            'height',
            'ALTURA',
            (opponent) => `${opponent.bio.heightCm} cm`,
            { numeric: true, value: (opponent) => opponent.bio.heightCm },
          ),
          ngCol<Player>(
            'defender',
            'DEFENSOR',
            (opponent) => {
              const defender = ourRoster.find((player) => player.id === assignments[opponent.id])
              const heightDiff = defender === undefined ? 0 : defender.bio.heightCm - opponent.bio.heightCm
              const mismatch = defender !== undefined && Math.abs(heightDiff) > MATCHUP_HEIGHT_MISMATCH_CM
              const name = playerFullName(opponent)
              return (
                <>
                  <select
                    aria-label={`Defensor de ${name}`}
                    className={mismatch ? 'is-mismatch' : undefined}
                    onChange={(event) => persist(event.target.value === '' ? Object.fromEntries(Object.entries(assignments).filter(([id]) => id !== opponent.id)) : { ...assignments, [opponent.id]: event.target.value })}
                    value={assignments[opponent.id] ?? ''}
                  >
                    <option value="">Sin asignar</option>
                    {ourRoster.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.basketball.primaryPosition} · {playerFullName(candidate)}</option>
                    ))}
                  </select>
                  {mismatch ? <small className="pcb-tactics__mismatch">Altura {heightDiff > 0 ? '+' : ''}{heightDiff} cm</small> : null}
                </>
              )
            },
            { value: (opponent) => assignments[opponent.id] ?? '' },
          ),
          ngCol<Player>(
            'pressure',
            'PRESIÓN',
            (opponent) => {
              const name = playerFullName(opponent)
              const instruction = instructions[opponent.id] ?? MATCHUP_INSTRUCTION_DEFAULT
              return (
                <select aria-label={`Presión sobre ${name}`} onChange={(event) => updateInstruction(opponent.id, 'pressure', event.target.value)} value={instruction.pressure}>
                  {MATCHUP_PRESSURE.map((option) => <option key={option}>{option}</option>)}
                </select>
              )
            },
            { value: (opponent) => (instructions[opponent.id] ?? MATCHUP_INSTRUCTION_DEFAULT).pressure },
          ),
          ngCol<Player>(
            'pnr',
            'P&R',
            (opponent) => {
              const name = playerFullName(opponent)
              const instruction = instructions[opponent.id] ?? MATCHUP_INSTRUCTION_DEFAULT
              return (
                <select aria-label={`P&R sobre ${name}`} onChange={(event) => updateInstruction(opponent.id, 'pnr', event.target.value)} value={instruction.pnr}>
                  {MATCHUP_PNR.map((option) => <option key={option}>{option}</option>)}
                </select>
              )
            },
            { value: (opponent) => (instructions[opponent.id] ?? MATCHUP_INSTRUCTION_DEFAULT).pnr },
          ),
          ngCol<Player>(
            'force',
            'DIRECCIÓN',
            (opponent) => {
              const name = playerFullName(opponent)
              const instruction = instructions[opponent.id] ?? MATCHUP_INSTRUCTION_DEFAULT
              return (
                <select aria-label={`Dirección sobre ${name}`} onChange={(event) => updateInstruction(opponent.id, 'force', event.target.value)} value={instruction.force}>
                  {MATCHUP_FORCE.map((option) => <option key={option}>{option}</option>)}
                </select>
              )
            },
            { value: (opponent) => (instructions[opponent.id] ?? MATCHUP_INSTRUCTION_DEFAULT).force },
          ),
        ]}
        emptyDescription={opponentTeam === undefined ? 'Sin próximo rival programado.' : 'Sin jugadores rivales disponibles.'}
        emptyTitle={opponentTeam === undefined ? 'Sin próximo rival programado.' : 'Sin jugadores rivales disponibles.'}
        entityForRow={(opponent) => ({ type: 'player', id: opponent.id })}
        entitySurface="matchups"
        gridId="pcb-tactics-matchups"
        rows={filteredOpponents}
      />
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

type RotationPresetId = 'balanced' | 'short' | 'deep' | 'starters' | 'bench'
const rotationPresetLabels: Record<RotationPresetId, string> = { balanced: 'Equilibrada', short: 'Rotación corta', deep: 'Rotación profunda', starters: 'Titulares', bench: 'Banquillo' }

/** Fraction of a regulation period's total player-minutes (periodMinutes*5) given to the starter group as a whole, per preset - the rest goes to the bench group. */
const STARTER_GROUP_SHARE_BY_PRESET: Record<Exclude<RotationPresetId, 'starters' | 'bench'>, number> = { balanced: 0.8, short: 0.9, deep: 0.6 }

/**
 * Deterministic largest-remainder distribution: splits `totalMinutes` (a non-negative integer)
 * across `recipientCount` players as evenly as possible, so the returned values sum to EXACTLY
 * `totalMinutes` — never off by a rounding error. Each recipient first gets floor(share), then the
 * leftover whole minutes go one-by-one, in recipient order, to the first `remainder` recipients —
 * the standard "largest remainder method" apportionment, applied here to rotation minutes
 * (Issue #9 blocker 1: 3/5 presets previously rounded per-player and drifted off the true total).
 */
function distributeMinutesExactly(totalMinutes: number, recipientCount: number): readonly number[] {
  if (recipientCount === 0) return []
  const base = Math.floor(totalMinutes / recipientCount)
  const remainder = totalMinutes - base * recipientCount
  return Array.from({ length: recipientCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

/**
 * Deterministic, data-driven rotation presets (Issue #9 blocker 1). Each preset is a pure
 * function of the actual active-12 squad and the real resolved period length/count - never a
 * fixed 8/8/8/8 constant divorced from competition rules. Every preset's regulation-period columns
 * sum to EXACTLY periodMinutes*5 among the active squad (via distributeMinutesExactly), whenever
 * there is at least one active player; OT always starts unallocated (0) since it is conditional on
 * the game actually reaching overtime.
 */
function buildRotationPreset(
  presetId: RotationPresetId,
  squad: readonly { readonly slot: LineupSlot; readonly player: Player }[],
  periodCount: number,
  periodMinutes: number,
): Record<string, number[]> {
  const starters = squad.filter(({ slot }) => isLineupStarter(slot)).map(({ player }) => player)
  const bench = squad.filter(({ slot }) => !isLineupStarter(slot)).map(({ player }) => player)
  const totalPlayerMinutes = periodMinutes * PLAYERS_ON_COURT
  const rowFor = (minutesPerPeriod: number) => [...Array.from({ length: periodCount }, () => minutesPerPeriod), 0]
  const assign = (group: readonly Player[], minutesPerPlayer: readonly number[]): Record<string, number[]> => Object.fromEntries(group.map((player, index) => [player.id, rowFor(minutesPerPlayer[index] ?? 0)]))

  if (presetId === 'starters') {
    // All available player-minutes go to the (up to 5) starters, evenly; bench rests.
    const active = starters.slice(0, PLAYERS_ON_COURT)
    return { ...assign(bench, bench.map(() => 0)), ...assign(active, distributeMinutesExactly(totalPlayerMinutes, active.length)) }
  }
  if (presetId === 'bench') {
    // Inverts starters: all player-minutes go to (up to 5) bench players, evenly; starters rest.
    const active = bench.slice(0, PLAYERS_ON_COURT)
    return { ...assign(starters, starters.map(() => 0)), ...assign(active, distributeMinutesExactly(totalPlayerMinutes, active.length)) }
  }
  // balanced/short/deep: the starter group gets a preset-specific exact share of total player-minutes, bench gets the exact remainder.
  const starterGroupShare = STARTER_GROUP_SHARE_BY_PRESET[presetId]
  const starterGroupMinutes = starters.length === 0 ? 0 : Math.round(totalPlayerMinutes * starterGroupShare)
  const benchGroupMinutes = totalPlayerMinutes - starterGroupMinutes
  return { ...assign(starters, distributeMinutesExactly(starterGroupMinutes, starters.length)), ...assign(bench, distributeMinutesExactly(benchGroupMinutes, bench.length)) }
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
  onOpenPlayer,
}: {
  readonly lineup?: TeamLineup
  readonly roster: readonly Player[]
  readonly clockRules?: { readonly periodCount: number; readonly periodSeconds?: number; readonly overtimeSeconds?: number }
  readonly rotationIntent?: TeamRotationIntent
  readonly onUpdateRotationMinutes?: (minutesByPeriod: Readonly<Record<PlayerId, readonly number[]>>) => void
  readonly onOpenPlayer?: (playerId: PlayerId) => void
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
  const rotationColumnDefs = useMemo<readonly PrecisionDivColumn[]>(() => [
    { id: 'player', label: 'Jugador', width: 210, locked: true },
    ...periodLabels(periodCount).map((label) => ({ id: label, label, width: 105, flex: 1, minWidth: 105 })),
    { id: 'total', label: 'Total', width: 60, locked: true },
  ], [periodCount])
  const grid = usePrecisionDivGrid('ng-tactics-rotation', rotationColumnDefs)
  const identity = squadIdentity(squad)
  // Initial per-player default before any explicit preset/edit: the "balanced" preset's exact
  // distribution (Issue #9 blocker 1/2) - this is a rendering starting point that must ALSO be a
  // genuinely valid allocation, never a fixed round number that happens to be off-total.
  const defaultMinutesForSquad = buildRotationPreset('balanced', squad, periodCount, periodMinutes)
  const buildInitialMinutes = () => Object.fromEntries(squad.map(({ player }) => [player.id, rotationIntent?.minutesByPeriod?.[player.id] !== undefined ? [...rotationIntent.minutesByPeriod[player.id]!] : defaultMinutesForSquad[player.id] ?? Array.from({ length: columns.length }, () => 0)]))
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
  // OT is intentionally excluded from the regulation-minutes validity check: it is conditional on
  // the game actually reaching overtime, so a zero/partial OT allocation must never block saving
  // an otherwise-valid regulation-time rotation (mirrors RotationEngine.rotationRegulationPeriodMinutes).
  const regulationPeriodMinutes = Array.from({ length: periodCount }, () => periodMinutes)
  const activePlayerIds = squad.map(({ player }) => player.id)
  const isValid = isValidRotationMinutes(minutes as Record<PlayerId, readonly number[]>, activePlayerIds, regulationPeriodMinutes)
  // Canonical validation (Issue #9 blocker 2): the exact same isValidRotationMinutes rule governs
  // both this UI warning AND the write boundary (RotationEngine.updateRotationMinutesForTeam) -
  // an invalid allocation is refused here before ever reaching onUpdateRotationMinutes, and would
  // be rejected again at the store/domain boundary even if this guard were bypassed.
  const save = () => { if (!isValid) return; onUpdateRotationMinutes?.(minutes as Record<PlayerId, readonly number[]>); setSaved(true) }
  const totalForPeriod = (period: number) => squad.reduce((sum, { player }) => sum + (minutes[player.id]?.[period] ?? 0), 0)
  const invalidPeriods = Array.from({ length: periodCount }, (_, period) => period).filter((period) => totalForPeriod(period) !== periodMinutes * PLAYERS_ON_COURT)
  return <main className="pcb-tactics__rotation"><header><div><h2>Matriz de Rotación</h2><small>Configuración temporal de sesión</small></div><label className="pcb-tactics__control">Preset<select aria-label="Preset de rotación" onChange={(event) => applyPreset(event.target.value as RotationPresetId)} value="">
    <option disabled value="">Elegir preset...</option>
    {(Object.keys(rotationPresetLabels) as RotationPresetId[]).map((id) => <option key={id} value={id}>{rotationPresetLabels[id]}</option>)}
  </select></label><button onClick={resetMinutes} type="button">Reset</button><button className="is-primary" disabled={!isValid} onClick={save} type="button">Guardar</button>{saved && isValid && <em>Guardado</em>}</header>{invalidPeriods.length > 0 && <p className="pcb-tactics__rotation-warning" role="alert">Minutos totales inválidos en {invalidPeriods.map((period) => columns[period]).join(', ')}: cada periodo debe sumar {periodMinutes * PLAYERS_ON_COURT} minutos entre los 5 jugadores en pista.</p>}<div className="pcb-tactics__rotation-grid ng-precision-grid"><div className="is-head" style={grid.style}>{grid.ordered.map((column) => (
    <PrecisionDivHead
      key={column.id}
      headerProps={grid.headerProps(column.id)}
      label={column.label}
      onResize={grid.startResize(column.id)}
    />
  ))}</div>{squad.length === 0 ? <p>No hay jugadores en la plantilla del usuario.</p> : squad.map(({ player }) => { const row = minutes[player.id] ?? Array.from({ length: columns.length }, () => 0); return <div key={player.id} style={grid.style}>{grid.ordered.map((column) => {
    if (column.id === 'player') {
      return <span key={column.id}><span className="ng-play-position">{player.basketball.primaryPosition}</span> <PlayerNameLink onOpenPlayer={onOpenPlayer} playerId={player.id}>{player.firstName} {player.lastName}</PlayerNameLink></span>
    }
    if (column.id === 'total') {
      return <strong key={column.id}>{row.reduce((sum, value) => sum + value, 0)}</strong>
    }
    const period = columns.indexOf(column.id)
    const value = row[period] ?? 0
    return <span key={column.id}><input max={maxForColumn(period)} min="0" onChange={(event) => update(player.id, period, Number(event.target.value))} type="range" value={value} /><input max={maxForColumn(period)} min="0" onChange={(event) => update(player.id, period, Number(event.target.value))} type="number" value={value} /></span>
  })}</div> })}</div></main>
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
  // Precedence (Issue #9 blocker 4): current unsaved editing state (`plan`, once the user has
  // touched a control this mount) → persisted game-specific TeamGamePlan.tacticalOverride →
  // team/base/default plan. `rehydratedKey` tracks which game's persisted override has already
  // been applied as the starting point, so re-rendering with the same game never clobbers a
  // subsequent in-session edit, but reopening Tactics for a game (or switching to a different
  // upcoming game) does rehydrate from what was actually saved.
  const [rehydratedKey, setRehydratedKey] = useState<string | undefined>(undefined)
  if (gameKey !== rehydratedKey) {
    setRehydratedKey(gameKey)
    if (persistedTacticalOverride !== undefined) onChange?.(persistedTacticalOverride)
  }
  const activePlan = plan ?? persistedTacticalOverride ?? DEFAULT_TACTICAL_PLAN
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
