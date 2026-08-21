import { BASKETBALL_RATING_KEYS, getPlayerAge } from '@/domain/player'
import type { ReactNode } from 'react'
import type { GameWorld } from '@/domain/world'
import { getCompetitionsForTeam, getGamesForCompetition } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { calculateStandingsForCompetition } from '@/engine/competition/standings'
import { SquadScreen, StaffScreen } from '@/ui/screens'

import { EntityLink } from './EntityLink'
import { type CompetitionSection, type EntityDestination, type PlayerSection, type TeamSection, useEntityNavigationStore } from './entityNavigation'

export function EntityPageApp({ onOpenEntity, world }: { readonly onOpenEntity: (destination: EntityDestination) => void; readonly world: GameWorld }) {
  const destination = useEntityNavigationStore((state) => state.destination)
  const back = useEntityNavigationStore((state) => state.back)
  const navigate = useEntityNavigationStore((state) => state.navigate)
  const userTeam = getUserTeam(world)
  const current = destination ?? (userTeam === undefined ? null : { type: 'team' as const, teamId: userTeam.id, section: 'overview' as const })
  if (current === null) return <section className="content-panel">No team is assigned to the user coach.</section>
  const changeSection = (next: EntityDestination) => navigate(next)
  return <section className="entity-page"><div className="entity-page__back">{useEntityNavigationStore.getState().history.length > 0 && <button className="text-button" onClick={back} type="button">‹ Back</button>}</div>{current.type === 'team' && <TeamPage destination={current} onOpenEntity={onOpenEntity} onSection={changeSection} world={world} />}{current.type === 'player' && <PlayerPage destination={current} onOpenEntity={onOpenEntity} onSection={changeSection} world={world} />}{current.type === 'competition' && <CompetitionPage destination={current} onOpenEntity={onOpenEntity} onSection={changeSection} world={world} />}</section>
}

function EntityShell({ children, title, subtitle, tabs }: { readonly children: ReactNode; readonly title: string; readonly subtitle?: string; readonly tabs: readonly { readonly active: boolean; readonly label: string; readonly onClick: () => void }[] }) {
  return <><header className="entity-page__header"><p className="eyebrow">ENTITY PAGE</p><h1>{title}</h1>{subtitle !== undefined && <p>{subtitle}</p>}<nav aria-label={`${title} sections`} className="entity-page__tabs">{tabs.map((tab) => <button aria-current={tab.active ? 'page' : undefined} className={tab.active ? 'is-active' : undefined} key={tab.label} onClick={tab.onClick} type="button">{tab.label}</button>)}</nav></header>{children}</>
}

function TeamPage({ destination, onOpenEntity, onSection, world }: { readonly destination: Extract<EntityDestination, { type: 'team' }>; readonly onOpenEntity: (destination: EntityDestination) => void; readonly onSection: (destination: EntityDestination) => void; readonly world: GameWorld }) {
  const team = world.teams[destination.teamId]
  if (team === undefined) return <section className="content-panel">Team no longer exists.</section>
  const competitions = getCompetitionsForTeam(world, team.id)
  const tabs: readonly { readonly label: string; readonly section: TeamSection }[] = [{ label: 'Overview', section: 'overview' }, { label: 'Squad', section: 'squad' }, { label: 'Staff', section: 'staff' }, { label: 'Competitions', section: 'competitions' }]
  return <EntityShell subtitle={`${competitions.map((item) => item.name).join(' · ') || 'Independent team'} · ${team.rosterPlayerIds.length} players`} title={team.name} tabs={tabs.map((tab) => ({ ...tab, active: tab.section === destination.section, onClick: () => onSection({ ...destination, section: tab.section }) }))}>{destination.section === 'overview' && <div className="entity-page__grid"><section className="content-panel"><p className="eyebrow">TEAM</p><p>{team.rosterPlayerIds.length} rostered players.</p><button className="text-button" onClick={() => onSection({ ...destination, section: 'squad' })} type="button">View squad</button></section><section className="content-panel"><p className="eyebrow">COMPETITIONS</p>{competitions.length === 0 ? <p>No current competition.</p> : competitions.map((competition) => <p key={competition.id}><EntityLink destination={{ type: 'competition', competitionId: competition.id, section: 'overview' }} onNavigate={onOpenEntity}>{competition.name}</EntityLink></p>)}</section></div>}{destination.section === 'squad' && <SquadScreen onOpenEntity={onOpenEntity} teamId={team.id} world={world} />}{destination.section === 'staff' && <StaffScreen teamId={team.id} world={world} />}{destination.section === 'competitions' && <section className="content-panel"><p className="eyebrow">COMPETITIONS</p>{competitions.map((competition) => <p key={competition.id}><EntityLink destination={{ type: 'competition', competitionId: competition.id, section: 'overview' }} onNavigate={onOpenEntity}>{competition.name}</EntityLink></p>)}</section>}</EntityShell>
}

