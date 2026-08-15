import { EMPTY_ACTION_USAGE_PREFERENCES, type EntityActionUsagePreferences } from './QuickActions'

export interface ActionUsagePreferencesRepository {
  load(): EntityActionUsagePreferences
  save(preferences: EntityActionUsagePreferences): void
}

export class MemoryActionUsagePreferencesRepository implements ActionUsagePreferencesRepository {
  public constructor(private preferences: EntityActionUsagePreferences = EMPTY_ACTION_USAGE_PREFERENCES) {}
  public load(): EntityActionUsagePreferences { return this.preferences }
  public save(preferences: EntityActionUsagePreferences): void { this.preferences = preferences }
}

const storageKey = 'bdm.entity-action-usage.v2'
export const runtimeActionUsagePreferencesRepository: ActionUsagePreferencesRepository = {
  load: () => {
    if (typeof localStorage === 'undefined') return EMPTY_ACTION_USAGE_PREFERENCES
    try { const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null'); return isPreferences(value) ? value : EMPTY_ACTION_USAGE_PREFERENCES } catch { return EMPTY_ACTION_USAGE_PREFERENCES }
  },
  save: (preferences) => { if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(preferences)) },
}

function isPreferences(value: unknown): value is EntityActionUsagePreferences {
  return typeof value === 'object' && value !== null && (value as { version?: unknown }).version === 2 && Array.isArray((value as { entries?: unknown }).entries) && typeof (value as { slotsByEntityType?: unknown }).slotsByEntityType === 'object'
}
