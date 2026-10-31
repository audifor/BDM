import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { ecosystemIdFromString } from '@/domain/ids'
import { createSportsEcosystem } from '@/domain/ecosystem'

/** Adjacent PBM domestic divisions, same country and gender, using a declared
 * one-place standings policy. Missing/ambiguous divisions are never guessed. */
export function bindWorldDbV2SimulatedTiers(world: GameWorld, snapshots: readonly WorldDbV2Snapshot[], nativeIds: ReadonlyMap<string, string>): GameWorld {
  const groups = new Map<string, { competition: GameWorld['competitions'][keyof GameWorld['competitions']]; level: number }[]>()
  for (const snapshot of snapshots) {
    const source = snapshot.competitions[0]!
    const competition = Object.values(world.competitions).find(c => c.id === nativeIds.get(source.entity_id))
    const data = source.reference_data
    if (!competition || !Number.isInteger(data.championnat_pays) || !Number.isInteger(data.division) || Number(data.division) < 1 || data.type_competition !== 0 || data.categorie_age_competition !== 0) continue
    const key = `${data.championnat_pays}:${competition.gender}`
    groups.set(key, [...(groups.get(key) ?? []), { competition, level: Number(data.division) }])
  }
  let current = world
  for (const [key, rows] of groups) {
    const tiers = rows.sort((a, b) => a.level - b.level)
    if (tiers.length < 2 || new Set(tiers.map(t => t.level)).size !== tiers.length) continue
    const rules = tiers.slice(1).flatMap((lower, index) => {
      const upper = tiers[index]!
      return lower.level === upper.level + 1 ? [{ upperCompetitionId: upper.competition.id, lowerCompetitionId: lower.competition.id, exchangeCount: 1 }] : []
    })
    if (!rules.length) continue
    const id = ecosystemIdFromString(`ecosystem:BDM-SIM:domestic:${key}`)
    const ecosystem = createSportsEcosystem({ id, name: `BDM simulated domestic tiers ${key}: one standings place exchanged`, kind: 'fibaLike', category: tiers[0]!.competition.gender === 'female' ? 'women' : 'men', domesticTiers: tiers.map(t => ({ competitionId: t.competition.id, level: t.level })), tierMovementRules: rules })
    const ids = new Set(tiers.map(t => t.competition.id))
    current = updateGameWorld(current, {
      ecosystems: [...Object.values(current.ecosystems), ecosystem],
      competitions: Object.values(current.competitions).map(c => ids.has(c.id) ? { ...c, ecosystemId: id } : c),
    })
  }
  return current
}
