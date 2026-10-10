import { HOME_DASHBOARD_DEFAULT_SLOTS, HOME_DASHBOARD_MODULE_IDS, type HomeDashboardModuleId } from './homeDashboardModules'

export const HOME_SIZE_IDS = ['compact','normal','large'] as const
export type HomeCardSize = (typeof HOME_SIZE_IDS)[number]
export type HomeCardKey = 'fixture'|'dynamics'|'upcoming'|'slot0'|'slot1'|'slot2'|'slot3'
export const HOME_CARD_KEYS: readonly HomeCardKey[] = ['fixture','dynamics','upcoming','slot0','slot1','slot2','slot3']
export interface HomeLayoutSettings {
  readonly modules: readonly HomeDashboardModuleId[]
  readonly sizes: Readonly<Record<HomeCardKey,HomeCardSize>>
}
const DEFAULT_SIZES:Record<HomeCardKey,HomeCardSize> = {
  fixture:'normal',dynamics:'normal',upcoming:'normal',
  slot0:'large',slot1:'normal',slot2:'normal',slot3:'normal',
}
export const DEFAULT_HOME_LAYOUT:HomeLayoutSettings = {
  modules:[...HOME_DASHBOARD_DEFAULT_SLOTS],sizes:{...DEFAULT_SIZES},
}
export function readHomeLayout(teamId?:string):HomeLayoutSettings {
  try{
    const raw=window.localStorage.getItem('bdm-courtside-home-layout-v1-'+(teamId??'no-team'))
    if(!raw)return DEFAULT_HOME_LAYOUT
    const candidate:unknown=JSON.parse(raw)
    if(!candidate||typeof candidate!=='object')return DEFAULT_HOME_LAYOUT
    const data=candidate as {modules?:unknown;sizes?:unknown}
    const modules=Array.isArray(data.modules)&&data.modules.length===4&&data.modules.every(m=>HOME_DASHBOARD_MODULE_IDS.includes(m as HomeDashboardModuleId))
      ? data.modules as HomeDashboardModuleId[]:[...HOME_DASHBOARD_DEFAULT_SLOTS]
    const sizes=data.sizes&&typeof data.sizes==='object'?data.sizes as Record<string,unknown>:{}
    return {modules,sizes:Object.fromEntries(HOME_CARD_KEYS.map(key=>[key,
      HOME_SIZE_IDS.includes(sizes[key] as HomeCardSize)?sizes[key]:DEFAULT_SIZES[key]])) as Record<HomeCardKey,HomeCardSize>}
  }catch{return DEFAULT_HOME_LAYOUT}
}
export function saveHomeLayout(teamId:string|undefined,settings:HomeLayoutSettings) {
  try{window.localStorage.setItem('bdm-courtside-home-layout-v1-'+(teamId??'no-team'),JSON.stringify(settings))}
  catch{ /* still works when storage is disabled */ }
}
