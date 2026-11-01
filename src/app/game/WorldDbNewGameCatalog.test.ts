import { describe, expect, it } from 'vitest'
import { WORLDDB_V2_GLOBAL_COMPETITIONS } from './WorldDbV2Competitions'
import {
  WORLDDB_NEW_GAME_CATALOG,
  WORLDDB_NEW_GAME_SELECTABLE,
  WORLDDB_NEW_GAME_QUALIFICATION_ONLY,
  WORLDDB_NEW_GAME_COUNTRY_NAMES,
  isWorldDbDirectlySelectable,
} from './WorldDbNewGameCatalog'

describe('WorldDB New Game league availability', () => {
  it('reconciles every legacy PBM UNRESOLVED country in the current catalog without modifying source data', () => {
    const sourceUnresolved = WORLDDB_V2_GLOBAL_COMPETITIONS.filter(item => item.countryCode === 'UNRESOLVED')
    expect(sourceUnresolved.length).toBe(38)
    expect(WORLDDB_NEW_GAME_CATALOG).toHaveLength(WORLDDB_V2_GLOBAL_COMPETITIONS.length)
    expect(WORLDDB_NEW_GAME_CATALOG.filter(item => item.countryCode === 'UNRESOLVED')).toHaveLength(0)
    expect(WORLDDB_NEW_GAME_CATALOG.every(item => Boolean(WORLDDB_NEW_GAME_COUNTRY_NAMES[item.countryCode]))).toBe(true)
    expect(WORLDDB_NEW_GAME_CATALOG.find(item => item.name === 'Greek Basketball League')?.countryCode).toBe('GRC')
    expect(WORLDDB_NEW_GAME_CATALOG.find(item => item.name === 'B.League')?.countryCode).toBe('JPN')
    expect(WORLDDB_NEW_GAME_CATALOG.find(item => item.name === 'ELBL')?.countryCode).toBe('BAL')
  })

  it('cannot select international cup/tournament membership as an initial league', () => {
    const blocked = ['47', '49', '85', '107', '170', '171', '172', '178', '190', '198']
    for (const sourceId of blocked) {
      const id = 'pbm:DYN_championnat:' + sourceId
      expect(isWorldDbDirectlySelectable(id)).toBe(false)
      expect(WORLDDB_NEW_GAME_QUALIFICATION_ONLY.some(item => item.sourceCompetitionId === id)).toBe(true)
    }
    expect(WORLDDB_NEW_GAME_SELECTABLE).toHaveLength(WORLDDB_V2_GLOBAL_COMPETITIONS.length - blocked.length)
    for (const id of ['pbm:DYN_championnat:168', 'pbm:DYN_championnat:121']) {
      expect(isWorldDbDirectlySelectable(id)).toBe(true)
    }
  })
})
