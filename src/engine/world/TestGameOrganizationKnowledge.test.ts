import { createNewGame } from '@/app/game'
import { getEcosystemForTeam } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { describe, expect, it } from 'vitest'
import { ensureTestGameOrganizationKnowledge } from './TestGameOrganizationKnowledge'

describe('test-game organization knowledge', () => {
  it('keeps the ACB test baseline organization-scoped and deterministic', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const category = getEcosystemForTeam(world, team.id)!.category
    const baseline = ensureTestGameOrganizationKnowledge(world)
    expect(world.organizationKnowledge).toEqual([])
    expect(baseline.organizationKnowledge.length).toBeGreaterThan(0)
    expect(baseline.organizationKnowledge.every((entry) => entry.organizationId === team.organizationId)).toBe(true)
    expect(baseline.organizationKnowledge.every((entry) => {
      const subjectTeam = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(entry.subjectPlayerId))
      return subjectTeam === undefined || getEcosystemForTeam(world, subjectTeam.id)?.category === category
    })).toBe(true)
    expect(ensureTestGameOrganizationKnowledge(baseline)).toEqual(baseline)
    expect(baseline.organizationKnowledge[0]!.dimensions.shooting!.provenance).toBe('legacyBaseline')
    expect(baseline).not.toHaveProperty('playerKnowledgeById')
  })
})
