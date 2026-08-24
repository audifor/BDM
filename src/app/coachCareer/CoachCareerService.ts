import { appointCoachToTeam, coachJobCandidacyIdFromString, coachJobOfferIdFromString, coachJobOpeningIdFromString, createCoachJobOpening, decideCoachJobOffer, evaluateCoachJobEligibility, fireCoach, leaveForAnotherJob, transitionCoachInterview, transitionCoachJobCandidacy, type CoachJobOpening } from '@/domain/coachCareer'
import type { CoachId, TeamId } from '@/domain/ids'
import type { CoachReputationRequirement } from '@/domain/coachReputation'
import { addInboxItem, addNewsItem, updateGameWorld, type GameWorld } from '@/domain/world'
import { interpretMemoryValence, recordMemory } from '@/engine/memory'
import { evaluateFiringRisk, initializeBoardState } from '@/engine/board'
import { closeCoachTenure, openCoachTenure } from '@/engine/legacy'

export function createCoachJobOpeningForTeam(world: GameWorld, input: { readonly teamId: TeamId; readonly reputationRequirement?: CoachReputationRequirement; readonly id?: string }): { readonly world: GameWorld; readonly opening: CoachJobOpening } {
  const team = requireTeam(world, input.teamId)
  if (team.coachId !== undefined) throw new Error('Coach job opening requires a Team without a Coach')
  const existing = Object.values(world.coachJobOpeningsById).find((opening) => opening.teamId === team.id && opening.status === 'open')
  if (existing !== undefined) return { world, opening: existing }
  const id = coachJobOpeningIdFromString(input.id ?? nextId(world, `coach-job:${team.id}:${world.currentDate}:`))
  const context = jobContext(world, team.id)
  const opening = createCoachJobOpening({ id, teamId: team.id, ecosystemId: context.ecosystemId, sportsCategory: context.sportsCategory, role: 'headCoach', fitWeights: context.fitWeights, status: 'open', createdOn: world.currentDate, ...(input.reputationRequirement === undefined ? {} : { reputationRequirement: input.reputationRequirement }) })
  return { world: rebuild(world, { openings: { ...world.coachJobOpeningsById, [id]: opening } }), opening }
}

export function getOpenCoachJobs(world: GameWorld): readonly CoachJobOpening[] { return Object.values(world.coachJobOpeningsById).filter((opening) => opening.status === 'open').sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.id.localeCompare(b.id)) }
export function getEligibleCoachJobs(world: GameWorld, coachId: CoachId) { const employment = world.coachEmploymentByCoachId[coachId], reputation = world.coachReputationProfilesByCoachId[coachId]; return getOpenCoachJobs(world).map((opening) => ({ opening, eligibility: employment === undefined || reputation === undefined ? { eligible: false, reasons: [{ reason: 'reputationRequirementNotMet' as const }] } : evaluateCoachJobEligibility(employment, reputation, opening) })) }
export function applyUserCoachForJob(world: GameWorld, openingId: string) { return identifyCoachCandidate(world, { openingId, coachId: world.userCoachId }) }
export function rankCoachCandidates(world: GameWorld, openingId: string): readonly CoachId[] { const opening = requireOpening(world, openingId); return Object.values(world.coaches).filter((coach) => evaluateCoachJobEligibility(world.coachEmploymentByCoachId[coach.id]!, world.coachReputationProfilesByCoachId[coach.id]!, opening).eligible).sort((a, b) => score(world, opening, b.id) - score(world, opening, a.id) || a.id.localeCompare(b.id)).map((coach) => coach.id) }

