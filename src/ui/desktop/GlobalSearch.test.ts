import { describe, expect, it } from 'vitest'
import { normalizeSearchQuery, scoreSearch } from './GlobalSearch'
describe('global search helpers', () => { it('normalizes accents and ranks exact matches first', () => { expect(normalizeSearchQuery('  Álvarez  Reyes ')).toBe('alvarez reyes'); const result = { id: 'app:league', type: 'APP' as const, title: 'Liga', keywords: ['standings'] }; expect(scoreSearch(result, 'liga')).toBeGreaterThan(scoreSearch(result, 'iga')) }) })
