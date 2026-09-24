import { createDefaultTacticalPlan, type MatchTacticalPlan } from '@/engine/match'
import { create } from 'zustand'

interface TacticalPlanStore { readonly plan: MatchTacticalPlan; readonly hasExplicitPlan: boolean; setPlan(plan: MatchTacticalPlan): void; reset(): void }
export const useTacticalPlanStore = create<TacticalPlanStore>((set) => ({ plan: createDefaultTacticalPlan(), hasExplicitPlan: false, setPlan: (plan) => set({ plan, hasExplicitPlan: true }), reset: () => set({ plan: createDefaultTacticalPlan(), hasExplicitPlan: false }) }))
