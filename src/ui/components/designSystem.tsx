import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'compact' | 'default' | 'large'
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const classes = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ')

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: ButtonVariant; readonly size?: ButtonSize; readonly loading?: boolean; readonly leadingIcon?: ReactNode; readonly trailingIcon?: ReactNode }
export function BdmButton({ children, className, disabled, leadingIcon, loading = false, size = 'default', trailingIcon, variant = 'primary', ...props }: ButtonProps) {
  return <button {...props} aria-busy={loading || undefined} className={classes('bdm-button', `bdm-button--${variant}`, `bdm-button--${size}`, className)} disabled={disabled || loading} type={props.type ?? 'button'}>{leadingIcon && <span aria-hidden="true" className="bdm-button__icon">{leadingIcon}</span>}<span>{loading ? 'Loading…' : children}</span>{trailingIcon && <span aria-hidden="true" className="bdm-button__icon">{trailingIcon}</span>}</button>
}

export function IconAction({ 'aria-label': ariaLabel, children, className, selected = false, size = 'default', tooltip, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { readonly selected?: boolean; readonly size?: 'compact' | 'default' | 'large'; readonly tooltip?: string }) {
  if (!ariaLabel) throw new Error('IconAction requires an aria-label')
  const button = <button {...props} aria-label={ariaLabel} aria-pressed={selected || undefined} className={classes('bdm-icon-action', `bdm-icon-action--${size}`, selected && 'is-selected', className)} type={props.type ?? 'button'}>{children}</button>
  return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button
}

export function Input({ className, error, helperText, id, label, ...props }: InputHTMLAttributes<HTMLInputElement> & { readonly error?: string; readonly helperText?: string; readonly label?: string }) {
  const generatedId = useId(); const inputId = id ?? generatedId; const message = error ?? helperText
  return <label className={classes('bdm-field', error && 'has-error')} htmlFor={inputId}>{label && <span className="bdm-field__label">{label}</span>}<input {...props} aria-describedby={message ? `${inputId}-message` : props['aria-describedby']} aria-invalid={Boolean(error) || undefined} className={classes('bdm-input', className)} id={inputId} />{message && <span className="bdm-field__message" id={`${inputId}-message`}>{message}</span>}</label>
}

export type SelectOption = { readonly value: string; readonly label: ReactNode; readonly disabled?: boolean }
export function Select({ ariaLabel, disabled = false, label, onChange, options, placeholder = 'Select…', value }: { readonly ariaLabel?: string; readonly disabled?: boolean; readonly label?: string; readonly onChange: (value: string) => void; readonly options: readonly SelectOption[]; readonly placeholder?: string; readonly value?: string }) {
  const [open, setOpen] = useState(false); const [active, setActive] = useState(0); const root = useRef<HTMLDivElement>(null); const listId = useId()
  const selected = options.find((option) => option.value === value)
  useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close) }, [])
  const move = (delta: number) => { let next = active; for (let attempts = 0; attempts < options.length; attempts += 1) { next = (next + delta + options.length) % options.length; if (!options[next]?.disabled) break }; setActive(next) }
  const choose = (option: SelectOption) => { if (option.disabled) return; onChange(option.value); setOpen(false) }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); move(1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); move(-1) }
    else if (event.key === 'Escape') setOpen(false)
    else if (event.key === 'Enter' && open && options[active] !== undefined) choose(options[active])
  }
  return <div className="bdm-select-field" ref={root}>
    {label && <span className="bdm-field__label">{label}</span>}
    <button aria-controls={listId} aria-expanded={open} aria-haspopup="listbox" aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)} className="bdm-select" disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={onKeyDown} type="button"><span>{selected?.label ?? placeholder}</span><span aria-hidden="true">v</span></button>
    {open && <div className="bdm-select__menu" id={listId} role="listbox">{options.map((option, index) => <button aria-selected={option.value === value} className={classes('bdm-select__option', index === active && 'is-active')} disabled={option.disabled} key={option.value} onClick={() => choose(option)} onMouseEnter={() => setActive(index)} role="option" type="button">{option.label}</button>)}</div>}
  </div>
}

export function Tooltip({ children, content }: { readonly children: ReactNode; readonly content: string }) { const id = useId(); return <span className="bdm-tooltip"><span aria-describedby={id} className="bdm-tooltip__trigger">{children}</span><span className="bdm-tooltip__content" id={id} role="tooltip">{content}</span></span> }
export function Surface({ children, className, elevated = false, interactive = false, selected = false, ...props }: HTMLAttributes<HTMLElement> & { readonly elevated?: boolean; readonly interactive?: boolean; readonly selected?: boolean }) { return <section {...props} className={classes('bdm-surface', elevated && 'bdm-surface--elevated', interactive && 'bdm-surface--interactive', selected && 'is-selected', className)}>{children}</section> }
export function Badge({ children, className, tone = 'neutral' }: { readonly children: ReactNode; readonly className?: string; readonly tone?: Tone }) { return <span className={classes('bdm-badge', `bdm-badge--${tone}`, className)}>{children}</span> }
export function Chip({ children, className, selected = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { readonly selected?: boolean }) { return <button {...props} aria-pressed={selected} className={classes('bdm-chip', selected && 'is-selected', className)} type={props.type ?? 'button'}>{children}</button> }
export function Divider({ className, vertical = false }: { readonly className?: string; readonly vertical?: boolean }) { return <hr aria-orientation={vertical ? 'vertical' : 'horizontal'} className={classes('bdm-divider', vertical && 'bdm-divider--vertical', className)} /> }
export function Tabs({ tabs, value, onChange }: { readonly tabs: readonly { readonly id: string; readonly label: ReactNode; readonly disabled?: boolean }[]; readonly value: string; readonly onChange: (id: string) => void }) { return <div aria-label="Sections" className="bdm-tabs" role="tablist">{tabs.map((tab) => <button aria-selected={value === tab.id} className="bdm-tabs__tab" disabled={tab.disabled} key={tab.id} onClick={() => onChange(tab.id)} role="tab" type="button">{tab.label}</button>)}</div> }

export function Dialog({ children, onClose, open, title }: { readonly children: ReactNode; readonly onClose: () => void; readonly open: boolean; readonly title: string }) { const dialog = useRef<HTMLDivElement>(null); const restore = useRef<HTMLElement | null>(null); useEffect(() => { if (!open) return; restore.current = document.activeElement as HTMLElement; const keydown = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); if (event.key === 'Tab') { const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'); if (!nodes?.length) return; const first = nodes[0]!; const last = nodes[nodes.length - 1]!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } } }; document.addEventListener('keydown', keydown); queueMicrotask(() => dialog.current?.focus()); return () => { document.removeEventListener('keydown', keydown); restore.current?.focus() } }, [open, onClose]); if (!open) return null; return createPortal(<div className="bdm-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div aria-label={title} aria-modal="true" className="bdm-dialog" ref={dialog} role="dialog" tabIndex={-1}><header><h2>{title}</h2><IconAction aria-label="Close dialog" onClick={onClose}>×</IconAction></header>{children}</div></div>, document.body) }
export function EmptyState({ action, description, icon, title }: { readonly action?: ReactNode; readonly description: string; readonly icon?: ReactNode; readonly title: string }) { return <section className="bdm-empty-state">{icon && <span aria-hidden="true">{icon}</span>}<h2>{title}</h2><p>{description}</p>{action}</section> }
export function Feedback({ children, tone = 'info' }: { readonly children: ReactNode; readonly tone?: Exclude<Tone, 'neutral'> }) { return <div className={`bdm-feedback bdm-feedback--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div> }
