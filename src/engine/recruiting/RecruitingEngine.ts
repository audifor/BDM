import type { RecruitingBoardEntry, RecruitingCycle, RecruitingInterest, RecruitingOffer, RecruitProfile } from '@/domain/recruiting'
import type { GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import { createTeam } from '@/domain/team'
import { createPlayer } from '@/domain/player'
import { addYears } from '@/domain/date'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { initializeEligibility } from '@/engine/eligibility'
import { initializeAcademicProfile } from '@/engine/academic'
export type RecruitingResult<T>={ok:true;value:T}|{ok:false;reason:'RECRUITING_NOT_OPEN'|'INVALID_RECRUIT'|'INSUFFICIENT_RECRUITING_CAPACITY'|'DUPLICATE_OFFER'|'OFFER_LIMIT_REACHED'|'RECRUIT_ALREADY_COMMITTED'}
export function setBoard(entries:readonly RecruitingBoardEntry[],entry:RecruitingBoardEntry){return[...entries.filter(x=>x.programTeamId!==entry.programTeamId||x.recruitId!==entry.recruitId),entry]}
export function act(cycle:RecruitingCycle,recruit:RecruitProfile|undefined,interests:readonly RecruitingInterest[],program:TeamId,kind:'contact'|'pitch'|'visit',capacity:number):RecruitingResult<{interests:readonly RecruitingInterest[];capacity:number}>{if(cycle.status!=='open')return{ok:false,reason:'RECRUITING_NOT_OPEN'};if(!recruit||recruit.cycleId!==cycle.id)return{ok:false,reason:'INVALID_RECRUIT'};const cost=cycle.rules.costs[kind];if(capacity<cost)return{ok:false,reason:'INSUFFICIENT_RECRUITING_CAPACITY'};const before=interests.find(x=>x.recruitId===recruit.id&&x.programTeamId===program)?.value??0;const gain=kind==='contact'?8:kind==='pitch'?Math.round(recruit.preferences.development/10):18;return{ok:true,value:{capacity:capacity-cost,interests:[...interests.filter(x=>x.recruitId!==recruit.id||x.programTeamId!==program),{recruitId:recruit.id,programTeamId:program,value:Math.min(100,before+gain)}]}}}
export function offer(cycle:RecruitingCycle,recruit:RecruitProfile|undefined,offers:readonly RecruitingOffer[],program:TeamId,date:GameDate):RecruitingResult<RecruitingOffer>{if(cycle.status!=='open')return{ok:false,reason:'RECRUITING_NOT_OPEN'};if(!recruit)return{ok:false,reason:'INVALID_RECRUIT'};if(recruit.status!=='open')return{ok:false,reason:'RECRUIT_ALREADY_COMMITTED'};if(offers.some(x=>x.recruitId===recruit.id&&x.programTeamId===program&&x.status==='active'))return{ok:false,reason:'DUPLICATE_OFFER'};if(offers.filter(x=>x.programTeamId===program&&x.status==='active').length>=cycle.rules.maxOffers)return{ok:false,reason:'OFFER_LIMIT_REACHED'};return{ok:true,value:{id:`offer:${cycle.id}:${recruit.id}:${program}`,cycleId:cycle.id,recruitId:recruit.id,programTeamId:program,status:'active',madeOn:date}}}

/** Canonical world operations. The UI and AI share these boundaries. */
export function addRecruitingBoardEntry(world: GameWorld, entry: RecruitingBoardEntry): GameWorld {
  return updateGameWorld(world, { recruitingBoards: setBoard(world.recruitingBoards, entry) })
}

export function removeRecruitingBoardEntry(world: GameWorld, programTeamId: TeamId, recruitId: string): GameWorld {
  return updateGameWorld(world, { recruitingBoards: world.recruitingBoards.filter((entry) => entry.programTeamId !== programTeamId || entry.recruitId !== recruitId) })
}

export function performRecruitingAction(world: GameWorld, cycleId: string, recruitId: string, programTeamId: TeamId, kind: 'contact'|'pitch'|'visit'): RecruitingResult<GameWorld> {
  const cycle = world.recruitingCyclesById[cycleId]
  const recruit = world.recruitProfilesById[recruitId]
  const capacity = world.recruitingCapacityByProgramId[programTeamId] ?? cycle?.rules.periodCapacity ?? 0
  const result = act(cycle, recruit, world.recruitingInterests, programTeamId, kind, capacity)
  if (!result.ok) return result
  const effect = result.value.interests.find((item) => item.recruitId === recruitId && item.programTeamId === programTeamId)?.value ?? 0
  const history = { id: `recruiting-action:${cycleId}:${programTeamId}:${recruitId}:${kind}:${world.currentDate}`, cycleId, recruitId, programTeamId, kind, date: world.currentDate, cost: cycle.rules.costs[kind], effect }
  const visits = kind === 'visit' ? [...Object.values(world.recruitingVisitsById), { id: `visit:${cycleId}:${programTeamId}:${recruitId}:${world.currentDate}`, cycleId, recruitId, programTeamId, date: world.currentDate, cost: cycle.rules.costs.visit, outcome: effect }] : Object.values(world.recruitingVisitsById)
  return { ok: true, value: updateGameWorld(world, { recruitingInterests: result.value.interests, recruitingCapacityByProgramId: { ...world.recruitingCapacityByProgramId, [programTeamId]: result.value.capacity }, recruitingActionHistory: [...Object.values(world.recruitingActionHistoryById), history], recruitingVisits: visits }) }
}

export function makeRecruitingOffer(world: GameWorld, cycleId: string, recruitId: string, programTeamId: TeamId): RecruitingResult<GameWorld> {
  const cycle = world.recruitingCyclesById[cycleId]
  const result = offer(cycle, world.recruitProfilesById[recruitId], Object.values(world.recruitingOffersById), programTeamId, world.currentDate)
  if (!result.ok) return result
  return { ok: true, value: updateGameWorld(world, { recruitingOffers: [...Object.values(world.recruitingOffersById), result.value] }) }
}

export function resolveRecruitingCommitments(world: GameWorld, cycleId: string): GameWorld {
  const cycle = world.recruitingCyclesById[cycleId]
  if (!cycle || cycle.status === 'scheduled' || cycle.status === 'completed') return world
  const profiles = Object.values(world.recruitProfilesById).filter((profile) => profile.cycleId === cycleId && profile.status === 'open')
  let next = world
  for (const profile of profiles) {
    const candidates = Object.values(next.recruitingOffersById).filter((offer) => offer.cycleId === cycleId && offer.recruitId === profile.id && offer.status === 'active').map((offer) => ({ offer, interest: next.recruitingInterests.find((value) => value.recruitId === profile.id && value.programTeamId === offer.programTeamId)?.value ?? 0 })).filter((candidate) => candidate.interest >= cycle.rules.commitmentThreshold).sort((a, b) => b.interest - a.interest || a.offer.programTeamId.localeCompare(b.offer.programTeamId))
    const winner = candidates[0]
    if (!winner) continue
    const commitment = { id: `commitment:${cycleId}:${profile.id}`, cycleId, recruitId: profile.id, programTeamId: winner.offer.programTeamId, offerId: winner.offer.id, committedOn: next.currentDate }
    next = updateGameWorld(next, { recruitProfiles: [...Object.values(next.recruitProfilesById).filter((item) => item.id !== profile.id), { ...profile, status: 'committed' }], recruitingCommitments: [...Object.values(next.recruitingCommitmentsById), commitment], recruitingOffers: Object.values(next.recruitingOffersById).map((offer) => offer.recruitId === profile.id ? { ...offer, status: offer.id === winner.offer.id ? 'committed' : 'withdrawn' } : offer) })
  }
  return next
}

export function signCommittedRecruit(world: GameWorld, cycleId: string, recruitId: string): RecruitingResult<GameWorld> {
  const profile = world.recruitProfilesById[recruitId]; const cycle = world.recruitingCyclesById[cycleId]
  const commitment = Object.values(world.recruitingCommitmentsById).find((item) => item.cycleId === cycleId && item.recruitId === recruitId)
  if (!cycle || cycle.status !== 'signing') return { ok: false, reason: 'RECRUITING_NOT_OPEN' }
  if (!profile || !commitment || profile.status !== 'committed') return { ok: false, reason: 'RECRUIT_ALREADY_COMMITTED' }
  const used = Object.values(world.recruitSigningsById).filter((item) => item.cycleId === cycleId && item.programTeamId === commitment.programTeamId).length
  if (used >= cycle.rules.maxSignings) return { ok: false, reason: 'OFFER_LIMIT_REACHED' }
  const signing = { id: `signing:${cycleId}:${recruitId}`, cycleId, recruitId, playerId: profile.playerId, programTeamId: commitment.programTeamId, targetSeasonId: cycle.targetSeasonId, offerId: commitment.offerId, signedOn: world.currentDate }
  return { ok: true, value: updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById).filter((item) => item.id !== recruitId), { ...profile, status: 'incoming' }], recruitSignings: [...Object.values(world.recruitSigningsById), signing], recruitingOffers: Object.values(world.recruitingOffersById).map((offer) => offer.id === commitment.offerId ? { ...offer, status: 'signed' } : offer) }) }
}

