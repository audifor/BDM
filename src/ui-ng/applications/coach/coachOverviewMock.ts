/*
 * Coach · Overview screen — presentation mock.
 *
 * This module is the ONLY place the Overview screen reads its numbers from. It exists so the whole
 * board can be built and reviewed before any runtime wiring exists; replacing it later means
 * swapping `COACH_OVERVIEW_MOCK` for a selector that returns the same `CoachOverviewModel` shape,
 * with no component changes.
 *
 * Nothing here is derived from a GameWorld, and nothing here is persisted.
 */

export type CoachOverviewTone =
  | 'neutral'
  | 'cyan'
  | 'positive'
  | 'warning'
  | 'negative'
  | 'gold'
  | 'purple'

export interface CoachOverviewMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly tone?: CoachOverviewTone
  readonly delta?: 'up' | 'down' | 'flat'
  readonly tooltip?: string
}

/* ── Character core ── */

export interface CoachOverviewIdentityRow {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly tone?: CoachOverviewTone
  readonly tooltip?: string
}

export interface CoachOverviewIdentity {
  readonly name: string
  readonly level: number
  readonly role: string
  readonly club: string
  readonly rows: readonly CoachOverviewIdentityRow[]
  readonly careerXp: { readonly current: number; readonly max: number }
  readonly developmentPoints: number
}

export interface CoachOverviewAttribute {
  readonly id: string
  readonly label: string
  readonly value: number
}

export interface CoachOverviewPersonalityTrait {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly tone: CoachOverviewTone
  readonly tooltip?: string
}

/* ── Current status ── */

export interface CoachOverviewStatusRow {
  readonly id: string
  readonly icon: string
  readonly title: string
  readonly detail: string
  readonly badge: string
  readonly tone: CoachOverviewTone
  readonly tooltip?: string
}

export interface CoachOverviewRiskRow {
  readonly id: string
  readonly label: string
  readonly filled: number
  readonly total: number
  readonly tone: CoachOverviewTone
  readonly tooltip?: string
}

/* ── Personal economy & power ── */

export interface CoachOverviewFinanceRow {
  readonly id: string
  readonly icon: string
  readonly label: string
  readonly value: string
  readonly tone?: CoachOverviewTone
  readonly tooltip?: string
}

export interface CoachOverviewNetworkRow {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly tone: CoachOverviewTone
  readonly tooltip?: string
}

export interface CoachOverviewAllocationSlice {
  readonly id: string
  readonly label: string
  readonly share: number
  readonly amount: string
  readonly tone: CoachOverviewTone
}

export interface CoachOverviewPower {
  readonly label: string
  readonly filled: number
  readonly total: number
  readonly caption: string
  readonly tooltip?: string
}

/* ── Summary strip ── */

export type CoachOverviewSummaryChart =
  | {
      readonly kind: 'line'
      readonly title: string
      readonly points: readonly number[]
      readonly endLabel: string
      readonly caption: string
    }
  | {
      readonly kind: 'bars'
      readonly title: string
      readonly columns: readonly { readonly id: string; readonly label: string; readonly value: number }[]
    }
  | {
      readonly kind: 'steps'
      readonly title: string
      readonly points: readonly number[]
      readonly caption: string
    }
  | {
      readonly kind: 'ring'
      readonly title: string
      readonly value: number
      readonly caption: string
    }
  | {
      readonly kind: 'meters'
      readonly title: string
      readonly rows: readonly {
        readonly id: string
        readonly label: string
        readonly level: number
        readonly max: number
      }[]
    }

export interface CoachOverviewSummary {
  readonly id: string
  readonly tabId: string
  readonly title: string
  readonly subtitle: string
  readonly icon: string
  readonly metrics: readonly CoachOverviewMetric[]
  readonly chart: CoachOverviewSummaryChart
  readonly footer: string
  readonly banner?: { readonly text: string; readonly tooltip?: string }
}

/* ── Timeline ── */

export interface CoachOverviewTimelineEvent {
  readonly id: string
  readonly date: string
  readonly icon: string
  readonly title: string
  readonly highlight: string
  readonly detail: string
  readonly tone: CoachOverviewTone
  /** True for illustrative entries the domain does not back; the rail labels them with a Mock chip. */
  readonly mock?: boolean
}

