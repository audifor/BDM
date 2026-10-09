import { academicRisk, academicStanding, defaultAcademicRules, type AcademicProfile, type AcademicSupportLevel } from '@/domain/academic'
import { resolveCollegeRuleset } from '@/engine/eligibility/EligibilityEngine'
import { createGameDate } from '@/domain/date'
import type { EcosystemId, PlayerId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'

export function initializeAcademicProfile(world:GameWorld, playerId:PlayerId, teamId:TeamId, ecosystemId:EcosystemId):GameWorld { if(world.ecosystems[ecosystemId]?.kind!=='ncaaLike'||Object.values(world.academicProfilesById).some(p=>p.playerId===playerId&&p.programTeamId===teamId&&p.ecosystemId===ecosystemId))return world; const seed=[...playerId].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0), profile:AcademicProfile={id:`academic:${ecosystemId}:${teamId}:${playerId}`,playerId,ecosystemId,programTeamId:teamId,performance:Math.min(90,Math.max(45,62+seed%25)),progress:Math.min(90,Math.max(45,60+(seed>>>8)%25))};return updateGameWorld(world,{academicRulesByEcosystemId:{...world.academicRulesByEcosystemId,[ecosystemId]:world.academicRulesByEcosystemId[ecosystemId]??defaultAcademicRules(ecosystemId)},academicProfiles:[...Object.values(world.academicProfilesById),profile]}) }
export function ensureNcaaAcademics(world:GameWorld):GameWorld{let next=world;for(const competition of Object.values(world.competitions))if(world.ecosystems[competition.ecosystemId]?.kind==='ncaaLike')for(const teamId of competition.participantTeamIds)for(const playerId of next.teams[teamId]!.rosterPlayerIds)next=initializeAcademicProfile(next,playerId,teamId,competition.ecosystemId);return next}
function currentAcademicRules(world: GameWorld, profile: AcademicProfile) {
  const rules = world.academicRulesByEcosystemId[profile.ecosystemId] ?? defaultAcademicRules(profile.ecosystemId)
  const college = resolveCollegeRuleset(world, profile.ecosystemId, world.currentDate)
  return { ...rules, minimumPerformance: Math.max(rules.minimumPerformance, college?.minimumAcademicPerformance ?? 0), minimumProgress: Math.max(rules.minimumProgress, college?.minimumAcademicProgress ?? 0) }
}

function isActiveAcademicProfile(world: GameWorld, profile: AcademicProfile): boolean {
  return world.teams[profile.programTeamId]?.rosterPlayerIds.includes(profile.playerId) === true
    && Object.values(world.playerEnrollmentsById).some(item => item.playerId === profile.playerId && item.teamId === profile.programTeamId && item.ecosystemId === profile.ecosystemId && item.status === 'active' && item.startsOn <= world.currentDate)
}

