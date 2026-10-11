import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { updateGameWorld } from '@/domain/world'
import { sportsCategoryForGender } from '@/domain/primitives'
import { openDraft, progressDraftAi, projectDraftCandidates } from '@/engine/draft'
import { projectProductionDraftPool } from '@/engine/season/SeasonContentLifecycle'

it('resolves both actual 2036 Drafts from the mixed-category failed Save without changing identities', () => {
  const path = process.env.BS15I_DRAFT_REPRO_SAVE
  if (path === undefined) return
  let world = deserializeGameWorldV4(JSON.parse(readFileSync(path, 'utf8')))
  const identities = Object.values(world.players).map(player => [player.id, player.personId])
  const drafts = Object.values(world.draftsById).filter(draft => draft.status === 'scheduled' && draft.scheduledOn.startsWith('2036'))
  expect(drafts).toHaveLength(2)
  for (const draft of drafts) {
    const category = world.ecosystems[draft.ecosystemId]!.category
    const candidates = projectDraftCandidates(world, draft.id).playerIds
    const production = projectProductionDraftPool(world, draft.sourceSeasonId, draft.rules, draft.scheduledOn).playerIds
    expect(candidates.length).toBeGreaterThan(0)
    expect(production.length).toBeGreaterThan(0)
    for (const id of [...candidates, ...production]) expect(sportsCategoryForGender(world.players[id]!.gender)).toBe(category)
    world = progressDraftAi(openDraft(updateGameWorld(world, { currentDate: draft.scheduledOn }), draft.id), draft.id)
    expect(world.draftsById[draft.id]!.status).toBe('completed')
    const picks = Object.values(world.draftPicksById).filter(pick => pick.draftId === draft.id)
    for (const pick of picks) expect(world.players[pick.selection!.playerId]!.gender).toBe(world.teams[pick.ownerTeamId]!.gender)
    expect(new Set(picks.map(pick => pick.selection!.playerId)).size).toBe(picks.length)
  }
  world = deserializeGameWorldV4(serializeGameWorldV4(world, '2036-06-23T00:00:00.000Z'))
  expect(Object.values(world.players).map(player => [player.id, player.personId])).toEqual(identities)
}, 90_000)

it('excludes previously selected Players from both actual 2037 Drafts and preserves their prior rights', () => {
  const path = process.env.BS15I_DRAFT_REPEAT_REPRO_SAVE
  if (path === undefined) return
  let world = deserializeGameWorldV4(JSON.parse(readFileSync(path, 'utf8')))
  const identities = Object.values(world.players).map(player => [player.id, player.personId])
  const priorPicks = Object.values(world.draftPicksById).filter(pick => pick.selection !== undefined)
  const selected = new Set(priorPicks.map(pick => pick.selection!.playerId))
  expect(selected.size).toBe(16)
  const priorRights = world.playerRightsById
  const drafts = Object.values(world.draftsById).filter(draft => draft.status === 'scheduled' && draft.scheduledOn.startsWith('2037'))
  expect(drafts).toHaveLength(2)
  for (const draft of drafts) {
    const candidates = projectDraftCandidates(world, draft.id).playerIds
    const production = projectProductionDraftPool(world, draft.sourceSeasonId, draft.rules, draft.scheduledOn).playerIds
    expect(candidates.filter(id => selected.has(id))).toEqual([])
    expect(production.filter(id => selected.has(id))).toEqual([])
    expect(candidates.length).toBeGreaterThan(0)
    world = progressDraftAi(openDraft(updateGameWorld(world, { currentDate: draft.scheduledOn }), draft.id), draft.id)
    expect(world.draftsById[draft.id]!.status).toBe('completed')
  }
  const restored = deserializeGameWorldV4(serializeGameWorldV4(world, '2037-06-23T00:00:00.000Z'))
  const picks = Object.values(restored.draftPicksById).filter(pick => pick.selection !== undefined)
  expect(new Set(picks.map(pick => pick.selection!.playerId)).size).toBe(picks.length)
  for (const pick of priorPicks) expect(restored.draftPicksById[pick.id]).toEqual(pick)
  for (const [id, rights] of Object.entries(priorRights)) expect(restored.playerRightsById[id]).toEqual(rights)
  expect(Object.values(restored.players).map(player => [player.id, player.personId])).toEqual(identities)
}, 90_000)
