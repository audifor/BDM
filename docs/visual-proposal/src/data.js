// Datos ilustrativos basados en el mundo de prueba de BDM (Virelia Horizon League)
export const LEAGUE = { name: 'Virelia Horizon League', season: '2032-33', date: '14 DIC 2032', dateLong: 'Miércoles 14 de diciembre de 2032' }

export const TEAMS = {
  DO: { id: 'DO', name: 'Dunmere Orbits', short: 'Orbits', c1: '#b0307f', c2: '#f1b24a', city: 'Dunmere' },
  LF: { id: 'LF', name: 'Larkspur Forge', short: 'Forge', c1: '#2e9d62', c2: '#d9e36b', city: 'Larkspur' },
  HL: { id: 'HL', name: 'Highridge Lanterns', short: 'Lanterns', c1: '#e0762f', c2: '#ffd98a', city: 'Highridge' },
  GS: { id: 'GS', name: 'Glimmerport Stags', short: 'Stags', c1: '#3a73d6', c2: '#bfd6ff', city: 'Glimmerport' },
  BS: { id: 'BS', name: 'Brimford Stars', short: 'Stars', c1: '#7c4bd1', c2: '#ffe27a', city: 'Brimford' },
  IV: { id: 'IV', name: 'Ironhollow Vipers', short: 'Vipers', c1: '#3f4a55', c2: '#8fe35b', city: 'Ironhollow' },
  AK: { id: 'AK', name: 'Ashvale Kites', short: 'Kites', c1: '#c23b4a', c2: '#f4d6c0', city: 'Ashvale' },
  JS: { id: 'JS', name: 'Juniper Coast Sails', short: 'Sails', c1: '#169db0', c2: '#fff1c2', city: 'Juniper Coast' },
}

// pos, edad, altura cm, peso kg, ovr, atributos por grupo
export const PLAYERS = [
  { id: 1, n: 'Arel Bexley', pos: 'PG', age: 19, num: 4, h: 180, w: 74, seed: 72, skin: 3, st: 'OK', role: 'Director de juego', min: 31.2, pts: 14.8, reb: 3.1, ast: 7.2, form: [7.1, 6.4, 7.8, 8.2, 6.9, 7.5, 8.0], wage: 1.1, yrs: 3 },
  { id: 2, n: 'Hira Elian', pos: 'PG', age: 23, num: 11, h: 183, w: 79, seed: 54, skin: 5, st: 'OK', role: 'Reserva', min: 14.1, pts: 4.2, reb: 1.4, ast: 3.1, form: [6.0, 5.8, 6.2, 6.1, 5.9, 6.4, 6.0], wage: 0.4, yrs: 2 },
  { id: 3, n: 'Hira Elian', pos: 'SG', age: 26, num: 7, h: 191, w: 86, seed: 47, skin: 2, st: 'OK', role: 'Rotación', min: 11.3, pts: 3.6, reb: 1.9, ast: 1.1, form: [5.8, 6.0, 5.5, 6.1, 5.7, 6.0, 5.9], wage: 0.3, yrs: 1 },
  { id: 4, n: 'Arel Dain', pos: 'SG', age: 27, num: 3, h: 193, w: 88, seed: 68, skin: 4, st: 'OK', role: 'Anotador', min: 28.4, pts: 16.3, reb: 3.8, ast: 2.9, form: [7.0, 7.4, 6.6, 7.9, 7.2, 6.8, 7.5], wage: 0.9, yrs: 2 },
  { id: 5, n: 'Jora Joren', pos: 'SG', age: 18, num: 21, h: 195, w: 85, seed: 46, skin: 1, st: 'OK', role: 'Promesa', min: 8.0, pts: 2.8, reb: 1.2, ast: 0.9, form: [5.5, 5.9, 6.2, 6.0, 6.4, 6.3, 6.6], wage: 0.2, yrs: 4 },
  { id: 6, n: 'Hira Corven', pos: 'SF', age: 29, num: 8, h: 201, w: 95, seed: 53, skin: 3, st: 'OK', role: 'Rotación', min: 16.6, pts: 6.1, reb: 3.5, ast: 1.6, form: [6.1, 6.0, 6.3, 5.9, 6.2, 6.0, 6.1], wage: 0.5, yrs: 2 },
  { id: 7, n: 'Arel Farrow', pos: 'SF', age: 23, num: 14, h: 203, w: 98, seed: 44, skin: 5, st: 'OK', role: 'Rotación', min: 9.8, pts: 3.0, reb: 2.2, ast: 0.8, form: [5.6, 5.4, 5.8, 5.5, 5.9, 5.7, 5.6], wage: 0.3, yrs: 1 },
  { id: 8, n: 'Bren Farrow', pos: 'PF', age: 18, num: 32, h: 206, w: 101, seed: 64, skin: 2, st: 'OK', role: 'Cuarto abierto', min: 22.5, pts: 9.7, reb: 6.2, ast: 1.8, form: [6.8, 7.1, 6.5, 7.3, 7.0, 7.6, 7.2], wage: 0.6, yrs: 4 },
  { id: 9, n: 'Bren Istra', pos: 'PF', age: 19, num: 23, h: 208, w: 104, seed: 82, skin: 4, st: 'OK', role: 'Estrella', min: 33.8, pts: 21.6, reb: 9.4, ast: 3.3, form: [8.4, 7.9, 8.8, 9.1, 8.2, 8.6, 9.0], wage: 2.4, yrs: 5 },
  { id: 10, n: 'Jora Corven', pos: 'PF', age: 30, num: 44, h: 205, w: 107, seed: 52, skin: 3, st: 'OK', role: 'Veterano', min: 15.2, pts: 5.4, reb: 4.9, ast: 1.2, form: [6.0, 5.9, 6.1, 6.0, 5.8, 6.2, 6.0], wage: 0.5, yrs: 1 },
  { id: 11, n: 'Hira Corven', pos: 'C', age: 21, num: 15, h: 211, w: 112, seed: 54, skin: 1, st: 'LES', role: 'Protector del aro', min: 17.0, pts: 6.8, reb: 6.3, ast: 0.9, form: [6.2, 6.4, 6.0, 6.6, 6.3, 5.8, 0], wage: 0.4, yrs: 3 },
  { id: 12, n: 'Hira Joren', pos: 'C', age: 34, num: 50, h: 213, w: 118, seed: 46, skin: 5, st: 'OK', role: 'Veterano', min: 10.4, pts: 3.1, reb: 3.3, ast: 0.6, form: [5.4, 5.6, 5.5, 5.3, 5.7, 5.5, 5.4], wage: 0.35, yrs: 1 },
]

