import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BdmButton, IconAction, Select, Tabs } from './designSystem'

describe('BDM design system primitives', () => {
  it('renders semantic button variants and disabled loading state', () => {
    const markup = renderToStaticMarkup(createElement(BdmButton, { disabled: true, loading: true, variant: 'danger' }, 'Delete'))
    expect(markup).toContain('bdm-button--danger')
    expect(markup).toContain('disabled')
    expect(markup).toContain('aria-busy="true"')
  })

  it('gives icon actions an accessible label and selected state', () => {
    const markup = renderToStaticMarkup(createElement(IconAction, { 'aria-label': 'Open roster', selected: true }, 'R'))
    expect(markup).toContain('aria-label="Open roster"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it('exposes select and tab semantics for keyboard-capable controls', () => {
    const markup = renderToStaticMarkup(createElement(Fragment, null,
      createElement(Select, { ariaLabel: 'Competition', onChange: () => undefined, options: [{ value: 'a', label: 'Alpha' }], value: 'a' }),
      createElement(Tabs, { onChange: () => undefined, tabs: [{ id: 'squad', label: 'Squad' }], value: 'squad' }),
    ))
    expect(markup).toContain('aria-haspopup="listbox"')
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('aria-selected="true"')
  })
})
