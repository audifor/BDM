import type { WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

/**
 * Traced 1:1 from docs/visual-proposal/src/art.js (Courtside, direction B).
 * Static SVG path strings only, never accepts data from GameWorld or user input.
 */
const GLYPHS: Readonly<Record<string, string>> = {
  "home": "<path d=\"M3 11.5 12 4l9 7.5\"/><path d=\"M5.5 10.5V20h13v-9.5\"/><path d=\"M10 20v-5.5h4V20\"/>",
  "roster": "<circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3 20c.4-3.6 3-5.6 6-5.6s5.6 2 6 5.6\"/><circle cx=\"17.5\" cy=\"9\" r=\"2.4\"/><path d=\"M17 14.2c2.4.3 3.9 2 4.2 4.8\"/>",
  "player": "<circle cx=\"12\" cy=\"7.5\" r=\"3.6\"/><path d=\"M5 21c.5-4.4 3.4-7 7-7s6.5 2.6 7 7\"/>",
  "tactics": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M12 4v16\"/><circle cx=\"12\" cy=\"12\" r=\"2.8\"/><path d=\"M3 9h3.5v6H3M21 9h-3.5v6H21\"/>",
  "match": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M3.5 12h17M12 3.5v17\"/><path d=\"M6 6.2c2.6 2.4 2.6 9.2 0 11.6M18 6.2c-2.6 2.4-2.6 9.2 0 11.6\"/>",
  "schedule": "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/><path d=\"M8 14h2M12 14h2M8 17h2\"/>",
  "trophy": "<path d=\"M7 4h10v5a5 5 0 0 1-10 0V4Z\"/><path d=\"M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5\"/><path d=\"M12 14v4M8.5 20h7\"/>",
  "training": "<path d=\"M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10\"/>",
  "staff": "<rect x=\"3.5\" y=\"8\" width=\"17\" height=\"11.5\" rx=\"2\"/><path d=\"M8.5 8V6a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 6v2M3.5 13h17\"/>",
  "finances": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M14.6 9.2c-.6-.8-1.6-1.2-2.7-1.2-1.5 0-2.6.8-2.6 2 0 3 5.4 1.6 5.4 4.4 0 1.2-1.2 2-2.8 2-1.2 0-2.3-.5-2.9-1.4M12 6.5V8m0 8v1.5\"/>",
  "more": "<circle cx=\"5\" cy=\"12\" r=\"1.3\"/><circle cx=\"12\" cy=\"12\" r=\"1.3\"/><circle cx=\"19\" cy=\"12\" r=\"1.3\"/>",
  "medical": "<rect x=\"3.5\" y=\"3.5\" width=\"17\" height=\"17\" rx=\"3\"/><path d=\"M12 8v8M8 12h8\"/>",
  "scouting": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6\"/><path d=\"m15 15 5.5 5.5M8 10.5h5M10.5 8v5\"/>",
  "pin": "<path d=\"M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z\"/><circle cx=\"12\" cy=\"9.8\" r=\"2.4\"/>",
  "diamond": "<path d=\"M12 2.800 21.200 12 12 21.200 2.800 12Z\"/><path d=\"M12 7.400 16.600 12 12 16.600 7.400 12Z\"/>",
  "building": "<rect x=\"4\" y=\"3.500\" width=\"11\" height=\"17\" rx=\"1.500\"/><path d=\"M15 9h5v11.500h-5M8 8h3M8 12h3M8 16h3\"/>",
  "lock": "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 10.5V8a4 4 0 0 1 8 0v2.5\"/>",
  "shield": "<path d=\"M12 3 5 6v6c0 4.2 3 7.2 7 9 4-1.8 7-4.8 7-9V6l-7-3Z\"/>",
  "star": "<path d=\"m12 3.8 2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L12 16.6 6.9 19.4 8 13.7 3.8 9.8l5.7-.7L12 3.8Z\"/>",
  "graduation": "<path d=\"m2.500 9.500 9.500-4.500 9.500 4.500L12 14Z\"/><path d=\"M6.500 11.500v4.500c1.500 1.500 3.500 2.200 5.500 2.200s4-.7 5.500-2.200v-4.500\"/>",
  "users": "<circle cx=\"9\" cy=\"8\" r=\"3\"/><circle cx=\"17\" cy=\"9\" r=\"2.4\"/><path d=\"M3 19c.4-3.2 2.8-5 6-5s5.6 1.8 6 5M16 14.5c2.4 0 4.4 1.4 5 4.5\"/>",
  "swap": "<path d=\"M4 8h14l-3-3M20 16H6l3 3\"/>",
  "doc": "<path d=\"M6 3.5h8l4 4V20.5H6V3.5Z\"/><path d=\"M14 3.5v4h4M9 12h6M9 15.5h6\"/>",
  "heart": "<path d=\"M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z\"/>",
  "news": "<rect x=\"3.500\" y=\"4.500\" width=\"17\" height=\"15\" rx=\"2\"/><path d=\"M7 9h6M7 12.500h10M7 16h10\"/>",
  "target": "<circle cx=\"12\" cy=\"12\" r=\"8.500\"/><circle cx=\"12\" cy=\"12\" r=\"4.500\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/>",
}

const APP_GLYPH: Readonly<Record<WorkspaceAppId, string>> = {
  home:'home', roster:'roster', player:'player', staff:'staff', scouting:'scouting',
  tactics:'tactics', training:'training', mentoring:'users', medical:'medical',
  schedule:'schedule', competition:'trophy', match:'match', market:'swap',
  draft:'graduation', trades:'swap', club:'building', contracts:'doc',
  board:'shield', finances:'finances', enforcement:'lock', facilities:'building',
  coach:'player', 'coach-finances':'finances', memories:'heart',
  narratives:'doc', media:'news', recruiting:'target', talent:'users',
  portal:'swap', nil:'star', boosters:'users',
}

export function CourtsideGlyph({name,size=22}: {readonly name:string;readonly size?:number}) {
  return <svg aria-hidden="true" fill="none" height={size} width={size}
    viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{__html: GLYPHS[name] ?? GLYPHS.more}} />
}

export function CourtsideTaskbarIcon({id}: {readonly id:WorkspaceAppId}) {
  return <CourtsideGlyph name={APP_GLYPH[id]} />
}
