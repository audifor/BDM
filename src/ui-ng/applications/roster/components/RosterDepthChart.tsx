import type { PlayerId } from '@/domain/ids'
import type { RosterDepthChartLane, RosterDepthChartModel } from '@/ui-ng/applications/roster/buildRosterDepthChart'
import {
  buildDepthChartLaneItems,
  laneHasAssignedRoles,
} from '@/ui-ng/applications/roster/buildRosterDepthChartView'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'
import { EntityLink } from '@/ui/navigation/EntityLink'

const BALANCE_LABEL = {
  thin: 'Thin',
  ok: 'OK',
  loaded: 'Loaded',
} as const

function DepthChartStars({ stars, position }: { readonly stars: number; readonly position: string }) {
  return (
    <span
      aria-label={`${stars} of 5 league stars`}
      className="roster-depth-chart__stars"
      title={`${stars} of 5 vs league ${position}`}
    >
      {Array.from({ length: stars }, (_, index) => (
        <span className="is-on" key={index}>
          ★
        </span>
      ))}
    </span>
  )
}

function DepthChartLane({
  lane,
  onOpenPlayer,
  selectedPlayerId,
}: {
  readonly lane: RosterDepthChartLane
  readonly onOpenPlayer: (destination: EntityDestination) => void
  readonly selectedPlayerId?: PlayerId
}) {
  const hasRoles = laneHasAssignedRoles(lane.players)
  const assignedTotal = Math.max(1, lane.starterCount + lane.rotationCount + lane.benchCount)
  const selected = selectedPlayerId !== undefined && lane.players.some((player) => player.id === selectedPlayerId)
  const items = buildDepthChartLaneItems(lane.players)

  return (
    <article
      className={`roster-depth-chart__lane is-${lane.balance}${hasRoles ? ' has-roles' : ''}${
        selected ? ' is-selected' : ''
      }`}
    >
      <div className="roster-depth-chart__lane-head">
        <div className="roster-depth-chart__identity">
          <span className="roster-depth-chart__pos ng-play-position">{lane.position}</span>
          <strong className="roster-depth-chart__count">{lane.count}</strong>
        </div>
        <em className="roster-depth-chart__balance">{BALANCE_LABEL[lane.balance]}</em>
      </div>
      {hasRoles ? (
        <div aria-hidden className="roster-depth-chart__meter">
          <span className="is-starter" style={{ width: `${(lane.starterCount / assignedTotal) * 100}%` }} />
          <span className="is-rotation" style={{ width: `${(lane.rotationCount / assignedTotal) * 100}%` }} />
          <span className="is-bench" style={{ width: `${(lane.benchCount / assignedTotal) * 100}%` }} />
        </div>
      ) : null}
      <ul className="roster-depth-chart__players">
        {items.length === 0 ? (
          <li className="roster-depth-chart__empty">Sin profundidad</li>
        ) : (
          items.map((item) =>
            item.kind === 'group' ? (
              <li className={`roster-depth-chart__group is-${item.band}`} key={`group-${item.band}`}>
                {item.label}
              </li>
            ) : (
              <li
                className={`roster-depth-chart__row is-${item.player.band}${
                  item.player.id === selectedPlayerId ? ' is-selected' : ''
                }`}
                data-player-id={item.player.id}
                key={item.player.id}
              >
                <span className="roster-depth-chart__rank">{item.rank}</span>
                <EntityLink
                  className="canonical-roster__player-link roster-depth-chart__player"
                  destination={{ type: 'player', playerId: item.player.id, section: 'overview' }}
                  onNavigate={onOpenPlayer}
                >
                  {item.player.name}
                </EntityLink>
                <DepthChartStars position={lane.position} stars={item.player.stars} />
              </li>
            ),
          )
        )}
      </ul>
    </article>
  )
}

export function RosterDepthChart({
  model,
  onOpenPlayer,
  selectedPlayerId,
}: {
  readonly model: RosterDepthChartModel
  readonly onOpenPlayer: (destination: EntityDestination) => void
  readonly selectedPlayerId?: PlayerId
}) {
  return (
    <section
      aria-label="Depth chart"
      className="roster-depth-chart"
      data-ng-region="roster-depth-chart"
    >
      <header className="roster-depth-chart__head">
        <h2 className="roster-depth-chart__title">Depth Chart</h2>
        <span className="roster-depth-chart__meta">{model.rosterCount} players</span>
      </header>
      <div className="roster-depth-chart__lanes">
        {model.lanes.map((lane) => (
          <DepthChartLane
            key={lane.position}
            lane={lane}
            onOpenPlayer={onOpenPlayer}
            selectedPlayerId={selectedPlayerId}
          />
        ))}
      </div>
    </section>
  )
}
