import { describe, expect, it } from 'vitest'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { respondToMediaOpportunity } from '@/engine/media'
import { acceptCoachJobOffer, applyUserCoachForJob } from '@/app/coachCareer'
import { createNewGame } from './createNewGame'
import { instantResult } from './playUserGame'

describe('systems activation gameplay', () => {
  it('activates news, media interaction, progression, career memories and persistence through gameplay boundaries', () => {
    const base=createNewGame(); const userTeam=Object.values(base.teams).find(team=>team.coachId===base.userCoachId)!; const userGame=Object.values(base.games).find(game=>game.status==='scheduled'&&(game.homeTeamId===userTeam.id||game.awayTeamId===userTeam.id))!
    const relevant=updateGameWorld(base,{games:Object.values(base.games).map(game=>game.id===userGame.id?{...game,stakes:'final' as never}:game)})
    const beforeProgress=relevant.coachRpgProfilesByCoachId[relevant.userCoachId]!.development.globalProgress
    const played=instantResult(relevant); const media=Object.values(played.mediaOpportunitiesById).find(item=>item.status==='pending')!
    const answered=respondToMediaOpportunity(played,media.id,media.answers[0]!.stance)
    const opening=Object.values(answered.coachJobOpeningsById).find(item=>item.status==='open')!
    const applied=applyUserCoachForJob(answered,opening.id); const offer=Object.values(applied.world.coachJobOffersById).find(item=>item.coachId===answered.userCoachId&&item.status==='pending')!
    const changedClub=acceptCoachJobOffer(applied.world,offer.id); const loaded=deserializeGameWorldV1(serializeGameWorldV1(changedClub,'2032-10-01T00:00:00.000Z'))

    expect(played.coachRpgProfilesByCoachId[played.userCoachId]!.development.globalProgress).toBeGreaterThan(beforeProgress)
    expect(Object.keys(answered.newsItemsById).length).toBeGreaterThan(0)
    expect(Object.keys(answered.mediaInteractionsById)).toHaveLength(1)
    expect(changedClub.teams[opening.teamId]!.coachId).toBe(answered.userCoachId)
    expect(Object.keys(changedClub.memoriesById).length).toBeGreaterThan(0)
    expect(loaded.newsItemsById).toEqual(changedClub.newsItemsById)
    expect(loaded.memoriesById).toEqual(changedClub.memoriesById)
    expect(loaded.mediaInteractionsById).toEqual(changedClub.mediaInteractionsById)
    expect(loaded.coachEmploymentByCoachId[loaded.userCoachId]!.teamId).toBe(opening.teamId)
  })
})
