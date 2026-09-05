import { useState } from 'react'

import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'

const TABS = [
  { id: 'violations', label: 'Violations' },
  { id: 'investigations', label: 'Investigations' },
  { id: 'sanctions', label: 'Sanctions' },
] as const

export function EnforcementWorkspace() {
  const world = useGameStore((state) => state.world)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('violations')

  if (world === null) {
    return <NgHoloShell appLabel="Compliance" empty emptyMessage="No career loaded." region="enforcement-workspace" />
  }

  const team = getUserTeam(world)
  if (team === undefined) {
    return <NgHoloShell appLabel="Compliance" empty region="enforcement-workspace" />
  }

  const violations = Object.values(world.violationsById).filter((item) => item.programTeamId === team.id)
  const investigations = Object.values(world.investigationsById).filter((item) => item.programTeamId === team.id)
  const sanctions = Object.values(world.sanctionsById).filter((item) => item.programTeamId === team.id)

  return (
    <NgHoloShell
      activeTabId={tab}
      appLabel="Compliance"
      meta={`${investigations.filter((item) => item.status === 'active').length} open · ${sanctions.filter((item) => item.status === 'active').length} sanctions`}
      onTabSelect={(id) => setTab(id as (typeof TABS)[number]['id'])}
      region="enforcement-workspace"
      tabs={TABS}
      teamId={team.id}
      title={team.name}
    >
      {tab === 'violations' ? (
        <Table
          empty="No violations recorded."
          gridId="ng-enforcement-violations"
          headers={['Violation', 'Status', 'Sanction', 'Ends']}
          rows={violations.map((item) => {
            const sanction = sanctions.find((value) => value.findingId.includes(item.id))
            return [item.id, `${item.category} / ${item.severity}`, item.status, sanction?.kind ?? '—', sanction?.endsAt ?? '—']
          })}
        />
      ) : null}
      {tab === 'investigations' ? (
        <Table
          empty="No investigations recorded."
          gridId="ng-enforcement-investigations"
          headers={['Investigation', 'Status']}
          rows={investigations.map((item) => [item.id, item.id, item.status])}
        />
      ) : null}
      {tab === 'sanctions' ? (
        <Table
          empty="No sanctions recorded."
          gridId="ng-enforcement-sanctions"
          headers={['Sanction', 'Status', 'Ends']}
          rows={sanctions.map((item) => [item.id, item.kind, item.status, item.endsAt ?? '—'])}
        />
      ) : null}
    </NgHoloShell>
  )
}

function Table({
  gridId,
  headers,
  rows,
  empty,
}: {
  readonly gridId: string
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly empty: string
}) {
  if (rows.length === 0) return <p className="ng-canon__empty">{empty}</p>
  const data = rows.map(([id, ...cells]) => ({
    id,
    cells: Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])),
  }))
  return (
    <div className="ng-canon__panel ng-holo-panel">
      <NgPrecisionTable
        className="ng-canon__table"
        columns={headers.map((header) =>
          ngCol<(typeof data)[number]>(header, header, (row) => row.cells[header], { value: (row) => row.cells[header] }),
        )}
        gridId={gridId}
        rows={data}
      />
    </div>
  )
}
