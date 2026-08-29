import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Battery,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  GripVertical,
  Minus,
  MoreHorizontal,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import iconRoster from "./assets/sidebar/roster.svg";
import iconTraining from "./assets/sidebar/training.svg";
import iconTactics from "./assets/sidebar/tactics.svg";
import iconCalendar from "./assets/sidebar/calendar.svg";
import iconClub from "./assets/sidebar/club.svg";
import iconMedical from "./assets/sidebar/medical.svg";
import iconMarket from "./assets/sidebar/market.svg";
import iconSettings from "./assets/sidebar/settings.svg";
import iconScouting from "./assets/sidebar/scouting.svg";
import TacticsCreatorAdvanced from "./components/TacticsCreatorAdvanced";
import TacticsBoardAdvanced from "./components/TacticsBoardAdvanced";
import MatchViewer from "./components/match/MatchViewer";
import { getActivePlaybookPlays } from "./lib/playbookManager";
import { useTickBuffer } from "./hooks/useTickBuffer";
import SectionRouter from "./pages/SectionRouter";
import StartPage from "./pages/StartPage";
import HubPage from "./pages/HubPage";
import DetailOverlay from "./components/DetailOverlay";
import PlayerPage from "./pages/PlayerPage";
import SmartphoneOverlay from "./components/SmartphoneOverlay";
import QuickSearchModal from "./components/QuickSearchModal";
import PlayerCompareModal from "./components/PlayerCompareModal";
import {
  TACTICAL_DUTIES,
  TACTICAL_POSITIONS,
  TACTICAL_ROLES_BY_POS,
  calcRoleSuitability,
  getDefaultRoleForPosition,
  normalizePosition,
} from "./lib/tacticalRoles";

 

const MATCH_SHOUTS = ["Intensidad", "Ataque", "Defensa", "Ritmo Alto", "Calma"];
const MATCH_TIMEOUT_OPTIONS = ["team", "short", "full", "media"];
const MATCH_DEFENSE_OPTIONS = ["Hombre a Hombre", "Zona 2-3", "Zona 3-2", "Box-and-1", "Presion"];
const MATCH_PNR_DEFENSE_OPTIONS = ["Drop", "Switch", "Hedge", "Blitz", "Ice"];
const MATCH_PACE_OPTIONS = [
  { value: 0, label: "Muy lento" },
  { value: 1, label: "Lento" },
  { value: 2, label: "Normal" },
  { value: 3, label: "Rápido" },
  { value: 4, label: "Muy rápido" },
];
const MATCH_FOCUS_OPTIONS = ["Equilibrado", "Perímetro", "Poste bajo", "Pick & Roll", "Aislamiento"];
const MATCH_SPACING_OPTIONS = ["4-Out 1-In (Estandar)", "5-Out", "3-Out 2-In", "Horns"];
const MATCH_RISK_OPTIONS = [
  { value: 0, label: "Seguro" },
  { value: 1, label: "Normal" },
  { value: 2, label: "Arriesgado" },
];
const MATCH_FREEDOM_OPTIONS = [
  { value: 0, label: "Estricto" },
  { value: 1, label: "Balance" },
  { value: 2, label: "Libre" },
];
const MATCH_TRANSITION_OPTIONS = [
  { value: 0, label: "Parar" },
  { value: 1, label: "Normal" },
  { value: 2, label: "Correr" },
];
const MATCH_SPEED_MS = {
  1: 320,
  2: 150,
  4: 30,
};
const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const MATCH_PLAYBOOKS = [
  { id: "balance", name: "Balance (Motion)", focus: "Equilibrado", type: "Motion" },
  { id: "pNr", name: "Pick & Roll Heavy", focus: "Pick & Roll", type: "Set" },
  { id: "spacing", name: "Spacing 5-Out", focus: "3PT", type: "Flow" },
  { id: "post", name: "Post Inside", focus: "Post", type: "Set" },
  { id: "tempo", name: "Transition Tempo", focus: "Transition", type: "Flow" },
];

const NAV_ITEMS = [
  { id: "Hub", label: "Hub", icon: iconSettings },
  { id: "Plantilla", label: "Plantilla", icon: iconRoster },
  { id: "Entrenamiento", label: "Entrenamiento", icon: iconTraining },
  { id: "Tacticas", label: "Tacticas", icon: iconTactics },
  { id: "Competicion", label: "Competicion", icon: iconCalendar },
  { id: "Scouting", label: "Scouting", icon: iconScouting },
  { id: "Club", label: "Club", icon: iconClub },
  { id: "Medical", label: "Medical", icon: iconMedical },
  { id: "Mercado", label: "Mercado", icon: iconMarket },
];
const TAG_OPTIONS = ["Top", "Seguimiento", "Duda", "Descartar"];
const ATTRIBUTE_SECTIONS = [
  {
    key: "ofensiva",
    label: "Ofensiva",
    attrs: [
      "finishing_close",
      "dunking",
      "floater",
      "mid_range",
      "three_static",
      "three_off_dribble",
      "deep_range",
      "free_throw",
      "post_scoring",
      "contact_finishing",
      "contested_shot",
      "off_screen_shot",
      "hook_shot",
      "fadeaway",
      "weak_hand_finish",
    ],
  },
  {
    key: "cerebro",
    label: "Cerebro",
    attrs: [
      "court_vision",
      "pass_short",
      "pass_long",
      "pass_bounce",
      "pass_post",
      "pass_speed",
      "creativity",
      "shot_selection",
      "pnr_read",
      "help_read",
      "clock_mgmt",
      "spacing_iq",
      "off_ball_move",
      "ball_security_iq",
      "court_leadership",
    ],
  },
  {
    key: "defensa",
    label: "Defensa",
    attrs: [
      "def_perimeter",
      "def_post",
      "shot_contest",
      "steal_onball",
      "screen_nav",
      "help_defense",
      "steal_pass",
      "closeout",
      "def_pnr_inside",
      "def_transition",
      "block",
      "intimidation",
      "box_out",
      "reb_def",
      "foul_discipline",
    ],
  },
  {
    key: "fisico",
    label: "Fisico",
    attrs: [
      "acceleration",
      "speed_top",
      "agility_lat",
      "deceleration",
      "coordination",
      "strength_static",
      "strength_explo",
      "vert_static",
      "vert_run",
      "second_jump",
      "stamina",
      "fatigue_recov",
      "durability",
      "flexibility",
      "hands",
    ],
  },
  {
    key: "manejo",
    label: "Manejo",
    attrs: [
      "ball_control",
      "ball_protect",
      "off_hand_dribble",
      "catching",
      "triple_threat",
      "crossover",
      "spin_move",
      "behind_back",
      "in_and_out",
      "step_back_tech",
      "traffic_dribble",
      "speed_ball",
      "hesitation",
      "low_dribble",
      "nutmeg",
    ],
  },
  {
    key: "psico",
    label: "Psico",
    attrs: [
      "clutch",
      "consistency",
      "work_ethic",
      "mental_tough",
      "aggressiveness",
      "vocal_lead",
      "chemistry",
      "adaptability",
      "professionalism",
      "temperament",
      "ambition",
      "loyalty",
      "greed",
      "pressure_res",
      "extroversion",
    ],
  },
];
const ROSTER_VIEWS = [
  {
    id: "general",
    name: "Resumen General",
    columns: ["pos", "rotation_slot", "age", "height", "weight", "wingspan", "nationality", "archetype", "salary"],
  },
  ...ATTRIBUTE_SECTIONS.map((section) => ({
    id: section.key,
    name: section.label,
    columns: section.attrs.slice(),
  })),
];

const DEFAULT_MENTOR_FOCUS = ATTRIBUTE_SECTIONS[0]?.attrs?.[0] || "professionalism";

const ATTRIBUTE_KEYS = new Set(
  ATTRIBUTE_SECTIONS.reduce((acc, section) => acc.concat(section.attrs), []),
);

const COUNTRY_FLAG_MAP = {
  UK: "GB",
  ENG: "GB",
  SCO: "GB",
  WAL: "GB",
  USA: "US",
  UAE: "AE",
  GER: "DE",
  SPA: "ES",
  ITA: "IT",
  FRA: "FR",
  BRA: "BR",
  ARG: "AR",
};

const countryCodeToIso2 = (code) => {
  if (!code) return "";
  const normalized = String(code).trim().toUpperCase();
  const mapped = COUNTRY_FLAG_MAP[normalized] || normalized;
  return mapped.length === 2 ? mapped : "";
};

const countryCodeToFlagUrl = (code) => {
  const iso2 = countryCodeToIso2(code);
  if (!iso2) return "";
  return `https://flagcdn.com/24x18/${iso2.toLowerCase()}.png`;
};

const TEAM_OVERRIDE_STORAGE = "pcbasket.team.overrides";
const SEASON_TRANSITION_STORAGE = "pcbasket.season.transitions";
const ACB_RELEGATION_COUNT = 2;
const FEB_PROMOTION_COUNT = 2;
const FEB_PLAYOFF_TEAMS = 8;
let LEAGUE_CATALOG = [];
let DEFAULT_LEAGUE_ID = "ACB";
let LEAGUE_ORDER = [];
let LEAGUE_CONFIG = {};

const applyLeagueCatalog = (catalog) => {
  const leagues = Array.isArray(catalog?.leagues) ? catalog.leagues : [];
  const normalized = leagues
    .map((league) => {
      const id = String(league?.id || "").toUpperCase();
      if (!id) return null;
      return { ...league, id, rules: league.rules || {} };
    })
    .filter(Boolean);
  LEAGUE_CATALOG = normalized;
  DEFAULT_LEAGUE_ID = String(catalog?.defaultLeague || normalized[0]?.id || DEFAULT_LEAGUE_ID).toUpperCase();
  LEAGUE_ORDER = normalized.map((league) => league.id);
  LEAGUE_CONFIG = Object.fromEntries(normalized.map((league) => [league.id, league]));
};

const fallbackLeagueConfig = (leagueId) => ({
  id: leagueId,
  name: leagueId,
  shortName: leagueId,
  ruleset: leagueId,
  rotationType: leagueId,
  level: 0,
  competitions: {},
  rules: {},
  universe: "",
});

const getLeagueConfig = (leagueId) => {
  const key = String(leagueId || DEFAULT_LEAGUE_ID).toUpperCase();
  return LEAGUE_CONFIG[key] || LEAGUE_CONFIG[DEFAULT_LEAGUE_ID] || fallbackLeagueConfig(key);
};

const getTeamLeagueId = (team) => {
  const raw = team?.data?.league_id || team?.data?.league || team?.data?.leagueId;
  const key = String(raw || DEFAULT_LEAGUE_ID).toUpperCase();
  if (!Object.keys(LEAGUE_CONFIG || {}).length) return key || DEFAULT_LEAGUE_ID;
  return LEAGUE_CONFIG[key] ? key : DEFAULT_LEAGUE_ID;
};

const ROTATION_LEAGUE_RULES = {
  NBA: { name: "NBA", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 12, colCheck: 60 },
  WNBA: { name: "WNBA", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 10, colCheck: 50 },
  FIBA_M: { name: "FIBA Men", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 10, colCheck: 50 },
  FIBA_W: { name: "FIBA Women", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 10, colCheck: 50 },
  ACB: { name: "ACB", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 10, colCheck: 50 },
  FEB: { name: "Primera FEB", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 10, colCheck: 50 },
  NCAA_M: { name: "NCAA Men", labels: ["1st", "2nd"], count: 2, duration: 20, colCheck: 100 },
  NCAA_W: { name: "NCAA Women", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 10, colCheck: 50 },
};

const ROTATION_POS_COLORS = {
  PG: "#facc15",
  SG: "#fb923c",
  SF: "#f87171",
  PF: "#a78bfa",
  C: "#60a5fa",
};

const ROTATION_LEAGUE_TOTAL_MINUTES = {
  NBA: 48,
  WNBA: 40,
  FIBA_M: 40,
  FIBA_W: 40,
  ACB: 40,
  FEB: 40,
  NCAA_M: 40,
  NCAA_W: 40,
};

const ROTATION_LEAGUE_COLORS = {
  NBA: "#ef4444",
  WNBA: "#f97316",
  FIBA_M: "#3b82f6",
  FIBA_W: "#8b5cf6",
  ACB: "#ff7b39",
  FEB: "#16a34a",
  NCAA_M: "#22c55e",
  NCAA_W: "#14b8a6",
};

const ROTATION_SLOT_LABELS = ["PG", "SG", "SF", "PF", "C", "B1", "B2", "B3", "B4", "B5", "B6", "B7"];
const ROTATION_SLOT_COUNT = ROTATION_SLOT_LABELS.length;
const STARTER_POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const STARTER_SLOT_BY_POS = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };

const TRAINING_INTENSITIES = ["Alta", "Media", "Baja", "Muy Baja", "Descanso"];
const TRAINING_CONTEXTS = ["Regular", "Pretemporada", "Doble Partido", "Playoffs"];
const TRAINING_RPE = {
  Alta: 8,
  Media: 5,
  Baja: 3,
  "Muy Baja": 1,
  Descanso: 0,
};

const MAX_TRAINING_SESSIONS_PER_DAY = 3;

const TRAINING_INTENSITY_MULT = {
  Alta: 1.15,
  Media: 1,
  Baja: 0.85,
  "Muy Baja": 0.6,
  Descanso: 0,
};

const TRAINING_EFFECTS = {
  "Tactica Ofensiva (5v0)": { attributes: 0.35, cohesion: 0.45, tactical: 0.9, fitness: 0.2, morale: 0.2, prep: 0.45 },
  "Tactica Ofensiva (5v5)": { attributes: 0.5, cohesion: 0.6, tactical: 0.95, fitness: 0.35, morale: 0.3, prep: 0.7 },
  "Defensa: Bloqueo Directo": { attributes: 0.45, cohesion: 0.45, tactical: 0.9, fitness: 0.3, morale: 0.2, prep: 0.55 },
  "Defensa: Rotaciones": { attributes: 0.4, cohesion: 0.5, tactical: 0.9, fitness: 0.3, morale: 0.2, prep: 0.6 },
  "Tiro & Mecanica": { attributes: 0.85, cohesion: 0.2, tactical: 0.2, fitness: 0.25, morale: 0.35, prep: 0.25 },
  Finalizacion: { attributes: 0.8, cohesion: 0.25, tactical: 0.2, fitness: 0.35, morale: 0.35, prep: 0.25 },
  "Fisico: Resistencia": { attributes: 0.35, cohesion: 0.2, tactical: 0.15, fitness: 0.95, morale: 0.2, prep: 0.2 },
  "Fisico: Fuerza": { attributes: 0.45, cohesion: 0.2, tactical: 0.1, fitness: 0.9, morale: 0.2, prep: 0.2 },
  "Fisico: Velocidad": { attributes: 0.4, cohesion: 0.2, tactical: 0.1, fitness: 0.9, morale: 0.2, prep: 0.2 },
  "Scouting Rival (Video)": { attributes: 0.15, cohesion: 0.25, tactical: 0.55, fitness: 0.05, morale: 0.15, prep: 0.85 },
  "Recuperacion Activa": { attributes: 0.1, cohesion: 0.15, tactical: 0.05, fitness: 0.65, morale: 0.4, prep: 0.1 },
  Shootaround: { attributes: 0.25, cohesion: 0.25, tactical: 0.25, fitness: 0.2, morale: 0.35, prep: 0.5 },
  "Partido Entrenamiento": { attributes: 0.55, cohesion: 0.75, tactical: 0.7, fitness: 0.6, morale: 0.4, prep: 0.55 },
};

const TRAINING_TYPE_ATTRS = {
  "Tactica Ofensiva (5v0)": ["spacing_iq", "off_ball_move", "shot_selection", "pass_short"],
  "Tactica Ofensiva (5v5)": ["court_vision", "shot_selection", "pass_short", "off_ball_move"],
  "Defensa: Bloqueo Directo": ["def_pnr_inside", "screen_nav", "help_defense", "def_perimeter"],
  "Defensa: Rotaciones": ["help_defense", "closeout", "def_transition", "reb_def"],
  "Tiro & Mecanica": ["three_static", "mid_range", "free_throw", "off_screen_shot"],
  Finalizacion: ["finishing_close", "contact_finishing", "floater", "weak_hand_finish"],
  "Fisico: Resistencia": ["stamina", "fatigue_recov", "durability"],
  "Fisico: Fuerza": ["strength_static", "strength_explo", "hands"],
  "Fisico: Velocidad": ["acceleration", "speed_top", "agility_lat"],
  "Scouting Rival (Video)": ["court_vision", "help_read", "spacing_iq"],
  "Recuperacion Activa": ["fatigue_recov", "flexibility", "durability"],
  Shootaround: ["free_throw", "mid_range", "three_static"],
  "Partido Entrenamiento": ["court_vision", "shot_selection", "def_perimeter", "stamina"],
};

const TRAINING_FOCUS_ATTRS = {
  "Instalacion Sistemas": ["spacing_iq", "off_ball_move", "court_vision", "court_leadership", "shot_selection"],
  "Spacing & Timing": ["spacing_iq", "off_ball_move", "court_vision", "ball_security_iq"],
  Ejecucion: ["shot_selection", "pass_short", "pass_long", "creativity"],
  "Memoria Tactica": ["court_vision", "pnr_read", "clock_mgmt", "court_leadership"],
  "Toma de Decisiones": ["shot_selection", "pnr_read", "help_read", "court_vision", "clock_mgmt"],
  "Lectura de Juego": ["help_read", "court_vision", "spacing_iq", "pnr_read"],
  "Situaciones Especiales": ["clock_mgmt", "court_leadership", "adaptability", "shot_selection"],
  "Gameplan Ofensivo": ["court_vision", "spacing_iq", "pass_speed", "off_ball_move"],
  "Defensa del 2v2": ["def_pnr_inside", "screen_nav", "def_perimeter", "help_defense"],
  Comunicacion: ["vocal_lead", "chemistry", "court_leadership", "help_defense"],
  "Agresividad al Balon": ["steal_onball", "def_perimeter", "aggressiveness", "closeout"],
  "Negar Centro": ["def_perimeter", "closeout", "foul_discipline"],
  "Ayudas y Recuperacion": ["help_defense", "closeout", "def_transition", "court_vision"],
  "Close-outs": ["closeout", "shot_contest", "def_perimeter", "agility_lat"],
  "Proteccion de Aro": ["block", "intimidation", "def_post", "vert_static"],
  "Rebote Defensivo": ["reb_def", "box_out", "strength_static", "second_jump"],
  "Volumen de Tiro": ["three_static", "three_off_dribble", "mid_range", "free_throw"],
  "Catch & Shoot": ["three_static", "off_screen_shot", "shot_selection", "hands"],
  "Tiro tras Bote": ["three_off_dribble", "mid_range", "step_back_tech", "ball_control"],
  "Tiros Libres": ["free_throw", "consistency", "mental_tough"],
  "Entradas a Canasta": ["finishing_close", "contact_finishing", "acceleration", "agility_lat"],
  "Juego de Pies": ["post_scoring", "hook_shot", "fadeaway", "coordination"],
  Contacto: ["contact_finishing", "strength_static", "strength_explo", "mental_tough"],
  Flotadoras: ["floater", "finishing_close", "weak_hand_finish", "mid_range"],
  "Capacidad Aerobica": ["stamina", "fatigue_recov", "durability"],
  "Tolerancia al Esfuerzo": ["stamina", "durability", "mental_tough"],
  "Ritmo Alto": ["speed_top", "acceleration", "stamina"],
  "Potencia Explosiva": ["strength_explo", "vert_run", "acceleration"],
  "Fuerza Maxima": ["strength_static", "strength_explo", "hands"],
  "Core & Estabilidad": ["coordination", "strength_static", "durability"],
  "Prevencion Lesiones": ["durability", "flexibility", "fatigue_recov"],
  "Desplazamiento Lateral": ["agility_lat", "acceleration", "def_perimeter"],
  Reaccion: ["coordination", "acceleration", "speed_top"],
  "Sprints Cortos": ["acceleration", "speed_top", "stamina"],
  Agilidad: ["agility_lat", "coordination", "deceleration"],
  "Puntos Debiles Rival": ["court_vision", "help_read", "shot_selection", "spacing_iq"],
  "Tendencias Individuales": ["help_read", "court_vision", "pnr_read", "shot_selection"],
  "Analisis Playbook": ["spacing_iq", "off_ball_move", "court_vision", "clock_mgmt"],
  Estrategia: ["court_leadership", "adaptability", "court_vision", "spacing_iq"],
  "Movilidad Articular": ["flexibility", "agility_lat", "fatigue_recov"],
  Estiramientos: ["flexibility", "fatigue_recov"],
  "Foam Rolling": ["fatigue_recov", "durability"],
  "Yoga / Pilates": ["flexibility", "coordination", "mental_tough"],
  Activacion: ["acceleration", "coordination", "hands"],
  Sensaciones: ["free_throw", "mid_range", "three_static", "consistency"],
  "Repaso Tactico": ["spacing_iq", "pnr_read", "court_vision"],
  Concentracion: ["consistency", "mental_tough", "pressure_res"],
  "Competicion Real": ["clutch", "consistency", "aggressiveness", "mental_tough"],
  "Simulacion Partido": ["shot_selection", "pnr_read", "court_vision", "def_transition"],
  "Gestion Finales": ["clutch", "pressure_res", "clock_mgmt", "court_leadership"],
  Rotaciones: ["help_defense", "def_transition", "court_leadership", "stamina"],
};

const TRAINING_CATALOG = {
  "Tactica Ofensiva (5v0)": ["Instalacion Sistemas", "Spacing & Timing", "Ejecucion", "Memoria Tactica"],
  "Tactica Ofensiva (5v5)": ["Toma de Decisiones", "Lectura de Juego", "Situaciones Especiales", "Gameplan Ofensivo"],
  "Defensa: Bloqueo Directo": ["Defensa del 2v2", "Comunicacion", "Agresividad al Balon", "Negar Centro"],
  "Defensa: Rotaciones": ["Ayudas y Recuperacion", "Close-outs", "Proteccion de Aro", "Rebote Defensivo"],
  "Tiro & Mecanica": ["Volumen de Tiro", "Catch & Shoot", "Tiro tras Bote", "Tiros Libres"],
  "Finalizacion": ["Entradas a Canasta", "Juego de Pies", "Contacto", "Flotadoras"],
  "Fisico: Resistencia": ["Capacidad Aerobica", "Tolerancia al Esfuerzo", "Ritmo Alto"],
  "Fisico: Fuerza": ["Potencia Explosiva", "Fuerza Maxima", "Core & Estabilidad", "Prevencion Lesiones"],
  "Fisico: Velocidad": ["Desplazamiento Lateral", "Reaccion", "Sprints Cortos", "Agilidad"],
  "Scouting Rival (Video)": ["Puntos Debiles Rival", "Tendencias Individuales", "Analisis Playbook", "Estrategia"],
  "Recuperacion Activa": ["Movilidad Articular", "Estiramientos", "Foam Rolling", "Yoga / Pilates"],
  Shootaround: ["Activacion", "Sensaciones", "Repaso Tactico", "Concentracion"],
  "Partido Entrenamiento": ["Competicion Real", "Simulacion Partido", "Gestion Finales", "Rotaciones"],
};

const TRAINING_TYPES = Object.keys(TRAINING_CATALOG);

const LOAD_COLUMNS_DEF = {
  dorsal: { label: "#", defaultWidth: 50, sticky: true },
  name: { label: "JUGADOR", defaultWidth: 220, sticky: true },
  position: { label: "POS", defaultWidth: 60, sticky: true },
  acute: { label: "AGUDA (7d)", defaultWidth: 100, tooltip: "Carga acumulada ultimos 7 dias" },
  chronic: { label: "CRONICA (28d)", defaultWidth: 110, tooltip: "Carga promedio ultimos 28 dias" },
  ratio: { label: "ACWR", defaultWidth: 90, tooltip: "Ratio Aguda/Cronica (Ideal 0.8 - 1.3)" },
  status: { label: "ESTADO", defaultWidth: 120, tooltip: "Riesgo de lesion basado en ACWR" },
  fatigue: { label: "FATIGA (RPE)", defaultWidth: 150, tooltip: "Percepcion de esfuerzo (0-100%)" },
  trend: { label: "TENDENCIA", defaultWidth: 100, tooltip: "Comparativa vs semana anterior" },
  distance: { label: "DIST (KM)", defaultWidth: 90 },
  sprints: { label: "SPRINTS", defaultWidth: 80 },
  desgaste: { label: "DESGASTE", defaultWidth: 100 },
};

const LOAD_DEFAULT_VIEWS = [
  { id: "main", name: "Principal", columns: ["dorsal", "name", "position", "ratio", "status", "fatigue", "trend"] },
  { id: "data", name: "Datos GPS", columns: ["name", "position", "acute", "chronic", "distance", "sprints", "ratio"] },
  { id: "risk", name: "Gestion Riesgo", columns: ["name", "position", "status", "fatigue", "desgaste", "ratio"] },
];

const LOOP_PHASES = [
  { id: "morning", label: "Manana", focus: "Entrenamiento" },
  { id: "afternoon", label: "Tarde", focus: "Tacticas" },
  { id: "night", label: "Noche", focus: "Partido" },
];

const LOOP_DEFAULT_START = "2025-09-01";

const DEFAULT_LOOP_TEAM_STATE = {
  morale: 72,
  fatigue: 38,
  cohesion: 55,
  tactical: 52,
  fitness: 58,
  recovery: 52,
  prep: 45,
};

const trainingDuration = (start, end) => {
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  const minutes = h2 * 60 + m2 - (h1 * 60 + m1);
  return minutes > 0 ? minutes : 0;
};

const parseIsoDate = (value) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  if (!raw) return new Date();
  if (raw.includes("T")) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }
  const [year, month, dayRaw] = raw.split("-").map((part) => Number(String(part).split("T")[0]));
  if (!Number.isFinite(year)) return new Date();
  return new Date(year, (month || 1) - 1, dayRaw || 1);
};

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeFixtureResult = (fixture) => {
  const result = fixture?.result || fixture?.score || {};
  const homeScore = toFiniteNumber(result.homeScore ?? result.home_score ?? result.home);
  const awayScore = toFiniteNumber(result.awayScore ?? result.away_score ?? result.away);
  if (homeScore === null || awayScore === null) return null;
  return { homeScore, awayScore };
};

const extractMyTeamScheduleFromSnapshot = (snapshot, teamId) => {
  if (!snapshot || !teamId) return { schedule: [], results: [] };
  const fixturesByDate = snapshot.fixtures_by_date || {};
  const fixtures = Object.values(fixturesByDate).flat();
  const myFixtures = fixtures.filter(
    (fixture) =>
      String(fixture?.homeId ?? fixture?.home_id) === String(teamId) ||
      String(fixture?.awayId ?? fixture?.away_id) === String(teamId),
  );
  const schedule = myFixtures
    .map((fixture) => {
      if (!fixture?.date) return null;
      const date = formatLocalDate(parseIsoDate(fixture.date));
      const homeId = fixture.homeId ?? fixture.home_id;
      const awayId = fixture.awayId ?? fixture.away_id;
      const result = normalizeFixtureResult(fixture);
      const played = Boolean(fixture.played || fixture.status === "played" || result);
      return {
        id: fixture.id,
        date,
        homeId,
        awayId,
        played,
        resultId: played ? `result-${fixture.id}` : undefined,
      };
    })
    .filter(Boolean)
    .sort((a, b) => parseIsoDate(a.date) - parseIsoDate(b.date));

  const results = myFixtures
    .map((fixture) => {
      if (!fixture?.date) return null;
      const result = normalizeFixtureResult(fixture);
      if (!result) return null;
      return {
        id: `result-${fixture.id}`,
        fixtureId: fixture.id,
        date: formatLocalDate(parseIsoDate(fixture.date)),
        homeId: fixture.homeId ?? fixture.home_id,
        awayId: fixture.awayId ?? fixture.away_id,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
      };
    })
    .filter(Boolean);

  return { schedule, results };
};

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const parseMonthDay = (value) => {
  const parts = String(value || "").split("-");
  return {
    month: Number(parts[1] || 1),
    day: Number(parts[2] || 1),
  };
};

const computeNextSeasonStart = (currentDate) => {
  const { month, day } = parseMonthDay(LOOP_DEFAULT_START);
  const start = new Date(currentDate.getFullYear(), Math.max(0, month - 1), day || 1);
  if (start <= currentDate) {
    start.setFullYear(start.getFullYear() + 1);
  }
  return formatLocalDate(start);
};

const expandDateRange = (range) => {
  if (!range) return [];
  const parts = String(range).split("/");
  const start = parseIsoDate(parts[0]);
  if (Number.isNaN(start.getTime())) return [];
  if (parts.length === 1) return [formatLocalDate(start)];
  const end = parseIsoDate(parts[1]);
  if (Number.isNaN(end.getTime())) return [formatLocalDate(start)];
  const days = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(formatLocalDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
};

const buildRoundRobinSchedule = (teamIds) => {
  const ids = teamIds.slice();
  if (ids.length % 2 !== 0) ids.push(null);
  if (ids.length < 2) return [];
  const fixed = ids[0];
  let rest = ids.slice(1);
  const totalRounds = ids.length - 1;
  const rounds = [];
  for (let round = 0; round < totalRounds; round += 1) {
    const teams = [fixed, ...rest];
    const pairings = [];
    const half = teams.length / 2;
    for (let i = 0; i < half; i += 1) {
      const home = teams[i];
      const away = teams[teams.length - 1 - i];
      if (!home || !away) continue;
      const flip = round % 2 === 1;
      pairings.push(flip ? { homeId: away, awayId: home } : { homeId: home, awayId: away });
    }
    rounds.push(pairings);
    rest = [rest[rest.length - 1], ...rest.slice(0, rest.length - 1)];
  }
  const secondRound = rounds.map((round) =>
    round.map((fixture) => ({ homeId: fixture.awayId, awayId: fixture.homeId })),
  );
  return [...rounds, ...secondRound];
};

const resolveTrainingAttributes = (type, focus) => {
  const fromFocus = TRAINING_FOCUS_ATTRS[focus] || [];
  const fromType = TRAINING_TYPE_ATTRS[type] || [];
  const list = fromFocus.length ? fromFocus : fromType;
  return list.filter((key) => ATTRIBUTE_KEYS.has(key));
};

const computeTrainingEffects = (session) => {
  const base = TRAINING_EFFECTS[session.type] || {
    attributes: 0.2,
    cohesion: 0.2,
    tactical: 0.2,
    fitness: 0.2,
    morale: 0.2,
    prep: 0.2,
  };
  const duration = trainingDuration(session.startTime, session.endTime);
  const intensity = TRAINING_INTENSITY_MULT[session.intensity] || 0;
  const scale = (duration / 90) * intensity;
  const clamp = (value) => Math.max(0, Math.min(3, Number((value * scale).toFixed(2))));
  const attributeKeys = resolveTrainingAttributes(session.type, session.focus);
  return {
    attributes: clamp(base.attributes),
    cohesion: clamp(base.cohesion),
    tactical: clamp(base.tactical),
    fitness: clamp(base.fitness),
    morale: clamp(base.morale),
    prep: clamp(base.prep),
    attributeKeys,
  };
};

const withTrainingEffects = (session) => ({
  ...session,
  effects: computeTrainingEffects(session),
});

const capTrainingSessions = (day) => ({
  ...day,
  sessions: (day.sessions || []).slice(0, MAX_TRAINING_SESSIONS_PER_DAY).map(withTrainingEffects),
});

const startOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const isoDate = (date) => date.toISOString().split("T")[0];

const getRotationOptions = (leagueType) => {
  const total = ROTATION_LEAGUE_TOTAL_MINUTES[leagueType] || 40;
  const std = { s: Math.round(total * 0.675), b: Math.round(total * 0.325) };
  const short = { s: Math.round(total * 0.75), b: Math.round(total * 0.3125) };
  const playoff = { s: Math.round(total * 0.825), b: Math.round(total * 0.29) };
  const game7 = { s: Math.round(total * 0.9), b: Math.round(total * 0.25) };
  const heavy = { s: Math.round(total * 0.9), b: Math.round(total * 0.1) };
  const load = { s: Math.round(total * 0.5), b: Math.round(total * 0.35) };
  const pre = { s: Math.round(total * 0.5), b: Math.round(total * 0.35), r: Math.round(total * 0.15) };
  const euro = { s: Math.round(total * 0.6), b: Math.round(total * 0.4) };
  const bench = { s: Math.round(total * 0.45), b: Math.round(total * 0.55) };

  return [
    { value: "std_10", label: "1. Estandar (10 Hombres)", group: "Estandar", desc: `Rotacion clasica (~${std.s}/${std.b} min).` },
    { value: "std_9", label: "2. Rotacion Corta (9)", group: "Estandar", desc: `Menos rotacion (~${short.s}/${short.b} min).` },
    { value: "po_8", label: "3. Playoff (8 Hombres)", group: "Competicion", desc: `Rotacion apretada, titulares ~${playoff.s} min.` },
    { value: "po_7", label: "4. Septimo Partido (7)", group: "Competicion", desc: `Solo los mejores (~${game7.s} min).` },
    { value: "starter_heavy", label: "5. Titulares Exprimidos", group: "Competicion", desc: `Titulares ~${heavy.s} min, riesgo lesion.` },
    { value: "load_mgmt", label: "6. Load Management", group: "Fisico", desc: `Limite ~${load.s} min para estrellas.` },
    { value: "preseason", label: "7. Pretemporada", group: "Fisico", desc: `Minutos repartidos (~${pre.s}/${pre.b}/${pre.r}).` },
    { value: "dev_youth", label: "8. Desarrollo Jovenes", group: "Desarrollo", desc: "Prioridad a menores de 23 anos." },
    { value: "showcase", label: "9. Escaparate", group: "Desarrollo", desc: "Minutos para transferibles." },
    { value: "bench_mob", label: "10. Unidad B", group: "Estrategico", desc: `Suplentes mas (~${bench.b}/${bench.s} min).` },
    { value: "sixth_man", label: "11. Sexto Hombre Estrella", group: "Estrategico", desc: "Un suplente con minutos de estrella." },
    { value: "small_ball", label: "12. Small Ball", group: "Tactico", desc: "Menos pivots, mas perimetro." },
    { value: "tall_ball", label: "13. Tall Ball", group: "Tactico", desc: "Dos torres interiores siempre." },
    { value: "defense", label: "14. Cerrojazo Defensivo", group: "Tactico", desc: "Prioridad a perfiles defensivos." },
    { value: "offense", label: "15. Todo al Ataque", group: "Tactico", desc: "Prioridad a tiradores/anotadores." },
    { value: "veterans", label: "16. Jerarquia Veterana", group: "Situacional", desc: "Veteranos mandan, jovenes sentados." },
    { value: "crisis", label: "17. Emergencia (6)", group: "Situacional", desc: `Solo 6 disponibles (~${Math.round(total * 0.833)} min).` },
    { value: "garbage", label: "18. Minutos Basura", group: "Situacional", desc: "Titulares descansan totalmente." },
    { value: "euro", label: "19. Estilo Europeo", group: "Estilo", desc: `Rotacion coral (~${euro.s} max).` },
    { value: "random", label: "20. Caos", group: "Estilo", desc: "Distribucion aleatoria." },
  ];
};

const STAFF_ATTR_SECTIONS = [
  {
    key: "offense",
    label: "Ofensiva",
    attrs: [
      "off_teach_shoot",
      "off_teach_finish",
      "off_teach_handle",
      "off_teach_1v1",
      "off_teach_pass",
      "off_scheme_pace",
      "off_scheme_set",
      "off_scheme_pnr",
      "off_scheme_space",
      "off_scheme_iso",
      "off_scheme_post",
      "off_shot_select",
      "off_movement",
      "off_ato_creative",
      "off_adjustments",
    ],
  },
  {
    key: "defense",
    label: "Defensa",
    attrs: [
      "def_teach_onball",
      "def_teach_rim",
      "def_teach_hands",
      "def_teach_reb",
      "def_teach_screen",
      "def_scheme_help",
      "def_scheme_pnr",
      "def_scheme_zone",
      "def_scheme_trans",
      "def_scheme_press",
      "def_discipline",
      "def_matchup",
      "def_comm",
      "def_clutch",
      "def_adjustments",
    ],
  },
  {
    key: "development",
    label: "Desarrollo",
    attrs: [
      "dev_strength",
      "dev_speed",
      "dev_vertical",
      "dev_cardio",
      "dev_flexibility",
      "dev_coord",
      "dev_prospect",
      "dev_veteran",
      "dev_position",
      "dev_work_ethic",
      "dev_load_mgmt",
      "dev_weight",
      "dev_regression",
      "dev_gleague",
      "dev_predraft",
    ],
  },
  {
    key: "psychology",
    label: "Psico",
    attrs: [
      "psy_ego",
      "psy_locker",
      "psy_crisis",
      "psy_toughness",
      "psy_clutch_dev",
      "psy_adapt",
      "psy_focus",
      "psy_aggress",
      "psy_welfare",
      "psy_role",
      "psy_media",
      "psy_staff",
      "psy_owner",
      "psy_culture",
      "psy_loyalty",
    ],
  },
  {
    key: "scouting",
    label: "Scouting",
    attrs: [
      "sct_eval_curr",
      "sct_eval_pot",
      "sct_character",
      "sct_medical",
      "sct_draft",
      "sct_intl",
      "sct_gem",
      "sct_analytics",
      "sct_cap",
      "sct_contract",
      "sct_trade",
      "sct_value",
      "sct_recruit",
      "sct_agent",
      "sct_spy",
    ],
  },
  {
    key: "medical",
    label: "Medico",
    attrs: [
      "med_diagnosis",
      "med_acute",
      "med_chronic",
      "med_fatigue",
      "med_surgery",
      "med_prevent",
      "med_nutrition",
      "med_sleep",
      "med_regen",
      "med_emergency",
      "med_infectious",
      "med_mental",
      "med_rehab_mor",
      "med_peaking",
      "med_longevity",
    ],
  },
];

export default function App() {
  const [output, setOutput] = useState("Listo.");
  const [players, setPlayers] = useState([]);
  const [playersByLeague, setPlayersByLeague] = useState({});
  const [teams, setTeams] = useState([]);
  const [myTeamId, setMyTeamId] = useState("");
  const [contracts, setContracts] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingAgencies, setLoadingAgencies] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [filterPos, setFilterPos] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [agencyQuery, setAgencyQuery] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [agentAgencyFilter, setAgentAgencyFilter] = useState("");
  const [theme, setTheme] = useState("dark");
  const isLight = theme === "light";
  const [section, setSection] = useState("Hub");
  const [playerReturnSection, setPlayerReturnSection] = useState("Hub");
  const [hubSnapshot, setHubSnapshot] = useState(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [analyticsSnapshot, setAnalyticsSnapshot] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedAgencyId, setSelectedAgencyId] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [selectedAttrSection, setSelectedAttrSection] = useState("ofensiva");
  const [selectedStaffAttrSection, setSelectedStaffAttrSection] = useState("offense");
  const [selectedBoardAttrSection, setSelectedBoardAttrSection] = useState("offense");
  const [playerTab, setPlayerTab] = useState("perfil");
  const [playerTacticalPos, setPlayerTacticalPos] = useState("PG");
  const [staffTab, setStaffTab] = useState("perfil");
  const [agencies, setAgencies] = useState([]);
  const [agents, setAgents] = useState([]);
  const [scoutTier, setScoutTier] = useState("");
  const [scoutOrigin, setScoutOrigin] = useState("");
  const [scoutMental, setScoutMental] = useState("");
  const [scoutArchetype, setScoutArchetype] = useState("");
  const [scoutTrait, setScoutTrait] = useState("");
  const [scoutPerk, setScoutPerk] = useState("");
  const [scoutTag, setScoutTag] = useState("");
  const [scoutQuery, setScoutQuery] = useState("");
  const [rosterView, setRosterView] = useState("plantilla");
  const [activeRosterView, setActiveRosterView] = useState(ROSTER_VIEWS[0].id);
  const [visibleRosterColumns, setVisibleRosterColumns] = useState(ROSTER_VIEWS[0].columns.slice());
  const [customRosterColumns, setCustomRosterColumns] = useState([]);
  const [showRosterColumnPicker, setShowRosterColumnPicker] = useState(false);
  const [rosterSort, setRosterSort] = useState({ key: "name", direction: "asc" });
  const [draggedRosterColIndex, setDraggedRosterColIndex] = useState(null);
  const rosterColumnPickerRef = useRef(null);
  const [clubView, setClubView] = useState("dashboard"); 
  const [marketView, setMarketView] = useState("search"); 
  const [marketSelectedNegotiationId, setMarketSelectedNegotiationId] = useState(null); 
  const [marketOfferPlayerId, setMarketOfferPlayerId] = useState(null); 
  const [marketOfferNegotiationId, setMarketOfferNegotiationId] = useState(null);
  const [marketOfferInitial, setMarketOfferInitial] = useState(null); 
  const [marketOfferScholarshipMode, setMarketOfferScholarshipMode] = useState(false); 
  const [contractCatalog, setContractCatalog] = useState(null); 
  const [tacticsView, setTacticsView] = useState("board"); 
  const [trainingView, setTrainingView] = useState("team");
  const [medicalView, setMedicalView] = useState("overview");
  const [competitionView, setCompetitionView] = useState("calendar");
  const [competitionLeagueId, setCompetitionLeagueId] = useState("");
  const [competitionSnapshots, setCompetitionSnapshots] = useState({});
  const [competitionSnapshotLoading, setCompetitionSnapshotLoading] = useState(false);
  const [activeLeagueIds, setActiveLeagueIds] = useState([]);
  const [needsNewGame, setNeedsNewGame] = useState(true);
  const [newGameLeagueIds, setNewGameLeagueIds] = useState(() =>
    LEAGUE_ORDER.length ? LEAGUE_ORDER.slice() : [DEFAULT_LEAGUE_ID],
  );
  const [newGameTeamId, setNewGameTeamId] = useState("");
  const [newGameError, setNewGameError] = useState("");
  const [competitionMonth, setCompetitionMonth] = useState(() => {
    const base = parseIsoDate(LOOP_DEFAULT_START);
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [competitionRound, setCompetitionRound] = useState(null);
  const [competitionCalendarFilter, setCompetitionCalendarFilter] = useState("all");
  const [competitionCalendarTeamId, setCompetitionCalendarTeamId] = useState("");
  const [teamCalendarNotes, setTeamCalendarNotes] = useState([]);
  const [calendarNoteDraft, setCalendarNoteDraft] = useState({ date: "", text: "" });
  const [rotationLeagueType, setRotationLeagueType] = useState("FIBA_M");
  const [rotationPlayers, setRotationPlayers] = useState([]);
  const [rotationPreset, setRotationPreset] = useState("std_10");
  const [rotationSaving, setRotationSaving] = useState(false);
  const [rotationSaved, setRotationSaved] = useState(false);
  const [rotationDirty, setRotationDirty] = useState(false);
  const [trainingContext, setTrainingContext] = useState("Regular");
  const [trainingWeekStart, setTrainingWeekStart] = useState(() => startOfWeek(new Date()));
  const [trainingWeekTouched, setTrainingWeekTouched] = useState(false);
  const [trainingPlan, setTrainingPlan] = useState([]);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingSaved, setTrainingSaved] = useState(false);
  const [trainingAutoMode, setTrainingAutoMode] = useState(true);
  const [trainingStaffId, setTrainingStaffId] = useState(null);
  const [trainingStaff, setTrainingStaff] = useState([]);
  const [trainingEditingDay, setTrainingEditingDay] = useState(null);
  const [trainingEditingSession, setTrainingEditingSession] = useState(null);
  const [trainingMonthDays, setTrainingMonthDays] = useState([]);
  const [trainingSavedSessions, setTrainingSavedSessions] = useState([]);
  const [loadViews] = useState(LOAD_DEFAULT_VIEWS);
  const [loadActiveViewId, setLoadActiveViewId] = useState("main");
  const [loadVisibleColumns, setLoadVisibleColumns] = useState(LOAD_DEFAULT_VIEWS[0].columns);
  const [loadColWidths, setLoadColWidths] = useState({});
  const [loadSortConfig, setLoadSortConfig] = useState([{ key: "ratio", direction: "desc" }]);
  const [loadSearchQuery, setLoadSearchQuery] = useState("");
  const [loadShowFilters, setLoadShowFilters] = useState(false);
  const [loadFilters, setLoadFilters] = useState({ onlyRisk: false, highFatigue: false });
  const loadResizingRef = useRef(null);
  const [loadHeaderMenu, setLoadHeaderMenu] = useState(null);
  const [loopState, setLoopState] = useState({ date: LOOP_DEFAULT_START, phase: 0 });
  const [loopSchedule, setLoopSchedule] = useState([]);
  const [loopResults, setLoopResults] = useState([]);
  const [loopTeamState, setLoopTeamState] = useState({ ...DEFAULT_LOOP_TEAM_STATE });
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [simulateTargetDate, setSimulateTargetDate] = useState("");
  const [simulateStopOnMatch, setSimulateStopOnMatch] = useState(true);
  const [simulateStopOnAlerts, setSimulateStopOnAlerts] = useState(true);
  const [simulateSpeed, setSimulateSpeed] = useState("normal");
  const [simulateError, setSimulateError] = useState(""); 
  const [simulateStatus, setSimulateStatus] = useState(""); 
  const [isSimulating, setIsSimulating] = useState(false); 
  const [isAdvancingDay, setIsAdvancingDay] = useState(false); 
  const [advanceStep, setAdvanceStep] = useState("");
  const [advanceStepMs, setAdvanceStepMs] = useState(0);
  const advanceInFlightRef = useRef(false); 
  const advanceLoopDayInFlightRef = useRef(false);
  const loopInitRef = useRef(""); 
  const loopStateRef = useRef(loopState);
  const loopScheduleRef = useRef(loopSchedule);
  const loopTeamStateRef = useRef(loopTeamState);
  const lastMatchResultRef = useRef(null);
  const injuryListRef = useRef([]);
  const [mentoringSearch, setMentoringSearch] = useState("");
  const [showMentoringCreate, setShowMentoringCreate] = useState(false);
  const [mentoringCustomGroups, setMentoringCustomGroups] = useState([]);
  const [mentoringDeletedAuto, setMentoringDeletedAuto] = useState([]);
  const [newMentorId, setNewMentorId] = useState("");
  const [newMentorFocus, setNewMentorFocus] = useState(DEFAULT_MENTOR_FOCUS);
  const [newMentorMentees, setNewMentorMentees] = useState([]);
  const [playerContext, setPlayerContext] = useState({ ids: [], index: -1 });
  const [contextMenu, setContextMenu] = useState(null);
  const [matchupAssignments, setMatchupAssignments] = useState({});
  const [matchupInstructions, setMatchupInstructions] = useState({});
  const [matchupSort, setMatchupSort] = useState({ key: "threat", direction: "desc" });

  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState("");

  const [compareOpen, setCompareOpen] = useState(false);
  const [compareIds, setCompareIds] = useState(() => {
    try {
      const raw = window.localStorage?.getItem("pcbasket.compare.ids");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [customPlays, setCustomPlays] = useState([]);
  const [matchupsLoaded, setMatchupsLoaded] = useState(false);
  const [playsLoaded, setPlaysLoaded] = useState(false);
  const [newPlay, setNewPlay] = useState({
    name: "",
    type: "Set",
    focus: "Pick & Roll",
    situation: "Halfcourt",
    notes: "",
  });
  const [matchFixtureId, setMatchFixtureId] = useState("");
  const [matchStatus, setMatchStatus] = useState("idle");
  const [matchSession, setMatchSession] = useState(null);
  const [matchScore, setMatchScore] = useState({ home: 0, away: 0 });
  const [matchActions, setMatchActions] = useState([]);
  const [matchLastEvent, setMatchLastEvent] = useState(null);
  const [matchClock, setMatchClock] = useState(null);
  const [matchPeriodLabel, setMatchPeriodLabel] = useState("Q1");
  const [matchTimeLabel, setMatchTimeLabel] = useState("10:00");
  const [matchShotClockLabel, setMatchShotClockLabel] = useState("24.0");
  const [matchTimeoutsLeft, setMatchTimeoutsLeft] = useState({ home: null, away: null });
  const [matchTeamFouls, setMatchTeamFouls] = useState({ home: 0, away: 0 });
  const [matchHomeStats, setMatchHomeStats] = useState([]);
  const [matchAwayStats, setMatchAwayStats] = useState([]);
  const [matchLineups, setMatchLineups] = useState({
    home: [],
    away: [],
    benchHome: [],
    benchAway: [],
  });
  const [matchDecisionOpen, setMatchDecisionOpen] = useState(false);
  const [matchDecisionFixture, setMatchDecisionFixture] = useState(null);
  const [matchSpeed, setMatchSpeed] = useState(1);
  const tickBuffer = useTickBuffer(matchSpeed);
  const [matchPaused, setMatchPaused] = useState(false);
  const [matchAutoPausePeriod, setMatchAutoPausePeriod] = useState(null);
  const [matchSelectedShout, setMatchSelectedShout] = useState(MATCH_SHOUTS[0]);
  const [matchSelectedPlaybookId, setMatchSelectedPlaybookId] = useState(MATCH_PLAYBOOKS[0].id);
  const [matchActionTeam, setMatchActionTeam] = useState("home");
  const [matchTimeoutKind, setMatchTimeoutKind] = useState(MATCH_TIMEOUT_OPTIONS[0]);
  const [matchDefenseType, setMatchDefenseType] = useState(MATCH_DEFENSE_OPTIONS[0]);
  const [matchPnrDefense, setMatchPnrDefense] = useState(MATCH_PNR_DEFENSE_OPTIONS[0]);
  const [matchPaceIdx, setMatchPaceIdx] = useState(2);
  const [matchOffFocus, setMatchOffFocus] = useState(MATCH_FOCUS_OPTIONS[0]);
  const [matchSpacing, setMatchSpacing] = useState(MATCH_SPACING_OPTIONS[0]);
  const [matchPassingRisk, setMatchPassingRisk] = useState(1);
  const [matchAggression, setMatchAggression] = useState(50);
  const [matchOffRebound, setMatchOffRebound] = useState(30);
  const [matchThreePoint, setMatchThreePoint] = useState(50);
  const [matchPnrFrequency, setMatchPnrFrequency] = useState(50);
  const [matchFreedom, setMatchFreedom] = useState(1);
  const [matchTransition, setMatchTransition] = useState(1);
  const [substitutionOpen, setSubstitutionOpen] = useState(false);
  const matchStatsRef = useRef({ home: {}, away: {} });
  const matchMetaRef = useRef({ periodCount: 4, periodSeconds: 600, otSeconds: 300, totalSeconds: 2400, lastPeriodIndex: 0, periodLabels: null });
  const matchResultRef = useRef(null);
  const matchFixtureRef = useRef(null);
  const lastTickClockRef = useRef(null);
  const pendingAdvanceAfterMatchRef = useRef(null);
  const finalizeDayAfterMatchRef = useRef(null);
  const matchRules = useMemo(() => {
    const team = teams.find((t) => String(t.id) === String(myTeamId)) || null;
    const leagueId = team ? getTeamLeagueId(team) : DEFAULT_LEAGUE_ID;
    const leagueConfig = getLeagueConfig(leagueId);
    const key = String(leagueConfig.ruleset || leagueId || "FIBA_M").toUpperCase();
    const rot = ROTATION_LEAGUE_RULES[key] || ROTATION_LEAGUE_RULES.FIBA_M;
    const periodCount = rot.count || 4;
    const periodSeconds = (rot.duration || 10) * 60;
    const otSeconds = 300;
    return {
      ruleset: leagueConfig.ruleset,
      periodCount,
      periodSeconds,
      otSeconds,
      periodLabels: Array.isArray(rot.labels) ? rot.labels : null,
    };
  }, [teams, myTeamId, rulesVersion]);

  const loadStored = (key, fallback) => {
    try {
      const raw = window.localStorage?.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  };

  useEffect(() => {
    try {
      window.localStorage?.setItem("pcbasket.compare.ids", JSON.stringify(compareIds || []));
    } catch {
      // ignore
    }
  }, [compareIds]);

  const toggleComparePlayer = useCallback((playerId) => {
    if (!playerId) return;
    setCompareIds((prev) => {
      const next = new Set(Array.isArray(prev) ? prev.map(String) : []);
      const key = String(playerId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return Array.from(next);
    });
  }, []);

  const clearCompare = useCallback(() => setCompareIds([]), []);

  const [seasonTransitions, setSeasonTransitions] = useState(() =>
    loadStored(SEASON_TRANSITION_STORAGE, {}),
  );

  const applyTeamOverrides = (list) => {
    const overrides = loadStored(TEAM_OVERRIDE_STORAGE, {});
    if (!overrides || typeof overrides !== "object") return list;
    return list.map((team) => {
      const override = overrides[String(team.id)];
      if (!override) return team;
      return { ...team, data: { ...(team.data || {}), ...override } };
    });
  };

  const persistTeamOverrides = (patches) => {
    const stored = loadStored(TEAM_OVERRIDE_STORAGE, {});
    const next = { ...(stored && typeof stored === "object" ? stored : {}) };
    Object.entries(patches || {}).forEach(([id, patch]) => {
      next[String(id)] = { ...(next[String(id)] || {}), ...patch };
    });
    try {
      window.localStorage?.setItem(TEAM_OVERRIDE_STORAGE, JSON.stringify(next));
    } catch (err) {
      // ignore
    }
    return next;
  };

  const resetLocalGameStorage = () => {
    try {
      const storage = window.localStorage;
      if (!storage) return;
      Object.keys(storage).forEach((key) => {
        if (key.startsWith("pcbasket.")) {
          storage.removeItem(key);
        }
      });
    } catch (err) {
      // ignore
    }
  };

  const buildLeaguePatch = (leagueId) => {
    const cfg = getLeagueConfig(leagueId);
    return {
      league_id: cfg.id,
      league_name: cfg.name,
      league_level: cfg.level,
    };
  };

  const loadView = (key, fallback) => {
    const stored = loadStored(key, fallback);
    return stored || fallback;
  };

  let rosterAttrAverages = {};
  let rosterSectionAverages = {};

  const tacticalRolesKey = "pcbasket.tactics.roles";
  const [tacticalRolesByPlayer, setTacticalRolesByPlayer] = useState(() => {
    const stored = loadStored(tacticalRolesKey, null);
    return stored || loadStored("pcbasket.tactics.board.roles", {});
  });

  const loadTeamTacticsConfig = useCallback(
    (teamId) => {
      if (!teamId) return null;
      const key = `pcbasket.tactics.board.${teamId}.config`;
      const cfg = loadStored(key, null);
      return cfg && typeof cfg === "object" ? cfg : null;
    },
    [loadStored],
  );

  const loadTeamStarters = useCallback(
    (teamId) => {
      if (!teamId) return null;
      const key = `pcbasket.tactics.board.${teamId}.starters`;
      const starters = loadStored(key, null);
      return starters && typeof starters === "object" ? starters : null;
    },
    [loadStored],
  );

  const buildTacticsPayload = useCallback(
    (teamId, isHuman) => {
      if (!teamId) return undefined;
      const config = loadTeamTacticsConfig(teamId);
      const starters = loadTeamStarters(teamId);
      const payload = {};
      if (config) payload.config = config;
      if (starters) payload.starters = starters;
      if (isHuman) {
        payload.rolesByPlayer = tacticalRolesByPlayer || {};
        payload.matchups = matchupAssignments || {};
        payload.instructions = matchupInstructions || {};
        payload.human = true;
      }
      return Object.keys(payload).length ? payload : undefined;
    },
    [
      loadTeamStarters,
      loadTeamTacticsConfig,
      matchupAssignments,
      matchupInstructions,
      tacticalRolesByPlayer,
    ],
  );

  useEffect(() => {
    if (needsNewGame) return;
    if (!myTeamId) {
      const stored = loadStored("pcbasket.myTeam", "");
      if (stored) setMyTeamId(String(stored));
    }
  }, [myTeamId, needsNewGame]);

  useEffect(() => {
    setRosterView(loadView("pcbasket.view.roster", "plantilla"));
    setTacticsView(loadView("pcbasket.view.tactics", "board"));
    setTrainingView(loadView("pcbasket.view.training", "team"));
    setMedicalView(loadView("pcbasket.view.medical", "overview"));
    setCompetitionView(loadView("pcbasket.view.competition", "calendar"));
  }, []);

  useEffect(() => {
    let active = true;
    const loadRules = async () => {
      if (!window.pcbasket?.invoke) return;
      try {
        const res = await window.pcbasket.invoke("rules.snapshot", {});
        if (!active) return;
        const snapshot = res?.result || res || {};
        applyLeagueCatalog(snapshot);
        setRulesVersion((prev) => prev + 1);
      } catch (err) {
        // ignore
      }
    };
    loadRules();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!rulesVersion) return;
    setNewGameLeagueIds((prev) => {
      const desired = LEAGUE_ORDER.length ? LEAGUE_ORDER.slice() : [DEFAULT_LEAGUE_ID];
      const existing = Array.isArray(prev) ? prev.filter(Boolean) : [];
      const valid = existing.filter((id) => LEAGUE_CONFIG[String(id).toUpperCase()]);
      if (valid.length) return valid;
      return desired;
    });
  }, [rulesVersion]);

  useEffect(() => {
    try {
      window.localStorage?.setItem("pcbasket.view.roster", JSON.stringify(rosterView));
    } catch (err) {
      // ignore
    }
  }, [rosterView]);

  useEffect(() => {
    try {
      window.localStorage?.setItem("pcbasket.view.tactics", JSON.stringify(tacticsView));
    } catch (err) {
      // ignore
    }
  }, [tacticsView]);

  useEffect(() => {
    try {
      window.localStorage?.setItem("pcbasket.view.training", JSON.stringify(trainingView));
    } catch (err) {
      // ignore
    }
  }, [trainingView]);

  useEffect(() => {
    try {
      window.localStorage?.setItem("pcbasket.view.competition", JSON.stringify(competitionView));
    } catch (err) {
      // ignore
    }
  }, [competitionView]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(SEASON_TRANSITION_STORAGE, JSON.stringify(seasonTransitions));
    } catch (err) {
      // ignore
    }
  }, [seasonTransitions]);

  useEffect(() => {
    const stored = loadStored("pcbasket.competition.league", "");
    if (stored) {
      setCompetitionLeagueId(stored);
    }
  }, []);

  useEffect(() => {
    if (!competitionLeagueId) return;
    try {
      window.localStorage?.setItem("pcbasket.competition.league", JSON.stringify(competitionLeagueId));
    } catch (err) {
      // ignore
    }
  }, [competitionLeagueId]);

  useEffect(() => {
    if (!newGameTeamId) return;
    const team = teams.find((t) => String(t.id) === String(newGameTeamId));
    if (!team) {
      setNewGameTeamId("");
      return;
    }
    const leagueId = getTeamLeagueId(team);
    if (!newGameLeagueIds.includes(leagueId)) {
      setNewGameTeamId("");
    }
  }, [newGameLeagueIds, newGameTeamId, teams, rulesVersion]);

  useEffect(() => {
    if (competitionLeagueId) return;
    if (!teams.length) return;
    const team = teams.find((t) => String(t.id) === String(myTeamId)) || teams[0];
    if (team) {
      setCompetitionLeagueId(getTeamLeagueId(team));
    }
  }, [competitionLeagueId, myTeamId, teams]);

  useEffect(() => {
    if (!myTeamId || teams.length === 0) return;
    if (loopInitRef.current === String(myTeamId)) return;
    let active = true;
    const initLoop = async () => {
      const myTeam = teams.find((t) => String(t.id) === String(myTeamId)) || null;
      const leagueId = myTeam ? getTeamLeagueId(myTeam) : DEFAULT_LEAGUE_ID;
      let currentDate = "";
      if (window.pcbasket?.invoke) {
        try {
          const gmRes = await window.pcbasket.invoke("gm.snapshot", { team_id: Number(myTeamId) });
          currentDate = gmRes?.result?.snapshot?.state?.current_date || gmRes?.result?.snapshot?.state?.currentDate || "";
        } catch (err) {
          // ignore
        }
      }
      let snapshot = null;
      if (window.pcbasket?.invoke && leagueId) {
        try {
          const res = await window.pcbasket.invoke("competition.snapshot", { league_id: leagueId, ensure: true });
          snapshot = res?.result?.snapshot || null;
          if (snapshot) {
            setCompetitionSnapshots((prev) => ({ ...prev, [leagueId]: snapshot }));
          }
        } catch (err) {
          // ignore
        }
      }
      const { schedule, results } = extractMyTeamScheduleFromSnapshot(snapshot, myTeamId);
      const normalizedCurrent = currentDate ? formatLocalDate(parseIsoDate(currentDate)) : "";
      const fallbackDate = schedule[0]?.date || LOOP_DEFAULT_START;
      const nextDate = normalizedCurrent || fallbackDate;
      if (!active) return;
      setLoopState({ date: nextDate, phase: 0 });
      setLoopSchedule(schedule);
      setLoopResults(results);
      const storedState = myTeam?.data || {};
      const initialTeamState = { ...DEFAULT_LOOP_TEAM_STATE };
      Object.keys(DEFAULT_LOOP_TEAM_STATE).forEach((key) => {
        const value = Number(storedState[key]);
        if (Number.isFinite(value)) {
          initialTeamState[key] = Math.min(100, Math.max(0, Math.round(value)));
        }
      });
      setLoopTeamState(initialTeamState);
      loopTeamStateRef.current = initialTeamState;
      loopInitRef.current = String(myTeamId);
    };
    void initLoop();
    return () => {
      active = false;
    };
  }, [myTeamId, teams, rulesVersion]);

  useEffect(() => {
    loopStateRef.current = loopState;
  }, [loopState]);

  useEffect(() => {
    loopScheduleRef.current = loopSchedule;
  }, [loopSchedule]);

  useEffect(() => {
    loopTeamStateRef.current = loopTeamState;
  }, [loopTeamState]);

  useEffect(() => {
    const initialWidths = {};
    Object.keys(LOAD_COLUMNS_DEF).forEach((key) => {
      initialWidths[key] = LOAD_COLUMNS_DEF[key].defaultWidth;
    });
    setLoadColWidths(initialWidths);
  }, []);

  useEffect(() => {
    try {
      window.localStorage?.setItem("pcbasket.view.medical", JSON.stringify(medicalView));
    } catch (err) {
      // ignore
    }
  }, [medicalView]);

  useEffect(() => {
    try {
      window.localStorage?.setItem("pcbasket.myTeam", JSON.stringify(myTeamId));
    } catch (err) {
      // ignore
    }
  }, [myTeamId]);

  const [shortlist, setShortlist] = useState(() => loadStored("pcbasket.shortlist", {}));
  const [tagsByPlayer, setTagsByPlayer] = useState(() => loadStored("pcbasket.tags", {}));

  useEffect(() => {
    try {
      window.localStorage?.setItem("pcbasket.shortlist", JSON.stringify(shortlist));
    } catch (err) {
      // ignore
    }
  }, [shortlist]);

  useEffect(() => {
    try {
      window.localStorage?.setItem("pcbasket.tags", JSON.stringify(tagsByPlayer));
    } catch (err) {
      // ignore
    }
  }, [tagsByPlayer]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(tacticalRolesKey, JSON.stringify(tacticalRolesByPlayer));
    } catch (err) {
      // ignore
    }
  }, [tacticalRolesByPlayer, tacticalRolesKey]);

  useEffect(() => {
    const stored = loadStored("pcbasket.roster.custom", null);
    if (Array.isArray(stored) && stored.length) {
      setCustomRosterColumns(stored);
      setVisibleRosterColumns(stored);
      setActiveRosterView("custom");
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage?.setItem("pcbasket.roster.custom", JSON.stringify(customRosterColumns));
    } catch (err) {
      // ignore
    }
  }, [customRosterColumns]);

  useEffect(() => {
    if (!showRosterColumnPicker) return;
    const handleOutside = (event) => {
      if (rosterColumnPickerRef.current?.contains(event.target)) return;
      setShowRosterColumnPicker(false);
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [showRosterColumnPicker]);

  useEffect(() => {
    const key = `pcbasket.mentoring.${myTeamId || "default"}`;
    setMentoringCustomGroups(loadStored(key, []));
    setMentoringDeletedAuto(loadStored(`${key}.deleted`, []));
    setNewMentorId("");
    setNewMentorMentees([]);
  }, [myTeamId]);

  useEffect(() => {
    const key = `pcbasket.mentoring.${myTeamId || "default"}`;
    try {
      window.localStorage?.setItem(key, JSON.stringify(mentoringCustomGroups));
      window.localStorage?.setItem(`${key}.deleted`, JSON.stringify(mentoringDeletedAuto));
    } catch (err) {
      // ignore
    }
  }, [mentoringCustomGroups, mentoringDeletedAuto, myTeamId]);

  useEffect(() => {
    const key = `pcbasket.tactics.matchups.${myTeamId || "default"}`;
    const stored = loadStored(key, {});
    const storedInstr = loadStored(`${key}.instructions`, {});
    setMatchupAssignments(stored && typeof stored === "object" ? stored : {});
    setMatchupInstructions(storedInstr && typeof storedInstr === "object" ? storedInstr : {});
    setMatchupsLoaded(true);
  }, [myTeamId]);

  useEffect(() => {
    if (!matchupsLoaded) return;
    const key = `pcbasket.tactics.matchups.${myTeamId || "default"}`;
    try {
      window.localStorage?.setItem(key, JSON.stringify(matchupAssignments));
      window.localStorage?.setItem(`${key}.instructions`, JSON.stringify(matchupInstructions));
    } catch (err) {
      // ignore
    }
  }, [matchupAssignments, matchupInstructions, matchupsLoaded, myTeamId]);

  useEffect(() => {
    const key = `pcbasket.tactics.plays.${myTeamId || "default"}`;
    const stored = loadStored(key, []);
    setCustomPlays(Array.isArray(stored) ? stored : []);
    setPlaysLoaded(true);
  }, [myTeamId]);

  useEffect(() => {
    if (!playsLoaded) return;
    const key = `pcbasket.tactics.plays.${myTeamId || "default"}`;
    try {
      window.localStorage?.setItem(key, JSON.stringify(customPlays));
    } catch (err) {
      // ignore
    }
  }, [customPlays, playsLoaded, myTeamId]);

  const safeNum = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
  const scaleAttr = (value) => clamp(Math.round(safeNum(value) / 10));

  const applyCommsEffect = useCallback((effect = {}) => {
    if (!effect || !Object.keys(effect).length) return;
    setLoopTeamState((prev) => {
      const next = { ...prev };
      Object.entries(effect).forEach(([key, delta]) => {
        if (typeof delta !== "number") return;
        next[key] = clamp((prev[key] ?? 0) + delta);
      });
      loopTeamStateRef.current = next;
      return next;
    });
  }, [clamp]);

  const getAttrValue = (player, key) => scaleAttr(player?.data?.attributes?.[key]);

  const getPlayerHealth = (player) => player?.data?.health || {};

  const getInjuryStatus = (player) => {
    const health = getPlayerHealth(player);
    return String(health.injury_status || health.status || "").toLowerCase();
  };

  const isPlayerOut = (player) => getInjuryStatus(player) === "out";

  const getLoadMetrics = (player) => {
    const stamina = getAttrValue(player, "stamina");
    const recov = getAttrValue(player, "fatigue_recov");
    const durability = getAttrValue(player, "durability");
    const load = clamp(100 - Math.round(stamina * 0.55 + recov * 0.45));
    const risk = clamp(Math.round((100 - durability) * 0.6 + load * 0.4));
    return { load, risk, stamina, recov, durability };
  };

  const buildLoadRow = (player) => {
    const metrics = getLoadMetrics(player);
    const acute = Math.round(650 + metrics.load * 6 + metrics.risk * 2);
    const chronic = Math.round(600 + metrics.load * 5 + metrics.durability * 2);
    const ratio = Number((acute / Math.max(1, chronic)).toFixed(2));
    let status = "Optimal";
    if (ratio > 1.3) status = "Risk";
    else if (ratio < 0.8) status = "Low";
    const fatigue = clamp(Math.round(metrics.load * 0.85 + metrics.risk * 0.2));
    const trend = ratio > 1.1 ? "up" : ratio < 0.9 ? "down" : "flat";
    const distance = (3 + metrics.load / 18).toFixed(1);
    const sprints = Math.round(6 + metrics.load / 2.2);
    const desgaste = clamp(100 - fatigue);
    const dorsal =
      safeNum(player?.data?.bio?.number) ||
      safeNum(player?.data?.bio?.dorsal) ||
      ((player?.id || 0) % 90) + 1;

    return {
      id: player.id,
      dorsal,
      name: player.name,
      position: player.data?.bio?.pos || "--",
      acute,
      chronic,
      ratio,
      status,
      fatigue,
      trend,
      distance,
      sprints,
      desgaste,
    };
  };

  const getTeamRoster = useCallback((teamId) => {
    if (!teamId) return [];
    return players.filter((p) => String(p.data?.team_id) === String(teamId));
  }, [players]);

  const calcTeamProfile = useCallback((teamId) => {
    const roster = getTeamRoster(teamId);
    if (!roster.length) {
      return { offense: 50, defense: 50, strength: 50 };
    }
    const sorted = [...roster].sort((a, b) => calcPlayerScore(b) - calcPlayerScore(a));
    const core = sorted.slice(0, 8);
    const offense =
      core.reduce((sum, p) => sum + calcOffenseScore(p), 0) / Math.max(1, core.length);
    const defense =
      core.reduce((sum, p) => sum + calcDefenseScore(p), 0) / Math.max(1, core.length);
    const strength =
      core.reduce((sum, p) => sum + calcPlayerScore(p), 0) / Math.max(1, core.length) / 10;
    return { offense, defense, strength };
  }, [getTeamRoster, calcPlayerScore, calcOffenseScore, calcDefenseScore]);

  const formatMoney = (value, currency = "") => {
    const num = safeNum(value);
    if (!num) return "--";
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M${currency ? ` ${currency}` : ""}`;
    if (num >= 1000) return `${Math.round(num / 1000)}K${currency ? ` ${currency}` : ""}`;
    return `${num}${currency ? ` ${currency}` : ""}`;
  };

  function calcPlayerScore(player) {
    const attrs = player?.data?.attributes || {};
    const values = Object.values(attrs).map((v) => safeNum(v)).filter((v) => v > 0);
    if (values.length) {
      return values.reduce((a, b) => a + b, 0) / values.length;
    }
    const tier = safeNum(player?.data?.scout?.tier || 3);
    return 60 + (6 - tier) * 5;
  }

  function calcOffenseScore(player) {
    const total =
      sectionAverage(player, "ofensiva") +
      sectionAverage(player, "manejo") +
      sectionAverage(player, "cerebro");
    return Math.round(total / 30);
  }

  function calcDefenseScore(player) {
    const total = sectionAverage(player, "defensa") + sectionAverage(player, "fisico");
    return Math.round(total / 20);
  }

  function sectionAverage(player, sectionKey) {
    const section = ATTRIBUTE_SECTIONS.find((s) => s.key === sectionKey);
    if (!section) return 0;
    const attrs = player?.data?.attributes || {};
    const values = section.attrs.map((key) => safeNum(attrs?.[key])).filter((v) => v > 0);
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  const teamMap = useMemo(() => {
    const map = {};
    for (const t of teams) {
      map[t.id] = t;
    }
    return map;
  }, [teams]);

  const teamsByLeague = useMemo(() => {
    const map = {};
    teams.forEach((team) => {
      const leagueId = getTeamLeagueId(team);
      if (!map[leagueId]) map[leagueId] = [];
      map[leagueId].push(team);
    });
    return map;
  }, [teams, rulesVersion]);

  const enabledLeagueIds = useMemo(() => {
    if (activeLeagueIds.length) {
      return activeLeagueIds.filter((id) => teamsByLeague[id]?.length);
    }
    return Object.keys(teamsByLeague);
  }, [activeLeagueIds, teamsByLeague]);

  const enabledTeamsByLeague = useMemo(() => {
    const map = {};
    enabledLeagueIds.forEach((leagueId) => {
      map[leagueId] = teamsByLeague[leagueId] || [];
    });
    return map;
  }, [enabledLeagueIds, teamsByLeague]);

  const availableLeagueIds = useMemo(() => {
    const ids = Object.keys(enabledTeamsByLeague);
    return ids.sort((a, b) => {
      const aIdx = LEAGUE_ORDER.indexOf(a);
      const bIdx = LEAGUE_ORDER.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [enabledTeamsByLeague, rulesVersion]);

  const myTeam = useMemo(() => {
    if (!myTeamId) return null;
    return teams.find((t) => String(t.id) === String(myTeamId)) || null;
  }, [teams, myTeamId]);

  const myTeamLeagueId = useMemo(() => (myTeam ? getTeamLeagueId(myTeam) : ""), [myTeam, rulesVersion]);

  const activeLeagueId = useMemo(() => {
    if (competitionLeagueId && enabledTeamsByLeague[competitionLeagueId]) return competitionLeagueId;
    if (myTeamLeagueId && enabledTeamsByLeague[myTeamLeagueId]) return myTeamLeagueId;
    if (availableLeagueIds.length) return availableLeagueIds[0];
    return DEFAULT_LEAGUE_ID;
  }, [competitionLeagueId, myTeamLeagueId, enabledTeamsByLeague, availableLeagueIds, rulesVersion]);

  const activeLeagueConfig = useMemo(
    () => getLeagueConfig(activeLeagueId),
    [activeLeagueId, rulesVersion],
  );

  const activeLeagueTeams = useMemo(
    () => enabledTeamsByLeague[activeLeagueId] || teams,
    [enabledTeamsByLeague, activeLeagueId, teams],
  );

  const activeLeagueTeamIds = useMemo(
    () => new Set(activeLeagueTeams.map((team) => String(team.id))),
    [activeLeagueTeams],
  );

  const myRoster = useMemo(() => {
    if (!myTeamId) return [];
    return players.filter((p) => String(p.data?.team_id) === String(myTeamId));
  }, [players, myTeamId]);

  const myStaff = useMemo(() => myTeam?.data?.staff || [], [myTeam]);
  const myBoard = useMemo(() => myTeam?.data?.board || [], [myTeam]);

  const opponentTeam = useMemo(() => {
    if (!myTeam) return null;
    return teams.find((t) => String(t.id) !== String(myTeam.id)) || null;
  }, [teams, myTeam]);

  const opponentRoster = useMemo(() => {
    if (opponentTeam) {
      return players.filter((p) => String(p.data?.team_id) === String(opponentTeam.id)).slice(0, 12);
    }
    if (!myTeamId) return [];
    return players.filter((p) => String(p.data?.team_id) !== String(myTeamId)).slice(0, 12);
  }, [players, opponentTeam, myTeamId]);
  const rosterScores = useMemo(() => {
    const map = {};
    for (const p of myRoster) {
      map[p.id] = calcPlayerScore(p);
    }
    return map;
  }, [myRoster]);

  const rosterAverages = useMemo(() => {
    const attrMap = {};
    const sectionMap = {};
    if (!myRoster.length) {
      return { attrMap, sectionMap };
    }
    ATTRIBUTE_SECTIONS.forEach((section) => {
      section.attrs.forEach((key) => {
        let total = 0;
        let count = 0;
        for (const p of myRoster) {
          const val = safeNum(p.data?.attributes?.[key]);
          if (val) {
            total += val;
            count += 1;
          }
        }
        attrMap[key] = count ? Math.round((total / count) / 10) : 0;
      });
      const avg =
        myRoster.reduce((sum, p) => sum + sectionAverage(p, section.key), 0) /
        Math.max(1, myRoster.length);
      sectionMap[section.key] = Math.round(avg / 10);
    });
    return { attrMap, sectionMap };
  }, [myRoster]);
  rosterAttrAverages = rosterAverages.attrMap;
  rosterSectionAverages = rosterAverages.sectionMap;
  const depthChart = useMemo(() => {
    const positions = ["PG", "SG", "SF", "PF", "C"];
    return positions.map((pos) => {
      const list = myRoster
        .filter((p) => p.data?.bio?.pos === pos)
        .sort((a, b) => (rosterScores[b.id] || 0) - (rosterScores[a.id] || 0));
      return {
        pos,
        starter: list[0] || null,
        rotation: list.slice(1, 3),
        reserves: list.slice(3),
      };
    });
  }, [myRoster, rosterScores]);
  const hierarchy = useMemo(() => {
    const sorted = [...myRoster].sort((a, b) => (rosterScores[b.id] || 0) - (rosterScores[a.id] || 0));
    const total = sorted.length;
    if (!total) {
      return { leaders: [], influential: [], squad: [], marginal: [], avgScore: 0 };
    }
    const leadersCount = Math.max(1, Math.floor(total * 0.15));
    const influentialCount = Math.floor(total * 0.25);
    const squadCount = Math.floor(total * 0.45);
    const leaders = sorted.slice(0, leadersCount);
    const influential = sorted.slice(leadersCount, leadersCount + influentialCount);
    const squad = sorted.slice(leadersCount + influentialCount, leadersCount + influentialCount + squadCount);
    const marginal = sorted.slice(leadersCount + influentialCount + squadCount);
    const avgScore = sorted.reduce((acc, p) => acc + (rosterScores[p.id] || 0), 0) / total;
    return { leaders, influential, squad, marginal, avgScore };
  }, [myRoster, rosterScores]);
  const rosterCohesion = useMemo(() => {
    if (!myRoster.length) return 0;
    return Math.min(100, Math.round(hierarchy.avgScore + 20));
  }, [myRoster, hierarchy.avgScore]);
  const mentoringAutoGroups = useMemo(() => {
    if (!myRoster.length) return [];
    const mentors = myRoster
      .filter((p) => safeNum(p.data?.bio?.age) >= 27)
      .sort((a, b) => (rosterScores[b.id] || 0) - (rosterScores[a.id] || 0));
    const mentees = myRoster
      .filter((p) => safeNum(p.data?.bio?.age) <= 23)
      .sort((a, b) => safeNum(a.data?.bio?.age) - safeNum(b.data?.bio?.age));
    const groups = [];
    let menteeIndex = 0;
    for (let i = 0; i < Math.min(mentors.length, 6); i += 1) {
      if (menteeIndex >= mentees.length) break;
      const mentor = mentors[i];
      const focusOptions = [
        { key: "ofensiva", label: "Técnica de tiro", type: "shooting" },
        { key: "defensa", label: "Conceptos defensivos", type: "defense" },
        { key: "psico", label: "Profesionalidad", type: "mental" },
      ];
      let best = focusOptions[0];
      let bestValue = 0;
      for (const option of focusOptions) {
        const value = sectionAverage(mentor, option.key);
        if (value > bestValue) {
          bestValue = value;
          best = option;
        }
      }
      const menteesGroup = [];
      if (menteeIndex < mentees.length) menteesGroup.push(mentees[menteeIndex++]);
      if (menteeIndex < mentees.length && (menteeIndex + mentor.id) % 2 === 0) {
        menteesGroup.push(mentees[menteeIndex++]);
      }
      if (!menteesGroup.length) continue;
      const id = `auto-${mentor.id}`;
      if (mentoringDeletedAuto.includes(id)) continue;
      groups.push({
        id,
        focus: best.label,
        focusType: best.type,
        mentor,
        mentees: menteesGroup,
        isCustom: false,
      });
    }
    return groups;
  }, [myRoster, rosterScores, mentoringDeletedAuto]);
  const mentoringGroups = useMemo(
    () => [...mentoringCustomGroups, ...mentoringAutoGroups],
    [mentoringCustomGroups, mentoringAutoGroups],
  );
  const filteredMentoringGroups = useMemo(() => {
    if (!mentoringSearch) return mentoringGroups;
    const q = mentoringSearch.toLowerCase();
    return mentoringGroups.filter((g) =>
      g.focus.toLowerCase().includes(q) ||
      g.mentor?.name?.toLowerCase().includes(q) ||
      g.mentees?.some((m) => m.name?.toLowerCase().includes(q)),
    );
  }, [mentoringGroups, mentoringSearch]);
  const injuryList = useMemo(() => {
    if (!myRoster.length) return [];
    const actual = myRoster
      .map((p) => {
        const health = getPlayerHealth(p);
        const statusKey = String(health.injury_status || "").toLowerCase();
        if (!statusKey || statusKey === "healthy") return null;
        const status = statusKey === "out" ? "Grave" : statusKey === "questionable" ? "Moderada" : "Leve";
        const injury = health?.injury?.label || "";
        const days = Number(health?.injury_days || health?.injury?.days || 0) || 0;
        const sourceKey = String(health?.injury?.source || "").toLowerCase();
        const source = sourceKey === "training" ? "Entreno" : sourceKey === "match" ? "Partido" : "";
        return { player: p, injury, days, status, source };
      })
      .filter(Boolean);
    return actual.sort((a, b) => (b.days || 0) - (a.days || 0));
  }, [getPlayerHealth, myRoster]);

  const injuryHistory = useMemo(() => {
    if (!myRoster.length) return [];
    const history = [];
    myRoster.forEach((p) => {
      const entries = p.data?.health?.injury_history || [];
      entries.forEach((entry, idx) => {
        history.push({
          player: p,
          id: entry?.id || `${p.id}-${idx}`,
          label: entry?.label || "",
          source: entry?.source === "training" ? "Entreno" : entry?.source === "match" ? "Partido" : "",
          severity: entry?.severity || "",
          start_date: entry?.start_date || "",
          end_date: entry?.end_date || "",
          days: entry?.days || "",
        });
      });
    });
    history.sort((a, b) => String(b.start_date || "").localeCompare(String(a.start_date || "")));
    return history;
  }, [myRoster]);

  const rosterStatusMap = useMemo(() => {
    const map = {};
    injuryList.forEach((item) => {
      map[item.player.id] = item;
    });
    return map;
  }, [injuryList]);

  useEffect(() => {
    injuryListRef.current = injuryList;
  }, [injuryList]);

  const STATUS_DEFS = {
    Les: { label: "Lesionado", tone: "danger" },
    San: { label: "Sancionado", tone: "danger" },
    NoE: { label: "No Elegible", tone: "warn" },
    Des: { label: "Descansando", tone: "info" },
    Vac: { label: "Vacaciones", tone: "neutral" },
    Aus: { label: "Ausente", tone: "danger" },
    Tra: { label: "Transferible", tone: "info" },
    Ced: { label: "Cedible", tone: "info" },
    Int: { label: "Interes", tone: "info" },
    Ofe: { label: "Oferta", tone: "info" },
    Ofr: { label: "Ofrecido", tone: "info" },
    Ctr: { label: "Contrato", tone: "warn" },
    Dsc: { label: "Descontento", tone: "warn" },
    Pre: { label: "Preocupado", tone: "info" },
    Apo: { label: "Apoya", tone: "ok" },
    NoI: { label: "No Inscrito", tone: "warn" },
    Ext: { label: "Extracomunitario", tone: "info" },
    Can: { label: "Canterano", tone: "ok" },
    Pais: { label: "Formado en pais", tone: "ok" },
    Via: { label: "Viajando", tone: "info" },
  };

  const normalizeStatusFlags = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      return value.split(",").map((v) => v.trim()).filter(Boolean);
    }
    return [];
  };

  const getRosterStatusBadges = (player) => {
    const badges = [];
    const addBadge = (code, overrides = null) => {
      if (!code) return;
      const idx = badges.findIndex((b) => b.code === code);
      const base = STATUS_DEFS[code] || { label: code, tone: "neutral" };
      const next = { code, ...base, ...(overrides || {}) };
      if (idx >= 0) {
        badges[idx] = { ...badges[idx], ...next };
      } else {
        badges.push(next);
      }
    };

    const item = rosterStatusMap[player.id];
    if (item?.status === "Grave") {
      addBadge("Les");
    } else if (item?.status) {
      addBadge("Les", { label: "Lesion leve", tone: "warn" });
    }

    const flags = normalizeStatusFlags(
      player?.data?.status_flags ||
        player?.data?.status?.flags ||
        player?.data?.status?.codes ||
        player?.data?.availability?.flags ||
        player?.data?.availability?.codes ||
        player?.data?.market?.flags ||
        player?.data?.registration?.flags ||
        player?.data?.international?.flags ||
        player?.data?.discipline?.flags ||
        player?.data?.transfer?.flags ||
        player?.data?.loan?.flags ||
        player?.data?.eligibility?.flags ||
        player?.data?.flags,
    );

    flags.forEach((code) => addBadge(String(code).trim()));

    const status = player?.data?.status || {};
    const availability = player?.data?.availability || {};
    const discipline = player?.data?.discipline || {};
    const market = player?.data?.market || {};
    const registration = player?.data?.registration || {};
    const international = player?.data?.international || {};
    const eligibility = player?.data?.eligibility || {};
    const transfer = player?.data?.transfer || {};
    const loan = player?.data?.loan || {};
    const morale = player?.data?.morale || {};

    const injuryFlag =
      availability?.injured ||
      availability?.injury ||
      status?.injured ||
      status?.injury;
    const injurySeverity =
      availability?.injury_severity ||
      availability?.injurySeverity ||
      status?.injury_severity ||
      status?.injurySeverity ||
      (typeof injuryFlag === "string" ? injuryFlag : "");
    if (injuryFlag) {
      const sev = String(injurySeverity || "").toLowerCase();
      if (["severe", "grave", "major"].includes(sev) || Number(injurySeverity) >= 2) {
        addBadge("Les");
      } else {
        addBadge("Les", { label: "Lesion leve", tone: "warn" });
      }
    }

    if (discipline?.suspended || discipline?.suspension_games > 0 || status?.suspended) addBadge("San");
    if (eligibility?.eligible === false || eligibility?.status === "ineligible" || status?.eligible === false) addBadge("NoE");
    if (availability?.resting || status?.resting || availability?.status === "rest") addBadge("Des");
    if (availability?.vacation || status?.vacation) addBadge("Vac");
    if (availability?.absent || discipline?.absent || status?.absent) addBadge("Aus");

    if (market?.transfer_listed || transfer?.listed || transfer?.transfer_listed || status?.transfer_listed) addBadge("Tra");
    if (market?.loan_listed || loan?.listed || loan?.loan_listed || status?.loan_listed) addBadge("Ced");
    if (market?.interest || market?.watchers || (market?.interested_clubs || []).length) addBadge("Int");
    if ((market?.offers || []).length || market?.offer_received) addBadge("Ofe");
    if (market?.offered || transfer?.offered) addBadge("Ofr");

    const contract = contractMap[player.id];
    const endDate = contract?.data?.end_date || contract?.data?.endDate;
    if (contract?.data?.status === "expiring" || contract?.data?.status === "ending") addBadge("Ctr");
    if (endDate) {
      const end = new Date(endDate);
      if (!Number.isNaN(end.getTime())) {
        const diffDays = (end.getTime() - Date.now()) / 86400000;
        if (diffDays <= 180 && diffDays >= 0) addBadge("Ctr");
      }
    }

    if (morale?.state === "unhappy" || morale?.happiness < 40) addBadge("Dsc");
    if (morale?.state === "concerned" || (morale?.happiness >= 40 && morale?.happiness < 60)) addBadge("Pre");
    if (morale?.state === "supporting" || morale?.support === true) addBadge("Apo");

    if (registration?.registered === false || registration?.status === "unregistered") addBadge("NoI");
    if (registration?.foreign || registration?.non_eu || registration?.extracomunitario) addBadge("Ext");
    if (registration?.homegrown_club || registration?.canterano) addBadge("Can");
    if (registration?.homegrown_country || registration?.pais_formado) addBadge("Pais");

    if (international?.called_up || international?.status === "called" || international?.on_duty) {
      addBadge("Int", { label: "Convocado" });
    }
    if (international?.traveling || international?.status === "traveling") addBadge("Via");

    if (!badges.length) {
      badges.push({ code: "OK", label: "Disponible", tone: "ok" });
    }
    return badges;
  };
  const agencyMap = useMemo(() => {
    const map = {};
    for (const a of agencies) {
      map[a.agency_id] = a;
    }
    return map;
  }, [agencies]);

  const agentMap = useMemo(() => {
    const map = {};
    for (const a of agents) {
      map[a.agent_id] = a;
    }
    return map;
  }, [agents]);

  const playerMap = useMemo(() => {
    const map = {};
    for (const p of players) {
      map[p.id] = p;
    }
    return map;
  }, [players]);

  const contractMap = useMemo(() => {
    const map = {};
    for (const c of contracts) {
      if (c?.player_id != null) {
        map[c.player_id] = c;
      }
    }
    return map;
  }, [contracts]);

  const isScholarshipContract = (contract) => {
    const type = String(contract?.data?.type || "").toLowerCase();
    return ["scholarship", "beca", "amateur", "non_pro", "non-pro"].includes(type);
  };

  const formatContractType = (type) => {
    const normalized = String(type || "").toLowerCase();
    if (!normalized) return "Pro";
    if (["scholarship", "beca", "amateur", "non_pro", "non-pro"].includes(normalized)) return "Beca";
    if (["pro", "professional"].includes(normalized)) return "Pro";
    return type || "--";
  };

  const attributeKeySet = useMemo(() => {
    const keys = new Set();
    ATTRIBUTE_SECTIONS.forEach((section) => {
      section.attrs.forEach((key) => keys.add(key));
    });
    return keys;
  }, []);

  const attributeLabelMap = useMemo(() => {
    const map = {};
    for (const p of players) {
      const labels = p.data?.attributes_label;
      if (labels && typeof labels === "object") {
        for (const [key, value] of Object.entries(labels)) {
          if (value) map[key] = value;
        }
      }
    }
    return map;
  }, [players]);

  const rotationSlotOptions = useMemo(
    () => ROTATION_SLOT_LABELS.map((label, idx) => ({ value: String(idx + 1), label })),
    [],
  );

  const rotationSlotLabel = useCallback((slot) => {
    const num = Number(slot);
    if (!Number.isFinite(num) || num < 1 || num > ROTATION_SLOT_COUNT) return "";
    return ROTATION_SLOT_LABELS[num - 1] || "";
  }, []);

  const normalizeRotationSlots = useCallback((list, fillMissing = true) => {
    const used = new Set();
    const next = list.map((p) => {
      const num = Number(p.slot);
      if (Number.isFinite(num) && num >= 1 && num <= ROTATION_SLOT_COUNT && !used.has(num)) {
        used.add(num);
        return { ...p, slot: num };
      }
      return { ...p, slot: null };
    });

    if (!fillMissing) return next;

    let slot = 1;
    next.forEach((p) => {
      if (p.slot || used.size >= ROTATION_SLOT_COUNT) return;
      while (used.has(slot) && slot <= ROTATION_SLOT_COUNT) slot += 1;
      if (slot <= ROTATION_SLOT_COUNT) {
        p.slot = slot;
        used.add(slot);
      }
    });
    return next;
  }, []);

  const sortRotationPlayers = useCallback((list) => {
    const sorted = [...list];
    sorted.sort((a, b) => {
      const slotA = Number(a.slot) || 999;
      const slotB = Number(b.slot) || 999;
      if (slotA !== slotB) return slotA - slotB;
      return (b.rating || 0) - (a.rating || 0);
    });
    return sorted;
  }, []);

  const rotationSlotMap = useMemo(() => {
    const map = new Map();
    rotationPlayers.forEach((p) => {
      if (p?.id != null) {
        map.set(p.id, p.slot);
      }
    });
    return map;
  }, [rotationPlayers]);

  const startersStorageKey = useMemo(
    () => `pcbasket.tactics.board.${myTeamId || "default"}.starters`,
    [myTeamId],
  );

  const lastStartersPayloadRef = useRef("");

  const persistStartersFromRotation = useCallback(
    (players) => {
      if (!players || !players.length) return;
      const stored = loadStored(startersStorageKey, {});
      const next = {};
      STARTER_POSITIONS.forEach((pos) => {
        next[pos] = null;
      });

      const slotMap = new Map();
      players.forEach((p) => {
        const slot = Number(p.slot);
        if (Number.isFinite(slot) && slot >= 1 && slot <= 5) {
          slotMap.set(slot, p);
        }
      });

      STARTER_POSITIONS.forEach((pos) => {
        const slot = STARTER_SLOT_BY_POS[pos];
        const player = slotMap.get(slot);
        if (!player) return;
        const prev = stored?.[pos];
        if (prev && prev.id === player.id) {
          next[pos] = prev;
        } else {
          next[pos] = { id: player.id };
        }
      });

      const serialized = JSON.stringify(next);
      if (serialized === lastStartersPayloadRef.current) return;
      lastStartersPayloadRef.current = serialized;
      try {
        window.localStorage?.setItem(startersStorageKey, serialized);
      } catch (err) {
        // ignore
      }
    },
    [loadStored, startersStorageKey],
  );

  const applyStartersToRotation = useCallback(
    (starters) => {
      if (!starters || typeof starters !== "object") return;
      setRotationPlayers((prev) => {
        if (!prev.length) return prev;
        const next = prev.map((p) => ({ ...p }));
        const starterIds = new Set();

        STARTER_POSITIONS.forEach((pos) => {
          const entry = starters[pos];
          if (!entry?.id) return;
          const idx = next.findIndex((p) => String(p.id) === String(entry.id));
          if (idx >= 0) {
            next[idx].slot = STARTER_SLOT_BY_POS[pos];
            starterIds.add(next[idx].id);
          }
        });

        next.forEach((p) => {
          const slot = Number(p.slot);
          if (slot >= 1 && slot <= 5 && !starterIds.has(p.id)) {
            p.slot = null;
          }
        });

        const prevSlotMap = new Map(prev.map((p) => [String(p.id), p.slot ?? null]));
        let changed = false;
        for (const player of next) {
          const prevSlot = prevSlotMap.get(String(player.id)) ?? null;
          const nextSlot = player.slot ?? null;
          if (prevSlot !== nextSlot) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;
        return sortRotationPlayers(normalizeRotationSlots(next, false));
      });
      setRotationDirty(true);
      setRotationSaved(false);
      setRotationPreset("custom");
    },
    [normalizeRotationSlots, sortRotationPlayers],
  );

  const updateRotationSlot = useCallback(
    (playerId, slotValue) => {
      const nextSlot = Number(slotValue);
      setRotationPlayers((prev) => {
        const next = prev.map((p) => ({ ...p }));
        const idx = next.findIndex((p) => p.id === playerId);
        if (idx < 0) return prev;
        const prevSlot = Number(next[idx].slot) || null;
        const desiredSlot = Number.isFinite(nextSlot) && nextSlot >= 1 && nextSlot <= ROTATION_SLOT_COUNT
          ? nextSlot
          : null;
        if (!desiredSlot) {
          next[idx].slot = null;
        } else if (desiredSlot !== prevSlot) {
          const otherIdx = next.findIndex((p) => p.slot === desiredSlot && p.id !== playerId);
          next[idx].slot = desiredSlot;
          if (otherIdx >= 0) {
            next[otherIdx].slot = prevSlot;
          }
        }
        return sortRotationPlayers(normalizeRotationSlots(next, false));
      });
      setRotationDirty(true);
      setRotationSaved(false);
      setRotationPreset("custom");
    },
    [normalizeRotationSlots, sortRotationPlayers],
  );

  const rosterColumnMeta = useMemo(() => ({
    pos: {
      label: "Pos",
      width: "0.6fr",
      align: "center",
      get: (p) => p.data?.bio?.pos || "--",
      sort: (p) => String(p.data?.bio?.pos || ""),
    },
    rotation_slot: {
      label: "Rot",
      width: "0.7fr",
      align: "center",
      get: (p) => rotationSlotLabel(rotationSlotMap.get(p.id)),
      sort: (p) => rotationSlotMap.get(p.id) || 999,
    },
    age: {
      label: "Edad",
      width: "0.6fr",
      align: "center",
      get: (p) => p.data?.bio?.age || "--",
      sort: (p) => safeNum(p.data?.bio?.age),
    },
    height: {
      label: "Alt",
      width: "0.7fr",
      align: "center",
      get: (p) => (p.data?.bio?.height_cm ? `${p.data?.bio?.height_cm} cm` : "--"),
      sort: (p) => safeNum(p.data?.bio?.height_cm),
    },
    weight: {
      label: "Peso",
      width: "0.7fr",
      align: "center",
      get: (p) => (p.data?.bio?.weight_kg ? `${p.data?.bio?.weight_kg} kg` : "--"),
      sort: (p) => safeNum(p.data?.bio?.weight_kg),
    },
    wingspan: {
      label: "Env",
      width: "0.7fr",
      align: "center",
      get: (p) => (p.data?.bio?.wingspan_cm ? `${p.data?.bio?.wingspan_cm} cm` : "--"),
      sort: (p) => safeNum(p.data?.bio?.wingspan_cm),
    },
    nationality: {
      label: "Nac",
      width: "0.7fr",
      align: "center",
      get: (p) => p.data?.bio?.nationality || "--",
      sort: (p) => String(p.data?.bio?.nationality || ""),
    },
    archetype: {
      label: "Arquetipo",
      width: "1.3fr",
      align: "left",
      get: (p) => {
        const archeId = p.data?.identity?.arquetipo;
        return p.data?.identity?.arquetipo_label || labelFor("arche", archeId);
      },
      sort: (p) => {
        const archeId = p.data?.identity?.arquetipo;
        return String(p.data?.identity?.arquetipo_label || labelFor("arche", archeId) || "");
      },
    },
    salary: {
      label: "Contrato",
      width: "0.9fr",
      align: "right",
      get: (p) => {
        const contract = contractMap[p.id];
        if (isScholarshipContract(contract)) return "Beca";
        return formatMoney(contract?.data?.salary, contract?.data?.currency);
      },
      sort: (p) => {
        const contract = contractMap[p.id];
        return isScholarshipContract(contract) ? 0 : safeNum(contract?.data?.salary);
      },
    },
    expiration: {
      label: "Fin",
      width: "0.7fr",
      align: "center",
      get: (p) => contractMap[p.id]?.data?.end_date || "--",
      sort: (p) => String(contractMap[p.id]?.data?.end_date || ""),
    },
    clause: {
      label: "Cláusula",
      width: "0.9fr",
      align: "right",
      get: (p) => formatMoney(contractMap[p.id]?.data?.clause || contractMap[p.id]?.data?.release_clause, contractMap[p.id]?.data?.currency),
      sort: (p) => safeNum(contractMap[p.id]?.data?.clause || contractMap[p.id]?.data?.release_clause),
    },
    type: {
      label: "Tipo",
      width: "0.7fr",
      align: "center",
      get: (p) => formatContractType(contractMap[p.id]?.data?.type),
      sort: (p) => String(contractMap[p.id]?.data?.type || ""),
    },
    value: {
      label: "Valor",
      width: "0.9fr",
      align: "right",
      get: (p) => formatMoney(contractMap[p.id]?.data?.value, contractMap[p.id]?.data?.currency),
      sort: (p) => safeNum(contractMap[p.id]?.data?.value),
    },
  }), [contractMap, rotationSlotLabel, rotationSlotMap]);

  const getRosterLabel = (key) => {
    if (rosterColumnMeta[key]?.label) return rosterColumnMeta[key].label;
    if (attributeLabelMap[key]) return attributeLabelMap[key];
    return humanizeId(key);
  };

  const getRosterValue = (player, key) => {
    if (key === "nationality") {
      const code = player?.data?.bio?.nationality || "";
      const flagUrl = countryCodeToFlagUrl(code);
      const label = code || "--";
      return (
        <span className="nat-cell">
          {flagUrl && <span className="nat-flag" style={{ backgroundImage: `url(${flagUrl})` }} />}
          <span className="nat-code">{label}</span>
        </span>
      );
    }
    if (key === "pos") {
      const value = player?.data?.bio?.pos || "--";
      return <span className="roster-pos-pill">{value}</span>;
    }
    if (key === "rotation_slot") {
      const value = rotationSlotMap.get(player.id);
      return (
        <select
          className="roster-rotation-select"
          value={value ? String(value) : ""}
          onChange={(e) => updateRotationSlot(player.id, e.target.value)}
        >
          <option value=""></option>
          {rotationSlotOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    if (rosterColumnMeta[key]?.get) return rosterColumnMeta[key].get(player);
    if (attributeKeySet.has(key)) {
      const val = safeNum(player.data?.attributes?.[key]);
      return val ? val : "--";
    }
    return "--";
  };

  const getRosterSortValue = (player, key) => {
    if (key === "name") return String(player.name || "");
    if (rosterColumnMeta[key]?.sort) return rosterColumnMeta[key].sort(player);
    if (attributeKeySet.has(key)) return safeNum(player.data?.attributes?.[key]);
    return getRosterValue(player, key);
  };

  const rosterColumnTemplate = useMemo(() => {
    const widths = visibleRosterColumns.map((key) => rosterColumnMeta[key]?.width || "0.6fr");
    return ["0.9fr", "1.6fr", ...widths].join(" ");
  }, [visibleRosterColumns, rosterColumnMeta]);

  const clubPayroll = useMemo(() => {
    if (!contracts.length || !myRoster.length) return 0;
    const map = {};
    for (const c of contracts) {
      if (c?.player_id != null) map[c.player_id] = c;
    }
    return myRoster.reduce((sum, p) => {
      const contract = map[p.id];
      if (isScholarshipContract(contract)) return sum;
      return sum + safeNum(contract?.data?.salary || 0);
    }, 0);
  }, [myRoster, contracts]);

  const labelMaps = useMemo(() => {
    const origin = {};
    const mental = {};
    const arche = {};
    const trait = {};
    const perk = {};
    for (const p of players) {
      const id = p.data?.identity || {};
      if (id.origin && id.origin_label) origin[id.origin] = id.origin_label;
      if (id.mentalidad && id.mentalidad_label) mental[id.mentalidad] = id.mentalidad_label;
      if (id.arquetipo && id.arquetipo_label) arche[id.arquetipo] = id.arquetipo_label;
      const traits = p.data?.traits || [];
      const traitLabels = p.data?.traits_label || [];
      for (let i = 0; i < traits.length; i += 1) {
        const key = traits[i];
        const label = traitLabels[i];
        if (key && label) trait[key] = label;
      }
      const perks = p.data?.perks || [];
      const perkLabels = p.data?.perks_label || [];
      for (let i = 0; i < perks.length; i += 1) {
        const key = perks[i];
        const label = perkLabels[i];
        if (key && label) perk[key] = label;
      }
    }
    return { origin, mental, arche, trait, perk };
  }, [players]);

  const descMaps = useMemo(() => {
    const origin = {};
    const mental = {};
    const arche = {};
    const trait = {};
    const perk = {};
    const personality = {};
    for (const p of players) {
      const id = p.data?.identity || {};
      if (id.origin && id.origin_desc) origin[id.origin] = id.origin_desc;
      if (id.mentalidad && id.mentalidad_desc) mental[id.mentalidad] = id.mentalidad_desc;
      if (id.arquetipo && id.arquetipo_desc) arche[id.arquetipo] = id.arquetipo_desc;
      if (id.personality && id.personality_desc) personality[id.personality] = id.personality_desc;
      const traits = p.data?.traits || [];
      const traitsDesc = p.data?.traits_desc || [];
      for (let i = 0; i < traits.length; i += 1) {
        const key = traits[i];
        const desc = traitsDesc[i];
        if (key && desc) trait[key] = desc;
      }
      const perks = p.data?.perks || [];
      const perksDesc = p.data?.perks_desc || [];
      for (let i = 0; i < perks.length; i += 1) {
        const key = perks[i];
        const desc = perksDesc[i];
        if (key && desc) perk[key] = desc;
      }
    }
    return { origin, mental, arche, trait, perk, personality };
  }, [players]);

  const labelFor = (group, id) => {
    if (!id) return "--";
    return labelMaps[group]?.[id] || id;
  };

  const descFor = (group, id, fallback = "") => {
    if (!id) return fallback || "";
    return descMaps[group]?.[id] || fallback || "";
  };

  const humanizeId = (value) => {
    if (!value) return "--";
    return String(value)
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const normalizeContractItems = (items, details) => {
    if (Array.isArray(details) && details.length) {
      return details;
    }
    if (Array.isArray(items) && items.length && typeof items[0] === "object") {
      return items;
    }
    return (items || []).map((id) => ({
      id,
      label: id,
      desc: "",
    }));
  };

  const selectedPlayer = selectedPlayerId ? playerMap[selectedPlayerId] : null;
  const selectedTeam = selectedTeamId ? teamMap[selectedTeamId] : null;
  const selectedAgency = selectedAgencyId ? agencyMap[selectedAgencyId] : null;
  const selectedAgent = selectedAgentId ? agentMap[selectedAgentId] : null;
  const selectedStaffContract = selectedStaff?.contract || {};
  const selectedStaffClauses = normalizeContractItems(
    selectedStaffContract.clauses,
    selectedStaffContract.clauses_detail,
  );
  const selectedStaffBonuses = normalizeContractItems(
    selectedStaffContract.bonuses,
    selectedStaffContract.bonuses_detail,
  );
  const selectedTeamRoster = useMemo(() => {
    if (!selectedTeam) return [];
    const leagueKey = String(getTeamLeagueId(selectedTeam) || "").toUpperCase();
    const source = playersByLeague[leagueKey] || players;
    return source.filter((p) => p.data?.team_id === selectedTeam.id);
  }, [players, playersByLeague, selectedTeam]);
  const selectedTeamRosterIds = useMemo(
    () => selectedTeamRoster.map((p) => p.id),
    [selectedTeamRoster],
  );
  useEffect(() => {
    if (!window.pcbasket || !selectedTeam) return;
    const leagueId = getTeamLeagueId(selectedTeam);
    if (!leagueId) return;
    const key = String(leagueId).toUpperCase();
    if (!playersByLeague[key]) {
      loadPlayers(myTeamId, leagueId);
    }
  }, [selectedTeamId, playersByLeague]);
  const selectedAgentPlayers = useMemo(() => {
    if (!selectedAgent) return [];
    return players.filter((p) => p.data?.agent_id === selectedAgent.agent_id);
  }, [players, selectedAgent]);
  const selectedAgentPlayerIds = useMemo(
    () => selectedAgentPlayers.map((p) => p.id),
    [selectedAgentPlayers],
  );

  const catalogs = useMemo(() => {
    const origins = new Set();
    const mental = new Set();
    const arche = new Set();
    const traits = new Set();
    const perks = new Set();
    const tiers = new Set();

    for (const p of players) {
      const data = p.data || {};
      const id = data.identity || {};
      if (id.origin) origins.add(id.origin);
      if (id.mentalidad) mental.add(id.mentalidad);
      if (id.arquetipo) arche.add(id.arquetipo);
      const pTraits = data.traits || [];
      const pPerks = data.perks || [];
      for (const t of pTraits) traits.add(t);
      for (const k of pPerks) perks.add(k);
      if (data.scout?.tier) tiers.add(String(data.scout.tier));
    }

    return {
      origins: Array.from(origins),
      mental: Array.from(mental),
      arche: Array.from(arche),
      traits: Array.from(traits),
      perks: Array.from(perks),
      tiers: Array.from(tiers).sort(),
    };
  }, [players]);

  const sanitize = (value) => {
    if (Array.isArray(value)) {
      return value.map(sanitize);
    }
    if (value && typeof value === "object") {
      const next = {};
      for (const [key, val] of Object.entries(value)) {
        const lower = String(key).toLowerCase();
        if (lower === "ovr" || lower === "overall") {
          continue;
        }
        next[key] = sanitize(val);
      }
      return next;
    }
    return value;
  };

  const show = (data) => {
    if (typeof data === "string") {
      setOutput(data);
      return;
    }
    setOutput(JSON.stringify(sanitize(data), null, 2));
  };

  const formatMatchClock = useCallback(
    (clockValue, meta = matchRules) => {
      const periodCount = meta.periodCount || 4;
      const periodSeconds = meta.periodSeconds || 600;
      const periodLabels = Array.isArray(meta.periodLabels) ? meta.periodLabels : null;
      const otSeconds = meta.otSeconds || meta.ot_seconds || matchRules.otSeconds || 300;
      const computedTotal = periodCount * periodSeconds;
      const totalSeconds = Number.isFinite(Number(meta.totalSeconds)) ? Number(meta.totalSeconds) : computedTotal;
      const rawClock = Number(clockValue);
      const safeClock = Number.isFinite(rawClock) ? Math.max(0, Math.min(totalSeconds, rawClock)) : totalSeconds;
      const elapsed = Math.max(0, totalSeconds - safeClock);
      const regulationTotal = periodCount * periodSeconds;

      let periodIndex = 0;
      let remaining = 0;
      let label = "Q1";

      if (!otSeconds || elapsed < regulationTotal) {
        periodIndex = Math.min(periodCount - 1, Math.floor(elapsed / periodSeconds));
        const periodElapsed = elapsed - periodIndex * periodSeconds;
        remaining = Math.max(0, Math.ceil(periodSeconds - periodElapsed - 1e-6));
        label = (periodLabels && periodLabels[periodIndex]) ? String(periodLabels[periodIndex]) : `Q${periodIndex + 1}`;
      } else {
        const otElapsed = elapsed - regulationTotal;
        const otIndex = Math.floor(otElapsed / otSeconds);
        const within = otElapsed - otIndex * otSeconds;
        remaining = Math.max(0, Math.ceil(otSeconds - within - 1e-6));
        periodIndex = periodCount + otIndex;
        label = `OT${otIndex + 1}`;
      }

      const min = Math.floor(remaining / 60);
      const sec = String(remaining % 60).padStart(2, "0");
      return {
        periodIndex,
        periodLabel: label,
        timeLabel: `${min}:${sec}`,
        remainingSeconds: remaining,
        totalSeconds,
      };
    },
    [matchRules],
  );

  const buildMatchPlayerName = (player) => {
    if (!player) return "Jugador";
    return (
      player.name ||
      `${player.first_name || ""} ${player.last_name || ""}`.trim() ||
      `Jugador ${player.id || player.player_id || ""}`.trim()
    );
  };

  const buildMatchStatRow = (player) => {
    const id = player?.player_id || player?.id;
    return {
      player_id: id,
      name: buildMatchPlayerName(player),
      min: 0,
      pts: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      pf: 0,
      fgm: 0,
      fga: 0,
      "3pm": 0,
      "3pa": 0,
      ftm: 0,
      fta: 0,
      efg: 0,
      ts: 0,
      pm: 0,
    };
  };

  const updateMatchShootingMetrics = (row) => {
    const fgm = Number(row.fgm || 0);
    const fga = Number(row.fga || 0);
    const tpm = Number(row["3pm"] || 0);
    const tpa = Number(row["3pa"] || 0);
    const ftm = Number(row.ftm || 0);
    const fta = Number(row.fta || 0);
    const pts = Number(row.pts || 0);
    row.efg = fga ? Math.round(((fgm + 0.5 * tpm) / fga) * 1000) / 10 : 0;
    const tsDen = 2 * (fga + 0.44 * fta);
    row.ts = tsDen ? Math.round((pts / tsDen) * 1000) / 10 : 0;
    row.fg = `${fgm}/${fga}`;
    row.tp = `${tpm}/${tpa}`;
    row.ft = `${ftm}/${fta}`;
  };

  const initMatchStats = useCallback((homePlayers, awayPlayers) => {
    const homeMap = {};
    const awayMap = {};
    (homePlayers || []).forEach((p) => {
      const row = buildMatchStatRow(p);
      if (row.player_id) homeMap[row.player_id] = row;
    });
    (awayPlayers || []).forEach((p) => {
      const row = buildMatchStatRow(p);
      if (row.player_id) awayMap[row.player_id] = row;
    });
    matchStatsRef.current = { home: homeMap, away: awayMap };
    setMatchHomeStats(Object.values(homeMap));
    setMatchAwayStats(Object.values(awayMap));
  }, []);

  const buildLineupGroup = useCallback(
    (teamId, preferRotation) => {
      const rosterAll = getTeamRoster(teamId);
      const available = rosterAll.filter((p) => !isPlayerOut(p));
      const roster = available.length >= 5 ? available : rosterAll;
      if (!roster.length) {
        return { lineup: [], bench: [], all: [] };
      }
      let base = roster.map((p) => ({
        id: p.id,
        name: buildMatchPlayerName(p),
        rating: calcPlayerScore(p),
      }));
      if (preferRotation && rotationPlayers.length) {
        const rotationMap = new Map(rotationPlayers.map((p) => [p.id, p]));
        base = rotationPlayers.map((p) => ({
          id: p.id,
          name: p.name || buildMatchPlayerName(p),
          rating: p.rating || calcPlayerScore(rotationMap.get(p.id) || p),
          minutes: (p.periods || []).reduce((sum, val) => sum + Number(val || 0), 0),
          slot: p.slot,
        }));
        const hasSlots = base.some((p) => Number.isFinite(Number(p.slot)));
        if (hasSlots) {
          base.sort((a, b) => (Number(a.slot) || 999) - (Number(b.slot) || 999));
        } else {
          base.sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
        }
        const missing = roster
          .filter((p) => !rotationMap.has(p.id))
          .map((p) => ({ id: p.id, name: buildMatchPlayerName(p), rating: calcPlayerScore(p) }));
        base = [...base, ...missing];
      } else {
        base.sort((a, b) => b.rating - a.rating);
      }
      const lineup = base.slice(0, 5);
      const bench = base.slice(5, 12);
      return { lineup, bench, all: base };
    },
    [getTeamRoster, isPlayerOut, rotationPlayers],
  );

  const sendMatchControl = useCallback(
    async (payload) => {
      if (!window.pcbasket) return null;
      try {
        return await window.pcbasket.invoke("match.control", payload || {});
      } catch (err) {
        show(String(err));
        return null;
      }
    },
    [show],
  );

  const sendMatchAction = useCallback(
    async (payload) => {
      if (!window.pcbasket) return null;
      try {
        return await window.pcbasket.invoke("match.action", payload || {});
      } catch (err) {
        show(String(err));
        return null;
      }
    },
    [show],
  );

  const resetMatchEngine = useCallback(() => {
    if (matchStatus === "live" || matchStatus === "paused") {
      sendMatchControl({ action: "pause" });
    }
    setMatchStatus("idle");
    setMatchSession(null);
    setMatchScore({ home: 0, away: 0 });
    setMatchActions([]);
    setMatchLastEvent(null);
    setMatchClock(null);
    setMatchPeriodLabel("Q1");
    setMatchTimeLabel("10:00");
    setMatchShotClockLabel("24.0");
    setMatchTimeoutsLeft({ home: null, away: null });
    setMatchTeamFouls({ home: 0, away: 0 });
    setMatchHomeStats([]);
    setMatchAwayStats([]);
    setMatchLineups({ home: [], away: [], benchHome: [], benchAway: [] });
    setMatchSpeed(1);
    tickBuffer.reset();
    lastTickClockRef.current = null;
    setMatchPaused(false);
    setMatchAutoPausePeriod(null);
    setMatchSelectedShout(MATCH_SHOUTS[0]);
    setMatchSelectedPlaybookId(MATCH_PLAYBOOKS[0].id);
    setMatchActionTeam("home");
    setMatchTimeoutKind(MATCH_TIMEOUT_OPTIONS[0]);
    setMatchDefenseType(MATCH_DEFENSE_OPTIONS[0]);
    setMatchPnrDefense(MATCH_PNR_DEFENSE_OPTIONS[0]);
    setMatchPaceIdx(2);
    setMatchOffFocus(MATCH_FOCUS_OPTIONS[0]);
    setMatchSpacing(MATCH_SPACING_OPTIONS[0]);
    setMatchPassingRisk(1);
    setMatchAggression(50);
    setMatchOffRebound(30);
    setMatchThreePoint(50);
    setMatchPnrFrequency(50);
    setMatchFreedom(1);
    setMatchTransition(1);
    matchStatsRef.current = { home: {}, away: {} };
    matchMetaRef.current = {
      periodCount: matchRules.periodCount,
      periodSeconds: matchRules.periodSeconds,
      otSeconds: matchRules.otSeconds,
      totalSeconds: matchRules.periodCount * matchRules.periodSeconds,
      lastPeriodIndex: 0,
      periodLabels: matchRules.periodLabels || null,
    };
    matchResultRef.current = null;
    matchFixtureRef.current = null;
  }, [matchRules, matchStatus, sendMatchControl, tickBuffer]);

  const pauseMatch = useCallback(async () => {
    if (matchStatus === "idle" || matchStatus === "finished") return;
    await sendMatchControl({ action: "pause" });
    setMatchPaused(true);
    setMatchStatus("paused");
  }, [matchStatus, sendMatchControl]);

  const resumeMatch = useCallback(async () => {
    if (matchStatus === "idle" || matchStatus === "finished") return;
    await sendMatchControl({ action: "resume" });
    setMatchPaused(false);
    setMatchStatus("live");
  }, [matchStatus, sendMatchControl]);

  const loadCompetitionSnapshot = useCallback(
    async (leagueId, ensure = false) => {
      if (!window.pcbasket || !leagueId) return;
      setCompetitionSnapshotLoading(true);
      try {
        const res = await window.pcbasket.invoke("competition.snapshot", { league_id: leagueId, ensure });
        const snapshot = res?.result?.snapshot;
        if (snapshot) {
          setCompetitionSnapshots((prev) => ({ ...prev, [leagueId]: snapshot }));
        }
      } catch (err) {
        show(String(err));
      } finally {
        setCompetitionSnapshotLoading(false);
      }
    },
    [],
  );

  const loadAnalyticsSnapshot = useCallback(
    async (teamIdOverride) => {
      const targetTeamId = teamIdOverride ?? myTeamId;
      if (!window.pcbasket || !targetTeamId) return;
      setAnalyticsLoading(true);
      try {
        const res = await window.pcbasket.invoke("analytics.snapshot", { team_id: Number(targetTeamId) });
        setAnalyticsSnapshot(res?.result?.snapshot || null);
      } catch (err) {
        show(String(err));
      } finally {
        setAnalyticsLoading(false);
      }
    },
    [myTeamId],
  );

  const applyMatchResultToLoop = useCallback(
    (resultPayload) => {
      const fixture = matchFixtureRef.current;
      if (!fixture || fixture.played) return;
      const homeScore = Number(resultPayload?.score?.home ?? 0);
      const awayScore = Number(resultPayload?.score?.away ?? 0);
      const result = {
        id: `${fixture.id}-${Date.now()}`,
        fixtureId: fixture.id,
        date: fixture.date,
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        homeScore,
        awayScore,
      };
      setLoopResults((prev) => [...prev, result]);
      setLoopSchedule((prev) =>
        prev.map((f) => (f.id === fixture.id ? { ...f, played: true, resultId: result.id } : f)),
      );
      const isHome = String(result.homeId) === String(myTeamId);
      const won = isHome ? result.homeScore > result.awayScore : result.awayScore > result.homeScore;
      setLoopTeamState((prev) => {
        const updated = {
          ...prev,
          morale: clamp(prev.morale + (won ? 4 : -4)),
          cohesion: clamp(prev.cohesion + (won ? 1 : -1)),
          fatigue: clamp(prev.fatigue + 10),
          prep: clamp(prev.prep - 8),
        };
        loopTeamStateRef.current = updated;
        return updated;
      });
      if (competitionLeagueId) {
        loadCompetitionSnapshot(competitionLeagueId);
      }
      loadAnalyticsSnapshot(myTeamId);
    },
    [competitionLeagueId, loadCompetitionSnapshot, loadAnalyticsSnapshot, myTeamId],
  );

  useEffect(() => {
    if (!myTeamId) return;
    loadAnalyticsSnapshot(myTeamId);
  }, [myTeamId, loadAnalyticsSnapshot]);

  useEffect(() => {
    if (!myTeamId || !loopState?.date) return;
    loadAnalyticsSnapshot(myTeamId);
  }, [loopState?.date, myTeamId, loadAnalyticsSnapshot]);

  const buildDailySummary = useCallback(
    (dateStr, trainingSummary, matchSummary, marketSummary) => {
      const parts = [];
      if (trainingSummary) {
        if (trainingSummary.sessions > 0) {
          parts.push(`Entrenamiento: ${trainingSummary.sessions} sesiones · carga ${trainingSummary.load}.`);
        } else {
          parts.push("Descanso y recuperación.");
        }
      }
      if (marketSummary && marketSummary.resolved > 0) {
        parts.push(`Mercado: ${marketSummary.resolved} movimientos resueltos.`);
      }
      if (matchSummary) {
        const homeName = teamMap[matchSummary.homeId]?.name || "Local";
        const awayName = teamMap[matchSummary.awayId]?.name || "Visitante";
        parts.push(`Partido: ${homeName} ${matchSummary.homeScore}-${matchSummary.awayScore} ${awayName}.`);
      }
      if (!parts.length) {
        parts.push("Jornada sin eventos relevantes.");
      }
      return {
        title: `Informe diario ${dateStr}`,
        body: parts.join(" "),
        training: trainingSummary || {},
        market: marketSummary || {},
        match: matchSummary || null,
      };
    },
    [teamMap],
  );

  const startMatchSimulation = useCallback(
    async (fixture) => {
      if (!fixture) return false;
      if (!window.pcbasket) {
        setMatchStatus("error");
        show("Engine no disponible.");
        pendingAdvanceAfterMatchRef.current = null;
        return false;
      }
      resetMatchEngine();
      setMatchStatus("loading");
      matchFixtureRef.current = fixture;

      const isHomeMyTeam = String(fixture.homeId) === String(myTeamId);
      const isAwayMyTeam = String(fixture.awayId) === String(myTeamId);
      setMatchActionTeam(isHomeMyTeam ? "home" : "away");

      const homeLineups = buildLineupGroup(fixture.homeId, isHomeMyTeam);
      const awayLineups = buildLineupGroup(fixture.awayId, isAwayMyTeam);
      setMatchLineups({
        home: homeLineups.lineup,
        away: awayLineups.lineup,
        benchHome: homeLineups.bench,
        benchAway: awayLineups.bench,
      });
      initMatchStats(
        [...homeLineups.lineup, ...homeLineups.bench],
        [...awayLineups.lineup, ...awayLineups.bench],
      );

      const macroPlaybook =
        MATCH_PLAYBOOKS.find((pb) => pb.id === matchSelectedPlaybookId) || MATCH_PLAYBOOKS[0];

      const userPlaybookData =
        (isHomeMyTeam || isAwayMyTeam) && myTeamId
          ? await getActivePlaybookPlays(Number(myTeamId))
          : { playbook: null, plays: [] };

      const userPlayPayload = userPlaybookData?.plays?.length
        ? userPlaybookData.plays.map((p) => ({
            id: p.id,
            name: p.name,
            playType: p.playType,
            engineData: p.engineData,
            frames: p.frames,
            efficiency: p.efficiency,
            familiarity: p.familiarity,
          }))
        : [];
      const rotationPayload =
        (isHomeMyTeam || isAwayMyTeam) && rotationPlayers.length
          ? {
              players: rotationPlayers.map((p) => ({
                playerId: p.id,
                periods: Array.isArray(p.periods) ? p.periods.slice() : [],
                totalMinutes: (p.periods || []).reduce((sum, val) => sum + Number(val || 0), 0),
              })),
            }
          : null;

      const meta = {
        periodCount: matchRules.periodCount,
        periodSeconds: matchRules.periodSeconds,
        otSeconds: matchRules.otSeconds,
        totalSeconds: matchRules.periodCount * matchRules.periodSeconds,
        lastPeriodIndex: 0,
        periodLabels: matchRules.periodLabels || null,
      };
      matchMetaRef.current = meta;
      const clockInfo = formatMatchClock(meta.totalSeconds, meta);
      setMatchClock(meta.totalSeconds);
      setMatchPeriodLabel(clockInfo.periodLabel);
      setMatchTimeLabel(clockInfo.timeLabel);

      const res = await window.pcbasket.invoke("match.simulate", {
        home_team_id: fixture.homeId,
        away_team_id: fixture.awayId,
        fixture_id: fixture.id,
        ruleset: matchRules.ruleset,
        stream: true,
        engine_mode: "continuous",
        tick_ms: 100,
        stream_realtime: true,
        realtime_factor: matchSpeed,
        stream_delay_ms: MATCH_SPEED_MS[matchSpeed] ?? MATCH_SPEED_MS[1],
        period_count: matchRules.periodCount,
        period_seconds: matchRules.periodSeconds,
        ot_seconds: matchRules.otSeconds,
        lineup_home_ids: homeLineups.lineup.map((p) => p.id),
        bench_home_ids: homeLineups.bench.map((p) => p.id),
        lineup_away_ids: awayLineups.lineup.map((p) => p.id),
        bench_away_ids: awayLineups.bench.map((p) => p.id),
        rotation_home: isHomeMyTeam ? rotationPayload : undefined,
        rotation_away: isAwayMyTeam ? rotationPayload : undefined,
        playbook_home:
          isHomeMyTeam && macroPlaybook
            ? {
                primaryFocus: macroPlaybook.focus,
                primaryType: macroPlaybook.type,
                plays: userPlayPayload,
              }
            : undefined,
        playbook_away:
          !isHomeMyTeam && macroPlaybook
            ? {
                primaryFocus: macroPlaybook.focus,
                primaryType: macroPlaybook.type,
                plays: userPlayPayload,
              }
            : undefined,
        tactics_home: buildTacticsPayload(fixture.homeId, isHomeMyTeam),
        tactics_away: buildTacticsPayload(fixture.awayId, isAwayMyTeam),
        tactics_team_id: (isHomeMyTeam || isAwayMyTeam) ? myTeamId : undefined,
        apply_post_match: true,
        current_date: fixture.date,
      });
      if (!res?.ok) {
        setMatchStatus("error");
        show(res?.error?.message || "Error iniciando match.");
        pendingAdvanceAfterMatchRef.current = null;
        return false;
      }
      setMatchSession({
        runId: res?.result?.run_id,
        fixtureId: fixture.id,
        homeId: fixture.homeId,
        awayId: fixture.awayId,
      });
      setMatchScore({ home: 0, away: 0 });
      setMatchPaused(false);
      setMatchStatus("live");
      return true;
    },
    [
      buildLineupGroup,
      buildTacticsPayload,
      formatMatchClock,
      initMatchStats,
      matchRules,
      matchSelectedPlaybookId,
      matchSpeed,
      myTeamId,
      resetMatchEngine,
      rotationPlayers,
      show,
    ],
  );

  const handleEngineEvent = useCallback(
    (data) => {
      if (!data || !data.event) return;
      if (!String(data.event).startsWith("match.")) {
        show({ event: data });
        return;
      }
      const payload = data.payload || {};
      if (data.event === "match.start") {
        setMatchStatus("live");
        setMatchPaused(false);
        return;
      }
      if (data.event === "match.result") {
        matchResultRef.current = payload;
        if (payload?.score) {
          setMatchScore({
            home: Number(payload.score.home || 0),
            away: Number(payload.score.away || 0),
          });
        }
        if (payload?.player_stats) {
          setMatchHomeStats(payload.player_stats.home || []);
          setMatchAwayStats(payload.player_stats.away || []);
        }
        if (payload?.lineups) {
          const home = (payload.lineups.home || []).map((p) => ({ id: p.id, name: p.name }));
          const away = (payload.lineups.away || []).map((p) => ({ id: p.id, name: p.name }));
          const benchHome = (payload.lineups.bench_home || payload.lineups.benchHome || []).map((p) => ({ id: p.id, name: p.name }));
          const benchAway = (payload.lineups.bench_away || payload.lineups.benchAway || []).map((p) => ({ id: p.id, name: p.name }));
          setMatchLineups((prev) => ({
            ...prev,
            home: home.length ? home : prev.home,
            away: away.length ? away : prev.away,
            benchHome: benchHome.length ? benchHome : prev.benchHome,
            benchAway: benchAway.length ? benchAway : prev.benchAway,
          }));
        }
        return;
      }
      if (data.event === "match.end") {
        setMatchStatus("finished");
        setMatchPaused(false);
        if (matchResultRef.current) {
          applyMatchResultToLoop(matchResultRef.current);
        }
        if (window.pcbasket) {
          loadPlayers(myTeamId);
          loadTeams();
          loadHubSnapshot(myTeamId);
        }
        void finalizeDayAfterMatchRef.current?.();
        return;
      }
      if (data.event === "match.tick") {
        tickBuffer.pushTick(payload);
        if (payload && typeof payload.c === "number") {
          lastTickClockRef.current = payload.c;
          const meta = matchMetaRef.current || matchRules;
          const clockInfo = formatMatchClock(payload.c, meta);
          setMatchClock(payload.c);
          setMatchPeriodLabel(clockInfo.periodLabel);
          setMatchTimeLabel(clockInfo.timeLabel);
        }
        if (payload && typeof payload.sc === "number") {
          const raw = Math.max(0, Number(payload.sc));
          setMatchShotClockLabel(raw.toFixed(1));
        }
        if (payload && payload.tl && typeof payload.tl === "object") {
          setMatchTimeoutsLeft({
            home: Number.isFinite(Number(payload.tl.home)) ? Number(payload.tl.home) : null,
            away: Number.isFinite(Number(payload.tl.away)) ? Number(payload.tl.away) : null,
          });
        }
        if (payload && payload.tf && typeof payload.tf === "object") {
          setMatchTeamFouls({
            home: Number.isFinite(Number(payload.tf.home)) ? Number(payload.tf.home) : 0,
            away: Number.isFinite(Number(payload.tf.away)) ? Number(payload.tf.away) : 0,
          });
        }
        return;
      }
      if (data.event !== "match.event") return;

      const evt = payload || {};
      const meta = matchMetaRef.current || {};
      if (evt.event === "overtime_start") {
        const nextTotal = Number(evt.total_seconds);
        if (Number.isFinite(nextTotal) && nextTotal > 0) {
          meta.totalSeconds = nextTotal;
        }
        const nextOt = Number(evt.ot_seconds);
        if (Number.isFinite(nextOt) && nextOt > 0) {
          meta.otSeconds = nextOt;
        }
        matchMetaRef.current = meta;
      }
      const baseClock =
        typeof evt.clock === "number"
          ? evt.clock
          : typeof lastTickClockRef.current === "number"
            ? lastTickClockRef.current
            : 0;
      const clockInfo = formatMatchClock(baseClock, meta);
      setMatchClock(baseClock);
      setMatchPeriodLabel(clockInfo.periodLabel);
      setMatchTimeLabel(clockInfo.timeLabel);

      if (clockInfo.periodIndex !== meta.lastPeriodIndex) {
        meta.lastPeriodIndex = clockInfo.periodIndex;
        matchMetaRef.current = meta;
        if (matchAutoPausePeriod !== null && clockInfo.periodIndex >= matchAutoPausePeriod) {
          setMatchAutoPausePeriod(null);
          pauseMatch();
        }
      }

      const eventTeam = evt.team === "away" ? "away" : "home";
      const homeName = matchSession?.homeId ? teamMap[matchSession.homeId]?.name : "Local";
      const awayName = matchSession?.awayId ? teamMap[matchSession.awayId]?.name : "Visitante";
      const teamLabel = eventTeam === "home" ? homeName : awayName;

      const description = (() => {
        switch (evt.event) {
          case "turnover":
            return `${evt.player || "Jugador"} pierde el balón${evt.kind ? ` (${evt.kind})` : ""} (${evt.by ? `robo ${evt.by}` : "pérdida"}).`;
          case "five_seconds_violation":
            return `Violación de 5 segundos en el saque (${teamLabel}).`;
          case "charge":
            return `Falta en ataque de ${evt.player || "jugador"}${evt.by ? ` (carga de ${evt.by})` : ""}.`;
          case "foul":
            return `Falta sobre ${evt.player || "jugador"} (${evt.ftm || 0}/${evt.fta || 0} TL)${evt.bonus_kind === "one_and_one" ? " (1+1)" : evt.bonus ? " (bonus)" : ""}.`;
          case "3pt_make":
            return `${evt.player || "Jugador"} mete triple${evt.ast_by ? ` (asist. ${evt.ast_by})` : ""}.`;
          case "3pt_miss":
            return `${evt.player || "Jugador"} falla triple.`;
          case "2pt_make":
            return `${evt.player || "Jugador"} anota de 2${evt.ast_by ? ` (asist. ${evt.ast_by})` : ""}.`;
          case "2pt_miss":
            return `${evt.player || "Jugador"} falla tiro de 2.`;
          case "goaltending":
            return `Goaltending de ${evt.by || "defensa"}: canasta concedida a ${evt.player || "jugador"}.`;
          case "block":
            return `Tapón de ${evt.player || "defensor"} a ${evt.on || "tirador"}.`;
          case "off_reb":
            return `Rebote ofensivo ${evt.player || "jugador"}.`;
          case "def_reb":
            return `Rebote defensivo ${evt.player || "jugador"}.`;
          case "putback_make":
            return `${evt.player || "Jugador"} anota tras rebote.`;
          case "putback_miss":
            return `${evt.player || "Jugador"} falla el putback.`;
          case "shot_clock_violation":
            return `Violación de 24s (${teamLabel}).`;
          case "backcourt_violation":
            return `Violación de campo atrás (${teamLabel}).`;
          case "three_seconds_violation":
            return `Violación de 3 segundos (${teamLabel}).`;
          case "defensive_three_seconds":
            return `3 segundos defensivos (${teamLabel}) · TL técnico ${evt.ftm || 0}/${evt.fta || 1}.`;
          case "timeout":
            return `Tiempo muerto ${teamLabel}${evt.timeout_kind ? ` (${evt.timeout_kind})` : ""}.`;
          case "timeout_denied":
            return `Timeout denegado (${teamLabel}).`;
          case "overtime_start":
            return `Comienza la prórroga OT${evt.ot || 1}.`;
          case "shout":
            return `${teamLabel} grita: ${evt.label || "Intensidad"}.`;
          case "play_called":
            return `${teamLabel} llama ${evt.play_name ? `"${evt.play_name}"` : `jugada ${evt.ctx || "Set"}`}${
              evt.reason ? ` (${evt.reason})` : ""
            }.`;
          case "playbook_change":
            return `${teamLabel} cambia a ${evt.label || "nuevo playbook"}.`;
          case "tactics_change": {
            const patch = evt.patch || {};
            const parts = [];
            if (patch.defenseType) parts.push(`Def: ${patch.defenseType}`);
            if (patch.pnrDefense) parts.push(`PnR: ${patch.pnrDefense}`);
            if (patch.pace !== undefined && patch.pace !== null) parts.push(`Ritmo: ${patch.pace}`);
            if (patch.focus) parts.push(`Enfoque: ${patch.focus}`);
            return `${teamLabel} ajusta tácticas${parts.length ? ` (${parts.join(" · ")})` : ""}.`;
          }
          case "substitution":
            return `Cambio: ${evt.out || "Sale"} → ${evt.in || "Entra"}${evt.reason ? ` (${evt.reason})` : ""}.`;
          case "substitution_queued":
            return `Cambio solicitado (${teamLabel}) · se aplicará en la próxima parada.`;
          case "ai_fatigue_sub":
            return `Cambio por fatiga (${teamLabel}): ${evt.player || "jugador"}.`;
          case "ai_foul_trouble_sub":
            return `Cambio por faltas (${teamLabel}): ${evt.player || "jugador"}.`;
          case "foul_out":
            return `${evt.player || "Jugador"} eliminado por faltas.`;
          default:
            return `${evt.event || "evento"} (${teamLabel}).`;
        }
      })();

      const isScoreEvent =
        evt.event === "3pt_make" ||
        evt.event === "2pt_make" ||
        evt.event === "putback_make" ||
        evt.event === "goaltending" ||
        (evt.event === "defensive_three_seconds" && Number(evt.ftm || 0) > 0) ||
        (evt.event === "foul" && Number(evt.ftm || 0) > 0);

      setMatchActions((prev) => {
        const next = [
          ...prev,
          {
            id: `${evt.event || "evt"}-${evt.clock}-${prev.length}`,
            periodLabel: clockInfo.periodLabel,
            time: clockInfo.timeLabel,
            description,
            team: eventTeam,
            isScore: isScoreEvent,
          },
        ];
        return next.slice(-200);
      });

      if (evt.event === "substitution" && evt.out_id && evt.in_id) {
        setMatchLineups((prev) => {
          const lineupKey = eventTeam;
          const benchKey = eventTeam === "home" ? "benchHome" : "benchAway";
          const lineup = [...(prev[lineupKey] || [])];
          const bench = [...(prev[benchKey] || [])];
          const outId = String(evt.out_id);
          const inId = String(evt.in_id);
          const outIndex = lineup.findIndex((p) => String(p.id) === outId);
          const inIndex = bench.findIndex((p) => String(p.id) === inId);
          if (outIndex === -1 || inIndex === -1) return prev;
          const outPlayer = lineup[outIndex];
          lineup[outIndex] = bench[inIndex];
          bench[inIndex] = outPlayer;
          return { ...prev, [lineupKey]: lineup, [benchKey]: bench };
        });
      }

      const ensureRow = (side, playerId, name) => {
        if (!playerId) return null;
        const map = matchStatsRef.current[side] || {};
        if (!map[playerId]) {
          map[playerId] = buildMatchStatRow({ id: playerId, name });
          matchStatsRef.current[side] = map;
        }
        return map[playerId];
      };

      const updateScore = (side, delta) => {
        if (!delta) return;
        setMatchScore((prev) => ({
          ...prev,
          [side]: Math.max(0, (prev[side] || 0) + delta),
        }));
      };

      if (evt.event === "3pt_make") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) {
          row.fga += 1;
          row.fgm += 1;
          row["3pa"] += 1;
          row["3pm"] += 1;
          row.pts += 3;
          updateMatchShootingMetrics(row);
        }
        if (evt.ast_by_id) {
          const aRow = ensureRow(eventTeam, evt.ast_by_id, evt.ast_by);
          if (aRow) aRow.ast += 1;
        }
        updateScore(eventTeam, 3);
      } else if (evt.event === "3pt_miss") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) {
          row.fga += 1;
          row["3pa"] += 1;
          updateMatchShootingMetrics(row);
        }
      } else if (evt.event === "2pt_make") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) {
          row.fga += 1;
          row.fgm += 1;
          row.pts += 2;
          updateMatchShootingMetrics(row);
        }
        if (evt.ast_by_id) {
          const aRow = ensureRow(eventTeam, evt.ast_by_id, evt.ast_by);
          if (aRow) aRow.ast += 1;
        }
        updateScore(eventTeam, 2);
      } else if (evt.event === "2pt_miss") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) {
          row.fga += 1;
          updateMatchShootingMetrics(row);
        }
      } else if (evt.event === "goaltending") {
        const pts = Number(evt.pts || 2);
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) {
          row.fga += 1;
          row.fgm += 1;
          row.pts += pts;
          if (pts === 3) {
            row["3pa"] += 1;
            row["3pm"] += 1;
          }
          updateMatchShootingMetrics(row);
        }
        updateScore(eventTeam, pts);
      } else if (evt.event === "putback_make") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) {
          row.fga += 1;
          row.fgm += 1;
          row.pts += 2;
          updateMatchShootingMetrics(row);
        }
        updateScore(eventTeam, 2);
      } else if (evt.event === "putback_miss") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) {
          row.fga += 1;
          updateMatchShootingMetrics(row);
        }
      } else if (evt.event === "off_reb" || evt.event === "def_reb") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) row.reb += 1;
      } else if (evt.event === "block") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) row.blk += 1;
      } else if (evt.event === "turnover" || evt.event === "backcourt_violation" || evt.event === "three_seconds_violation") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) row.tov += 1;
        if (evt.by_id) {
          const opp = ensureRow(eventTeam === "home" ? "away" : "home", evt.by_id, evt.by);
          if (opp) opp.stl += 1;
        }
      } else if (evt.event === "five_seconds_violation") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) row.tov += 1;
      } else if (evt.event === "charge") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) {
          row.tov += 1;
          row.pf += 1;
        }
      } else if (evt.event === "defensive_three_seconds") {
        const awarded = evt.awarded_to === "away" ? "away" : "home";
        updateScore(awarded, Number(evt.ftm || 0));
      } else if (evt.event === "foul") {
        const row = ensureRow(eventTeam, evt.player_id, evt.player);
        if (row) {
          row.fta += Number(evt.fta || 0);
          row.ftm += Number(evt.ftm || 0);
          row.pts += Number(evt.ftm || 0);
          updateMatchShootingMetrics(row);
        }
        updateScore(eventTeam, Number(evt.ftm || 0));
        if (evt.by_id) {
          const opp = ensureRow(eventTeam === "home" ? "away" : "home", evt.by_id, evt.by);
          if (opp) opp.pf += 1;
        }
      } else if (evt.event === "substitution") {
        setMatchLineups((prev) => {
          const lineupKey = eventTeam;
          const benchKey = eventTeam === "home" ? "benchHome" : "benchAway";
          const lineup = [...(prev[lineupKey] || [])];
          const bench = [...(prev[benchKey] || [])];
          const outIndex = lineup.findIndex((p) => p.name === evt.out);
          const inIndex = bench.findIndex((p) => p.name === evt.in);
          if (outIndex !== -1 && inIndex !== -1) {
            const outPlayer = lineup[outIndex];
            lineup[outIndex] = bench[inIndex];
            bench[inIndex] = outPlayer;
          }
          return { ...prev, [lineupKey]: lineup, [benchKey]: bench };
        });
      }

      setMatchHomeStats(Object.values(matchStatsRef.current.home));
      setMatchAwayStats(Object.values(matchStatsRef.current.away));

      if (evt.pause) {
        setMatchPaused(true);
        setMatchStatus("paused");
      }
      setMatchLastEvent({ ...evt, team: eventTeam, periodLabel: clockInfo.periodLabel, time: clockInfo.timeLabel });
    },
    [
      applyMatchResultToLoop,
      formatMatchClock,
      matchRules,
      matchAutoPausePeriod,
      matchSession,
      myTeamId,
      pauseMatch,
      show,
      teamMap,
      tickBuffer,
    ],
  );

  const handleEngineError = useCallback(
    (data) => {
      show({ error: data });
    },
    [show],
  );

  const handleMatchPlayPause = useCallback(() => {
    if (matchStatus === "live" && !matchPaused) {
      pauseMatch();
      return;
    }
    resumeMatch();
  }, [matchStatus, matchPaused, pauseMatch, resumeMatch]);

  const handleMatchSpeedChange = useCallback(() => {
    const speeds = [1, 2, 4];
    const idx = speeds.indexOf(matchSpeed);
    const next = speeds[(idx + 1) % speeds.length] || 1;
    setMatchSpeed(next);
    if (matchStatus !== "idle") {
      sendMatchControl({ action: "resume", realtime_factor: next });
    }
  }, [matchSpeed, matchStatus, sendMatchControl]);

  const handleMatchSimQuarter = useCallback(() => {
    if (matchStatus === "idle") return;
    const nextPeriod = (matchMetaRef.current?.lastPeriodIndex || 0) + 1;
    setMatchAutoPausePeriod(nextPeriod);
    tickBuffer.reset();
    setMatchSpeed(4);
    sendMatchControl({ action: "fast_forward", emit_ticks: false, skip_positions: true });
    setMatchPaused(false);
    setMatchStatus("live");
  }, [matchStatus, sendMatchControl, tickBuffer]);

  const handleMatchSimMatch = useCallback(() => {
    if (matchStatus === "idle") return;
    setMatchAutoPausePeriod(null);
    tickBuffer.reset();
    setMatchSpeed(4);
    sendMatchControl({ action: "fast_forward", emit_ticks: false, skip_positions: true });
    setMatchPaused(false);
    setMatchStatus("live");
  }, [matchStatus, sendMatchControl, tickBuffer]);

  const handleMatchTimeout = useCallback(() => {
    if (matchStatus === "idle") return;
    const teamName =
      matchActionTeam === "home"
        ? teamMap[matchSession?.homeId]?.name
        : teamMap[matchSession?.awayId]?.name;
    sendMatchAction({
      action: "timeout",
      team: matchActionTeam,
      team_label: teamName,
      timeout_kind: matchTimeoutKind,
    });
  }, [matchActionTeam, matchSession, matchStatus, matchTimeoutKind, sendMatchAction, teamMap]);

  const handleMatchShout = useCallback(() => {
    if (matchStatus === "idle") return;
    const teamName =
      matchActionTeam === "home"
        ? teamMap[matchSession?.homeId]?.name
        : teamMap[matchSession?.awayId]?.name;
    sendMatchAction({
      action: "shout",
      team: matchActionTeam,
      team_label: teamName,
      label: matchSelectedShout,
    });
  }, [matchActionTeam, matchSelectedShout, matchSession, matchStatus, sendMatchAction, teamMap]);

  const handleMatchPlaybookChange = useCallback(
    (nextId) => {
      setMatchSelectedPlaybookId(nextId);
      if (matchStatus === "idle") return;
      const playbook = MATCH_PLAYBOOKS.find((pb) => pb.id === nextId);
      if (!playbook) return;
      const teamName =
        matchActionTeam === "home"
          ? teamMap[matchSession?.homeId]?.name
          : teamMap[matchSession?.awayId]?.name;
      sendMatchAction({
        action: "playbook_change",
        team: matchActionTeam,
        team_label: teamName,
        label: playbook.name,
        focus: playbook.focus,
        ptype: playbook.type,
      });
    },
    [matchActionTeam, matchSession, matchStatus, sendMatchAction, teamMap],
  );

  const handleMatchApplyTactics = useCallback(() => {
    if (matchStatus === "idle") return;
    const patch = {
      pace: matchPaceIdx,
      focus: matchOffFocus,
      defenseType: matchDefenseType,
      pnrDefense: matchPnrDefense,
      spacing: matchSpacing,
      passingRisk: matchPassingRisk,
      aggression: matchAggression,
      offRebound: matchOffRebound,
      threePoint: matchThreePoint,
      pnrFrequency: matchPnrFrequency,
      freedom: matchFreedom,
      transition: matchTransition,
    };
    const isHomeMyTeam = String(matchSession?.homeId) === String(myTeamId);
    const isAwayMyTeam = String(matchSession?.awayId) === String(myTeamId);
    const mySide = isHomeMyTeam ? "home" : isAwayMyTeam ? "away" : null;
    if (mySide && matchActionTeam === mySide && matchupAssignments && Object.keys(matchupAssignments).length) {
      patch.matchups = matchupAssignments;
    }
    sendMatchAction({
      action: "tactics_change",
      team: matchActionTeam,
      patch,
    });
  }, [
    matchActionTeam,
    matchAggression,
    matchDefenseType,
    matchFreedom,
    matchOffFocus,
    matchOffRebound,
    matchPaceIdx,
    matchPassingRisk,
    matchPnrDefense,
    matchPnrFrequency,
    matchSession,
    matchSpacing,
    matchStatus,
    matchThreePoint,
    matchTransition,
    matchupAssignments,
    myTeamId,
    sendMatchAction,
  ]);

  const handleMatchSubstitute = useCallback(() => {
    if (matchStatus === "idle") return;
    setSubstitutionOpen(true);
  }, [matchStatus]);

  const handleMatchSubstitutionConfirm = useCallback(
    (outId, inId) => {
      if (!outId || !inId) return;
      const teamName =
        matchActionTeam === "home"
          ? teamMap[matchSession?.homeId]?.name
          : teamMap[matchSession?.awayId]?.name;
      sendMatchAction({
        action: "substitution",
        team: matchActionTeam,
        team_label: teamName,
        out_id: Number(outId),
        in_id: Number(inId),
      });
      setSubstitutionOpen(false);
    },
    [matchActionTeam, matchSession, sendMatchAction, teamMap],
  );

  const handleMatchSubstitutionClose = useCallback(() => {
    setSubstitutionOpen(false);
  }, []);

  const loadPlayers = async (overrideTeamId, overrideLeagueId) => {
    setLoadingPlayers(true);
    try {
      const viewTeamId = overrideTeamId ?? myTeamId;
      const leagueId = overrideLeagueId ?? activeLeagueId;
      const payload = { limit: 1000, offset: 0 };
      if (viewTeamId) payload.view_team_id = Number(viewTeamId);
      if (leagueId) payload.league_id = leagueId;
      const res = await window.pcbasket.invoke("player.list", payload);
      const list = res?.result?.items || [];
      if (leagueId) {
        const key = String(leagueId).toUpperCase();
        setPlayersByLeague((prev) => ({ ...prev, [key]: list }));
      }
      if (!leagueId || String(leagueId).toUpperCase() === String(activeLeagueId || "").toUpperCase()) {
        setPlayers(list);
      }
      show(res);
    } catch (err) {
      show(String(err));
    } finally {
      setLoadingPlayers(false);
    }
  };

  const loadTeams = async () => {
    setLoadingTeams(true);
    try {
      const res = await window.pcbasket.invoke("team.list", { limit: 1000, offset: 0 });
      const list = res?.result?.items || [];
      const next = applyTeamOverrides(list);
      setTeams(next);
      show(res);
    } catch (err) {
      show(String(err));
    } finally {
      setLoadingTeams(false);
    }
  };

  const loadContracts = async () => {
    setLoadingContracts(true);
    try {
      const res = await window.pcbasket.invoke("contract.list", { limit: 1000, offset: 0 });
      const list = res?.result?.items || [];
      setContracts(list);
      show(res);
    } catch (err) {
      show(String(err));
    } finally {
      setLoadingContracts(false);
    }
  };

  const loadAgencies = async () => {
    setLoadingAgencies(true);
    try {
      const res = await window.pcbasket.invoke("agency.list", { limit: 200, offset: 0 });
      const list = res?.result?.items || [];
      setAgencies(list);
      show(res);
    } catch (err) {
      show(String(err));
    } finally {
      setLoadingAgencies(false);
    }
  };

  const loadAgents = async () => {
    setLoadingAgents(true);
    try {
      const res = await window.pcbasket.invoke("agent.list", { limit: 500, offset: 0 });
      const list = res?.result?.items || [];
      setAgents(list);
      show(res);
    } catch (err) {
      show(String(err));
    } finally {
      setLoadingAgents(false);
    }
  };

  const loadHubSnapshot = useCallback(
    async (teamIdOverride) => {
      const targetTeamId = teamIdOverride ?? myTeamId;
      if (!window.pcbasket || !targetTeamId) return;
      setHubLoading(true);
      try {
        const res = await window.pcbasket.invoke("smartphone.snapshot", { team_id: Number(targetTeamId) });
        setHubSnapshot(res?.result?.snapshot || null);
      } catch (err) {
        show(String(err));
      } finally {
        setHubLoading(false);
      }
    },
    [myTeamId],
  );

  const createGmEvent = useCallback(
    async (payload) => {
      if (!window.pcbasket || !payload?.team_id) return;
      try {
        await window.pcbasket.invoke("gm.event.create", payload);
        await loadHubSnapshot(payload.team_id);
      } catch (err) {
        show(String(err));
      }
    },
    [loadHubSnapshot, show],
  );

  const patchPlayer = useCallback(
    async (playerId, patch) => {
      if (!window.pcbasket || !playerId) return null;
      try {
        const res = await window.pcbasket.invoke("player.patch", { player_id: Number(playerId), patch: patch || {} });
        if (myTeamId) {
          await loadPlayers(myTeamId);
          await loadHubSnapshot(myTeamId);
        } else {
          await loadPlayers();
        }
        return res?.result || res;
      } catch (err) {
        show(String(err));
        return null;
      }
    },
    [loadHubSnapshot, loadPlayers, myTeamId, show],
  );

  const handleSmartphoneEvent = useCallback(
    async (event) => {
      if (!window.pcbasket || !myTeamId) return;
      try {
        await window.pcbasket.invoke("smartphone.event", { team_id: Number(myTeamId), event: event || {} });
        await loadHubSnapshot(myTeamId);
        await loadTeams();
      } catch (err) {
        console.error("Error logging smartphone event:", err);
      }
    },
    [loadHubSnapshot, loadTeams, myTeamId],
  );

  const applyGmDecision = useCallback( 
    async (decisionId, optionKey) => { 
      if (!window.pcbasket || !decisionId) return; 
      try { 
        const res = await window.pcbasket.invoke("gm.decision.apply", { 
          decision_id: decisionId,
          option_key: optionKey,
        });
        const updatedState = res?.result?.team_state;
        if (updatedState) {
          const nextState = {};
          ["morale", "fatigue", "cohesion", "tactical", "fitness", "recovery", "prep"].forEach((key) => {
            const value = Number(updatedState[key]);
            if (Number.isFinite(value)) {
              nextState[key] = Math.max(0, Math.min(100, Math.round(value)));
            }
          });
          if (Object.keys(nextState).length) {
            setLoopTeamState((prev) => {
              const merged = { ...prev, ...nextState };
              loopTeamStateRef.current = merged;
              return merged;
            });
          }
          await loadTeams();
        }
        await loadHubSnapshot(myTeamId);
      } catch (err) {
        show(String(err));
      }
    },
    [loadHubSnapshot, loadTeams, myTeamId, show], 
  ); 
 
  const prepareWorldDay = useCallback( 
    async (dateStr, trainingSummary) => { 
      if (!window.pcbasket || !myTeamId || !dateStr) return null; 
      try { 
        const res = await window.pcbasket.invoke("world.prepare_day", { 
          team_id: Number(myTeamId), 
          date: dateStr, 
          training: { 
            session_count: Number(trainingSummary?.sessions ?? 1), 
            load: Number(trainingSummary?.load ?? 45), 
            max_rpe: Number(trainingSummary?.maxRpe ?? 7), 
            rest_day: Boolean(trainingSummary?.rest_day) || Number(trainingSummary?.sessions ?? 1) <= 0, 
          }, 
          ai: { league_ids: activeLeagueIds }, 
        }); 
        return res?.result || null; 
      } catch (err) { 
        console.error("Error preparing world day:", err); 
        return null; 
      } 
    }, 
    [activeLeagueIds, myTeamId], 
  ); 
 
  const finalizeWorldDay = useCallback( 
    async (dateStr, dailySummary) => { 
      if (!window.pcbasket || !myTeamId || !dateStr) return null; 
      try { 
        const res = await window.pcbasket.invoke("world.finalize_day", { 
          team_id: Number(myTeamId), 
          date: dateStr, 
          summary: dailySummary || {}, 
          team_state: loopTeamStateRef.current || {}, 
        }); 
        return res?.result || null; 
      } catch (err) { 
        console.error("Error finalizing world day:", err); 
        return null; 
      } 
    }, 
    [myTeamId], 
  ); 
 
  const applyWorldAdvanceResult = useCallback( 
    async (leagueId, result) => { 
      if (!result?.ok) return; 
      const snapshot = result?.competition || null; 
      if (snapshot && leagueId) { 
        setCompetitionSnapshots((prev) => ({ ...prev, [leagueId]: snapshot })); 
        const extracted = extractMyTeamScheduleFromSnapshot(snapshot, myTeamId); 
        if (extracted?.schedule) setLoopSchedule(extracted.schedule); 
        if (extracted?.results) setLoopResults(extracted.results); 
      } 
      if (result?.analytics) { 
        setAnalyticsSnapshot(result.analytics); 
      } 
      const nextDate = result?.next_date || result?.nextDate; 
      if (nextDate) { 
        setLoopState({ date: formatLocalDate(parseIsoDate(nextDate)), phase: 0 }); 
      } else { 
        const current = loopStateRef.current?.date; 
        if (current) { 
          setLoopState({ date: formatLocalDate(addDays(parseIsoDate(current), 1)), phase: 0 }); 
        } 
      } 
      await loadTeams(); 
      await loadPlayers(myTeamId); 
      await loadHubSnapshot(myTeamId); 
    }, 
    [loadHubSnapshot, loadPlayers, loadTeams, myTeamId], 
  ); 
 
  const simulateMarketDayRef = useRef(async () => ({ resolved: 0 })); 
 
  useEffect(() => { 
    simulateMarketDayRef.current = async (dateStr) => {
      if (!window.pcbasket || !dateStr) return { resolved: 0 };
      try {
        const res = await window.pcbasket.invoke("market.simulate_day", { current_date: dateStr });
        if (res?.result?.resolved > 0) {
          await loadTeams();
          await loadPlayers(myTeamId);
          await loadHubSnapshot(myTeamId);
        }
        return res?.result || { resolved: 0 };
      } catch (err) {
        console.error("Error simulating market day:", err);
        return { resolved: 0 };
      }
    };
  }, [loadPlayers, loadTeams, loadHubSnapshot, myTeamId]);

  useEffect(() => {
    finalizeDayAfterMatchRef.current = async () => {
      const pending = pendingAdvanceAfterMatchRef.current;
      if (!pending?.date) return;
      pendingAdvanceAfterMatchRef.current = null;
      const state = loopStateRef.current;
      if (!state?.date || state.date !== pending.date) return;

      const fixture = matchFixtureRef.current;
      const score = matchResultRef.current?.score || {};
      let matchSummary = null;
      if (fixture && score) { 
        matchSummary = { 
          fixtureId: fixture.id, 
          date: pending.date, 
          homeId: fixture.homeId, 
          awayId: fixture.awayId, 
          homeScore: Number(score.home || 0), 
          awayScore: Number(score.away || 0), 
        }; 
      } 
      const marketSummary = pending.marketSummary || { resolved: 0 }; 
      const summary = buildDailySummary(pending.date, pending.trainingSummary, matchSummary, marketSummary); 
      const fin = await finalizeWorldDay(pending.date, summary); 
      const myTeam = teams.find((t) => String(t.id) === String(myTeamId)) || null; 
      const leagueId = myTeam ? getTeamLeagueId(myTeam) : competitionLeagueId; 
      await applyWorldAdvanceResult(leagueId, fin); 
    }; 
  }, [applyWorldAdvanceResult, buildDailySummary, competitionLeagueId, finalizeWorldDay, myTeamId, teams]); 

  const openMatchDecision = useCallback((fixture) => {
    if (!fixture) return;
    setMatchDecisionFixture(fixture);
    setMatchDecisionOpen(true);
  }, []);

  const closeMatchDecision = useCallback(() => {
    setMatchDecisionOpen(false);
  }, []);

  const advanceAiDay = useCallback(
    async (dateStr) => {
      if (!window.pcbasket || !dateStr || !myTeamId) return { simulated_matches: 0 };
      try {
        const res = await window.pcbasket.invoke("ai.advance_day", {
          current_date: dateStr,
          human_team_id: Number(myTeamId),
          league_ids: activeLeagueIds,
        });
        if (res?.result?.updated > 0 || res?.result?.offers > 0) {
          await loadTeams();
        }
        return res?.result || { simulated_matches: 0 };
      } catch (err) {
        console.error("Error advancing AI day:", err);
        return { simulated_matches: 0 };
      }
    },
    [activeLeagueIds, loadTeams, myTeamId],
  );

  useEffect(() => {
    if (!competitionLeagueId) return;
    loadCompetitionSnapshot(competitionLeagueId, true);
  }, [competitionLeagueId, loadCompetitionSnapshot]);

  useEffect(() => {
    const targetLeagues = (activeLeagueIds && activeLeagueIds.length
      ? activeLeagueIds
      : Object.keys(enabledTeamsByLeague || {}));
    targetLeagues.forEach((leagueId) => {
      if (!enabledTeamsByLeague[leagueId]?.length) return;
      if (competitionSnapshots[leagueId]) return;
      loadCompetitionSnapshot(leagueId, true);
    });
  }, [activeLeagueIds, enabledTeamsByLeague, competitionSnapshots, loadCompetitionSnapshot]);

  useEffect(() => {
    if (!myTeamId) return;
    const team = teams.find((t) => String(t.id) === String(myTeamId));
    if (!team) return;
    const leagueId = getTeamLeagueId(team);
    if (!leagueId) return;
    const snapshot = competitionSnapshots[leagueId];
    if (!snapshot) return;
    const { schedule, results } = extractMyTeamScheduleFromSnapshot(snapshot, myTeamId);
    setLoopSchedule(schedule);
    setLoopResults(results);
  }, [competitionSnapshots, myTeamId, teams]);

  const toggleShortlist = (playerId) => {
    setShortlist((prev) => ({
      ...prev,
      [playerId]: !prev[playerId],
    }));
  };

  const toggleTag = (playerId, tag) => {
    setTagsByPlayer((prev) => {
      const current = new Set(prev[playerId] || []);
      if (current.has(tag)) {
        current.delete(tag);
      } else {
        current.add(tag);
      }
      return { ...prev, [playerId]: Array.from(current) };
    });
  };

  useEffect(() => {
    if (!window.pcbasket) {
      return;
    }

    const offEvent = window.pcbasket.on("engine.event", handleEngineEvent);
    const offErr = window.pcbasket.on("engine.error", handleEngineError);

    return () => {
      offEvent();
      offErr();
    };
  }, [handleEngineEvent, handleEngineError]);

  useEffect(() => {
    if (!window.pcbasket) return;
    loadTeams();
    loadPlayers();
    loadContracts();
    loadAgencies();
    loadAgents();
  }, []);

  useEffect(() => {
    if (!window.pcbasket || !myTeamId) return;
    loadPlayers(myTeamId);
  }, [myTeamId]);

  useEffect(() => {
    if (!window.pcbasket || !myTeamId) return;
    loadHubSnapshot(myTeamId);
  }, [myTeamId, loopState?.date, loadHubSnapshot]);

  useEffect(() => {
    if (myTeamId && teams.length > 0) {
      const exists = teams.some((t) => String(t.id) === String(myTeamId));
      if (!exists) {
        setMyTeamId("");
      }
    }
  }, [teams, myTeamId]);

  useEffect(() => {
    if (myTeamId) {
      setRosterView("plantilla");
    }
  }, [myTeamId]);

  useEffect(() => {
    if (!myTeam) return;
    const leagueId = getTeamLeagueId(myTeam);
    const desired = getLeagueConfig(leagueId).rotationType || "FIBA_M";
    setRotationLeagueType(desired);
  }, [myTeam, rulesVersion]);

  useEffect(() => {
    if (selectedPlayerId) {
      setSelectedAttrSection("ofensiva");
      setPlayerTab("perfil");
      const pos = normalizePosition(selectedPlayer?.data?.bio?.pos || selectedPlayer?.position || "PG");
      setPlayerTacticalPos(pos);
    }
  }, [selectedPlayerId, selectedPlayer]);

  useEffect(() => {
    const staffList = (myStaff || []).map((s, idx) => ({
      id: s.id || idx + 1,
      name: s.name || s.full_name || `Staff ${idx + 1}`,
      role: s.role || s.department || "Staff",
    }));
    const next = staffList;
    setTrainingStaff(next);
    if (next.length) {
      if (!trainingStaffId) {
        setTrainingStaffId(next[0].id);
      }
    } else if (trainingStaffId) {
      setTrainingStaffId(null);
    }
  }, [myStaff, trainingStaffId]);

  useEffect(() => {
    const baseDate = loopState?.date ? parseIsoDate(loopState.date) : new Date();
    const monthDays = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
    const generated = Array.from({ length: monthDays }, (_, idx) => ({
      day: idx + 1,
    }));
    setTrainingMonthDays(generated);
  }, [loopState?.date]);

  useEffect(() => {
    if (!myTeamId) return;
    setTrainingWeekTouched(false);
  }, [myTeamId]);

  useEffect(() => {
    if (trainingView !== "team") return;
    if (!loopState?.date) return;
    if (trainingWeekTouched) return;
    const next = startOfWeek(parseIsoDate(loopState.date));
    setTrainingWeekStart((prev) => (prev && isoDate(prev) === isoDate(next) ? prev : next));
  }, [loopState?.date, trainingView, trainingWeekTouched]);

  const rotationRules = ROTATION_LEAGUE_RULES[rotationLeagueType] || ROTATION_LEAGUE_RULES.FIBA_M;
  const rotationOptions = useMemo(() => getRotationOptions(rotationLeagueType), [rotationLeagueType]);

  const rotationTotals = useMemo(() => {
    const row = {};
    const col = Array(rotationRules.count).fill(0);
    rotationPlayers.forEach((p) => {
      const total = (p.periods || []).reduce((a, b) => a + b, 0);
      row[p.id] = total;
      (p.periods || []).forEach((val, idx) => {
        col[idx] += val;
      });
    });
    return { row, col };
  }, [rotationPlayers, rotationRules]);

  const trainingLoad = useMemo(() => {
    let total = 0;
    trainingPlan.forEach((day) => {
      day.sessions.forEach((session) => {
        total += trainingDuration(session.startTime, session.endTime) * (TRAINING_RPE[session.intensity] || 0);
      });
    });
    let status = "Optima";
    let color = "#22c55e";
    if (total < 1800) {
      status = "Baja";
      color = "#3b82f6";
    } else if (total > 3800) {
      status = "Excesiva";
      color = "#ef4444";
    }
    const percentage = Math.min(100, (total / 4500) * 100);
    return { total, status, color, percentage };
  }, [trainingPlan]);

  const loadManagementRows = useMemo(() => myRoster.map((p) => buildLoadRow(p)), [myRoster]);

  const loadManagementFiltered = useMemo(() => {
    let result = [...loadManagementRows];
    result = result.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(loadSearchQuery.toLowerCase());
      const matchesRisk = !loadFilters.onlyRisk || p.status === "Risk";
      const matchesFatigue = !loadFilters.highFatigue || p.fatigue > 70;
      return matchesSearch && matchesRisk && matchesFatigue;
    });

    loadSortConfig.forEach(({ key, direction }) => {
      result.sort((a, b) => {
        let aVal = a[key];
        let bVal = b[key];
        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();
        if (aVal < bVal) return direction === "asc" ? -1 : 1;
        if (aVal > bVal) return direction === "asc" ? 1 : -1;
        return 0;
      });
    });

    return result;
  }, [loadManagementRows, loadSearchQuery, loadFilters, loadSortConfig]);

  const loadManagementStats = useMemo(() => ({
    risk: loadManagementRows.filter((p) => p.status === "Risk").length,
    optimal: loadManagementRows.filter((p) => p.status === "Optimal").length,
    avgFatigue: Math.round(loadManagementRows.reduce((acc, p) => acc + p.fatigue, 0) / (loadManagementRows.length || 1)),
  }), [loadManagementRows]);

  const isMatchDay = useCallback(
    (dateStr) => {
      if (!dateStr || !myTeamId) return false;
      return loopSchedule.some(
        (f) =>
          f.date === dateStr &&
          (String(f.homeId) === String(myTeamId) || String(f.awayId) === String(myTeamId)),
      );
    },
    [loopSchedule, myTeamId],
  );

  const stripSessionsOnMatchDays = useCallback(
    (plan, weekStart) => {
      if (!weekStart) return plan;
      return (plan || []).map((day, idx) => {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + idx);
        const dayStr = isoDate(dayDate);
        if (!isMatchDay(dayStr)) return day;
        return { ...day, isMatch: true, sessions: [] };
      });
    },
    [isMatchDay],
  );

  const loopRecord = useMemo(() => {
    if (!myTeamId) return { w: 0, l: 0 };
    return loopResults.reduce((acc, r) => {
      if (String(r.homeId) === String(myTeamId)) {
        if (r.homeScore > r.awayScore) acc.w += 1;
        else acc.l += 1;
      } else if (String(r.awayId) === String(myTeamId)) {
        if (r.awayScore > r.homeScore) acc.w += 1;
        else acc.l += 1;
      }
      return acc;
    }, { w: 0, l: 0 });
  }, [loopResults, myTeamId]);

  const loopTodayFixture = useMemo(() => {
    if (!loopState?.date) return null;
    return loopSchedule.find((f) => f.date === loopState.date && !f.played) || null;
  }, [loopSchedule, loopState]);

  const loopNextFixture = useMemo(() => {
    if (!loopState?.date) return null;
    const today = parseIsoDate(loopState.date);
    return loopSchedule.find((f) => !f.played && parseIsoDate(f.date) >= today) || null;
  }, [loopSchedule, loopState]);

  const matchFixtureOptions = useMemo(() => {
    if (!myTeamId) return [];
    return loopSchedule
      .filter((f) => String(f.homeId) === String(myTeamId) || String(f.awayId) === String(myTeamId))
      .sort((a, b) => parseIsoDate(a.date) - parseIsoDate(b.date));
  }, [loopSchedule, myTeamId]);

  const activeMatchFixture = useMemo(() => {
    if (matchFixtureId) {
      return matchFixtureOptions.find((f) => f.id === matchFixtureId) || null;
    }
    return loopTodayFixture || loopNextFixture || matchFixtureOptions[0] || null;
  }, [matchFixtureId, matchFixtureOptions, loopTodayFixture, loopNextFixture]);

  useEffect(() => {
    if (!matchFixtureId && activeMatchFixture) {
      setMatchFixtureId(activeMatchFixture.id);
    }
  }, [matchFixtureId, activeMatchFixture]);

  useEffect(() => {
    if (!activeMatchFixture || !myTeamId) return;
    const side = String(activeMatchFixture.homeId) === String(myTeamId) ? "home" : "away";
    setMatchActionTeam(side);
  }, [activeMatchFixture, myTeamId]);

  const loopLastResult = useMemo(() => {
    if (!myTeamId) return null;
    const list = loopResults.filter((r) => String(r.homeId) === String(myTeamId) || String(r.awayId) === String(myTeamId));
    return list.length ? list[list.length - 1] : null;
  }, [loopResults, myTeamId]);

  const teamStrengthMap = useMemo(() => {
    const map = {};
    teams.forEach((team) => {
      const profile = calcTeamProfile(team.id) || {};
      map[team.id] = safeNum(profile.strength) || safeNum((profile.offense + profile.defense) / 2) || 50;
    });
    return map;
  }, [teams, calcTeamProfile]);

  const computeStandingsFromFixtures = useCallback(
    (fixtures, cutoffDate = null, standingsTeams = teams) => {
      const base = {};
      standingsTeams.forEach((t) => {
        base[t.id] = {
          id: t.id,
          name: t.name,
          w: 0,
          l: 0,
          pf: 0,
          pa: 0,
          strength: teamStrengthMap[t.id] || 50,
        };
      });
      fixtures.forEach((fixture) => {
        if (cutoffDate && parseIsoDate(fixture.date) >= cutoffDate) return;
        if (!fixture.result) return;
        const home = base[fixture.homeId];
        const away = base[fixture.awayId];
        if (!home || !away) return;
        home.pf += fixture.result.homeScore;
        home.pa += fixture.result.awayScore;
        away.pf += fixture.result.awayScore;
        away.pa += fixture.result.homeScore;
        if (fixture.result.homeScore > fixture.result.awayScore) {
          home.w += 1;
          away.l += 1;
        } else {
          away.w += 1;
          home.l += 1;
        }
      });
      const list = Object.values(base).map((row) => ({
        ...row,
        diff: row.pf - row.pa,
        pct: row.w + row.l > 0 ? Number((row.w / (row.w + row.l)).toFixed(3)) : 0,
      }));
      const hasGames = list.some((row) => row.w + row.l > 0);
      return list.sort((a, b) => {
        if (b.w !== a.w) return b.w - a.w;
        if (b.diff !== a.diff) return b.diff - a.diff;
        if (hasGames) return (b.strength || 0) - (a.strength || 0);
        return (b.strength || 0) - (a.strength || 0);
      });
    },
    [teams, teamStrengthMap],
  );

  const buildLeagueRoundsForTeams = useCallback(
    (leagueTeams) => {
      if (!leagueTeams.length) return [];
      const teamIds = leagueTeams.map((t) => t.id);
      const rounds = buildRoundRobinSchedule(teamIds);
      const seasonStart = parseIsoDate(LOOP_DEFAULT_START);
      const loopMap = new Map();
      loopSchedule.forEach((fixture) => {
        loopMap.set(`${fixture.homeId}-${fixture.awayId}`, fixture);
      });
      const resultMap = new Map();
      loopResults.forEach((result) => {
        resultMap.set(`${result.homeId}-${result.awayId}-${result.date}`, result);
        resultMap.set(`${result.homeId}-${result.awayId}`, result);
      });
      return rounds.map((fixtures, roundIndex) => {
        const weekStart = startOfWeek(addDays(seasonStart, roundIndex * 7));
        const roundDate = formatLocalDate(addDays(weekStart, 5));
        const enriched = fixtures.map((fixture, idx) => {
          const baseDate = formatLocalDate(addDays(weekStart, 4 + (idx % 3)));
          const loopFixture = loopMap.get(`${fixture.homeId}-${fixture.awayId}`);
          const date = loopFixture?.date || baseDate;
          const key = `${fixture.homeId}-${fixture.awayId}-${date}`;
          const result = resultMap.get(key) || resultMap.get(`${fixture.homeId}-${fixture.awayId}`) || null;
          const played = Boolean(loopFixture?.played || result);
          return {
            id: `${roundIndex + 1}-${fixture.homeId}-${fixture.awayId}`,
            round: roundIndex + 1,
            date,
            homeId: fixture.homeId,
            awayId: fixture.awayId,
            played,
            result,
          };
        });
        return { round: roundIndex + 1, date: roundDate, fixtures: enriched };
      });
    },
    [loopSchedule, loopResults, loopState?.date],
  );

  const leagueRoundsById = useMemo(() => {
    const map = {};
    Object.entries(enabledTeamsByLeague).forEach(([leagueId, leagueTeams]) => {
      map[leagueId] = buildLeagueRoundsForTeams(leagueTeams || []);
    });
    return map;
  }, [enabledTeamsByLeague, buildLeagueRoundsForTeams]);

  const competitionRounds = useMemo(
    () => leagueRoundsById[activeLeagueId] || [],
    [leagueRoundsById, activeLeagueId],
  );

  const leagueFixtures = useMemo(
    () =>
      competitionRounds.flatMap((round) =>
        round.fixtures.map((fixture) => ({ ...fixture, competition: "liga" })),
      ),
    [competitionRounds],
  );

  const leagueFixturesById = useMemo(() => {
    const map = {};
    Object.entries(leagueRoundsById).forEach(([leagueId, rounds]) => {
      map[leagueId] = rounds.flatMap((round) =>
        round.fixtures.map((fixture) => ({ ...fixture, competition: "liga" })),
      );
    });
    return map;
  }, [leagueRoundsById]);

  const acbLeagueFixtures = leagueFixturesById.ACB || [];
  const febLeagueFixtures = leagueFixturesById.FEB || [];

  const leagueFixturesByDate = useMemo(() => {
    const map = {};
    leagueFixtures.forEach((fixture) => {
      if (!map[fixture.date]) map[fixture.date] = [];
      map[fixture.date].push(fixture);
    });
    return map;
  }, [leagueFixtures]);

  const competitionCupFixtures = useMemo(() => {
    if (activeLeagueId !== "ACB") return [];
    const seasonDates = activeLeagueConfig?.rules?.season_dates_2025_26 || {};
    const dates = expandDateRange(seasonDates.copa_del_rey);
    if (!dates.length) return [];
    const cutoff = parseIsoDate(dates[0]);
    let standings = computeStandingsFromFixtures(leagueFixtures, cutoff, activeLeagueTeams);
    const selected = standings.slice(0, 8).map((row) => row.id);
    if (selected.length < 8) {
      const remaining = activeLeagueTeams
        .map((t) => t.id)
        .filter((id) => !selected.includes(id))
        .sort((a, b) => (teamStrengthMap[b] || 0) - (teamStrengthMap[a] || 0));
      selected.push(...remaining.slice(0, 8 - selected.length));
    }
    if (selected.length < 8) return [];

    const seeds = selected;
    const qfDates = dates.slice(0, 2);
    const sfDate = dates[2];
    const finalDate = dates[3];
    const qfFixtures = [
      { seed: "A", homeId: seeds[0], awayId: seeds[7], date: qfDates[0] },
      { seed: "B", homeId: seeds[1], awayId: seeds[6], date: qfDates[0] },
      { seed: "C", homeId: seeds[2], awayId: seeds[5], date: qfDates[1] },
      { seed: "D", homeId: seeds[3], awayId: seeds[4], date: qfDates[1] },
    ];
    const qfResults = {};
    const fixtures = [];
    qfFixtures.forEach((fixture) => {
      const result = null;
      fixtures.push({
        id: `copa-qf-${fixture.seed}`,
        competition: "copa",
        stage: "Cuartos",
        date: fixture.date,
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        result,
        played: false,
      });
    });

    const sfAHome = qfResults.A;
    const sfAAway = qfResults.D;
    const sfBHome = qfResults.B;
    const sfBAway = qfResults.C;
    const sfFixtures = [
      { seed: "SF1", homeId: sfAHome, awayId: sfAAway },
      { seed: "SF2", homeId: sfBHome, awayId: sfBAway },
    ];
    const sfResults = {};
    sfFixtures.forEach((fixture, idx) => {
      const date = sfDate || qfDates[qfDates.length - 1];
      const result = null;
      fixtures.push({
        id: `copa-sf-${fixture.seed}`,
        competition: "copa",
        stage: "Semifinales",
        date,
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        result,
        played: false,
      });
    });

    const finalHome = sfResults.SF1;
    const finalAway = sfResults.SF2;
    const finalDateValue = finalDate || sfDate || qfDates[qfDates.length - 1];
    const finalResult = null;
    fixtures.push({
      id: "copa-final",
      competition: "copa",
      stage: "Final",
      date: finalDateValue,
      homeId: finalHome,
      awayId: finalAway,
      result: finalResult,
      played: false,
    });

    return fixtures;
  }, [
    activeLeagueConfig,
    activeLeagueId,
    activeLeagueTeams,
    computeStandingsFromFixtures,
    leagueFixtures,
    loopState?.date,
    teamStrengthMap,
  ]);

  const competitionSupercopaFixtures = useMemo(() => {
    if (activeLeagueId !== "ACB") return [];
    const seasonDates = activeLeagueConfig?.rules?.season_dates_2025_26 || {};
    const dates = expandDateRange(seasonDates.supercopa);
    if (!dates.length) return [];
    const ranked = [...activeLeagueTeams]
      .map((t) => ({ id: t.id, strength: teamStrengthMap[t.id] || 50 }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 4)
      .map((t) => t.id);
    if (ranked.length < 4) return [];
    const semisDate = dates[0];
    const finalDate = dates[1] || dates[0];
    const semis = [
      { seed: "SF1", homeId: ranked[0], awayId: ranked[3] },
      { seed: "SF2", homeId: ranked[1], awayId: ranked[2] },
    ];
    const fixtures = [];
    const winners = {};
    semis.forEach((fixture) => {
      const result = null;
      fixtures.push({
        id: `supercopa-sf-${fixture.seed}`,
        competition: "supercopa",
        stage: "Semifinales",
        date: semisDate,
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        result,
        played: false,
      });
    });
    const finalHome = winners.SF1;
    const finalAway = winners.SF2;
    const finalResult = null;
    fixtures.push({
      id: "supercopa-final",
      competition: "supercopa",
      stage: "Final",
      date: finalDate,
      homeId: finalHome,
      awayId: finalAway,
      result: finalResult,
      played: false,
    });
    return fixtures;
  }, [activeLeagueConfig, activeLeagueId, activeLeagueTeams, loopState?.date, teamStrengthMap]);

  const febPromotionPlayoff = useMemo(() => {
    const snapshot = competitionSnapshots.FEB;
    if (!snapshot) {
      return { fixtures: [], directPromotionId: null, playoffWinnerId: null, playoffTeams: [] };
    }
    const standings = snapshot.standings || [];
    if (!standings.length) {
      return { fixtures: [], directPromotionId: null, playoffWinnerId: null, playoffTeams: [] };
    }
    const directPromotionId = standings[0]?.id || null;
    const playoffTeams = standings.slice(1, 1 + FEB_PLAYOFF_TEAMS).map((row) => row.id);
    const matches = snapshot.cup_brackets?.playoff?.matches || [];
    const fixtures = matches.map((match, idx) => ({
      id: match.id || `ascenso-${idx}`,
      competition: "ascenso",
      stage: match.round || match.stage || "Playoff",
      date: match.date,
      homeId: match.home,
      awayId: match.away,
      result: match.result || null,
      played: Boolean(match.played),
    }));
    return {
      fixtures,
      directPromotionId,
      playoffWinnerId: null,
      playoffTeams,
    };
  }, [competitionSnapshots]);

  const promotionPlayoffFixtures = useMemo(
    () => (activeLeagueId === "FEB" ? febPromotionPlayoff.fixtures : []),
    [activeLeagueId, febPromotionPlayoff],
  );

  const competitionFixturesByDate = useMemo(() => {
    const map = { ...leagueFixturesByDate };
    const addFixture = (fixture) => {
      if (!fixture?.date) return;
      if (!map[fixture.date]) map[fixture.date] = [];
      map[fixture.date].push(fixture);
    };
    competitionCupFixtures.forEach(addFixture);
    competitionSupercopaFixtures.forEach(addFixture);
    promotionPlayoffFixtures.forEach(addFixture);
    return map;
  }, [leagueFixturesByDate, competitionCupFixtures, competitionSupercopaFixtures, promotionPlayoffFixtures]);

  const competitionStandings = useMemo(() => {
    if (!activeLeagueTeams.length) return [];
    return computeStandingsFromFixtures(leagueFixtures, null, activeLeagueTeams);
  }, [activeLeagueTeams, computeStandingsFromFixtures, leagueFixtures]);

  const competitionSnapshot = competitionSnapshots[activeLeagueId];
  const competitionViewRounds = competitionSnapshot?.rounds || [];
  const competitionViewFixturesByDate = competitionSnapshot?.fixtures_by_date || {};
  const competitionViewStandings = competitionSnapshot?.standings || [];
  const competitionViewCupBrackets = competitionSnapshot?.cup_brackets || {};

  const acbStandings = useMemo(
    () => competitionSnapshots.ACB?.standings || [],
    [competitionSnapshots],
  );

  const febStandings = useMemo(
    () => competitionSnapshots.FEB?.standings || [],
    [competitionSnapshots],
  );

  const espSeasonKey = useMemo(() => {
    const acbEdition = getLeagueConfig("ACB")?.rules?.edition || "current";
    const febEdition = getLeagueConfig("FEB")?.rules?.edition || acbEdition;
    return `ESP-${acbEdition}-${febEdition}`;
  }, [rulesVersion]);

  const acbSeasonDates = getLeagueConfig("ACB")?.rules?.season_dates_2025_26 || {};
  const febSeasonDates = getLeagueConfig("FEB")?.rules?.season_dates_2025_26 || {};
  const currentSeasonDate = loopState?.date ? parseIsoDate(loopState.date) : new Date();
  const acbSeasonEndDate = acbSeasonDates.playoff_end || acbSeasonDates.regular_season_end;
  const febSeasonEndDate = febSeasonDates.playoff_end || febSeasonDates.regular_season_end;
  const acbFixtures = useMemo(
    () => (competitionSnapshots.ACB?.fixtures_by_date
      ? Object.values(competitionSnapshots.ACB.fixtures_by_date).flat()
      : []),
    [competitionSnapshots],
  );
  const febFixtures = useMemo(
    () => (competitionSnapshots.FEB?.fixtures_by_date
      ? Object.values(competitionSnapshots.FEB.fixtures_by_date).flat()
      : []),
    [competitionSnapshots],
  );
  const acbSeasonOver = acbSeasonEndDate
    ? parseIsoDate(acbSeasonEndDate) < currentSeasonDate
    : (acbFixtures.length ? acbFixtures.every((f) => f.played) : false);
  const febSeasonOver = febSeasonEndDate
    ? parseIsoDate(febSeasonEndDate) < currentSeasonDate
    : (febFixtures.length ? febFixtures.every((f) => f.played) : false);

  useEffect(() => {
    if (!teams.length) return;
    if (seasonTransitions[espSeasonKey]) return;
    if (!acbSeasonOver || !febSeasonOver) return;
    if (!acbStandings.length || !febStandings.length) return;

    const relegated = acbStandings.slice(-ACB_RELEGATION_COUNT).map((row) => row.id);
    const promoted = [];
    if (febPromotionPlayoff.directPromotionId) promoted.push(febPromotionPlayoff.directPromotionId);
    if (febPromotionPlayoff.playoffWinnerId) promoted.push(febPromotionPlayoff.playoffWinnerId);
    const uniquePromoted = Array.from(new Set(promoted)).slice(0, FEB_PROMOTION_COUNT);
    if (!uniquePromoted.length && !relegated.length) return;

    const patches = {};
    relegated.forEach((id) => {
      patches[String(id)] = buildLeaguePatch("FEB");
    });
    uniquePromoted.forEach((id) => {
      patches[String(id)] = buildLeaguePatch("ACB");
    });

    setTeams((prev) =>
      prev.map((team) => {
        const patch = patches[String(team.id)];
        if (!patch) return team;
        return { ...team, data: { ...(team.data || {}), ...patch } };
      }),
    );
    persistTeamOverrides(patches);

    const transitionData = {
      date: loopState?.date || "",
      promoted: uniquePromoted,
      relegated,
      directPromotion: febPromotionPlayoff.directPromotionId,
      playoffWinner: febPromotionPlayoff.playoffWinnerId,
    };
    setSeasonTransitions((prev) => ({ ...prev, [espSeasonKey]: transitionData }));
    show({ event: "season.transition", ...transitionData });

    if (myTeamId && patches[String(myTeamId)]) {
      const nextLeagueId = patches[String(myTeamId)].league_id;
      const nextStart = computeNextSeasonStart(currentSeasonDate);
      setLoopResults([]);
      setLoopSchedule([]);
      setLoopState({ date: nextStart, phase: 0 });
      setCompetitionLeagueId(nextLeagueId);
      loopInitRef.current = "";
    }
  }, [
    acbSeasonOver,
    acbStandings,
    buildLeaguePatch,
    espSeasonKey,
    febSeasonOver,
    febPromotionPlayoff,
    febStandings,
    loopState?.date,
    myTeamId,
    persistTeamOverrides,
    seasonTransitions,
    teams,
  ]);

  useEffect(() => {
    if (!competitionViewRounds.length) return;
    if (competitionRound != null) return;
    const currentDate = loopState?.date ? parseIsoDate(loopState.date) : new Date();
    const current = competitionViewRounds.find((round) => parseIsoDate(round.date) >= currentDate);
    setCompetitionRound(current?.round || 1);
  }, [competitionViewRounds, competitionRound, loopState?.date]);

  useEffect(() => {
    if (!activeLeagueTeams.length) return;
    const selectedOk =
      competitionCalendarTeamId && activeLeagueTeamIds.has(String(competitionCalendarTeamId));
    if (selectedOk) return;
    const fallback =
      activeLeagueTeams.find((t) => String(t.id) !== String(myTeamId)) || activeLeagueTeams[0];
    if (fallback) {
      setCompetitionCalendarTeamId(String(fallback.id));
    }
  }, [activeLeagueTeams, activeLeagueTeamIds, myTeamId, competitionCalendarTeamId]);

  useEffect(() => {
    if (competitionCalendarFilter !== "my") return;
    if (!myTeamId) return;
    if (!activeLeagueTeamIds.has(String(myTeamId))) {
      setCompetitionCalendarFilter("all");
    }
  }, [competitionCalendarFilter, activeLeagueTeamIds, myTeamId]);

  const openSimulateModal = () => {
    const fallbackDate = loopNextFixture?.date || loopState?.date || "";
    setSimulateTargetDate(fallbackDate);
    setSimulateError("");
    setSimulateStatus("");
    setShowSimulateModal(true);
  };

  const closeSimulateModal = () => {
    if (isSimulating) return;
    setShowSimulateModal(false);
  };

  const stopSimulation = useCallback((reason) => {
    setIsSimulating(false);
    if (reason) setSimulateStatus(reason);
    setAdvanceStep("");
    setAdvanceStepMs(0);
  }, []);

  const startSimulation = () => {
    if (!simulateTargetDate) {
      setSimulateError("Selecciona una fecha objetivo.");
      return;
    }
    const current = loopStateRef.current?.date;
    if (!current) {
      setSimulateError("No hay fecha activa para simular.");
      return;
    }
    const target = parseIsoDate(simulateTargetDate);
    const currentDate = parseIsoDate(current);
    if (Number.isNaN(target.getTime())) {
      setSimulateError("Fecha inválida.");
      return;
    }
    if (target <= currentDate) {
      setSimulateError("La fecha objetivo debe ser posterior al día actual.");
      return;
    }
    setSimulateError("");
    setSimulateStatus("");
    setIsSimulating(true);
  };

  const switchLoadView = (viewId) => {
    const view = loadViews.find((v) => v.id === viewId);
    if (view) {
      setLoadActiveViewId(viewId);
      setLoadVisibleColumns(view.columns);
    }
  };

  const handleLoadSort = (key) => {
    setLoadSortConfig((prev) => {
      const existing = prev.find((s) => s.key === key);
      if (existing) {
        return [{ key, direction: existing.direction === "asc" ? "desc" : "asc" }];
      }
      return [{ key, direction: "desc" }];
    });
  };

  const handleLoadResizeMove = useCallback((e) => {
    if (!loadResizingRef.current) return;
    const delta = e.clientX - loadResizingRef.current.startX;
    setLoadColWidths((prev) => ({
      ...prev,
      [loadResizingRef.current.key]: Math.max(40, loadResizingRef.current.startWidth + delta),
    }));
  }, []);

  const handleLoadResizeEnd = useCallback(() => {
    loadResizingRef.current = null;
    window.removeEventListener("mousemove", handleLoadResizeMove);
    window.removeEventListener("mouseup", handleLoadResizeEnd);
  }, [handleLoadResizeMove]);

  const handleLoadResizeStart = (colKey, e) => {
    e.preventDefault();
    loadResizingRef.current = {
      key: colKey,
      startX: e.clientX,
      startWidth: loadColWidths[colKey] || LOAD_COLUMNS_DEF[colKey].defaultWidth,
    };
    window.addEventListener("mousemove", handleLoadResizeMove);
    window.addEventListener("mouseup", handleLoadResizeEnd);
  };

  const getTrainingSessionsForDate = useCallback((dateStr) => {
    const saved = trainingSavedSessions.filter((s) => s.date === dateStr);
    if (saved.length) return saved;
    const weekStart = startOfWeek(parseIsoDate(dateStr));
    const weekKey = `pcbasket.training.week.${myTeamId}.${formatLocalDate(weekStart)}`;
    const stored = loadStored(weekKey, null);
    if (stored && Array.isArray(stored.plan)) {
      const dayIndex = Math.round((parseIsoDate(dateStr) - weekStart) / (24 * 3600 * 1000));
      if (dayIndex >= 0 && dayIndex < stored.plan.length) {
        return stored.plan[dayIndex]?.sessions || [];
      }
    }
    return [];
  }, [trainingSavedSessions, myTeamId]);

  const applyDailyTrainingEffects = useCallback(async (dateStr) => { 
    const sessions = getTrainingSessionsForDate(dateStr); 
    let totalLoad = 0;
    let maxRpe = 0;
    const totals = {
      attributes: 0,
      cohesion: 0,
      tactical: 0,
      fitness: 0,
      morale: 0,
      prep: 0,
    };

    sessions.forEach((session) => {
      const load = trainingDuration(session.startTime, session.endTime) * (TRAINING_RPE[session.intensity] || 0);
      totalLoad += load;
      maxRpe = Math.max(maxRpe, TRAINING_RPE[session.intensity] || 0);
      const eff = session.effects || computeTrainingEffects(session);
      totals.attributes += eff.attributes;
      totals.cohesion += eff.cohesion;
      totals.tactical += eff.tactical;
      totals.fitness += eff.fitness;
      totals.morale += eff.morale;
      totals.prep += eff.prep;
    });

    const loadScore = Math.min(100, totalLoad / 30);
    const restBonus = sessions.length === 0 ? 6 : 0;

    let updatedTeamState = null; 
    setLoopTeamState((prev) => {
      const recoveryBonus = prev.recovery * 0.08;
      const fatigue = clamp(prev.fatigue + loadScore * 0.9 - recoveryBonus - restBonus);
      const morale = clamp(prev.morale + totals.morale * 1.2 + (sessions.length ? 0 : 0.5));
      const cohesion = clamp(prev.cohesion + totals.cohesion * 1.4);
      const tactical = clamp(prev.tactical + totals.tactical * 1.4);
      const fitness = clamp(prev.fitness + totals.fitness * 1.6);
      const recovery = clamp(prev.recovery + totals.fitness * 0.6 + (sessions.length ? 0 : 1.5) - 0.4);
      const prep = clamp(prev.prep + totals.prep * 1.5 - 1);
      updatedTeamState = {
        ...prev,
        fatigue,
        morale,
        cohesion,
        tactical,
        fitness,
        recovery,
        prep,
      };
      loopTeamStateRef.current = updatedTeamState;
      return updatedTeamState;
    });
    return {  
      summary: {  
        sessions: sessions.length,  
        load: Math.round(loadScore),  
        rest_day: sessions.length === 0,  
        maxRpe,  
      },  
      teamState: updatedTeamState,  
    };  
  }, [getTrainingSessionsForDate, myTeamId]);  
 
  const handleAdvanceLoopPhase = async () => {  
    if (!loopState?.date) return; 
    if (advanceInFlightRef.current) return; 
    advanceInFlightRef.current = true; 
    setIsAdvancingDay(true); 
    try { 
      const ok = await advanceLoopDay(); 
      if (ok === false || ok === "pending") { 
        return; 
      } 
    } finally { 
      setIsAdvancingDay(false); 
      advanceInFlightRef.current = false; 
      clearAdvanceStep();
    } 
  }; 

  const handleSimulateMatch = async (fixture) => {
    if (!fixture || fixture.played) return true;
    const isHomeMyTeam = String(fixture.homeId) === String(myTeamId);
    const isAwayMyTeam = String(fixture.awayId) === String(myTeamId);
    let result = null;

    if (!window.pcbasket) {
      alert("Simulación no disponible: backend no conectado.");
      return false;
    }

    try {
      const playbook = MATCH_PLAYBOOKS.find((pb) => pb.id === matchSelectedPlaybookId) || MATCH_PLAYBOOKS[0];
      const rotationPayload =
        (isHomeMyTeam || isAwayMyTeam) && rotationPlayers.length
          ? {
              players: rotationPlayers.map((p) => ({
                playerId: p.id,
                periods: Array.isArray(p.periods) ? p.periods.slice() : [],
                totalMinutes: (p.periods || []).reduce((sum, val) => sum + Number(val || 0), 0),
              })),
            }
          : null;

      const res = await window.pcbasket.invoke("match.simulate", {
        home_team_id: fixture.homeId,
        away_team_id: fixture.awayId,
        fixture_id: fixture.id,
        ruleset: matchRules.ruleset,
        stream: false,
        save: true,
        apply_post_match: true,
        rotation_home: isHomeMyTeam ? rotationPayload : undefined,
        rotation_away: isAwayMyTeam ? rotationPayload : undefined,
        playbook_home: isHomeMyTeam && playbook ? { primaryFocus: playbook.focus, primaryType: playbook.type } : undefined,
        playbook_away: isAwayMyTeam && playbook ? { primaryFocus: playbook.focus, primaryType: playbook.type } : undefined,
        tactics_home: buildTacticsPayload(fixture.homeId, isHomeMyTeam),
        tactics_away: buildTacticsPayload(fixture.awayId, isAwayMyTeam),
        tactics_team_id: (isHomeMyTeam || isAwayMyTeam) ? myTeamId : undefined,
        current_date: fixture.date,
      });
      const payload = res?.result?.score ? res?.result : res?.result || res;
      const score = payload?.score;
      if (score) {
        result = {
          id: `${fixture.id}-${Date.now()}`,
          fixtureId: fixture.id,
          date: fixture.date,
          homeId: fixture.homeId,
          awayId: fixture.awayId,
          homeScore: Number(score.home || 0),
          awayScore: Number(score.away || 0),
        };
      }
    } catch (err) {
      console.error("Error simulating match:", err);
      alert(`Error al simular el partido: ${String(err)}`);
    }

    if (!result) {
      alert("Engine no disponible: no se pudo simular el partido.");
      return false;
    }

    lastMatchResultRef.current = result;
    setLoopResults((prev) => [...prev, result]);
    setLoopSchedule((prev) =>
      prev.map((f) => (f.id === fixture.id ? { ...f, played: true, resultId: result.id } : f)),
    );
    if (competitionLeagueId) {
      loadCompetitionSnapshot(competitionLeagueId);
    }
    if (window.pcbasket) {
      loadPlayers(myTeamId);
      loadTeams();
      loadHubSnapshot(myTeamId);
    }

    const isHome = String(result.homeId) === String(myTeamId);
    const won = isHome ? result.homeScore > result.awayScore : result.awayScore > result.homeScore;
    setLoopTeamState((prev) => {
      const updated = {
        ...prev,
        morale: clamp(prev.morale + (won ? 4 : -4)),
        cohesion: clamp(prev.cohesion + (won ? 1 : -1)),
        fatigue: clamp(prev.fatigue + 10),
        prep: clamp(prev.prep - 8),
      };
      loopTeamStateRef.current = updated;
      return updated;
    });
    return true;
  };

  const beginAdvanceStep = useCallback((step) => {
    setAdvanceStep(String(step || ""));
    setAdvanceStepMs(Date.now());
  }, []);

  const clearAdvanceStep = useCallback(() => {
    setAdvanceStep("");
    setAdvanceStepMs(0);
  }, []);

  const advanceLoopDay = useCallback(async (options = {}) => { 
    const state = loopStateRef.current; 
    if (!state?.date) return; 
    if (advanceLoopDayInFlightRef.current) return "pending";
    advanceLoopDayInFlightRef.current = true;

    try {
    const decision = options?.decision; 
    if (!decision && matchDecisionOpen) return "pending"; 
    beginAdvanceStep("Entrenamiento");
    const trainingOutcome = await applyDailyTrainingEffects(state.date); 
    const trainingSummary = trainingOutcome?.summary || trainingOutcome; 
    beginAdvanceStep("Preparando día (mundo)");
    const prep = await prepareWorldDay(state.date, trainingSummary); 
    if (!prep?.ok) { 
      console.error("World prepare failed:", prep); 
      return false; 
    } 
    if (prep?.training?.injuries?.length) { 
      await loadPlayers(myTeamId); 
      await loadHubSnapshot(myTeamId); 
    } 
    const fixture = loopScheduleRef.current.find((f) => f.date === state.date && !f.played); 
    let matchSummary = null; 
    const marketSummary = prep?.market || { resolved: 0 }; 
    if (fixture) { 
      if (!decision) { 
        if (!matchDecisionOpen) { 
          openMatchDecision(fixture); 
        } 
        return "pending"; 
      } 
      let simulateMatch = decision !== "play"; 
      if (decision === "play") { 
        beginAdvanceStep("Preparando partido");
        setSection("Tacticas"); 
        setTacticsView("match"); 
        closeMatchDecision(); 
        pendingAdvanceAfterMatchRef.current = { 
          date: state.date, 
          trainingSummary, 
          marketSummary, 
        }; 
        const started = await startMatchSimulation(fixture); 
        if (started) { 
          return "pending"; 
        } 
        pendingAdvanceAfterMatchRef.current = null; 
        simulateMatch = true; 
      } 
      if (simulateMatch) { 
        beginAdvanceStep("Simulando partido");
        const ok = await handleSimulateMatch(fixture); 
        if (!ok) return false; 
        const lastResult = lastMatchResultRef.current; 
        if (lastResult && lastResult.date === state.date) { 
          matchSummary = lastResult; 
        } 
      } 
    } 
    const summary = buildDailySummary(state.date, trainingSummary, matchSummary, marketSummary); 
    beginAdvanceStep("Finalizando día");
    const fin = await finalizeWorldDay(state.date, summary); 
    const myTeam = teams.find((t) => String(t.id) === String(myTeamId)) || null; 
    const leagueId = myTeam ? getTeamLeagueId(myTeam) : competitionLeagueId; 
    beginAdvanceStep("Actualizando datos");
    await applyWorldAdvanceResult(leagueId, fin); 
    clearAdvanceStep();
    return true; 
    } finally {
      advanceLoopDayInFlightRef.current = false;
    }
  }, [ 
    applyDailyTrainingEffects, 
    applyWorldAdvanceResult, 
    beginAdvanceStep,
    competitionLeagueId, 
    clearAdvanceStep,
    finalizeWorldDay, 
    handleSimulateMatch, 
    loadHubSnapshot, 
    loadPlayers, 
    myTeamId, 
    buildDailySummary, 
    matchDecisionOpen, 
    openMatchDecision, 
    closeMatchDecision, 
    startMatchSimulation, 
    prepareWorldDay, 
    setSection, 
    setTacticsView, 
    teams, 
  ]); 

  const handleMatchDecision = useCallback(
    async (choice) => {
      if (!matchDecisionFixture) {
        setMatchDecisionOpen(false);
        return;
      }
      if (choice === "play") {
        setMatchDecisionOpen(false);
        await advanceLoopDay({ decision: "play" });
        return;
      }
      setMatchDecisionOpen(false);
      await advanceLoopDay({ decision: "simulate" });
    },
    [advanceLoopDay, matchDecisionFixture],
  );

  useEffect(() => {
    if (!isSimulating) return undefined;
    const speedMs = simulateSpeed === "fast" ? 140 : simulateSpeed === "slow" ? 650 : 320;
    const timer = window.setTimeout(() => {
      const state = loopStateRef.current;
      if (!state?.date) {
        stopSimulation("Simulación detenida: fecha inválida.");
        return;
      }
      const target = parseIsoDate(simulateTargetDate);
      const currentDate = parseIsoDate(state.date);
      if (Number.isNaN(target.getTime())) {
        stopSimulation("Simulación detenida: fecha inválida.");
        return;
      }
      if (currentDate >= target) {
        stopSimulation("Simulación completada.");
        return;
      }

      const fixture = loopScheduleRef.current.find((f) => f.date === state.date && !f.played);
      if (simulateStopOnMatch && fixture) {
        stopSimulation("Simulación pausada: hay partido hoy.");
        return;
      }

      const teamState = loopTeamStateRef.current;
      const hasInjuryAlert = (injuryListRef.current || []).length > 0;
      const hasCriticalAlert =
        teamState.morale < 40 || teamState.fatigue > 80 || hasInjuryAlert;
      if (simulateStopOnAlerts && hasCriticalAlert) {
        stopSimulation("Simulación pausada: alerta crítica en plantilla.");
        return;
      }

      void advanceLoopDay().then((ok) => {
        if (ok === false) {
          stopSimulation("Simulación detenida: partido sin resultado.");
        }
      });
    }, speedMs);
    return () => window.clearTimeout(timer);
  }, [
    isSimulating,
    simulateTargetDate,
    simulateSpeed,
    simulateStopOnMatch,
    simulateStopOnAlerts,
    advanceLoopDay,
    stopSimulation,
  ]);

  const generateTrainingSchedule = useCallback(
    (context, weekStart) => {
      return Array.from({ length: 7 }, (_, i) => {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        const dayName = WEEKDAY_LABELS[dayDate.getDay()] || "Lunes";
        const sessions = [];
        if (dayName === "Lunes") {
          sessions.push({
            id: crypto?.randomUUID?.() || `${Date.now()}-${i}-1`,
            type: "Fisico: Resistencia",
            startTime: "10:00",
            endTime: "11:30",
            intensity: "Alta",
            focus: "Capacidad Aerobica",
          });
        } else if (dayName === "Martes" && context !== "Doble Partido") {
          sessions.push({
            id: crypto?.randomUUID?.() || `${Date.now()}-${i}-2`,
            type: "Tactica Ofensiva (5v5)",
            startTime: "10:00",
            endTime: "12:00",
            intensity: "Media",
            focus: "Toma de Decisiones",
          });
          sessions.push({
            id: crypto?.randomUUID?.() || `${Date.now()}-${i}-3`,
            type: "Tiro & Mecanica",
            startTime: "18:00",
            endTime: "19:00",
            intensity: "Baja",
            focus: "Volumen de Tiro",
          });
        } else if (dayName === "Miercoles") {
          sessions.push({
            id: crypto?.randomUUID?.() || `${Date.now()}-${i}-4`,
            type: "Recuperacion Activa",
            startTime: "10:00",
            endTime: "11:00",
            intensity: "Muy Baja",
            focus: "Movilidad Articular",
          });
        } else if (dayName === "Jueves") {
          sessions.push({
            id: crypto?.randomUUID?.() || `${Date.now()}-${i}-5`,
            type: "Defensa: Rotaciones",
            startTime: "11:00",
            endTime: "12:30",
            intensity: "Media",
            focus: "Ayudas y Recuperacion",
          });
        } else if (dayName === "Viernes" && context !== "Doble Partido") {
          sessions.push({
            id: crypto?.randomUUID?.() || `${Date.now()}-${i}-6`,
            type: "Shootaround",
            startTime: "10:00",
            endTime: "11:00",
            intensity: "Baja",
            focus: "Activacion",
          });
        } else if (dayName === "Sabado") {
          sessions.push({
            id: crypto?.randomUUID?.() || `${Date.now()}-${i}-7`,
            type: "Scouting Rival (Video)",
            startTime: "11:00",
            endTime: "12:30",
            intensity: "Muy Baja",
            focus: "Puntos Debiles Rival",
          });
        }
        return {
          dayName,
          date: dayDate.getDate(),
          isMatch: false,
          sessions: sessions.slice(0, MAX_TRAINING_SESSIONS_PER_DAY).map(withTrainingEffects),
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (!myTeamId) return;
    const key = `pcbasket.training.sessions.${myTeamId}`;
    const stored = loadStored(key, []);
    setTrainingSavedSessions(Array.isArray(stored) ? stored : []);
  }, [myTeamId]);

  useEffect(() => {
    if (!myTeamId) return;
    const key = `pcbasket.calendar.notes.${myTeamId}`;
    const stored = loadStored(key, []);
    setTeamCalendarNotes(Array.isArray(stored) ? stored : []);
  }, [myTeamId]);

  useEffect(() => {
    if (calendarNoteDraft.date) return;
    if (!loopState?.date) return;
    setCalendarNoteDraft((prev) => ({ ...prev, date: loopState.date }));
  }, [loopState?.date, calendarNoteDraft.date]);

  useEffect(() => {
    if (!myTeamId) return;
    const weekKey = `pcbasket.training.week.${myTeamId}.${isoDate(trainingWeekStart)}`;
    const saved = loadStored(weekKey, null);
    if (saved && Array.isArray(saved.plan)) {
      setTrainingPlan(stripSessionsOnMatchDays(saved.plan.map(capTrainingSessions), trainingWeekStart));
      setTrainingContext(saved.context || "Regular");
      return;
    }
    if (trainingAutoMode) {
      setTrainingPlan(stripSessionsOnMatchDays(generateTrainingSchedule(trainingContext, trainingWeekStart), trainingWeekStart));
    } else {
      const plan = Array.from({ length: 7 }, (_, i) => {
        const dateObj = new Date(trainingWeekStart.getFullYear(), trainingWeekStart.getMonth(), trainingWeekStart.getDate() + i);
        const dayName = WEEKDAY_LABELS[dateObj.getDay()] || "Lunes";
        return {
          dayName,
          date: dateObj.getDate(),
          isMatch: false,
          sessions: [],
        };
      });
      setTrainingPlan(stripSessionsOnMatchDays(plan, trainingWeekStart));
    }
  }, [myTeamId, trainingWeekStart, trainingAutoMode, trainingContext, generateTrainingSchedule, stripSessionsOnMatchDays]);

  const applyRotationPreset = useCallback(
    (currentPlayers, type) => {
      const totalMinutes = ROTATION_LEAGUE_TOTAL_MINUTES[rotationLeagueType] || 40;
      const periodDuration = rotationRules.duration;
      const periodCount = rotationRules.count;
      const requiredPerPeriod = periodDuration * 5;

      const slotMap = new Map(currentPlayers.map((p) => [p.id, p.slot]));
      const newPlayers = currentPlayers.map((p) => ({
        ...p,
        slot: slotMap.get(p.id) ?? p.slot ?? null,
        periods: Array(periodCount).fill(0),
      }));

      const smallBallBonus = (pos) => (["PG", "SG", "SF"].includes(pos) ? 8 : 0);
      const tallBallBonus = (pos) => (["PF", "C"].includes(pos) ? 8 : 0);
      const hasStarterSlots = newPlayers.some((p) => {
        const slot = Number(p.slot);
        return Number.isFinite(slot) && slot >= 1 && slot <= 5;
      });
      const sortPlayers = () => {
        let list = [...newPlayers];
        if (type === "random") {
          list = list.sort(() => Math.random() - 0.5);
        } else if (type === "dev_youth") {
          list = list.sort((a, b) => (b.isYouth === a.isYouth ? b.rating - a.rating : b.isYouth ? 1 : -1));
        } else if (type === "veterans") {
          list = list.sort((a, b) => (b.age - a.age) || (b.rating - a.rating));
        } else if (type === "defense") {
          list = list.sort((a, b) => b.defense - a.defense);
        } else if (type === "offense") {
          list = list.sort((a, b) => b.offense - a.offense);
        } else if (type === "showcase") {
          list = list.sort((a, b) => a.rating - b.rating);
        } else if (type === "small_ball") {
          list = list.sort((a, b) => (smallBallBonus(b.pos) + b.rating) - (smallBallBonus(a.pos) + a.rating));
        } else if (type === "tall_ball") {
          list = list.sort((a, b) => (tallBallBonus(b.pos) + b.rating) - (tallBallBonus(a.pos) + a.rating));
        } else {
          list = list.sort((a, b) => b.rating - a.rating);
        }

        if (hasStarterSlots) {
          const starters = list
            .filter((p) => {
              const slot = Number(p.slot);
              return Number.isFinite(slot) && slot >= 1 && slot <= 5;
            })
            .sort((a, b) => (Number(a.slot) || 99) - (Number(b.slot) || 99));
          const rest = list.filter((p) => {
            const slot = Number(p.slot);
            return !Number.isFinite(slot) || slot < 1 || slot > 5;
          });
          list = [...starters, ...rest];
        }
        return list;
      };

      const sortedPlayers = sortPlayers();

      const getTargetMinutes = (playerIndex) => {
        const isTop5 = playerIndex < 5;
        const isTop10 = playerIndex < 10;

        switch (type) {
          case "std_10":
            return isTop5 ? Math.round(totalMinutes * 0.675) : (isTop10 ? Math.round(totalMinutes * 0.325) : 0);
          case "std_9":
            return isTop5 ? Math.round(totalMinutes * 0.75) : (playerIndex < 9 ? Math.round(totalMinutes * 0.3125) : 0);
          case "po_8":
            return isTop5 ? Math.round(totalMinutes * 0.825) : (playerIndex < 8 ? Math.round(totalMinutes * 0.29) : 0);
          case "po_7":
            return isTop5 ? Math.round(totalMinutes * 0.9) : (playerIndex < 7 ? Math.round(totalMinutes * 0.25) : 0);
          case "starter_heavy":
            return isTop5 ? Math.round(totalMinutes * 0.9) : (isTop10 ? Math.round(totalMinutes * 0.1) : 0);
          case "load_mgmt":
            return isTop10 ? Math.round(totalMinutes * 0.5) : Math.round(totalMinutes * 0.2);
          case "preseason":
            return isTop5 ? Math.round(totalMinutes * 0.5) : (isTop10 ? Math.round(totalMinutes * 0.35) : Math.round(totalMinutes * 0.15));
          case "bench_mob":
            return isTop5 ? Math.round(totalMinutes * 0.45) : (isTop10 ? Math.round(totalMinutes * 0.55) : 0);
          case "euro":
            return isTop5 ? Math.round(totalMinutes * 0.6) : (isTop10 ? Math.round(totalMinutes * 0.4) : 0);
          case "crisis":
            return playerIndex < 6 ? Math.round(totalMinutes * 0.833) : 0;
          case "garbage":
            return isTop5 ? Math.round(totalMinutes * 0.3) : Math.round(totalMinutes * 0.5);
          default:
            return isTop5 ? Math.round(totalMinutes * 0.675) : (isTop10 ? Math.round(totalMinutes * 0.325) : 0);
        }
      };

      sortedPlayers.forEach((player, idx) => {
        const target = getTargetMinutes(idx);
        const original = newPlayers.find((p) => p.id === player.id);
        if (original) {
          original._target = target;
          original._sortIdx = idx;
        }
      });

      for (let period = 0; period < periodCount; period += 1) {
        let remaining = requiredPerPeriod;
        const pool = newPlayers
          .filter((p) => p._target > 0)
          .sort((a, b) => a._sortIdx - b._sortIdx);

        pool.forEach((player) => {
          const ideal = Math.round(player._target / periodCount);
          const assigned = Math.min(ideal, periodDuration, remaining);
          player.periods[period] = assigned;
          remaining -= assigned;
        });

        while (remaining > 0) {
          for (const player of pool) {
            if (remaining <= 0) break;
            if (player.periods[period] < periodDuration) {
              player.periods[period] += 1;
              remaining -= 1;
            }
          }
          if (pool.every((p) => p.periods[period] >= periodDuration)) break;
        }

        while (remaining < 0) {
          for (let i = pool.length - 1; i >= 0; i -= 1) {
            if (remaining >= 0) break;
            if (pool[i].periods[period] > 0) {
              pool[i].periods[period] -= 1;
              remaining += 1;
            }
          }
          if (pool.every((p) => p.periods[period] <= 0)) break;
        }
      }

      newPlayers.forEach((p) => {
        delete p._target;
        delete p._sortIdx;
      });

      const normalized = normalizeRotationSlots(newPlayers);
      setRotationPlayers(sortRotationPlayers(normalized));
      setRotationPreset(type);
      setRotationDirty(true);
      setRotationSaved(false);
    },
    [normalizeRotationSlots, rotationLeagueType, rotationRules, sortRotationPlayers],
  );

  useEffect(() => {
    if (!myTeamId || myRoster.length === 0) {
      setRotationPlayers([]);
      return;
    }

    const base = myRoster.map((p) => {
      const pos = normalizePosition(p.data?.bio?.pos || p.position || "PG");
      const rating = scaleAttr(calcPlayerScore(p));
      const age = safeNum(p.data?.bio?.age || 25);
      const stamina = scaleAttr(p.data?.attributes?.stamina ?? 70);
      return {
        id: p.id,
        name: p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        pos,
        rating: rating || 50,
        stamina,
        age,
        isYouth: age > 0 && age < 23,
        offense: calcOffenseScore(p),
        defense: calcDefenseScore(p),
        color: ROTATION_POS_COLORS[pos] || "#cbd5e1",
        slot: null,
        periods: Array(rotationRules.count).fill(0),
      };
    });

    const posOrder = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
    base.sort((a, b) => {
      const orderA = posOrder[a.pos] || 99;
      const orderB = posOrder[b.pos] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return b.rating - a.rating;
    });

    const storageKey = `pcbasket.tactics.rotation.${myTeamId}.${rotationLeagueType}`;
    const saved = loadStored(storageKey, null);
    const startersKey = `pcbasket.tactics.board.${myTeamId || "default"}.starters`;
    const savedStarters = loadStored(startersKey, null);

    const applyStartersSlots = (list) => {
      if (!savedStarters || typeof savedStarters !== "object") return list;
      const next = list.map((player) => ({ ...player }));
      STARTER_POSITIONS.forEach((pos) => {
        const entry = savedStarters[pos];
        if (!entry?.id) return;
        const idx = next.findIndex((p) => String(p.id) === String(entry.id));
        if (idx >= 0) {
          next[idx].slot = STARTER_SLOT_BY_POS[pos];
        }
      });
      return next;
    };

    if (saved && Array.isArray(saved.players)) {
      let updated = base.map((player) => {
        const match = saved.players.find((sp) => sp.playerId === player.id);
        if (match && Array.isArray(match.periods)) {
          const slot = Number(match.slot);
          return {
            ...player,
            slot: Number.isFinite(slot) ? slot : null,
            periods: match.periods.slice(0, rotationRules.count),
          };
        }
        return player;
      });
      updated = applyStartersSlots(updated);
      const normalized = normalizeRotationSlots(updated);
      setRotationPlayers(sortRotationPlayers(normalized));
      setRotationPreset(saved.presetType || "custom");
      setRotationDirty(false);
      setRotationSaved(false);
    } else {
      const seeded = applyStartersSlots(base);
      applyRotationPreset(seeded, "std_10");
    }
  }, [myRoster, myTeamId, rotationLeagueType, rotationRules, applyRotationPreset, normalizeRotationSlots, sortRotationPlayers]);

  useEffect(() => {
    if (!myTeamId || rotationPlayers.length === 0) return;
    persistStartersFromRotation(rotationPlayers);
  }, [myTeamId, rotationPlayers, persistStartersFromRotation]);

  useEffect(() => {
    if (selectedStaff) {
      setStaffTab("perfil");
    }
  }, [selectedStaff]);

  useEffect(() => { 
    const handleClose = () => setContextMenu(null); 
    window.addEventListener("click", handleClose); 
    return () => { 
      window.removeEventListener("click", handleClose); 
    }; 
  }, []); 

  useEffect(() => {
    const isTypingTarget = (target) => {
      const tag = target?.tagName ? String(target.tagName).toUpperCase() : "";
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
    };

    const handler = (e) => {
      if (isTypingTarget(e.target)) return;

      const key = String(e.key || "");
      const lower = key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && lower === "k") {
        e.preventDefault();
        setQuickSearchOpen(true);
        return;
      }

      if (key === "/") {
        e.preventDefault();
        setQuickSearchOpen(true);
        return;
      }

      if (key === "Escape") {
        if (quickSearchOpen) setQuickSearchOpen(false);
        if (compareOpen) setCompareOpen(false);
        return;
      }

      if (key === " " || key === "Spacebar") {
        if (!myTeamId) return;
        if (isAdvancingDay || isSimulating || showSimulateModal || matchDecisionOpen || quickSearchOpen || compareOpen) return;
        e.preventDefault();
        handleAdvanceLoopPhase();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [compareOpen, handleAdvanceLoopPhase, isAdvancingDay, isSimulating, matchDecisionOpen, myTeamId, quickSearchOpen, showSimulateModal]);
 
  const openPlayer = (playerId, contextIds = null) => { 
    if (section !== "Jugador") setPlayerReturnSection(section);
    setSection("Jugador");
    setSelectedTeamId(null);
    setSelectedAgencyId(null);
    setSelectedAgentId(null);
    setSelectedStaff(null);
    setSelectedBoard(null);
    setSelectedPlayerId(playerId);
    setPlayerTab("perfil");
    if (contextIds && contextIds.length) {
      const ids = contextIds.map((item) => (typeof item === "object" ? item.id : item));
      const index = ids.indexOf(playerId);
      setPlayerContext({ ids, index });
    } else {
      setPlayerContext({ ids: [], index: -1 });
    }
  };

  const toIdList = (list) => (list || []).map((item) => (typeof item === "object" ? item.id : item));

  const openContextMenu = (event, actions) => { 
    event.preventDefault(); 
    setContextMenu({ 
      x: event.clientX, 
      y: event.clientY, 
      actions: actions || [], 
    }); 
  }; 
 
  const buildPlayerContextActions = (player, contextIds = null) => { 
    if (!player) return []; 
    const actions = [ 
      { label: "Ver ficha", onClick: () => openPlayer(player.id, contextIds) }, 
    ]; 

    const inCompare = Array.isArray(compareIds) && compareIds.map(String).includes(String(player.id));
    actions.push({
      label: inCompare ? "Quitar del comparador" : "Añadir al comparador",
      onClick: () => toggleComparePlayer(player.id),
    });
    actions.push({
      label: "Abrir comparador",
      onClick: () => setCompareOpen(true),
    });
 
    const playerTeamId = player?.data?.team_id; 
    const isMyPlayer = myTeamId && String(playerTeamId) === String(myTeamId); 
    const injuryStatus = String(player?.data?.health?.injury_status || player?.data?.health?.status || "healthy").toLowerCase(); 
    const isInjured = injuryStatus && injuryStatus !== "healthy"; 
 
    if (isInjured) { 
      actions.push({ 
        label: "Ir a Medical", 
        onClick: () => { 
          setSection("Medical"); 
          setMedicalView("overview"); 
          openPlayer(player.id, contextIds); 
        }, 
      }); 
    } 
 
    if (isMyPlayer) { 
      actions.push({ 
        label: "Ir a Tácticas", 
        onClick: () => { 
          setSection("Tacticas"); 
          setTacticsView("board"); 
          openPlayer(player.id, contextIds); 
        }, 
      }); 
    } else { 
      actions.push({ label: "Añadir a objetivos", onClick: () => handleAddToShortlist?.(player.id) }); 
      actions.push({ label: "Asignar scout", onClick: () => handleAssignScout?.(player.id) }); 
      actions.push({ label: "Hacer oferta", onClick: () => handleMakeOffer?.(player.id) }); 
      actions.push({ 
        label: "Abrir negociaciones", 
        onClick: () => { 
          setSection("Mercado"); 
          setMarketView("negotiations"); 
        }, 
      }); 
    } 
 
    return actions; 
  }; 
 
  const matchupDefaults = { pressure: "Normal", pnr: "Drop", force: "Centro" }; 

  const matchupOpponents = useMemo(() => {
    return opponentRoster.map((p) => {
      const height = safeNum(p.data?.bio?.height_cm);
      return {
        id: p.id,
        name: p.name,
        pos: p.data?.bio?.pos || "--",
        height_cm: height,
        height_str: height ? `${height} cm` : "--",
        threat: calcOffenseScore(p),
      };
    });
  }, [opponentRoster, calcOffenseScore]);

  const autoAssignMatchups = () => {
    if (!myRoster.length || !matchupOpponents.length) return;
    const assigned = new Set();
    const nextAssignments = {};
    const sortedOpp = [...matchupOpponents].sort((a, b) => b.threat - a.threat);
    sortedOpp.forEach((att) => {
      let best = myRoster.find(
        (d) => d.data?.bio?.pos === att.pos && !assigned.has(d.id),
      );
      if (!best) {
        best = myRoster.find((d) => !assigned.has(d.id));
      }
      if (best) {
        nextAssignments[att.id] = best.id;
        assigned.add(best.id);
      }
    });
    setMatchupAssignments(nextAssignments);
  };

  useEffect(() => {
    if (!matchupsLoaded) return;
    if (!myRoster.length || !matchupOpponents.length) return;
    if (Object.keys(matchupAssignments).length === 0) {
      autoAssignMatchups();
    }
  }, [myRoster, matchupOpponents, matchupAssignments, matchupsLoaded]);

  const handleMatchupSort = (key) => {
    setMatchupSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "desc" };
    });
  };

  const sortedMatchupOpponents = useMemo(() => {
    const data = [...matchupOpponents];
    if (!matchupSort.key) return data;
    data.sort((a, b) => {
      const valA = a[matchupSort.key];
      const valB = b[matchupSort.key];
      if (typeof valA === "number" && typeof valB === "number") {
        return matchupSort.direction === "asc" ? valA - valB : valB - valA;
      }
      return matchupSort.direction === "asc"
        ? String(valA || "").localeCompare(String(valB || ""))
        : String(valB || "").localeCompare(String(valA || ""));
    });
    return data;
  }, [matchupOpponents, matchupSort]);

  const handleMatchupChange = (attackerId, defenderId) => {
    const next = { ...matchupAssignments, [attackerId]: defenderId ? Number(defenderId) : null };
    setMatchupAssignments(next);
  };

  const updateMatchupInstruction = (attackerId, type, value) => {
    setMatchupInstructions((prev) => ({
      ...prev,
      [attackerId]: { ...(prev[attackerId] || matchupDefaults), [type]: value },
    }));
  };

  const handleCreatePlay = () => {
    if (!newPlay.name.trim()) return;
    const created = {
      id: `play-${Date.now()}`,
      ...newPlay,
    };
    setCustomPlays((prev) => [created, ...prev]);
    setNewPlay((prev) => ({ ...prev, name: "", notes: "" }));
  };

  const handleSaveAdvancedPlay = (play) => {
    if (!play?.name) return;
    setCustomPlays((prev) => {
      const index = prev.findIndex((item) => String(item.id) === String(play.id));
      if (index !== -1) {
        const next = [...prev];
        next[index] = { ...next[index], ...play };
        return next;
      }
      return [play, ...prev];
    });
  };

  const selectMyTeam = (teamId) => {
    const team = teams.find((t) => String(t.id) === String(teamId)) || null;
    if (team) {
      setCompetitionLeagueId(getTeamLeagueId(team));
    }
    setMyTeamId(String(teamId));
    setSection("Hub");
  };

  const startNewGame = () => {
    setNewGameError("");
    const selectedLeagues = (newGameLeagueIds || []).filter(Boolean);
    if (!selectedLeagues.length) {
      setNewGameError("Selecciona al menos una liga.");
      return;
    }
    if (!newGameTeamId) {
      setNewGameError("Selecciona un equipo para iniciar.");
      return;
    }
    const team = teams.find((t) => String(t.id) === String(newGameTeamId));
    if (!team) {
      setNewGameError("Equipo inválido.");
      return;
    }
    const leagueId = getTeamLeagueId(team);
    if (!selectedLeagues.includes(leagueId)) {
      setNewGameError("El equipo debe pertenecer a una liga activa.");
      return;
    }

    resetLocalGameStorage();
    setSeasonTransitions({});
    setActiveLeagueIds(selectedLeagues.slice());
    setCompetitionLeagueId(leagueId);
    setCompetitionRound(null);
    setCompetitionCalendarFilter("all");
    setCompetitionCalendarTeamId("");
    setCompetitionMonth(() => {
      const base = parseIsoDate(LOOP_DEFAULT_START);
      return new Date(base.getFullYear(), base.getMonth(), 1);
    });

    setLoopResults([]);
    setLoopState({ date: LOOP_DEFAULT_START, phase: 0 });
    setLoopTeamState({ ...DEFAULT_LOOP_TEAM_STATE });
    setLoopSchedule([]);

    setMatchFixtureId("");
    setMatchStatus("idle");
    setMatchSession(null);
    setMatchScore({ home: 0, away: 0 });
    setMatchActions([]);
    setMatchLastEvent(null);
    setMatchClock(null);
    setMatchPeriodLabel("Q1");
    setMatchTimeLabel("10:00");

    loopInitRef.current = "";
    setMyTeamId(String(team.id));
    setSection("Hub");
    setNeedsNewGame(false);
  };

  const handleRosterViewChange = (viewId) => {
    if (viewId === "custom") {
      setActiveRosterView("custom");
      if (customRosterColumns.length) {
        setVisibleRosterColumns(customRosterColumns.slice());
      }
      return;
    }
    const preset = ROSTER_VIEWS.find((view) => view.id === viewId);
    if (preset) {
      setActiveRosterView(viewId);
      setVisibleRosterColumns(preset.columns.slice());
    }
  };

  const updateRosterColumns = (columns) => {
    setVisibleRosterColumns(columns);
    setCustomRosterColumns(columns);
    setActiveRosterView("custom");
  };

  const toggleRosterColumn = (key) => {
    const next = visibleRosterColumns.includes(key)
      ? visibleRosterColumns.filter((col) => col !== key)
      : [...visibleRosterColumns, key];
    updateRosterColumns(next);
  };

  const rosterColumnGroups = useMemo(() => {
    const groups = [
      {
        id: "general",
        label: "General",
        keys: ["pos", "rotation_slot", "age", "height", "weight", "wingspan", "nationality", "archetype"],
      },
      {
        id: "contract",
        label: "Contrato",
        keys: ["salary", "expiration", "clause", "type", "value"],
      },
    ];
    ATTRIBUTE_SECTIONS.forEach((section) => {
      groups.push({ id: section.key, label: section.label, keys: section.attrs.slice() });
    });
    return groups;
  }, []);

  const handleRosterDragStart = (index) => {
    setDraggedRosterColIndex(index);
  };

  const handleRosterDragOver = (event) => {
    event.preventDefault();
  };

  const handleRosterDrop = (index) => {
    if (draggedRosterColIndex == null || draggedRosterColIndex === index) {
      setDraggedRosterColIndex(null);
      return;
    }
    const nextCols = [...visibleRosterColumns];
    const [moved] = nextCols.splice(draggedRosterColIndex, 1);
    nextCols.splice(index, 0, moved);
    updateRosterColumns(nextCols);
    setDraggedRosterColIndex(null);
  };

  const handleRosterSort = (key) => {
    setRosterSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const toggleMenteeSelection = (playerId) => {
    setNewMentorMentees((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId],
    );
  };

  const handleCreateMentoringGroup = () => {
    if (!newMentorId || newMentorMentees.length === 0) return;
    const mentor = myRoster.find((p) => String(p.id) === String(newMentorId));
    const mentees = myRoster.filter((p) => newMentorMentees.includes(String(p.id)));
    if (!mentor || mentees.length === 0) return;
    const focusLabel =
      attributeLabelMap[newMentorFocus] ||
      labelMaps.trait?.[newMentorFocus] ||
      labelMaps.perk?.[newMentorFocus] ||
      humanizeId(newMentorFocus) ||
      newMentorFocus;
    const newGroup = {
      id: `custom-${Date.now()}`,
      focus: focusLabel,
      focusType: "custom",
      mentor,
      mentees,
      isCustom: true,
    };
    setMentoringCustomGroups((prev) => [newGroup, ...prev]);
    setNewMentorId("");
    setNewMentorMentees([]);
  };

  const handleDeleteMentoringGroup = (groupId) => {
    if (groupId.startsWith("custom-")) {
      setMentoringCustomGroups((prev) => prev.filter((g) => g.id !== groupId));
    } else {
      setMentoringDeletedAuto((prev) => (prev.includes(groupId) ? prev : [...prev, groupId]));
    }
  };

  const canPrevPlayer = playerContext.ids.length > 0 && playerContext.index > 0;
  const canNextPlayer = playerContext.ids.length > 0 && playerContext.index < playerContext.ids.length - 1;

  const openRelativePlayer = (offset) => {
    if (!playerContext.ids.length) return;
    const nextIndex = playerContext.index + offset;
    if (nextIndex < 0 || nextIndex >= playerContext.ids.length) return;
    const nextId = playerContext.ids[nextIndex];
    setSelectedPlayerId(nextId);
    setPlayerContext((prev) => ({ ...prev, index: nextIndex }));
  };

  const openTeam = (teamId) => {
    setSelectedPlayerId(null);
    setSelectedAgencyId(null);
    setSelectedAgentId(null);
    setSelectedStaff(null);
    setSelectedBoard(null);
    setPlayerContext({ ids: [], index: -1 });
    setSelectedTeamId(teamId);
  };

  const openAgency = (agencyId) => {
    setSelectedPlayerId(null);
    setSelectedTeamId(null);
    setSelectedAgentId(null);
    setSelectedStaff(null);
    setSelectedBoard(null);
    setPlayerContext({ ids: [], index: -1 });
    setSelectedAgencyId(agencyId);
  };

  const openAgent = (agentId) => {
    setSelectedPlayerId(null);
    setSelectedTeamId(null);
    setSelectedAgencyId(null);
    setSelectedStaff(null);
    setSelectedBoard(null);
    setPlayerContext({ ids: [], index: -1 });
    setSelectedAgentId(agentId);
  };

  const openTeamOverlayFromPlayer = (teamId) => {
    if (!teamId) return;
    setSelectedAgencyId(null);
    setSelectedAgentId(null);
    setSelectedStaff(null);
    setSelectedBoard(null);
    setSelectedTeamId(teamId);
  };

  const openAgentOverlayFromPlayer = (agentId) => {
    if (!agentId) return;
    setSelectedTeamId(null);
    setSelectedAgencyId(null);
    setSelectedStaff(null);
    setSelectedBoard(null);
    setSelectedAgentId(agentId);
  };

  const openStaffMember = (member, teamId) => {
    setSelectedPlayerId(null);
    setSelectedTeamId(null);
    setSelectedAgencyId(null);
    setSelectedAgentId(null);
    setSelectedBoard(null);
    setPlayerContext({ ids: [], index: -1 });
    setSelectedStaff({ ...member, team_id: teamId });
    setSelectedStaffAttrSection("offense");
  };

  const openBoardMember = (member, teamId) => {
    setSelectedPlayerId(null);
    setSelectedTeamId(null);
    setSelectedAgencyId(null);
    setSelectedAgentId(null);
    setSelectedStaff(null);
    setPlayerContext({ ids: [], index: -1 });
    setSelectedBoard({ ...member, team_id: teamId });
    setSelectedBoardAttrSection("offense");
  };

  const closeDetails = () => {
    setSelectedPlayerId(null);
    setSelectedTeamId(null);
    setSelectedAgencyId(null);
    setSelectedAgentId(null);
    setSelectedStaff(null);
    setSelectedBoard(null);
    setPlayerContext({ ids: [], index: -1 });
  };

  const closeDetailsPreservePlayer = () => {
    setSelectedTeamId(null);
    setSelectedAgencyId(null);
    setSelectedAgentId(null);
    setSelectedStaff(null);
    setSelectedBoard(null);
  };

  const closePlayerPage = () => {
    setSelectedPlayerId(null);
    setSelectedTeamId(null);
    setSelectedAgencyId(null);
    setSelectedAgentId(null);
    setSelectedStaff(null);
    setSelectedBoard(null);
    setPlayerContext({ ids: [], index: -1 });
    setSection(playerReturnSection || "Hub");
  };

  const filteredPlayers = myRoster.filter((p) => {
    if (filterPos && p.data?.bio?.pos !== filterPos) return false;
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      const name = String(p.name || "").toLowerCase();
      const arche = String(p.data?.identity?.arquetipo_label || p.data?.identity?.arquetipo || "").toLowerCase();
      if (!name.includes(q) && !arche.includes(q)) return false;
    }
    return true;
  });

  const sortedRoster = useMemo(() => {
    const list = [...filteredPlayers];
    if (!rosterSort?.key) return list;
    list.sort((a, b) => {
      const valA = getRosterSortValue(a, rosterSort.key);
      const valB = getRosterSortValue(b, rosterSort.key);
      if (typeof valA === "number" && typeof valB === "number") {
        return rosterSort.direction === "asc" ? valA - valB : valB - valA;
      }
      const strA = String(valA ?? "");
      const strB = String(valB ?? "");
      return rosterSort.direction === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
    return list;
  }, [filteredPlayers, rosterSort, getRosterSortValue]);

  const filteredScout = players.filter((p) => {
    const data = p.data || {};
    const id = data.identity || {};
    if (scoutTier && String(data.scout?.tier || "") !== String(scoutTier)) return false;
    if (scoutOrigin && id.origin !== scoutOrigin) return false;
    if (scoutMental && id.mentalidad !== scoutMental) return false;
    if (scoutArchetype && id.arquetipo !== scoutArchetype) return false;
    if (scoutTrait && !(data.traits || []).includes(scoutTrait)) return false;
    if (scoutPerk && !(data.perks || []).includes(scoutPerk)) return false;
    if (scoutTag) {
      const tags = tagsByPlayer[p.id] || [];
      if (!tags.includes(scoutTag)) return false;
    }
    if (scoutQuery) {
      const q = scoutQuery.toLowerCase();
      const name = String(p.name || "").toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const filteredAgencies = agencies.filter((a) => {
    if (!agencyQuery) return true;
    const q = agencyQuery.toLowerCase();
    const name = String(a.name || "").toLowerCase();
    const tier = String(a.data?.tier || "").toLowerCase();
    return name.includes(q) || tier.includes(q);
  });

  const filteredAgents = agents.filter((a) => {
    if (agentAgencyFilter && a.agency_id !== agentAgencyFilter) return false;
    if (!agentQuery) return true;
    const q = agentQuery.toLowerCase();
    const name = String(a.name || "").toLowerCase();
    const style = String(a.data?.style || "").toLowerCase();
    const agencyName = String(agencyMap[a.agency_id]?.name || "").toLowerCase();
    return name.includes(q) || style.includes(q) || agencyName.includes(q);
  });

  const renderRadarPanel = (sections, attrs, selectedKey, onSelect, labelMap = {}, descMap = {}) => {
    if (!sections || sections.length === 0) {
      return <div className="desc">Sin secciones configuradas.</div>;
    }
    const sectionData = sections.map((section) => {
      const values = section.attrs.map((key) => Number(attrs?.[key] || 0));
      const avg = values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
      return { ...section, avg };
    });
    const selectedSection = sectionData.find((s) => s.key === selectedKey) || sectionData[0];
    const size = 260;
    const center = size / 2;
    const radius = 90;
    const labelRadius = 115;
    const levels = 4;

    const angleFor = (i) => (-Math.PI / 2) + (i * (2 * Math.PI / sectionData.length));
    const pointFor = (value, i, r = radius) => {
      const v = Math.max(0, Math.min(1, value / 1000));
      const angle = angleFor(i);
      return {
        x: center + Math.cos(angle) * r * v,
        y: center + Math.sin(angle) * r * v,
      };
    };

    const polygonPoints = sectionData
      .map((section, i) => {
        const p = pointFor(section.avg, i);
        return `${p.x},${p.y}`;
      })
      .join(" ");

    return (
      <div className="radar-block">
        <div className="radar-wrap">
          <svg className="radar" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {[...Array(levels)].map((_, level) => {
              const r = radius * ((level + 1) / levels);
              const ringPoints = sectionData
                .map((section, i) => {
                  const angle = angleFor(i);
                  const x = center + Math.cos(angle) * r;
                  const y = center + Math.sin(angle) * r;
                  return `${x},${y}`;
                })
                .join(" ");
              return (
                <polygon key={r} points={ringPoints} className="radar-grid" />
              );
            })}
            {sectionData.map((_, i) => {
              const angle = angleFor(i);
              const x = center + Math.cos(angle) * radius;
              const y = center + Math.sin(angle) * radius;
              return (
                <line key={`axis-${i}`} x1={center} y1={center} x2={x} y2={y} className="radar-axis" />
              );
            })}
            <polygon points={polygonPoints} className="radar-shape" />
            {sectionData.map((section, i) => {
              const p = pointFor(section.avg, i);
              return (
                <circle key={`dot-${section.key}`} cx={p.x} cy={p.y} r="4" className="radar-dot" />
              );
            })}
          </svg>
          {sectionData.map((section, i) => {
            const angle = angleFor(i);
            const x = center + Math.cos(angle) * labelRadius;
            const y = center + Math.sin(angle) * labelRadius;
            return (
              <button
                key={section.key}
                className={`radar-label ${selectedSection?.key === section.key ? "active" : ""}`}
                style={{ left: `${x}px`, top: `${y}px` }}
                onClick={() => onSelect(section.key)}
              >
                {section.label}
                <span className="radar-avg mono">{Math.round(section.avg)}</span>
              </button>
            );
          })}
        </div>
        <div className="radar-detail">
          <div className="section-title">Detalle: {selectedSection?.label}</div>
          <div className="radar-list">
            {selectedSection?.attrs?.map((key) => {
              const label = labelMap?.[key] || humanizeId(key);
              const desc = descMap?.[key] || "";
              return (
                <div className="radar-attr" key={key} title={desc || label}>
                  <span className="mono">{label}</span>
                  <span className="mono">{attrs?.[key] ?? "--"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const watchlistItems = players.filter((p) => shortlist[p.id]);

  const renderScoutCards = (list, emptyText) => {
    if (list.length === 0) {
      return <div className="desc">{emptyText}</div>;
    }
    const listIds = toIdList(list);
    return list.map((p) => {
      const identity = p.data?.identity || {};
      const archeId = identity.arquetipo;
      const archeLabel = identity.arquetipo_label || labelFor("arche", archeId);
      const archeDesc = identity.arquetipo_desc || descFor("arche", archeId, archeLabel);
      const originId = identity.origin;
      const originLabel = identity.origin_label || labelFor("origin", originId);
      const originDesc = identity.origin_desc || descFor("origin", originId, originLabel);
      const mentalId = identity.mentalidad;
      const mentalLabel = identity.mentalidad_label || labelFor("mental", mentalId);
      const mentalDesc = identity.mentalidad_desc || descFor("mental", mentalId, mentalLabel);

      return (
        <div 
          className="scout-card" 
          key={p.id} 
          onContextMenu={(e) => 
            openContextMenu(e, [ 
              ...buildPlayerContextActions(p, listIds), 
              { 
                label: shortlist[p.id] ? "Quitar de watchlist" : "Añadir a watchlist", 
                onClick: () => toggleShortlist(p.id), 
              }, 
            ]) 
          } 
        > 
          <div className="scout-head">
            <div>
              <div className="scout-name">
                <span className="star" onClick={() => toggleShortlist(p.id)}>
                  {shortlist[p.id] ? "?" : "?"}
                </span>
                <button className="link" onClick={() => openPlayer(p.id, listIds)}>
                  {p.name}
                </button>
              </div>
              <div className="scout-meta">
                {p.data?.bio?.pos || "--"} ?{" "}
                <span title={archeDesc}>{archeLabel}</span>
              </div>
            </div>
            <div className="tier">Tier {p.data?.scout?.tier || "-"}</div>
          </div>
          <div className="scout-tags">
            <span className="chip" title={originDesc}>Origen {originLabel}</span>
            <span className="chip" title={mentalDesc}>Mentalidad {mentalLabel}</span>
            {(p.data?.traits || []).slice(0, 3).map((t, idx) => {
              const label = p.data?.traits_label?.[idx] || labelFor("trait", t);
              const desc = p.data?.traits_desc?.[idx] || descFor("trait", t, label);
              return (
                <span key={t} className="chip muted" title={desc}>
                  {label}
                </span>
              );
            })}
            {(p.data?.perks || []).slice(0, 2).map((t, idx) => {
              const label = p.data?.perks_label?.[idx] || labelFor("perk", t);
              const desc = p.data?.perks_desc?.[idx] || descFor("perk", t, label);
              return (
                <span key={t} className="chip muted" title={desc}>
                  {label}
                </span>
              );
            })}
          </div>
          <div className="tag-picker">
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag}
                className={`tag-chip ${tagsByPlayer[p.id]?.includes(tag) ? "active" : ""}`}
                onClick={() => toggleTag(p.id, tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      );
    });
  };

  const gmSnapshot = hubSnapshot?.gm || {};
  const gmState = gmSnapshot?.state || {};
  const gmEvents = Array.isArray(gmSnapshot?.events) ? gmSnapshot.events : [];
  const gmAgenda = Array.isArray(gmSnapshot?.agenda) ? gmSnapshot.agenda : [];
  const gmDecisions = Array.isArray(gmSnapshot?.decisions) ? gmSnapshot.decisions : [];

  const navigateFromHub = useCallback(
    (dest) => {
      const sectionId = dest?.section;
      if (!sectionId) return;
      setSection(sectionId);
      if (sectionId === "Mercado") {
        setMarketView(dest.view || "search");
        return;
      }
      if (sectionId === "Entrenamiento") {
        setTrainingView(dest.view || "team");
        return;
      }
      if (sectionId === "Tacticas") {
        setTacticsView(dest.view || "board");
        return;
      }
      if (sectionId === "Competicion") {
        setCompetitionView(dest.view || "calendar");
        return;
      }
      if (sectionId === "Club") {
        setClubView(dest.view || "dashboard");
        return;
      }
      if (sectionId === "Medical") {
        setMedicalView(dest.view || "overview");
        return;
      }
    },
    [setSection, setMarketView, setTrainingView, setTacticsView, setCompetitionView, setClubView, setMedicalView],
  );

  const renderHub = () => (
    <HubPage
      myRoster={myRoster}
      myTeam={myTeam}
      myStaff={myStaff}
      myBoard={myBoard}
      playerMap={playerMap}
      marketShortlist={(myTeam?.data?.shortlist || [])}
      analyticsSnapshot={analyticsSnapshot}
      onRemoveFromShortlist={handleRemoveFromShortlist}
      toIdList={toIdList}
      loopState={loopState}
      LOOP_PHASES={LOOP_PHASES}
      loopTodayFixture={loopTodayFixture}
      loopNextFixture={loopNextFixture}
      loopLastResult={loopLastResult}
      loopRecord={loopRecord}
      teamMap={teamMap}
      myTeamId={myTeamId}
      loopTeamState={loopTeamState}
      handleAdvanceLoopPhase={handleAdvanceLoopPhase}
      handleSimulateMatch={handleSimulateMatch}
      isSimulating={isSimulating}
      applyCommsEffect={applyCommsEffect}
      labelFor={labelFor}
      descFor={descFor}
      openPlayer={openPlayer}
      parseIsoDate={parseIsoDate}
      hubSnapshot={hubSnapshot}
      hubLoading={hubLoading}
      gmState={gmState}
      gmEvents={gmEvents}
      gmAgenda={gmAgenda}
      gmDecisions={gmDecisions}
      onCreateEvent={createGmEvent}
      onApplyDecision={applyGmDecision}
      onNavigate={navigateFromHub}
    />
  );

  const renderStart = () => (
    <StartPage
      newGameError={newGameError}
      startNewGame={startNewGame}
      LEAGUE_ORDER={LEAGUE_ORDER}
      getLeagueConfig={getLeagueConfig}
      teamsByLeague={teamsByLeague}
      newGameLeagueIds={newGameLeagueIds}
      setNewGameLeagueIds={setNewGameLeagueIds}
      teams={teams}
      getTeamLeagueId={getTeamLeagueId}
      newGameTeamId={newGameTeamId}
      setNewGameTeamId={setNewGameTeamId}
      openContextMenu={openContextMenu}
      openTeam={openTeam}
      loadingTeams={loadingTeams}
    />
  );

  const renderRosterAnalysis = () => {
    const rosterIds = toIdList(myRoster);
    const toneForScore = (score) => (score >= 70 ? "tone-red" : score >= 50 ? "tone-yellow" : "tone-green");
    const toneForMetric = (value, warn, danger, invert = false) => {
      if (invert) {
        if (value <= danger) return "tone-red";
        if (value <= warn) return "tone-yellow";
        return "tone-green";
      }
      if (value >= danger) return "tone-red";
      if (value >= warn) return "tone-yellow";
      return "tone-green";
    };
    const rosterAlerts = myRoster
      .map((player) => {
        const metrics = getLoadMetrics(player);
        const morale = player?.data?.morale || {};
        const moraleValue = clamp(
          safeNum(
            morale.happiness ??
              morale.value ??
              morale.score ??
              morale.level ??
              morale.mood ??
              70,
          ),
        );
        const moraleScore = clamp(100 - moraleValue);
        const fatigueScore = clamp(Math.round(metrics.load * 0.85 + metrics.risk * 0.2));
        const riskScore = clamp(metrics.risk);
        const availability = player?.data?.availability || {};
        const status = player?.data?.status || {};
        const injuryItem = rosterStatusMap[player.id];
        const injuryFlag = Boolean(
          injuryItem ||
            availability?.injured ||
            availability?.injury ||
            status?.injured ||
            status?.injury,
        );
        const injuryScore = injuryItem?.risk ? clamp(injuryItem.risk) : injuryFlag ? 90 : 0;

        const tags = [];
        const scores = [];

        if (fatigueScore >= 55) {
          tags.push({
            label: "Fatiga",
            value: fatigueScore,
            tone: toneForMetric(fatigueScore, 60, 75),
          });
          scores.push(fatigueScore);
        }
        if (riskScore >= 60) {
          tags.push({
            label: "Riesgo",
            value: riskScore,
            tone: toneForMetric(riskScore, 60, 80),
          });
          scores.push(riskScore);
        }
        if (moraleScore >= 45) {
          tags.push({
            label: "Moral",
            value: moraleValue,
            tone: toneForMetric(moraleValue, 55, 35, true),
          });
          scores.push(moraleScore);
        }
        if (injuryFlag) {
          tags.push({
            label: "Lesión",
            value: injuryItem?.status || "Activa",
            tone: "tone-red",
          });
          scores.push(injuryScore || 90);
        }

        const avgScore = scores.length
          ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
          : 0;

        return {
          id: player.id,
          player,
          pos: player.data?.bio?.pos || "--",
          tags,
          avgScore,
          tone: toneForScore(avgScore),
        };
      })
      .filter((alert) => alert.tags.length > 0)
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 6);

    return (
      <div className="analysis-layout">
        <div className="card analysis-card">
          <div className="card-header">
            <h2>Análisis de Plantilla</h2>
            <span className="tag muted">Depth Chart</span>
          </div>
          <div className="table depth-table">
            <div className="row head depth">
              <div>Pos</div>
              <div>Titular</div>
              <div>Rotación</div>
              <div>Reservas</div>
            </div>
            {depthChart.map((slot) => (
              <div className="row depth" key={slot.pos}>
                <div>
                  <span className="name-pill neutral">{slot.pos}</span>
                </div>
                <div>
                  {slot.starter ? (
                    <button
                      className="name-pill neutral"
                      onClick={() => openPlayer(slot.starter.id, rosterIds)}
                      type="button"
                    >
                      {slot.starter.name}
                    </button>
                  ) : (
                    <span className="desc">--</span>
                  )}
                </div>
                <div className="depth-chips">
                  {slot.rotation.length === 0 ? (
                    <span className="desc">--</span>
                  ) : (
                    slot.rotation.map((p) => (
                      <button key={p.id} className="chip influence" onClick={() => openPlayer(p.id, rosterIds)}>
                        {p.name}
                      </button>
                    ))
                  )}
                </div>
                <div className="depth-chips">
                  {slot.reserves.length === 0 ? (
                    <span className="desc">--</span>
                  ) : (
                    slot.reserves.map((p) => (
                      <button key={p.id} className="chip influence" onClick={() => openPlayer(p.id, rosterIds)}>
                        {p.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card analysis-card analysis-side">
          <div className="card-header">
            <h2>Alertas</h2>
            <span className="tag muted">Plantilla</span>
          </div>
          <div className="roster-alert-list">
            {rosterAlerts.length === 0 ? (
              <div className="desc">Sin alertas relevantes.</div>
            ) : (
              rosterAlerts.map((alert) => (
                <div className="roster-alert-row" key={alert.id}>
                  <div className="roster-alert-main">
                    <button
                      className={`name-pill ${alert.tone}`}
                      onClick={() => openPlayer(alert.player.id, rosterIds)}
                      type="button"
                    >
                      {alert.player.name}
                    </button>
                    <span className="name-pill neutral">{alert.pos}</span>
                  </div>
                  <div className="alert-tags">
                    {alert.tags.map((tag, index) => (
                      <span key={`${alert.id}-${tag.label}-${index}`} className={`alert-tag ${tag.tone}`}>
                        {tag.label} {tag.value}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card analysis-card analysis-wide">
          <div className="card-header">
            <h2>Dinámicas</h2>
            <span className="tag muted">Cohesión</span>
          </div>
          <div className="analysis-metrics">
            <div className="metric-row">
              <div className="label">Cohesión</div>
              <div className="track">
                <div className="fill" style={{ width: `${rosterCohesion}%` }} />
              </div>
              <div className="value mono">{rosterCohesion}%</div>
            </div>
          </div>
          <div className="detail-section">
            <div className="section-title">Lideres</div>
            <div className="detail-tags">
              {hierarchy.leaders.length === 0 ? (
                <span className="desc">Sin lideres claros.</span>
              ) : (
                hierarchy.leaders.map((p) => (
                  <button key={p.id} className="chip leader" onClick={() => openPlayer(p.id, rosterIds)}>
                    {p.name}
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="detail-section">
            <div className="section-title">Influyentes</div>
            <div className="detail-tags">
              {hierarchy.influential.length === 0 ? (
                <span className="desc">Sin influyentes.</span>
              ) : (
                hierarchy.influential.map((p) => (
                  <button key={p.id} className="chip influence" onClick={() => openPlayer(p.id, rosterIds)}>
                    {p.name}
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="detail-section">
            <div className="section-title">Plantilla</div>
            <div className="detail-tags">
              {hierarchy.squad.length === 0 ? (
                <span className="desc">--</span>
              ) : (
                hierarchy.squad.map((p) => (
                  <button key={p.id} className="chip muted" onClick={() => openPlayer(p.id, rosterIds)}>
                    {p.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleAddCalendarNote = () => {
    if (!myTeamId) return;
    const date = calendarNoteDraft.date || loopState?.date || isoDate(new Date());
    const text = (calendarNoteDraft.text || "").trim();
    if (!date || !text) return;
    const note = {
      id: `${Date.now()}`,
      date,
      text,
    };
    const key = `pcbasket.calendar.notes.${myTeamId}`;
    const next = [note, ...teamCalendarNotes].slice(0, 200);
    setTeamCalendarNotes(next);
    window.localStorage?.setItem(key, JSON.stringify(next));
    setCalendarNoteDraft({ date, text: "" });
  };

  const renderCompetitionCalendar = () => {
    if (!teams.length) {
      return (
        <section className="bento competition-page">
          <div className="card competition-calendar">Sin datos de competición.</div>
        </section>
      );
    }

    const monthBase = competitionMonth || new Date();
    const monthLabel = monthBase.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    const firstOfMonth = new Date(monthBase.getFullYear(), monthBase.getMonth(), 1);
    const gridStart = startOfWeek(firstOfMonth);
    const days = Array.from({ length: 42 }, (_, idx) => {
      const date = addDays(gridStart, idx);
      return {
        date,
        iso: formatLocalDate(date),
        day: date.getDate(),
        inMonth: date.getMonth() === monthBase.getMonth(),
      };
    });

    const weekDays = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
    const isMyTeamInLeague =
      myTeamId && activeLeagueTeamIds.has(String(myTeamId));
    const selectedFilterTeamId =
      competitionCalendarFilter === "other"
        ? competitionCalendarTeamId
        : competitionCalendarFilter === "my" && isMyTeamInLeague
          ? myTeamId
          : null;
    const changeMonth = (direction) => {
      setCompetitionMonth((prev) => {
        const next = new Date(prev.getFullYear(), prev.getMonth() + direction, 1);
        return next;
      });
    };
    const showTeamExtras =
      selectedFilterTeamId && myTeamId && String(selectedFilterTeamId) === String(myTeamId);
    const maxItems = showTeamExtras ? 5 : 3;
    const truncateText = (value, max = 30) => {
      if (!value) return "";
      const text = String(value);
      return text.length > max ? `${text.slice(0, max - 3)}...` : text;
    };
    const trainingSessions = (() => {
      if (!showTeamExtras) return [];
      const saved = trainingSavedSessions.filter(
        (s) => String(s.clubId || myTeamId) === String(myTeamId),
      );
      if (saved.length) return saved;
      if (!trainingPlan.length) return [];
      const derived = [];
      trainingPlan.forEach((day, idx) => {
        const date = new Date(trainingWeekStart);
        date.setDate(trainingWeekStart.getDate() + idx);
        const dateStr = isoDate(date);
        (day.sessions || []).forEach((session) => {
          derived.push({ ...session, date: dateStr });
        });
      });
      return derived;
    })();
    const trainingByDate = {};
    trainingSessions.forEach((session) => {
      const date = session.date;
      if (!date) return;
      if (!trainingByDate[date]) trainingByDate[date] = [];
      trainingByDate[date].push(session);
    });
    const notesByDate = {};
    if (showTeamExtras) {
      teamCalendarNotes.forEach((note) => {
        if (!note?.date) return;
        if (!notesByDate[note.date]) notesByDate[note.date] = [];
        notesByDate[note.date].push(note);
      });
    }
    const gmAgendaByDate = {};
    const gmEventsByDate = {};
    if (showTeamExtras) {
      (hubSnapshot?.gm?.agenda || []).forEach((item) => {
        const date = item?.date || item?.event_date;
        if (!date) return;
        if (!gmAgendaByDate[date]) gmAgendaByDate[date] = [];
        gmAgendaByDate[date].push(item);
      });
      (hubSnapshot?.gm?.events || []).forEach((evt) => {
        const date = evt?.event_date;
        if (!date) return;
        if (!gmEventsByDate[date]) gmEventsByDate[date] = [];
        gmEventsByDate[date].push(evt);
      });
    }
    const importantByDate = {};
    const addImportant = (date, label) => {
      if (!date || !label) return;
      if (!importantByDate[date]) importantByDate[date] = [];
      if (importantByDate[date].some((item) => item.label === label)) return;
      importantByDate[date].push({ label });
    };
    if (showTeamExtras) {
      const myFixtures = Object.values(competitionViewFixturesByDate)
        .flat()
        .filter((fixture) =>
          String(fixture.homeId) === String(myTeamId) ||
          String(fixture.awayId) === String(myTeamId),
        );
      myFixtures.forEach((fixture) => {
        if (!fixture?.date) return;
        const base = parseIsoDate(fixture.date);
        if (Number.isNaN(base.getTime())) return;
        const pre = formatLocalDate(addDays(base, -1));
        const post = formatLocalDate(addDays(base, 1));
        addImportant(pre, "Scouting rival");
        if (String(fixture.awayId) === String(myTeamId)) {
          addImportant(pre, "Viaje");
        }
        addImportant(post, "Recuperacion");
      });
      const monthAnchor = new Date(monthBase.getFullYear(), monthBase.getMonth(), 1);
      const weekday = monthAnchor.getDay();
      const offsetToMonday = weekday === 0 ? 1 : weekday === 1 ? 0 : 8 - weekday;
      const staffDate = formatLocalDate(addDays(monthAnchor, offsetToMonday));
      addImportant(staffDate, "Reunion de staff");
    }

    return (
      <section className="bento competition-page">
        <div className={`card competition-calendar ${showTeamExtras ? "my-team-calendar" : ""}`}>
          <div className="calendar-header">
            <div>
              <div className="eyebrow">{activeLeagueConfig.name}</div>
              <h2>Calendario</h2>
            </div>
            <div className="calendar-nav">
              <button className="subnav-item" type="button" onClick={() => changeMonth(-1)}>
                Anterior
              </button>
              <div className="calendar-month">{monthLabel}</div>
              <button className="subnav-item" type="button" onClick={() => changeMonth(1)}>
                Siguiente
              </button>
            </div>
            <div className="calendar-filters">
              {availableLeagueIds.length > 1 && (
                <label>
                  Liga
                  <select
                    value={activeLeagueId}
                    onChange={(e) => setCompetitionLeagueId(e.target.value)}
                  >
                    {availableLeagueIds.map((leagueId) => (
                      <option key={leagueId} value={leagueId}>
                        {getLeagueConfig(leagueId).name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Mostrar
                <select
                  value={competitionCalendarFilter}
                  onChange={(e) => setCompetitionCalendarFilter(e.target.value)}
                >
                  <option value="all">Todos</option>
                  {isMyTeamInLeague && <option value="my">Mi equipo</option>}
                  <option value="other">Otro equipo</option>
                </select>
              </label>
              {competitionCalendarFilter === "other" && (
                <label>
                  Equipo
                  <select
                    value={competitionCalendarTeamId}
                    onChange={(e) => setCompetitionCalendarTeamId(e.target.value)}
                  >
                    {activeLeagueTeams
                      .filter((t) => !isMyTeamInLeague || String(t.id) !== String(myTeamId))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            {showTeamExtras && (
              <div className="calendar-notes">
                <label>
                  Nota rápida
                  <div className="calendar-note-inputs">
                    <input
                      type="date"
                      value={calendarNoteDraft.date || ""}
                      onChange={(e) => setCalendarNoteDraft((prev) => ({ ...prev, date: e.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder=""
                      value={calendarNoteDraft.text || ""}
                      onChange={(e) => setCalendarNoteDraft((prev) => ({ ...prev, text: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddCalendarNote();
                      }}
                    />
                  </div>
                </label>
                <button className="subnav-item" type="button" onClick={handleAddCalendarNote}>
                  Añadir
                </button>
              </div>
            )}
          </div>
          <div className="calendar-grid">
            {weekDays.map((day) => (
              <div key={day} className="calendar-weekday">{day}</div>
            ))}
            {days.map((day) => {
              const fixtures = (competitionViewFixturesByDate[day.iso] || []).filter((fixture) => {
                if (competitionCalendarFilter === "all") return true;
                if (!selectedFilterTeamId) return true;
                return (
                  String(fixture.homeId) === String(selectedFilterTeamId) ||
                  String(fixture.awayId) === String(selectedFilterTeamId)
                );
              });
              const isToday = loopState?.date === day.iso;
              const eventItems = fixtures.map((fixture) => {
                const home = teamMap[fixture.homeId];
                const away = teamMap[fixture.awayId];
                const score = fixture.result
                  ? `${fixture.result.homeScore}-${fixture.result.awayScore}`
                  : "--";
                const competitionLabel =
                  fixture.competition === "copa"
                    ? (activeLeagueConfig.competitions.cup || "Copa")
                    : fixture.competition === "supercopa"
                      ? (activeLeagueConfig.competitions.supercopa || "Supercopa")
                      : fixture.competition === "ascenso"
                        ? (activeLeagueConfig.competitions.playoff || "Playoff")
                        : activeLeagueConfig.competitions.league;
                return {
                  key: `fixture-${fixture.id}`,
                  node: (
                    <div
                      key={`fixture-${fixture.id}`}
                      className={`calendar-event ${fixture.played ? "played" : ""} ${fixture.competition || "liga"}`}
                      title={competitionLabel}
                    >
                      {fixture.homeId ? (
                        <button className="link mono" type="button" onClick={() => openTeam(fixture.homeId)}>
                          {home?.name || "Equipo"}
                        </button>
                      ) : (
                        <span className="desc">Por definir</span>
                      )}
                      <span className="calendar-score">{score}</span>
                      {fixture.awayId ? (
                        <button className="link mono" type="button" onClick={() => openTeam(fixture.awayId)}>
                          {away?.name || "Equipo"}
                        </button>
                      ) : (
                        <span className="desc">Por definir</span>
                      )}
                    </div>
                  ),
                };
              });
              const extraEvents = [];
              if (showTeamExtras) {
                const importantItems = importantByDate[day.iso] || [];
                importantItems.forEach((item, idx) => {
                  extraEvents.push({
                    key: `important-${day.iso}-${idx}`,
                    node: (
                      <div
                        key={`important-${day.iso}-${idx}`}
                        className="calendar-event simple important"
                        title={item.label}
                      >
                        {item.label}
                      </div>
                    ),
                  });
                });
                const trainingItems = trainingByDate[day.iso] || [];
                if (trainingItems.length) {
                  const detail = trainingItems
                    .slice(0, 6)
                    .map((session) => `${session.startTime || ""} ${session.type || "Entreno"}`.trim())
                    .join(" · ");
                  extraEvents.push({
                    key: `training-${day.iso}`,
                    node: (
                      <div
                        key={`training-${day.iso}`}
                        className="calendar-event simple training"
                        title={detail || "Sesiones de entrenamiento"}
                      >
                        Entrenamientos ({trainingItems.length})
                      </div>
                    ),
                  });
                }
                const noteItems = notesByDate[day.iso] || [];
                noteItems.forEach((note, idx) => {
                  extraEvents.push({
                    key: `note-${note.id || idx}`,
                    node: (
                      <div
                        key={`note-${note.id || idx}`}
                        className="calendar-event simple note"
                        title={note.text}
                      >
                        Nota: {truncateText(note.text, 28)}
                      </div>
                    ),
                  });
                });
                const agendaItems = gmAgendaByDate[day.iso] || [];
                agendaItems.forEach((item, idx) => {
                  const label = item.title || item.reason || item.kind || "";
                  extraEvents.push({
                    key: `gm-agenda-${item.id || idx}`,
                    node: (
                      <div
                        key={`gm-agenda-${item.id || idx}`}
                        className="calendar-event simple gm"
                        title={item.description || label}
                      >
                        {truncateText(label, 28)}
                      </div>
                    ),
                  });
                });
                const gmDayEvents = gmEventsByDate[day.iso] || [];
                gmDayEvents.forEach((evt, idx) => {
                  const label = evt.title || evt.event_type || "";
                  extraEvents.push({
                    key: `gm-event-${evt.id || idx}`,
                    node: (
                      <div
                        key={`gm-event-${evt.id || idx}`}
                        className="calendar-event simple gm"
                        title={evt.body || label}
                      >
                        {truncateText(label, 28)}
                      </div>
                    ),
                  });
                });
              }
              const dayEvents = [...eventItems, ...extraEvents];
              const visibleEvents = dayEvents.slice(0, maxItems);
              const overflow = Math.max(0, dayEvents.length - visibleEvents.length);
              return (
                <div
                  key={day.iso}
                  className={`calendar-day ${day.inMonth ? "" : "outside"} ${isToday ? "today" : ""}`}
                >
                  <div className="calendar-day-number">{day.day}</div>
                  <div className="calendar-events">
                    {visibleEvents.map((item) => item.node)}
                    {overflow > 0 && (
                      <div className="calendar-more">+{overflow} más</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  };

  const renderCompetitionJornadas = () => {
    if (!teams.length) {
      return (
        <section className="bento competition-page">
          <div className="card competition-jornadas">Sin datos de jornadas.</div>
        </section>
      );
    }

    const roundData =
      competitionViewRounds.find((round) => round.round === competitionRound) || competitionViewRounds[0];

    const changeRound = (direction) => {
      setCompetitionRound((prev) => {
        if (!competitionViewRounds.length) return prev;
        const current = prev || 1;
        const next = Math.min(
          competitionViewRounds.length,
          Math.max(1, current + direction),
        );
        return next;
      });
    };

    return (
      <section className="bento competition-page">
        <div className="card competition-jornadas">
          <div className="calendar-header">
            <div>
              <div className="eyebrow">{activeLeagueConfig.name}</div>
              <h2>{roundData ? `Jornada ${roundData.round}` : "Jornada"}</h2>
            </div>
            <div className="calendar-filters">
              {availableLeagueIds.length > 1 && (
                <label>
                  Liga
                  <select
                    value={activeLeagueId}
                    onChange={(e) => setCompetitionLeagueId(e.target.value)}
                  >
                    {availableLeagueIds.map((leagueId) => (
                      <option key={leagueId} value={leagueId}>
                        {getLeagueConfig(leagueId).name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
          <div className="jornada-controls">
            <button className="subnav-item" type="button" onClick={() => changeRound(-1)}>
              Jornada anterior
            </button>
            <select
              value={competitionRound || ""}
              onChange={(e) => setCompetitionRound(Number(e.target.value))}
            >
              {competitionViewRounds.map((round) => (
                <option key={round.round} value={round.round}>
                  Jornada {round.round}
                </option>
              ))}
            </select>
            <button className="subnav-item" type="button" onClick={() => changeRound(1)}>
              Jornada siguiente
            </button>
          </div>
          <div className="jornada-list">
            {roundData ? (
              roundData.fixtures.map((fixture) => {
                const home = teamMap[fixture.homeId];
                const away = teamMap[fixture.awayId];
                const score = fixture.result
                  ? `${fixture.result.homeScore} - ${fixture.result.awayScore}`
                  : "Pendiente";
                return (
                  <div key={fixture.id} className="jornada-item">
                    <div className="jornada-date">{fixture.date}</div>
                    <div className="jornada-teams">
                      <button className="link mono" type="button" onClick={() => openTeam(fixture.homeId)}>
                        {home?.name || "Equipo"}
                      </button>
                      <span className="jornada-score">{score}</span>
                      <button className="link mono" type="button" onClick={() => openTeam(fixture.awayId)}>
                        {away?.name || "Equipo"}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="desc">Sin jornadas disponibles.</div>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderCompetitionStandings = () => {
    if (!teams.length) {
      return (
        <section className="bento competition-page">
          <div className="card competition-standings">Sin datos de clasificación.</div>
        </section>
      );
    }
    const relegatedSet =
      activeLeagueId === "ACB"
        ? new Set(competitionViewStandings.slice(-ACB_RELEGATION_COUNT).map((row) => String(row.id)))
        : new Set();
    const febDirectId = febPromotionPlayoff.directPromotionId ? String(febPromotionPlayoff.directPromotionId) : "";
    const febWinnerId = febPromotionPlayoff.playoffWinnerId ? String(febPromotionPlayoff.playoffWinnerId) : "";
    const febPlayoffSet =
      activeLeagueId === "FEB"
        ? new Set((febPromotionPlayoff.playoffTeams || []).map((id) => String(id)))
        : new Set();

    const getStatusChip = (rowId) => {
      const id = String(rowId);
      if (activeLeagueId === "ACB" && relegatedSet.has(id)) {
        return { label: "Descenso", tone: "descenso" };
      }
      if (activeLeagueId === "FEB") {
        if (febWinnerId && id === febWinnerId) {
          return { label: "Ascenso ACB", tone: "ascenso" };
        }
        if (febDirectId && id === febDirectId) {
          return { label: "Ascenso directo", tone: "ascenso" };
        }
        if (febPlayoffSet.has(id)) {
          return { label: "Playoff ascenso", tone: "playoff" };
        }
      }
      return null;
    };

    return (
      <section className="bento competition-page">
        <div className="competition-standings-wrapper">
          <div className="card competition-standings">
            <div className="card-header">
              <div>
                <h2>Clasificación {activeLeagueConfig.name}</h2>
                <span className="tag muted">Liga Regular</span>
              </div>
              {availableLeagueIds.length > 1 && (
                <div className="calendar-filters">
                  <label>
                    Liga
                    <select
                      value={activeLeagueId}
                      onChange={(e) => setCompetitionLeagueId(e.target.value)}
                    >
                      {availableLeagueIds.map((leagueId) => (
                        <option key={leagueId} value={leagueId}>
                          {getLeagueConfig(leagueId).name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
            <div className="table standings-table">
              <div className="row head standings">
                <div>#</div>
                <div>Equipo</div>
                <div>W</div>
                <div>L</div>
                <div>PF</div>
                <div>PA</div>
                <div>Diff</div>
                <div>Pct</div>
              </div>
            {competitionViewStandings.map((row, idx) => (
                <div className="row standings" key={row.id}>
                  <div className="mono">{idx + 1}</div>
                  <div>
                    <div className="standings-team">
                      <button className="link mono" type="button" onClick={() => openTeam(row.id)}>
                        {row.name}
                      </button>
                      {(() => {
                        const status = getStatusChip(row.id);
                        if (!status) return null;
                        return <span className={`chip ${status.tone}`}>{status.label}</span>;
                      })()}
                    </div>
                  </div>
                  <div className="mono">{row.w}</div>
                  <div className="mono">{row.l}</div>
                  <div className="mono">{row.pf}</div>
                  <div className="mono">{row.pa}</div>
                  <div className={`mono ${row.diff >= 0 ? "positive" : "negative"}`}>{row.diff}</div>
                  <div className="mono">{row.pct.toFixed(3)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderMentoring = () => {
    const eligibleMentors = myRoster.filter((p) => safeNum(p.data?.bio?.age) >= 24);
    const eligibleMentees = myRoster.filter((p) => safeNum(p.data?.bio?.age) <= 25);
    const selectedMentor = myRoster.find((p) => String(p.id) === String(newMentorId)) || null;
    const mentorTraitOptions = (selectedMentor?.data?.traits || []).map((key, index) => ({
      key,
      label:
        selectedMentor?.data?.traits_label?.[index] ||
        labelMaps.trait?.[key] ||
        humanizeId(key) ||
        key,
    }));
    const mentorPerkOptions = (selectedMentor?.data?.perks || []).map((key, index) => ({
      key,
      label:
        selectedMentor?.data?.perks_label?.[index] ||
        labelMaps.perk?.[key] ||
        humanizeId(key) ||
        key,
    }));
    return (
      <section className="bento mentoring-page">
        <div className="card roster-full mentoring-board">
          <div className="mentoring-toolbar">
            <div className="mentoring-title">
              <div className="mentoring-icon">M</div>
              <div>
                <div className="mentoring-title-text">Mentoring</div>
                <div className="mentoring-sub">
                  <span className="chip muted">{filteredMentoringGroups.length} Grupos Activos</span>
                </div>
              </div>
            </div>
            <div className="mentoring-actions">
              <div className="mentoring-search">
                <input
                  type="text"
                  placeholder=""
                  value={mentoringSearch}
                  onChange={(e) => setMentoringSearch(e.target.value)}
                />
              </div>
              <button className="mentoring-new" onClick={() => setShowMentoringCreate((prev) => !prev)}>
                + Nuevo
              </button>
            </div>
          </div>

          <div className="table mentoring-table">
            <div className="row head mentoring">
              <div>Enfoque</div>
              <div>Mentor</div>
              <div>Aprendices</div>
              <div>Acción</div>
            </div>
            {filteredMentoringGroups.length === 0 ? (
              <div className="row empty mentoring">No se encontraron grupos de mentoría.</div>
            ) : (
              filteredMentoringGroups.map((group) => (
                <div key={group.id} className="row mentoring">
                  <div className="mentoring-focus">
                    <span className="chip influence">{group.focus}</span>
                    {group.isCustom && <span className="pill">Manual</span>}
                  </div>
                  <div>
                    <button className="chip influence" onClick={() => openPlayer(group.mentor.id, toIdList(myRoster))}>
                      {group.mentor.name}
                    </button>
                  </div>
                  <div className="mentoring-mentees">
                    {group.mentees.map((m) => (
                    <button key={m.id} className="chip influence" onClick={() => openPlayer(m.id, toIdList(myRoster))}>
                      {m.name}
                    </button>
                  ))}
                </div>
                  <div className="mentoring-action">
                    <button className="ghost" onClick={() => handleDeleteMentoringGroup(group.id)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {showMentoringCreate && (
            <div className="mentoring-create">
              <div className="card-header">
                <h2>Crear Grupo</h2>
                <span className="tag muted">Manual</span>
              </div>
              <div className="controls">
                <label>
                  Mentor
                  <select value={newMentorId} onChange={(e) => setNewMentorId(e.target.value)}>
                    <option value="">Seleccionar mentor</option>
                    {eligibleMentors.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.data?.bio?.age || "--"}y)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Enfoque
                  <select value={newMentorFocus} onChange={(e) => setNewMentorFocus(e.target.value)}>
                    {ATTRIBUTE_SECTIONS.map((section) => (
                      <optgroup key={section.key} label={section.label}>
                        {section.attrs.map((key) => (
                          <option key={key} value={key}>
                            {getRosterLabel(key)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {mentorTraitOptions.length > 0 && (
                      <optgroup label="Traits del mentor">
                        {mentorTraitOptions.map((item) => (
                          <option key={`trait-${item.key}`} value={item.key}>
                            {item.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {mentorPerkOptions.length > 0 && (
                      <optgroup label="Perks del mentor">
                        {mentorPerkOptions.map((item) => (
                          <option key={`perk-${item.key}`} value={item.key}>
                            {item.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
              </div>
              <div className="mentor-mentees">
                <div className="section-title">Aprendices</div>
                <div className="detail-tags">
                  {eligibleMentees.length === 0 ? (
                    <span className="desc">Sin jóvenes disponibles.</span>
                  ) : (
                    eligibleMentees.map((p) => {
                      const active = newMentorMentees.includes(String(p.id));
                      return (
                        <button
                          key={p.id}
                          className={`chip ${active ? "active" : "muted"}`}
                          onClick={() => toggleMenteeSelection(String(p.id))}
                        >
                          {p.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <button className="primary" onClick={handleCreateMentoringGroup} disabled={!newMentorId || newMentorMentees.length === 0}>
                Crear Grupo
              </button>
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderMedicalOverview = () => (
    <section className="bento">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Medical Overview</h2>
          <span className="tag">Salud</span>
        </div>
        <div className="detail-tags">
          <span className="chip">Club {myTeam.name}</span>
          <span className="chip">Lesionados {injuryList.length}</span>
          <span className="chip">Disponibles {Math.max(0, myRoster.length - injuryList.length)}</span>
        </div>
        <div className="desc">Resumen de estado físico y disponibilidad de la plantilla.</div>
      </div>
      <div className="card metrics attribute-section-refined">
        <div className="card-header">
          <h2>Indicadores</h2>
          <span className="tag muted">Riesgo</span>
        </div>
        <div className="bars">
          <div className="bar">
            <div className="label">Fatiga</div>
            <div className="track"><div className="fill" style={{ width: `${100 - (rosterAttrAverages.fatigue_recov || 0)}%` }} /></div>
            <div className="value mono">{100 - (rosterAttrAverages.fatigue_recov || 0)}</div>
          </div>
          <div className="bar">
            <div className="label">Recuperación</div>
            <div className="track"><div className="fill" style={{ width: `${rosterAttrAverages.fatigue_recov || 0}%` }} /></div>
            <div className="value mono">{rosterAttrAverages.fatigue_recov || 0}</div>
          </div>
          <div className="bar">
            <div className="label">Prevención</div>
            <div className="track"><div className="fill" style={{ width: `${rosterAttrAverages.durability || 0}%` }} /></div>
            <div className="value mono">{rosterAttrAverages.durability || 0}</div>
          </div>
        </div>
      </div>
    </section>
  );

  const renderMedicalInjuredList = () => (
    <section className="bento">
      <div className="card roster player-card-elite">
        <div className="card-header">
          <h2>Injured List</h2>
          <span className="tag muted">Activos</span>
        </div>
        <div className="desc">Lesiones registradas.</div>
        <div className="table injuries">
          <div className="row head injuries">
            <div>Jugador</div>
            <div>Lesión</div>
            <div>Origen</div>
            <div>Días</div>
            <div>Estado</div>
          </div>
          {injuryList.length === 0 ? (
            <div className="row empty">Sin lesionados activos.</div>
          ) : (
            injuryList.map((item) => (
              <div className="row injuries" key={item.player.id}>
                <div>
                  <button className="link mono" onClick={() => openPlayer(item.player.id, toIdList(myRoster))}>
                    {item.player.name}
                  </button>
                </div>
                <div>{item.injury}</div>
                <div>{item.source}</div>
                <div className="mono">{item.days} d</div>
                <div className={`pill ${item.status === "Grave" ? "danger" : item.status === "Moderada" ? "warn" : ""}`}>
                  {item.status}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );

  const renderMedicalHistory = () => (
    <section className="bento">
      <div className="card roster player-card-elite roster-full">
        <div className="card-header">
          <h2>Injury History</h2>
          <span className="tag muted">Temporada</span>
        </div>
        <div className="desc">Histórico de lesiones registradas.</div>
        <div className="table training-table scroll-x">
          <div className="row head training load">
            <div>Jugador</div>
            <div>Lesión</div>
            <div>Origen</div>
            <div>Severidad</div>
            <div>Inicio</div>
            <div>Fin</div>
            <div>Estado</div>
          </div>
          {injuryHistory.length ? (
            injuryHistory.slice(0, 12).map((entry) => {
              const sevKey = String(entry.severity || "").toLowerCase();
              const severity =
                sevKey === "severe" ? "Grave" : sevKey === "moderate" ? "Moderada" : sevKey === "minor" ? "Leve" : "";
              const isRecovered = entry.end_date && loopState?.date
                ? entry.end_date < loopState.date
                : false;
              const status = isRecovered ? "Recuperado" : "Activo";
              return (
                <div className="row training load" key={entry.id}>
                  <div className="mono">{entry.player.name}</div>
                  <div>{entry.label}</div>
                  <div>{entry.source}</div>
                  <div>{severity}</div>
                  <div className="mono">{entry.start_date || ""}</div>
                  <div className="mono">{entry.end_date || ""}</div>
                  <div>
                    <span className={`training-badge ${status === "Activo" ? "warn" : ""}`}>
                      {status}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="row empty">Sin historial registrado.</div>
          )}
        </div>
      </div>
    </section>
  );

  const renderMedicalFacilities = () => (
    <section className="bento">
      <div className="card roster player-card-elite roster-full">
        <div className="card-header">
          <h2>Medical Facilities</h2>
          <span className="tag muted">Infraestructura</span>
        </div>
        <div className="list">
          {(() => {
            const tier = safeNum(myTeam?.data?.tier || 3);
            const level = Math.max(1, 4 - tier);
            const descriptor = level >= 3 ? "élite" : level === 2 ? "avanzado" : "básico";
            return (
              <>
                <div className="list-item">
                  <div className="title">Centro de recuperación</div>
                  <div className="desc">Nivel {level} · Equipamiento {descriptor} para recuperación post-partido.</div>
                </div>
                <div className="list-item">
                  <div className="title">Gimnasio de fuerza</div>
                  <div className="desc">Nivel {level} · Planes personalizados según carga y posición.</div>
                </div>
                <div className="list-item">
                  <div className="title">Biomecánica</div>
                  <div className="desc">Nivel {level} · Análisis de movimiento y prevención de lesiones.</div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </section>
  );

  const renderMedicalStaff = () => (
    <section className="bento">
      <div className="card roster player-card-elite roster-full">
        <div className="card-header">
          <h2>Medical Staff</h2>
          <span className="tag muted">{myStaff.length} miembros</span>
        </div>
        <div className="table training-table scroll-x">
          <div className="row head training">
            <div>Staff</div>
            <div>Rol</div>
            <div>Especialidad</div>
            <div>Turno</div>
            <div>Experiencia</div>
          </div>
          {myStaff.length === 0 ? (
            <div className="row empty">Sin staff médico asignado.</div>
          ) : (
            [...myStaff]
              .map((s) => {
                const attrs = s.attributes || {};
                const medScore = Math.round(
                  (
                    safeNum(attrs.med_diagnosis) +
                    safeNum(attrs.med_acute) +
                    safeNum(attrs.med_chronic) +
                    safeNum(attrs.med_fatigue) +
                    safeNum(attrs.med_prevent)
                  ) / 5,
                );
                return { staff: s, medScore };
              })
              .sort((a, b) => b.medScore - a.medScore)
              .slice(0, 8)
              .map((entry, idx) => (
                <div className="row training" key={`${entry.staff.role_id}-${idx}`}>
                  <div className="mono">{entry.staff.name}</div>
                  <div>{entry.staff.role || "--"}</div>
                  <div>{entry.medScore >= 70 ? "Médico" : "Fisio"}</div>
                  <div>{idx % 3 === 0 ? "Mañana" : idx % 3 === 1 ? "Tarde" : "Mixto"}</div>
                  <div className="mono">{entry.staff.experience_years || 0}y</div>
                </div>
              ))
          )}
        </div>
      </div>
    </section>
  );

  const renderPreventionCenter = () => (
    <section className="bento">
      <div className="card roster player-card-elite roster-full">
        <div className="card-header">
          <h2>Prevention Center</h2>
          <span className="tag muted">Protocolos</span>
        </div>
        <div className="list">
          {(() => {
            const riskIndex = 100 - (rosterAttrAverages.durability || 0);
            const intensity = riskIndex >= 60 ? "Alto" : riskIndex >= 45 ? "Medio" : "Bajo";
            return (
              <>
                <div className="list-item">
                  <div className="title">Control de cargas</div>
                  <div className="desc">Nivel {intensity} · Ajuste según fatiga y recuperación real.</div>
                </div>
                <div className="list-item">
                  <div className="title">Movilidad</div>
                  <div className="desc">Protocolos basados en durabilidad media ({rosterAttrAverages.durability || 0}).</div>
                </div>
                <div className="list-item">
                  <div className="title">Sueño y nutrición</div>
                  <div className="desc">Rutina personalizada según recuperación ({rosterAttrAverages.fatigue_recov || 0}).</div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </section>
  );

  const renderClubProfile = () => {
    if (!myTeam) return renderStart();
    const rosterIds = toIdList(myRoster);
    const avgAge = myRoster.length
      ? Math.round(myRoster.reduce((acc, p) => acc + safeNum(p.data?.bio?.age || 0), 0) / myRoster.length)
      : 0;
    const topPlayers = [...myRoster].sort((a, b) => (rosterScores[b.id] || 0) - (rosterScores[a.id] || 0)).slice(0, 8);
    return (
      <section className="bento club-page">
        <div className="club-grid">
          <div className="card club-card">
            <div className="club-card-head">
              <h2>{myTeam.name}</h2>
              <span className="pill">Club Profile</span>
            </div>
            <div className="club-tags">
              <span className="chip">Ciudad {myTeam.data?.city || "--"}</span>
              <span className="chip">Budget {myTeam.data?.budget || "--"}</span>
              <span className="chip">Reputación {myTeam.data?.reputation || "--"}</span>
              <span className="chip">Roster {myRoster.length}</span>
              <span className="chip muted">Masa salarial {Math.round(clubPayroll / 1000)}K</span>
              <span className="chip muted">Edad media {avgAge}</span>
              <span className="chip muted">Staff {myStaff.length}</span>
              <span className="chip muted">Directiva {myBoard.length}</span>
            </div>
          </div>

          <div className="card club-card accent">
            <div className="card-header">
              <h2>Jugadores Clave</h2>
              <span className="pill muted">Top 8</span>
            </div>
            <div className="club-player-list">
              {topPlayers.length === 0 ? (
                <div className="desc">Sin datos.</div>
              ) : (
                topPlayers.map((p) => {
                  const archeId = p.data?.identity?.arquetipo;
                  const archeLabel = p.data?.identity?.arquetipo_label || labelFor("arche", archeId);
                  return (
                    <div key={p.id} className="club-player" onClick={() => openPlayer(p.id, rosterIds)}>
                      <div className="club-player-main">
                        <div className="club-player-name">{p.name}</div>
                        <div className="club-player-role">{archeLabel || "--"}</div>
                      </div>
                      <div className="club-player-meta">
                        <div className="club-player-pos">{p.data?.bio?.pos || "--"}</div>
                        <div className="club-player-nat">{p.data?.bio?.nationality || "--"}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderEquipo = () => {
    if (!myTeam) return renderStart();

    const rosterIds = toIdList(filteredPlayers);
    const rosterSections = [
      { id: "plantilla", label: "Plantilla" },
      { id: "analysis", label: "Análisis + Dinámicas" },
      { id: "mentoring", label: "Mentoring" },
    ];
    const showCustomRosterView = customRosterColumns.length > 0 || activeRosterView === "custom";

    return (
      <div className="roster-page tabular">
        <div className="roster-subnav-bar">
          <div className="roster-subnav">
            <span className="roster-subnav-label">Sección</span>
            <select
              className="roster-subnav-select"
              value={rosterView}
              onChange={(e) => setRosterView(e.target.value)}
            >
              {rosterSections.map((section) => (
                <option key={section.id} value={section.id}>{section.label}</option>
              ))}
            </select>
          </div>
          {rosterView === "plantilla" && (
            <div className="roster-subnav">
              <span className="roster-subnav-label">Vista</span>
              <select
                className="roster-subnav-select"
                value={activeRosterView}
                onChange={(e) => handleRosterViewChange(e.target.value)}
              >
                {ROSTER_VIEWS.map((view) => (
                  <option key={view.id} value={view.id}>{view.name}</option>
                ))}
                {showCustomRosterView && (
                  <option value="custom">Personalizada</option>
                )}
              </select>
            </div>
          )}
        </div>

        <section className="bento">

        {rosterView === "plantilla" && (
          <>
            <div className="card roster-toolbar roster-full">
              <div className="roster-toolbar-top">
                <div className="roster-toolbar-left">
                  <div className="roster-toolbar-icon">
                    <img src={iconRoster} alt="Plantilla" />
                  </div>
                  <div>
                    <div className="roster-toolbar-title">Plantilla ({sortedRoster.length})</div>
                    <div className="roster-toolbar-sub">{myTeam.name}</div>
                  </div>
                </div>
                <div className="roster-toolbar-right">
                  <div className="roster-search">
                    <input
                      type="text"
                      placeholder=""
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                    />
                  </div>
                  <div className="roster-column-picker" ref={rosterColumnPickerRef}>
                    <button
                      className={`icon-btn ${showRosterColumnPicker ? "active" : ""}`}
                      title="Configurar columnas"
                      onClick={() => setShowRosterColumnPicker((prev) => !prev)}
                    >
                      <img src={iconSettings} alt="Configurar" />
                    </button>
                    {showRosterColumnPicker && (
                      <div className="roster-column-popover">
                        <div className="roster-column-header">
                          <div className="roster-column-title">Columnas</div>
                          <div className="roster-column-actions">
                            <button
                              className="ghost roster-column-action"
                              onClick={() => updateRosterColumns(ROSTER_VIEWS[0].columns.slice())}
                            >
                              Reset
                            </button>
                            <button
                              className="ghost roster-column-action"
                              onClick={() => updateRosterColumns([])}
                            >
                              Solo nombre
                            </button>
                          </div>
                        </div>
                        <div className="roster-column-list">
                          {rosterColumnGroups.map((group) => (
                            <div key={group.id} className="roster-column-group">
                              <div className="roster-column-group-title">{group.label}</div>
                              <div className="roster-column-grid">
                                {group.keys.map((key) => {
                                  const active = visibleRosterColumns.includes(key);
                                  return (
                                    <button
                                      key={key}
                                      className={`roster-column-item ${active ? "active" : ""}`}
                                      onClick={() => toggleRosterColumn(key)}
                                    >
                                      <span>{getRosterLabel(key)}</span>
                                      <span className="roster-column-check">{active ? "ON" : ""}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card roster player-card-elite roster-full roster-grid-card">
              <div className="table roster-table">
                <div className="row head roster-table" style={{ gridTemplateColumns: rosterColumnTemplate }}>
                  <div className="roster-head-cell status" title="Estado">
                    Est
                  </div>
                  <div className="roster-head-cell" onClick={() => handleRosterSort("name")} title="Jugador">
                    Jugador
                    {rosterSort.key === "name" && (
                      <span className="sort-indicator">{rosterSort.direction === "asc" ? "▲" : "▼"}</span>
                    )}
                  </div>
                  {visibleRosterColumns.map((key, index) => {
                    const isDragging = draggedRosterColIndex === index;
                    return (
                      <div
                        key={key}
                        className={`roster-head-cell ${isDragging ? "dragging" : ""}`}
                        draggable
                        onDragStart={() => handleRosterDragStart(index)}
                        onDragOver={handleRosterDragOver}
                        onDrop={() => handleRosterDrop(index)}
                        onDragEnd={() => setDraggedRosterColIndex(null)}
                        onClick={() => handleRosterSort(key)}
                        title={getRosterLabel(key)}
                        style={{ textAlign: rosterColumnMeta[key]?.align || "center" }}
                      >
                        {getRosterLabel(key)}
                        {rosterSort.key === key && (
                          <span className="sort-indicator">{rosterSort.direction === "asc" ? "▲" : "▼"}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {sortedRoster.length === 0 ? (
                  <div className="row empty">Sin datos. {loadingPlayers ? "Cargando..." : ""}</div>
                ) : (
                  sortedRoster.map((p) => {
                    const statusBadges = getRosterStatusBadges(p);
                    return (
                      <div 
                        className="row roster-table" 
                        style={{ gridTemplateColumns: rosterColumnTemplate }} 
                        key={p.id} 
                        role="button"
                        tabIndex={0}
                        onClick={() => openPlayer(p.id, rosterIds)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openPlayer(p.id, rosterIds);
                          }
                        }}
                        onContextMenu={(e) => 
                          openContextMenu(e, [ 
                            ...buildPlayerContextActions(p, rosterIds), 
                            { 
                              label: shortlist[p.id] ? "Quitar de watchlist" : "Añadir a watchlist", 
                              onClick: () => toggleShortlist(p.id), 
                            }, 
                          ]) 
                        } 
                      > 
                        <div className="roster-cell status">
                          <div className="status-badges">
                            {statusBadges.map((status) => (
                              <span
                                key={`${p.id}-${status.code}`}
                                className={`status-badge ${status.tone}`}
                                title={status.label}
                              >
                                {status.code}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="roster-cell name">
                          <button
                            className="link mono"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPlayer(p.id, rosterIds);
                            }}
                          >
                            {p.name}
                          </button>
                        </div>
                        {visibleRosterColumns.map((key) => (
                          <div
                            key={`${p.id}-${key}`}
                            className="roster-cell"
                            style={{ textAlign: rosterColumnMeta[key]?.align || "center" }}
                          >
                            {getRosterValue(p, key)}
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}

        {rosterView !== "plantilla" && null}
        {rosterView === "analysis" && renderRosterAnalysis()}
        {rosterView === "mentoring" && renderMentoring()}
        </section>
      </div>
    );
  };

  const renderTeamTraining = () => {
    if (!myTeam) return renderStart();
    const weekStart = trainingWeekStart;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekRange = `${weekStart.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} - ${weekEnd.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;
    const calendarBaseDate = loopState?.date ? parseIsoDate(loopState.date) : new Date();
    const firstOfMonth = new Date(calendarBaseDate.getFullYear(), calendarBaseDate.getMonth(), 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const editingEffects = trainingEditingSession ? computeTrainingEffects(trainingEditingSession) : null;
    const formatTrainingAttr = (key) => attributeLabelMap[key] || humanizeId(key);
    const editingAttrList = editingEffects?.attributeKeys || [];
    const editingAttrTooltip = editingAttrList.length ? editingAttrList.map(formatTrainingAttr).join(", ") : "";
    const sessionCountByDate = new Map();
    trainingSavedSessions.forEach((s) => {
      if (!s?.date) return;
      sessionCountByDate.set(s.date, (sessionCountByDate.get(s.date) || 0) + 1);
    });
    trainingPlan.forEach((day, dayIndex) => {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + dayIndex);
      const dayStr = isoDate(dayDate);
      sessionCountByDate.set(dayStr, day.sessions.length);
    });
    const matchDaySet = new Set(
      loopSchedule
        .filter((f) => String(f.homeId) === String(myTeamId) || String(f.awayId) === String(myTeamId))
        .map((f) => f.date),
    );

    const gameBaseDate = loopState?.date ? parseIsoDate(loopState.date) : new Date();
    const gameTomorrow = addDays(gameBaseDate, 1);
    gameTomorrow.setHours(0, 0, 0, 0);
    const isDatePast = (date) => {
      const check = new Date(date);
      check.setHours(0, 0, 0, 0);
      return check < gameTomorrow;
    };

    const changeWeek = (direction) => {
      const next = new Date(weekStart);
      next.setDate(next.getDate() + (direction === "next" ? 7 : -7));
      const nextEnd = new Date(next);
      nextEnd.setDate(next.getDate() + 6);
      if (direction === "prev" && nextEnd < gameTomorrow) {
        alert("No puedes programar entrenamientos en semanas pasadas.");
        return;
      }
      setTrainingWeekTouched(true);
      setTrainingWeekStart(next);
    };

    const handleGeneratePlan = () => {
      setTrainingLoading(true);
      setTimeout(() => {
        setTrainingPlan(generateTrainingSchedule(trainingContext, weekStart));
        setTrainingLoading(false);
      }, 350);
    };

    const handleSavePlan = () => {
      if (!myTeamId) return;
      const weekKey = `pcbasket.training.week.${myTeamId}.${isoDate(weekStart)}`;
      const sessionsKey = `pcbasket.training.sessions.${myTeamId}`;
      const weekSessions = [];
      trainingPlan.forEach((day, idx) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + idx);
        if (isDatePast(date)) return;
        const dateStr = isoDate(date);
        if (isMatchDay(dateStr)) return;
        const dayName = WEEKDAY_LABELS[date.getDay()] || day.dayName || "Lunes";
        day.sessions.forEach((session) => {
          const enriched = session.effects ? session : withTrainingEffects(session);
          weekSessions.push({
            ...enriched,
            clubId: myTeamId,
            date: dateStr,
            dayName,
          });
        });
      });

      const weekStartIso = isoDate(weekStart);
      const weekEndDate = new Date(weekStart);
      weekEndDate.setDate(weekStart.getDate() + 6);
      const weekEndIso = isoDate(weekEndDate);
      const retained = trainingSavedSessions.filter((s) => s.date < weekStartIso || s.date > weekEndIso);
      const merged = [...retained, ...weekSessions];
      window.localStorage?.setItem(weekKey, JSON.stringify({ context: trainingContext, plan: trainingPlan }));
      window.localStorage?.setItem(sessionsKey, JSON.stringify(merged));
      setTrainingSavedSessions(merged);
      setTrainingSaved(true);
      setTimeout(() => setTrainingSaved(false), 2000);
    };

    const handleAddSession = (dayIndex) => {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + dayIndex);
      const dayStr = isoDate(dayDate);
      if (isMatchDay(dayStr)) {
        alert("No puedes programar entrenamientos en dia de partido.");
        return;
      }
      if (isDatePast(dayDate)) {
        alert("No puedes programar entrenamientos en fechas pasadas.");
        return;
      }
      if (trainingPlan[dayIndex]?.sessions?.length >= MAX_TRAINING_SESSIONS_PER_DAY) {
        alert(`Maximo ${MAX_TRAINING_SESSIONS_PER_DAY} sesiones por dia.`);
        return;
      }
      const defaultType = TRAINING_TYPES[0];
      setTrainingEditingDay(dayIndex);
      setTrainingEditingSession({
        id: "",
        type: defaultType,
        startTime: "10:00",
        endTime: "11:30",
        intensity: "Media",
        focus: TRAINING_CATALOG[defaultType][0],
      });
    };

    const handleEditSession = (dayIndex, session) => {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + dayIndex);
      const dayStr = isoDate(dayDate);
      if (isMatchDay(dayStr)) {
        alert("No puedes editar entrenamientos en dia de partido.");
        return;
      }
      if (isDatePast(dayDate)) {
        alert("No puedes editar entrenamientos en fechas pasadas.");
        return;
      }
      setTrainingEditingDay(dayIndex);
      setTrainingEditingSession({ ...session });
    };

    const handleDeleteSession = (dayIndex, sessionId) => {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + dayIndex);
      if (isDatePast(dayDate)) {
        alert("No puedes eliminar entrenamientos en fechas pasadas.");
        return;
      }
      setTrainingPlan((prev) =>
        prev.map((day, idx) => {
          if (idx !== dayIndex) return day;
          return { ...day, sessions: day.sessions.filter((s) => s.id !== sessionId) };
        }),
      );
    };

    const handleTypeChange = (type) => {
      if (!trainingEditingSession) return;
      const focus = TRAINING_CATALOG[type]?.[0] || trainingEditingSession.focus;
      setTrainingEditingSession({ ...trainingEditingSession, type, focus });
    };

    const handleModalSave = () => {
      if (trainingEditingDay === null || !trainingEditingSession) return;
      const session = {
        ...trainingEditingSession,
        id: trainingEditingSession.id || (crypto?.randomUUID?.() || `${Date.now()}`),
        effects: computeTrainingEffects(trainingEditingSession),
      };
      setTrainingPlan((prev) =>
        prev.map((day, idx) => {
          if (idx !== trainingEditingDay) return day;
          const exists = day.sessions.find((s) => s.id === session.id);
          if (exists) {
            return {
              ...day,
              sessions: day.sessions.map((s) => (s.id === session.id ? session : s)),
            };
          }
          if (day.sessions.length >= MAX_TRAINING_SESSIONS_PER_DAY) {
            alert(`Maximo ${MAX_TRAINING_SESSIONS_PER_DAY} sesiones por dia.`);
            return day;
          }
          return { ...day, sessions: [...day.sessions, session] };
        }),
      );
      setTrainingEditingDay(null);
      setTrainingEditingSession(null);
    };

    const closeTrainingModal = () => {
      setTrainingEditingDay(null);
      setTrainingEditingSession(null);
    };

    return (
      <section className="bento training-team">
        <div className="card roster player-card-elite roster-full training-hero">
          <div className="training-hero-top">
            <div>
              <h2>Team Training</h2>
              <div className="training-hero-sub">
                {trainingContext} · Semana {weekRange}
              </div>
            </div>
            <div className="training-hero-tags">
              <div className="training-hero-indicators">
                <div className="training-indicator">
                  <Activity size={14} />
                  <span className="label">Carga</span>
                  <span className="value">{trainingLoad.status}</span>
                </div>
                <div className="training-indicator">
                  <Battery size={14} />
                  <span className="label">Total</span>
                  <span className="value">{Math.round(trainingLoad.total)} AU</span>
                </div>
              </div>
            </div>
          </div>

          <div className="training-hero-controls">
            <div className="training-control">
              <label>Modo</label>
              <button
                className={`training-toggle ${trainingAutoMode ? "active" : ""}`}
                onClick={() => setTrainingAutoMode(!trainingAutoMode)}
              >
                {trainingAutoMode ? "Automatico" : "Manual"}
              </button>
            </div>
            <div className="training-control">
              <label>Responsable</label>
              <select
                value={trainingStaffId || ""}
                onChange={(e) => setTrainingStaffId(Number(e.target.value))}
              >
                {trainingStaff.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="training-control">
              <label>Contexto</label>
              <select
                value={trainingContext}
                onChange={(e) => {
                  setTrainingContext(e.target.value);
                  if (trainingAutoMode) {
                    setTrainingPlan(generateTrainingSchedule(e.target.value, weekStart));
                  }
                }}
              >
                {TRAINING_CONTEXTS.map((ctx) => (
                  <option key={ctx} value={ctx}>{ctx}</option>
                ))}
              </select>
            </div>
            <div className="training-control actions">
              {trainingAutoMode && (
                <button className="training-btn" onClick={handleGeneratePlan} disabled={trainingLoading}>
                  {trainingLoading ? "Generando..." : "Auto-Generar"}
                </button>
              )}
              <button className="training-btn primary" onClick={handleSavePlan}>
                {trainingSaved ? "Guardado" : "Guardar Plan"}
              </button>
            </div>
          </div>
        </div>

        <div className="training-layout">
          <div className="training-plan">
            <div className="training-week-nav">
              <button onClick={() => changeWeek("prev")}>Anterior</button>
              <div>
                <div className="training-week-range">{weekRange}</div>
                <div className="training-week-sub">Semana de planificacion</div>
              </div>
              <button onClick={() => changeWeek("next")}>Siguiente</button>
            </div>

            <div className="training-days">
              {trainingPlan.map((day, dayIndex) => {
                const dayDate = new Date(weekStart);
                dayDate.setDate(weekStart.getDate() + dayIndex);
                const dayLabel = WEEKDAY_LABELS[dayDate.getDay()] || day.dayName;
                const dayStr = isoDate(dayDate);
                const past = isDatePast(dayDate);
                const hasMatch = isMatchDay(dayStr);
                const atLimit = day.sessions.length >= MAX_TRAINING_SESSIONS_PER_DAY;
                return (
                  <div
                    key={`${day.dayName}-${dayIndex}`}
                    className={`training-day ${past ? "past" : ""} ${hasMatch ? "match" : ""}`}
                  >
                    <div className="training-day-head">
                      <span>{dayLabel}</span>
                      {hasMatch && <span className="training-match-pill">Partido</span>}
                      {!past && !hasMatch && (
                        <button onClick={() => handleAddSession(dayIndex)} disabled={atLimit}>
                          {atLimit ? `Max ${MAX_TRAINING_SESSIONS_PER_DAY}` : "+ Sesion"}
                        </button>
                      )}
                    </div>
                    <div className="training-day-body">
                      {hasMatch ? (
                        <div className="training-day-empty">Dia de partido (sin sesiones)</div>
                      ) : day.sessions.length === 0 ? (
                        <div className="training-day-empty">Descanso total</div>
                      ) : (
                        day.sessions.map((session) => (
                          <div
                            key={session.id}
                            className="training-session"
                            onClick={() => handleEditSession(dayIndex, session)}
                          >
                            <div className="training-session-top">
                              <div>{session.type}</div>
                              {!past && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSession(dayIndex, session.id);
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            <div className="training-session-meta">
                              <span>{session.startTime} - {session.endTime}</span>
                              <span>{session.focus}</span>
                            </div>
                            <div className={`training-session-intensity ${session.intensity.replace(" ", "-")}`}>
                              {session.intensity}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="training-calendar">
            <div className="training-calendar-header">
              <h3>Calendario Mes</h3>
              <span>{calendarBaseDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</span>
            </div>
            <div className="training-calendar-grid">
              {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
                <div key={d} className="training-calendar-weekday">{d}</div>
              ))}
              {Array.from({ length: startOffset }).map((_, idx) => (
                <div key={`offset-${idx}`} />
              ))}
              {trainingMonthDays.map((d) => {
                const dayDate = new Date(calendarBaseDate.getFullYear(), calendarBaseDate.getMonth(), d.day);
                const dayStr = isoDate(dayDate);
                const sessionCount = sessionCountByDate.get(dayStr) || 0;
                const isMatch = matchDaySet.has(dayStr);
                const sessionClass =
                  sessionCount >= 3
                    ? "sessions-3"
                    : sessionCount === 2
                      ? "sessions-2"
                      : sessionCount === 1
                        ? "sessions-1"
                        : "";
                return (
                  <div
                    key={`day-${d.day}`}
                    className={`training-calendar-day ${sessionClass} ${isMatch ? "match-day" : ""}`}
                    title={sessionCount ? `${sessionCount} sesiones` : isMatch ? "Partido" : undefined}
                  >
                    <span>{d.day}</span>
                    {sessionCount > 0 && <div className="training-calendar-badge">{sessionCount}</div>}
                  </div>
                );
              })}
            </div>
            <div className="training-calendar-note">
              {trainingAutoMode
                ? "Modo automatico activo. Partidos en naranja y sin sesiones permitidas."
                : `Modo manual: ${trainingSavedSessions.length} sesiones programadas. Partidos en naranja sin sesiones.`}
            </div>
          </div>
        </div>

        {trainingEditingDay !== null && trainingEditingSession && (
          <div className="training-modal" onClick={closeTrainingModal}>
            <div className="training-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="training-modal-header">
                <h3>{trainingEditingSession.id ? "Editar sesion" : "Nueva sesion"}</h3>
                <button onClick={closeTrainingModal}>×</button>
              </div>
              <div className="training-modal-body">
                <label>Tipo de entrenamiento</label>
                <select value={trainingEditingSession.type} onChange={(e) => handleTypeChange(e.target.value)}>
                  {TRAINING_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <div className="training-modal-grid">
                  <div>
                    <label>Inicio</label>
                    <input
                      type="time"
                      value={trainingEditingSession.startTime}
                      onChange={(e) => setTrainingEditingSession({ ...trainingEditingSession, startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Fin</label>
                    <input
                      type="time"
                      value={trainingEditingSession.endTime}
                      onChange={(e) => setTrainingEditingSession({ ...trainingEditingSession, endTime: e.target.value })}
                    />
                  </div>
                </div>
                <label>Intensidad</label>
                <div className="training-intensity">
                  {TRAINING_INTENSITIES.filter((i) => i !== "Descanso").map((level) => (
                    <button
                      key={level}
                      className={trainingEditingSession.intensity === level ? "active" : ""}
                      onClick={() => setTrainingEditingSession({ ...trainingEditingSession, intensity: level })}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <label>Foco principal</label>
                <select
                  value={trainingEditingSession.focus}
                  onChange={(e) => setTrainingEditingSession({ ...trainingEditingSession, focus: e.target.value })}
                >
                  {(TRAINING_CATALOG[trainingEditingSession.type] || []).map((focus) => (
                    <option key={focus} value={focus}>{focus}</option>
                  ))}
                </select>
                <div className="training-modal-impact">
                  Impacto: {trainingDuration(trainingEditingSession.startTime, trainingEditingSession.endTime) * (TRAINING_RPE[trainingEditingSession.intensity] || 0)} AU
                </div>
                {editingEffects && (
                  <div className="training-modal-effects">
                    <div className="training-modal-effects-title">Microefectos</div>
                    <div className="training-modal-effects-grid">
                      <div
                        className={`training-effect-attr ${editingAttrTooltip ? "has-tip" : ""}`}
                        data-tooltip={editingAttrTooltip}
                      >
                        Atributos +{editingEffects.attributes}
                      </div>
                      <div>Cohesion +{editingEffects.cohesion}</div>
                      <div>Familiaridad tactica +{editingEffects.tactical}</div>
                      <div>Forma fisica +{editingEffects.fitness}</div>
                      <div>Moral +{editingEffects.morale}</div>
                      <div>Preparacion partido +{editingEffects.prep}</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="training-modal-actions">
                <button onClick={closeTrainingModal}>Cancelar</button>
                <button className="primary" onClick={handleModalSave}>
                  {trainingEditingSession.id ? "Guardar cambios" : "Anadir sesion"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  };

  const renderPersonalTraining = () => {
    return (
      <section className="bento">
        <div className="card roster player-card-elite roster-full">
          <div className="card-header">
            <h2>Personal Training</h2>
            <span className="tag muted">{myRoster.length} jugadores</span>
          </div>
        <div className="table training-table scroll-x">
            <div className="row head training">
              <div>Jugador</div>
              <div>Pos</div>
              <div>Focus</div>
              <div>Intensidad</div>
              <div>Objetivo</div>
            </div>
            {myRoster.map((p, idx) => (
              (() => {
                const scores = ATTRIBUTE_SECTIONS.map((section) => ({
                  key: section.key,
                  label: section.label,
                  avg: Math.round(sectionAverage(p, section.key) / 10),
                })).sort((a, b) => a.avg - b.avg);
                const weakest = scores[0];
                const metrics = getLoadMetrics(p);
                const intensity =
                  metrics.stamina < 55 || metrics.recov < 55 ? "Baja" : metrics.stamina < 70 ? "Media" : "Alta";
                return (
                  <div className="row training" key={p.id}>
                    <div>
                      <button className="link mono" onClick={() => openPlayer(p.id)}>
                        {p.name}
                      </button>
                    </div>
                    <div className="mono">{p.data?.bio?.pos || "--"}</div>
                    <div>{weakest?.label || "--"}</div>
                    <div>
                      <span className="training-pill">{intensity}</span>
                    </div>
                    <div className="desc">Mejorar {weakest?.label?.toLowerCase() || "base"}</div>
                  </div>
                );
              })()
            ))}
          </div>
        </div>
      </section>
    );
  };

  const renderLoadManagement = () => {
    const loadTheme = isLight
      ? {
          cardBg: "var(--surface-primary)",
          cardBorder: "1px solid rgba(15, 23, 42, 0.12)",
          text: "var(--text-primary)",
          muted: "var(--text-dim)",
          barBg: "rgba(15, 23, 42, 0.12)",
          inputBg: "rgba(15, 23, 42, 0.04)",
          inputBorder: "1px solid rgba(15, 23, 42, 0.12)",
          inputText: "var(--text-primary)",
          buttonBg: "rgba(15, 23, 42, 0.06)",
          buttonBorder: "1px solid rgba(15, 23, 42, 0.12)",
          buttonBorderColor: "rgba(15, 23, 42, 0.12)",
          menuBg: "var(--surface-primary)",
          menuBorder: "1px solid rgba(15, 23, 42, 0.12)",
          menuShadow: "0 12px 30px rgba(15, 23, 42, 0.15)",
          menuHover: "rgba(15, 23, 42, 0.08)",
          filterBg: "rgba(250, 204, 21, 0.18)",
          filterBorder: "rgba(250, 204, 21, 0.35)",
          filterText: "#92400e",
          activeText: "#ffffff",
          inactiveText: "var(--text-dim)",
        }
      : {
          cardBg: "rgba(15, 23, 42, 0.75)",
          cardBorder: "1px solid rgba(255,255,255,0.08)",
          text: "#cbd5e1",
          muted: "#94a3b8",
          barBg: "#334155",
          inputBg: "rgba(255,255,255,0.05)",
          inputBorder: "1px solid rgba(255,255,255,0.1)",
          inputText: "white",
          buttonBg: "rgba(255,255,255,0.05)",
          buttonBorder: "1px solid rgba(255,255,255,0.1)",
          buttonBorderColor: "rgba(255,255,255,0.1)",
          menuBg: "#1e293b",
          menuBorder: "1px solid #475569",
          menuShadow: "0 10px 30px rgba(0,0,0,0.5)",
          menuHover: "#334155",
          filterBg: "rgba(234, 179, 8, 0.1)",
          filterBorder: "rgba(234, 179, 8, 0.3)",
          filterText: "#fef08a",
          activeText: "white",
          inactiveText: "#94a3b8",
        };

    const rosterIds = toIdList(myRoster);
    const loadColumnTemplate = loadVisibleColumns
      .map((key) => `${loadColWidths[key] || LOAD_COLUMNS_DEF[key].defaultWidth}px`)
      .join(" ");
    const renderCell = (key, player) => {
      const val = player[key];

      if (key === "name") {
        return (
          <div style={{ fontWeight: "bold" }}>
            <button className="link mono" onClick={() => openPlayer(player.id, rosterIds)}>
              {player.name}
            </button>
          </div>
        );
      }
      if (key === "dorsal") return <div style={{ textAlign: "center", color: loadTheme.muted }}>{val}</div>;
      if (key === "position") {
        return (
          <div
            style={{
              textAlign: "center",
              fontSize: "0.75rem",
              fontWeight: "bold",
              color: "#38bdf8",
              background: "rgba(56, 189, 248, 0.12)",
              padding: "2px 4px",
              borderRadius: 4,
              border: "1px solid rgba(56, 189, 248, 0.35)",
            }}
          >
            {val}
          </div>
        );
      }

      if (key === "ratio") {
        let color = "#22c55e";
        if (val > 1.3) color = "#ef4444";
        else if (val < 0.8) color = "#eab308";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontWeight: "bold", color, fontSize: "0.95rem" }}>{val}</div>
            {val > 1.3 && <AlertTriangle size={14} color="#ef4444" />}
          </div>
        );
      }

      if (key === "status") {
        const config = {
          Risk: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.2)", label: "ALTO RIESGO" },
          Low: { color: "#eab308", bg: "rgba(234, 179, 8, 0.2)", label: "BAJA CARGA" },
          Optimal: { color: "#22c55e", bg: "rgba(34, 197, 94, 0.2)", label: "OPTIMO" },
        }[val] || { color: loadTheme.text, bg: "transparent", label: val };
        return (
          <span
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: "0.7rem",
              fontWeight: "bold",
              background: config.bg,
              color: config.color,
              border: `1px solid ${config.color}`,
            }}
          >
            {config.label}
          </span>
        );
      }

      if (key === "fatigue" || key === "desgaste") {
        const color = val > 80 ? "#ef4444" : val > 50 ? "#eab308" : "#3b82f6";
        return (
          <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: loadTheme.barBg, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${val}%`, height: "100%", background: color }} />
            </div>
            <span style={{ fontSize: "0.75rem", color: loadTheme.text, width: 28, textAlign: "right" }}>{val}%</span>
          </div>
        );
      }

      if (key === "trend") {
        if (val === "up") return <TrendingUp size={16} color="#ef4444" title="Subiendo carga" />;
        if (val === "down") return <TrendingDown size={16} color="#22c55e" title="Bajando carga" />;
        return <Minus size={16} color={loadTheme.muted} />;
      }

      return <div style={{ fontSize: "0.85rem", color: loadTheme.text }}>{val}</div>;
    };

    return (
      <section className="bento">
        <div className="card roster player-card-elite roster-full">
          <div className="card-header">
            <h2>Load Management</h2>
            <span className="tag muted">Control de cargas</span>
          </div>

          <div onClick={() => setLoadHeaderMenu(null)} style={{ height: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 15 }}>
              <div style={{ background: loadTheme.cardBg, padding: "15px 20px", borderRadius: 10, borderLeft: "4px solid #ef4444", display: "flex", justifyContent: "space-between", alignItems: "center", border: loadTheme.cardBorder }}>
                <div>
                  <div style={{ fontSize: "0.8rem", color: loadTheme.muted }}>ALERTA LESION</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: loadTheme.text }}>{loadManagementStats.risk}</div>
                </div>
                <Activity color="#ef4444" size={24} />
              </div>
              <div style={{ background: loadTheme.cardBg, padding: "15px 20px", borderRadius: 10, borderLeft: "4px solid #22c55e", display: "flex", justifyContent: "space-between", alignItems: "center", border: loadTheme.cardBorder }}>
                <div>
                  <div style={{ fontSize: "0.8rem", color: loadTheme.muted }}>CARGA OPTIMA</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: loadTheme.text }}>{loadManagementStats.optimal}</div>
                </div>
                <Check color="#22c55e" size={24} />
              </div>
              <div style={{ background: loadTheme.cardBg, padding: "15px 20px", borderRadius: 10, borderLeft: "4px solid #eab308", display: "flex", justifyContent: "space-between", alignItems: "center", border: loadTheme.cardBorder }}>
                <div>
                  <div style={{ fontSize: "0.8rem", color: loadTheme.muted }}>FATIGA MEDIA</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: loadTheme.text }}>{loadManagementStats.avgFatigue}%</div>
                </div>
                <Battery color="#eab308" size={24} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 5px" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {loadViews.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => switchLoadView(v.id)}
                    style={{
                      background: loadActiveViewId === v.id ? "#3b82f6" : loadTheme.buttonBg,
                      border: "1px solid",
                      borderColor: loadActiveViewId === v.id ? "#3b82f6" : loadTheme.buttonBorderColor,
                      color: loadActiveViewId === v.id ? loadTheme.activeText : loadTheme.inactiveText,
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: loadTheme.muted }} />
                  <input
                    type="text"
                    placeholder=""
                    value={loadSearchQuery}
                    onChange={(e) => setLoadSearchQuery(e.target.value)}
                    style={{
                      background: loadTheme.inputBg,
                      border: loadTheme.inputBorder,
                      color: loadTheme.inputText,
                      padding: "6px 10px 6px 35px",
                      borderRadius: 6,
                      fontSize: "0.8rem",
                      outline: "none",
                      width: 180,
                    }}
                  />
                </div>
                <button
                  onClick={() => setLoadShowFilters(!loadShowFilters)}
                  style={{
                    background: loadShowFilters ? "#eab308" : loadTheme.buttonBg,
                    color: loadShowFilters ? "#111827" : loadTheme.inputText,
                    border: loadTheme.buttonBorder,
                    padding: "6px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                  }}
                >
                  <Filter size={14} /> Filtros
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLoadHeaderMenu({ x: e.clientX, y: e.clientY });
                  }}
                  style={{
                    background: loadTheme.buttonBg,
                    border: loadTheme.buttonBorder,
                    color: loadTheme.inputText,
                    padding: "6px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
            </div>

            {loadShowFilters && (
              <div style={{ background: loadTheme.filterBg, border: `1px solid ${loadTheme.filterBorder}`, borderRadius: 8, padding: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: loadTheme.filterText, cursor: "pointer", fontWeight: "bold" }}>
                  <input type="checkbox" checked={loadFilters.onlyRisk} onChange={(e) => setLoadFilters({ ...loadFilters, onlyRisk: e.target.checked })} />
                  Solo Alto Riesgo
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: loadTheme.filterText, cursor: "pointer", fontWeight: "bold" }}>
                  <input type="checkbox" checked={loadFilters.highFatigue} onChange={(e) => setLoadFilters({ ...loadFilters, highFatigue: e.target.checked })} />
                  Fatiga Alta (&gt;70%)
                </label>
              </div>
            )}

            <div className="table roster-table">
              <div className="row head roster-table" style={{ gridTemplateColumns: loadColumnTemplate }}>
                {loadVisibleColumns.map((colKey, index) => {
                  const col = LOAD_COLUMNS_DEF[colKey];
                  if (!col) return null;
                  const sortIdx = loadSortConfig.findIndex((s) => s.key === colKey);
                  const isSorted = sortIdx >= 0;
                  return (
                    <div
                      key={colKey}
                      className="roster-head-cell"
                      onClick={() => handleLoadSort(colKey)}
                      title={col.tooltip}
                      style={{
                        justifyContent: colKey === "name" ? "flex-start" : "center",
                        textAlign: colKey === "name" ? "left" : "center",
                        position: "relative",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {index > 2 && <GripVertical size={12} color={loadTheme.muted} />}
                        <span>{col.label}</span>
                        {isSorted && (loadSortConfig[sortIdx].direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </div>
                      <div
                        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, cursor: "col-resize", background: "transparent" }}
                        onMouseDown={(e) => handleLoadResizeStart(colKey, e)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#3b82f6"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      />
                    </div>
                  );
                })}
              </div>
              {loadManagementFiltered.length === 0 ? (
                <div className="row empty">Sin datos.</div>
              ) : (
                loadManagementFiltered.map((p, rowIndex) => (
                  <div
                    key={p.id}
                    className="row roster-table"
                    style={{ gridTemplateColumns: loadColumnTemplate }}
                  >
                    {loadVisibleColumns.map((colKey) => (
                      <div
                        key={`${p.id}-${colKey}`}
                        className={`roster-cell ${colKey === "name" ? "name" : ""}`}
                        style={{ justifyContent: colKey === "name" ? "flex-start" : "center", textAlign: colKey === "name" ? "left" : "center" }}
                      >
                        {renderCell(colKey, p)}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {loadHeaderMenu && (
              <div
                style={{
                  position: "fixed",
                  top: loadHeaderMenu.y,
                  left: loadHeaderMenu.x,
                  background: loadTheme.menuBg,
                  border: loadTheme.menuBorder,
                  borderRadius: 6,
                  zIndex: 100,
                  maxHeight: 300,
                  overflowY: "auto",
                  minWidth: 200,
                  padding: "5px 0",
                  boxShadow: loadTheme.menuShadow,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {Object.keys(LOAD_COLUMNS_DEF).map((key) => (
                  <button
                    key={key}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLoadVisibleColumns((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      padding: "8px 15px",
                      background: "transparent",
                      border: "none",
                      color: loadVisibleColumns.includes(key) ? loadTheme.text : loadTheme.muted,
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      justifyContent: "space-between",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = loadTheme.menuHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span>{LOAD_COLUMNS_DEF[key].label}</span>
                    {loadVisibleColumns.includes(key) && <Check size={14} color="#3b82f6" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderStaffAssignments = () => {
    const scoreStaff = (staff) => {
      const attrs = staff?.attributes || {};
      const avg = (keys) => {
        const vals = keys.map((k) => safeNum(attrs[k])).filter((v) => v > 0);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };
      const buckets = {
        Ofensiva: avg(["off_teach_shoot", "off_teach_finish", "off_teach_handle", "off_scheme_pnr", "off_scheme_space"]),
        Defensa: avg(["def_teach_onball", "def_teach_rim", "def_teach_screen", "def_scheme_help", "def_matchup"]),
        Desarrollo: avg(["dev_strength", "dev_speed", "dev_vertical", "dev_work_ethic", "dev_load_mgmt"]),
        Psico: avg(["psy_ego", "psy_locker", "psy_clutch_dev", "psy_focus", "psy_role"]),
        Médico: avg(["med_diagnosis", "med_acute", "med_chronic", "med_fatigue", "med_prevent"]),
        Scouting: avg(["sct_eval_curr", "sct_eval_pot", "sct_character", "sct_medical", "sct_analytics"]),
      };
      const best = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
      return { area: best?.[0] || staff?.department || "--", score: best?.[1] || 0 };
    };
    return (
      <section className="bento">
        <div className="card roster player-card-elite roster-full">
          <div className="card-header">
            <h2>Staff Assignments</h2>
            <span className="tag muted">{myStaff.length} miembros</span>
          </div>
        <div className="table training-table scroll-x">
            <div className="row head training">
              <div>Staff</div>
              <div>Rol</div>
              <div>Área</div>
              <div>Grupo</div>
            </div>
            {myStaff.length === 0 ? (
              <div className="row empty">Sin staff asignado.</div>
            ) : (
              myStaff.map((s, idx) => (
                <div className="row training" key={`${s.role_id}-${idx}`}>
                  <div className="mono">{s.name}</div>
                  <div>{s.role || "--"}</div>
                  <div>{scoreStaff(s).area}</div>
                  <div>{s.department || "--"}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderTrainingModule = () => {
    const rankedAttrs = Object.entries(rosterAttrAverages)
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 4);
    const modules = rankedAttrs.map((attr) => ({
      title: attributeLabelMap[attr.key] || humanizeId(attr.key),
      desc: `Módulo de mejora para ${attributeLabelMap[attr.key] || humanizeId(attr.key)}.`,
    }));
    return (
      <section className="bento">
        <div className="card roster player-card-elite roster-full">
          <div className="card-header">
            <h2>Training Modules</h2>
            <span className="tag muted">{modules.length} módulos</span>
          </div>
        <div className="list">
          {modules.length === 0 ? (
            <div className="desc">Sin datos de atributos.</div>
          ) : (
            modules.map((m) => (
              <div key={m.title} className="list-item">
                <div className="title">{m.title}</div>
                <div className="desc">{m.desc}</div>
              </div>
            ))
          )}
        </div>
        </div>
      </section>
    );
  };

  const renderClubEconomy = () => {
    if (!myTeam) return renderStart();
    const payrollK = Math.round(clubPayroll / 1000);
    return (
      <section className="bento">
        <div className="card hero modal-glass-tactical">
          <div className="card-header">
            <h2>Economía del Club</h2>
            <span className="tag">Finanzas</span>
          </div>
          <div className="detail-tags">
            <span className="chip">Presupuesto {myTeam.data?.budget || "--"}</span>
            <span className="chip">Masa salarial {payrollK}K</span>
            <span className="chip">Plantilla {myRoster.length}</span>
          </div>
          <div className="desc">Resumen rápido del balance operativo y compromisos.</div>
        </div>

        <div className="card roster player-card-elite">
          <div className="card-header">
            <h2>Resumen</h2>
            <span className="tag muted">Actual</span>
          </div>
          <div className="detail-list">
            <div>Ingresos TV: {myTeam.data?.media_income || "--"}</div>
            <div>Patrocinios: {myTeam.data?.sponsors_income || "--"}</div>
            <div>Taquilla: {myTeam.data?.ticket_income || "--"}</div>
            <div>Coste staff: {myStaff.length} miembros</div>
            <div>Directiva: {myBoard.length} miembros</div>
          </div>
        </div>
      </section>
    );
  };

  const renderScouting = () => (
    <section className="bento">
      <div className="card scouting-board modal-glass-tactical">
        <div className="card-header">
          <h2>Scouting Board</h2>
          <span className="tag">Niebla de Guerra</span>
        </div>
        <div className="filters">
          <select value={scoutTier} onChange={(e) => setScoutTier(e.target.value)}>
            <option value="">Tier</option>
            {catalogs.tiers.map((t) => (
              <option key={t} value={t}>
                Tier {t}
              </option>
            ))}
          </select>
          <select value={scoutOrigin} onChange={(e) => setScoutOrigin(e.target.value)}>
            <option value="">Origen</option>
            {catalogs.origins.map((o) => (
              <option key={o} value={o} title={descFor("origin", o, labelFor("origin", o))}>
                {labelFor("origin", o)}
              </option>
            ))}
          </select>
          <select value={scoutMental} onChange={(e) => setScoutMental(e.target.value)}>
            <option value="">Mentalidad</option>
            {catalogs.mental.map((m) => (
              <option key={m} value={m} title={descFor("mental", m, labelFor("mental", m))}>
                {labelFor("mental", m)}
              </option>
            ))}
          </select>
          <select value={scoutArchetype} onChange={(e) => setScoutArchetype(e.target.value)}>
            <option value="">Arquetipo</option>
            {catalogs.arche.map((a) => (
              <option key={a} value={a} title={descFor("arche", a, labelFor("arche", a))}>
                {labelFor("arche", a)}
              </option>
            ))}
          </select>
          <select value={scoutTrait} onChange={(e) => setScoutTrait(e.target.value)}>
            <option value="">Trait</option>
            {catalogs.traits.map((t) => (
              <option key={t} value={t} title={descFor("trait", t, labelFor("trait", t))}>
                {labelFor("trait", t)}
              </option>
            ))}
          </select>
          <select value={scoutPerk} onChange={(e) => setScoutPerk(e.target.value)}>
            <option value="">Perk</option>
            {catalogs.perks.map((p) => (
              <option key={p} value={p} title={descFor("perk", p, labelFor("perk", p))}>
                {labelFor("perk", p)}
              </option>
            ))}
          </select>
          <select value={scoutTag} onChange={(e) => setScoutTag(e.target.value)}>
            <option value="">Tag</option>
            {TAG_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder=""
            value={scoutQuery}
            onChange={(e) => setScoutQuery(e.target.value)}
          />
        </div>
        <div className="scout-list">
          {renderScoutCards(filteredScout, "Sin resultados.")}
        </div>
      </div>

      <div className="card watchlist modal-glass-tactical">
        <div className="card-header">
          <h2>Watchlist</h2>
          <span className="tag muted">{watchlistItems.length} jugadores</span>
        </div>
        <div className="desc">Marcados con estrella para seguimiento.</div>
        <div className="scout-list">
          {renderScoutCards(watchlistItems, "Sin jugadores en watchlist.")}
        </div>
      </div>
    </section>
  );

  const renderStaff = () => {
    if (!myTeam) return renderStart();
    return (
      <section className="bento">
        <div className="card hero modal-glass-tactical">
          <div className="card-header">
            <h2>Staff de {myTeam.name}</h2>
            <span className="tag">Asignaciones</span>
          </div>
          <div className="desc">Staff generado desde docs: roles, atributos, traits y perks.</div>
          <div className="list">
            {myStaff.length === 0 ? (
              <div className="desc">Sin staff asignado.</div>
            ) : (
              myStaff.map((s, idx) => (
                <div
                  className="list-item"
                  key={`${s.role_id}-${idx}`}
                  onContextMenu={(e) =>
                    openContextMenu(e, [{ label: "Ver ficha", onClick: () => openStaffMember(s, myTeam.id) }])
                  }
                >
                  <div className="title">
                    <button className="link" onClick={() => openStaffMember(s, myTeam.id)}>
                      {s.name}
                    </button>
                  </div>
                  <div className="desc">
                    {s.role || "--"} · {s.department || "--"} ·{" "}
                    <span title={s.personality_desc || s.personality_label || s.personality || ""}>
                      {s.personality_label || s.personality || "--"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="card metrics attribute-section-refined">
          <div className="card-header">
            <h2>Clima</h2>
            <span className="tag muted">Cultura</span>
          </div>
          <div className="bars">
            <div className="bar">
              <div className="label">Quimica</div>
              <div className="track"><div className="fill" style={{ width: "68%" }} /></div>
              <div className="value mono">68</div>
            </div>
            <div className="bar">
              <div className="label">Disciplina</div>
              <div className="track"><div className="fill" style={{ width: "73%" }} /></div>
              <div className="value mono">73</div>
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderDirectiva = () => {
    if (!myTeam) return renderStart();
    return (
      <section className="bento">
        <div className="card hero modal-glass-tactical">
          <div className="card-header">
            <h2>Directiva de {myTeam.name}</h2>
            <span className="tag">Gobierno</span>
          </div>
          <div className="desc">Perfiles de gestion y filosofia institucional.</div>
          <div className="list">
            {myBoard.length === 0 ? (
              <div className="desc">Sin directiva asignada.</div>
            ) : (
              myBoard.map((m, idx) => (
                <div
                  className="list-item"
                  key={`${m.role_id}-${idx}`}
                  onContextMenu={(e) =>
                    openContextMenu(e, [{ label: "Ver ficha", onClick: () => openBoardMember(m, myTeam.id) }])
                  }
                >
                  <div className="title">
                    <button className="link" onClick={() => openBoardMember(m, myTeam.id)}>
                      {m.name}
                    </button>
                  </div>
                  <div className="desc">
                    {m.role || "--"} · {m.category || "--"} ·{" "}
                    <span title={m.profile_desc || m.profile_label || ""}>{m.profile_label || "--"}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="card metrics attribute-section-refined">
          <div className="card-header">
            <h2>Visión</h2>
            <span className="tag muted">Gobierno</span>
          </div>
          <div className="bars">
            <div className="bar">
              <div className="label">Ambición</div>
              <div className="track"><div className="fill" style={{ width: "74%" }} /></div>
              <div className="value mono">74</div>
            </div>
            <div className="bar">
              <div className="label">Estabilidad</div>
              <div className="track"><div className="fill" style={{ width: "66%" }} /></div>
              <div className="value mono">66</div>
            </div>
          </div>
        </div>
      </section>
    );
  };

  // ==================== CLUB HANDLERS ====================

  const handleUpgradeFacility = async (facilityId) => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("upgrade_facility", {
        team_id: myTeamId,
        facility_id: facilityId,
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error upgrading facility:", err);
    }
  };

  const handleAssignStaff = async (roleId, staffId, removeStaffId) => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("assign_staff_role", {
        team_id: myTeamId,
        role_id: roleId,
        staff_id: staffId,
        remove_staff_id: removeStaffId,
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error assigning staff:", err);
    }
  };

  const handleAssignPlayerToCoach = async (playerId, coachId) => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("assign_player_to_coach", {
        team_id: myTeamId,
        player_id: playerId,
        coach_id: coachId,
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error assigning player to coach:", err);
    }
  };

  const handleHireStaff = async (roleId) => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("hire_staff", {
        team_id: myTeamId,
        role_id: roleId,
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error hiring staff:", err);
    }
  };

  const handleNegotiateObjectives = async () => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("negotiate_objectives", {
        team_id: myTeamId,
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error negotiating objectives:", err);
    }
  };

  // ==================== MARKET HANDLERS ====================

  const handleAddToShortlist = async (playerId) => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("market.add_to_shortlist", {
        team_id: myTeamId,
        player_id: playerId,
        priority: "medium",
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error adding to shortlist:", err);
    }
  };

  const handleRemoveFromShortlist = async (playerId) => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("market.remove_from_shortlist", {
        team_id: myTeamId,
        player_id: playerId,
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error removing from shortlist:", err);
    }
  };

  const handleUpdateShortlist = async (playerId, updates) => { 
    if (!myTeamId) return; 
    try { 
      const result = await window.pcbasket.invoke("market.update_shortlist", { 
        team_id: myTeamId, 
        player_id: playerId, 
        updates: updates, 
      }); 
      if (result.ok) { 
        await loadTeams(); 
      } 
    } catch (err) { 
      console.error("Error updating shortlist:", err); 
    } 
  }; 
 
  const reloadContractCatalog = useCallback( 
    async (leagueIdOverride) => { 
      const leagueId = String(
        leagueIdOverride
          || (myTeam ? getTeamLeagueId(myTeam) : "")
          || competitionLeagueId
          || DEFAULT_LEAGUE_ID
          || "",
      ).toUpperCase(); 
      if (!window.pcbasket || !leagueId) return null; 
      try { 
        const res = await window.pcbasket.invoke("rules.contract_catalog", { league_id: leagueId }); 
        const catalog = res?.result || null; 
        if (catalog?.ok) setContractCatalog(catalog); 
        return catalog; 
      } catch (err) { 
        console.error("Error loading contract catalog:", err); 
        return null; 
      } 
    }, 
    [competitionLeagueId, myTeam], 
  ); 

  useEffect(() => {
    if (!myTeamId) return;
    if (marketView !== "offer") return;
    if (contractCatalog?.ok) return;
    const leagueId = (myTeam ? getTeamLeagueId(myTeam) : "") || competitionLeagueId || DEFAULT_LEAGUE_ID || "";
    void reloadContractCatalog(leagueId);
  }, [competitionLeagueId, contractCatalog, marketView, myTeam, myTeamId, reloadContractCatalog]);
 
  const openOfferPage = async (playerId) => { 
    if (!myTeamId) return; 
    const player = players.find((p) => String(p.id) === String(playerId)); 
    if (!player) return; 
    const teamLeagueId = (myTeam ? getTeamLeagueId(myTeam) : "") || competitionLeagueId || DEFAULT_LEAGUE_ID || ""; 
    const playerContractType = player?.data?.contract_type || player?.data?.contractType; 
    const playerAge = player?.data?.bio?.age; 
    const isScholarship = String(playerContractType || "").toLowerCase() === "scholarship" || player?.data?.is_scholarship === true || (Number.isFinite(playerAge) && playerAge < 18); 
    const isNcaa = String(teamLeagueId || "").toUpperCase().startsWith("NCAA"); 
    const scholarshipMode = isScholarship || isNcaa; 
    const mv = Number(player?.data?.market_value || 0); 
    const defaultFee = scholarshipMode ? 0 : Math.max(0, Math.round(mv || 0)); 
    const defaultWage = scholarshipMode ? 0 : Math.max(0, Math.round((mv || 0) / 12)); 
 
    setMarketOfferPlayerId(player.id); 
    setMarketOfferNegotiationId(null);
    setMarketOfferScholarshipMode(scholarshipMode); 
    setMarketOfferInitial({ 
      fee: defaultFee, 
      wage: defaultWage, 
      contract_years: scholarshipMode ? 1 : 3, 
      playing_time: scholarshipMode ? "" : "Rotación",
      promises: [],
      clauses: [], 
      bonuses: [], 
    }); 
    setSection("Mercado"); 
    setMarketView("offer"); 
    await reloadContractCatalog(teamLeagueId); 
  }; 

  const openOfferFromNegotiation = async (negotiation) => {
    if (!myTeamId || !negotiation) return;
    const playerId = negotiation.player_id;
    const player = players.find((p) => String(p.id) === String(playerId));
    if (!player) return;
    const teamLeagueId = (myTeam ? getTeamLeagueId(myTeam) : "") || competitionLeagueId || DEFAULT_LEAGUE_ID || "";
    const playerContractType = player?.data?.contract_type || player?.data?.contractType;
    const playerAge = player?.data?.bio?.age;
    const isScholarship = String(playerContractType || "").toLowerCase() === "scholarship" || player?.data?.is_scholarship === true || (Number.isFinite(playerAge) && playerAge < 18);
    const isNcaa = String(teamLeagueId || "").toUpperCase().startsWith("NCAA");
    const scholarshipMode = isScholarship || isNcaa;
    const base = negotiation.counter_offer && typeof negotiation.counter_offer === "object" ? negotiation.counter_offer : negotiation.current_offer;

    setMarketOfferPlayerId(player.id);
    setMarketOfferNegotiationId(negotiation.id);
    setMarketOfferScholarshipMode(scholarshipMode);
    setMarketOfferInitial({
      fee: scholarshipMode ? 0 : Number(base?.fee || 0),
      wage: scholarshipMode ? 0 : Number(base?.wage || 0),
      contract_years: Math.max(1, Number(base?.contract_years || 1)),
      playing_time: scholarshipMode ? "" : (base?.playing_time || "Rotación"),
      promises: Array.isArray(base?.promises) ? base.promises : [],
      clauses: Array.isArray(base?.clauses) ? base.clauses : [],
      bonuses: Array.isArray(base?.bonuses) ? base.bonuses : [],
    });
    setMarketSelectedNegotiationId(negotiation.id);
    setSection("Mercado");
    setMarketView("offer");
    await reloadContractCatalog(teamLeagueId);
  };
 
  const handleMakeOffer = async (playerId, offerDetails) => { 
    if (!myTeamId) return; 
    try { 
      if (!offerDetails) { 
        await openOfferPage(playerId); 
        return; 
      } 
      const player = players.find((p) => String(p.id) === String(playerId)); 
      const teamLeagueId = myTeam ? getTeamLeagueId(myTeam) : ""; 
      const playerContractType = player?.data?.contract_type || player?.data?.contractType; 
      const playerAge = player?.data?.bio?.age; 
      const isScholarship = String(playerContractType || "").toLowerCase() === "scholarship" || player?.data?.is_scholarship === true || (Number.isFinite(playerAge) && playerAge < 18); 
      const isNcaa = String(teamLeagueId || "").toUpperCase().startsWith("NCAA"); 
      const scholarshipMode = isScholarship || isNcaa; 
       const offerPayload = { 
         fee: scholarshipMode ? 0 : 1000000, 
         wage: scholarshipMode ? 0 : 100000, 
         contract_years: scholarshipMode ? 1 : 3, 
         playing_time: scholarshipMode ? "" : (offerDetails?.playing_time || "Rotación"),
         promises: scholarshipMode ? [] : (offerDetails?.promises || []),
         clauses: [], 
         bonuses: [], 
         current_date: loopState?.date || "", 
         ...(offerDetails || {}), 
       }; 
      const result = await window.pcbasket.invoke("market.make_offer", { 
        team_id: myTeamId, 
        player_id: playerId, 
        offer: offerPayload, 
      }); 
      if (result.ok) { 
        const negotiationId = result?.result?.negotiation?.id || null; 
        await loadTeams(); 
        setMarketOfferPlayerId(null); 
        setMarketOfferNegotiationId(null);
        setMarketOfferInitial(null); 
        setMarketOfferScholarshipMode(false); 
        setMarketSelectedNegotiationId(negotiationId); 
        setSection("Mercado"); 
        setMarketView("negotiations"); 
      } 
    } catch (err) { 
      console.error("Error making offer:", err); 
    } 
  }; 

  const handleImproveOffer = async (negotiationId, newOffer) => {
    if (!myTeamId) return;
    try {
      let payloadOffer = newOffer;
      if (!payloadOffer || typeof payloadOffer !== "object") {
        const negotiations = myTeam?.data?.active_negotiations || [];
        const neg = negotiations.find((n) => String(n.id) === String(negotiationId));
        if (neg?.current_offer) {
          const fee = Number(neg.current_offer.fee || 0);
          const wage = Number(neg.current_offer.wage || 0);
          payloadOffer = {
            fee: fee > 0 ? Math.round(fee * 1.08) : 0,
            wage: wage > 0 ? Math.round(wage * 1.06) : 0,
            contract_years: neg.current_offer.contract_years || 1,
            clauses: neg.current_offer.clauses || [],
            bonuses: neg.current_offer.bonuses || [],
          };
        }
      }
      if (payloadOffer && typeof payloadOffer === "object" && !payloadOffer.current_date) {
        payloadOffer = { ...payloadOffer, current_date: loopState?.date || "" };
      }
      const result = await window.pcbasket.invoke("market.improve_offer", {
        team_id: myTeamId,
        negotiation_id: negotiationId,
        offer: payloadOffer,
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error improving offer:", err);
    }
  };

  const handleWithdrawOffer = async (negotiationId) => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("market.withdraw_offer", {
        team_id: myTeamId,
        negotiation_id: negotiationId,
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error withdrawing offer:", err);
    }
  };

  const handleAcceptOffer = async (negotiationId) => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("market.respond_to_offer", {
        team_id: myTeamId,
        negotiation_id: negotiationId,
        response: "accept",
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error accepting offer:", err);
    }
  };

  const handleRejectOffer = async (negotiationId) => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("market.respond_to_offer", {
        team_id: myTeamId,
        negotiation_id: negotiationId,
        response: "reject",
      });
      if (result.ok) {
        await loadTeams();
      }
    } catch (err) {
      console.error("Error rejecting offer:", err);
    }
  };

  const handleAssignScout = async (playerId, tier = 3) => {
    if (!myTeamId) return;
    try {
      const result = await window.pcbasket.invoke("market.assign_scout", {
        team_id: myTeamId,
        player_id: playerId,
        tier,
        current_date: loopState?.date || "",
      });
      if (result.ok) {
        await loadPlayers(myTeamId);
      }
    } catch (err) {
      console.error("Error assigning scout:", err);
    }
  };

  const handleContactAgency = async (agencyId) => {
    // TODO: Implement agency contact
    console.log("Agency contact not yet implemented for agency:", agencyId);
  };

  const handlePlayerClick = (player) => {
    if (player && player.id) {
      openPlayer(player.id);
    }
  };

  const renderAgencias = () => (
    <section className="bento">
      <div className="card roster player-card-elite">
        <div className="card-header">
          <h2>Agencias</h2>
          <span className="tag">Mercado</span>
        </div>
        <div className="filters">
          <input
            type="text"
            placeholder=""
            value={agencyQuery}
            onChange={(e) => setAgencyQuery(e.target.value)}
          />
          <button onClick={loadAgencies}>{loadingAgencies ? "Cargando" : "Refrescar"}</button>
        </div>
        <div className="table">
          <div className="row head agency">
            <div>Agencia</div>
            <div>Tier</div>
            <div>Focus</div>
            <div>Mercado</div>
            <div>Reputación</div>
          </div>
          {filteredAgencies.length === 0 ? (
            <div className="row empty">Sin datos. {loadingAgencies ? "Cargando..." : ""}</div>
          ) : (
            filteredAgencies.map((a) => (
              <div
                className="row agency"
                key={a.agency_id}
                onContextMenu={(e) =>
                  openContextMenu(e, [{ label: "Ver ficha", onClick: () => openAgency(a.agency_id) }])
                }
              >
                <div>
                  <button className="link mono" onClick={() => openAgency(a.agency_id)}>
                    {a.name}
                  </button>
                </div>
                <div>{a.data?.tier || "--"}</div>
                <div>{a.data?.focus_niche || "--"}</div>
                <div>{a.data?.market_segment || "--"}</div>
                <div className="mono">{a.data?.reputation_score ?? "--"}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );

  const renderAgentes = () => (
    <section className="bento">
      <div className="card roster player-card-elite">
        <div className="card-header">
          <h2>Agentes</h2>
          <span className="tag">Negociación</span>
        </div>
        <div className="filters">
          <select value={agentAgencyFilter} onChange={(e) => setAgentAgencyFilter(e.target.value)}>
            <option value="">Todas las agencias</option>
            {agencies.map((a) => (
              <option key={a.agency_id} value={a.agency_id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder=""
            value={agentQuery}
            onChange={(e) => setAgentQuery(e.target.value)}
          />
          <button onClick={loadAgents}>{loadingAgents ? "Cargando" : "Refrescar"}</button>
        </div>
        <div className="table">
          <div className="row head agent">
            <div>Agente</div>
            <div>Agencia</div>
            <div>Estilo</div>
            <div>Greed</div>
            <div>Influence</div>
          </div>
          {filteredAgents.length === 0 ? (
            <div className="row empty">Sin datos. {loadingAgents ? "Cargando..." : ""}</div>
          ) : (
            filteredAgents.map((a) => (
              <div
                className="row agent"
                key={a.agent_id}
                onContextMenu={(e) =>
                  openContextMenu(e, [{ label: "Ver ficha", onClick: () => openAgent(a.agent_id) }])
                }
              >
                <div>
                  <button className="link mono" onClick={() => openAgent(a.agent_id)}>
                    {a.name}
                  </button>
                </div>
                <div>
                  {agencyMap[a.agency_id] ? (
                    <button className="link" onClick={() => openAgency(a.agency_id)}>
                      {agencyMap[a.agency_id]?.name || "--"}
                    </button>
                  ) : (
                    "--"
                  )}
                </div>
                <div>{a.data?.style || "--"}</div>
                <div className="mono">{a.data?.greed ?? "--"}</div>
                <div className="mono">{a.data?.influence ?? "--"}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );

  const renderTacticsBoard = () => (
    <section className="bento">
      <TacticsBoardAdvanced
        teamId={myTeamId ? Number(myTeamId) : null}
        theme={theme}
        roster={myRoster}
        tacticalRoles={tacticalRolesByPlayer}
        onRolesChange={setTacticalRolesByPlayer}
        onStartersChange={applyStartersToRotation}
      />
    </section>
  );

  const renderDefensiveMatchups = () => {
    if (!myTeam) return renderStart();
    const defenders = myRoster;
    const opponentName = opponentTeam?.name || "Rival";
    return (
      <section className="bento">
        <div className="card roster player-card-elite roster-full tactics-matchups">
          <div className="card-header">
            <h2>Matchups Defensivos</h2>
            <div className="tactics-header-actions">
              <span className="tag muted">{opponentName}</span>
              <button className="subnav-item" onClick={autoAssignMatchups}>Auto-matchup</button>
            </div>
          </div>
          <div className="card roster player-card-elite roster-full roster-grid-card">
            <div className="table matchups-table scroll-x roster-table">
              <div className="row head matchup roster-table">
              <div className="roster-head-cell" onClick={() => handleMatchupSort("pos")} title="POS">POS</div>
              <div
                className="roster-head-cell"
                onClick={() => handleMatchupSort("name")}
                title="JUGADOR RIVAL"
                style={{ justifyContent: "flex-start", textAlign: "left" }}
              >
                JUGADOR RIVAL
              </div>
              <div className="roster-head-cell" onClick={() => handleMatchupSort("threat")} title="AMENAZA">AMENAZA</div>
              <div className="roster-head-cell" onClick={() => handleMatchupSort("height_cm")} title="ALTURA">ALTURA</div>
              <div className="roster-head-cell" title="DEFENSOR" style={{ justifyContent: "flex-start", textAlign: "left" }}>DEFENSOR</div>
              <div className="roster-head-cell" title="PRESIÓN">PRESIÓN</div>
              <div className="roster-head-cell" title="P&R">P&R</div>
              <div className="roster-head-cell" title="DIRECCIÓN">DIRECCIÓN</div>
              </div>
              {sortedMatchupOpponents.length === 0 ? (
                <div className="row empty">Sin rival cargado.</div>
              ) : (
                sortedMatchupOpponents.map((opp) => {
                  const defenderId = matchupAssignments[opp.id];
                  const defender = defenders.find((d) => d.id === defenderId);
                  const defScore = defender ? calcDefenseScore(defender) : 0;
                  const heightDiff = defender ? safeNum(defender.data?.bio?.height_cm) - opp.height_cm : 0;
                  const mismatch = defender && (Math.abs(heightDiff) > 12 || opp.threat - defScore > 12);
                  const instr = matchupInstructions[opp.id] || matchupDefaults;
                  return (
                    <div className="row matchup roster-table" key={opp.id}>
                      <div className="roster-cell">
                        <span className="roster-pos-pill">{opp.pos}</span>
                      </div>
                      <div className="roster-cell name">
                        <button className="link mono" onClick={() => openPlayer(opp.id)}>
                          {opp.name}
                        </button>
                      </div>
                      <div className="roster-cell">{opp.threat}</div>
                      <div className="roster-cell">{opp.height_str}</div>
                      <div className="roster-cell" style={{ justifyContent: "flex-start", textAlign: "left" }}>
                        <select
                          className={`matchup-select ${mismatch ? "danger" : ""}`}
                          value={defenderId || ""}
                          onChange={(e) => handleMatchupChange(opp.id, e.target.value)}
                        >
                          <option value="">Sin asignar</option>
                          {defenders.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.data?.bio?.pos || "--"} · {d.name}
                            </option>
                          ))}
                        </select>
                        {mismatch && (
                          <div className="mismatch-note">
                            {Math.abs(heightDiff) > 12 ? `Altura ${heightDiff} cm` : "Desventaja"}
                          </div>
                        )}
                      </div>
                      <div className="roster-cell">
                        <select
                          className="matchup-select"
                          value={instr.pressure}
                          onChange={(e) => updateMatchupInstruction(opp.id, "pressure", e.target.value)}
                        >
                          <option>Gap</option>
                          <option>Normal</option>
                          <option>Intensa</option>
                          <option>Negar</option>
                        </select>
                      </div>
                      <div className="roster-cell">
                        <select
                          className="matchup-select"
                          value={instr.pnr}
                          onChange={(e) => updateMatchupInstruction(opp.id, "pnr", e.target.value)}
                        >
                          <option>Drop</option>
                          <option>Over</option>
                          <option>Under</option>
                          <option>Switch</option>
                          <option>Blitz</option>
                        </select>
                      </div>
                      <div className="roster-cell">
                        <select
                          className="matchup-select"
                          value={instr.force}
                          onChange={(e) => updateMatchupInstruction(opp.id, "force", e.target.value)}
                        >
                          <option>Centro</option>
                          <option>Fondo</option>
                          <option>Débil</option>
                          <option>No</option>
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderRotationMatrix = () => {
    if (!myTeam) return renderStart();
    const storageKey = `pcbasket.tactics.rotation.${myTeamId || "default"}.${rotationLeagueType}`;
    const handleSave = () => {
      if (!myTeamId) return;
      setRotationSaving(true);
      setRotationSaved(false);
      const payload = {
        clubId: Number(myTeamId),
        presetType: rotationPreset,
        leagueType: rotationLeagueType,
        players: rotationPlayers.map((p, idx) => ({
          playerId: p.id,
          playerName: p.name,
          position: p.pos,
          slot: p.slot ?? null,
          periods: p.periods,
          totalMinutes: rotationTotals.row[p.id] || 0,
          priority: idx < 5 ? 1 : idx < 10 ? 2 : 3,
        })),
        updatedAt: new Date().toISOString(),
      };
      try {
        window.localStorage?.setItem(storageKey, JSON.stringify(payload));
        setRotationSaved(true);
        setRotationDirty(false);
        setTimeout(() => setRotationSaved(false), 3000);
      } catch (err) {
        // ignore
      } finally {
        setRotationSaving(false);
      }
    };

    const handlePeriodChange = (id, idx, val) => {
      const clamped = Math.max(0, Math.min(rotationRules.duration, val));
      setRotationPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const next = [...p.periods];
          next[idx] = clamped;
          return { ...p, periods: next };
        }),
      );
      setRotationDirty(true);
      setRotationSaved(false);
      setRotationPreset("custom");
    };

    const rotationColumnTemplate = `220px repeat(${rotationRules.count}, minmax(90px, 1fr)) 80px`;

    return (
      <section className="bento">
        <div className="card roster player-card-elite roster-full rotation-matrix">
            <div className="rotation-header">
              <div>
              <h2>Matriz de Rotacion</h2>
              <div className="rotation-sub">
                {rotationOptions.find((o) => o.value === rotationPreset)?.desc || "Configuracion personalizada."}
              </div>
              </div>
            <div className="rotation-actions">
              <span
                className="rotation-league"
                style={{ background: ROTATION_LEAGUE_COLORS[rotationLeagueType] || "#3b82f6" }}
              >
                {rotationRules.name} ({ROTATION_LEAGUE_TOTAL_MINUTES[rotationLeagueType] || 40} min)
              </span>
              {rotationDirty && <span className="rotation-status warn">Sin guardar</span>}
              {rotationSaved && <span className="rotation-status ok">Guardado</span>}
              <button
                className="rotation-btn"
                onClick={() => applyRotationPreset(rotationPlayers, "std_10")}
              >
                Reset
              </button>
              <button
                className={`rotation-btn primary ${rotationDirty ? "dirty" : ""}`}
                onClick={handleSave}
                disabled={rotationSaving}
              >
                {rotationSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>

          <div className="rotation-controls">
            <div className="rotation-select">
              <label>Tipo de liga</label>
              <select value={rotationLeagueType} onChange={(e) => setRotationLeagueType(e.target.value)}>
                {Object.keys(ROTATION_LEAGUE_RULES).map((key) => (
                  <option key={key} value={key}>{ROTATION_LEAGUE_RULES[key].name}</option>
                ))}
              </select>
            </div>
            <div className="rotation-select grow">
              <label>Preset de rotacion</label>
              <select
                value={rotationOptions.some((o) => o.value === rotationPreset) ? rotationPreset : "custom"}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "custom") {
                    setRotationPreset("custom");
                    return;
                  }
                  applyRotationPreset(rotationPlayers, next);
                }}
              >
                <option value="custom">Personalizada</option>
                {["Estandar", "Competicion", "Fisico", "Desarrollo", "Estrategico", "Tactico", "Situacional", "Estilo"].map((group) => (
                  <optgroup key={group} label={group}>
                    {rotationOptions.filter((o) => o.group === group).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="rotation-grid">
            <div className="row head rotation-matrix" style={{ gridTemplateColumns: rotationColumnTemplate }}>
              <div>Jugador</div>
              {rotationRules.labels.map((label, idx) => {
                const value = rotationTotals.col[idx] || 0;
                const tone = value === rotationRules.colCheck ? "ok" : value > rotationRules.colCheck ? "bad" : "warn";
                return (
                  <div key={label} className={`rotation-period-head ${tone}`}>
                    <span>{label}</span>
                    <span className="rotation-period-sub">{value}/{rotationRules.colCheck}</span>
                  </div>
                );
              })}
              <div>Total</div>
            </div>

            <div className="rotation-body">
              {rotationPlayers.length === 0 ? (
                <div className="row empty">Sin jugadores disponibles.</div>
              ) : (
                rotationPlayers.map((player) => (
                  <div className="row rotation-matrix" key={player.id} style={{ gridTemplateColumns: rotationColumnTemplate }}>
                    <div className="rotation-player">
                      <div className="rotation-pos" style={{ background: player.color }}>{player.pos}</div>
                      <div>
                        <div className="rotation-name">{player.name}</div>
                        <div className="rotation-meta">Stamina <span style={{ color: player.stamina < 70 ? "#ef4444" : "#22c55e" }}>{player.stamina}</span></div>
                      </div>
                    </div>
                    {player.periods.map((val, idx) => (
                      <div key={`${player.id}-${idx}`} className="rotation-cell">
                        <div className="rotation-cell-bar" style={{ width: `${(val / rotationRules.duration) * 100}%`, background: player.color }} />
                        <input
                          type="number"
                          min="0"
                          max={rotationRules.duration}
                          value={val}
                          onChange={(e) => handlePeriodChange(player.id, idx, parseInt(e.target.value, 10) || 0)}
                        />
                        <input
                          type="range"
                          min="0"
                          max={rotationRules.duration}
                          step="1"
                          value={val}
                          onChange={(e) => handlePeriodChange(player.id, idx, parseInt(e.target.value, 10))}
                          style={{ accentColor: player.color }}
                        />
                      </div>
                    ))}
                    <div className="rotation-total">
                      <div className={`rotation-total-value ${rotationTotals.row[player.id] > 38 ? "warn" : ""}`}>
                        {rotationTotals.row[player.id] || 0}
                      </div>
                      <div className="rotation-total-label">min</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderSpecialPlays = () => {
    const basePlays = [];
    if ((rosterSectionAverages.manejo || 0) >= 60) {
      basePlays.push({ id: "ato-01", name: "ATO Spain", type: "Set", focus: "PnR", situation: "After Timeout" });
    }
    if ((rosterSectionAverages.ofensiva || 0) >= 60) {
      basePlays.push({ id: "zipper", name: "Zipper Flare", type: "Quick", focus: "3PT", situation: "Sideline" });
    }
    if ((rosterSectionAverages.fisico || 0) >= 60) {
      basePlays.push({ id: "delay", name: "Delay 5-Out", type: "Flow", focus: "Spacing", situation: "Transition" });
    }
    if ((rosterSectionAverages.cerebro || 0) >= 55) {
      basePlays.push({ id: "horns-45", name: "Horns 45", type: "Set", focus: "Post", situation: "Halfcourt" });
    }
    const plays = [...customPlays, ...basePlays];
    return (
      <section className="bento">
        <div className="card roster player-card-elite roster-full">
          <div className="card-header">
            <h2>Special Plays</h2>
            <span className="tag muted">{plays.length} plays</span>
          </div>
          <div className="list">
            {plays.length === 0 ? (
              <div className="desc">Sin jugadas especiales disponibles.</div>
            ) : (
              plays.map((play) => (
                <div key={play.id} className="list-item">
                  <div className="title">{play.name}</div>
                  <div className="desc">
                    {play.type} · {play.focus} · {play.situation}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderMatchSim = () => {
    if (!myTeam) return renderStart();
    const fixture = activeMatchFixture;
    const home = fixture ? teamMap[fixture.homeId] : null;
    const away = fixture ? teamMap[fixture.awayId] : null;
    const canStart = fixture && ["idle", "finished", "error"].includes(matchStatus);
    const statusLabel =
      matchStatus === "idle"
        ? "Listo"
        : matchStatus === "loading"
          ? "Iniciando..."
          : matchStatus === "live"
            ? "En directo"
            : matchStatus === "paused"
              ? "Pausado"
              : matchStatus === "finished"
                ? "Finalizado"
                : "Error";
    const showViewer = matchStatus !== "idle" && matchStatus !== "loading";
    return (
      <section className="bento">
        <div className="card roster player-card-elite roster-full match-engine-card modal-glass-tactical">
          <div className="card-header">
            <h2>Match Engine</h2>
            <div className="match-engine-actions">
              <select
                className="match-engine-select"
                value={fixture?.id || ""}
                onChange={(e) => setMatchFixtureId(e.target.value)}
                disabled={matchStatus === "live" || matchStatus === "paused"}
              >
                <option value="">Selecciona partido</option>
                {matchFixtureOptions.map((f) => {
                  const h = teamMap[f.homeId]?.name || "Local";
                  const a = teamMap[f.awayId]?.name || "Visitante";
                  return (
                    <option key={f.id} value={f.id}>
                      {f.date} · {h} vs {a}
                    </option>
                  );
                })}
              </select>
              <button
                className="subnav-item primary"
                type="button"
                onClick={() => startMatchSimulation(fixture)}
                disabled={!canStart}
              >
                {matchStatus === "loading" ? "Cargando..." : "Iniciar"}
              </button>
              <button
                className="subnav-item"
                type="button"
                onClick={resetMatchEngine}
                disabled={matchStatus === "loading"}
              >
                Reset
              </button>
            </div>
          </div>
          <div className="match-engine-meta">
            <span className={`tag ${matchStatus === "live" ? "" : "muted"}`}>{statusLabel}</span>
            {fixture ? (
              <span className="desc">
                {fixture.date} · {home?.name || "Local"} vs {away?.name || "Visitante"}
              </span>
            ) : (
              <span className="desc">Selecciona un partido para iniciar el engine.</span>
            )}
          </div>

          {matchStatus === "loading" && <div className="desc">Preparando simulación...</div>}

          {showViewer ? (
            <MatchViewer
              homeName={home?.name || "Local"}
              awayName={away?.name || "Visitante"}
              scoreHome={matchScore.home}
              scoreAway={matchScore.away}
              periodLabel={matchPeriodLabel}
              timeLabel={matchTimeLabel}
              shotClockLabel={matchShotClockLabel}
              homeTimeoutsLeft={matchTimeoutsLeft.home}
              awayTimeoutsLeft={matchTimeoutsLeft.away}
              homeTeamFouls={matchTeamFouls.home}
              awayTeamFouls={matchTeamFouls.away}
              ruleset={matchRules.ruleset}
              inProgress={matchStatus === "live" && !matchPaused}
              actions={matchActions}
              homeStats={matchHomeStats}
              awayStats={matchAwayStats}
              lastEvent={matchLastEvent}
              speed={matchSpeed}
              onPlayPause={handleMatchPlayPause}
              onSpeedChange={handleMatchSpeedChange}
              onSimQuarter={handleMatchSimQuarter}
              onSimMatch={handleMatchSimMatch}
              onTimeout={handleMatchTimeout}
              timeoutOptions={MATCH_TIMEOUT_OPTIONS}
              timeoutKind={matchTimeoutKind}
              onTimeoutKindChange={setMatchTimeoutKind}
              onShout={handleMatchShout}
              onShoutChange={setMatchSelectedShout}
              shoutOptions={MATCH_SHOUTS}
              selectedShout={matchSelectedShout}
              defenseOptions={MATCH_DEFENSE_OPTIONS}
              defenseType={matchDefenseType}
              onDefenseTypeChange={setMatchDefenseType}
              pnrDefenseOptions={MATCH_PNR_DEFENSE_OPTIONS}
              pnrDefense={matchPnrDefense}
              onPnrDefenseChange={setMatchPnrDefense}
              paceOptions={MATCH_PACE_OPTIONS}
              pace={matchPaceIdx}
              onPaceChange={setMatchPaceIdx}
              focusOptions={MATCH_FOCUS_OPTIONS}
              focus={matchOffFocus}
              onFocusChange={setMatchOffFocus}
              spacingOptions={MATCH_SPACING_OPTIONS}
              spacing={matchSpacing}
              onSpacingChange={setMatchSpacing}
              riskOptions={MATCH_RISK_OPTIONS}
              passingRisk={matchPassingRisk}
              onPassingRiskChange={setMatchPassingRisk}
              aggression={matchAggression}
              onAggressionChange={setMatchAggression}
              offRebound={matchOffRebound}
              onOffReboundChange={setMatchOffRebound}
              threePoint={matchThreePoint}
              onThreePointChange={setMatchThreePoint}
              pnrFrequency={matchPnrFrequency}
              onPnrFrequencyChange={setMatchPnrFrequency}
              freedomOptions={MATCH_FREEDOM_OPTIONS}
              freedom={matchFreedom}
              onFreedomChange={setMatchFreedom}
              transitionOptions={MATCH_TRANSITION_OPTIONS}
              transition={matchTransition}
              onTransitionChange={setMatchTransition}
              onApplyTactics={handleMatchApplyTactics}
              playbooks={MATCH_PLAYBOOKS}
              selectedPlaybookId={matchSelectedPlaybookId}
              onPlaybookChange={handleMatchPlaybookChange}
              onSubstitute={handleMatchSubstitute}
              actionTeam={matchActionTeam}
              onActionTeamChange={setMatchActionTeam}
              substitutionOpen={substitutionOpen}
              substitutionTeamName={matchActionTeam === "home" ? home?.name : away?.name}
              substitutionLineup={matchActionTeam === "home" ? matchLineups.home : matchLineups.away}
              substitutionBench={matchActionTeam === "home" ? matchLineups.benchHome : matchLineups.benchAway}
              onSubstitutionConfirm={handleMatchSubstitutionConfirm}
              onSubstitutionClose={handleMatchSubstitutionClose}
              courtHome={matchLineups.home}
              courtAway={matchLineups.away}
              tickBuffer={tickBuffer}
            />
          ) : (
            <div className="match-sim-summary">
              <div className="match-sim-teams">
                <span className="mono">{home?.name || "Equipo local"}</span>
                <span className="match-sim-vs">vs</span>
                <span className="mono">{away?.name || "Equipo visitante"}</span>
              </div>
              <div className="match-sim-meta">
                <span>{fixture?.date || "Sin fecha"}</span>
                <span>{fixture ? (String(fixture.homeId) === String(myTeamId) ? "Local" : "Visitante") : "--"}</span>
              </div>
              <div className="match-sim-actions">
                <button
                  className="subnav-item primary"
                  type="button"
                  onClick={() => startMatchSimulation(fixture)}
                  disabled={!canStart}
                >
                  {canStart ? "Iniciar engine" : "Engine activo"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderTacticsCreator = () => (
    <section className="bento">
      <div className="card roster player-card-elite roster-full tactics-creator-advanced" style={{ gridColumn: "1 / -1" }}>
        <TacticsCreatorAdvanced
          clubId={myTeamId ? Number(myTeamId) : null}
          theme={theme}
          onSaveCustomPlay={handleSaveAdvancedPlay}
        />
      </div>
    </section>
  );

  const renderContratos = () => (
    <section className="bento">
      <div className="card roster player-card-elite">
        <div className="card-header">
          <h2>Contratos</h2>
          <span className="tag">Activos</span>
        </div>
        <div className="table">
          <div className="row head">
            <div>Jugador</div>
            <div>Equipo</div>
            <div>Inicio</div>
            <div>Fin</div>
          </div>
          {contracts.length === 0 ? (
            <div className="row empty">Sin datos. {loadingContracts ? "Cargando..." : ""}</div>
          ) : (
            contracts.map((c) => (
              <div className="row" key={c.id}>
                <div>
                  {playerMap[c.player_id] ? (
                    <button className="link mono" onClick={() => openPlayer(c.player_id)}>
                      {playerMap[c.player_id]?.name || "--"}
                    </button>
                  ) : (
                    "--"
                  )}
                </div>
                <div>
                  {teamMap[c.team_id] ? (
                    <button className="link" onClick={() => openTeam(c.team_id)}>
                      {teamMap[c.team_id]?.name || "--"}
                    </button>
                  ) : (
                    "--"
                  )}
                </div>
                <div>{c.data?.start_date || "--"}</div>
                <div>{c.data?.end_date || "--"}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );

  const topbarDateObj = loopState?.date ? parseIsoDate(loopState.date) : new Date(); 
  const topbarDateLabel = topbarDateObj.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const renderSection = () => { 
    const marketOfferPlayer = marketOfferPlayerId 
      ? players.find((p) => String(p.id) === String(marketOfferPlayerId)) 
      : null; 
    const submitOffer = async (offerDetails) => { 
      if (!marketOfferPlayer) return; 
      if (marketOfferNegotiationId) {
        await handleImproveOffer(marketOfferNegotiationId, offerDetails);
        setMarketSelectedNegotiationId(marketOfferNegotiationId);
        setSection("Mercado");
        setMarketView("negotiations");
        return;
      }
      await handleMakeOffer(marketOfferPlayer.id, offerDetails); 
    }; 
    const backFromOffer = () => { 
      setMarketOfferPlayerId(null); 
      setMarketOfferNegotiationId(null);
      setMarketOfferInitial(null); 
      setMarketOfferScholarshipMode(false); 
      setMarketView("search"); 
    }; 

    if (section === "Jugador") {
      return (
        <PlayerPage
          player={selectedPlayer}
          teamMap={teamMap}
          contractMap={contractMap}
          getRosterStatusBadges={getRosterStatusBadges}
          humanizeId={humanizeId}
          labelFor={labelFor}
          descFor={descFor}
          myTeamId={myTeamId}
          myTeam={myTeam}
          marketShortlist={(myTeam?.data?.shortlist || [])}
          agents={agents}
          agencyMap={agencyMap}
          onBack={closePlayerPage}
          onOpenTeam={openTeamOverlayFromPlayer}
          onOpenAgent={openAgentOverlayFromPlayer}
          onMakeOffer={handleMakeOffer}
          onAssignScout={handleAssignScout}
          onAddToShortlist={handleAddToShortlist}
          onRemoveFromShortlist={handleRemoveFromShortlist}
          onToggleCompare={toggleComparePlayer}
          compareIds={compareIds}
          onOpenCompare={() => setCompareOpen(true)}
          onPatchPlayer={patchPlayer}
        />
      );
    }
    return ( 
      <SectionRouter 
        section={section} 
        myTeamId={myTeamId} 
        myTeam={myTeam} 
        currentDate={loopState?.date || ""}
        renderStart={renderStart}
        renderHub={renderHub}
        renderEquipo={renderEquipo}
        trainingView={trainingView}
        setTrainingView={setTrainingView}
        renderTeamTraining={renderTeamTraining}
        renderPersonalTraining={renderPersonalTraining}
        renderLoadManagement={renderLoadManagement}
        renderStaffAssignments={renderStaffAssignments}
        renderTrainingModule={renderTrainingModule}
        tacticsView={tacticsView}
        setTacticsView={setTacticsView}
        renderTacticsBoard={renderTacticsBoard}
        renderTacticsCreator={renderTacticsCreator}
        renderDefensiveMatchups={renderDefensiveMatchups}
        renderRotationMatrix={renderRotationMatrix}
        renderSpecialPlays={renderSpecialPlays}
        renderMatchSim={renderMatchSim}
        competitionView={competitionView}
        setCompetitionView={setCompetitionView}
        renderCalendar={renderCompetitionCalendar}
        renderJornadas={renderCompetitionJornadas}
        renderStandings={renderCompetitionStandings}
        clubView={clubView}
        setClubView={setClubView}
        gmState={gmState}
        gmEvents={gmEvents}
        analyticsSnapshot={analyticsSnapshot}
        renderClubProfile={renderClubProfile}
        renderStaff={renderStaff}
        renderDirectiva={renderDirectiva}
        renderClubEconomy={renderClubEconomy}
        onUpgradeFacility={handleUpgradeFacility}
        onAssignStaff={handleAssignStaff}
        onAssignPlayerToCoach={handleAssignPlayerToCoach}
        onHireStaff={handleHireStaff}
        onNegotiateObjectives={handleNegotiateObjectives}
        medicalView={medicalView}
        setMedicalView={setMedicalView}
        renderMedicalOverview={renderMedicalOverview}
        renderMedicalInjuredList={renderMedicalInjuredList}
        renderMedicalHistory={renderMedicalHistory}
        renderMedicalFacilities={renderMedicalFacilities}
        renderMedicalStaff={renderMedicalStaff}
        renderPreventionCenter={renderPreventionCenter}
        marketView={marketView} 
        setMarketView={setMarketView} 
        marketSelectedNegotiationId={marketSelectedNegotiationId} 
        marketOfferPlayer={marketOfferPlayer} 
        marketOfferInitial={marketOfferInitial} 
        marketOfferScholarshipMode={marketOfferScholarshipMode} 
        contractCatalog={contractCatalog} 
        onReloadContractCatalog={(leagueId) => reloadContractCatalog(leagueId)} 
        onSubmitOffer={submitOffer} 
        onBackFromOffer={backFromOffer} 
        onEditOffer={openOfferFromNegotiation}
        renderScouting={renderScouting} 
        renderAgencias={renderAgencias} 
        renderAgentes={renderAgentes} 
        onAddToShortlist={handleAddToShortlist}
        onRemoveFromShortlist={handleRemoveFromShortlist}
        onUpdateShortlist={handleUpdateShortlist}
        onMakeOffer={handleMakeOffer}
        onImproveOffer={handleImproveOffer}
        onWithdrawOffer={handleWithdrawOffer}
        onAcceptOffer={handleAcceptOffer}
        onRejectOffer={handleRejectOffer}
        onAssignScout={handleAssignScout}
        onContactAgency={handleContactAgency}
        allPlayers={players}
        allAgencies={agencies}
        onPlayerClick={handlePlayerClick}
        upcomingFixtures={competitionViewFixturesByDate ? Object.values(competitionViewFixturesByDate).flat().filter(f => !f.played).slice(0, 7) : []}
        cupBrackets={competitionViewCupBrackets}
        leagueId={competitionLeagueId}
        allTeams={teams}
        onTeamClick={openTeam}
        onSimulateMatch={(fixtureId) => console.log("Simulate match:", fixtureId)}
      />
    );
  };

  const handleSidebarNav = (nextSection) => {
    setSection(nextSection);
    if (nextSection === "Plantilla") {
      setRosterView("plantilla");
      return;
    }
    if (nextSection === "Entrenamiento") {
      setTrainingView("team");
      return;
    }
    if (nextSection === "Tacticas") {
      setTacticsView("board");
      return;
    }
    if (nextSection === "Competicion") {
      setCompetitionView("calendar");
      return;
    }
    if (nextSection === "Club") {
      setClubView("dashboard");
      return;
    }
    if (nextSection === "Medical") {
      setMedicalView("overview");
      return;
    }
    if (nextSection === "Mercado") {
      setMarketView("search");
      setMarketOfferPlayerId(null);
      setMarketOfferNegotiationId(null);
      setMarketOfferInitial(null);
      setMarketOfferScholarshipMode(false);
      setMarketSelectedNegotiationId(null);
    }
  };

  return (
    <div className={`app theme-${theme} ${!myTeamId ? "setup-screen" : ""}`}>
      {myTeamId && (
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">GBM</div>
            <div>
              <div className="brand-title">Global Basket</div>
              <div className="brand-sub">Tactical Elite Minimalism</div>
            </div>
          </div>

           <nav className="side-nav">
             {NAV_ITEMS.map((item) => (
               <button
                 key={item.id}
                 className={`side-item ${section === item.id ? "active" : ""}`}
                 onClick={() => handleSidebarNav(item.id)}
               >
                 <img className="side-icon" src={item.icon} alt={item.label} />
                 <span className="side-label">{item.label}</span>
               </button>
             ))}
           </nav>
        </aside>
      )}

      <main className={`main ${!myTeamId ? "setup-main" : ""}`}>
        {myTeamId && (
          <header className="topbar">
            <div>
              <div className="eyebrow">Fecha simulación: {topbarDateLabel}</div>
              <h1>{!myTeamId ? "Inicio" : section}</h1>
            </div>
            <div className="topbar-right">
              <div className="chip">Presupuesto: {formatMoney(myTeam?.data?.budget)}</div>
              <div className="chip">Moral: {loopTeamState.morale}</div>
              <div className="chip">Fatiga: {loopTeamState.fatigue}</div>
              {(isAdvancingDay || isSimulating) && advanceStep && (
                <div className="chip muted">
                  {advanceStep}
                  {advanceStepMs ? ` · ${Math.max(0, Math.floor((Date.now() - advanceStepMs) / 1000))}s` : ""}
                </div>
              )}
              <div className="topbar-actions">
                <button
                  className="subnav-item secondary"
                  onClick={() => {
                    setQuickSearchQuery("");
                    setQuickSearchOpen(true);
                  }}
                  disabled={!myTeamId}
                  title="Buscar (Ctrl+K o /)"
                >
                  <Search size={16} /> Buscar
                </button>
                <button
                  className="subnav-item secondary"
                  onClick={() => setCompareOpen(true)}
                  disabled={!myTeamId || compareIds.length === 0}
                  title="Comparador"
                >
                  Comparar {compareIds.length ? `(${compareIds.length})` : ""}
                </button>
                <button
                  className="subnav-item primary"
                  onClick={isSimulating ? () => stopSimulation("Simulación detenida.") : handleAdvanceLoopPhase}
                  disabled={!myTeamId || (!isSimulating && (isAdvancingDay || matchDecisionOpen || matchStatus === "live"))}
                >
                  {isSimulating ? "Detener simulación" : isAdvancingDay ? "Procesando..." : "Continuar"}
                </button>
                <button
                  className="subnav-item"
                  onClick={openSimulateModal}
                  disabled={!myTeamId || isSimulating || isAdvancingDay || matchDecisionOpen || matchStatus === "live"}
                >
                  Simular
                </button>
              </div>
              <div className="theme-toggle">
                <span>Modo</span>
                <button
                  className="toggle"
                  onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                >
                  {theme === "dark" ? "War Room" : "Scouting"}
                </button>
              </div>
            </div>
          </header>
        )}

        {renderSection()}
      </main>

      {showSimulateModal && (
        <div className="simulate-modal" onClick={closeSimulateModal}>
          <div className="simulate-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="simulate-modal-header">
              <div>
                <div className="eyebrow">Simulación</div>
                <h3>Simular hasta fecha</h3>
              </div>
              <button className="close" onClick={closeSimulateModal} disabled={isSimulating}>
                Cerrar
              </button>
            </div>
            <div className="simulate-modal-body">
              <label>
                Fecha objetivo
                <input
                  type="date"
                  value={simulateTargetDate}
                  min={loopState?.date || ""}
                  onChange={(e) => setSimulateTargetDate(e.target.value)}
                  disabled={isSimulating}
                />
              </label>
              <div className="simulate-options">
                <label className="simulate-option">
                  <input
                    type="checkbox"
                    checked={simulateStopOnMatch}
                    onChange={(e) => setSimulateStopOnMatch(e.target.checked)}
                    disabled={isSimulating}
                  />
                  Parar en día de partido
                </label>
                <label className="simulate-option">
                  <input
                    type="checkbox"
                    checked={simulateStopOnAlerts}
                    onChange={(e) => setSimulateStopOnAlerts(e.target.checked)}
                    disabled={isSimulating}
                  />
                  Parar en alertas críticas
                </label>
                <label>
                  Velocidad
                  <select
                    value={simulateSpeed}
                    onChange={(e) => setSimulateSpeed(e.target.value)}
                    disabled={isSimulating}
                  >
                    <option value="slow">Lenta</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Rápida</option>
                  </select>
                </label>
              </div>
              <div className="simulate-status">
                <div>Fecha actual: <strong>{loopState?.date || "--"}</strong></div>
                <div>Objetivo: <strong>{simulateTargetDate || "--"}</strong></div>
                {simulateStatus && <div className="simulate-note">{simulateStatus}</div>}
                {simulateError && <div className="simulate-error">{simulateError}</div>}
              </div>
            </div>
            <div className="simulate-modal-actions">
              {!isSimulating ? (
                <button className="subnav-item primary" onClick={startSimulation}>
                  Iniciar simulación
                </button>
              ) : (
                <button className="subnav-item primary" onClick={() => stopSimulation("Simulación detenida.")}>
                  Detener
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {matchDecisionOpen && (
        <div className="simulate-modal" onClick={closeMatchDecision}>
          <div className="simulate-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="simulate-modal-header">
              <div>
                <div className="eyebrow">Partido hoy</div>
                <h3>¿Jugar o simular?</h3>
              </div>
              <button className="close" onClick={closeMatchDecision}>
                Cerrar
              </button>
            </div>
            <div className="simulate-modal-body">
              <div className="desc">
                Hay un partido programado para hoy. Puedes dirigirlo en vivo o simularlo.
              </div>
              <div className="simulate-modal-actions">
                <button className="subnav-item primary" onClick={() => handleMatchDecision("play")}>
                  Jugar
                </button>
                <button className="subnav-item" onClick={() => handleMatchDecision("simulate")}>
                  Simular
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <QuickSearchModal
        open={quickSearchOpen}
        query={quickSearchQuery}
        players={players}
        teams={teams}
        agencies={agencies}
        agents={agents}
        onQueryChange={setQuickSearchQuery}
        onClose={() => setQuickSearchOpen(false)}
        onSelect={(hit) => {
          setQuickSearchOpen(false);
          if (!hit) return;
          if (hit.kind === "player") {
            openPlayer(hit.id);
            return;
          }
          if (hit.kind === "team") {
            openTeam(hit.id);
            return;
          }
          if (hit.kind === "agency") {
            openAgency(hit.id);
            return;
          }
          if (hit.kind === "agent") {
            openAgent(hit.id);
          }
        }}
      />

      <PlayerCompareModal
        open={compareOpen}
        compareIds={compareIds}
        players={players}
        labelFor={labelFor}
        onClose={() => setCompareOpen(false)}
        onRemove={(id) => toggleComparePlayer(id)}
        onClear={clearCompare}
        onOpenPlayer={(id) => openPlayer(id)}
      />

      {myTeamId && (
        <SmartphoneOverlay
          teamId={Number(myTeamId)}
          teamName={myTeam?.name || ""}
          morale={loopTeamState.morale}
          fatigue={loopTeamState.fatigue}
          injuries={(injuryListRef.current || []).length}
          players={myRoster}
          staff={myStaff}
          board={myBoard}
          agents={agents}
          smartphoneData={hubSnapshot}
          onSmartphoneEvent={handleSmartphoneEvent}
        />
      )}

      <DetailOverlay
        selectedPlayer={section === "Jugador" ? null : selectedPlayer}
        selectedTeam={selectedTeam}
        selectedAgency={selectedAgency}
        selectedAgent={selectedAgent}
        selectedStaff={selectedStaff}
        selectedBoard={selectedBoard}
        closeDetails={section === "Jugador" ? closeDetailsPreservePlayer : closeDetails}
        labelFor={labelFor}
        descFor={descFor}
        contractMap={contractMap}
        normalizeContractItems={normalizeContractItems}
        teamMap={teamMap}
        playerContext={playerContext}
        openRelativePlayer={openRelativePlayer}
        canPrevPlayer={canPrevPlayer}
        canNextPlayer={canNextPlayer}
        playerTab={playerTab}
        setPlayerTab={setPlayerTab}
        openAgent={openAgent}
        openAgency={openAgency}
        renderRadarPanel={renderRadarPanel}
        ATTRIBUTE_SECTIONS={ATTRIBUTE_SECTIONS}
        selectedAttrSection={selectedAttrSection}
        setSelectedAttrSection={setSelectedAttrSection}
        playerTacticalPos={playerTacticalPos}
        setPlayerTacticalPos={setPlayerTacticalPos}
        tacticalRolesByPlayer={tacticalRolesByPlayer}
        setTacticalRolesByPlayer={setTacticalRolesByPlayer}
        TACTICAL_POSITIONS={TACTICAL_POSITIONS}
        TACTICAL_DUTIES={TACTICAL_DUTIES}
        TACTICAL_ROLES_BY_POS={TACTICAL_ROLES_BY_POS}
        calcRoleSuitability={calcRoleSuitability}
        getDefaultRoleForPosition={getDefaultRoleForPosition}
        normalizePosition={normalizePosition}
        selectedTeamRoster={selectedTeamRoster}
        selectedTeamRosterIds={selectedTeamRosterIds}
        openContextMenu={openContextMenu}
        openPlayer={openPlayer}
        openStaffMember={openStaffMember}
        openBoardMember={openBoardMember}
        selectedStaffContract={selectedStaffContract}
        selectedStaffClauses={selectedStaffClauses}
        selectedStaffBonuses={selectedStaffBonuses}
        staffTab={staffTab}
        setStaffTab={setStaffTab}
        selectedStaffAttrSection={selectedStaffAttrSection}
        setSelectedStaffAttrSection={setSelectedStaffAttrSection}
        STAFF_ATTR_SECTIONS={STAFF_ATTR_SECTIONS}
        selectedBoardAttrSection={selectedBoardAttrSection}
        setSelectedBoardAttrSection={setSelectedBoardAttrSection}
        selectedAgentPlayers={selectedAgentPlayers}
        selectedAgentPlayerIds={selectedAgentPlayerIds}
        agents={agents}
        agencyMap={agencyMap}
        humanizeId={humanizeId}
      />
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {contextMenu.actions && contextMenu.actions.length ? (
            contextMenu.actions.map((action, idx) => (
              <button
                key={`${action.label}-${idx}`}
                className="context-item"
                onClick={() => {
                  action.onClick?.();
                  setContextMenu(null);
                }}
              >
                {action.label}
              </button>
            ))
          ) : (
            <div className="context-empty">Sin acciones</div>
          )}
        </div>
      )}
    </div>
  );
}







