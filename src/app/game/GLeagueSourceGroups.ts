import type { TeamId } from '@/domain/ids'
import type { WorldCompetitionFormatDocument } from '@/domain/competition'

// NBA G League's published 2026-27 memberships. Names are source identities,
// never substitute for PBM IDs in GameWorld or Save V4.
const regions = {
  CENTRAL: ['Cleveland Charge', 'Grand Rapids Gold', 'Iowa Wolves', 'Motor City Cruise', 'Noblesville Boom', 'Sioux Falls Skyforce', 'Windy City Bulls', 'Wisconsin Herd'],
  EAST: ['Capital City Go-Go', 'College Park Skyhawks', 'Delaware Blue Coats', 'Greensboro Swarm', 'Long Island Nets', 'Maine Celtics', 'Raptors 905', 'Westchester Knicks'],
  SOUTH: ['Austin Spurs', 'Laketown Squadron', 'Memphis Hustle', 'Mexico City Capitanes', 'Oklahoma City Blue', 'Osceola Magic', 'Rio Grande Valley Vipers', 'Texas Legends'],
  WEST: ['Coachella Valley Lakers', 'Rip City Remix', 'Salt Lake City Stars', 'San Diego Clippers', 'Santa Cruz Warriors', 'Stockton Kings', 'Valley Suns'],
} as const

const conferences = {
  EAST: ['Capital City Go-Go', 'Cleveland Charge', 'College Park Skyhawks', 'Delaware Blue Coats', 'Grand Rapids Gold', 'Greensboro Swarm', 'Laketown Squadron', 'Long Island Nets', 'Maine Celtics', 'Motor City Cruise', 'Noblesville Boom', 'Osceola Magic', 'Raptors 905', 'Westchester Knicks', 'Windy City Bulls', 'Wisconsin Herd'],
  WEST: ['Austin Spurs', 'Coachella Valley Lakers', 'Iowa Wolves', 'Memphis Hustle', 'Mexico City Capitanes', 'Oklahoma City Blue', 'Rio Grande Valley Vipers', 'Rip City Remix', 'Salt Lake City Stars', 'San Diego Clippers', 'Santa Cruz Warriors', 'Sioux Falls Skyforce', 'Stockton Kings', 'Texas Legends', 'Valley Suns'],
} as const

export const GLEAGUE_2026_FRANCHISE_NAMES: readonly string[] = Object.values(regions).flat()

const alias: Readonly<Record<string, string>> = {
  'southbaylakers': 'coachellavalleylakers',
  'birminghamsquadron': 'laketownsquadron',
}
const normalize = (text: string): string => text.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

export function pinGLeagueSourceMemberships(
  format: WorldCompetitionFormatDocument,
  clubs: readonly { readonly id: string; readonly name: string }[],
): WorldCompetitionFormatDocument {
  if (format.competitionId !== 'competition:NAM:gleague'
    || format.variants[0]?.nodes.find(n => n.role === 'REGULAR_SEASON')?.pairing?.payload.bdm_gleague_two_phase_v1 !== true) return format
  if (clubs.length !== 31 || new Set(clubs.map(club => club.id)).size !== 31) {
    throw new Error('G League source requires exactly 31 unique original PBM clubs')
  }
  const indexed = new Map<string, TeamId>()
  for (const club of clubs) {
    const key = alias[normalize(club.name)] ?? normalize(club.name)
    if (!GLEAGUE_2026_FRANCHISE_NAMES.some(name => normalize(name) === key) || indexed.has(key)) {
      throw new Error(`G League PBM club identity cannot be reconciled: ${club.id} / ${club.name}`)
    }
    indexed.set(key, club.id as TeamId)
  }
  const lookup = (names: readonly string[]): TeamId[] => names.map(name => {
    const id = indexed.get(normalize(name))
    if (!id) throw new Error('G League source franchise missing: ' + name)
    return id
  }).sort()
  const west = lookup(conferences.WEST), east = lookup(conferences.EAST)
  const central = lookup(regions.CENTRAL), regionEast = lookup(regions.EAST)
  const south = lookup(regions.SOUTH), regionWest = lookup(regions.WEST)
  return {
    ...format, variants: format.variants.map(v => ({
      ...v, nodes: v.nodes.map(node => {
        if (node.role === 'REGULAR_SEASON') return {
          ...node, opponentScope: { type: 'SCHEDULE_MATRIX' as const,
            payload: { ...node.opponentScope?.payload, policy: 'BDM_PINNED_GLEAGUE_CONFERENCES',
              east_team_ids: east, west_team_ids: west } },
        }
        if (node.key === 'TIP_OFF_TOURNAMENT') return {
          ...node, opponentScope: { type: 'SCHEDULE_MATRIX' as const,
            payload: { policy: 'BDM_PINNED_GLEAGUE_TIPOFF_REGIONS',
              central_team_ids: central, east_team_ids: regionEast,
              south_team_ids: south, west_team_ids: regionWest } },
        }
        return node
      }),
    })),
  }
}
