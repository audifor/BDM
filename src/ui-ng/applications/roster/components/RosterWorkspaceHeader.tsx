import { buildRosterWorkspaceContext } from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'

export function RosterWorkspaceHeader({
  context,
}: {
  readonly context: NonNullable<ReturnType<typeof buildRosterWorkspaceContext>>
}) {
  return (
    <header className="roster-workspace-header" data-ng-region="roster-workspace-header">
      <div className="roster-workspace-header__main">
        <span className="roster-workspace-header__app">Roster</span>
        <span className="roster-workspace-header__sep" aria-hidden />
        <span className="roster-workspace-header__team">{context.teamName}</span>
        <span className="roster-workspace-header__meta">
          {context.competitionLabel ?? '—'}
          {' · '}
          {context.seasonLabel ?? '—'}
          {' · '}
          <span className="ng-type-numeric">{context.rosterCount}</span> players
        </span>
      </div>
    </header>
  )
}
