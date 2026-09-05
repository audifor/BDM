import { getPlayerAge, type Player } from '@/domain/player'
import { formatInjuryKind } from '@/domain/injury'
import { getCurrentPlayerInjury, getTeamLineup, type GameWorld } from '@/domain/world'
import { getLineupSlotForPlayer } from '@/domain/tactics'
import type { TeamId } from '@/domain/ids'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { CountryNationalityMark } from '@/ui-ng/applications/player/components/CountryNationalityMark'
import { buildRosterInspectorSeasonStats } from '@/ui-ng/applications/roster/buildRosterInspectorSeasonStats'

function InspectorMeasure({
  value,
  unit,
  label,
}: {
  readonly value: string
  readonly unit?: string
  readonly label: string
}) {
  return (
    <div className="canonical-roster__inspector-measure">
      <span className="canonical-roster__inspector-measure-reading">
        <strong className="canonical-roster__inspector-measure-value ng-type-numeric">{value}</strong>
        {unit === undefined || unit === '' ? null : (
          <span className="canonical-roster__inspector-measure-unit">{unit}</span>
        )}
      </span>
      <span className="canonical-roster__inspector-measure-label">{label}</span>
    </div>
  )
}

export function RosterRowInspector({
  player,
  team,
  world,
  onOpenPlayer,
}: {
  readonly player: Player
  readonly team: { readonly id: TeamId }
  readonly world: GameWorld
  readonly onOpenPlayer: (player: Player) => void
}) {
  const injury = getCurrentPlayerInjury(world, player.id)
  const lineup = getTeamLineup(world, team.id)
  const slot = lineup === undefined ? undefined : getLineupSlotForPlayer(lineup, player.id)
  const age = getPlayerAge(world, player.id)
  const nationality = String(player.nationalityId)
  const showNationality = /^[A-Z]{2,3}$/i.test(nationality)
  const seasonStats = buildRosterInspectorSeasonStats(world, player.id)

  return (
    <aside
      aria-label="Inspector del jugador"
      className="canonical-roster__inspector"
      data-ng-region="roster-row-inspector"
    >
      <header className="canonical-roster__inspector-head">
        <div className="canonical-roster__inspector-who">
          <button
            className="canonical-roster__player-link"
            onClick={() => onOpenPlayer(player)}
            type="button"
          >
            {player.firstName} {player.lastName}
          </button>
          <div className="canonical-roster__inspector-marks">
            <PlayPositionMark position={player.basketball.primaryPosition} />
            {showNationality ? <CountryNationalityMark code={nationality} /> : null}
            {injury === undefined ? (
              <span className="canonical-roster__status canonical-roster__status--ok">OK</span>
            ) : (
              <span
                className="canonical-roster__status canonical-roster__status--out"
                title={`${formatInjuryKind(injury.kind)} · return ${injury.expectedReturnDate}`}
              >
                OUT
              </span>
            )}
            {slot === undefined ? null : <span className="canonical-roster__inspector-slot">{slot}</span>}
          </div>
        </div>
      </header>
      <div className="canonical-roster__inspector-identity">
        <InspectorMeasure label="Age" value={age === undefined ? '—' : String(age)} />
        <InspectorMeasure label="Height" unit="cm" value={String(player.bio.heightCm)} />
        <InspectorMeasure label="Weight" unit="kg" value={String(player.bio.weightKg)} />
        <InspectorMeasure label="Wingspan" unit="cm" value={String(player.bio.wingspanCm)} />
      </div>
      <div className="canonical-roster__inspector-production">
        {seasonStats.map((stat) => (
          <InspectorMeasure key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
    </aside>
  )
}
