import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'

import type { AttributeCategoryModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'

const CATEGORY_LIST_ID = 'player-attribute-category-options'

export function AttributeCategoryProfiles({
  categories,
  selectedCategory,
  structuralCompact,
  onSelect,
}: {
  readonly categories: readonly AttributeCategoryModel[]
  readonly selectedCategory: RatingCategory
  readonly structuralCompact: boolean
  readonly onSelect: (category: RatingCategory) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Partial<Record<RatingCategory, HTMLButtonElement>>>({})
  const selected = categories.find((entry) => entry.category === selectedCategory) ?? categories[0]
  const popupOpen = structuralCompact && open

  const focusSelectedOption = useCallback(() => {
    optionRefs.current[selected?.category ?? 'shooting']?.focus()
  }, [selected?.category])

  useEffect(() => {
    if (popupOpen) focusSelectedOption()
  }, [focusSelectedOption, popupOpen])

  useEffect(() => {
    if (!popupOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [popupOpen])

  const selectCategory = (entry: AttributeCategoryModel) => {
    onSelect(entry.category)
    setOpen(false)
    if (structuralCompact) triggerRef.current?.focus()
  }

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape' && popupOpen) {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const entry = categories[index]
      if (entry !== undefined) selectCategory(entry)
      return
    }

    if (categories.length === 0) return
    const nextIndex = event.key === 'ArrowDown'
      ? (index + 1) % categories.length
      : event.key === 'ArrowUp'
        ? (index - 1 + categories.length) % categories.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? categories.length - 1
            : -1
    if (nextIndex < 0) return
    event.preventDefault()
    optionRefs.current[categories[nextIndex]?.category ?? 'shooting']?.focus()
  }

  return (
    <section
      className="po-at-panel po-at-categories"
      data-open={popupOpen ? 'true' : 'false'}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false)
        }
      }}
      ref={rootRef}
    >
      <header className="po-at-panel__head">
        <span className="po-at-panel__title" id="player-attribute-category-heading">Category profiles</span>
        <span className="po-at-panel__meta">{selected?.label ?? 'No category'} selected</span>
        <button
          aria-controls={CATEGORY_LIST_ID}
          aria-expanded={popupOpen}
          aria-haspopup="listbox"
          aria-label={selected === undefined
            ? 'Choose attribute category'
            : `Choose attribute category, ${selected.label}, rating ${selected.profileValue}`}
          className="po-at-category-trigger"
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (structuralCompact && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault()
              setOpen(true)
            }
          }}
          ref={triggerRef}
          type="button"
        >
          <span className="po-at-category-trigger__label">{selected?.label ?? 'Choose category'}</span>
          <span className="po-at-category-trigger__value ng-type-numeric">{selected?.profileValue ?? '—'}</span>
          <span aria-hidden className="po-at-category-trigger__indicator">▾</span>
        </button>
      </header>
      <ul
        aria-hidden={structuralCompact && !popupOpen ? true : undefined}
        aria-labelledby="player-attribute-category-heading"
        className="po-at-categories__list"
        hidden={structuralCompact && !popupOpen}
        id={CATEGORY_LIST_ID}
        role="listbox"
      >
        {categories.map((entry, index) => {
          const isSelected = entry.category === selected?.category
          return (
            <li key={entry.category}>
              <button
                aria-label={`${entry.label}, rating ${entry.profileValue}`}
                aria-selected={isSelected}
                className={`po-at-category${isSelected ? ' is-active' : ''}`}
                data-category={entry.category}
                onClick={() => selectCategory(entry)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                ref={(node) => {
                  if (node === null) delete optionRefs.current[entry.category]
                  else optionRefs.current[entry.category] = node
                }}
                role="option"
                tabIndex={isSelected ? 0 : -1}
                type="button"
              >
                <span className="po-at-category__label">{entry.label}</span>
                <span aria-hidden className="po-at-category__track">
                  <span className="po-at-category__fill" style={{ width: `${entry.profileValue}%` }} />
                </span>
                <span className="po-at-category__value ng-type-numeric">{entry.profileValue}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
