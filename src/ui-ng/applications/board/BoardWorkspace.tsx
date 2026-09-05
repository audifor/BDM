import { getUserTeam } from '@/engine/calendar'
import { evaluateRenewalRecommendation, getBoardSummary } from '@/engine/board'
import { useGameStore } from '@/stores/gameStore'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'

function profileLabel(value: number): string {
  return value >= 70 ? 'High' : value >= 45 ? 'Medium' : 'Low'
}

export function BoardWorkspace() {
  const world = useGameStore((state) => state.world)
  if (world === null) {
    return <NgHoloShell appLabel="Board" empty emptyMessage="No career loaded." region="board-workspace" />
  }

  const team = getUserTeam(world)
  if (team === undefined) {
    return <NgHoloShell appLabel="Board" empty region="board-workspace" />
  }

  const summary = getBoardSummary(world, team.id)
  if (summary === undefined) {
    return (
      <NgHoloShell
        appLabel="Board"
        empty
        emptyMessage="The board will initialize when this project starts."
        region="board-workspace"
        teamId={team.id}
      />
    )
  }

  const renewal = evaluateRenewalRecommendation(summary.state)

  return (
    <NgHoloShell
      appLabel="Board"
      meta={summary.jobSecurity}
      region="board-workspace"
      teamId={team.id}
      title={team.name}
    >
      <div className="ng-canon__overview">
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Confidence</p>
          <h3 className="ng-canon__title">{summary.state.confidence}</h3>
          <dl className="ng-canon__metrics">
            <NgMetric label="Job security" value={summary.jobSecurity} />
            <NgMetric label="Renewal" value={renewal} />
            <NgMetric label="Ambition" value={profileLabel(summary.state.profile.ambition)} />
            <NgMetric label="Patience" value={profileLabel(summary.state.profile.patience)} />
            <NgMetric label="Stability" value={profileLabel(summary.state.profile.stability)} />
          </dl>
        </section>
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Expectation</p>
          <h3 className="ng-canon__title">Mandate</h3>
          <p className="ng-canon__note">{summary.state.expectation.summary}</p>
        </section>
      </div>
      <div className="ng-canon__split" style={{ marginTop: 'var(--ng-spacing-12)' }}>
        <div className="ng-canon__panel ng-holo-panel">
          <p className="ng-canon__eyebrow">Objectives</p>
          {summary.state.objectives.length === 0 ? (
            <p className="ng-canon__empty">No board objectives recorded.</p>
          ) : (
            <NgPrecisionTable
              className="ng-canon__table"
              columns={[
                ngCol('label', 'Objective', (item) => item.label, { value: (item) => item.label }),
                ngCol('priority', 'Priority', (item) => item.priority, { value: (item) => item.priority }),
                ngCol('horizon', 'Horizon', (item) => item.horizon, { value: (item) => item.horizon }),
                ngCol('outcome', 'Outcome', (item) => item.outcome, { value: (item) => item.outcome }),
              ]}
              gridId="ng-board-objectives"
              rows={summary.state.objectives}
            />
          )}
        </div>
        <aside className="ng-canon__inspector ng-holo-panel">
          <p className="ng-canon__eyebrow">Reasons</p>
          {summary.state.reasons.length === 0 ? (
            <p className="ng-canon__empty">The project has just begun.</p>
          ) : (
            <ul className="ng-canon__list">
              {summary.state.reasons.map((item) => (
                <li key={item.id}>
                  {item.delta >= 0 ? '+' : ''}
                  {item.delta} · {item.detail}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </NgHoloShell>
  )
}
