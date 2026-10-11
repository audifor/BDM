import { buildRosterWorkspaceContext } from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'
import type { RosterWorkspaceSessionState } from '@/ui-ng/applications/roster/rosterWorkspaceSession'

const TABS: readonly { id: RosterWorkspaceSessionState['tab']; name: string }[] = [
  {id:'plantilla',name:'PLANTILLA'},
  {id:'profundidad',name:'PROFUNDIDAD'},
  {id:'briefing',name:'BRIEFING'},
  {id:'planificar',name:'PLANIFICAR'},
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
    <nav className="roster-v4__tabs" aria-label="Secciones de plantilla">
      {TABS.map(tab=><button type="button" key={tab.id} className={tab.id===activeTab?'is-active':''}
        aria-current={tab.id===activeTab?'page':undefined} onClick={()=>onTabChange?.(tab.id)}>{tab.name}</button>)}
    </nav>
  </header>
}
