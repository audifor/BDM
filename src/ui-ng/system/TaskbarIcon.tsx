import type { WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

export function TaskbarIcon({ id }: { readonly id: WorkspaceAppId }) {
  const common = {
    fill: 'none',
    height: 16,
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.6,
    viewBox: '0 0 16 16',
    width: 16,
  }

  switch (id) {
    case 'home':
      return (
        <svg aria-hidden {...common}>
          <path d="M2.5 7.2 L8 2.6 L13.5 7.2 V13.2 H9.4 V9.4 H6.6 V13.2 H2.5 Z" />
        </svg>
      )
    case 'roster':
      return (
        <svg aria-hidden {...common}>
          <path d="M3 3.5 H13 M3 8 H13 M3 12.5 H9" />
        </svg>
      )
    case 'player':
      return (
        <svg aria-hidden {...common}>
          <circle cx="8" cy="5" r="2.2" />
          <path d="M3.6 13.2 C3.8 10.4 5.5 9 8 9 C10.5 9 12.2 10.4 12.4 13.2" />
        </svg>
      )
    case 'staff':
      return (
        <svg aria-hidden {...common}>
          <path d="M3.2 6.6 H12.8 V13 H3.2 Z" />
          <path d="M6.2 6.6 V4.8 H9.8 V6.6" />
          <path d="M3.2 9.2 H12.8" />
        </svg>
      )
    case 'scouting':
      return (
        <svg aria-hidden {...common}>
          <circle cx="7" cy="7" r="3.4" />
          <path d="M9.6 9.6 L13.2 13.2" />
        </svg>
      )
    case 'tactics':
      return (
        <svg aria-hidden {...common}>
          <path d="M3 12.5 L8 3.4 L13 12.5 Z" />
        </svg>
      )
    case 'training':
      return (
        <svg aria-hidden {...common}>
          <circle cx="8" cy="8" r="4.4" />
          <path d="M8 5.6 V8 L9.8 9.4" />
        </svg>
      )
    case 'mentoring':
      return (
        <svg aria-hidden {...common}>
          <circle cx="5.4" cy="5.2" r="1.8" />
          <circle cx="10.6" cy="5.2" r="1.8" />
          <path d="M2.8 12.6 C3 10.4 4.2 9.2 5.4 9.2 C6.6 9.2 7.6 10.1 8 11.2 C8.4 10.1 9.4 9.2 10.6 9.2 C11.8 9.2 13 10.4 13.2 12.6" />
        </svg>
      )
    case 'medical':
      return (
        <svg aria-hidden {...common}>
          <path d="M8 3.2 V12.8 M3.2 8 H12.8" />
        </svg>
      )
    case 'schedule':
      return (
        <svg aria-hidden {...common}>
          <path d="M3.2 4.2 H12.8 V13 H3.2 Z" />
          <path d="M3.2 6.6 H12.8 M6 3.2 V5.2 M10 3.2 V5.2" />
        </svg>
      )
    case 'competition':
      return (
        <svg aria-hidden {...common}>
          <path d="M4 12.4 V7.2 H6.4 V12.4 Z M6.8 12.4 V4.4 H9.2 V12.4 Z M9.6 12.4 V8.4 H12 V12.4 Z" />
        </svg>
      )
    case 'match':
      return (
        <svg aria-hidden {...common}>
          <circle cx="8" cy="8" r="4.6" />
          <path d="M8 3.4 V12.6 M3.4 8 H12.6" />
        </svg>
      )
    case 'market':
      return (
        <svg aria-hidden {...common}>
          <path d="M3.2 5.2 H12.8 L11.6 12.4 H4.4 Z" />
          <path d="M6 5.2 V3.6 H10 V5.2" />
        </svg>
      )
    case 'draft':
      return (
        <svg aria-hidden {...common}>
          <path d="M4 12.6 L8 3.6 L12 12.6" />
          <path d="M5.4 9.6 H10.6" />
        </svg>
      )
    case 'trades':
      return (
        <svg aria-hidden {...common}>
          <path d="M3.2 6.2 H11.2 L9.2 4.2" />
          <path d="M12.8 9.8 H4.8 L6.8 11.8" />
        </svg>
      )
    case 'club':
      return (
        <svg aria-hidden {...common}>
          <path d="M3.4 12.4 L8 3.6 L12.6 12.4 Z" />
          <path d="M6.2 12.4 V9.2 H9.8 V12.4" />
        </svg>
      )
    case 'board':
      return (
        <svg aria-hidden {...common}>
          <circle cx="8" cy="5" r="2" />
          <circle cx="4.2" cy="11.2" r="1.6" />
          <circle cx="11.8" cy="11.2" r="1.6" />
        </svg>
      )
    case 'finances':
      return (
        <svg aria-hidden {...common}>
          <circle cx="8" cy="8" r="4.4" />
          <path d="M8 5.4 V10.6 M6.4 6.6 C6.4 5.8 7.1 5.4 8 5.4 C8.9 5.4 9.6 5.8 9.6 6.6 C9.6 8.8 6.4 8 6.4 10.2 C6.4 11 7.1 11.4 8 11.4 C8.9 11.4 9.6 11 9.6 10.2" />
        </svg>
      )
    case 'enforcement':
      return (
        <svg aria-hidden {...common}>
          <path d="M8 2.8 L13 5.2 V8.6 C13 11.2 10.8 13 8 13.4 C5.2 13 3 11.2 3 8.6 V5.2 Z" />
        </svg>
      )
    case 'coach':
      return (
        <svg aria-hidden {...common}>
          <circle cx="8" cy="5.2" r="2" />
          <path d="M3.8 13 C4 10.4 5.6 9 8 9 C10.4 9 12 10.4 12.2 13" />
          <path d="M11.2 4.2 L13 5.4 L11.2 6.6" />
        </svg>
      )
    case 'coach-finances':
      return (
        <svg aria-hidden {...common}>
          <path d="M3.2 11.6 L6.4 7.2 L8.6 9.6 L12.8 4.4" />
        </svg>
      )
    case 'memories':
      return (
        <svg aria-hidden {...common}>
          <path d="M4 4.2 H12 V12.4 H4 Z" />
          <path d="M6 7.2 H10 M6 9.4 H9" />
        </svg>
      )
    case 'narratives':
      return (
        <svg aria-hidden {...common}>
          <path d="M4 3.6 H10.4 L12.4 5.6 V12.4 H4 Z" />
          <path d="M10.4 3.6 V5.6 H12.4" />
        </svg>
      )
    case 'media':
      return (
        <svg aria-hidden {...common}>
          <path d="M3.2 11.4 L6.2 8.8 L8.4 10.4 L12.8 5.8" />
          <circle cx="12.2" cy="5.4" r="1" />
        </svg>
      )
    case 'recruiting':
      return (
        <svg aria-hidden {...common}>
          <circle cx="6.4" cy="5.4" r="2" />
          <path d="M3.2 12.6 C3.4 10.2 4.6 9 6.4 9 C8.2 9 9.4 10.2 9.6 12.6" />
          <path d="M10.4 6.2 H13.2 M11.8 4.8 V7.6" />
        </svg>
      )
    case 'nil':
      return (
        <svg aria-hidden {...common}>
          <path d="M4 10.8 V5.2 H6.2 L9.8 10.8 H12 V5.2" />
        </svg>
      )
    case 'boosters':
      return (
        <svg aria-hidden {...common}>
          <path d="M8 3.2 L9.6 6.6 H13.2 L10.4 8.8 L11.6 12.4 L8 10.4 L4.4 12.4 L5.6 8.8 L2.8 6.6 H6.4 Z" />
        </svg>
      )
  }
}
