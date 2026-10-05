import { LegacyMatchEnginePort } from './LegacyMatchEnginePort'
import { MatchNextEnginePort } from './MatchNextEnginePort'

const legacyMatchEnginePort = new LegacyMatchEnginePort()
const matchNextEnginePort = new MatchNextEnginePort()

export function createMatchEnginePort(engine: 'legacy'): LegacyMatchEnginePort
export function createMatchEnginePort(engine: 'match-next'): MatchNextEnginePort
export function createMatchEnginePort(engine: 'legacy' | 'match-next'): LegacyMatchEnginePort | MatchNextEnginePort {
  return engine === 'match-next' ? matchNextEnginePort : legacyMatchEnginePort
}
