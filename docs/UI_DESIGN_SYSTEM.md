# BDM Design System V1

The shared UI primitives live in `src/ui/components/designSystem.tsx`; semantic tokens live in `src/ui/design-tokens.css` and styles in `src/ui/components/design-system.css`.

Use `BdmButton` for named actions: `primary` only for the main action, `secondary` for supporting actions, `ghost` for contextual actions, and `danger` for destructive actions. Use `IconAction` for a compact icon-only action; it requires `aria-label` and can add its own tooltip.

`Input`, `Select`, `Tabs`, `Surface`, `Badge`, `Chip`, `Divider`, `Tooltip`, `Dialog`, `EmptyState`, and `Feedback` are presentational, typed primitives. `Select` owns its keyboard/click-outside behavior; `Dialog` owns Escape, focus trap, and returning focus. New menus and floating surfaces should compose these primitives rather than introduce bespoke overlay systems.

Always retain semantic elements, labels, `focus-visible`, keyboard operation, and reduced-motion behavior. Legacy screen-specific controls remain intentionally unchanged for the later global polish pass; migrate them incrementally when a feature is otherwise being worked on.
