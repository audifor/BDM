import { invoke } from '@tauri-apps/api/core'
import type { GameSaveRepository, SaveGameInfoV1 } from '@/app/save/GameSaveRepository'

export const tauriGameSaveRepository: GameSaveRepository = {
  save: (envelopeJson) => invoke<void>('save_game_v1', { envelopeJson }),
  load: () => invoke<string>('load_game_v1'),
  getInfo: () => invoke<SaveGameInfoV1 | null>('get_save_info_v1'),
}
