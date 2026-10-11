import type { PlayerId } from '@/domain/ids'
import type { Place } from '@/domain/facilities/Place'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { assessCollegeContinuation } from '@/engine/eligibility/CollegeContinuationAssessment'
import { getPlayerSeasonStats, calculatePlayerStatAverages } from '@/engine/stats/PlayerHistory'
import { getTeamRecruitingNeeds } from '@/engine/recruiting'

export interface TalentPortalPlayerViewModel {
  readonly playerId: PlayerId
  readonly personId: string
  readonly playerName: string
  readonly institutionName: string
  readonly position: string
  readonly eligibility: 'Unknown' | 'Eligible' | 'Blocked'
  readonly level: string
  readonly region: string | null
  readonly roleFit: 'High position need' | 'Moderate position need' | 'Low position need' | 'Unknown'
  readonly production: { readonly games: number; readonly minutes: string; readonly points: string; readonly rebounds: string; readonly assists: string }
  readonly isOwnPlayer: boolean
  readonly retention?: {
    readonly tone: string
    readonly stayReasons: readonly string[]
    readonly leaveReasons: readonly string[]
    readonly unresolvedConcerns: readonly string[]
    readonly promises: readonly { readonly topic: string; readonly fulfillment: string; readonly explanation: string }[]
    readonly relationshipTrust: number | null
    readonly minutesPerGame: number
    readonly gamesPlayed: number
    readonly gamesStarted: number
    readonly headCoach: string
    readonly athleticsAidMinorUnits: number
    readonly institutionalBenefitsMinorUnits: number
    readonly activeNilDeals: number
    readonly portalStatus: string
    readonly portalDeadline?: string
  }
  readonly privateRelationshipCount: number
}

function regionForPlayer(world: GameWorld, playerId: PlayerId, regions?: ReadonlyMap<PlayerId, string>): string | null {
  if (regions !== undefined) return regions.get(playerId) ?? null
  const materialization = Object.values(world.talentMaterializationsByCandidateKey).find((item) => item.playerId === playerId)
  let place = materialization ? world.placesById[materialization.placeId] : undefined
  while (place) {
    if (place.kind === 'COUNTRY_REGION') return place.name
    place = place.parentPlaceId ? world.placesById[place.parentPlaceId] : undefined
  }
  return null
}

