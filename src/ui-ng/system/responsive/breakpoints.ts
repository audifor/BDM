export const BDM_BREAKPOINTS = {
  ultrawide: 2200,
  master: 1800,
  compact: 1440,
  dense: 1280,
} as const

export type BdmViewportMode = 'ultrawide' | 'master' | 'compact' | 'dense' | 'ultraDense'

export function resolveBdmViewport(width: number): BdmViewportMode {
  if (width >= BDM_BREAKPOINTS.ultrawide) return 'ultrawide'
  if (width >= BDM_BREAKPOINTS.master) return 'master'
  if (width >= BDM_BREAKPOINTS.compact) return 'compact'
  if (width >= BDM_BREAKPOINTS.dense) return 'dense'
  return 'ultraDense'
}
