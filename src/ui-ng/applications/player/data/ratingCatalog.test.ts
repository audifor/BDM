import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { PLAYER_TRUTH_RATING_KEYS, type PlayerTruthRatings } from '@/domain/player'

import { buildFullRatingRows, ratingCategory } from './ratingCatalog'

const playerUiRoot = fileURLToPath(new URL('..', import.meta.url))

function playerUiSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return playerUiSourceFiles(path)
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return []
    return [path]
  })
}

describe('Player NG canonical rating catalog', () => {
  it('exposes exactly the 80 raw Player Truth keys in canonical order and value', () => {
    expect(PLAYER_TRUTH_RATING_KEYS).toHaveLength(80)
    const ratings = Object.fromEntries(PLAYER_TRUTH_RATING_KEYS.map((key, index) => [key, index + 1])) as PlayerTruthRatings
    const rows = buildFullRatingRows(ratings)

    expect(rows).toHaveLength(80)
    expect(rows.map((row) => row.id)).toEqual(PLAYER_TRUTH_RATING_KEYS)
    expect(rows.map((row) => row.value)).toEqual(PLAYER_TRUTH_RATING_KEYS.map((key) => ratings[key]))
    expect(new Set(rows.map((row) => row.id)).size).toBe(80)
    expect(rows.every((row) => row.category === ratingCategory(row.id))).toBe(true)
  })

  it('has no dependency on the legacy 35-key catalog or history adapter', () => {
    const legacyPlayerUiSource = playerUiSourceFiles(playerUiRoot)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    expect(legacyPlayerUiSource).not.toMatch(/CANONICAL_RATING_KEYS|CanonicalRatingKey|ratingHistorySeries/)
  })
})
