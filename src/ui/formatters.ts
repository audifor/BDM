import type { GameDate } from '@/domain/date'
import type { BasketballRatingKnowledgeView } from '@/domain/knowledge'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function formatPrototypeDate(date: GameDate): string {
  const [year, month, day] = date.split('-')
  return `${day} ${MONTHS[Number(month) - 1]!} ${year}`
}

export function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : ''
  const absolute = Math.abs(value)
  return absolute < 1_000_000
    ? `${sign}${Math.round(absolute / 1_000)}K`
    : `${sign}${(absolute / 1_000_000).toFixed(2)}M`
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
export function formatKnownRating(view: BasketballRatingKnowledgeView): string { return view.status === 'unknown' ? '??' : `${view.min}-${view.max}` }