export interface CoachOverviewModel {
  readonly identity: CoachOverviewIdentity
  /** Canonical Staff source for live profiles; absent only from the design fixture. */
  readonly staffProfile?: import('@/domain/staff').StaffPerson
  readonly attributes: readonly CoachOverviewAttribute[]
  readonly personality: {
    readonly traits: readonly CoachOverviewPersonalityTrait[]
    readonly motto: string
  }
  readonly status: readonly CoachOverviewStatusRow[]
  readonly risks: readonly CoachOverviewRiskRow[]
  readonly finances: readonly CoachOverviewFinanceRow[]
  readonly favors: { readonly owed: number; readonly held: number }
  readonly network: readonly CoachOverviewNetworkRow[]
  readonly allocation: {
    readonly total: string
    readonly caption: string
    readonly slices: readonly CoachOverviewAllocationSlice[]
  }
  readonly power: CoachOverviewPower
  readonly summaries: readonly CoachOverviewSummary[]
  readonly timeline: readonly CoachOverviewTimelineEvent[]
}

export const COACH_OVERVIEW_MOCK: CoachOverviewModel = {
  identity: {
    name: 'Jora Dain',
    level: 6,
    role: 'Head Coach',
    club: 'Dunmere Orbits',
    rows: [
      { id: 'archetype', label: 'Archetype', value: 'Tactical Builder' },
      {
        id: 'shadow',
        label: 'Shadow Archetype',
        value: 'Power Broker',
        tone: 'purple',
        tooltip: 'The reputation you are building away from the touchline. Power Broker favours leverage over authority.',
      },
      {
        id: 'morality',
        label: 'Moral Alignment',
        value: 'Ruthless Pragmatist',
        tone: 'warning',
        tooltip: 'Ruthless Pragmatist accepts short-term collateral when the result justifies it.',
      },
    ],
    careerXp: { current: 2340, max: 3000 },
    developmentPoints: 2,
  },

  attributes: [
    { id: 'tactics', label: 'Tactics', value: 74 },
    { id: 'leadership', label: 'Leadership', value: 68 },
    { id: 'development', label: 'Development', value: 81 },
    { id: 'communication', label: 'Communication', value: 63 },
    { id: 'politics', label: 'Politics', value: 49 },
    { id: 'pressure', label: 'Pressure', value: 57 },
  ],

  personality: {
    traits: [
      {
        id: 'ambition',
        label: 'Ambition',
        value: 82,
        tone: 'cyan',
        tooltip: 'Ambition drives how aggressively Jora pursues promotions and roster upgrades.',
      },
      {
        id: 'integrity',
        label: 'Integrity',
        value: 34,
        tone: 'negative',
        tooltip:
          'Integrity reflects how strongly Jora adheres to ethical and professional standards. Recent decisions have reduced this value.',
      },
      {
        id: 'discipline',
        label: 'Discipline',
        value: 71,
        tone: 'cyan',
        tooltip: 'Discipline governs preparation quality and how consistently the staff follows the plan.',
      },
      {
        id: 'empathy',
        label: 'Empathy',
        value: 52,
        tone: 'neutral',
        tooltip: 'Empathy shapes how players react to hard conversations.',
      },
      {
        id: 'aggression',
        label: 'Aggression',
        value: 68,
        tone: 'cyan',
        tooltip: 'Aggression is the willingness to escalate when a negotiation stalls.',
      },
    ],
    motto: '“Results justify the methods, but the game always remembers.”',
  },

  status: [
    {
      id: 'board',
      icon: 'shieldCheck',
      title: 'Board Confidence: Strong',
      detail: 'Ownership is aligned with your direction.',
      badge: 'High',
      tone: 'positive',
    },
    {
      id: 'points',
      icon: 'sparkle',
      title: 'Development Points Available',
      detail: '2 unspent development points.',
      badge: 'Action',
      tone: 'gold',
      tooltip: 'Spend them in Development — skills or perks.',
    },
    {
      id: 'captain',
      icon: 'handshake',
      title: 'Captain Relationship: Improving',
      detail: 'Increased trust after recent decisions.',
      badge: 'Positive',
      tone: 'positive',
    },
    {
      id: 'playoff',
      icon: 'flame',
      title: 'Playoff Race Heating Up',
      detail: 'Orbits are 2 games out of 4th seed.',
      badge: 'Note',
      tone: 'cyan',
    },
    {
      id: 'media',
      icon: 'mic',
      title: 'Media Scrutiny: Low',
      detail: 'Media narrative is currently stable.',
      badge: 'Low',
      tone: 'neutral',
    },
    {
      id: 'legal',
      icon: 'triangleAlert',
      title: 'Legal Risk: Moderate',
      detail: 'Ongoing investigation requires attention.',
      badge: 'Watch',
      tone: 'warning',
      tooltip: 'Undisclosed payments are being reviewed by the league compliance office.',
    },
  ],

  risks: [
    { id: 'ethics', label: 'Ethics', filled: 3, total: 7, tone: 'positive' },
    { id: 'media', label: 'Media', filled: 2, total: 7, tone: 'cyan' },
    { id: 'league', label: 'League', filled: 4, total: 7, tone: 'warning' },
    { id: 'finance', label: 'Finance', filled: 5, total: 7, tone: 'negative' },
  ],

  finances: [
    { id: 'salary', icon: 'banknote', label: 'Salary', value: '$3.2M' },
    { id: 'investments', icon: 'trendingUp', label: 'Legal Investments', value: '$1.1M' },
    {
      id: 'hidden',
      icon: 'walletCards',
      label: 'Hidden Funds',
      value: '$240K',
      tone: 'negative',
      tooltip: 'Off-book reserves. Not declared to the league or the tax office.',
    },
    { id: 'influence', icon: 'landmark', label: 'Influence Budget', value: '$55K' },
  ],

  favors: { owed: 3, held: 5 },

  network: [
    { id: 'agent', label: 'Agent Network', value: 'Strong', tone: 'positive' },
    { id: 'federation', label: 'Federation Contacts', value: 'Medium', tone: 'warning' },
    {
      id: 'underground',
      label: 'Underground Influence',
      value: 'Growing',
      tone: 'cyan',
      tooltip: 'Measures informal influence outside official basketball structures.',
    },
  ],

  allocation: {
    total: '$4.6M',
    caption: 'Total Assets',
    slices: [
      { id: 'salary', label: 'Salary', share: 70, amount: '$3.2M', tone: 'cyan' },
      { id: 'investments', label: 'Investments', share: 24, amount: '$1.1M', tone: 'positive' },
      { id: 'influence', label: 'Influence', share: 6, amount: '$300K', tone: 'gold' },
    ],
  },

  power: {
    label: 'High Leverage',
    filled: 5,
    total: 6,
    caption: 'You have meaningful influence across key power centers.',
    tooltip: 'Leverage combines favours held, network reach and boardroom standing.',
  },

  summaries: [
    {
      id: 'career',
      tabId: 'career',
      title: 'Career',
      subtitle: 'Building a record',
      icon: 'briefcase',
      metrics: [
        { id: 'years', label: 'Years with Orbits', value: '3' },
        { id: 'contract', label: 'Contract', value: '2 years left' },
        { id: 'security', label: 'Job Security', value: 'Secure', tone: 'positive' },
        { id: 'winpct', label: 'Career Win %', value: '.612' },
      ],
      chart: {
        kind: 'line',
        title: 'Win % trend',
        /* Season-by-season win %: a bad third season and then the best one. Deliberately not the
           smooth climb the reputation card draws — a coach's record fluctuates. */
        points: [41, 48, 44, 55, 61],
        endLabel: '.612',
        caption: 'Last 5 seasons',
      },
      footer: 'View career',
    },
    {
      id: 'reputation',
      tabId: 'reputation',
      title: 'Reputation',
      subtitle: 'Standing in the game',
      icon: 'star',
      metrics: [
        { id: 'competitive', label: 'Competitive', value: '200', delta: 'up' },
        { id: 'development', label: 'Development', value: '200', delta: 'flat' },
        { id: 'professional', label: 'Professional', value: '200', delta: 'up' },
        { id: 'public', label: 'Public Standing', value: '200', delta: 'flat' },
      ],
      chart: {
        kind: 'line',
        title: 'Reputation trend',
        /* Monthly standing on the 0..1000 scale, +12.4% over the window: the label and the series
           have to agree. A steady climb, with the flattening every curve has near its ceiling. */
        points: [178, 184, 189, 195, 200],
        endLabel: '+12%',
        caption: 'Last 12 months',
      },
      footer: 'View reputation',
    },
    {
      id: 'relationships',
      tabId: 'relationships',
      title: 'Relationships',
      subtitle: 'People drive opportunity',
      icon: 'users',
      metrics: [
        { id: 'board', label: 'Board', value: '+40', tone: 'positive' },
        { id: 'captain', label: 'Captain', value: '+65', tone: 'positive' },
        { id: 'media', label: 'Media', value: '+10', tone: 'warning' },
        { id: 'staff', label: 'Staff Cohesion', value: '+18', tone: 'cyan' },
      ],
      chart: {
        kind: 'bars',
        title: 'Relationship health',
        columns: [
          { id: 'board', label: 'B', value: 40 },
          { id: 'captain', label: 'C', value: 65 },
          { id: 'media', label: 'M', value: 10 },
          { id: 'staff', label: 'S', value: 18 },
        ],
      },
      footer: 'View relationships',
    },
    {
      id: 'development',
      tabId: 'development',
      title: 'Development',
      subtitle: 'Improve yourself',
      icon: 'chartBars',
      metrics: [],
      chart: {
        kind: 'meters',
        title: 'Active tracks',
        rows: [
          { id: 'tactical', label: 'Tactical Mind', level: 4, max: 5 },
          { id: 'player', label: 'Player Development', level: 3, max: 5 },
          { id: 'leadership', label: 'Leadership', level: 3, max: 5 },
        ],
      },
      banner: { text: '2 Perk Points Available', tooltip: 'Perks unlock in the Development board.' },
      footer: 'View development',
    },
    {
      id: 'opportunities',
      tabId: 'opportunities',
      title: 'Opportunities',
      subtitle: "What's next",
      icon: 'target',
      metrics: [
        { id: 'clubs', label: 'Clubs Interested', value: '1' },
        { id: 'interviews', label: 'Interviews', value: '0' },
        { id: 'paths', label: 'Open Paths', value: '2', tone: 'cyan' },
        { id: 'market', label: 'Market Interest', value: 'Moderate', tone: 'warning' },
      ],
      chart: {
        kind: 'steps',
        title: 'Opportunity pipeline',
        /* A staircase, not a line: the pipeline only ever moves in whole opportunities. Ends on the
           four the card's "4 tracked" caption claims, and stays flat while nothing new appears. */
        points: [0, 1, 2, 2, 3, 4, 4],
        caption: '4 tracked · 2 active',
      },
      footer: 'View opportunities',
    },
    {
      id: 'legacy',
      tabId: 'legacy',
      title: 'Legacy',
      subtitle: 'A lasting impact',
      icon: 'trophy',
      metrics: [
        { id: 'titles', label: 'Championships', value: '0' },
        { id: 'finals', label: 'Finals', value: '1' },
        { id: 'playoffs', label: 'Playoffs', value: '2' },
        { id: 'wins', label: 'Career Wins', value: '100', tone: 'gold' },
      ],
      chart: {
        kind: 'ring',
        title: 'Legacy progress',
        value: 21,
        caption: 'Hall of Fame track',
      },
      footer: 'View legacy',
    },
  ],

  timeline: [
    {
      id: 'win',
      date: 'Mar 14, 2028',
      icon: 'trophy',
      title: 'Win vs Talon',
      highlight: '108 – 97',
      detail: "Orbits' offense dominates in statement win.",
      tone: 'gold',
    },
    {
      id: 'perk',
      date: 'Mar 10, 2028',
      icon: 'sparkle',
      title: 'Unlocked Perk',
      highlight: 'Staff Network II',
      detail: 'Expanded access to league personnel.',
      tone: 'purple',
    },
    {
      id: 'media',
      date: 'Mar 6, 2028',
      icon: 'mic',
      title: 'Media Praise',
      highlight: '“Getting the most out of this roster.”',
      detail: 'National media recognition increases.',
      tone: 'cyan',
    },
    {
      id: 'board',
      date: 'Mar 1, 2028',
      icon: 'users',
      title: 'Board Meeting',
      highlight: 'Confidence remains strong',
      detail: 'Discussed long-term vision and facility plans.',
      tone: 'positive',
    },
    {
      id: 'milestone',
      date: 'Feb 22, 2028',
      icon: 'flag',
      title: 'Milestone Reached',
      /* Sample copy, not a measured figure: this filler used to claim "100 Career Wins" while Career
         reported zero wins. Same treatment Legacy gives its stand-in career-wins milestone. */
      highlight: 'Sample milestone',
      detail: 'Sample timeline entry — illustrative, not a live career record.',
      tone: 'positive',
    },
  ],
}
