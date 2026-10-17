import { createPersonality, type PersonalityDimension } from '@/domain/personality'
import { relationshipKey } from '@/domain/relationships'
import { applyRelationshipEventsToWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import type { DirectedRelationshipEvent } from '@/domain/world/RelationshipEvents'
import type { PlayerId } from '@/domain/ids'

const MS_DAY = 86400000
/** Monthly checkpoint; idempotent through factual RelationshipProfile.events in Save V4. */
export function progressTrainingMentoring(world: GameWorld): GameWorld {
 const current=world.currentDate
 if(new Date(current+'T12:00:00Z').getUTCDay()!==1)return world
 const changes:DirectedRelationshipEvent[]=[]
 const personalities={...world.personalitiesByPersonId}
 let modified=false
 for(const plan of Object.values(world.trainingStudioPlansByTeamId)){
  const team=world.teams[plan.teamId as keyof typeof world.teams]
  if(!team)continue
  const roster=new Set<string>(team.rosterPlayerIds)
  for(const group of plan.mentoringGroups){
   if(!roster.has(group.mentorId))continue
   const elapsedDays=Math.floor((Date.parse(current+'T12:00:00Z')-Date.parse(group.createdDate+'T12:00:00Z'))/MS_DAY)
   const elapsedWeeks=Math.floor(elapsedDays/7)
   if(elapsedWeeks<4 || elapsedWeeks%4!==0)continue
   const mentor=personalities[group.mentorId]
   if(!mentor)continue
   for(const menteeId of group.menteeIds){
    if(!roster.has(menteeId))continue
    const mentee=personalities[menteeId]
    if(!mentee)continue
    const eventId='training-mentoring:'+group.id+':'+current+':'+menteeId
    const key=relationshipKey(menteeId,group.mentorId)
    if(world.relationshipsByKey[key]?.events.some(e=>e.id===eventId))continue
    const conflict=mentor.values.temperament<25&&mentee.values.temperament<25
    const change=conflict?-1:1
    const context={mentoringGroupId:group.id,focus:group.focus}
    changes.push({
      sourceId:menteeId,targetId:group.mentorId,
      event:{id:eventId,gameDate:world.currentDate,source:'professionalInteraction',delta:change,context,
        dimensionDeltas:{professionalRespect:change,communicationQuality:change,perceivedSupport:change}}
    })
    changes.push({
      sourceId:group.mentorId,targetId:menteeId,
      event:{id:eventId+':reverse',gameDate:world.currentDate,source:'professionalInteraction',delta:change,context,
        dimensionDeltas:{professionalRespect:change,collaboration:change}}
    })
    const dimension=focusDimension(group.focus)
    if(!conflict && dimension){
      const mentorScore=mentor.values[dimension],menteeScore=mentee.values[dimension]
      // At most one point every four weeks; mentoring cannot push someone beyond their mentor.
      if(mentorScore>=menteeScore+12 && menteeScore<100){
       personalities[menteeId]=createPersonality({values:{...mentee.values,[dimension]:menteeScore+1}})
       modified=true
      }
    }
   }
  }
 }
 if(!changes.length)return world
 let next=applyRelationshipEventsToWorld(world,changes)
 if(modified)next=updateGameWorld(next,{personalitiesByPersonId:personalities})
 return next
}
function focusDimension(focus:string):PersonalityDimension|null {
 switch(focus){
  case 'Profesionalidad':case 'Hábitos de entrenamiento':return 'professionalism'
  case 'Liderazgo':case 'Cultura de equipo':return 'teamOrientation'
  case 'Resiliencia':return 'resilience'
  case 'Comunicación':return 'adaptability'
  default:return null
 }
}
