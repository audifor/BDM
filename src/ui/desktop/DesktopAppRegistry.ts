import draftIcon from '@/ui/assets/dock-icons-v3/draft.png'
import financesIcon from '@/ui/assets/dock-icons-v3/finances.png'
import homeIcon from '@/ui/assets/dock-icons-v3/home.png'
import inboxIcon from '@/ui/assets/dock-icons-v3/inbox.png'
import leagueIcon from '@/ui/assets/dock-icons-v3/league.png'
import newsIcon from '@/ui/assets/dock-icons-v3/news.png'
import rosterIcon from '@/ui/assets/dock-icons-v3/roster.png'
import scheduleIcon from '@/ui/assets/dock-icons-v3/schedule.png'
import scoutingIcon from '@/ui/assets/dock-icons-v3/scouting.png'
import settingsIcon from '@/ui/assets/dock-icons-v3/settings.png'
import tacticsIcon from '@/ui/assets/dock-icons-v3/tactics.png'
import teamIcon from '@/ui/assets/dock-icons-v3/team.png'
import tradeCenterIcon from '@/ui/assets/dock-icons-v3/trade-center.png'
import trainingIcon from '@/ui/assets/dock-icons-v3/training.png'

export const DOCK_APP_ICON_REGISTRY = { home: homeIcon, team: teamIcon, roster: rosterIcon, tactics: tacticsIcon, schedule: scheduleIcon, scouting: scoutingIcon, league: leagueIcon, finances: financesIcon, training: trainingIcon, inbox: inboxIcon, news: newsIcon, draft: draftIcon, 'trade-center': tradeCenterIcon, settings: settingsIcon } as const