function PlayerPage({ destination, onOpenEntity, onSection, world }: { readonly destination: Extract<EntityDestination, { type: 'player' }>; readonly onOpenEntity: (destination: EntityDestination) => void; readonly onSection: (destination: EntityDestination) => void; readonly world: GameWorld }) {
  const player = world.players[destination.playerId]
  if (player === undefined) return <section className="content-panel">Player no longer exists.</section>
  const team = Object.values(world.teams).find((item) => item.rosterPlayerIds.includes(player.id))
  const tabs: readonly { readonly label: string; readonly section: PlayerSection }[] = [{ label: 'Overview', section: 'overview' }]
  return <EntityShell subtitle={`${team?.name ?? 'Free agent'} · ${player.basketball.primaryPosition} · ${getPlayerAge(world, player.id)}`} title={`${player.firstName} ${player.lastName}`} tabs={tabs.map((tab) => ({ ...tab, active: tab.section === destination.section, onClick: () => onSection({ ...destination, section: tab.section }) }))}><div className="entity-page__grid"><section className="content-panel"><p className="eyebrow">PLAYER PROFILE</p><dl className="entity-page__ratings">{BASKETBALL_RATING_KEYS.map((key) => <div key={key}><dt>{key}</dt><dd>{player.basketball.ratings[key]}</dd></div>)}</dl></section><section className="content-panel"><p className="eyebrow">TEAM</p>{team === undefined ? <p>Free agent</p> : <EntityLink destination={{ type: 'team', teamId: team.id, section: 'overview' }} onNavigate={onOpenEntity}>{team.name}</EntityLink>}</section></div></EntityShell>
}

function CompetitionPage({ destination, onOpenEntity, onSection, world }: { readonly destination: Extract<EntityDestination, { type: 'competition' }>; readonly onOpenEntity: (destination: EntityDestination) => void; readonly onSection: (destination: EntityDestination) => void; readonly world: GameWorld }) {
  const competition = world.competitions[destination.competitionId]
  if (competition === undefined) return <section className="content-panel">Competition no longer exists.</section>
  const tabs: readonly { readonly label: string; readonly section: CompetitionSection }[] = [{ label: 'Overview', section: 'overview' }, { label: 'Standings', section: 'standings' }, { label: 'Schedule', section: 'schedule' }, { label: 'Teams', section: 'teams' }]
  const teams = competition.participantTeamIds.map((id) => world.teams[id]!).filter(Boolean)
  const games = getGamesForCompetition(world, competition.id)
  return <EntityShell subtitle={`${teams.length} teams`} title={competition.name} tabs={tabs.map((tab) => ({ ...tab, active: tab.section === destination.section, onClick: () => onSection({ ...destination, section: tab.section }) }))}>{destination.section === 'overview' && <div className="entity-page__grid"><section className="content-panel"><p className="eyebrow">COMPETITION</p><p>{games.filter((game) => game.status === 'completed').length} of {games.length} games completed.</p></section><section className="content-panel"><button className="text-button" onClick={() => onSection({ ...destination, section: 'standings' })} type="button">View standings</button></section></div>}{destination.section === 'standings' && <section className="content-panel table-wrap"><table><thead><tr><th>POS</th><th>TEAM</th><th>W</th><th>L</th></tr></thead><tbody>{calculateStandingsForCompetition(world, competition.id).map((entry) => <tr key={entry.teamId}><td>{entry.position}</td><td><EntityLink destination={{ type: 'team', teamId: entry.teamId, section: 'overview' }} onNavigate={onOpenEntity}>{world.teams[entry.teamId]!.name}</EntityLink></td><td>{entry.wins}</td><td>{entry.losses}</td></tr>)}</tbody></table></section>}{destination.section === 'schedule' && <section className="content-panel table-wrap"><table><thead><tr><th>DATE</th><th>MATCHUP</th><th>STATUS</th></tr></thead><tbody>{games.map((game) => <tr key={game.id}><td>{game.date}</td><td><EntityLink destination={{ type: 'team', teamId: game.homeTeamId, section: 'overview' }} onNavigate={onOpenEntity}>{world.teams[game.homeTeamId]!.name}</EntityLink> vs <EntityLink destination={{ type: 'team', teamId: game.awayTeamId, section: 'overview' }} onNavigate={onOpenEntity}>{world.teams[game.awayTeamId]!.name}</EntityLink></td><td>{game.status}</td></tr>)}</tbody></table></section>}{destination.section === 'teams' && <section className="content-panel"><p className="eyebrow">PARTICIPATING TEAMS</p>{teams.map((team) => <p key={team.id}><EntityLink destination={{ type: 'team', teamId: team.id, section: 'overview' }} onNavigate={onOpenEntity}>{team.name}</EntityLink></p>)}</section>}</EntityShell>
}
