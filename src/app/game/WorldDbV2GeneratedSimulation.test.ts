import { expect, it } from 'vitest'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { worldDbV2ConnectionBlockers, worldDbV2FamilySignature } from './WorldDbV2Connection'

// Mirror the wire contract emitted by worlddb-v2-simulation-fallback.py. The
// private PBM source is not available in CI; generated candidates still require
// the opt-in 102-row native batch and separate Windows acceptance.
const generated = {
  schema_version: '1.0',
  competition_id: 'competition:BDM-SIM:dyn_championnat-101',
  competition_season_id: 'edition:BDM-SIM:dyn_championnat-101:generated',
  season_label: 'BDM generated season',
  status: 'COMPLETE',
  notes: 'GENERATED_SIMULATION, NOT AN OFFICIAL SPORTING FORMAT',
  variants: [{
    key: 'BDM_SIMULATION',
    name: 'League 101 (simulated)',
    is_real_variant: false,
    entry_selection: { method: 'DIRECT', payload: { team_count: 13 } },
    seeding: { scheme_type: 'RANK_BASED', basis: [{
      type: 'CLASSIFICATION_POINTS_MINILEAGUE_2_1_V1',
      source: 'BDM_GENERATED_SIMULATION, not a federation regulation',
      terminal_tie: 'EXTERNAL_DRAW_REQUIRED',
    }] },
    nodes: [{
      key: 'REGULAR_SEASON', node_type: 'STAGE', role: 'REGULAR_SEASON',
      specialized_type: 'REGULAR_SEASON', team_count: 13,
      pairing: { type: 'ROUND_ROBIN', meetings_per_pair: 2, payload: { policy: 'BDM_GENERATED_DOUBLE_ROUND_ROBIN' } },
      opponent_scope: { type: 'ALL_STAGE', payload: {} },
      hosting: { rule_type: 'BALANCED', payload: {} },
    }],
    edges: [],
  }],
  consequences: [],
  sources: [{
    url: 'https://github.com/audifor/BDM/blob/main/scripts/playable/worlddb-v2-simulation-fallback.py',
    type: 'SECONDARY',
    scope: 'BDM generated gameplay policy ONLY; not an official source',
  }],
}

it('parses a generated, odd-team 13-club candidate and passes the shared round-robin contract', () => {
  const format = parseWorldCompetitionFormatDocument(generated)
  expect(format.competitionId).toBe('competition:BDM-SIM:dyn_championnat-101')
  expect(format.status).toBe('COMPLETE')
  expect(format.variants[0]?.nodes[0]?.teamCount).toBe(13)
  expect(worldDbV2ConnectionBlockers(format, 13)).toEqual([])
  expect(worldDbV2FamilySignature(format)).toContain('regular:ROUND_ROBIN:ALL_STAGE')
})

it('does not let a generated format disguise an edition with the wrong PBM participant count', () => {
  const format = parseWorldCompetitionFormatDocument(generated)
  expect(worldDbV2ConnectionBlockers(format, 12).join(' ')).toContain('13 participants, PBM supplies 12')
})
