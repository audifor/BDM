export type DesktopSection = 'coach' | 'tactics' | 'training' | 'squad' | 'staff' | 'schedule' | 'standings' | 'market' | 'draft'
export type DesktopIcon = 'bdm' | 'squad' | 'calendar' | 'league' | 'training' | 'staff' | 'inbox' | 'match' | 'club' | 'tactics' | 'market' | 'draft' | 'settings'

export interface DesktopAppDefinition {
  readonly id: string
  readonly label: string
  readonly icon: DesktopIcon
  readonly section?: DesktopSection
  readonly defaultPinned: boolean
  readonly availability: 'available' | 'future'
  readonly singleton?: boolean
  readonly window?: { readonly width: number; readonly height: number; readonly minWidth: number; readonly minHeight: number }
  readonly renderKey?: 'squad' | 'schedule' | 'standings' | 'training' | 'staff' | 'coach' | 'tactics' | 'market' | 'draft' | 'match'
}

export const DESKTOP_APPS: readonly DesktopAppDefinition[] = [
  { id: 'bdm', label: 'BDM Launcher', icon: 'bdm', defaultPinned: true, availability: 'available' },
  { id: 'squad', label: 'Plantilla', icon: 'squad', section: 'squad', defaultPinned: true, availability: 'available', singleton: true, window: { width: 980, height: 700, minWidth: 620, minHeight: 440 }, renderKey: 'squad' },
  { id: 'schedule', label: 'Calendario', icon: 'calendar', section: 'schedule', defaultPinned: true, availability: 'available', singleton: true, window: { width: 760, height: 620, minWidth: 520, minHeight: 400 }, renderKey: 'schedule' },
  { id: 'standings', label: 'Liga', icon: 'league', section: 'standings', defaultPinned: true, availability: 'available', singleton: true, window: { width: 900, height: 680, minWidth: 600, minHeight: 440 }, renderKey: 'standings' },
  { id: 'training', label: 'Entrenamiento', icon: 'training', section: 'training', defaultPinned: true, availability: 'available', singleton: true, window: { width: 920, height: 680, minWidth: 560, minHeight: 440 }, renderKey: 'training' },
  { id: 'staff', label: 'Staff', icon: 'staff', section: 'staff', defaultPinned: true, availability: 'available', singleton: true, window: { width: 1020, height: 720, minWidth: 680, minHeight: 480 }, renderKey: 'staff' },
  { id: 'coach', label: 'Tu Club', icon: 'club', section: 'coach', defaultPinned: false, availability: 'available', singleton: true, window: { width: 920, height: 700, minWidth: 600, minHeight: 460 }, renderKey: 'coach' },
  { id: 'tactics', label: 'Tácticas', icon: 'tactics', section: 'tactics', defaultPinned: false, availability: 'available', singleton: true, window: { width: 900, height: 660, minWidth: 600, minHeight: 420 }, renderKey: 'tactics' },
  { id: 'market', label: 'Mercado', icon: 'market', section: 'market', defaultPinned: false, availability: 'available', singleton: true, window: { width: 1040, height: 700, minWidth: 680, minHeight: 460 }, renderKey: 'market' },
  { id: 'draft', label: 'Draft', icon: 'draft', section: 'draft', defaultPinned: false, availability: 'available', singleton: true, window: { width: 1040, height: 700, minWidth: 680, minHeight: 460 }, renderKey: 'draft' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', defaultPinned: false, availability: 'future' },
  { id: 'match', label: 'Centro de Partido', icon: 'match', defaultPinned: false, availability: 'available', singleton: true, window: { width: 680, height: 520, minWidth: 480, minHeight: 360 }, renderKey: 'match' },
  { id: 'scouting', label: 'Scouting', icon: 'settings', defaultPinned: false, availability: 'future' },
  { id: 'finances', label: 'Finanzas', icon: 'settings', defaultPinned: false, availability: 'future' },
  { id: 'development', label: 'Desarrollo', icon: 'settings', defaultPinned: false, availability: 'future' },
  { id: 'settings', label: 'Ajustes', icon: 'settings', defaultPinned: false, availability: 'future' },
]

export const DEFAULT_PINNED_APP_IDS = DESKTOP_APPS.filter((app) => app.defaultPinned).map((app) => app.id)

export function getDesktopApp(id: string) { return DESKTOP_APPS.find((app) => app.id === id) }
export function getDesktopAppForSection(section: DesktopSection) { return DESKTOP_APPS.find((app) => app.section === section) }
export function getLauncherApps(query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return DESKTOP_APPS.filter((app) => app.id !== 'bdm' && (normalizedQuery === '' || app.label.toLocaleLowerCase().includes(normalizedQuery)))
}
