import { getPlayerAge } from '@/domain/player'
import { formatRatingEvaluation, getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { organizationIdForTeam } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getCareerFatigueForPlayer } from '@/domain/world'
import { AppFrame, AppHeader, DetailGroup } from '@/ui/desktop/AppFramework'
import { Badge, Tabs } from '@/ui/components/designSystem'

import { EntityLink } from './EntityLink'
import type { EntityDestination } from './entityNavigation'

/** A compact entity surface intended to live beside the roster window. */
export function PlayerProfileApp({ destination, onOpenEntity, world }: { readonly destination: Extract<EntityDestination, { type: 'player' }>; readonly onOpenEntity: (destination: EntityDestination) => void; readonly world: GameWorld }) {
  const player = world.players[destination.playerId]
  if (player === undefined) return <section className="content-panel">Player no longer exists.</section>
  const team = Object.values(world.teams).find((item) => item.rosterPlayerIds.includes(player.id))
  const name = `${player.firstName} ${player.lastName}`
  const age = getPlayerAge(world, player.id)
  const fatigue = getCareerFatigueForPlayer(world, player.id)
  const observer = Object.values(world.teams).find((item) => item.coachId === world.userCoachId) ?? team ?? Object.values(world.teams)[0]!
  const ratings = ['finishing','shooting','creation','perimeterDefense','interiorDefense','rebounding','physical'].map((key) => getOrganizationRatingEvaluation({ organizationId: organizationIdForTeam(observer.id), playerId: player.id, dimension: key, knowledge: world.organizationKnowledge, currentDate: world.currentDate, publicPosition: player.basketball.primaryPosition }))
  return <AppFrame header={<AppHeader meta={<Badge tone={team === undefined ? 'neutral' : 'info'}>{team === undefined ? 'FREE AGENT' : 'ROSTERED'}</Badge>} title={name} />} navigation={<Tabs onChange={() => undefined} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'attributes', label: 'Attributes' }, { id: 'history', label: 'History' }, { id: 'notes', label: 'Notes' }]} value="overview" />}>
    <section className="player-profile__canonical">
      <header className="player-profile__hero"><div aria-hidden="true" className="player-profile__portrait">{player.firstName[0]}{player.lastName[0]}</div><div><p>{player.basketball.primaryPosition} · Age {age}</p><strong>{team === undefined ? 'Free agent' : team.name}</strong></div><div className="player-profile__condition">CONDITION <b>{Math.max(0, 100 - fatigue)}%</b></div></header>
      <div className="player-profile__grid"><DetailGroup title="Attribute summary"><dl className="player-profile__ratings">{['finishing','shooting','creation','perimeterDefense','interiorDefense','rebounding','physical'].map((key,index) => <div key={key}><dt>{key}</dt><dd title={`${ratings[index]!.confidence}% confidence`}>{formatRatingEvaluation(ratings[index]!)}</dd></div>)}</dl></DetailGroup><DetailGroup title="Player info"><dl className="player-profile__info"><div><dt>Team</dt><dd>{team === undefined ? '—' : <EntityLink destination={{ type: 'team', teamId: team.id, section: 'overview' }} onNavigate={onOpenEntity}>{team.name}</EntityLink>}</dd></div><div><dt>Age</dt><dd>{age}</dd></div><div><dt>Fatigue</dt><dd>{fatigue} / 100</dd></div><div><dt>Role</dt><dd>Rostered</dd></div></dl></DetailGroup></div>
      <DetailGroup title="Season performance"><p className="player-profile__unavailable">Season game logs are not yet available for a canonical trend.</p></DetailGroup>
    </section>
  </AppFrame>
}
