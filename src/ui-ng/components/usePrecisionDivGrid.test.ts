import { describe, expect, it } from 'vitest'

import { reorderColumn } from '@/ui/dataGrid/columns'
import { normalizeDivColumnOrder, type PrecisionDivColumn } from '@/ui-ng/components/usePrecisionDivGrid'

const columns: readonly PrecisionDivColumn[] = [
  { id: 'player', label: 'Jugador', width: 220 },
  { id: 'pos', label: 'POS', width: 56 },
  { id: 'module', label: 'Módulo', width: 180, flex: 1.4 },
]

describe('usePrecisionDivGrid helpers', () => {
  it('keeps known order and appends new columns', () => {
    expect(normalizeDivColumnOrder(columns, ['module', 'missing', 'player']).map((column) => column.id)).toEqual([
      'module',
      'player',
      'pos',
    ])
  })

  it('reorders columns the same way as the roster grid', () => {
    expect(reorderColumn(['player', 'pos', 'module'], 'module', 'player', false)).toEqual(['module', 'player', 'pos'])
  })
})
