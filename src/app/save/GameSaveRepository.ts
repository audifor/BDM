export interface SaveGameInfoV1 { readonly savedAt: string }

/** Application boundary; adapters own their storage technology. */
export interface GameSaveRepository {
  save(envelopeJson: string): Promise<void>
  load(): Promise<string>
  getInfo(): Promise<SaveGameInfoV1 | null>
}