export function identifyCoachCandidate(world: GameWorld, input: { readonly openingId: string; readonly coachId: CoachId; readonly id?: string }): { readonly world: GameWorld; readonly candidacyId: string } {
  const opening = requireOpening(world, input.openingId)
  if (opening.status !== 'open') throw new Error('Coach job opening is not open')
  const profile = world.coachReputationProfilesByCoachId[input.coachId]
  if (world.coaches[input.coachId] === undefined || profile === undefined || !evaluateCoachJobEligibility(world.coachEmploymentByCoachId[input.coachId]!, profile, opening).eligible) throw new Error('Coach is not eligible for this job opening')
  const existing = Object.values(world.coachJobCandidaciesById).find((candidacy) => candidacy.jobOpeningId === opening.id && candidacy.coachId === input.coachId && ['identified', 'interviewing', 'offered'].includes(candidacy.status))
  if (existing !== undefined) return { world, candidacyId: existing.id }
  const id = coachJobCandidacyIdFromString(input.id ?? nextId(world, `coach-candidacy:${opening.id}:${input.coachId}:`))
  return { world: rebuild(world, { candidacies: { ...world.coachJobCandidaciesById, [id]: { id, jobOpeningId: opening.id, coachId: input.coachId, status: 'identified', createdOn: world.currentDate } } }), candidacyId: id }
}

export function startCoachInterview(world: GameWorld, candidacyId: string): GameWorld {
  const candidacy = requireCandidacy(world, candidacyId)
  if (world.coachInterviewsByCandidacyId[candidacy.id] !== undefined) return world
  const transition = transitionCoachJobCandidacy(candidacy, 'interviewing')
  if (!transition.ok) throw new Error('Coach candidacy cannot start an interview')
  return rebuild(world, { candidacies: { ...world.coachJobCandidaciesById, [candidacy.id]: transition.candidacy }, interviews: { ...world.coachInterviewsByCandidacyId, [candidacy.id]: { candidacyId: candidacy.id, status: 'scheduled' } } })
}

export function completeCoachInterview(world: GameWorld, candidacyId: string): GameWorld {
  const interview = world.coachInterviewsByCandidacyId[coachJobCandidacyIdFromString(candidacyId)]
  if (interview === undefined) throw new Error('Coach interview does not exist')
  const transition = transitionCoachInterview(interview, 'completed')
  if (!transition.ok) throw new Error('Coach interview cannot be completed')
  return rebuild(world, { interviews: { ...world.coachInterviewsByCandidacyId, [interview.candidacyId]: transition.interview } })
}

export function createCoachJobOffer(world: GameWorld, input: { readonly candidacyId: string; readonly id?: string }): { readonly world: GameWorld; readonly offerId: string } {
  const candidacy = requireCandidacy(world, input.candidacyId); const opening = requireOpening(world, candidacy.jobOpeningId)
  const interview = world.coachInterviewsByCandidacyId[candidacy.id]
  const profile = world.coachReputationProfilesByCoachId[candidacy.coachId]
  if (candidacy.status !== 'interviewing' || interview?.status !== 'completed' || opening.status !== 'open' || profile === undefined || !evaluateCoachJobEligibility(world.coachEmploymentByCoachId[candidacy.coachId]!, profile, opening).eligible) throw new Error('Coach job offer preconditions are not met')
  const existing = Object.values(world.coachJobOffersById).find((offer) => offer.jobOpeningId === opening.id && offer.coachId === candidacy.coachId && offer.status === 'pending')
  if (existing !== undefined) return { world, offerId: existing.id }
  const transitioned = transitionCoachJobCandidacy(candidacy, 'offered'); if (!transitioned.ok) throw new Error('Coach candidacy cannot receive an offer')
  const id = coachJobOfferIdFromString(input.id ?? nextId(world, `coach-offer:${opening.id}:${candidacy.coachId}:`))
  const annualSalary=offerSalary(world,opening.teamId)
  const next=rebuild(world, { candidacies: { ...world.coachJobCandidaciesById, [candidacy.id]: transitioned.candidacy }, offers: { ...world.coachJobOffersById, [id]: { id, jobOpeningId: opening.id, coachId: candidacy.coachId, teamId: opening.teamId, annualSalary, createdOn: world.currentDate, status: 'pending' } } })
  return { world: candidacy.coachId===world.userCoachId?addInboxItem(next,{id:`inbox:career-offer:${id}:${candidacy.coachId}`,coachId:candidacy.coachId,gameDate:world.currentDate,category:'career',priority:'high',title:`Job offer from ${world.teams[opening.teamId]!.name}`,body:`${world.teams[opening.teamId]!.name} has offered you the head coach position for $${annualSalary.toLocaleString()} per year.`,status:'unread',action:{type:'coachJobOffer',entityId:id},context:{offerId:id,teamId:opening.teamId,annualSalary}}):next, offerId: id }
}

