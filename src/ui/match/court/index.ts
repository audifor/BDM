/**
 * CT-CANON · Court & Arena Renderer V2 public API.
 *
 * Architecture:
 *   CourtConfigurationResolver → CourtConfiguration → CourtRenderer
 *   rules / floor / branding / basket / arena / event are separate concerns.
 */

export {
  FIBA_REGULATION,
  NBA_REGULATION,
  NCAA_REGULATION,
  courtAspectRatio,
  createViewport,
  metresToPixels,
  regulationFor,
  toCanvas,
  toCourt,
  type CourtPointM,
  type CourtRegulation,
  type CourtRegulationKind,
  type CourtViewport,
} from './CourtGeometry'

export {
  createCourtProjection,
  courtPercentToScreenPercent,
  clipToCourtPolygon,
  fillCourtPath,
  projectMetres,
  projectedCirclePoints,
  strokeCourtPath,
  type CourtProjection,
  type CourtProjectionMode,
  type CourtProjectionOptions,
  type ScreenPoint,
} from './CourtProjection'

export {
  freeThrowArcPoints,
  pointInCourtBounds,
  pointInProjectedCourt,
  sampleCirclePoints,
  threePointPath,
  type ThreePointPath,
} from './CourtMarkingsGeometry'

export type { CourtConfiguration } from './core/CourtConfiguration'
export { courtConfigurationCacheKey } from './core/CourtConfiguration'
export {
  resolveCourtConfiguration,
  resolveRulesetId,
  resolveArenaArchetype,
  type CourtConfigurationResolveInput,
} from './core/CourtConfigurationResolver'

export {
  getCourtRuleset,
  rulesetToRegulation,
  regulationKindToRulesetId,
  FIBA_COURT_RULESET,
  NBA_COURT_RULESET,
  WNBA_COURT_RULESET,
  NCAA_MEN_COURT_RULESET,
  NCAA_W_COURT_RULESET,
  HIGH_SCHOOL_COURT_RULESET,
  type CourtRuleset,
  type CourtRulesetId,
} from './rules'

export type { CourtFloorProfile, FloorMaterialId, FloorPatternId } from './floor/CourtFloorProfile'
export { createFloorProfile, FLOOR_MATERIAL_TONES } from './floor/CourtFloorProfile'
export {
  generateFloorTexture,
  floorTextureFingerprint,
  generateParquetTexture,
  parquetFingerprint,
} from './floor/CourtTextureGenerator'

export type { CourtBrandingProfile, CourtPresentationPalette } from './branding/CourtBrandingProfile'
export { resolveClubCourtIdentity, deriveCourtPalette } from './branding/ClubCourtIdentityResolver'

export type { BasketSystemProfile, BasketSystemType } from './basket/BasketSystemProfile'
export { createBasketSystem } from './basket/BasketSystemProfile'
export { stanchionCourtX } from './basket/BasketSystemRenderer'

export type { ArenaCourtProfile, ArenaCourtArchetype } from './arena/ArenaCourtProfile'
export { createArenaProfile } from './arena/ArenaCourtProfile'
export { buildArenaPerimeterLayout, type ArenaPerimeterLayout, type ArenaZoneRect } from './arena/ArenaPerimeterLayout'
export { renderArenaPerimeter } from './arena/ArenaPerimeterRenderer'

export type { CourtEventOverlay, CourtEventKind } from './event/CourtEventOverlay'
export { createEventOverlay } from './event/CourtEventOverlay'

export { CourtRenderer, type CourtRendererOptions } from './render/CourtRenderer'
export { CourtCanvas } from './render/CourtCanvas'

export {
  adjustHsl,
  buildStaticCacheKey,
  normalizeArenaColor,
  normalizeCourtColor,
  parseCssColor,
  varyWoodTone,
  type CourtHsl,
  type CourtRgb,
} from './CourtColorUtils'

export {
  COURT_BALL_VISUAL,
  COURT_PLAYER_VISUAL,
  resolvePlayerFloorState,
  type CourtBallState,
  type CourtDynamicBall,
  type CourtDynamicFrame,
  type CourtDynamicPlayer,
  type CourtKitColors,
  type CourtPlayerFloorState,
  type CourtPoint2,
} from './CourtEntityTypes'

export { resolveMatchKitColors, kitContrastRatio, kitNeedsCourtOutline, COURT_PARQUET_REFERENCE } from './CourtMatchKit'

export {
  createCourtAnimationState,
  easeInOut,
  interpolationDurationMs,
  lerp,
  retargetPlayerMotion,
  samplePoint,
  sampleProgress,
  syncPauseState,
} from './CourtAnimationState'

export {
  ballScreenPosition,
  drawCourtBall,
  heldBallOffsetPercent,
} from './CourtBallRenderer'

export {
  courtPercentToMetres,
  depthScaleForCourtY,
  drawCourtPlayer,
  drawCourtPlayerBody,
  drawCourtPlayerToken,
  drawCourtPlayerName,
  drawPlayerFloorIndicators,
  drawPlayerShadow,
  sortPlayersByScreenDepth,
} from './CourtPlayerRenderer'

export {
  clampPlayerVisualScale,
  depthScaleFactor,
  getCourtPlayerScalePreset,
  getPlayerVisualScale,
  playerVisualDiameterPx,
  playerVisualHeightPx,
  setCourtPlayerScalePreset,
  viewportScaleFactor,
  PLAYER_BASE_DIAMETER_PX,
  PLAYER_BASE_HEIGHT_PX,
  type CourtPlayerScalePreset,
} from './CourtPlayerScale'

export { CourtDynamicRenderer } from './CourtDynamicRenderer'