export const ATTRS = {
  Tiro: [['Tiro de tres', 79], ['Tiro de media distancia', 67], ['Tiro libre', 63], ['Contestar tiro', 75]],
  Ataque: [['Primer paso', 78], ['Finalización en el aro', 67], ['Manejo de balón', 72], ['Juego sin balón', 67]],
  Creación: [['Pase', 76], ['Visión de juego', 73], ['Toma de decisiones', 61], ['Navegar bloqueos', 75]],
  Defensa: [['Defensa perimetral', 71], ['Defensa interior', 52], ['Robo', 66], ['Tapón', 41]],
  Físico: [['Resistencia', 76], ['Velocidad', 74], ['Fuerza', 58], ['Salto', 69]],
  Mental: [['Liderazgo', 70], ['Ambición', 74], ['Profesionalidad', 35], ['Competitividad', 33]],
}

export const STANDINGS = [
  ['DO', 0, 0, 0, 0, 0], ['HL', 0, 0, 0, 0, 0], ['GS', 0, 0, 0, 0, 0], ['BS', 0, 0, 0, 0, 0],
  ['IV', 0, 0, 0, 0, 0], ['AK', 0, 0, 0, 0, 0], ['JS', 0, 0, 0, 0, 0], ['LF', 0, 0, 0, 0, 0],
]
// Clasificación ilustrativa a mitad de temporada para las pantallas de competición
export const STANDINGS_MID = [
  ['HL', 18, 14, 4, 1612, 1498, 0, 'WWWLW'], ['DO', 18, 13, 5, 1590, 1471, 0, 'WWLWW'], ['GS', 18, 11, 7, 1544, 1502, 0, 'LWWLW'],
  ['BS', 18, 10, 8, 1511, 1500, 0, 'WLWLW'], ['IV', 18, 8, 10, 1478, 1516, 0, 'LLWLL'], ['AK', 18, 7, 11, 1462, 1534, 0, 'LWLWL'],
  ['JS', 18, 5, 13, 1430, 1561, 0, 'LLLWL'], ['LF', 18, 4, 14, 1417, 1572, 0, 'LLWLL'],
]

export const FIXTURES = [
  { d: '14 DIC', dow: 'MIÉ', opp: 'LF', home: true, status: 'hoy', t: '20:00' },
  { d: '17 DIC', dow: 'SÁB', opp: 'JS', home: true, t: '19:30' },
  { d: '20 DIC', dow: 'MAR', opp: 'AK', home: false, t: '20:30' },
  { d: '23 DIC', dow: 'VIE', opp: 'IV', home: true, t: '20:00' },
  { d: '27 DIC', dow: 'MAR', opp: 'BS', home: false, t: '18:00' },
  { d: '30 DIC', dow: 'VIE', opp: 'GS', home: true, t: '20:00' },
  { d: '02 ENE', dow: 'LUN', opp: 'HL', home: false, t: '21:00' },
]
export const RESULTS = [
  { d: '11 DIC', opp: 'GS', home: true, s: [102, 91], w: true },
  { d: '08 DIC', opp: 'BS', home: false, s: [97, 90], w: true },
  { d: '05 DIC', opp: 'IV', home: true, s: [88, 94], w: false },
  { d: '02 DIC', opp: 'AK', home: true, s: [110, 96], w: true },
  { d: '29 NOV', opp: 'JS', home: false, s: [84, 79], w: true },
]

export const STAFF = [
  { n: 'Marta Quesada', role: 'Entrenadora jefe', dept: 'Coaching', tone: 'pos', note: 'Táctica y comunicación' },
  { n: 'Elio Brandt', role: 'Asistente', dept: 'Coaching', tone: 'neu', note: 'Desarrollo individual' },
  { n: 'Dr. Noor Sethi', role: 'Médico del equipo', dept: 'Médico', tone: 'pos', note: 'Rehabilitación' },
  { n: 'Cass Ortega', role: 'Scout', dept: 'Scouting', tone: 'pos', note: 'Evaluación de potencial' },
]

export const MONTHS = ['OCT', 'NOV', 'DIC', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN']

export const tierOf = (v) => (v >= 85 ? 'e' : v >= 72 ? 'g' : v >= 58 ? 'm' : v >= 45 ? 'a' : 'p')
export const fmtM = (v) => `${v.toFixed(1)} M€`