export function buildTalentPortalPlayerViewModel(world: GameWorld, playerId: PlayerId, regions?: ReadonlyMap<PlayerId, string>): TalentPortalPlayerViewModel | null {
  const player = world.players[playerId]
  if (!player) return null
  const ownTeam = getUserTeam(world)
  const entry = Object.values(world.transferPortalEntriesById).filter((item) => item.playerId === playerId && (item.sourceTeamId === ownTeam?.id || item.status === 'authorized')).sort((a, b) => b.notifiedOn.localeCompare(a.notifiedOn))[0]
  const team = world.teams[entry?.sourceTeamId ?? '']
  const assessment = ownTeam && Object.values(world.collegeEligibilityAssessmentsById).filter((item) => item.playerId === playerId && item.teamId === ownTeam.id).sort((a, b) => b.assessedOn.localeCompare(a.assessedOn))[0]
  const competition = team && Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id))
  const place = regionForPlayer(world, playerId, regions)
  const own = team?.id === ownTeam?.id
  const positionalNeed = ownTeam ? getTeamRecruitingNeeds(world, ownTeam.id)[player.basketball.primaryPosition] : undefined
  const continuation = own && ownTeam ? assessCollegeContinuation(world, playerId, ownTeam.id) : undefined
  const stats = getPlayerSeasonStats(world, playerId, world.currentSeasonId)
  const averages = calculatePlayerStatAverages(stats)
  const ownPortal = Object.values(world.transferPortalEntriesById).filter((item) => item.playerId === playerId && item.sourceTeamId === ownTeam?.id).sort((a, b) => b.notifiedOn.localeCompare(a.notifiedOn))[0]
  const relationProfiles = Object.values(world.recruitProfilesById).filter((profile) => profile.playerId === playerId && profile.recruitingRpg !== undefined)
  const privateRelationshipCount = own ? relationProfiles.flatMap((profile) => profile.recruitingRpg?.relationships ?? []).filter((relationship) => relationship.programTeamId === ownTeam?.id).length : 0
  return {
    playerId,
    personId: String(player.personId ?? `person:player:${player.id}`),
    playerName: `${player.firstName} ${player.lastName}`,
    institutionName: team?.name ?? 'Institution unavailable',
    position: player.basketball.primaryPosition,
    eligibility: assessment === undefined ? 'Unknown' : assessment.eligible ? 'Eligible' : 'Blocked',
    level: competition ? world.ecosystems[competition.ecosystemId]?.kind ?? 'Pathway unavailable' : 'Pathway unavailable',
    region: place,
    roleFit: positionalNeed === undefined ? 'Unknown' : positionalNeed >= 2 ? 'High position need' : positionalNeed === 1 ? 'Moderate position need' : 'Low position need',
    production: { games: stats.gamesPlayed, minutes: averages.mpg.toFixed(1), points: averages.ppg.toFixed(1), rebounds: averages.rpg.toFixed(1), assists: averages.apg.toFixed(1) },
    isOwnPlayer: own,
    ...(continuation === undefined ? {} : { retention: {
      tone: continuation.tone,
      stayReasons: continuation.stayReasons,
      leaveReasons: continuation.leaveReasons,
      unresolvedConcerns: continuation.unresolvedConcerns,
      promises: continuation.promiseAssessments.map(({ topic, fulfillment, explanation }) => ({ topic, fulfillment, explanation })),
      relationshipTrust: continuation.relationshipTrust,
      minutesPerGame: continuation.experience.minutesPerGame,
      gamesPlayed: continuation.experience.gamesPlayed,
      gamesStarted: continuation.experience.gamesStarted,
      headCoach: ownTeam?.coachId ? `${world.coaches[ownTeam.coachId]?.firstName ?? ''} ${world.coaches[ownTeam.coachId]?.lastName ?? ''}`.trim() || 'Head Coach unavailable' : 'No Head Coach recorded',
      athleticsAidMinorUnits: continuation.compensationContext.athleticsAidMinorUnits,
      institutionalBenefitsMinorUnits: continuation.compensationContext.institutionalBenefitsMinorUnits,
      activeNilDeals: continuation.compensationContext.activeNilDeals,
      portalStatus: ownPortal?.status ?? 'No Portal notice',
      ...(ownPortal?.processingDueOn ? { portalDeadline: ownPortal.processingDueOn } : {}),
    } }),
    privateRelationshipCount,
  }
}

export function buildTalentPortalPlayerViewModels(world: GameWorld): readonly TalentPortalPlayerViewModel[] {
  const userTeam = getUserTeam(world)
  const competition = userTeam && Object.values(world.competitions).find((item) => item.participantTeamIds.includes(userTeam.id) && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
  if (!competition) return []
  const regions = new Map<PlayerId, string>()
  for (const record of Object.values(world.talentMaterializationsByCandidateKey)) {
    let place: Place | undefined = world.placesById[record.placeId]
    while (place && place.kind !== 'COUNTRY_REGION') place = place.parentPlaceId ? world.placesById[place.parentPlaceId] : undefined
    if (place) regions.set(record.playerId, place.name)
  }
  return Object.values(world.transferPortalEntriesById)
    .filter((entry) => entry.ecosystemId === competition.ecosystemId && (entry.status === 'authorized' || (entry.sourceTeamId === userTeam?.id && entry.status === 'noticePending')))
    .flatMap((entry) => { const model = buildTalentPortalPlayerViewModel(world, entry.playerId, regions); return model ? [{ ...model, institutionName: world.teams[entry.sourceTeamId]?.name ?? model.institutionName }] : [] })
}
