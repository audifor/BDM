import type { GameCapabilities } from '@/ui/gameContext'
import { WORKSPACE_TASKBAR_APPS, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

export const UNAVAILABLE_SECTION_MESSAGE = 'Esta sección no aplica'

const INAPPLICABLE_CAPABILITIES: GameCapabilities = {
  hasDraft: false,
  hasTrades: false,
  hasSalaryCap: false,
  isNcaa: false,
}

export const START_MENU_REQUIRED_CAPABILITY: Partial<Record<WorkspaceAppId, keyof GameCapabilities>> = {
  draft: 'hasDraft',
  trades: 'hasTrades',
  recruiting: 'isNcaa',
  nil: 'isNcaa',
  boosters: 'isNcaa',
}

export function isWorkspaceApplicable(id: WorkspaceAppId, capabilities: GameCapabilities): boolean {
  const required = START_MENU_REQUIRED_CAPABILITY[id]
  return required === undefined || capabilities[required]
}

export interface StartMenuGroup {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly appIds: readonly WorkspaceAppId[]
}

export const START_MENU_RAIL_APPS: readonly WorkspaceAppId[] = [
  'home',
  'roster',
  'player',
  'staff',
  'schedule',
  'match',
  'market',
  'scouting',
  'tactics',
  'training',
  'mentoring',
  'medical',
  'coach',
  'recruiting',
]

export const START_MENU_GROUPS: readonly StartMenuGroup[] = [
  {
    id: 'equipo',
    label: 'Equipo',
    description: 'Plantilla, jugador, staff, scouting, tácticas, entrenamiento, mentoring y medical',
    appIds: ['roster', 'player', 'staff', 'scouting', 'tactics', 'training', 'mentoring', 'medical'],
  },
  {
    id: 'partidos',
    label: 'Partidos y competición',
    description: 'Calendario, clasificación y centro de partido',
    appIds: ['schedule', 'competition', 'match'],
  },
  {
    id: 'mercado',
    label: 'Mercado',
    description: 'Agentes libres, draft y trades',
    appIds: ['market', 'draft', 'trades'],
  },
  {
    id: 'club',
    label: 'Gestión del club',
    description: 'Club, directiva, finanzas y compliance',
    appIds: ['club', 'board', 'finances', 'enforcement'],
  },
  {
    id: 'carrera',
    label: 'Mi carrera',
    description: 'Perfil del entrenador y patrimonio',
    appIds: ['coach', 'coach-finances'],
  },
  {
    id: 'mundo',
    label: 'Mundo y narrativa',
    description: 'Prensa, recuerdos e historias',
    appIds: ['media', 'memories', 'narratives'],
  },
  {
    id: 'college',
    label: 'College Performance Center',
    description: 'Recruiting, NIL y boosters',
    appIds: ['recruiting', 'nil', 'boosters'],
  },
]

export function startMenuAppLabel(id: WorkspaceAppId): string {
  return WORKSPACE_TASKBAR_APPS.find((entry) => entry.id === id)?.label ?? id
}

export function allStartMenuApps(): readonly WorkspaceAppId[] {
  const ids = new Set<WorkspaceAppId>(START_MENU_RAIL_APPS)
  for (const group of START_MENU_GROUPS) {
    for (const id of group.appIds) ids.add(id)
  }
  return [...ids]
}

export function filterStartMenuApps(
  query: string,
  capabilities: GameCapabilities = INAPPLICABLE_CAPABILITIES,
): readonly WorkspaceAppId[] {
  const catalog = allStartMenuApps().filter((id) => isWorkspaceApplicable(id, capabilities))
  const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
  if (normalized === '') {
    return catalog
  }
  return catalog.filter((id) => {
    const label = startMenuAppLabel(id)
    return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().includes(normalized)
  })
}

export function visibleStartMenuGroups(
  capabilities: GameCapabilities = INAPPLICABLE_CAPABILITIES,
): readonly StartMenuGroup[] {
  const visible = new Set(filterStartMenuApps('', capabilities))
  return START_MENU_GROUPS.filter((group) => group.appIds.some((id) => visible.has(id))).map((group) => ({
    ...group,
    appIds: group.appIds.filter((id) => visible.has(id)),
  }))
}
