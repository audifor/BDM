import { getPlayerAge } from '@/domain/player'
import type { GameWorld } from '@/domain/world'
import { getCareerFatigueForPlayer } from '@/domain/world'
import { derivePlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
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
  const access = derivePlayerKnowledgeAccess(world, player.id)
  const dimensions = access.knownDimensions
  return <AppFrame header={<AppHeader meta={<Badge tone={team === undefined ? 'neutral' : 'info'}>{team === undefined ? 'FREE AGENT' : 'ROSTERED'}</Badge>} title={name} />} navigation={<Tabs onChange={() => undefined} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'attributes', label: 'Attributes' }, { id: 'history', label: 'History' }, { id: 'notes', label: 'Notes' }]} value="overview" />}>
    <section className="player-profile__canonical">
      <header className="player-profile__hero"><div aria-hidden="true" className="player-profile__portrait">{player.firstName[0]}{player.lastName[0]}</div><div><p>{player.basketball.primaryPosition} · Age {age}</p><strong>{team === undefined ? 'Free agent' : team.name}</strong></div><div className="player-profile__condition">CONDITION <b>{Math.max(0, 100 - fatigue)}%</b></div></header>
      <div className="player-profile__grid"><DetailGroup title="Attribute summary"><dl className="player-profile__ratings">{dimensions.length === 0 ? <div><dt>Scouting</dt><dd>Not scouted</dd></div> : dimensions.map((dimension) => <div key={dimension.id}><dt>{dimension.label}</dt><dd title={`${dimension.evaluation.confidence}% confidence`}>{dimension.displayLabel}</dd></div>)}</dl></DetailGroup><DetailGroup title="Player info"><dl className="player-profile__info"><div><dt>Team</dt><dd>{team === undefined ? '—' : <EntityLink destination={{ type: 'team', teamId: team.id, section: 'overview' }} onNavigate={onOpenEntity}>{team.name}</EntityLink>}</dd></div><div><dt>Age</dt><dd>{age}</dd></div><div><dt>Fatigue</dt><dd>{fatigue} / 100</dd></div><div><dt>Role</dt><dd>Rostered</dd></div></dl></DetailGroup></div>
      <DetailGroup title="Season performance"><p className="player-profile__unavailable">Season game logs are not yet available for a canonical trend.</p></DetailGroup>
    </section>
  </AppFrame>
}
