import { expect, it } from 'vitest'
import { assertWorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import { projectWorldDbV2 } from './WorldDbV2Game'
import { worldDbV2Competition } from './WorldDbV2Competitions'

const competitionId = 'pbm:DYN_championnat:92001'
const sourceCountry = 'pbm:DYN_pays:8'
const clubIds = ['pbm:DYN_equipe:92001', 'pbm:DYN_equipe:92002'] as const

function emptySourceSnapshot(): WorldDbV2Snapshot {
  return {
    manifest: { master: { sha256: 'a'.repeat(64) }, configuration: { start_date: '2025-07-01', seed: 'sim-candidate-underpopulated' } },
    countries: [{ entity_id: sourceCountry, parent_id: null, source_table: 'DYN_pays', reference_data: { nom_pays: 'España', abreviation: 'ESP' } }],
    clubs: clubIds.map((id, i) => ({
      entity_id: id, parent_id: sourceCountry, source_table: 'DYN_equipe',
      reference_data: { nom_equipe: `Club PBM ${i + 1}`, sexe: 0 },
    })),
    people: [],
    competitions: [{ entity_id: competitionId, parent_id: sourceCountry, source_table: 'DYN_championnat', reference_data: { nom_ligue: 'BDM Simulation Test' } }],
  }
}

const base = worldDbV2Competition()
const format = {
  ...base,
  sourceCompetitionId: competitionId,
  nativeCompetitionId: 'competition:BDM-SIM:dyn_championnat-92001',
  editionId: 'edition:BDM-SIM:dyn_championnat-92001:generated',
  ecosystemId: 'ecosystem:BDM-SIM:dyn_championnat-92001',
  name: 'BDM simulation test',
  teamCount: 2,
  calendar: 'FORMAT_DERIVED_SIMULATION',
  formatProvenance: 'GENERATED_SIMULATION',
}

it('retains both original PBM clubs and generates minimum viable rosters and coaches only for simulation candidates', () => {
  const source = emptySourceSnapshot()
  const result = projectWorldDbV2(source, format)
  assertWorldDbGameBootstrapSliceV1(result)
  expect(result.teams.map(t => t.teamId)).toEqual(clubIds)
  expect(result.players).toHaveLength(10)
  expect(result.staffProfiles).toHaveLength(2)
  expect(result.staffAssignments.map(s => s.roleCode)).toEqual(['headCoach', 'headCoach'])
  expect(result.players.every(p => p.playerId.startsWith('bdm:generated-player:'))).toBe(true)
  expect(result.players.every(p => result.rosterAssignments.some(r => r.playerId === p.playerId))).toBe(true)
  expect(result.persons.every(p => p.personId.startsWith('bdm:'))).toBe(true)
  expect(projectWorldDbV2(source, format)).toEqual(result)
})

it('leaves the source-backed population gate unchanged and never invents a PBM coach', () => {
  expect(() => projectWorldDbV2(emptySourceSnapshot(), { ...format, formatProvenance: 'DOCUMENTED_DERIVED' }))
    .toThrow('PBM pilot club lacks an original head-coach candidate')
})

it('keeps original staffed teams unmodified when the simulation fallback is enabled', () => {
  const source = emptySourceSnapshot()
  const originalCoach = 'pbm:DYN_person:92001'
  const coached = {
    ...source,
    people: [{
      entity_id: originalCoach, parent_id: clubIds[0], source_table: 'DYN_person',
      reference_data: {
        prenom: 'Original', nom: 'Coach', sexe: 0,
        annee_naissance: 1980, mois_naissance: 1, jour_naissance: 1,
        nationalite_id: 8, taille: 180, poids: 80,
        job_preference_coach: 100, job_preference_chairman: 0,
      },
    }],
  }
  const result = projectWorldDbV2(coached, format)
  expect(result.staffAssignments.find(s => s.teamId === clubIds[0])?.staffId).toBe(originalCoach)
  expect(result.staffAssignments.find(s => s.teamId === clubIds[1])?.staffId).toMatch(/^generated-staff-/)
  expect(result.players.filter(p => p.playerId.startsWith('bdm:generated-player:'))).toHaveLength(10)
})
