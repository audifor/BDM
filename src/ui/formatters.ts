import type { GameDate } from '@/domain/date'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function formatPrototypeDate(date: GameDate): string {
  const [year, month, day] = date.split('-')
  return `${day} ${MONTHS[Number(month) - 1]!} ${year}`
}
