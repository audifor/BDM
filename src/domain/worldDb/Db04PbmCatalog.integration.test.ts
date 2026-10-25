import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createWorldDbCompetitionRuntimeV1 } from '@/engine/competition/WorldDbCompetitionRuntime'
import {
  parseDb04PbmCompetitionDetailV1,
  parseDb04PbmCompetitionsResponseV1,
  parseDb04PbmCountriesResponseV1,
  toWorldDbCompetitionBundleV1,
} from './Db04PbmCatalogContract'

const dbPath = 'C:/BDM_DB/WORLDDB_PBM/DB-04/worlddb_db04_acb_pilot_certified.db'
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

function readCli(...args: string[]): unknown {
  const result = runCli(...args)
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr.trim() || `DB-06 CLI exited with ${String(result.status)}`)
  return JSON.parse(result.stdout)
}

function runCli(...args: string[]) {
  return spawnSync('cargo', [
    'run', '--quiet', '--manifest-path', 'src-tauri/Cargo.toml', '--bin', 'worlddb-pbm-catalog', '--',
    ...args, '--database', dbPath,
  ], { cwd: repoRoot, encoding: 'utf8', windowsHide: true })
}

describe('DB-06 real DB-04 catalog reader', () => {
  it('lists countries and PBM competitions with explicit certification states', () => {
    const countries = parseDb04PbmCountriesResponseV1(readCli('countries'))
    expect(countries.countries).toHaveLength(210)
    expect(countries.countries.filter((country) => country.sourceCode === 'ESP')).toMatchObject([
      { countryKey: 'PBM:COUNTRY:8', sourceId: 8, name: 'Espagne', sourceCode: 'ESP' },
    ])

    const all = parseDb04PbmCompetitionsResponseV1(readCli('competitions'))
    expect(all.competitions).toHaveLength(201)
    expect(all.competitions.every((competition) => competition.sourceSystem === 'PBM')).toBe(true)
    const spain = parseDb04PbmCompetitionsResponseV1(readCli('competitions', '--country', 'ESP'))
    expect(spain.competitions).toHaveLength(6)
    expect(spain.competitions.filter((competition) => competition.availability === 'CERTIFIED_DATA_ONLY')).toMatchObject([
      { certifiedCompetitionId: 'competition:ESP:liga-endesa', displayName: 'Liga Endesa', gameExecutable: false },
    ])
    expect(spain.competitions.filter((competition) => competition.availability === 'SOURCE_ONLY_UNVERIFIED')).toHaveLength(5)
    const unknownCountry = runCli('competitions', '--country', 'ZZZ')
    expect(unknownCountry.status).not.toBe(0)
    expect(unknownCountry.stderr).toContain('Unknown PBM source country code: ZZZ')
  })

  it('reads the exact ACB edition, participant identities, sources and graph into existing BDM contracts', () => {
    const raw = readCli('competition', '--id', 'competition:ESP:liga-endesa')
    const again = readCli('competition', '--id', 'competition:ESP:liga-endesa')
    expect(JSON.stringify(raw)).toBe(JSON.stringify(again))
    const detail = parseDb04PbmCompetitionDetailV1(raw)
    expect(detail.competition.certifiedCompetitionId).toBe('competition:ESP:liga-endesa')
    expect(detail.teams).toHaveLength(18)
    expect(detail.teams.every((team) => team.canonicalTeamId !== null)).toBe(true)
    expect(detail.teams.every((team) => team.sourceProvenance.length > 0 && team.competitionLinkEvidence.length > 0)).toBe(true)
    expect(new Set(detail.teams.map((team) => team.sourceTeamId)).size).toBe(18)
    expect(detail.editions).toHaveLength(1)
    const edition = detail.editions[0]!
    expect(edition.editionId).toBe('edition:ESP:liga-endesa:2025-26')
    expect(edition.participants).toHaveLength(18)
    expect(edition.participants.every((participant) => participant.status === 'CERTIFIED_FOR_EDITION' && participant.confidence === 'HIGH_EDITION_CROSSWALK')).toBe(true)
    expect(edition.participants.every((participant) => participant.provenance.length > 0 && participant.officialMembershipId.length > 0)).toBe(true)
    expect(new Set(edition.participants.map((participant) => participant.canonicalTeamId))).toEqual(new Set(detail.teams.map((team) => team.canonicalTeamId)))
    expect(edition.formatVersion).toBe('ACB-LIGA-ENDESA-2025-26.v1')
    expect(edition.formatDocument?.variants[0]?.nodes.map((node) => node.key)).toEqual(['REGULAR', 'QUARTERFINALS', 'SEMIFINALS', 'FINAL'])
    expect(edition.formatDocument?.variants[0]?.edges.map((edge) => [edge.from, edge.to, edge.selector])).toEqual([
      ['REGULAR', 'QUARTERFINALS', 'RANK_RANGE'],
      ['QUARTERFINALS', 'SEMIFINALS', 'WINNER'],
      ['SEMIFINALS', 'FINAL', 'WINNER'],
    ])
    expect(edition.sources).toHaveLength(5)
    expect(edition.sourceRules).toHaveLength(3)

    const bundle = toWorldDbCompetitionBundleV1(detail, edition.editionId)
    const runtime = createWorldDbCompetitionRuntimeV1(bundle)
    expect(runtime.bundle.entries).toHaveLength(18)
    expect(runtime.entryIdsByNodeId.REGULAR).toHaveLength(18)
    expect(runtime.nodeById).toHaveProperty('FINAL')
    expect(runtime.childNodeIdsByNodeId.REGULAR).toEqual(['QUARTERFINALS'])
    expect(runtime.childNodeIdsByNodeId.QUARTERFINALS).toEqual(['SEMIFINALS'])
    expect(runtime.childNodeIdsByNodeId.SEMIFINALS).toEqual(['FINAL'])
    expect(runtime.bundle.fixtures).toHaveLength(0)
    expect(runtime.bundle.structureEdges).toHaveLength(3)
  })

  it('returns source-only competitions and unresolved PBM references without assigning execution status', () => {
    const detail = parseDb04PbmCompetitionDetailV1(readCli('competition', '--id', 'PBM:NATIONAL:5'))
    expect(detail.competition.availability).toBe('CERTIFIED_DATA_ONLY')
    expect(detail.qualificationRelations.filter((row) => (row as Record<string, unknown>).sourceOriginPhaseId === 255)).toHaveLength(21)
    expect(detail.missingReferences).toContainEqual(expect.objectContaining({
      referenceType: 'PHASE', missingSourceId: 255, status: 'UNRESOLVED_PBM_PARENT_IDENTITY', phaseRecordExists: true,
    }))
    expect(detail.totalUnresolvedInheritedRelationFindings).toBe(48)

    const unverified = parseDb04PbmCompetitionDetailV1(readCli('competition', '--id', 'PBM:NATIONAL:112'))
    expect(unverified.competition.availability).toBe('SOURCE_ONLY_UNVERIFIED')
    expect(unverified.competition.gameExecutable).toBe(false)
    expect(unverified.competition.formatStatus).toBe('PROVISIONAL')
    expect(unverified.editions).toEqual([])
    expect(() => toWorldDbCompetitionBundleV1(unverified, 'not-an-edition')).toThrow('Documented DB-04 edition not found')
    const unknownCompetition = runCli('competition', '--id', 'competition:UNKNOWN')
    expect(unknownCompetition.status).not.toBe(0)
    expect(unknownCompetition.stderr).toContain('Competition not found in DB-03/04 catalog: competition:UNKNOWN')
  })
})
