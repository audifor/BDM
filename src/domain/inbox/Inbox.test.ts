import { createGameDate } from '@/domain/date'
import { createInboxItem, transitionInboxItem } from './Inbox'
import { describe, expect, it } from 'vitest'
describe('Inbox',()=>{const item=createInboxItem({id:'inbox:1',coachId:'coach',gameDate:createGameDate(2032,10,1),category:'career',priority:'high',title:'Offer',body:'Body',status:'unread',action:{type:'coachJobOffer',entityId:'offer'},context:{offerId:'offer'}});it('uses typed actionable items and valid immutable transitions',()=>{const read=transitionInboxItem(item,'read');expect(item.status).toBe('unread');expect(read.status).toBe('read');expect(transitionInboxItem(read,'archived').status).toBe('archived');expect(read.action).toEqual({type:'coachJobOffer',entityId:'offer'})})})
