import { WORLDDB_V2_GLOBAL_COMPETITIONS } from './WorldDbV2Competitions'

/**
 * New Game display reconciliation of legacy PBM country IDs.
 * Do not mutate PBM exports: countryId remains the canonical source identity.
 * International tournaments are visible for context but cannot be selected as a
 * starting league. Their participation must be derived from sporting/regulatory
 * pathways, which the current bootstrap does not implement.
 */
const sourceCountryCodes: Readonly<Record<number, string>> = {
  0: 'INT', 7: 'PRT', 11: 'CHE', 12: 'DNK', 15: 'HRV', 17: 'SWE',
  21: 'LTU', 24: 'SVK', 25: 'HUN', 28: 'BGR', 30: 'GRC', 32: 'SVN',
  35: 'BIH', 54: 'SRB', 61: 'CYP', 64: 'BLR', 79: 'CHL', 81: 'KOR',
  89: 'JPN', 143: 'GBR', 198: 'BAL', 202: 'BNX', 212: 'INT', 213: 'INT',
}

export const WORLDDB_NEW_GAME_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  ALB: 'Albania', ARG: 'Argentina', AUS: 'Australia', AUT: 'Austria',
  BAL: 'Estonia y Letonia', BGR: 'Bulgaria', BIH: 'Bosnia y Herzegovina',
  BLR: 'Bielorrusia', BNX: 'Bélgica y Países Bajos', BRA: 'Brasil',
  CAN: 'Canadá', CHE: 'Suiza', CHL: 'Chile', CHN: 'China',
  COL: 'Colombia', CYP: 'Chipre', CZE: 'Chequia', DEU: 'Alemania',
  DNK: 'Dinamarca', DOM: 'República Dominicana', ESP: 'España',
  FIN: 'Finlandia', FRA: 'Francia', GBR: 'Reino Unido',
  GEO: 'Georgia', GRC: 'Grecia', HRV: 'Croacia', HUN: 'Hungría',
  INT: 'Competiciones internacionales', ISL: 'Islandia', ISR: 'Israel',
  ITA: 'Italia', JPN: 'Japón', KOR: 'Corea del Sur',
  LTU: 'Lituania', LUX: 'Luxemburgo', MAC: 'Macedonia del Norte',
  MEX: 'México', MNE: 'Montenegro', NOR: 'Noruega',
  NZL: 'Nueva Zelanda', PAN: 'Panamá', PHL: 'Filipinas',
  POL: 'Polonia', PRT: 'Portugal', ROU: 'Rumanía',
  RUS: 'Rusia', SRB: 'Serbia', SVK: 'Eslovaquia',
  SVN: 'Eslovenia', SWE: 'Suecia', TUR: 'Turquía',
  TWN: 'Taiwán', UKR: 'Ucrania', URY: 'Uruguay',
  USA: 'Estados Unidos', VEN: 'Venezuela', XKX: 'Kosovo',
}

/** Country 0 is the PBM international competition marker.
 * WABA and Women's Baltic league are regional club tournaments.
 * BNXT and ELBL are joint domestic leagues, so remain directly selectable.
 */
const qualificationOnlyCountryIds = new Set([0, 212, 213])

export const WORLDDB_NEW_GAME_CATALOG = WORLDDB_V2_GLOBAL_COMPETITIONS.map(item => ({
  ...item,
  countryCode: item.countryCode === 'UNRESOLVED'
    ? (sourceCountryCodes[item.countryId] ?? 'UNRESOLVED')
    : item.countryCode,
  directlySelectable: !qualificationOnlyCountryIds.has(item.countryId)
    && item.countryCode !== 'INT',
}))

export const WORLDDB_NEW_GAME_SELECTABLE = WORLDDB_NEW_GAME_CATALOG.filter(item => item.directlySelectable)
export const WORLDDB_NEW_GAME_QUALIFICATION_ONLY = WORLDDB_NEW_GAME_CATALOG.filter(item => !item.directlySelectable)

const directIds = new Set(WORLDDB_NEW_GAME_SELECTABLE.map(item => item.sourceCompetitionId))
export function isWorldDbDirectlySelectable(id: string): boolean {
  return directIds.has(id)
}
