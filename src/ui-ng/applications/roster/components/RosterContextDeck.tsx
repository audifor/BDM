import type { Player } from '@/domain/player'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { RosterBriefingModel, RosterLaneDiagnosis } from '@/ui-ng/applications/roster/buildRosterBriefing'
import { buildRosterInspectorDossier } from '@/ui-ng/applications/roster/buildRosterInspectorDossier'
import { RosterInspectorDossier } from '@/ui-ng/applications/roster/components/RosterInspectorDossier'
import { RosterRowInspector } from '@/ui-ng/applications/roster/components/RosterRowInspector'

const DIAGNOSIS_LABEL: Readonly<Record<RosterLaneDiagnosis, string>> = {
  shortage: 'Shortage',
  thin: 'Thin',
  balanced: 'Balanced',
  overload: 'Overload',
  critical: 'Critical',
}

export function RosterContextDeck({
  briefing,
  onOpenPlayer,
  player,
  teamId,
  world,
}: {
  readonly briefing: RosterBriefingModel
  readonly onOpenPlayer: (player: Player) => void
  readonly player: Player | undefined
  readonly teamId: TeamId
  readonly world: GameWorld
}) {
  return (
    <section aria-label="Contexto de plantilla" className="roster-workspace__deck" data-ng-region="roster-context-deck">
      {player === undefined ? (
        <RosterBriefing model={briefing} />
      ) : (
        <>
          <RosterRowInspector
            onOpenPlayer={onOpenPlayer}
            player={player}
            team={{ id: teamId }}
            world={world}
          />
          <RosterInspectorDossier model={buildRosterInspectorDossier(world, teamId, player)} />
        </>
      )}
    </section>
  )
}

function RosterBriefing({ model }: { readonly model: RosterBriefingModel }) {
  const age =
    model.ageMin === undefined || model.ageMax === undefined ? '—' : `${model.ageMin}–${model.ageMax}`

  return (
    <div className="roster-briefing" data-ng-region="roster-briefing">
      <header className="roster-briefing__head">
        <h2 className="roster-briefing__title">Lectura de plantilla</h2>
        <p className="roster-briefing__lede">
          <strong className="ng-type-numeric">{model.rosterCount}</strong> jugadores
          {' · '}
          <strong className="ng-type-numeric">{model.unassignedCount}</strong> sin rol
          {' · '}
          <strong className="ng-type-numeric">{model.injuredCount}</strong> baja
        </p>
      </header>
      <ul className="roster-briefing__lanes">
        {model.lanes.map((lane) => (
          <li className={`roster-briefing__lane is-${lane.diagnosis}`} key={lane.position}>
            <div className="roster-briefing__lane-top">
              <span className="ng-play-position">{lane.position}</span>
              <strong className="ng-type-numeric">{lane.count}</strong>
            </div>
            <span aria-hidden className="roster-briefing__lane-rule" />
            <div className="roster-briefing__lane-meta">
              <span>
                Target {lane.targetMin}–{lane.targetMax}
              </span>
              <em>{DIAGNOSIS_LABEL[lane.diagnosis]}</em>
            </div>
          </li>
        ))}
      </ul>
      <dl className="roster-briefing__facts">
        <div>
          <dt>Scouting conocido</dt>
          <dd className="ng-type-numeric">{model.knownSignalPercent}%</dd>
        </div>
        <div>
          <dt>Contratos</dt>
          <dd>
            <span className="ng-type-numeric">{model.scholarshipCount}</span> becas
            {' · '}
            <span className="ng-type-numeric">{model.contractedCount}</span> salario
          </dd>
        </div>
        <div>
          <dt>Edad</dt>
          <dd className="ng-type-numeric">{age}</dd>
        </div>
      </dl>
    </div>
  )
}
