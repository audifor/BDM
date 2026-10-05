import type { OrganizationKnowledge, OrganizationKnowledgeDimension } from '@/domain/knowledge'
import { BASKETBALL_RATING_KEYS, legacyRatingSignals } from '@/domain/player'
import { getEcosystemForTeam, updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

const LEGACY_DIMENSION_BY_RATING = {
  finishing: 'finishing',
  shooting: 'shooting',
  playmaking: 'creation',
  perimeterDefense: 'perimeterDefense',
  interiorDefense: 'interiorDefense',
  rebounding: 'rebounding',
  athleticism: 'physical',
} as const

/** Preserves the ACB test universe's deterministic baseline as current organization knowledge. */
export function ensureTestGameOrganizationKnowledge(world: GameWorld): GameWorld {
  const observer = getUserTeam(world)
  if (observer === undefined) return world
  const observerCategory = getEcosystemForTeam(world, observer.id)?.category
  const existing = world.organizationKnowledge.filter((knowledge) => knowledge.organizationId === observer.organizationId)
  const known = new Set(existing.map((knowledge) => knowledge.subjectPlayerId))
  const additions: OrganizationKnowledge[] = Object.values(world.players).flatMap((player) => {
    if (known.has(player.id)) return []
    const subjectTeam = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(player.id))
    if (observerCategory && subjectTeam && getEcosystemForTeam(world, subjectTeam.id)?.category !== observerCategory) return []
    const own = Object.values(world.teams).some((team) => team.organizationId === observer.organizationId && team.rosterPlayerIds.includes(player.id))
    const ratings = legacyRatingSignals(player.basketball.ratings)
    const dimensions: Record<string, OrganizationKnowledgeDimension> = Object.fromEntries(BASKETBALL_RATING_KEYS.map((key) => {
      const estimate = new SeededRandomSource(hashStringToSeed(`player-knowledge-estimate-v1:${observer.organizationId}:${player.id}:${key}`)).nextInt(own ? -1 : -6, own ? 1 : 6)
      const uncertainty = new SeededRandomSource(hashStringToSeed(`player-knowledge-uncertainty-v1:${observer.organizationId}:${player.id}:${key}`)).nextInt(own ? 1 : 4, own ? 2 : 8)
      const estimatedValue = Math.max(0, Math.min(100, ratings[key] + estimate))
      return [LEGACY_DIMENSION_BY_RATING[key], { coverage: own ? 0.65 : 0.35, confidence: Math.max(0.1, Math.min(0.9, 1 - uncertainty / 25)), assessedAt: world.currentDate, provenance: 'legacyBaseline', estimate: estimatedValue, uncertainty }]
    }))
    return [{ organizationId: observer.organizationId, subjectPlayerId: player.id, dimensions }]
  })
  return additions.length === 0 ? world : updateGameWorld(world, { organizationKnowledge: [...world.organizationKnowledge, ...additions] })
}
