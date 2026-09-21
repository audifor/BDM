export const BDM_BREAKPOINTS = {
  ultrawide: 2200,
  master: 1800,
  compact: 1440,
  dense: 1280,
} as const

export const BDM_HEIGHT_BREAKPOINTS = {
  tall: 1000,
  standard: 850,
  short: 720,
} as const

export const BDM_PLAYER_HEIGHT_BREAKPOINTS = {
  normal: 820,
  compact: 660,
} as const

export type BdmViewportMode = 'ultrawide' | 'master' | 'compact' | 'dense' | 'ultraDense'
export type BdmHeightMode = 'tall' | 'standard' | 'short' | 'veryShort'
export type BdmPlayerHeightMode = 'normal' | 'compact' | 'dense'

export function resolveBdmViewport(width: number): BdmViewportMode {
  if (width >= BDM_BREAKPOINTS.ultrawide) return 'ultrawide'
  if (width >= BDM_BREAKPOINTS.master) return 'master'
  if (width >= BDM_BREAKPOINTS.compact) return 'compact'
  if (width >= BDM_BREAKPOINTS.dense) return 'dense'
  return 'ultraDense'
}

export function resolveBdmHeightMode(height: number): BdmHeightMode {
  const availableHeight = Number.isFinite(height) ? Math.max(0, height) : 0
  if (availableHeight >= BDM_HEIGHT_BREAKPOINTS.tall) return 'tall'
  if (availableHeight >= BDM_HEIGHT_BREAKPOINTS.standard) return 'standard'
  if (availableHeight >= BDM_HEIGHT_BREAKPOINTS.short) return 'short'
  return 'veryShort'
}

export function resolveBdmPlayerHeightMode(height: number): BdmPlayerHeightMode {
  const availableHeight = Number.isFinite(height) ? Math.max(0, height) : 0
  if (availableHeight >= BDM_PLAYER_HEIGHT_BREAKPOINTS.normal) return 'normal'
  if (availableHeight >= BDM_PLAYER_HEIGHT_BREAKPOINTS.compact) return 'compact'
  return 'dense'
}
