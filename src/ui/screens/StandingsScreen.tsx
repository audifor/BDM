import { useState } from 'react'

import { calculateStandingsForCompetition } from '@/engine/competition/standings'
import type { GameWorld } from '@/domain/world'
import { getCompetitionChampion, getSeasonHistory } from '@/engine/season'
import { getCompetitionSeason, getCompetitionTemporalStatus, getCompetitionTier } from '@/engine/competition'
import { getEcosystemForCompetition } from '@/domain/world'

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
  return <section className="screen">
    <div className="page-heading"><div><p className="eyebrow">STANDINGS · {ecosystem.name} · {tier === undefined ? '' : `TIER ${tier.level} · `}{status.toUpperCase()} {champion === undefined ? '' : '· FINAL'}</p><h1>{competition.name}</h1><small>{edition.startDate} — {edition.endDate}</small></div><select value={competition.id} onChange={(event) => setSelectedId(event.target.value as typeof competition.id)}>{competitions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <div className="content-panel table-wrap"><table><thead><tr><th>POS</th><th>TEAM</th><th>P</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>+/-</th></tr></thead><tbody>{standings.map((entry) => <tr key={entry.teamId}><td>{entry.position}</td><td>{world.teams[entry.teamId]!.name}{champion === entry.teamId ? ' · CHAMPION' : ''}</td><td>{entry.played}</td><td>{entry.wins}</td><td>{entry.losses}</td><td>{entry.pointsFor}</td><td>{entry.pointsAgainst}</td><td>{entry.pointDifference > 0 ? '+' : ''}{entry.pointDifference}</td></tr>)}</tbody></table></div>
    {history.length > 0 && <section className="content-panel"><p className="eyebrow">SEASON HISTORY</p>{history.map((record) => <p key={record.seasonId}>{world.seasons[record.seasonId]!.label} · {world.competitions[record.competitionId]!.name} · {world.teams[record.championTeamId]!.name}</p>)}</section>}
  </section>
}
