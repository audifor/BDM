import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: 'primary' | 'secondary' | 'quiet' }

export function Button({ className = '', variant = 'primary', ...props }: ButtonProps) {
  return <button {...props} className={`ui-button ui-button--${variant} ${className}`.trim()} type={props.type ?? 'button'} />
}

export function IconButton({ label, className = '', children, ...props }: ButtonProps & { readonly label: string; readonly children: ReactNode }) {
  return <Button {...props} aria-label={label} className={`ui-icon-button ${className}`.trim()}>{children}</Button>
}

export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`ui-panel ${className}`.trim()} />
}

export function Badge({ className = '', children, tone = 'neutral' }: { readonly className?: string; readonly children: ReactNode; readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return <span className={`ui-badge ui-badge--${tone} ${className}`.trim()}>{children}</span>
}

export function Chip({ className = '', children }: { readonly className?: string; readonly children: ReactNode }) {
  return <span className={`ui-chip ${className}`.trim()}>{children}</span>
}

export function Tooltip({ children, content }: { readonly children: ReactNode; readonly content: string }) {
  return <span className="ui-tooltip"><span className="ui-tooltip__trigger" tabIndex={0}>{children}</span><span className="ui-tooltip__content" role="tooltip">{content}</span></span>
}

export function Progress({ label, value, max = 100 }: { readonly label: string; readonly value: number; readonly max?: number }) {
  return <progress aria-label={label} className="ui-progress" max={max} value={value} />
}

export function Divider({ className = '' }: { readonly className?: string }) {
  return <hr className={`ui-divider ${className}`.trim()} />
}
