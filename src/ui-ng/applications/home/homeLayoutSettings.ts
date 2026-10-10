import { HOME_DASHBOARD_DEFAULT_SLOTS, HOME_DASHBOARD_MODULE_IDS, type HomeDashboardModuleId } from './homeDashboardModules'

/** Content choices only. Classification stays fixed in the tall left panel. */
export type HomeSelectableModuleId = Exclude<HomeDashboardModuleId,'standings'> | 'fixture'
export const HOME_SELECTABLE_IDS:readonly HomeSelectableModuleId[] = ['fixture',...HOME_DASHBOARD_MODULE_IDS.filter(id=>id!=='standings')] as HomeSelectableModuleId[]
export const HOME_DEFAULT_CONTENT = {
  fixture:'fixture', dynamics:'dynamics', upcoming:'upcoming',
} as const satisfies Record<string,HomeSelectableModuleId>
export interface HomeLayoutSettings {
  readonly fixture:HomeSelectableModuleId
  readonly dynamics:HomeSelectableModuleId
  readonly upcoming:HomeSelectableModuleId
  readonly slots:readonly [HomeSelectableModuleId,HomeSelectableModuleId,HomeSelectableModuleId]
}
export const DEFAULT_HOME_LAYOUT:HomeLayoutSettings = {
  ...HOME_DEFAULT_CONTENT,
  slots:[HOME_DASHBOARD_DEFAULT_SLOTS[1] as HomeSelectableModuleId,
    HOME_DASHBOARD_DEFAULT_SLOTS[2] as HomeSelectableModuleId,
    HOME_DASHBOARD_DEFAULT_SLOTS[3] as HomeSelectableModuleId],
}
export function isSelectable(value:unknown):value is HomeSelectableModuleId {
  return typeof value==='string'&&HOME_SELECTABLE_IDS.includes(value as HomeSelectableModuleId)
}
export function readHomeLayout(teamId?:string):HomeLayoutSettings {
  try{
    const raw=window.localStorage.getItem('bdm-courtside-home-layout-v2-'+(teamId??'no-team'))
    if(!raw)return DEFAULT_HOME_LAYOUT
    const obj:unknown=JSON.parse(raw)
    if(!obj||typeof obj!=='object')return DEFAULT_HOME_LAYOUT
    const value=obj as Record<string,unknown>
    return {
      fixture:isSelectable(value.fixture)?value.fixture:'fixture',
      dynamics:isSelectable(value.dynamics)?value.dynamics:'dynamics',
      upcoming:isSelectable(value.upcoming)?value.upcoming:'upcoming',
      slots:Array.isArray(value.slots)&&value.slots.length===3
        ? [0,1,2].map(i=>isSelectable(value.slots[i])?value.slots[i]:DEFAULT_HOME_LAYOUT.slots[i]!) as unknown as HomeLayoutSettings['slots']
        : DEFAULT_HOME_LAYOUT.slots,
    }
  }catch{return DEFAULT_HOME_LAYOUT}
}
export function saveHomeLayout(teamId:string|undefined,settings:HomeLayoutSettings) {
  try{window.localStorage.setItem('bdm-courtside-home-layout-v2-'+(teamId??'no-team'),JSON.stringify(settings))}
  catch{ /* in-session editing still works if local storage is blocked */ }
}
