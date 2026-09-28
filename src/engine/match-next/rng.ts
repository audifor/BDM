import { hashStringToSeed } from '@/engine/random'

export type RngStream = 'outcome' | 'decision' | 'attribution'
export interface RngState { readonly outcome: number; readonly decision: number; readonly attribution: number }

export function createRngState(matchSeed: number): RngState {
  if (!Number.isInteger(matchSeed) || matchSeed < 0 || matchSeed > 0xffff_ffff) throw new RangeError('Match seed must be an unsigned 32-bit integer')
  return {
    outcome: hashStringToSeed(`match-next-outcome-v1:${matchSeed}`),
    decision: hashStringToSeed(`match-next-decision-v1:${matchSeed}`),
    attribution: hashStringToSeed(`match-next-attribution-v1:${matchSeed}`),
  }
}

export function draw(state: RngState, stream: RngStream): { readonly value: number; readonly state: RngState } {
  const next = (state[stream] + 0x6d2b_79f5) >>> 0
  let value = next
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  const result = ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  return { value: result, state: { ...state, [stream]: next } }
}
