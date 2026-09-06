/**
 * Physical court rules — metres only.
 * Projection/camera happens later; never encode rules as % or px.
 */

import type { CourtRegulation, CourtRegulationKind } from '../CourtGeometry'

export type CourtRulesetId = 'FIBA' | 'NBA' | 'WNBA' | 'NCAA_M' | 'NCAA_W' | 'HIGH_SCHOOL'

export type CourtRuleset = {
  readonly id: CourtRulesetId
  /** Playing surface length (baseline → baseline), metres. */
  readonly length: number
  /** Playing surface width (sideline → sideline), metres. */
  readonly width: number
  /** Rim centre inset from baseline into playable court. */
  readonly hoopOffset: number
  /** Backboard face inset from baseline (≤ hoopOffset). */
  readonly backboardOffset: number
  readonly keyDepth: number
  readonly keyWidth: number
  readonly circleRadius: number
  readonly threePointRadius: number
  readonly cornerThreeInset: number
  readonly backboardWidth: number
  readonly rimRadius: number
  /** Restricted-area semicircle radius (metres). */
  readonly restrictedAreaRadius: number
  /** Minimum recommended runoff beyond baseline (hint, metres). */
  readonly runoffHintMin: number
  readonly hasBenchHashMarks: boolean
}

export function rulesetToRegulation(ruleset: CourtRuleset): CourtRegulation {
  const kind: CourtRegulationKind =
    ruleset.id === 'NBA' || ruleset.id === 'WNBA'
      ? 'nbaLike'
      : ruleset.id === 'NCAA_M' || ruleset.id === 'NCAA_W' || ruleset.id === 'HIGH_SCHOOL'
        ? 'ncaaLike'
        : 'fibaLike'
  return {
    kind,
    length: ruleset.length,
    width: ruleset.width,
    hoopOffset: ruleset.hoopOffset,
    keyDepth: ruleset.keyDepth,
    keyWidth: ruleset.keyWidth,
    circleRadius: ruleset.circleRadius,
    threePointRadius: ruleset.threePointRadius,
    cornerThreeInset: ruleset.cornerThreeInset,
    backboardWidth: ruleset.backboardWidth,
    rimRadius: ruleset.rimRadius,
  }
}

export function regulationKindToRulesetId(kind: CourtRegulationKind, women = false): CourtRulesetId {
  if (kind === 'nbaLike') return women ? 'WNBA' : 'NBA'
  if (kind === 'ncaaLike') return women ? 'NCAA_W' : 'NCAA_M'
  return 'FIBA'
}
