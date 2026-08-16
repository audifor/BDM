import { transitionInboxItem, type InboxItem } from '@/domain/inbox'
import { updateGameWorld, type GameWorld } from './GameWorld'
export function addInboxItem(world:GameWorld,item:InboxItem):GameWorld{return world.inboxItemsById[item.id]!==undefined?world:rebuild(world,{inbox:{...world.inboxItemsById,[item.id]:item}})}
export function markInboxItemRead(world:GameWorld,id:string):GameWorld{const item=world.inboxItemsById[id];return item===undefined?world:rebuild(world,{inbox:{...world.inboxItemsById,[id]:transitionInboxItem(item,'read')}})}
export function archiveInboxItem(world:GameWorld,id:string):GameWorld{const item=world.inboxItemsById[id];return item===undefined?world:rebuild(world,{inbox:{...world.inboxItemsById,[id]:transitionInboxItem(item,'archived')}})}
export function addNewsItem(world:GameWorld,item:import('@/domain/inbox').NewsItem):GameWorld{return world.newsItemsById[item.id]!==undefined?world:rebuild(world,{news:{...world.newsItemsById,[item.id]:item}})}
function rebuild(world:GameWorld,changes:Partial<{inbox:typeof world.inboxItemsById;news:typeof world.newsItemsById}>):GameWorld{return updateGameWorld(world,{inboxItemsById:changes.inbox??world.inboxItemsById,newsItemsById:changes.news??world.newsItemsById})}
