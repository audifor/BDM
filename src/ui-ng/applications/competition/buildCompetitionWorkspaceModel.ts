import { addDays, parseGameDate, type GameDate } from '@/domain/date'
import type { Game, GameStakes } from '@/domain/game'
import type { CompetitionId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import { trainingDefinitionById } from '@/domain/training'
import type { GameWorld } from '@/domain/world'
import { calculateStandings, type StandingsEntry } from '@/engine/competition/standings'
import { boxScoreValuation } from '@/engine/stats/boxScoreValuation'
import { selectCompetitionContext } from '@/ui/pcb-migrated/competition/CompetitionPcbPage'
import { findTeamForPlayer } from '@/ui-ng/applications/player/data/presentationHelpers'

export const COMPETITION_TABS = ['calendar', 'upcoming', 'results', 'standings', 'stats'] as const
export type CompetitionTabId = (typeof COMPETITION_TABS)[number]

export const COMPETITION_TAB_LABELS: Readonly<Record<CompetitionTabId, string>> = {
  calendar: 'Calendario',
  upcoming: 'Próximos',
  results: 'Resultados',
  standings: 'Clasificación',
  stats: 'Estadísticas',
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const

export function isoWeekday(date: GameDate): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

export function monthStart(date: GameDate): GameDate {
  return parseGameDate(`${date.slice(0, 7)}-01`)
}

export function shiftMonth(date: GameDate, delta: number): GameDate {
  const [year, month] = date.split('-').map(Number)
  const total = year! * 12 + (month! - 1) + delta
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  return parseGameDate(`${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`)
}

export function monthTitle(date: GameDate): string {
  const month = Number(date.slice(5, 7))
  return `${MONTH_NAMES[month - 1]} ${date.slice(0, 4)}`
}

export function monthGrid(month: GameDate): readonly GameDate[] {
  const start = monthStart(month)
  const gridStart = addDays(start, -(isoWeekday(start) - 1))
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

export interface CompetitionGameRow {
  readonly id: Game['id']
  readonly date: GameDate
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly homeName: string
  readonly awayName: string
  readonly status: Game['status']
  readonly scoreLabel: string
  readonly involvesUserTeam: boolean
  readonly competitionName: string
  readonly stakes: GameStakes
}

export const CALENDAR_DAY_EVENT_CAP = 5

export type CalendarEventTone = 'user-game' | 'league-game' | 'important-game' | 'milestone' | 'training'

export interface CalendarGameEvent {
  readonly kind: 'game'
  readonly id: string
  readonly date: GameDate
  readonly tone: 'user-game' | 'league-game' | 'important-game'
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly homeName: string
  readonly awayName: string
  readonly scoreLabel: string
  readonly competitionName: string
  readonly involvesUserTeam: boolean
  readonly stakes: GameStakes
  readonly isSelectedCompetition: boolean
}

export interface CalendarNoteEvent {
  readonly kind: 'milestone' | 'training'
  readonly id: string
  readonly date: GameDate
  readonly tone: 'milestone' | 'training'
  readonly label: string
  readonly detail?: string
}

export type CalendarEvent = CalendarGameEvent | CalendarNoteEvent

export interface CompetitionDateGroup {
  readonly date: GameDate
  readonly label: string
  readonly games: readonly CompetitionGameRow[]
}

export interface CompetitionLeaderRow {
  readonly playerId: PlayerId
  readonly playerName: string
  readonly teamName: string
  readonly games: number
  readonly ppg: number
  readonly rpg: number
  readonly apg: number
  readonly vpg: number
}

export const STAT_PODIUM_IDS = ['points', 'rebounds', 'assists', 'valuation'] as const
export type StatPodiumId = (typeof STAT_PODIUM_IDS)[number]

export interface CompetitionStatPodiumEntry {
  readonly playerId: PlayerId
  readonly playerName: string
  readonly teamName: string
  readonly value: number
}

export interface CompetitionStatPodium {
  readonly id: StatPodiumId
  readonly label: string
  readonly entries: readonly CompetitionStatPodiumEntry[]
}

export interface CompetitionWorkspaceModel {
  readonly competitionId: CompetitionId
  readonly seasonId: SeasonId
  readonly competitionName: string
  readonly seasonLabel: string
  readonly competitions: readonly { readonly id: CompetitionId; readonly name: string }[]
  readonly games: readonly CompetitionGameRow[]
  readonly upcoming: readonly CompetitionGameRow[]
  readonly dateGroups: readonly CompetitionDateGroup[]
  readonly standings: readonly StandingsEntry[]
  readonly leaders: readonly CompetitionLeaderRow[]
  readonly statPodiums: readonly CompetitionStatPodium[]
  readonly calendarEvents: readonly CalendarEvent[]
}

function teamName(world: GameWorld, teamId: TeamId): string {
  return world.teams[teamId]?.name ?? teamId
}

function toRow(world: GameWorld, game: Game, userTeamId: TeamId | undefined): CompetitionGameRow {
  return {
    id: game.id,
    date: game.date,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeName: teamName(world, game.homeTeamId),
    awayName: teamName(world, game.awayTeamId),
    status: game.status,
    scoreLabel:
      game.status === 'completed' && game.result !== undefined
        ? `${game.result.homeScore} – ${game.result.awayScore}`
        : 'Pendiente',
    involvesUserTeam: userTeamId !== undefined && (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId),
    competitionName: world.competitions[game.competitionId]?.name ?? game.competitionId,
    stakes: game.stakes,
  }
}

function playerShortName(world: GameWorld, playerId: PlayerId): string {
  const player = world.players[playerId]
  return player === undefined ? playerId : player.lastName
}

function mediaTypeLabel(type: string): string {
  if (type === 'preMatch') return 'Prensa · previa'
  if (type === 'postMatch') return 'Prensa · postpartido'
  if (type === 'career') return 'Prensa · carrera'
  if (type === 'competition') return 'Prensa · competición'
  return 'Prensa'
}

function gameTone(game: Game, userTeamId: TeamId | undefined): CalendarGameEvent['tone'] {
  const involves = userTeamId !== undefined && (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId)
  if (involves) return 'user-game'
  if (game.stakes !== 'regular') return 'important-game'
  return 'league-game'
}

function toCalendarGame(world: GameWorld, game: Game, userTeamId: TeamId | undefined, selectedCompetitionId: CompetitionId): CalendarGameEvent {
  const row = toRow(world, game, userTeamId)
  return {
    kind: 'game',
    id: game.id,
    date: game.date,
    tone: gameTone(game, userTeamId),
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeName: row.homeName,
    awayName: row.awayName,
    scoreLabel: row.scoreLabel,
    competitionName: row.competitionName,
    involvesUserTeam: row.involvesUserTeam,
    stakes: row.stakes,
    isSelectedCompetition: game.competitionId === selectedCompetitionId,
  }
}

function buildCalendarEvents(
  world: GameWorld,
  context: { readonly competitionId: CompetitionId; readonly seasonId: SeasonId },
  userTeamId: TeamId | undefined,
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const seenGames = new Set<string>()

  const addGame = (game: Game) => {
    if (seenGames.has(game.id)) return
    seenGames.add(game.id)
    events.push(toCalendarGame(world, game, userTeamId, context.competitionId))
  }

  for (const game of Object.values(world.games)) {
    if (game.competitionId === context.competitionId && game.seasonId === context.seasonId) addGame(game)
  }

  for (const game of Object.values(world.games)) {
    if (userTeamId !== undefined && (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId)) addGame(game)
    if (game.stakes !== 'regular') addGame(game)
  }

  for (const season of Object.values(world.seasons)) {
    const name = world.competitions[season.competitionId]?.name ?? season.competitionId
    events.push({
      kind: 'milestone',
      id: `season-start:${season.id}`,
      date: season.startDate,
      tone: 'milestone',
      label: `Inicio · ${name}`,
      detail: season.label,
    })
    events.push({
      kind: 'milestone',
      id: `season-end:${season.id}`,
      date: season.endDate,
      tone: 'milestone',
      label: `Cierre · ${name}`,
      detail: season.label,
    })
  }

  for (const draft of Object.values(world.draftsById)) {
    events.push({
      kind: 'milestone',
      id: `draft:${draft.id}`,
      date: draft.scheduledOn,
      tone: 'milestone',
      label: draft.status === 'completed' ? 'Draft (cerrado)' : 'Draft',
      detail: world.ecosystems[draft.ecosystemId]?.name,
    })
  }

  for (const cycle of Object.values(world.recruitingCyclesById)) {
    const name = world.ecosystems[cycle.ecosystemId]?.name ?? 'Recruiting'
    events.push({
      kind: 'milestone',
      id: `recruit-open:${cycle.id}`,
      date: cycle.opensOn,
      tone: 'milestone',
      label: `Apertura recruiting · ${name}`,
    })
    events.push({
      kind: 'milestone',
      id: `recruit-sign:${cycle.id}`,
      date: cycle.signingOn,
      tone: 'milestone',
      label: `Firmas · ${name}`,
    })
    events.push({
      kind: 'milestone',
      id: `recruit-close:${cycle.id}`,
      date: cycle.closesOn,
      tone: 'milestone',
      label: `Cierre recruiting · ${name}`,
    })
  }

  for (const opportunity of Object.values(world.mediaOpportunitiesById)) {
    if (opportunity.coachId !== world.userCoachId || opportunity.status !== 'pending') continue
    events.push({
      kind: 'milestone',
      id: `media:${opportunity.id}`,
      date: opportunity.gameDate,
      tone: 'milestone',
      label: mediaTypeLabel(opportunity.type),
    })
  }

  if (userTeamId !== undefined) {
    for (const session of Object.values(world.scheduledTrainingSessionsById)) {
      if (session.teamId !== userTeamId || session.status !== 'scheduled') continue
      events.push({
        kind: 'training',
        id: session.id,
        date: session.date,
        tone: 'training',
        label: `${session.startTime} · ${trainingDefinitionById(session.definitionId).name}`,
        detail: session.scope === 'individual' && session.playerId !== undefined ? playerShortName(world, session.playerId) : 'Equipo',
      })
    }
  }

  return events
}

const CALENDAR_TONE_RANK: Readonly<Record<CalendarEventTone, number>> = {
  'user-game': 0,
  training: 1,
  milestone: 2,
  'important-game': 3,
  'league-game': 4,
}

export function sortCalendarEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(
    (left, right) =>
      CALENDAR_TONE_RANK[left.tone] - CALENDAR_TONE_RANK[right.tone] || left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
  )
}

function formatPct(wins: number, played: number): string {
  if (played === 0) return '.000'
  return (wins / played).toFixed(3).replace('0.', '.')
}

export function standingsPct(entry: StandingsEntry): string {
  return formatPct(entry.wins, entry.played)
}

export function buildCompetitionWorkspaceModel(
  world: GameWorld,
  preferredCompetitionId: CompetitionId | undefined,
  userTeamId: TeamId | undefined,
): CompetitionWorkspaceModel | null {
  const context = selectCompetitionContext(world, preferredCompetitionId)
  if (context === undefined) return null

  const games = Object.values(world.games)
    .filter((game) => game.competitionId === context.competitionId && game.seasonId === context.seasonId)
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
    .map((game) => toRow(world, game, userTeamId))

  const grouped = new Map<GameDate, CompetitionGameRow[]>()
  for (const game of games) {
    grouped.set(game.date, [...(grouped.get(game.date) ?? []), game])
  }

  const totals = new Map<PlayerId, { points: number; rebounds: number; assists: number; valuation: number; games: number }>()
  for (const log of Object.values(world.matchStatLogsByGameId)) {
    if (log.seasonId !== context.seasonId || log.competitionId !== context.competitionId) continue
    for (const line of log.playerLines) {
      if (line.stats.secondsPlayed <= 0) continue
      const current = totals.get(line.playerId) ?? { points: 0, rebounds: 0, assists: 0, valuation: 0, games: 0 }
      totals.set(line.playerId, {
        points: current.points + line.stats.points,
        rebounds: current.rebounds + line.stats.rebounds,
        assists: current.assists + line.stats.assists,
        valuation: current.valuation + boxScoreValuation(line.stats),
        games: current.games + 1,
      })
    }
  }

  const leaders = [...totals.entries()]
    .map(([playerId, totalsRow]) => {
      const player = world.players[playerId]
      const team = findTeamForPlayer(world, playerId)
      return {
        playerId,
        playerName: player === undefined ? playerId : `${player.firstName} ${player.lastName}`,
        teamName: team === undefined ? '—' : team.name,
        games: totalsRow.games,
        ppg: totalsRow.points / totalsRow.games,
        rpg: totalsRow.rebounds / totalsRow.games,
        apg: totalsRow.assists / totalsRow.games,
        vpg: totalsRow.valuation / totalsRow.games,
      }
    })
    .sort((left, right) => right.ppg - left.ppg || left.playerId.localeCompare(right.playerId))

  return {
    competitionId: context.competitionId,
    seasonId: context.seasonId,
    competitionName: world.competitions[context.competitionId]!.name,
    seasonLabel: world.seasons[context.seasonId]!.label,
    competitions: Object.values(world.competitions)
      .filter((competition) => Object.values(world.seasons).some((season) => season.competitionId === competition.id))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map((competition) => ({ id: competition.id, name: competition.name })),
    games,
    upcoming: games.filter((game) => game.status !== 'completed'),
    dateGroups: [...grouped.entries()]
      .filter(([, groupedGames]) => groupedGames.some((game) => game.status === 'completed'))
      .map(([date, groupedGames], index) => ({
        date,
        label: `Jornada ${index + 1} · ${date}`,
        games: groupedGames.filter((game) => game.status === 'completed'),
      })),
    standings: calculateStandings(world, context.seasonId),
    leaders,
    statPodiums: buildStatPodiums(leaders),
    calendarEvents: sortCalendarEvents(buildCalendarEvents(world, context, userTeamId)),
  }
}

export { boxScoreValuation } from '@/engine/stats/boxScoreValuation'

function podiumEntries(leaders: readonly CompetitionLeaderRow[], key: keyof Pick<CompetitionLeaderRow, 'ppg' | 'rpg' | 'apg' | 'vpg'>): CompetitionStatPodiumEntry[] {
  return [...leaders]
    .sort((left, right) => right[key] - left[key] || left.playerId.localeCompare(right.playerId))
    .slice(0, 3)
    .map((row) => ({
      playerId: row.playerId,
      playerName: row.playerName,
      teamName: row.teamName,
      value: row[key],
    }))
}

function buildStatPodiums(leaders: readonly CompetitionLeaderRow[]): CompetitionStatPodium[] {
  return [
    { id: 'points', label: 'Puntos', entries: podiumEntries(leaders, 'ppg') },
    { id: 'rebounds', label: 'Rebotes', entries: podiumEntries(leaders, 'rpg') },
    { id: 'assists', label: 'Asistencias', entries: podiumEntries(leaders, 'apg') },
    { id: 'valuation', label: 'Valoración', entries: podiumEntries(leaders, 'vpg') },
  ]
}

export function gamesForMonth(
  games: readonly CompetitionGameRow[],
  month: GameDate,
  onlyUserTeam: boolean,
): Readonly<Record<GameDate, readonly CompetitionGameRow[]>> {
  const prefix = month.slice(0, 7)
  const byDate: Record<string, CompetitionGameRow[]> = {}
  for (const game of games) {
    if (!game.date.startsWith(prefix)) continue
    if (onlyUserTeam && !game.involvesUserTeam) continue
    byDate[game.date] = [...(byDate[game.date] ?? []), game]
  }
  return byDate
}

export function calendarEventsForMonth(
  events: readonly CalendarEvent[],
  month: GameDate,
  onlyUserTeam: boolean,
): Readonly<Record<GameDate, readonly CalendarEvent[]>> {
  const prefix = month.slice(0, 7)
  const byDate: Record<string, CalendarEvent[]> = {}
  for (const event of events) {
    if (!event.date.startsWith(prefix)) continue
    if (onlyUserTeam && event.kind === 'game' && event.tone === 'league-game') continue
    byDate[event.date] = [...(byDate[event.date] ?? []), event]
  }
  for (const date of Object.keys(byDate)) {
    byDate[date] = sortCalendarEvents(byDate[date]!)
  }
  return byDate
}
