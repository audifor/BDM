import { buildRosterWorkspaceContext } from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'
import type { WorkspaceTab } from '@/ui-ng/types/workspace'
import type { RosterWorkspaceSessionState } from '@/ui-ng/applications/roster/rosterWorkspaceSession'

const TABS: readonly WorkspaceTab[] = [
  {id:'plantilla',label:'PLANTILLA'},
  {id:'profundidad',label:'PROFUNDIDAD'},
  {id:'briefing',label:'BRIEFING'},
  {id:'planificar',label:'PLANIFICAR'},
]

export function RosterWorkspaceHeader({
  context,
  activeTab = 'plantilla',
  onTabChange,
}: {
  readonly context: NonNullable<ReturnType<typeof buildRosterWorkspaceContext>>
  readonly activeTab?: RosterWorkspaceSessionState['tab']
  readonly onTabChange?: (tab: RosterWorkspaceSessionState['tab']) => void
}) {
  return <header className="roster-workspace-header roster-v4__header" data-ng-region="roster-workspace-header">
    <div className="roster-v4__heading">
      <strong className="roster-v4__title">ROSTER</strong>
      <span className="roster-v4__subtitle">{context.teamName} · {context.competitionLabel ?? 'Competición sin asignar'} · {context.seasonLabel ?? 'Temporada sin asignar'}</span>
    </div>
    <div className="roster-v4__tabs">
      <WorkspaceTabs ariaLabel="Secciones de plantilla" tabs={TABS}
        activeTabId={activeTab} onTabSelect={id=>onTabChange?.(id as RosterWorkspaceSessionState['tab'])}/>
    </div>
  </header>
}
