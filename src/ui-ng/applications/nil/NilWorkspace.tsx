import { getUserTeam } from '@/engine/calendar'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { useGameStore } from '@/stores/gameStore'
import { UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'

export function NilWorkspace() {
  const world = useGameStore((state) => state.world)
  const acceptNilOpportunity = useGameStore((state) => state.acceptNilOpportunity)

  if (world === null) {
    return <NgHoloShell appLabel="NIL" empty emptyMessage="No career loaded." region="nil-workspace" />
  }

  const team = getUserTeam(world)
  if (!resolveGameCapabilities(world).isNcaa) {
    return (
      <NgHoloShell
        appLabel="NIL"
        empty
        emptyMessage={UNAVAILABLE_SECTION_MESSAGE}
        region="nil-workspace"
        teamId={team?.id}
      />
    )
  }

  const profiles = Object.values(world.nilProfilesById).filter((profile) => profile.programTeamId === team?.id)
  const collective = Object.values(world.collectivesById).find((item) => item.programTeamId === team?.id)

  return (
    <NgHoloShell
      appLabel="NIL"
      meta={collective === undefined ? 'Unavailable' : `${collective.resourcesRemaining} / ${collective.resourceCapacity}`}
      region="nil-workspace"
      teamId={team?.id}
      title={collective?.name ?? 'NIL'}
    >
      {collective === undefined ? (
        <p className="ng-canon__empty">No collective is attached to this program.</p>
      ) : (
        <section className="ng-canon__card ng-holo-panel">
          <dl className="ng-canon__metrics">
            <NgMetric label="Collective" value={collective.name} />
            <NgMetric label="Remaining" value={collective.resourcesRemaining} />
            <NgMetric label="Capacity" value={collective.resourceCapacity} />
          </dl>
        </section>
      )}
      <div className="ng-canon__panel ng-holo-panel" style={{ marginTop: 'var(--ng-spacing-12)' }}>
        {profiles.length === 0 ? (
          <p className="ng-canon__empty">No NIL profiles for this roster.</p>
        ) : (
          <NgPrecisionTable
            className="ng-canon__table"
            columns={ngTableColumns(profiles.map((profile) => ({
              id: profile.id,
              playerId: profile.playerId,
              player: world.players[profile.playerId],
              marketability: profile.marketability,
              opportunities: Object.values(world.nilOpportunitiesById).filter(
                (item) => item.playerId === profile.playerId && item.status === 'available',
              ),
              deals: Object.values(world.nilDealsById).filter((item) => item.playerId === profile.playerId && item.status === 'active').length,
            })), [
              ngCol('player', 'Player', (row) =>
                row.player === undefined ? (
                  row.playerId
                ) : (
                  <button className="ng-canon__link" onClick={() => navigateToPlayer(row.player.id)} type="button">
                    {row.player.firstName} {row.player.lastName}
                  </button>
                ), { value: (row) => row.player === undefined ? row.playerId : `${row.player.firstName} ${row.player.lastName}` }),
              ngCol('marketability', 'Marketability', (row) => row.marketability, { numeric: true, value: (row) => row.marketability }),
              ngCol('opportunities', 'Opportunities', (row) =>
                row.opportunities.length === 0
                  ? '—'
                  : row.opportunities.map((item) => (
                      <button className="ng-canon__action" key={item.id} onClick={() => acceptNilOpportunity(item.id)} type="button">
                        Accept {item.estimatedValue}
                      </button>
                    )), { value: (row) => row.opportunities.length }),
              ngCol('deals', 'Deals', (row) => row.deals, { numeric: true, value: (row) => row.deals }),
            ])}
            gridId="ng-nil-profiles"
            rows={profiles.map((profile) => ({
              id: profile.id,
              playerId: profile.playerId,
              player: world.players[profile.playerId],
              marketability: profile.marketability,
              opportunities: Object.values(world.nilOpportunitiesById).filter(
                (item) => item.playerId === profile.playerId && item.status === 'available',
              ),
              deals: Object.values(world.nilDealsById).filter((item) => item.playerId === profile.playerId && item.status === 'active').length,
            }))}
          />
        )}
      </div>
    </NgHoloShell>
  )
}