export function arriveSignedRecruits(world: GameWorld): GameWorld {
  const arrivals = Object.values(world.recruitSigningsById).filter((signing) => signing.targetSeasonId === world.currentSeasonId && !world.teams[signing.programTeamId].rosterPlayerIds.includes(signing.playerId))
  if (arrivals.length === 0) return world
  const teams = Object.values(world.teams).map((team) => {
    const playerIds = arrivals.filter((arrival) => arrival.programTeamId === team.id).map((arrival) => arrival.playerId)
    return playerIds.length === 0 ? team : createTeam({ ...team, rosterPlayerIds: [...team.rosterPlayerIds, ...playerIds] })
  })
  const arrived = new Set(arrivals.map((item) => item.recruitId))
  const arrivedWorld = updateGameWorld(world, { teams, recruitProfiles: Object.values(world.recruitProfilesById).map((profile) => arrived.has(profile.id) ? { ...profile, status: 'arrived' } : profile) })
  let current = arrivedWorld
  for (const arrival of arrivals) {
    const season = current.seasons[arrival.targetSeasonId]
    const ecosystemId = season === undefined ? undefined : current.competitions[season.competitionId]?.ecosystemId
    if (ecosystemId !== undefined) current = initializeAcademicProfile(initializeEligibility(current, arrival.playerId, arrival.programTeamId, ecosystemId), arrival.playerId, arrival.programTeamId, ecosystemId)
  }
  return current
}

