// @vitest-environment jsdom
import { describe,expect,it } from 'vitest'
import {
  type TaskbarInstance,
  closeTaskbarAppInstances,
  closeTaskbarInstance,
  rememberTaskbarInstance,
  taskbarInstanceFromUrl,
  withTaskbarDefaultEntity,
} from './taskbarInstances'

const route = (app: string, field: string, value: string, view?: string) =>
  taskbarInstanceFromUrl(new URL('/?ui=ng&app='+app+'&'+field+'='+encodeURIComponent(value)+(view?'&'+view:''),'https://example.test'))!

describe('grouped taskbar instance identity',()=>{
  it('holds multiple players under one app while preserving each subview',()=>{
    const a=route('player','playerId','player:a','playerView=development')
    const b=route('player','playerId','player:b','playerView=performance')
    const updated=route('player','playerId','player:a','playerView=history')
    const instances=rememberTaskbarInstance(rememberTaskbarInstance([],a),b)
    expect(instances.map(x=>x.key)).toEqual([a.key,b.key])
    expect(rememberTaskbarInstance(instances,updated)).toEqual([updated,b])
    expect(closeTaskbarInstance(instances,a.key)).toEqual([b])
  })
  it('works across staff, clubs, rosters and competitions, without cross-group closure',()=>{
    const cases=[
      route('staff','staffId','staff:a'),route('staff','staffId','staff:b'),
      route('club','teamId','team:a'),route('club','teamId','team:b'),
      route('roster','teamId','team:a'),route('roster','teamId','team:b'),
      route('competition','competitionId','competition:a'),route('competition','competitionId','competition:b'),
    ]
    const instances=cases.reduce<readonly TaskbarInstance[]>((all, item) => rememberTaskbarInstance(all, item), [])
    expect(instances).toHaveLength(8)
    expect(closeTaskbarAppInstances(instances,'staff')).toHaveLength(6)
    expect(closeTaskbarAppInstances(instances,'club').filter(x=>x.app==='roster')).toHaveLength(2)
  })
  it('does not create fake tabs from unrelated carried entity parameters',()=>{
    const first=route('training','playerId','player:a')
    const second=route('training','playerId','player:b')
    expect(first.key).toBe(second.key)
    expect(rememberTaskbarInstance([first],second)).toHaveLength(1)
    expect(taskbarInstanceFromUrl(new URL('https://example.test/?app=home'))).toBeNull()
  })
  it('keeps contextual recruiting and contracts separate when changing entities',()=>{
    expect(route('contracts','playerId','player:a').key).not.toBe(route('contracts','playerId','player:b').key)
    expect(route('recruiting','focusPlayerId','player:a').key).not.toBe(route('recruiting','focusPlayerId','player:b').key)
  })
  it('labels first opened implicit player and team as actual entities rather than generic shell',()=>{
    const implicit=new URL('https://example.test/?ui=ng&app=player')
    const normalized=withTaskbarDefaultEntity(implicit,{playerId:'player:chosen',teamId:'team:home'})
    expect(implicit.searchParams.get('playerId')).toBeNull()
    expect(normalized.searchParams.get('playerId')).toBe('player:chosen')
    const first=taskbarInstanceFromUrl(normalized)!
    expect(first.entityId).toBe('player:chosen')
    expect(first.key).not.toBe('player')
    for(const app of ['roster','club','staff']){
      const url=withTaskbarDefaultEntity(new URL('https://example.test/?app='+app),{teamId:'team:home'})
      expect(taskbarInstanceFromUrl(url)?.entityId).toBe('team:home')
    }
  })
  it('replaces an anonymous app slot with a chosen dossier, never duplicates it',()=>{
    const generic=taskbarInstanceFromUrl(new URL('https://example.test/?app=player'))!
    const chosen=route('player','playerId','player:a')
    expect(rememberTaskbarInstance([generic],chosen)).toEqual([chosen])
    expect(rememberTaskbarInstance([chosen],generic)).toEqual([chosen])
  })

})
