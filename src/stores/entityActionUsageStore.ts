import { recordActionUsage, type ActionSignature, type EntityActionUsagePreferences } from '@/app/entityActions/QuickActions'
import { runtimeActionUsagePreferencesRepository } from '@/app/entityActions/ActionUsagePreferencesRepository'
import { create } from 'zustand'

interface EntityActionUsageStore {
  readonly preferences: EntityActionUsagePreferences
  record(signature: ActionSignature): void
}

export const useEntityActionUsageStore = create<EntityActionUsageStore>((set, get) => ({
  preferences: runtimeActionUsagePreferencesRepository.load(),
  record: (signature) => {
    const preferences = recordActionUsage(get().preferences, signature, new Date().toISOString())
    runtimeActionUsagePreferencesRepository.save(preferences)
    set({ preferences })
  },
}))