export interface RecruitingClassSummary { readonly programTeamId: TeamId; readonly committed: readonly RecruitProfile[]; readonly signed: readonly RecruitProfile[]; readonly incoming: readonly RecruitProfile[]; readonly publicQuality: number; readonly remainingSignings: number }
export function getRecruitingClass(world: GameWorld, cycleId: string, programTeamId: TeamId): RecruitingClassSummary {
  const profiles = Object.values(world.recruitProfilesById); const signedIds = new Set(Object.values(world.recruitSigningsById).filter((item) => item.cycleId === cycleId && item.programTeamId === programTeamId).map((item) => item.recruitId)); const committedIds = new Set(Object.values(world.recruitingCommitmentsById).filter((item) => item.cycleId === cycleId && item.programTeamId === programTeamId).map((item) => item.recruitId)); const signed = profiles.filter((profile) => signedIds.has(profile.id)); const committed = profiles.filter((profile) => committedIds.has(profile.id) && !signedIds.has(profile.id)); const incoming = signed.filter((profile) => profile.status === 'incoming'); const quality = [...committed, ...signed].reduce((total, profile) => total + ({ elite: 4, strong: 3, rotation: 2, developmental: 1 }[profile.tier]), 0); const cycle = world.recruitingCyclesById[cycleId]
  return { programTeamId, committed, signed, incoming, publicQuality: quality, remainingSignings: Math.max(0, (cycle?.rules.maxSignings ?? 0) - signed.length) }
}

export function getTeamRecruitingNeeds(world: GameWorld, teamId: TeamId): Readonly<Record<'PG'|'SG'|'SF'|'PF'|'C', number>> {
  const team = world.teams[teamId]; const counts: Record<'PG'|'SG'|'SF'|'PF'|'C', number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 }
  if (team) for (const playerId of team.rosterPlayerIds) counts[world.players[playerId]!.basketball.primaryPosition] += 1
  for (const signing of Object.values(world.recruitSigningsById).filter((item) => item.programTeamId === teamId)) { const profile = world.recruitProfilesById[signing.recruitId]; if (profile?.status === 'incoming') counts[profile.position] += 1 }
  return Object.fromEntries(Object.entries(counts).map(([position, count]) => [position, Math.max(0, 2 - count)])) as Record<'PG'|'SG'|'SF'|'PF'|'C', number>
}

