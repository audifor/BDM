import { createDefaultTacticalPlan, type MatchTacticalPlan } from '@/engine/match'
import { create } from 'zustand'

interface TacticalPlanStore { readonly plan: MatchTacticalPlan; setPlan(plan: MatchTacticalPlan): void; reset(): void }
export const useTacticalPlanStore = create<TacticalPlanStore>((set) => ({ plan: createDefaultTacticalPlan(), setPlan: (plan) => set({ plan }), reset: () => set({ plan: createDefaultTacticalPlan() }) }))
