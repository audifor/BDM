import { useMemo } from 'react'

import { getCurrentSeason } from '@/app/game'
import { getInboxItemsForCoach, getTeamFinancialSnapshot } from '@/domain/world'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { formatMoney } from '@/ui/formatters'
import { useDesktopPreferencesStore } from '@/stores/desktopPreferencesStore'

export function DesktopCanonicalSurfaceLayer({ visible, world }: { readonly visible: boolean; readonly world: GameWorld }) {
  const notes = useDesktopPreferencesStore((state) => state.teamNotes)
  const setNotes = useDesktopPreferencesStore((state) => state.setTeamNotes)
  const team = getUserTeam(world)
  const season = getCurrentSeason(world)
  const inbox = getInboxItemsForCoach(world, world.userCoachId).slice(0, 4)
  const games = useMemo(() => team === undefined ? [] : Object.values(world.games).filter((game) => game.seasonId === season.id && (game.homeTeamId === team.id || game.awayTeamId === team.id) && game.date >= world.currentDate).sort((left, right) => left.date.localeCompare(right.date)).slice(0, 4), [season.id, team, world])
  const finances = team === undefined ? undefined : getTeamFinancialSnapshot(world, team.id)
  const systemTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date())
  if (!visible) return null
  return <div aria-label="Canonical desktop lower surfaces" className="canonical-desktop-surfaces">
    <section className="canonical-panel canonical-panel--inbox"><PanelTitle title="INBOX" trailing={inbox.length === 0 ? '0 unread' : `${inbox.length} messages`} /><div className="canonical-panel__rows">{inbox.length === 0 ? <p className="canonical-panel__empty">No messages</p> : inbox.map((item) => <div className="canonical-inbox-row" key={item.id}><span className="canonical-inbox-row__avatar">✦</span><span><b>{item.category}</b><small>{item.title}</small></span><time>{item.gameDate}</time></div>)}</div></section>
    <section className="canonical-panel canonical-panel--games"><PanelTitle title="UPCOMING GAMES" /><div className="canonical-panel__rows">{games.length === 0 ? <p className="canonical-panel__empty">No upcoming games</p> : games.map((game) => { const opponent = world.teams[game.homeTeamId === team?.id ? game.awayTeamId : game.homeTeamId]!; const home = game.homeTeamId === team?.id; return <div className="canonical-game-row" key={game.id}><time>{game.date.slice(5)}</time><span className="canonical-game-row__crest">{opponent.name.slice(0, 1)}</span><b>{home ? 'vs' : '@'} {opponent.name}</b><small>{home ? 'Home' : 'Away'}</small></div> })}</div></section>
    <section className="canonical-panel canonical-panel--finances"><PanelTitle title="TEAM FINANCES" trailing="THIS SEASON" />{finances === undefined ? <p className="canonical-panel__empty">Team financial data unavailable</p> : <dl className="canonical-finance-list"><div><dt>Salary budget</dt><dd>{formatMoney(finances.playerSalaryBudget)}</dd></div><div><dt>Current payroll</dt><dd>{formatMoney(finances.currentPlayerPayroll)}</dd></div><div><dt>Available space</dt><dd>{formatMoney(finances.remainingPlayerSalaryBudget)}</dd></div><div className={finances.remainingPlayerSalaryBudget < 0 ? 'is-negative' : ''}><dt>Budget status</dt><dd>{finances.status}</dd></div></dl>}</section>
    <aside className="team-notes"><span aria-hidden="true" className="team-notes__pin" /><p>TEAM NOTES</p><textarea aria-label="Team notes" onChange={(event) => setNotes(event.target.value)} value={notes} /></aside>
    <div className="bottom-brand" aria-label="BDM Basketball Dynasty Manager"><strong>BDM</strong><small>BASKETBALL DYNASTY MANAGER</small></div>
    <div className="system-tray" aria-label="System tray"><span aria-label="Network" className="system-tray__icon system-tray__icon--network" /><span aria-label="Volume" className="system-tray__icon system-tray__icon--volume" /><span aria-label="Power" className="system-tray__icon system-tray__icon--power" /><time>{systemTime} · {world.currentDate}</time></div>
  </div>
}

function PanelTitle({ title, trailing }: { readonly title: string; readonly trailing?: string }) { return <header className="canonical-panel__title"><b>{title}</b>{trailing !== undefined && <small>{trailing}</small>}</header> }
