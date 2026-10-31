import type { TeamId } from '@/domain/ids'
import type { WorldCompetitionFormatDocument } from '@/domain/competition'

/** Existing 30-franchise source catalogue; no PBM ID is rewritten. */
export const NBA_EAST_FRANCHISE_NAMES = [
  'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets', 'Chicago Bulls',
  'Cleveland Cavaliers', 'Detroit Pistons', 'Indiana Pacers', 'Miami Heat', 'Milwaukee Bucks',
  'New York Knicks', 'Orlando Magic', 'Philadelphia 76ers', 'Toronto Raptors', 'Washington Wizards',
] as const
export const NBA_WEST_FRANCHISE_NAMES = [
  'Dallas Mavericks', 'Denver Nuggets', 'Golden State Warriors', 'Houston Rockets',
  'Los Angeles Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies', 'Minnesota Timberwolves',
  'New Orleans Pelicans', 'Oklahoma City Thunder', 'Phoenix Suns', 'Portland Trail Blazers',
  'Sacramento Kings', 'San Antonio Spurs', 'Utah Jazz',
] as const

const normalize = (name: string) => name.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
const franchises = [
  ...NBA_EAST_FRANCHISE_NAMES.map(name => ({ name, conference: 'east' as const })),
  ...NBA_WEST_FRANCHISE_NAMES.map(name => ({ name, conference: 'west' as const })),
]
const nickname = (name: string) => {
  const normalized = normalize(name)
  if (normalized.endsWith('76ers')) return '76ers'
  if (normalized.endsWith('trailblazers')) return 'trailblazers'
  return normalize(name.split(' ').at(-1)!)
}

export function pinNbaConferencesToSourceClubs(
  format: WorldCompetitionFormatDocument,
  clubs: readonly { readonly id: string; readonly name: string }[],
): WorldCompetitionFormatDocument {
  if (format.competitionId !== 'competition:NAM:nba' || format.variants[0]?.nodes[0]?.pairing?.payload.bdm_generated_matrix_v1 !== true) return format
  if (clubs.length !== 30 || new Set(clubs.map(club => club.id)).size !== 30) throw new Error('NBA source must supply 30 unique PBM club identities')
  const east: TeamId[] = []
  const west: TeamId[] = []
  const consumed = new Set<string>()
  for (const club of clubs) {
    const key = normalize(club.name)
    const exact = franchises.filter(item => key === normalize(item.name))
    // Match whole nicknames only: "Hornets" must never match "Nets".
    const matches = exact.length > 0 ? exact : franchises.filter(item => {
      const tail = nickname(item.name)
      const finalWord = normalize(club.name.trim().split(/\\s+/).at(-1)!)
      return finalWord === tail || (tail === 'trailblazers' && key.endsWith(tail))
    })
    if (matches.length !== 1 || consumed.has(matches[0]!.name)) {
      throw new Error(`NBA conference identity unresolved or duplicated: ${club.id} / ${club.name}`)
    }
    consumed.add(matches[0]!.name)
    ;(matches[0]!.conference === 'east' ? east : west).push(club.id as TeamId)
  }
  if (east.length !== 15 || west.length !== 15 || consumed.size !== 30) throw new Error('NBA source franchise assignments are not 15 East / 15 West')
  const pinned = (v: typeof format.variants[number]) => ({
    ...v, nodes: v.nodes.map(node => node.role === 'REGULAR_SEASON' ? {
      ...node, opponentScope: { type: 'SCHEDULE_MATRIX' as const,
        payload: { ...node.opponentScope?.payload,
          policy: 'BDM_PINNED_NBA_CONFERENCES', east_team_ids: east.sort(), west_team_ids: west.sort() } },
    } : node),
  })
  return { ...format, variants: format.variants.map(pinned) }
}