/** Weekly deterministic AI cadence. It only invokes public canonical operations. */
export function progressAiRecruiting(world: GameWorld, cycleId: string): GameWorld {
  const cycle = world.recruitingCyclesById[cycleId]; const ecosystem = cycle && world.ecosystems[cycle.ecosystemId]
  if (!cycle || ecosystem?.kind !== 'ncaaLike' || (cycle.status !== 'open' && cycle.status !== 'signing')) return world
  const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)?.id
  const programs = Object.values(world.competitions).filter((competition) => competition.ecosystemId === cycle.ecosystemId).flatMap((competition) => competition.participantTeamIds).filter((teamId, index, all) => teamId !== userTeam && all.indexOf(teamId) === index).sort()
  let next = world
  for (const programTeamId of programs) {
    const needs = getTeamRecruitingNeeds(next, programTeamId)
    const targets = Object.values(next.recruitProfilesById).filter((profile) => profile.cycleId === cycleId && profile.status === 'open').sort((a, b) => (needs[b.position] - needs[a.position]) || a.publicRank - b.publicRank || a.id.localeCompare(b.id)).slice(0, 2)
    for (const target of targets) {
      next = addRecruitingBoardEntry(next, { programTeamId, recruitId: target.id, priority: needs[target.position] > 0 ? 'high' : 'normal' })
      const contacted = performRecruitingAction(next, cycleId, target.id, programTeamId, 'contact'); if (contacted.ok) next = contacted.value
      const pitched = performRecruitingAction(next, cycleId, target.id, programTeamId, 'pitch'); if (pitched.ok) next = pitched.value
      const visited = performRecruitingAction(next, cycleId, target.id, programTeamId, 'visit'); if (visited.ok) next = visited.value
      const offered = makeRecruitingOffer(next, cycleId, target.id, programTeamId); if (offered.ok) next = offered.value
    }
    if (cycle.status === 'signing') for (const commitment of Object.values(next.recruitingCommitmentsById).filter((item) => item.cycleId === cycleId && item.programTeamId === programTeamId)) { const signed = signCommittedRecruit(next, cycleId, commitment.recruitId); if (signed.ok) next = signed.value }
  }
  return resolveRecruitingCommitments(next, cycleId)
}

/** Creates canonical unrostered Players and their deliberately imperfect public profiles. */
export function generateRecruitingPool(world: GameWorld, cycleId: string): GameWorld {
  const cycle = world.recruitingCyclesById[cycleId]
  if (!cycle || Object.values(world.recruitProfilesById).some((profile) => profile.cycleId === cycleId)) return world
  const template = Object.values(world.teams).find((team) => Object.values(world.competitions).some((competition) => competition.ecosystemId === cycle.ecosystemId && competition.participantTeamIds.includes(team.id)))
  if (!template) return world
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const
  const players = []; const profiles = []
  for (let index = 0; index < cycle.rules.poolSize; index += 1) {
    const id = `recruit:${cycle.id}:${index + 1}` as import('@/domain/ids').PlayerId
    const random = new SeededRandomSource(hashStringToSeed(`recruiting-pool-v1:${cycle.ecosystemId}:${cycle.id}:${index}`))
    const position = positions[index % positions.length]!
    const rating = () => random.nextInt(42, 82)
    const ratings = { finishing: rating(), shooting: rating(), playmaking: rating(), perimeterDefense: rating(), interiorDefense: rating(), rebounding: rating(), athleticism: rating() }
    const player = createPlayer({ id, firstName: `Recruit${index + 1}`, lastName: `Class${cycle.targetSeasonId}`, gender: template.gender, nationalityId: template.countryId, basketball: { primaryPosition: position, ratings }, bio: { dateOfBirth: addYears(cycle.opensOn, -random.nextInt(17, 20)), heightCm: random.nextInt(178, 218), weightKg: random.nextInt(72, 125) }, potential: { ceiling: Math.min(100, Math.round((Object.values(ratings).reduce((total, value) => total + value, 0) / 7) + random.nextInt(8, 25))) } })
    const publicScore = Math.round(Object.values(ratings).reduce((total, value) => total + value, 0) / 7 + random.nextInt(-7, 7))
    players.push(player); profiles.push({ id: `recruit-profile:${cycle.id}:${index + 1}`, playerId: id, cycleId, origin: (['preCollege', 'academy', 'international'] as const)[index % 3]!, position, publicRank: index + 1, positionRank: Math.floor(index / positions.length) + 1, tier: (publicScore >= 72 ? 'elite' : publicScore >= 62 ? 'strong' : publicScore >= 52 ? 'rotation' : 'developmental') as 'elite'|'strong'|'rotation'|'developmental', preferences: { opportunity: random.nextInt(1, 10), development: random.nextInt(1, 10), competing: random.nextInt(1, 10), coach: random.nextInt(1, 10) }, status: 'open' as const })
  }
  profiles.sort((a, b) => b.tier.localeCompare(a.tier) || a.id.localeCompare(b.id)).forEach((profile, index) => { (profile as { publicRank: number }).publicRank = index + 1 })
  return updateGameWorld(world, { players: [...Object.values(world.players), ...players], recruitProfiles: profiles })
}
