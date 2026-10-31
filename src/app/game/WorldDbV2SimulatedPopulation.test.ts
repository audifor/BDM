import { expect, it } from 'vitest'
import { assertWorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import { projectWorldDbV2 } from './WorldDbV2Game'
import { worldDbV2Calendar, worldDbV2Competition } from './WorldDbV2Competitions'
import { parseGameDate } from '@/domain/date'
import { scheduleRoundsByCalendar } from '@/engine/competition/schedule/SchedulePolicy'

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

it('fits the largest generated double round robin within its fictional season', () => {
  const start = parseGameDate('2025-07-01')
  const calendar = worldDbV2Calendar({ ...format, teamCount: 56 }, start)!
  const dates = scheduleRoundsByCalendar(110, start, calendar.regularSeasonWindow.endDate, calendar)
  expect(dates).toHaveLength(110)
  expect(dates.at(-1)).toBe('2026-05-24')
})

it('retains both original PBM clubs and generates minimum viable rosters and coaches only for simulation candidates', () => {
  const source = emptySourceSnapshot()
  const result = projectWorldDbV2(source, format)
  assertWorldDbGameBootstrapSliceV1(result)
  expect(result.teams.map(t => t.teamId)).toEqual(clubIds)
  expect(result.players).toHaveLength(10)
  expect(result.staffProfiles).toHaveLength(2)
  expect(result.staffAssignments.map(s => s.roleCode)).toEqual(['headCoach', 'headCoach'])
  const generatedCoaches = result.persons.filter(person => person.personId.startsWith('generated-staff-'))
  expect(generatedCoaches).toHaveLength(2)
  expect(generatedCoaches.every(person =>
    person.dateOfBirth !== undefined
    && person.nationalityIds.length > 0
    && (person.physical?.heightCm ?? 0) > 0
    && (person.physical?.weightKg ?? 0) > 0
    && (person.physical?.wingspanCm ?? 0) > 0
    && (person.physical?.standingReachCm ?? 0) > 0,
  )).toBe(true)
  expect(result.players.every(p => p.playerId.startsWith('bdm:generated-player:'))).toBe(true)
  expect(result.players.every(p => result.rosterAssignments.some(r => r.playerId === p.playerId))).toBe(true)
  expect(result.persons).toHaveLength(result.players.length + generatedCoaches.length)
  expect(result.players.every(player => result.persons.some(person => person.personId === player.personId))).toBe(true)
  expect(projectWorldDbV2(source, format)).toEqual(result)
})

it('leaves the source-backed population gate unchanged and never invents a PBM coach', () => {
  expect(() => projectWorldDbV2(emptySourceSnapshot(), { ...format, formatProvenance: 'DOCUMENTED_DERIVED' }))
    .toThrow('PBM pilot club lacks an original head-coach candidate')
})

it('preserves the source competition and team genders for a women’s league', () => {
  const source = emptySourceSnapshot()
  const female = {
    ...source,
    competitions: source.competitions.map(c => ({ ...c, reference_data: { ...c.reference_data, sexe: 1 } })),
    clubs: source.clubs.map(c => ({ ...c, reference_data: { ...c.reference_data, sexe: 1 } })),
  }
  const result = projectWorldDbV2(female, format)
  expect(result.competition.gender).toBe('female')
  expect(result.ecosystem.category).toBe('women')
  expect(result.organizationSections.every(section => section.gender === 'FEMALE')).toBe(true)
  expect(result.persons.every(person => person.gender === 'female')).toBe(true)
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
