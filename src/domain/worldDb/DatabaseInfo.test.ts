import { describe, expect, it } from 'vitest'

import { assertWorldDbDatabaseInfoV1 } from './DatabaseInfo'

describe('WorldDbDatabaseInfoV1', () => {
  it('accepts a compatible database description', () => {
    const value: unknown = {
      schemaVersion: 1,
      source: { databaseId: 'bdm_world_ddl12.db', schemaId: 'DDL-PHASE1-A' },
      competitionSeasonIds: ['season:1', 'season:2'],
    }

    expect(() => assertWorldDbDatabaseInfoV1(value)).not.toThrow()
  })

  it('rejects duplicate competition seasons', () => {
    expect(() => assertWorldDbDatabaseInfoV1({
      schemaVersion: 1,
      source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
      competitionSeasonIds: ['season:1', 'season:1'],
    })).toThrow('must not contain duplicates')
  })
})