export function acceptCoachJobOffer(world: GameWorld, offerId: string): GameWorld {
  const offer = requireOffer(world, offerId); const opening = requireOpening(world, offer.jobOpeningId); const candidacy = requireCandidacy(world, findCandidacy(world, offer))
  if (offer.status !== 'pending' || opening.status !== 'open' || world.teams[opening.teamId]!.coachId !== undefined) throw new Error('Coach job offer cannot be accepted')
  const accepted = decideCoachJobOffer(offer, 'accepted'); const hired = transitionCoachJobCandidacy(candidacy, 'hired'); if (!accepted.ok || !hired.ok) throw new Error('Coach job offer cannot be accepted')
  let teams = Object.values(world.teams); let employment = world.coachEmploymentByCoachId[offer.coachId]!; let history = world.coachCareerHistoryByCoachId[offer.coachId]!; let openings = { ...world.coachJobOpeningsById }; let departedTeamId: TeamId | undefined
  if (employment.status === 'employed') { const oldTeamId = employment.teamId!; departedTeamId = oldTeamId; const leaving = leaveForAnotherJob({ employment, history, coachId: offer.coachId, date: world.currentDate }); if (!leaving.ok) throw new Error('Coach cannot leave current Team'); teams = teams.map((team) => team.id === oldTeamId ? { ...team, coachId: undefined } : team); employment = leaving.employment; history = leaving.history; const created = createCoachJobOpeningForTeam(rebuild(world, { teams, employment: { ...world.coachEmploymentByCoachId, [offer.coachId]: employment }, history: { ...world.coachCareerHistoryByCoachId, [offer.coachId]: history }, openings }), { teamId: oldTeamId }); openings = { ...created.world.coachJobOpeningsById }; teams = Object.values(created.world.teams) }
  const appointed = appointCoachToTeam({ employment, history, coachId: offer.coachId, teamId: opening.teamId, date: world.currentDate }); if (!appointed.ok) throw new Error('Coach cannot be appointed')
  teams = teams.map((team) => team.id === opening.teamId ? { ...team, coachId: offer.coachId } : team)
  openings[opening.id] = { ...opening, status: 'filled' }
  const candidacies: Record<string, any> = { ...world.coachJobCandidaciesById, [candidacy.id]: hired.candidacy }
  const offers: Record<string, any> = { ...world.coachJobOffersById, [offer.id]: accepted.offer }
  for (const candidate of Object.values(candidacies)) if (candidate.jobOpeningId === opening.id && candidate.id !== candidacy.id && ['identified', 'interviewing', 'offered'].includes(candidate.status)) { const rejected = transitionCoachJobCandidacy(candidate, 'rejected'); if (rejected.ok) candidacies[candidate.id] = rejected.candidacy }
  for (const other of Object.values(offers)) if (other.jobOpeningId === opening.id && other.id !== offer.id && other.status === 'pending') offers[other.id] = { ...other, status: 'withdrawn' }
  const next=updateGameWorld(rebuild(world, { teams, openings, candidacies, offers, employment: { ...world.coachEmploymentByCoachId, [offer.coachId]: appointed.employment }, history: { ...world.coachCareerHistoryByCoachId, [offer.coachId]: appointed.history } }), { coachFinancesByCoachId: { ...world.coachFinancesByCoachId, [offer.coachId]: { ...world.coachFinancesByCoachId[offer.coachId]!, annualSalary: offer.annualSalary ?? world.coachFinancesByCoachId[offer.coachId]!.annualSalary } } })
  const coach=world.coaches[offer.coachId]!, team=world.teams[opening.teamId]!
  let remembered = recordMemory(recordMemory(next, { id: `memory:hired:coach:${offer.id}`, owner: { kind: 'coach', id: coach.id }, type: 'hired', occurredOn: world.currentDate, entityRefs: [{ kind: 'team', id: team.id }], sourceId: offer.id, semanticKey: `hired:${offer.id}`, importance: 'important', valence: 60, intensity: 70, decayPerMonth: 1, permanent: false, tags: ['career', 'hiring'], context: { teamId: team.id, offerId: offer.id } }), { id: `memory:hired:team:${offer.id}`, owner: { kind: 'team', id: team.id }, type: 'hired', occurredOn: world.currentDate, entityRefs: [{ kind: 'coach', id: coach.id }], sourceId: offer.id, semanticKey: `hired:${offer.id}`, importance: 'important', valence: 45, intensity: 60, decayPerMonth: 1, permanent: false, tags: ['career', 'hiring'], context: { coachId: coach.id, offerId: offer.id } })
  if (departedTeamId !== undefined) {
    remembered = recordMemory(remembered, { id: `memory:left:coach:${offer.id}`, owner: { kind: 'coach', id: coach.id }, type: 'leftClub', occurredOn: world.currentDate, entityRefs: [{ kind: 'team', id: departedTeamId }], sourceId: offer.id, semanticKey: `left:${offer.id}`, importance: 'major', valence: 20, intensity: 65, decayPerMonth: 1, permanent: false, tags: ['career', 'departure'], context: { teamId: departedTeamId, offerId: offer.id } })
    remembered = recordMemory(remembered, { id: `memory:left:team:${offer.id}`, owner: { kind: 'team', id: departedTeamId }, type: 'leftClub', occurredOn: world.currentDate, entityRefs: [{ kind: 'coach', id: coach.id }], sourceId: offer.id, semanticKey: `left:${offer.id}`, importance: 'major', valence: -35, intensity: 65, decayPerMonth: 1, permanent: false, tags: ['career', 'departure'], context: { coachId: coach.id, offerId: offer.id } })
  }
  for (const playerId of team.rosterPlayerIds) { const player = world.players[playerId]!; remembered = recordMemory(remembered, { id: `memory:opportunity:player:${offer.id}:${playerId}`, owner: { kind: 'player', id: playerId }, type: 'opportunity', occurredOn: world.currentDate, entityRefs: [{ kind: 'coach', id: coach.id }, { kind: 'team', id: team.id }], sourceId: offer.id, semanticKey: `coach-opportunity:${offer.id}`, importance: 'notable', valence: interpretMemoryValence(35, world.personalitiesByPersonId[player.id]), intensity: 45, decayPerMonth: 1, permanent: false, tags: ['career', 'coach', 'opportunity'], context: { coachId: coach.id, teamId: team.id, offerId: offer.id } }) }
  return openCoachTenure(initializeBoardState(addNewsItem(remembered,{id:`news:coach-hired:${offer.id}`,gameDate:world.currentDate,category:'career',headline:`${coach.firstName} ${coach.lastName} joins ${team.name}`,body:`${coach.firstName} ${coach.lastName} has been appointed head coach of ${team.name}.`,context:{coachId:coach.id,teamId:team.id,offerId:offer.id}}),team.id),coach.id,team.id)
}

