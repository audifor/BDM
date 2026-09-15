export class PlayUserGameError extends Error {
  public constructor(message: string, public readonly code: 'INSUFFICIENT_AVAILABLE_PLAYERS' | 'INVALID_MATCH_CONTEXT' = 'INVALID_MATCH_CONTEXT') {
    super(message)
    this.name = 'PlayUserGameError'
  }
}
