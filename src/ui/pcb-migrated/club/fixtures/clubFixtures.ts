/** Deterministic UI-only fixture data for the migrated PCB Club surfaces. */
export const clubFixtures = {
  alerts: [{ id: 'a1', severity: 'high', title: 'Renovación pendiente', body: 'El contrato de Marcus Cole vence en seis meses.', state: 'open' }, { id: 'a2', severity: 'info', title: 'Informe de rendimiento', body: 'El equipo mejora su eficiencia defensiva.', state: 'open' }],
  objectives: { league: { id: 'league', title: 'Clasificar para playoff', current: 3, target: 8, progress: 72 }, finances: { id: 'finances', title: 'Cerrar con saldo positivo', current: 850000, target: 1000000, progress: 85 } },
  matches: [{ id: 'm1', date: '2026-10-12', opponent: 'Real Madrid', competition: 'ACB', venue: 'Local' }, { id: 'm2', date: '2026-10-19', opponent: 'Valencia Basket', competition: 'ACB', venue: 'Visitante' }],
  transactions: [{ id: 't1', date: '2026-09-01', type: 'TV Rights', amount: 190000, category: 'income', description: 'Derechos televisivos' }, { id: 't2', date: '2026-09-05', type: 'Wages', amount: -145000, category: 'expense', description: 'Nóminas de septiembre' }],
  trophies: [{ id: 'tr1', name: 'Liga ACB', category: 'league', season: '2021/22', year: 2022 }, { id: 'tr2', name: 'Copa del Rey', category: 'cup', season: '2019/20', year: 2020 }],
  records: { points_game: { label: 'Puntos en un partido', value: 112, holder: 'Marcus Cole', date: 1700000000 }, wins_season: { label: 'Victorias en una temporada', value: 28, holder: 'Club', date: 1700000000 } },
  milestones: [{ id: 'ms1', title: 'Fundación del club', description: 'Nacimiento de la entidad.', date: 631152000 }, { id: 'ms2', title: 'Primer título nacional', description: 'Campeón de Copa.', date: 1577836800 }],
  seasons: [{ season_year: 2026, season: '2026/27', competition: 'ACB', position: 3, wins: 16, losses: 8 }, { season_year: 2025, season: '2025/26', competition: 'ACB', position: 5, wins: 20, losses: 14 }],
  hallOfFame: [{ id: 'hof1', name: 'Javier Moreno', position: 'PG', years: '1995-2008', achievements: ['MVP Liga', '2 Copas'] }],
}