export function declineCoachJobOffer(world: GameWorld, offerId: string): GameWorld { const offer = requireOffer(world, offerId); const candidacy = requireCandidacy(world, findCandidacy(world, offer)); const declined = decideCoachJobOffer(offer, 'declined'); const rejected = transitionCoachJobCandidacy(candidacy, 'rejected'); if (!declined.ok || !rejected.ok) throw new Error('Coach job offer cannot be declined'); return rebuild(world, { offers: { ...world.coachJobOffersById, [offer.id]: declined.offer }, candidacies: { ...world.coachJobCandidaciesById, [candidacy.id]: rejected.candidacy } }) }
export function withdrawCoachJobOffer(world: GameWorld, offerId: string): GameWorld { const offer = requireOffer(world, offerId); const candidacy = requireCandidacy(world, findCandidacy(world, offer)); const withdrawn = decideCoachJobOffer(offer, 'withdrawn'); const result = transitionCoachJobCandidacy(candidacy, 'withdrawn'); if (!withdrawn.ok || !result.ok) throw new Error('Coach job offer cannot be withdrawn'); return rebuild(world, { offers: { ...world.coachJobOffersById, [offer.id]: withdrawn.offer }, candidacies: { ...world.coachJobCandidaciesById, [candidacy.id]: result.candidacy } }) }
export function fireCoachFromTeam(world: GameWorld, teamId: TeamId): GameWorld { const team = requireTeam(world, teamId); if (team.coachId === undefined) throw new Error('Team has no Coach'); const coachId = team.coachId; const result = fireCoach({ employment: world.coachEmploymentByCoachId[coachId]!, history: world.coachCareerHistoryByCoachId[coachId]!, decision: { coachId, teamId, date: world.currentDate, reason: 'performance' } }); if (!result.ok) throw new Error('Coach cannot be fired'); const vacant = rebuild(world, { teams: Object.values(world.teams).map((item) => item.id === teamId ? { ...item, coachId: undefined } : item), employment: { ...world.coachEmploymentByCoachId, [coachId]: result.employment }, history: { ...world.coachCareerHistoryByCoachId, [coachId]: result.history } }); const opened=createCoachJobOpeningForTeam(vacant, { teamId }).world; const remembered=recordMemory(recordMemory(opened,{id:`memory:fired:coach:${coachId}:${teamId}:${world.currentDate}`,owner:{kind:'coach',id:coachId},type:'fired',occurredOn:world.currentDate,entityRefs:[{kind:'team',id:teamId}],semanticKey:`fired:${coachId}:${teamId}:${world.currentDate}`,importance:'major',valence:-80,intensity:85,decayPerMonth:1,permanent:false,tags:['career','dismissal'],context:{teamId}}),{id:`memory:fired:team:${coachId}:${teamId}:${world.currentDate}`,owner:{kind:'team',id:teamId},type:'fired',occurredOn:world.currentDate,entityRefs:[{kind:'coach',id:coachId}],semanticKey:`fired:${coachId}:${teamId}:${world.currentDate}`,importance:'major',valence:-50,intensity:70,decayPerMonth:1,permanent:false,tags:['career','dismissal'],context:{coachId}}); const coach=world.coaches[coachId]!;return closeCoachTenure(addNewsItem(remembered,{id:`news:coach-fired:${coachId}:${teamId}:${world.currentDate}`,gameDate:world.currentDate,category:'career',headline:`${coach.firstName} ${coach.lastName} dismissed by ${team.name}`,body:`${coach.firstName} ${coach.lastName} is no longer head coach of ${team.name}.`,context:{coachId,teamId}}),coachId,teamId) }
export function applyBoardFiringRecommendation(world: GameWorld, teamId: TeamId): GameWorld { const state = world.boardStatesByTeamId[teamId]; return state !== undefined && evaluateFiringRisk(state) ? fireCoachFromTeam(world, teamId) : world }
export function closeCoachJobOpening(world: GameWorld, openingId: string): GameWorld { const opening = requireOpening(world, openingId); if (opening.status !== 'open') throw new Error('Coach job opening is not open'); return rebuild(world, { openings: { ...world.coachJobOpeningsById, [opening.id]: { ...opening, status: 'closed' } } }) }

