import type { RosterInspectorDossier as RosterInspectorDossierModel } from '@/ui-ng/applications/roster/buildRosterInspectorDossier'
import { RosterStaffComments } from '@/ui-ng/applications/roster/components/RosterStaffComments'

function DossierMeasure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="canonical-roster__inspector-measure">
      <span className="canonical-roster__inspector-measure-reading">
        <strong className="canonical-roster__inspector-measure-value ng-type-numeric">{value}</strong>
      </span>
      <span className="canonical-roster__inspector-measure-label">{label}</span>
    </div>
  )
}

export function RosterInspectorDossier({ model }: { readonly model: RosterInspectorDossierModel }) {
  return (
    <aside
      aria-label="Dossier del jugador"
      className={`roster-inspector-dossier is-${model.zones.length}`}
      data-ng-region="roster-inspector-dossier"
    >
      {model.zones.map((zone) => (
        <section
          className={`roster-inspector-dossier__zone is-${zone.id}`}
          data-zone={zone.id}
          key={zone.id}
        >
          <h2 className="roster-inspector-dossier__title">{zone.title}</h2>
          {zone.staff === undefined ? (
            <div className="roster-inspector-dossier__measures">
              {zone.facts.map((fact) => (
                <DossierMeasure key={fact.label} label={fact.label} value={fact.value} />
              ))}
            </div>
          ) : (
            <RosterStaffComments embedded model={zone.staff} />
          )}
        </section>
      ))}
    </aside>
  )
}