export function evaluateAcademicEligibility(world: GameWorld, playerId: PlayerId) {
  const profiles = Object.values(world.academicProfilesById).filter(item => item.playerId === playerId)
  const profile = profiles.find(item => isActiveAcademicProfile(world, item)) ?? profiles[0]
  if (profile === undefined) return { academicallyEligible: true, standing: 'good' as const, risk: 'low' as const, reasons: [] as readonly string[] }
  const rules = currentAcademicRules(world, profile)
  const standing = academicStanding(profile, rules)
  const reasons = [...(profile.performance < rules.minimumPerformance ? ['ACADEMIC_PERFORMANCE_BELOW_MINIMUM'] : []), ...(profile.progress < rules.minimumProgress ? ['ACADEMIC_PROGRESS_BELOW_MINIMUM'] : [])]
  return { academicallyEligible: reasons.length === 0, standing, risk: academicRisk(standing), reasons }
}
export function resolveAcademicTerm(world:GameWorld,termId:string):GameWorld{if(Object.values(world.academicTermRecordsById).some(r=>r.termId===termId))return world;const records=[] as any[],profiles=[] as AcademicProfile[],restrictions=[] as any[];for(const p of Object.values(world.academicProfilesById)){if(!isActiveAcademicProfile(world,p)){profiles.push(p);continue}const support=Object.values(world.academicSupportPlansById).find(x=>x.playerId===p.playerId&&x.termId===termId),bonus=support?(world.academicRulesByEcosystemId[p.ecosystemId]??defaultAcademicRules(p.ecosystemId)).supportEffectiveness[support.level]:0,performance=Math.max(0,Math.min(100,p.performance+bonus-2)),progress=Math.max(0,Math.min(100,p.progress+Math.round((performance-50)/10))),next={...p,performance,progress},result=evaluateAcademicEligibility({...world,academicProfilesById:{[p.id]:next}} as GameWorld,p.playerId);profiles.push(next);records.push({id:`academic-term:${termId}:${p.playerId}`,playerId:p.playerId,termId,performance,progressDelta:progress-p.progress,standing:result.standing,academicallyEligible:result.academicallyEligible,...(support?{supportLevel:support.level}:{})});if(!result.academicallyEligible)restrictions.push({id:`eligibility:academic:${termId}:${p.playerId}`,playerId:p.playerId,ecosystemId:p.ecosystemId,reasonCode:'ACADEMIC_INELIGIBLE',startsAt:world.currentDate,sourceType:'academic',sourceId:termId})}return updateGameWorld(world,{academicProfiles:profiles,academicTermRecords:[...Object.values(world.academicTermRecordsById),...records],eligibilityRestrictions:[...Object.values(world.eligibilityRestrictionsById).filter(r=>r.sourceType!=='academic'),...restrictions]})}
export function assignAcademicSupport(world: GameWorld, playerId: PlayerId, termId: string, level: AcademicSupportLevel) {
  const profiles = Object.values(world.academicProfilesById).filter(profile => profile.playerId === playerId)
  const profile = profiles.find(item => isActiveAcademicProfile(world, item)) ?? profiles[0]
  if (profile === undefined) return { ok: false as const, reason: 'ACADEMIC_PROFILE_UNAVAILABLE' }
  const rules = world.academicRulesByEcosystemId[profile.ecosystemId] ?? defaultAcademicRules(profile.ecosystemId)
  const cost = level === 'standard' ? 1 : level === 'tutoring' ? 2 : 3
  const used = Object.values(world.academicSupportPlansById).filter(plan => plan.programTeamId === profile.programTeamId && plan.termId === termId && plan.playerId !== playerId).reduce((sum, plan) => sum + plan.cost, 0)
  if (used + cost > rules.supportCapacity) return { ok: false as const, reason: 'INSUFFICIENT_ACADEMIC_SUPPORT_CAPACITY' }
  return { ok: true as const, value: updateGameWorld(world, { academicSupportPlans: [
    ...Object.values(world.academicSupportPlansById).filter(plan => plan.playerId !== playerId || plan.termId !== termId),
    { id: `academic-support:${termId}:${playerId}`, playerId, programTeamId: profile.programTeamId, termId, level, cost, startsAt: world.currentDate },
  ] }) }
}
export function progressAiAcademicSupport(world: GameWorld, termId: string): GameWorld {
  let next = world
  const year = Number(world.currentDate.slice(0, 4))
  const nextTermDate = createGameDate(year + (world.currentDate.slice(5, 7) >= '07' ? 1 : 0), world.currentDate.slice(5, 7) >= '07' ? 1 : 7, 1)
  const levels: readonly AcademicSupportLevel[] = ['standard', 'tutoring', 'intensive']
  const plans = Object.values(world.academicProfilesById).filter(profile => isActiveAcademicProfile(world, profile)).map(profile => {
    const rules = currentAcademicRules(world, profile)
    const upcoming = resolveCollegeRuleset(world, profile.ecosystemId, nextTermDate)
    const minimumPerformance = Math.max(rules.minimumPerformance, upcoming?.minimumAcademicPerformance ?? 0)
    const minimumProgress = Math.max(rules.minimumProgress, upcoming?.minimumAcademicProgress ?? 0)
    const meetsTarget = (bonus: number) => {
      const performance = profile.performance + bonus - 2
      return performance >= minimumPerformance && profile.progress + Math.round((performance - 50) / 10) >= minimumProgress
    }
    const level = levels.find(item => meetsTarget(rules.supportEffectiveness[item]))
    return { profile, level, priority: meetsTarget(0) ? 2 : level === undefined ? 1 : 0 }
  }).sort((a, b) => a.priority - b.priority || levels.indexOf(a.level ?? 'intensive') - levels.indexOf(b.level ?? 'intensive') || b.profile.performance - a.profile.performance || a.profile.playerId.localeCompare(b.profile.playerId))
  // Restore the most Players within real capacity first; then prepare harder cases and
  // maintain already-secure students. Upcoming published standards are not a clock reset.
  for (const { profile, level, priority } of plans) {
    if (next.teams[profile.programTeamId]?.coachId === next.userCoachId) continue
    const preferred = priority === 2 ? 'standard' : level ?? 'intensive'
    for (const candidate of levels.slice(0, levels.indexOf(preferred) + 1).reverse()) {
      const assigned = assignAcademicSupport(next, profile.playerId, termId, candidate)
      if (assigned.ok) { next = assigned.value; break }
    }
  }
  return next
}