export function runCoachHiringProcessForOpening(world: GameWorld, openingId: string): GameWorld { const opening = requireOpening(world, openingId); const coachId = rankCoachCandidates(world, openingId)[0]; if (coachId === undefined) return world; const candidate = identifyCoachCandidate(world, { openingId, coachId }); const interviewed = completeCoachInterview(startCoachInterview(candidate.world, candidate.candidacyId), candidate.candidacyId); const offered = createCoachJobOffer(interviewed, { candidacyId: candidate.candidacyId }); return coachId === world.userCoachId ? offered.world : acceptCoachJobOffer(offered.world, offered.offerId) }

function score(world: GameWorld, opening: CoachJobOpening, coachId: CoachId): number { const values = world.coachReputationProfilesByCoachId[coachId]!.values, weights = opening.fitWeights ?? { competitive: 1, development: 1, professional: 1, publicStanding: 1 }; return values.competitive * weights.competitive + values.development * weights.development + values.professional * weights.professional + values.publicStanding * weights.publicStanding }
function offerSalary(world: GameWorld, teamId: TeamId): number { const payroll=world.teamFinancesByTeamId[teamId]?.playerSalaryBudget ?? 0; return Math.max(48_000, Math.round((payroll > 0 ? payroll * .035 : 72_000) / 1_000) * 1_000) }
function jobContext(world: GameWorld, teamId: TeamId) { const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(teamId))!, ecosystem = world.ecosystems[competition.ecosystemId]!, fitWeights = ecosystem.kind === 'nbaLike' ? { competitive: 3, development: 1, professional: 2, publicStanding: 1 } : ecosystem.kind === 'ncaaLike' ? { competitive: 1, development: 3, professional: 2, publicStanding: 1 } : { competitive: 2, development: 2, professional: 2, publicStanding: 1 }; return { ecosystemId: ecosystem.id, sportsCategory: ecosystem.category, fitWeights } }
function findCandidacy(world: GameWorld, offer: { readonly jobOpeningId: string; readonly coachId: CoachId }): string { const candidacy = Object.values(world.coachJobCandidaciesById).find((item) => item.jobOpeningId === offer.jobOpeningId && item.coachId === offer.coachId && item.status === 'offered'); if (candidacy === undefined) throw new Error('Coach offer has no active candidacy'); return candidacy.id }
function requireTeam(world: GameWorld, id: TeamId) { const team = world.teams[id]; if (team === undefined) throw new Error('Team does not exist'); return team }
function requireOpening(world: GameWorld, id: string) { const opening = world.coachJobOpeningsById[coachJobOpeningIdFromString(id)]; if (opening === undefined) throw new Error('Coach job opening does not exist'); return opening }
function requireCandidacy(world: GameWorld, id: string) { const candidacy = world.coachJobCandidaciesById[coachJobCandidacyIdFromString(id)]; if (candidacy === undefined) throw new Error('Coach candidacy does not exist'); return candidacy }
function requireOffer(world: GameWorld, id: string) { const offer = world.coachJobOffersById[coachJobOfferIdFromString(id)]; if (offer === undefined) throw new Error('Coach job offer does not exist'); return offer }
function nextId(world: GameWorld, prefix: string): string { return `${prefix}${Object.keys(world.coachJobOpeningsById).concat(Object.keys(world.coachJobCandidaciesById), Object.keys(world.coachJobOffersById)).filter((id) => id.startsWith(prefix)).length + 1}` }
function rebuild(world: GameWorld, changes: Partial<{ teams: readonly (typeof world.teams)[keyof typeof world.teams][]; openings: typeof world.coachJobOpeningsById; candidacies: typeof world.coachJobCandidaciesById; interviews: typeof world.coachInterviewsByCandidacyId; offers: typeof world.coachJobOffersById; employment: typeof world.coachEmploymentByCoachId; history: typeof world.coachCareerHistoryByCoachId }>): GameWorld {
  return updateGameWorld(world, {
    ...(changes.teams === undefined ? {} : { teams: changes.teams }),
    coachJobOpeningsById: changes.openings ?? world.coachJobOpeningsById,
    coachJobCandidaciesById: changes.candidacies ?? world.coachJobCandidaciesById,
    coachInterviewsByCandidacyId: changes.interviews ?? world.coachInterviewsByCandidacyId,
    coachJobOffersById: changes.offers ?? world.coachJobOffersById,
    coachEmploymentByCoachId: changes.employment ?? world.coachEmploymentByCoachId,
    coachCareerHistoryByCoachId: changes.history ?? world.coachCareerHistoryByCoachId,
  } as never)
}
