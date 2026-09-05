import { getUserTeam } from '@/engine/calendar'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { useGameStore } from '@/stores/gameStore'
import { UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'

export function BoostersWorkspace() {
  const world = useGameStore((state) => state.world)
  const requestBoosterSupport = useGameStore((state) => state.requestBoosterSupport)

  if (world === null) {
    return <NgHoloShell appLabel="Boosters" empty emptyMessage="No career loaded." region="boosters-workspace" />
  }

  const team = getUserTeam(world)
  if (!resolveGameCapabilities(world).isNcaa) {
    return (
      <NgHoloShell
        appLabel="Boosters"
        empty
        emptyMessage={UNAVAILABLE_SECTION_MESSAGE}
        region="boosters-workspace"
        teamId={team?.id}
      />
    )
  }

  const boosters = Object.values(world.boostersById).filter((item) => item.programTeamId === team?.id)
  const contributions = Object.values(world.boosterContributionsById)

  return (
    <NgHoloShell appLabel="Boosters" meta={`${boosters.length} boosters`} region="boosters-workspace" teamId={team?.id} title="Program support">
      {boosters.length === 0 ? (
        <p className="ng-canon__empty">No boosters are attached to this program.</p>
      ) : (
        <div className="ng-canon__panel ng-holo-panel">
          <NgPrecisionTable
            className="ng-canon__table"
            columns={[
              ngCol('name', 'Booster', (booster) => booster.name, { value: (booster) => booster.name }),
              ngCol('influence', 'Influence', (booster) => booster.influence, { value: (booster) => booster.influence }),
              ngCol('relationship', 'Relationship', (booster) => booster.relationship, { value: (booster) => booster.relationship }),
              ngCol('agenda', 'Agenda', (booster) => booster.agenda, { value: (booster) => booster.agenda }),
              ngCol(
                'resources',
                'Resources',
                (booster) => `${booster.resourcesRemaining}/${booster.resourceCapacity}`,
                { numeric: true, value: (booster) => booster.resourcesRemaining },
              ),
              ngCol('actions', 'Actions', (booster) => (
                <>
                  {contributions.filter((item) => item.boosterId === booster.id).length}{' '}
                  <button className="ng-canon__action" onClick={() => requestBoosterSupport(booster.id)} type="button">
                    Request support
                  </button>
                </>
              )),
            ]}
            gridId="ng-boosters"
            rows={boosters}
          />
        </div>
      )}
    </NgHoloShell>
  )
}
