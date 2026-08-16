import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { BdmButton, Badge, Divider, IconAction, Surface, Tooltip } from './designSystem'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: 'primary' | 'secondary' | 'quiet' }
export function Button({ variant = 'primary', ...props }: ButtonProps) { return <BdmButton {...props} variant={variant === 'quiet' ? 'ghost' : variant} /> }
export function IconButton({ label, children, ...props }: ButtonProps & { readonly label: string; readonly children: ReactNode }) { return <IconAction {...props} aria-label={label}>{children}</IconAction> }
export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) { return <Surface {...props} className={`ui-panel ${className}`.trim()} /> }
export { Badge, Divider, Tooltip }
export function Chip({ className = '', children }: { readonly className?: string; readonly children: ReactNode }) { return <span className={`ui-chip ${className}`.trim()}>{children}</span> }
export function Progress({ label, value, max = 100 }: { readonly label: string; readonly value: number; readonly max?: number }) { return <progress aria-label={label} className="ui-progress" max={max} value={value} /> }
