import type { RandomSource } from '@/engine/random'

const FIRST_NAMES = ['Arel', 'Bren', 'Cira', 'Daro', 'Eris', 'Falen', 'Galen', 'Hira', 'Iven', 'Jora'] as const
const LAST_NAMES = ['Arden', 'Bexley', 'Corven', 'Dain', 'Elian', 'Farrow', 'Grove', 'Hale', 'Istra', 'Joren'] as const

export function generatePersonName(random: RandomSource): { firstName: string; lastName: string } {
  return { firstName: random.pick(FIRST_NAMES), lastName: random.pick(LAST_NAMES) }
}
