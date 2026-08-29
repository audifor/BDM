import type { ReactNode } from 'react'
export const dataGridRenderers = {
  text: (value: string | number | undefined): ReactNode => value ?? '—',
  number: (value: number | undefined): ReactNode => value === undefined ? '—' : value.toLocaleString(),
  percentage: (value: number | undefined): ReactNode => value === undefined ? '—' : `${value}%`,
  money: (value: number | undefined): ReactNode => value === undefined ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value),
  status: (value: string | undefined): ReactNode => value ?? 'Unknown',
  badge: (value: string | undefined): ReactNode => <span className="bdm-badge">{value ?? '—'}</span>,
}