export type DesktopSection = 'coach' | 'board' | 'tactics' | 'training' | 'squad' | 'staff' | 'schedule' | 'standings' | 'market' | 'draft' | 'finances' | 'coach-finances' | 'memories' | 'narratives' | 'media' | 'trades' | 'recruiting' | 'nil' | 'boosters' | 'enforcement'
export type DesktopIcon = keyof typeof DOCK_APP_ICON_REGISTRY
export type LauncherCapability = 'hasDraft' | 'hasTrades'
export interface DesktopAppDefinition { readonly id: string; readonly label: string; readonly icon: DesktopIcon; readonly section?: DesktopSection; readonly defaultPinned: boolean; readonly availability: 'available' | 'future'; readonly launcherOrder: number; readonly launcherVisible?: boolean; readonly requiredCapability?: LauncherCapability; readonly singleton?: boolean; readonly window?: { readonly width: number; readonly height: number; readonly minWidth: number; readonly minHeight: number }; readonly renderKey?: 'entity' | 'board' | 'squad' | 'schedule' | 'standings' | 'training' | 'staff' | 'coach' | 'tactics' | 'market' | 'draft' | 'finances' | 'coach-finances' | 'memories' | 'narratives' | 'media' | 'trades' | 'recruiting' | 'nil' | 'boosters' | 'enforcement' | 'match' | 'settings' }
const app = (definition: DesktopAppDefinition) => definition
export const DESKTOP_APPS: readonly DesktopAppDefinition[] = [
  app({ id: 'bdm', label: 'BDM Launcher', icon: 'home', defaultPinned: true, availability: 'available', launcherOrder: 0 }),
  app({ id: 'legacy', label: 'Legacy', icon: 'team', section: 'coach', defaultPinned: false, availability: 'available', launcherOrder: 56, singleton: true, window: { width: 900, height: 680, minWidth: 600, minHeight: 420 }, renderKey: 'coach' }),
  app({ id: 'entity', label: 'Entity page', icon: 'roster', defaultPinned: false, availability: 'available', launcherVisible: false, launcherOrder: 1, window: { width: 1060, height: 740, minWidth: 460, minHeight: 420 }, renderKey: 'entity' }),
  app({ id: 'club', label: 'Club', icon: 'team', section: 'coach', defaultPinned: false, availability: 'available', launcherOrder: 55, singleton: true, window: { width: 1060, height: 740, minWidth: 680, minHeight: 460 } }),
  app({ id: 'squad', label: 'Plantilla', icon: 'roster', section: 'squad', defaultPinned: true, availability: 'available', launcherOrder: 10, singleton: true, window: { width: 980, height: 700, minWidth: 620, minHeight: 440 }, renderKey: 'squad' }),
  app({ id: 'schedule', label: 'Calendario', icon: 'schedule', section: 'schedule', defaultPinned: true, availability: 'available', launcherOrder: 20, singleton: true, window: { width: 760, height: 620, minWidth: 520, minHeight: 400 }, renderKey: 'schedule' }),
  app({ id: 'standings', label: 'Liga', icon: 'league', section: 'standings', defaultPinned: true, availability: 'available', launcherOrder: 30, singleton: true, window: { width: 900, height: 680, minWidth: 600, minHeight: 440 }, renderKey: 'standings' }),
  app({ id: 'training', label: 'Entrenamiento', icon: 'training', section: 'training', defaultPinned: true, availability: 'available', launcherOrder: 40, singleton: true, window: { width: 920, height: 680, minWidth: 560, minHeight: 440 }, renderKey: 'training' }),
  app({ id: 'staff', label: 'Staff', icon: 'team', section: 'staff', defaultPinned: true, availability: 'available', launcherOrder: 50, singleton: true, window: { width: 1020, height: 720, minWidth: 680, minHeight: 480 }, renderKey: 'staff' }),
  app({ id: 'coach', label: 'Tu Club', icon: 'team', section: 'coach', defaultPinned: false, availability: 'available', launcherOrder: 60, singleton: true, window: { width: 920, height: 700, minWidth: 600, minHeight: 460 }, renderKey: 'coach' }),
  app({ id: 'board', label: 'Directiva', icon: 'team', section: 'board', defaultPinned: false, availability: 'available', launcherOrder: 61, singleton: true, window: { width: 760, height: 620, minWidth: 520, minHeight: 400 }, renderKey: 'board' }),
  app({ id: 'tactics', label: 'Tácticas', icon: 'tactics', section: 'tactics', defaultPinned: true, availability: 'available', launcherOrder: 70, singleton: true, window: { width: 900, height: 660, minWidth: 600, minHeight: 420 }, renderKey: 'tactics' }),
  app({ id: 'competition', label: 'Competición', icon: 'league', defaultPinned: false, availability: 'available', launcherOrder: 71, singleton: true, window: { width: 1320, height: 800, minWidth: 900, minHeight: 560 }, renderKey: 'standings' }),
  app({ id: 'medical', label: 'Medical', icon: 'team', defaultPinned: false, availability: 'available', launcherOrder: 72, singleton: true, window: { width: 1320, height: 800, minWidth: 900, minHeight: 560 }, renderKey: 'staff' }),
  app({ id: 'market', label: 'Mercado', icon: 'scouting', section: 'market', defaultPinned: false, availability: 'available', launcherOrder: 80, singleton: true, window: { width: 1040, height: 700, minWidth: 680, minHeight: 460 }, renderKey: 'market' }),
  app({ id: 'draft', label: 'Draft', icon: 'draft', section: 'draft', defaultPinned: false, availability: 'available', launcherOrder: 90, requiredCapability: 'hasDraft', singleton: true, window: { width: 1040, height: 700, minWidth: 680, minHeight: 460 }, renderKey: 'draft' }),
  app({ id: 'trades', label: 'Trades', icon: 'trade-center', section: 'trades', defaultPinned: false, availability: 'available', launcherOrder: 100, requiredCapability: 'hasTrades', singleton: true, window: { width: 1040, height: 700, minWidth: 680, minHeight: 460 }, renderKey: 'trades' }),
  app({ id: 'recruiting', label: 'Recruiting', icon: 'settings', section: 'recruiting', defaultPinned: false, availability: 'available', launcherOrder: 105, singleton: true, window: { width: 1040, height: 700, minWidth: 680, minHeight: 460 }, renderKey: 'recruiting' }),
  app({ id: 'nil', label: 'NIL', icon: 'settings', section: 'nil', defaultPinned: false, availability: 'available', launcherOrder: 106, singleton: true, window: { width: 920, height: 640, minWidth: 600, minHeight: 420 }, renderKey: 'nil' }),
  app({ id: 'boosters', label: 'Boosters', icon: 'finances', section: 'boosters', defaultPinned: false, availability: 'available', launcherOrder: 107, singleton: true, window: { width: 920, height: 640, minWidth: 600, minHeight: 420 }, renderKey: 'boosters' }),
  app({ id: 'enforcement', label: 'Compliance', icon: 'settings', section: 'enforcement', defaultPinned: false, availability: 'available', launcherOrder: 108, singleton: true, window: { width: 920, height: 640, minWidth: 600, minHeight: 420 }, renderKey: 'enforcement' }),
  app({ id: 'inbox', label: 'Inbox', icon: 'inbox', defaultPinned: false, availability: 'future', launcherOrder: 110 }),
  app({ id: 'match', label: 'Centro de Partido', icon: 'tactics', defaultPinned: false, availability: 'available', launcherOrder: 120, singleton: true, window: { width: 680, height: 520, minWidth: 480, minHeight: 360 }, renderKey: 'match' }),
  app({ id: 'scouting', label: 'Scouting', icon: 'scouting', defaultPinned: false, availability: 'future', launcherOrder: 130 }),
  app({ id: 'finances', label: 'Finanzas', icon: 'settings', section: 'finances', defaultPinned: false, availability: 'available', launcherOrder: 140, singleton: true, window: { width: 900, height: 680, minWidth: 600, minHeight: 440 }, renderKey: 'finances' }),
  app({ id: 'coach-finances', label: 'Tu patrimonio', icon: 'settings', section: 'coach-finances', defaultPinned: false, availability: 'available', launcherOrder: 141, singleton: true, window: { width: 800, height: 650, minWidth: 560, minHeight: 440 }, renderKey: 'coach-finances' }),
  app({ id: 'memories', label: 'Recuerdos', icon: 'news', section: 'memories', defaultPinned: false, availability: 'available', launcherOrder: 142, singleton: true, window: { width: 760, height: 620, minWidth: 520, minHeight: 400 }, renderKey: 'memories' }),
  app({ id: 'narratives', label: 'Historias', icon: 'news', section: 'narratives', defaultPinned: false, availability: 'available', launcherOrder: 143, singleton: true, window: { width: 760, height: 620, minWidth: 520, minHeight: 400 }, renderKey: 'narratives' }),
  app({ id: 'media', label: 'Prensa', icon: 'news', section: 'media', defaultPinned: false, availability: 'available', launcherOrder: 144, singleton: true, window: { width: 760, height: 620, minWidth: 520, minHeight: 400 }, renderKey: 'media' }),
  app({ id: 'development', label: 'Desarrollo', icon: 'training', defaultPinned: false, availability: 'future', launcherOrder: 150 }),
  app({ id: 'settings', label: 'Ajustes', icon: 'settings', defaultPinned: false, availability: 'available', launcherOrder: 160, singleton: true, window: { width: 680, height: 500, minWidth: 500, minHeight: 360 }, renderKey: 'settings' }),
]
export const DEFAULT_PINNED_APP_IDS = DESKTOP_APPS.filter((app) => app.defaultPinned).map((app) => app.id)
export function getDesktopApp(id: string) { return DESKTOP_APPS.find((app) => app.id === id) }
export function getDesktopAppForSection(section: DesktopSection) { return DESKTOP_APPS.find((app) => app.section === section) }
export function resolveLauncherOrder(savedOrder: readonly string[]): readonly string[] { const ids = DESKTOP_APPS.filter((app) => app.id !== 'bdm' && app.launcherVisible !== false).sort((a, b) => a.launcherOrder - b.launcherOrder).map((app) => app.id); return [...savedOrder.filter((id) => ids.includes(id)), ...ids.filter((id) => !savedOrder.includes(id))] }
export function reorderLauncherApps(order: readonly string[], movedId: string, targetId: string): readonly string[] { if (movedId === targetId || !order.includes(movedId) || !order.includes(targetId)) return order; const rest = order.filter((id) => id !== movedId); const at = rest.indexOf(targetId); return [...rest.slice(0, at), movedId, ...rest.slice(at)] }
export function getLauncherApps(query: string, capabilities: Partial<Record<LauncherCapability, boolean>> = {}, savedOrder: readonly string[] = []) { const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim(); const queryText = normalize(query); return resolveLauncherOrder(savedOrder).map(getDesktopApp).filter((item): item is DesktopAppDefinition => item !== undefined && item.launcherVisible !== false && item.availability === 'available' && (item.requiredCapability === undefined || capabilities[item.requiredCapability] === true) && (queryText === '' || normalize(item.label).includes(queryText))) }
