import { useMemo, useState } from 'react'
import type { Game } from '@/domain/game'
import type { CompetitionId, SeasonId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { calculateStandings } from '@/engine/competition/standings'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'
import './CompetitionPcbPage.css'

export interface CompetitionContext { readonly competitionId: CompetitionId; readonly seasonId: SeasonId }

/** A stable UI selection over canonical competition editions; it owns no competition state. */
export function selectCompetitionContext(world: GameWorld, preferredCompetitionId?: CompetitionId): CompetitionContext | undefined {
  const seasonsByCompetition = new Map<CompetitionId, SeasonId[]>()
  for (const season of Object.values(world.seasons)) seasonsByCompetition.set(season.competitionId, [...(seasonsByCompetition.get(season.competitionId) ?? []), season.id])
  const competitionIds = [...seasonsByCompetition.keys()].sort()
  const userTeamId = getUserTeam(world)?.id
  const currentCompetitionId = world.seasons[world.currentSeasonId]?.competitionId
  const competitionId = preferredCompetitionId !== undefined && seasonsByCompetition.has(preferredCompetitionId) ? preferredCompetitionId : competitionIds.find((id) => id === currentCompetitionId && userTeamId !== undefined && world.competitions[id]!.participantTeamIds.includes(userTeamId)) ?? competitionIds.find((id) => userTeamId !== undefined && world.competitions[id]!.participantTeamIds.includes(userTeamId)) ?? competitionIds[0]
  if (competitionId === undefined) return undefined
  const seasonId = seasonsByCompetition.get(competitionId)!.sort((left, right) => left === world.currentSeasonId ? -1 : right === world.currentSeasonId ? 1 : world.seasons[right]!.startDate.localeCompare(world.seasons[left]!.startDate) || left.localeCompare(right))[0]
  return seasonId === undefined ? undefined : { competitionId, seasonId }
}

export function CompetitionPcbPage({ world, onOpenEntity }: { readonly world: GameWorld; readonly onOpenEntity?: (destination: EntityDestination) => void }) {
  const [view, setView] = useState<'calendar' | 'results' | 'standings'>('calendar')
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<CompetitionId | undefined>()
  const context = selectCompetitionContext(world, selectedCompetitionId)
  const projection = useMemo(() => context === undefined ? undefined : buildCompetitionProjection(world, context), [world, context?.competitionId, context?.seasonId])
  if (projection === undefined) return <section className="pcb-competition"><div className="card">No hay competiciones con una temporada canónica.</div></section>
  const openTeam = (teamId: TeamId) => onOpenEntity?.({ type: 'team', teamId, section: 'overview' })
  return <section className="pcb-competition">
    <header className="competition-context"><div><p className="eyebrow">COMPETICIÓN</p><h2>{projection.competitionName}</h2><span className="tag muted">{projection.seasonLabel}</span></div><label>Competición<select aria-label="Competición" value={projection.competitionId} onChange={(event) => setSelectedCompetitionId(event.target.value as CompetitionId)}>{projection.competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name}</option>)}</select></label></header>
    <nav className="subnav" aria-label="Secciones de competición">{([['calendar', 'Calendario'], ['results', 'Resultados'], ['standings', 'Clasificación']] as const).map(([id, label]) => <button className={`subnav-item${view === id ? ' active' : ''}`} key={id} onClick={() => setView(id)} type="button">{label}</button>)}</nav>
    {view === 'calendar' && <section className="bento competition-page"><div className="card competition-calendar"><div className="card-header"><h2>Calendario</h2><span className="tag muted">{projection.games.length} partidos</span></div><GameList games={projection.games} teams={world.teams} onOpenTeam={openTeam} /></div></section>}
    {view === 'results' && <section className="bento competition-page"><div className="card competition-jornadas"><div className="card-header"><h2>Resultados</h2><span className="tag muted">Agrupados por fecha</span></div>{projection.dateGroups.map((group, index) => <section className="competition-date-group" key={group.date}><h3>Jornada {index + 1} · {group.date}</h3><GameList games={group.games} teams={world.teams} onOpenTeam={openTeam} /></section>)}</div></section>}
    {view === 'standings' && <section className="bento competition-page"><div className="card competition-standings"><div className="card-header"><h2>Clasificación</h2><span className="tag muted">{projection.seasonLabel}</span></div><div className="table standings-table"><div className="row head standings"><div>#</div><div>Equipo</div><div>W</div><div>L</div><div>PF</div><div>PA</div><div>Diff</div><div>Pct</div></div>{projection.standings.map((entry) => <div className="row standings" key={entry.teamId}><div>{entry.position}</div><div><button className="link-button" onClick={() => openTeam(entry.teamId)} type="button">{world.teams[entry.teamId]!.name}</button></div><div>{entry.wins}</div><div>{entry.losses}</div><div>{entry.pointsFor}</div><div>{entry.pointsAgainst}</div><div>{formatDifference(entry.pointDifference)}</div><div>{entry.played === 0 ? '.000' : (entry.wins / entry.played).toFixed(3).replace('0.', '.')}</div></div>)}</div></div></section>}
  </section>
}

function buildCompetitionProjection(world: GameWorld, context: CompetitionContext) {
  const games = Object.values(world.games).filter((game) => game.competitionId === context.competitionId && game.seasonId === context.seasonId).sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
  const groupedGames = new Map<string, Game[]>()
  for (const game of games) groupedGames.set(game.date, [...(groupedGames.get(game.date) ?? []), game])
  return { competitionId: context.competitionId, competitionName: world.competitions[context.competitionId]!.name, seasonLabel: world.seasons[context.seasonId]!.label, games, dateGroups: [...groupedGames].map(([date, grouped]) => ({ date, games: grouped })), standings: calculateStandings(world, context.seasonId), competitions: Object.values(world.competitions).filter((competition) => Object.values(world.seasons).some((season) => season.competitionId === competition.id)).sort((left, right) => left.id.localeCompare(right.id)) }
}

function GameList({ games, teams, onOpenTeam }: { readonly games: readonly Game[]; readonly teams: GameWorld['teams']; readonly onOpenTeam: (teamId: TeamId) => void }) {
  if (games.length === 0) return <p className="tag muted">No hay partidos programados para esta temporada.</p>
  return <div className="competition-game-list">{games.map((game) => <div className="jornada-item" key={game.id}><div className="jornada-date">{game.date}</div><div className="jornada-teams"><button className="link-button" onClick={() => onOpenTeam(game.homeTeamId)} type="button">{teams[game.homeTeamId]!.name}</button><span className="jornada-score">{game.status === 'completed' ? `${game.result.homeScore} - ${game.result.awayScore}` : 'Pendiente'}</span><button className="link-button" onClick={() => onOpenTeam(game.awayTeamId)} type="button">{teams[game.awayTeamId]!.name}</button></div></div>)}</div>
}

function formatDifference(value: number): string { return value > 0 ? `+${value}` : String(value) }
