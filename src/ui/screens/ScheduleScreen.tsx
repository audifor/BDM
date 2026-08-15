import { compareGameDates } from '@/domain/date'
import type { Game } from '@/domain/game'
import { getUserTeam } from '@/engine/calendar'
import { formatPrototypeDate } from '../formatters'

interface ScheduleScreenProps { readonly world: Parameters<typeof getUserTeam>[0]; readonly onOpenMatchCenter?: () => void }
export function ScheduleScreen({ world, onOpenMatchCenter }: ScheduleScreenProps) {
  const team = getUserTeam(world); if (team === undefined) return null
  const games = Object.values(world.games).filter((game) => game.homeTeamId === team.id || game.awayTeamId === team.id).sort((a, b) => compareGameDates(a.date, b.date) || compareGameIds(a, b))
  return <section className="screen"><div className="page-heading"><div><p className="eyebrow">SCHEDULE</p><h1>{team.name}</h1></div><span>{games.length} GAMES</span></div><div className="content-panel table-wrap"><table><thead><tr><th>DATE</th><th>COMPETITION</th><th>MATCHUP</th><th>VENUE</th><th>STATUS</th></tr></thead><tbody>{games.map((game) => <ScheduleRow key={game.id} onOpenMatchCenter={game.status === 'scheduled' ? onOpenMatchCenter : undefined} world={world} game={game} userTeamId={team.id} />)}</tbody></table></div></section>
}
function ScheduleRow({ world, game, userTeamId, onOpenMatchCenter }: { readonly world: Parameters<typeof getUserTeam>[0]; readonly game: Game; readonly userTeamId: NonNullable<ReturnType<typeof getUserTeam>>['id']; readonly onOpenMatchCenter?: () => void }) { const matchup = game.status === 'completed' ? `${world.teams[game.homeTeamId]!.name} ${game.result!.homeScore} – ${game.result!.awayScore} ${world.teams[game.awayTeamId]!.name}` : `${world.teams[game.homeTeamId]!.name} vs ${world.teams[game.awayTeamId]!.name}`; return <tr><td>{formatPrototypeDate(game.date)}</td><td>{world.competitions[game.competitionId]!.name}</td><td>{matchup}</td><td>{game.homeTeamId === userTeamId ? 'HOME' : 'AWAY'}</td><td><span className={game.status === 'completed' ? 'status-final' : 'status-scheduled'}>{game.status === 'completed' ? 'FINAL' : 'SCHEDULED'}</span>{onOpenMatchCenter !== undefined && <button className="text-button" onClick={onOpenMatchCenter} type="button">OPEN MATCH CENTER</button>}</td></tr> }
function compareGameIds(a: Game, b: Game): number { return a.id === b.id ? 0 : a.id < b.id ? -1 : 1 }
