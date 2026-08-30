import boostersSmall from './assets/small-boosters.png'
import boardSmall from './assets/small-board.png'
import careerLarge from './assets/large-career.png'
import clubLarge from './assets/large-club.png'
import clubSmall from './assets/small-club.png'
import collegeLarge from './assets/large-college.png'
import complianceSmall from './assets/small-compliance.png'
import competitionLarge from './assets/large-competition.png'
import competitionSmall from './assets/small-competition.png'
import financesLarge from './assets/large-finances.png'
import financesMedium from './assets/medium-finances.png'
import financesSmall from './assets/small-finances.png'
import gamesLarge from './assets/large-games.png'
import historiesSmall from './assets/small-histories.png'
import homeMedium from './assets/medium-home.png'
import marketLarge from './assets/large-market.png'
import marketMedium from './assets/medium-market.png'
import marketSmall from './assets/small-market.png'
import matchLarge from './assets/large-match.png'
import matchMedium from './assets/medium-match.png'
import matchSmall from './assets/small-match.png'
import medicalLarge from './assets/large-medical.png'
import medicalSmall from './assets/small-medical.png'
import mediaLarge from './assets/large-media.png'
import mediaSmall from './assets/small-media.png'
import memoriesSmall from './assets/small-memories.png'
import messagesMedium from './assets/medium-messages.png'
import narrativeLarge from './assets/large-narrative.png'
import newsMedium from './assets/medium-news.png'
import nilSmall from './assets/small-nil.png'
import patrimonySmall from './assets/small-patrimony.png'
import profileSmall from './assets/small-profile.png'
import recruitingSmall from './assets/small-recruiting.png'
import rosterLarge from './assets/large-roster.png'
import rosterMedium from './assets/medium-roster.png'
import rosterSmall from './assets/small-roster.png'
import scheduleLarge from './assets/large-schedule.png'
import scheduleMedium from './assets/medium-schedule.png'
import scheduleSmall from './assets/small-schedule.png'
import searchMedium from './assets/medium-search.png'
import settingsMedium from './assets/medium-settings.png'
import staffLarge from './assets/large-staff.png'
import staffSmall from './assets/small-staff.png'
import tacticsLarge from './assets/large-tactics.png'
import tacticsSmall from './assets/small-tactics.png'
import teamLarge from './assets/large-team.png'
import trainingLarge from './assets/large-training.png'
import trainingSmall from './assets/small-training.png'

type IconSources = { readonly large?: string; readonly medium?: string; readonly small?: string }
export const BDM_ICON_REGISTRY = {
  home: { medium: homeMedium }, news: { medium: newsMedium }, messages: { medium: messagesMedium }, search: { medium: searchMedium }, settings: { medium: settingsMedium },
  roster: { large: rosterLarge, medium: rosterMedium, small: rosterSmall }, tactics: { large: tacticsLarge, small: tacticsSmall }, training: { large: trainingLarge, small: trainingSmall }, staff: { large: staffLarge, small: staffSmall }, medical: { large: medicalLarge, small: medicalSmall },
  schedule: { large: scheduleLarge, medium: scheduleMedium, small: scheduleSmall }, match: { large: matchLarge, medium: matchMedium, small: matchSmall }, competition: { large: competitionLarge, small: competitionSmall }, market: { large: marketLarge, medium: marketMedium, small: marketSmall },
  club: { large: clubLarge, small: clubSmall }, board: { small: boardSmall }, finances: { large: financesLarge, medium: financesMedium, small: financesSmall }, compliance: { small: complianceSmall }, profile: { small: profileSmall }, patrimony: { small: patrimonySmall }, media: { large: mediaLarge, small: mediaSmall }, histories: { small: historiesSmall }, memories: { small: memoriesSmall }, recruiting: { small: recruitingSmall }, nil: { small: nilSmall }, boosters: { small: boostersSmall },
  team: { large: teamLarge }, games: { large: gamesLarge }, college: { large: collegeLarge }, career: { large: careerLarge }, narrative: { large: narrativeLarge },
} as const satisfies Record<string, IconSources>

export type BdmIconName = keyof typeof BDM_ICON_REGISTRY
export const BDM_APP_ICON_BY_ID = { bdm: 'home', squad: 'roster', tactics: 'tactics', training: 'training', staff: 'staff', medical: 'medical', schedule: 'schedule', match: 'match', competition: 'competition', market: 'market', club: 'club', board: 'board', finances: 'finances', enforcement: 'compliance', coach: 'profile', 'coach-finances': 'patrimony', media: 'media', narratives: 'histories', memories: 'memories', recruiting: 'recruiting', nil: 'nil', boosters: 'boosters', settings: 'settings' } as const satisfies Record<string, BdmIconName>

export function getBdmIconSource(name: BdmIconName, size: number) { const sources: IconSources = BDM_ICON_REGISTRY[name]; return size >= 40 ? sources.large ?? sources.medium ?? sources.small : size >= 24 ? sources.medium ?? sources.small ?? sources.large : sources.small ?? sources.medium ?? sources.large }
