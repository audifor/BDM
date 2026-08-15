import type { BasketballRatingKey } from '@/domain/player'

export const ATTRIBUTE_LABELS: Record<BasketballRatingKey, string> = {
  finishing: 'Finalización',
  shooting: 'Tiro',
  playmaking: 'Creación',
  perimeterDefense: 'Defensa exterior',
  interiorDefense: 'Defensa interior',
  rebounding: 'Rebote',
  athleticism: 'Atletismo',
}
