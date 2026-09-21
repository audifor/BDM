import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { organizationIdForTeam } from '@/domain/ids'
import { createGovernanceInstitution } from '@/domain/governance'
import { createSupporterRelationship } from '@/domain/supporters'
import { attachWorldDbCompetitionRuntime, updateGameWorld } from '@/domain/world'
import { serializeGameWorldV3 } from './GameWorldSaveV3'
import { deserializeGameWorldSaveV4, deserializeGameWorldV4, migrateGameWorldSaveV3ToV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'

describe('GameWorldSaveV4 competition runtime', () => {
  it('writes the required empty runtime for a world created before V4 runtime exists', () => {
    const world = createNewGame()
    const team = Object.values(world.teams)[0]!
    const v4 = serializeGameWorldV4(world, savedAt)

    expect(v4.schemaVersion).toBe(4)
    expect(team.organizationId).toBe(organizationIdForTeam(team.id))
    expect(v4.payload.organizations.some((organization) => organization.id === team.organizationId)).toBe(true)
    expect(v4.payload.organizationSections.some((section) => section.id === team.organizationSectionId)).toBe(true)
    expect(v4.payload.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })

    const restored = deserializeGameWorldV4(v4)
    expect(restored.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
  })

  it('continues to read pre-91 V4 runtime payloads without a bundle pin', () => {
    const current = serializeGameWorldV4(createNewGame(), savedAt)
    const { competitionRuntimeBundle: _pin, ...pre91Runtime } = current.payload.worldDbCompetitionRuntime
    const { organizations: _organizations, organizationSections: _sections, ...legacyPayload } = current.payload
    const restored = deserializeGameWorldV4({
      ...current,
      payload: {
        ...legacyPayload,
        worldDbCompetitionRuntime: pre91Runtime,
      },
    })

    expect(restored.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
    expect(Object.keys(restored.organizationsById).length).toBeGreaterThan(0)
  })

  it('round-trips populated competition runtime identities and bundle pin', () => {
    const world = attachWorldDbCompetitionRuntime(createNewGame(), {
      competitionRuntimeBundle: {
        contentId: 'bdm-phase1-competition-runtime-v1',
        contentHash: 'a'.repeat(64),
        worldDbSchema: 'DDL-PHASE1-A',
      },
      competitionPlanIds: ['plan:liga-acb:2032', 'plan:euroleague:2032'],
      competitionSeasonIds: ['competition-season:acb:2032', 'competition-season:euroleague:2032'],
    })

    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, savedAt))

    expect(restored.worldDbCompetitionRuntime).toEqual(world.worldDbCompetitionRuntime)
  })

  it('preserves CORE-ORG1 records and BG7 canonical runtime through Save V4', () => {
    const base = createNewGame()
    const team = Object.values(base.teams)[0]!
    const institution = createGovernanceInstitution({
      id: 'university:save-v4',
      universe: 'NCAA',
      name: 'Save V4 University',
      teamIds: [team.id],
    })
    const relationship = createSupporterRelationship({
      id: 'donor:save-v4',
      actor: { kind: 'EXTERNAL', id: 'person:save-v4-donor' },
      kind: 'DONOR',
      institutionId: institution.id,
      scope: 'INSTITUTION_WIDE',
      programTeamIds: [],
      startedOn: '2032-01-01' as never,
      donorPattern: 'RECURRING',
      restricted: false,
    })
    const world = updateGameWorld(base, {
      governanceInstitutions: [institution],
      supporterRelationships: [relationship],
    })
    const v3 = serializeGameWorldV3(world, savedAt)
    const v4 = serializeGameWorldV4(world, savedAt)

    expect(v4.payload.staffCareerRuntime).toEqual(v3.payload.staffCareerRuntime)
    const restored = deserializeGameWorldV4(v4)
    expect(restored.organizationsById).toEqual(world.organizationsById)
    expect(restored.organizationSectionsById).toEqual(world.organizationSectionsById)
    expect(restored.supporterRelationshipsById).toEqual(world.supporterRelationshipsById)
    expect(restored.governanceInstitutionsById).toEqual(world.governanceInstitutionsById)
  })

  it('migrates canonical V3 by preserving V3 fields and adding empty runtime state', () => {
    const v3 = serializeGameWorldV3(createNewGame(), savedAt)
    const v4 = migrateGameWorldSaveV3ToV4(v3)
    const { worldDbCompetitionRuntime, organizations, organizationSections, ...v4CompatibilityPayload } = v4.payload

    expect(v4.schemaVersion).toBe(4)
    expect(v4CompatibilityPayload).toEqual(v3.payload)
    expect(organizations.length).toBeGreaterThan(0)
    expect(organizationSections.length).toBeGreaterThan(0)
    expect(worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
  })

  it('continues to read V3 through the V4 reader with an empty runtime projection', () => {
    const world = createNewGame()
    const legacy = serializeGameWorldV3(world, savedAt)
    const restored = deserializeGameWorldSaveV4(legacy)

    expect(restored.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
    const { worldDbCompetitionRuntime: _runtime, ...legacyCompatibleWorld } = restored
    expect(legacyCompatibleWorld).toEqual(world)
  })

  it('rejects malformed canonical V4 runtime payloads', () => {
    const valid = serializeGameWorldV4(createNewGame(), savedAt)

    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: { ...valid.payload, worldDbCompetitionRuntime: undefined },
    })).toThrow(/must be an object/)
    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: {
        ...valid.payload,
        worldDbCompetitionRuntime: {
          competitionRuntimeBundle: null,
          competitionPlanIds: ['duplicate', 'duplicate'],
          competitionSeasonIds: [],
        },
      },
    })).toThrow(/duplicates/)
    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: {
        ...valid.payload,
        worldDbCompetitionRuntime: {
          competitionRuntimeBundle: null,
          competitionPlanIds: [],
          competitionSeasonIds: [42],
        },
      },
    })).toThrow(/non-empty strings/)
    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: {
        ...valid.payload,
        worldDbCompetitionRuntime: {
          competitionRuntimeBundle: {
            contentId: 'bdm-phase1-competition-runtime-v1',
            contentHash: 'not-a-hash',
            worldDbSchema: 'DDL-PHASE1-A',
          },
          competitionPlanIds: [],
          competitionSeasonIds: [],
        },
      },
    })).toThrow(/64-character lowercase hex digest/)
  })

  it('rejects malformed canonical V4 envelopes', () => {
    const valid = serializeGameWorldV4(createNewGame(), savedAt)
    expect(() => deserializeGameWorldV4({ ...valid, extra: true })).toThrow(/unexpected fields/)
    expect(() => deserializeGameWorldV4({ ...valid, savedAt: 'not-a-date' })).toThrow(/ISO-8601/)
    expect(() => deserializeGameWorldV4({ ...valid, schemaVersion: 5 })).toThrow(/Unsupported save version/)
  })
})
