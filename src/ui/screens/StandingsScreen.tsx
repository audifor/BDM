import { useState } from 'react'

import { calculateConferenceStandings, calculateStandingsForCompetition, getConferenceRegularSeasonChampion } from '@/engine/competition/standings'
import type { GameWorld } from '@/domain/world'
import { getCompetitionChampion, getSeasonHistory } from '@/engine/season'
import { getCompetitionSeason, getCompetitionTemporalStatus, getCompetitionTier } from '@/engine/competition'
import { getEcosystemForCompetition } from '@/domain/world'
import { Select } from '@/ui/components/designSystem'

interface StandingsScreenProps { readonly world: GameWorld }

export function StandingsScreen({ world }: StandingsScreenProps) {
  const competitions = Object.values(world.competitions).sort((a, b) => a.name.localeCompare(b.name))
  const [selectedId, setSelectedId] = useState(competitions[0]!.id)
  const competition = world.competitions[selectedId] ?? competitions[0]!
  const standings = calculateStandingsForCompetition(world, competition.id)
  const champion = getCompetitionChampion(world, competition.id)
  const ecosystem = getEcosystemForCompetition(world, competition.id)
  const edition = getCompetitionSeason(world, competition.id)
  const status = getCompetitionTemporalStatus(world, competition.id)
  const history = getSeasonHistory(world)
  const tier = getCompetitionTier(world, competition.id)
  const conferences = ecosystem.kind === 'ncaaLike' ? Object.values(world.conferencesById).filter((conference) => conference.ecosystemId === ecosystem.id).sort((a, b) => a.name.localeCompare(b.name)) : []
  return <section className="screen">
    <div className="page-heading"><div><p className="eyebrow">STANDINGS · {ecosystem.name} · {tier === undefined ? '' : `TIER ${tier.level} · `}{status.toUpperCase()} {champion === undefined ? '' : '· FINAL'}</p><h1>{competition.name}</h1><small>{edition.startDate} — {edition.endDate}</small></div><Select ariaLabel="Competition" onChange={(value) => setSelectedId(value as typeof competition.id)} options={competitions.map((item) => ({ value: item.id, label: item.name }))} value={competition.id} /></div>
    <div className="content-panel table-wrap"><table><thead><tr><th>POS</th><th>TEAM</th><th>P</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>+/-</th></tr></thead><tbody>{standings.map((entry) => <tr key={entry.teamId}><td>{entry.position}</td><td>{world.teams[entry.teamId]!.name}{champion === entry.teamId ? ' · CHAMPION' : ''}</td><td>{entry.played}</td><td>{entry.wins}</td><td>{entry.losses}</td><td>{entry.pointsFor}</td><td>{entry.pointsAgainst}</td><td>{entry.pointDifference > 0 ? '+' : ''}{entry.pointDifference}</td></tr>)}</tbody></table></div>
    {history.length > 0 && <section className="content-panel"><p className="eyebrow">SEASON HISTORY</p>{history.map((record) => <p key={record.seasonId}>{world.seasons[record.seasonId]!.label} · {world.competitions[record.competitionId]!.name} · {world.teams[record.championTeamId]!.name}</p>)}</section>}
    {conferences.map((conference) => { const entries = calculateConferenceStandings(world, edition.id, conference.id); const conferenceChampion = getConferenceRegularSeasonChampion(world, edition.id, conference.id); return <section className="content-panel table-wrap" key={conference.id}><p className="eyebrow">{conference.name} · CONFERENCE STANDINGS</p><table><thead><tr><th>POS</th><th>PROGRAM</th><th>CONF W-L</th><th>OVERALL W-L</th></tr></thead><tbody>{entries.map((entry) => { const overall = standings.find((item) => item.teamId === entry.teamId); return <tr key={entry.teamId}><td>{entry.position}</td><td>{world.teams[entry.teamId]!.name}{conferenceChampion === entry.teamId ? ' · REGULAR SEASON CHAMPION' : ''}</td><td>{entry.wins}-{entry.losses}</td><td>{overall?.wins ?? 0}-{overall?.losses ?? 0}</td></tr> })}</tbody></table></section> })}
  </section>
}
