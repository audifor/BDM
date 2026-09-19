import type { CoachRpgPreset } from '@/domain/coachRpg'
import { ACB_2026_27_TEAMS, ACB_QUICK_START_TEAM_KEY, ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'

export const WORLD_DB_SPAIN_UNIVERSE_ID = 'worldDbSpain' as const

export type NewGameUniverseId = 'prototype' | typeof ACB_TEST_UNIVERSE_ID | typeof WORLD_DB_SPAIN_UNIVERSE_ID

export interface NewGameConfiguration {
  readonly universeId?: NewGameUniverseId
  readonly userTeamKey?: string
  readonly coachRpgPreset?: CoachRpgPreset
}

export interface NewGameTeamOption { readonly key: string; readonly name: string; readonly code: string }
export interface NewGameUniverseOption {
  readonly id: NewGameUniverseId
  readonly label: string
  readonly description: string
  readonly isTest: boolean
  readonly teams: readonly NewGameTeamOption[]
  readonly defaultTeamKey?: string
}

export const NEW_GAME_UNIVERSES: readonly NewGameUniverseOption[] = [
  {
    id: WORLD_DB_SPAIN_UNIVERSE_ID,
    label: 'WORLD DB · SPAIN ACB',
    description: 'Canonical Spain ACB 2025/26 GameWorld from the read-only DDL-12 World DB.',
    isTest: false,
    teams: [],
  },
  { id: 'prototype', label: 'BDM World', description: 'Current deterministic BDM development universe.', isTest: false, teams: [] },
  {
    id: ACB_TEST_UNIVERSE_ID,
    label: 'ACB 2026/27',
    description: '18 real clubs and current real player names/positions. BDM generates ratings, bios, contracts and finances for testing.',
    isTest: true,
    teams: ACB_2026_27_TEAMS.map(({ key, name, code }) => ({ key, name, code })),
    defaultTeamKey: ACB_QUICK_START_TEAM_KEY,
  },
] as const
