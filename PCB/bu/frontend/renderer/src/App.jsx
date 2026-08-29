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
import iconClub from "./assets/sidebar/club.svg";
import iconMedical from "./assets/sidebar/medical.svg";
import iconMarket from "./assets/sidebar/market.svg";
import iconSettings from "./assets/sidebar/settings.svg";
import TacticsCreatorAdvanced from "./components/TacticsCreatorAdvanced";
import TacticsBoardAdvanced from "./components/TacticsBoardAdvanced";
import SectionRouter from "./pages/SectionRouter";
import {
  TACTICAL_DUTIES,
  TACTICAL_POSITIONS,
  TACTICAL_ROLES_BY_POS,
  calcRoleSuitability,
  getDefaultRoleForPosition,
  normalizePosition,
} from "./lib/tacticalRoles";

const NEWS = [
  {
    title: "Informe médico actualizado",
    time: "08:30",
    text: "El staff recomienda carga moderada para evitar recaidas en el grupo de aleros.",
  },
  {
    title: "Sesion de video tactico",
    time: "11:00",
    text: "Se detecto una debilidad en el rebote defensivo en transicion.",
  },
  {
    title: "Mercado local abierto",
    time: "15:30",
    text: "Dos jugadores veteranos disponibles a contrato corto.",
  },
];

const RUMORS = [
  {
    source: "Insider Centro",
    text: "Un base creativo podria pedir traspaso si no ve minutos esta semana.",
  },
  {
    source: "Agent Loop",
    text: "Agencia premium explora opciones en Europa con clausula NBA Out.",
  },
  {
    source: "Scout Feed",
    text: "Prospecto con motor elite aparece en torneo regional.",
  },
];

const CHATS = [
  { room: "#LockerRoom", last: "Necesitamos una decision sobre la rotacion.", badge: 3 },
  { room: "#Staff", last: "Plan de entrenamiento listo para revision.", badge: 1 },
  { room: "#FrontOffice", last: "Cap disponible si movemos un contrato.", badge: 2 },
];

const NAV_ITEMS = [
  { id: "Hub", label: "Hub", icon: iconSettings },
  { id: "Plantilla", label: "Plantilla", icon: iconRoster },
  { id: "Entrenamiento", label: "Entrenamiento", icon: iconTraining },
  { id: "Tacticas", label: "Tacticas", icon: iconTactics },
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
    columns: ["pos", "age", "height", "weight", "wingspan", "nationality", "archetype", "salary"],
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

const ROTATION_LEAGUE_RULES = {
  NBA: { name: "NBA", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 12, colCheck: 60 },
  WNBA: { name: "WNBA", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 10, colCheck: 50 },
  FIBA_M: { name: "FIBA Men", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 10, colCheck: 50 },
  FIBA_W: { name: "FIBA Women", labels: ["Q1", "Q2", "Q3", "Q4"], count: 4, duration: 10, colCheck: 50 },
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
  NCAA_M: 40,
  NCAA_W: 40,
};

const ROTATION_LEAGUE_COLORS = {
  NBA: "#ef4444",
  WNBA: "#f97316",
  FIBA_M: "#3b82f6",
  FIBA_W: "#8b5cf6",
  NCAA_M: "#22c55e",
  NCAA_W: "#14b8a6",
};

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

const LOOP_DEFAULT_START = "2026-09-15";

const trainingDuration = (start, end) => {
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  const minutes = h2 * 60 + m2 - (h1 * 60 + m1);
  return minutes > 0 ? minutes : 0;
};

const parseIsoDate = (value) => {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
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
  const [section, setSection] = useState("Plantilla");
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
  const [clubView, setClubView] = useState("vision");
  const [marketView, setMarketView] = useState("scouting");
  const [tacticsView, setTacticsView] = useState("board");
  const [trainingView, setTrainingView] = useState("team");
  const [medicalView, setMedicalView] = useState("overview");
  const [rotationLeagueType, setRotationLeagueType] = useState("FIBA_M");
  const [rotationPlayers, setRotationPlayers] = useState([]);
  const [rotationPreset, setRotationPreset] = useState("std_10");
  const [rotationSaving, setRotationSaving] = useState(false);
  const [rotationSaved, setRotationSaved] = useState(false);
  const [rotationDirty, setRotationDirty] = useState(false);
  const [trainingContext, setTrainingContext] = useState("Regular");
  const [trainingWeekStart, setTrainingWeekStart] = useState(() => startOfWeek(new Date()));
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
  const [loopTeamState, setLoopTeamState] = useState({
    morale: 72,
    fatigue: 38,
    cohesion: 55,
    tactical: 52,
    fitness: 58,
    recovery: 52,
    prep: 45,
  });
  const loopInitRef = useRef("");
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

  const loadStored = (key, fallback) => {
    try {
      const raw = window.localStorage?.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
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

  useEffect(() => {
    if (!myTeamId) {
      const stored = loadStored("pcbasket.myTeam", "");
      if (stored) setMyTeamId(String(stored));
    }
  }, [myTeamId]);

  useEffect(() => {
    setRosterView(loadView("pcbasket.view.roster", "plantilla"));
    setTacticsView(loadView("pcbasket.view.tactics", "board"));
    setTrainingView(loadView("pcbasket.view.training", "team"));
    setMedicalView(loadView("pcbasket.view.medical", "overview"));
  }, []);

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
    if (!myTeamId || teams.length === 0) return;
    if (loopInitRef.current === String(myTeamId)) return;
    const stateKey = `pcbasket.loop.state.${myTeamId}`;
    const scheduleKey = `pcbasket.loop.schedule.${myTeamId}`;
    const resultsKey = `pcbasket.loop.results.${myTeamId}`;
    const storedState = loadStored(stateKey, null);
    const storedSchedule = loadStored(scheduleKey, null);
    const storedResults = loadStored(resultsKey, []);
    const nextStateRaw = storedState && storedState.date ? storedState : { date: LOOP_DEFAULT_START, phase: 0 };
    const nextState = {
      ...nextStateRaw,
      date: formatLocalDate(parseIsoDate(nextStateRaw.date)),
    };
    const baseSchedule =
      Array.isArray(storedSchedule) && storedSchedule.length
        ? storedSchedule
        : (() => {
          const opponents = teams.filter((t) => String(t.id) !== String(myTeamId));
          const schedule = [];
          let cursor = parseIsoDate(nextState.date);
          opponents.forEach((opp, idx) => {
            const homeFirst = idx % 2 === 0;
            const first = {
              id: `${myTeamId}-${opp.id}-1`,
              date: formatLocalDate(cursor),
              homeId: homeFirst ? myTeamId : opp.id,
              awayId: homeFirst ? opp.id : myTeamId,
              played: false,
            };
            schedule.push(first);
            cursor = addDays(cursor, 3 + (idx % 2));
            const second = {
              id: `${myTeamId}-${opp.id}-2`,
              date: formatLocalDate(cursor),
              homeId: homeFirst ? opp.id : myTeamId,
              awayId: homeFirst ? myTeamId : opp.id,
              played: false,
            };
            schedule.push(second);
            cursor = addDays(cursor, 4 - (idx % 2));
          });
          return schedule;
        })();
    const results = Array.isArray(storedResults) ? storedResults : [];
    const scheduleWithResults = baseSchedule.map((fixture) => {
      const normalizedDate = formatLocalDate(parseIsoDate(fixture.date));
      const match = results.find((r) => r.fixtureId === fixture.id);
      if (!match) return { ...fixture, date: normalizedDate };
      return { ...fixture, date: normalizedDate, played: true, resultId: match.id };
    });
    setLoopState(nextState);
    setLoopSchedule(scheduleWithResults);
    setLoopResults(results);
    loopInitRef.current = String(myTeamId);
  }, [myTeamId, teams]);

  useEffect(() => {
    if (!myTeamId) return;
    try {
      window.localStorage?.setItem(`pcbasket.loop.state.${myTeamId}`, JSON.stringify(loopState));
      window.localStorage?.setItem(`pcbasket.loop.schedule.${myTeamId}`, JSON.stringify(loopSchedule));
      window.localStorage?.setItem(`pcbasket.loop.results.${myTeamId}`, JSON.stringify(loopResults));
      window.localStorage?.setItem(`pcbasket.loop.teamstate.${myTeamId}`, JSON.stringify(loopTeamState));
    } catch (err) {
      // ignore
    }
  }, [loopState, loopSchedule, loopResults, loopTeamState, myTeamId]);

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

  const getAttrValue = (player, key) => scaleAttr(player?.data?.attributes?.[key]);

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
      return { offense: 50, defense: 50, overall: 50 };
    }
    const sorted = [...roster].sort((a, b) => calcPlayerScore(b) - calcPlayerScore(a));
    const core = sorted.slice(0, 8);
    const offense =
      core.reduce((sum, p) => sum + calcOffenseScore(p), 0) / Math.max(1, core.length);
    const defense =
      core.reduce((sum, p) => sum + calcDefenseScore(p), 0) / Math.max(1, core.length);
    const overall =
      core.reduce((sum, p) => sum + calcPlayerScore(p), 0) / Math.max(1, core.length) / 10;
    return { offense, defense, overall };
  }, [getTeamRoster, calcPlayerScore, calcOffenseScore, calcDefenseScore]);

  const simulateFixture = useCallback((fixture) => {
    const homeProfile = calcTeamProfile(fixture.homeId);
    const awayProfile = calcTeamProfile(fixture.awayId);
    const homeAdv = 2.5;
    const myTeamBonus =
      (loopTeamState.morale - 50) * 0.08 -
      (loopTeamState.fatigue - 50) * 0.06 +
      (loopTeamState.cohesion - 50) * 0.05 +
      (loopTeamState.tactical - 50) * 0.05 +
      (loopTeamState.prep - 45) * 0.06;
    const homeBonus = String(fixture.homeId) === String(myTeamId) ? myTeamBonus : 0;
    const awayBonus = String(fixture.awayId) === String(myTeamId) ? myTeamBonus : 0;
    const baseHome = 72 + (homeProfile.offense - awayProfile.defense) * 0.35 + homeAdv;
    const baseAway = 70 + (awayProfile.offense - homeProfile.defense) * 0.35;
    const variance = (Math.random() - 0.5) * 10;
    let homeScore = Math.max(60, Math.round(baseHome + variance + homeBonus));
    let awayScore = Math.max(60, Math.round(baseAway - variance + awayBonus));
    if (homeScore === awayScore) {
      homeScore += Math.random() > 0.5 ? 1 : -1;
    }
    return {
      id: `${fixture.id}-${Date.now()}`,
      fixtureId: fixture.id,
      date: fixture.date,
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      homeScore,
      awayScore,
    };
  }, [calcTeamProfile, loopTeamState, myTeamId]);

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


  const myTeam = useMemo(() => {
    if (!myTeamId) return null;
    return teams.find((t) => String(t.id) === String(myTeamId)) || null;
  }, [teams, myTeamId]);

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
    return myRoster
      .map((p) => {
        const { risk, durability } = getLoadMetrics(p);
        if (risk < 60) return null;
        const status = risk >= 80 ? "Grave" : risk >= 70 ? "Moderada" : "Leve";
        const injury =
          risk >= 80
            ? "Riesgo muscular severo"
            : risk >= 70
              ? "Sobrecarga muscular"
              : "Molestias recurrentes";
        const days = Math.max(5, Math.round((100 - durability) * 0.3 + risk * 0.2));
        return {
          player: p,
          injury,
          days,
          status,
          risk,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.risk - a.risk);
  }, [myRoster]);

  const rosterStatusMap = useMemo(() => {
    const map = {};
    injuryList.forEach((item) => {
      map[item.player.id] = item;
    });
    return map;
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

  const rosterColumnMeta = useMemo(() => ({
    pos: {
      label: "Pos",
      width: "0.6fr",
      align: "center",
      get: (p) => p.data?.bio?.pos || "--",
      sort: (p) => String(p.data?.bio?.pos || ""),
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
      get: (p) => formatMoney(contractMap[p.id]?.data?.salary, contractMap[p.id]?.data?.currency),
      sort: (p) => safeNum(contractMap[p.id]?.data?.salary),
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
      get: (p) => contractMap[p.id]?.data?.type || "--",
      sort: (p) => String(contractMap[p.id]?.data?.type || ""),
    },
    value: {
      label: "Valor",
      width: "0.9fr",
      align: "right",
      get: (p) => formatMoney(contractMap[p.id]?.data?.value, contractMap[p.id]?.data?.currency),
      sort: (p) => safeNum(contractMap[p.id]?.data?.value),
    },
  }), [contractMap]);

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
    return myRoster.reduce((sum, p) => sum + safeNum(map[p.id]?.data?.salary || 0), 0);
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
    return players.filter((p) => p.data?.team_id === selectedTeam.id);
  }, [players, selectedTeam]);
  const selectedTeamRosterIds = useMemo(
    () => selectedTeamRoster.map((p) => p.id),
    [selectedTeamRoster],
  );
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

  const loadPlayers = async () => {
    setLoadingPlayers(true);
    try {
      const res = await window.pcbasket.invoke("player.list", { limit: 1000, offset: 0 });
      const list = res?.result?.items || [];
      setPlayers(list);
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
      const res = await window.pcbasket.invoke("team.list", { limit: 50, offset: 0 });
      const list = res?.result?.items || [];
      setTeams(list);
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

    const offEvent = window.pcbasket.on("engine.event", (data) => {
      show({ event: data });
    });
    const offErr = window.pcbasket.on("engine.error", (data) => {
      show({ error: data });
    });

    loadTeams();
    loadPlayers();
    loadContracts();
    loadAgencies();
    loadAgents();

    return () => {
      offEvent();
      offErr();
    };
  }, []);

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
      rating: Math.round(s.rating || s.current_ability || 75),
    }));
    const fallback = [
      { id: 1, name: "Staff Principal", role: "Entrenador", rating: 82 },
      { id: 2, name: "Staff Ofensivo", role: "Asistente", rating: 78 },
      { id: 3, name: "Staff Defensivo", role: "Asistente", rating: 80 },
      { id: 4, name: "Preparador Fisico", role: "Fisico", rating: 84 },
    ];
    const next = staffList.length ? staffList : fallback;
    setTrainingStaff(next);
    if (!trainingStaffId && next.length) {
      setTrainingStaffId(next[0].id);
    }
  }, [myStaff, trainingStaffId]);

  useEffect(() => {
    const today = new Date();
    const monthDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const generated = Array.from({ length: monthDays }, (_, idx) => {
      const day = idx + 1;
      const dayDate = new Date(today.getFullYear(), today.getMonth(), day);
      const dayOfWeek = dayDate.getDay();
      const isRest = dayOfWeek === 0;
      return {
        day,
        type: isRest ? "Rest" : "Train",
      };
    });
    setTrainingMonthDays(generated);
  }, []);

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

  const loopLastResult = useMemo(() => {
    if (!myTeamId) return null;
    const list = loopResults.filter((r) => String(r.homeId) === String(myTeamId) || String(r.awayId) === String(myTeamId));
    return list.length ? list[list.length - 1] : null;
  }, [loopResults, myTeamId]);

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

  const applyDailyTrainingEffects = useCallback((dateStr) => {
    const sessions = getTrainingSessionsForDate(dateStr);
    let totalLoad = 0;
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

    setLoopTeamState((prev) => {
      const recoveryBonus = prev.recovery * 0.08;
      const fatigue = clamp(prev.fatigue + loadScore * 0.9 - recoveryBonus - restBonus);
      const morale = clamp(prev.morale + totals.morale * 1.2 + (sessions.length ? 0 : 0.5));
      const cohesion = clamp(prev.cohesion + totals.cohesion * 1.4);
      const tactical = clamp(prev.tactical + totals.tactical * 1.4);
      const fitness = clamp(prev.fitness + totals.fitness * 1.6);
      const recovery = clamp(prev.recovery + totals.fitness * 0.6 + (sessions.length ? 0 : 1.5) - 0.4);
      const prep = clamp(prev.prep + totals.prep * 1.5 - 1);
      return {
        ...prev,
        fatigue,
        morale,
        cohesion,
        tactical,
        fitness,
        recovery,
        prep,
      };
    });
  }, [getTrainingSessionsForDate]);

  const handleAdvanceLoopPhase = () => {
    if (!loopState?.date) return;
    const nextPhase = loopState.phase + 1;
    if (nextPhase < LOOP_PHASES.length) {
      setLoopState((prev) => ({ ...prev, phase: nextPhase }));
      return;
    }
    applyDailyTrainingEffects(loopState.date);
    if (loopTodayFixture && !loopTodayFixture.played) {
      handleSimulateMatch(loopTodayFixture);
    }
    const nextDate = formatLocalDate(addDays(parseIsoDate(loopState.date), 1));
    setLoopState({ date: nextDate, phase: 0 });
  };

  const handleSimulateMatch = (fixture) => {
    if (!fixture || fixture.played) return;
    const result = simulateFixture(fixture);
    setLoopResults((prev) => [...prev, result]);
    setLoopSchedule((prev) =>
      prev.map((f) => (f.id === fixture.id ? { ...f, played: true, resultId: result.id } : f)),
    );
    const isHome = String(result.homeId) === String(myTeamId);
    const won = isHome ? result.homeScore > result.awayScore : result.awayScore > result.homeScore;
    setLoopTeamState((prev) => ({
      ...prev,
      morale: clamp(prev.morale + (won ? 4 : -4)),
      cohesion: clamp(prev.cohesion + (won ? 1 : -1)),
      fatigue: clamp(prev.fatigue + 10),
      prep: clamp(prev.prep - 8),
    }));
  };

  const generateTrainingSchedule = useCallback(
    (context, weekStart) => {
      const days = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
      return days.map((dayName, i) => {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
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
    const weekKey = `pcbasket.training.week.${myTeamId}.${isoDate(trainingWeekStart)}`;
    const saved = loadStored(weekKey, null);
    if (saved && Array.isArray(saved.plan)) {
      setTrainingPlan(saved.plan.map(capTrainingSessions));
      setTrainingContext(saved.context || "Regular");
      return;
    }
    if (trainingAutoMode) {
      setTrainingPlan(generateTrainingSchedule(trainingContext, trainingWeekStart));
    } else {
      const days = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
      setTrainingPlan(
        days.map((dayName, i) => ({
          dayName,
          date: new Date(trainingWeekStart.getFullYear(), trainingWeekStart.getMonth(), trainingWeekStart.getDate() + i).getDate(),
          isMatch: false,
          sessions: [],
        })),
      );
    }
  }, [myTeamId, trainingWeekStart, trainingAutoMode, trainingContext, generateTrainingSchedule]);

  const applyRotationPreset = useCallback(
    (currentPlayers, type) => {
      const totalMinutes = ROTATION_LEAGUE_TOTAL_MINUTES[rotationLeagueType] || 40;
      const periodDuration = rotationRules.duration;
      const periodCount = rotationRules.count;
      const requiredPerPeriod = periodDuration * 5;

      const newPlayers = currentPlayers.map((p) => ({
        ...p,
        periods: Array(periodCount).fill(0),
      }));

      const smallBallBonus = (pos) => (["PG", "SG", "SF"].includes(pos) ? 8 : 0);
      const tallBallBonus = (pos) => (["PF", "C"].includes(pos) ? 8 : 0);
      const sortPlayers = () => {
        const list = [...newPlayers];
        if (type === "random") return list.sort(() => Math.random() - 0.5);
        if (type === "dev_youth") return list.sort((a, b) => (b.isYouth === a.isYouth ? b.rating - a.rating : b.isYouth ? 1 : -1));
        if (type === "veterans") return list.sort((a, b) => (b.age - a.age) || (b.rating - a.rating));
        if (type === "defense") return list.sort((a, b) => b.defense - a.defense);
        if (type === "offense") return list.sort((a, b) => b.offense - a.offense);
        if (type === "showcase") return list.sort((a, b) => a.rating - b.rating);
        if (type === "small_ball") return list.sort((a, b) => (smallBallBonus(b.pos) + b.rating) - (smallBallBonus(a.pos) + a.rating));
        if (type === "tall_ball") return list.sort((a, b) => (tallBallBonus(b.pos) + b.rating) - (tallBallBonus(a.pos) + a.rating));
        return list.sort((a, b) => b.rating - a.rating);
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

      setRotationPlayers(newPlayers);
      setRotationPreset(type);
      setRotationDirty(true);
      setRotationSaved(false);
    },
    [rotationLeagueType, rotationRules],
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
        rating: rating || Math.round(safeNum(p.current_ability || p.rating || 50)),
        stamina,
        age,
        isYouth: age > 0 && age < 23,
        offense: calcOffenseScore(p),
        defense: calcDefenseScore(p),
        color: ROTATION_POS_COLORS[pos] || "#cbd5e1",
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
    if (saved && Array.isArray(saved.players)) {
      const updated = base.map((player) => {
        const match = saved.players.find((sp) => sp.playerId === player.id);
        if (match && Array.isArray(match.periods)) {
          return { ...player, periods: match.periods.slice(0, rotationRules.count) };
        }
        return player;
      });
      setRotationPlayers(updated);
      setRotationPreset(saved.presetType || "custom");
      setRotationDirty(false);
      setRotationSaved(false);
    } else {
      applyRotationPreset(base, "std_10");
    }
  }, [myRoster, myTeamId, rotationLeagueType, rotationRules, applyRotationPreset]);

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

  const openPlayer = (playerId, contextIds = null) => {
    setSelectedTeamId(null);
    setSelectedAgencyId(null);
    setSelectedAgentId(null);
    setSelectedStaff(null);
    setSelectedBoard(null);
    setSelectedPlayerId(playerId);
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
    setMyTeamId(String(teamId));
    setSection("Plantilla");
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
        keys: ["pos", "age", "height", "weight", "wingspan", "nationality", "archetype"],
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
              { label: "Ver ficha", onClick: () => openPlayer(p.id, listIds) },
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

  const renderHub = () => {
    const hubRoster = myRoster.slice(0, 8);
    const hubIds = toIdList(hubRoster);
    const loopPhase = LOOP_PHASES[loopState.phase] || LOOP_PHASES[0];
    const loopPhaseIndex = Math.min(loopState.phase + 1, LOOP_PHASES.length);
    const isEndOfDay = loopPhaseIndex === LOOP_PHASES.length;
    const hasMatchToday = Boolean(loopTodayFixture);
    const advanceLabel = isEndOfDay
      ? hasMatchToday
        ? "Cerrar dia (simular partido)"
        : "Cerrar dia"
      : "Avanzar bloque";
    const loopDateObj = loopState?.date ? parseIsoDate(loopState.date) : new Date();
    const loopDateLabel = loopDateObj.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
    const nextFixture = loopNextFixture;
    const nextOpponentId = nextFixture
      ? String(nextFixture.homeId) === String(myTeamId)
        ? nextFixture.awayId
        : nextFixture.homeId
      : null;
    const nextOpponent = nextOpponentId ? teamMap[nextOpponentId] : null;
    const lastResult = loopLastResult;
    const lastOpponentId = lastResult
      ? String(lastResult.homeId) === String(myTeamId)
        ? lastResult.awayId
        : lastResult.homeId
      : null;
    const lastOpponent = lastOpponentId ? teamMap[lastOpponentId] : null;
    const lastWasHome = lastResult ? String(lastResult.homeId) === String(myTeamId) : false;
    const lastScore = lastResult
      ? lastWasHome
        ? `${lastResult.homeScore} - ${lastResult.awayScore}`
        : `${lastResult.awayScore} - ${lastResult.homeScore}`
      : "--";
    return (
      <section className="bento">
      <div className="card hero modal-glass-tactical loop-card">
        <div className="card-header">
          <h2>Core Gameplay Loop</h2>
          <span className="tag">{loopPhase.label}</span>
        </div>
        <div className="loop-grid">
          <div className="loop-block">
            <div className="eyebrow">Fecha</div>
            <div className="loop-date">{loopDateLabel}</div>
            <div className="loop-phase">Bloque actual: {loopPhase.focus}</div>
            <div className="loop-record">Bloque {loopPhaseIndex} / {LOOP_PHASES.length}</div>
            <div className="loop-record">Record: {loopRecord.w}-{loopRecord.l}</div>
            <div className="loop-metrics">
              <div><span>Moral</span><strong>{loopTeamState.morale}</strong></div>
              <div><span>Fatiga</span><strong>{loopTeamState.fatigue}</strong></div>
              <div><span>Cohesion</span><strong>{loopTeamState.cohesion}</strong></div>
              <div><span>Tactica</span><strong>{loopTeamState.tactical}</strong></div>
              <div><span>Recuperacion</span><strong>{loopTeamState.recovery}</strong></div>
              <div><span>Preparacion</span><strong>{loopTeamState.prep}</strong></div>
            </div>
            <div className="loop-actions">
              <button className="subnav-item" onClick={handleAdvanceLoopPhase}>{advanceLabel}</button>
              <button
                className="subnav-item primary"
                onClick={() => handleSimulateMatch(loopTodayFixture)}
                disabled={!loopTodayFixture}
              >
                {loopTodayFixture ? "Simular partido" : "Sin partido hoy"}
              </button>
            </div>
          </div>
          <div className="loop-block">
            <div className="eyebrow">Proximo partido</div>
            <div className="loop-next">
              {nextFixture ? (
                <>
                  <div className="loop-next-title">{nextOpponent?.name || "Rival desconocido"}</div>
                  <div className="loop-next-sub">
                    {nextFixture.date} · {String(nextFixture.homeId) === String(myTeamId) ? "Local" : "Visitante"}
                  </div>
                </>
              ) : (
                <div className="desc">Sin partidos pendientes.</div>
              )}
            </div>
            <div className="eyebrow">Ultimo resultado</div>
            <div className="loop-last">
              {lastResult ? (
                <>
                  <div className="loop-next-title">{lastOpponent?.name || "Rival"}</div>
                  <div className="loop-next-sub">{lastScore}</div>
                </>
              ) : (
                <div className="desc">Aun sin resultados.</div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Agenda de hoy</h2>
          <span className="tag">Prioridades</span>
        </div>
        <div className="agenda">
          <div className="agenda-item">
            <div className="time">09:00</div>
            <div>
              <div className="title">Reunión con staff médico</div>
              <div className="desc">Ajuste de cargas y prevencion de recaidas.</div>
            </div>
          </div>
          <div className="agenda-item">
            <div className="time">13:30</div>
            <div>
              <div className="title">Revision de rotaciones</div>
              <div className="desc">Balance entre defensa y ritmo.</div>
            </div>
          </div>
          <div className="agenda-item">
            <div className="time">18:00</div>
            <div>
              <div className="title">Rueda de prensa</div>
              <div className="desc">Mensaje sobre objetivos de corto plazo.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card stream modal-glass-tactical">
        <div className="card-header">
          <h2>News Stream</h2>
          <span className="tag">Oficial</span>
        </div>
        <div className="list">
          {NEWS.map((item) => (
            <div key={item.title} className="list-item">
              <div className="time">{item.time}</div>
              <div>
                <div className="title">{item.title}</div>
                <div className="desc">{item.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card rumor modal-glass-tactical">
        <div className="card-header">
          <h2>Rumor Mill</h2>
          <span className="tag muted">Insiders</span>
        </div>
        <div className="list compact">
          {RUMORS.map((item) => (
            <div key={item.source} className="list-item">
              <div className="pill">{item.source}</div>
              <div className="desc">{item.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card chat modal-glass-tactical">
        <div className="card-header">
          <h2>Direct Connect</h2>
          <span className="tag">Teams</span>
        </div>
        <div className="list">
          {CHATS.map((room) => (
            <div key={room.room} className="chat-row">
              <div>
                <div className="title">{room.room}</div>
                <div className="desc">{room.last}</div>
              </div>
              <div className="badge">{room.badge}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card roster player-card-elite">
        <div className="card-header">
          <h2>Roster Snapshot</h2>
          <span className="tag">Live</span>
        </div>
        <div className="table">
          <div className="row head">
            <div>Jugador</div>
            <div>Pos</div>
            <div>Age</div>
            <div>Arquetipo</div>
          </div>
          {hubRoster.length === 0 ? (
            <div className="row empty">Sin datos. Usa Ping o Roster.</div>
          ) : (
            hubRoster.map((p) => {
              const archeId = p.data?.identity?.arquetipo;
              const archeLabel = p.data?.identity?.arquetipo_label || labelFor("arche", archeId);
              const archeDesc = p.data?.identity?.arquetipo_desc || descFor("arche", archeId, archeLabel);
              return (
                <div className="row" key={p.id}>
                  <div>
                    <button className="link mono" onClick={() => openPlayer(p.id, hubIds)}>
                      {p.name}
                    </button>
                  </div>
                  <div>{p.data?.bio?.pos || "--"}</div>
                  <div>{p.data?.bio?.age || "--"}</div>
                  <div className="mono" title={archeDesc}>{archeLabel}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="card metrics attribute-section-refined">
        <div className="card-header">
          <h2>Team Metrics</h2>
          <span className="tag muted">Simulation</span>
        </div>
        <div className="bars">
          <div className="bar">
            <div className="label">Offense</div>
            <div className="track"><div className="fill" style={{ width: "72%" }} /></div>
            <div className="value mono">72</div>
          </div>
          <div className="bar">
            <div className="label">Defense</div>
            <div className="track"><div className="fill" style={{ width: "64%" }} /></div>
            <div className="value mono">64</div>
          </div>
          <div className="bar">
            <div className="label">Chemistry</div>
            <div className="track"><div className="fill" style={{ width: "58%" }} /></div>
            <div className="value mono">58</div>
          </div>
        </div>
      </div>

    </section>
  );
  };

  const renderStart = () => (
    <section className="bento">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Selecciona tu equipo</h2>
          <span className="tag">Inicio</span>
        </div>
        <div className="desc">Elige un club para activar tu panel de equipo.</div>
        <div className="team-grid">
          {teams.length === 0 ? (
            <div className="desc">Sin datos. {loadingTeams ? "Cargando..." : ""}</div>
          ) : (
            teams.map((t) => (
              <button
                key={t.id}
                className="team-card"
                onClick={() => selectMyTeam(t.id)}
                onContextMenu={(e) =>
                  openContextMenu(e, [
                    { label: "Elegir equipo", onClick: () => selectMyTeam(t.id) },
                    { label: "Ver ficha", onClick: () => openTeam(t.id) },
                  ])
                }
              >
                <div className="team-title">{t.name}</div>
                <div className="team-sub">{t.data?.city || "--"}</div>
                <div className="team-meta">
                  <span className="chip muted">Budget {t.data?.budget || "--"}</span>
                  <span className="chip muted">Rep {t.data?.reputation || "--"}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );

  const renderRosterAnalysis = () => {
    const rosterIds = toIdList(myRoster);
    return (
      <div className="analysis-split">
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
                <div className="mono">{slot.pos}</div>
                <div>
                  {slot.starter ? (
                    <button className="link mono" onClick={() => openPlayer(slot.starter.id, rosterIds)}>
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

        <div className="card analysis-card">
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
                  placeholder="Buscar grupo..."
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
        <div className="desc">Riesgo calculado según durabilidad y recuperación.</div>
        <div className="table injuries">
          <div className="row head injuries">
            <div>Jugador</div>
            <div>Lesión</div>
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
        <div className="desc">Histórico estimado según perfil físico del jugador.</div>
        <div className="table training-table scroll-x">
          <div className="row head training load">
            <div>Jugador</div>
            <div>Tipo</div>
            <div>Duración</div>
            <div>Recaídas</div>
            <div>Estado</div>
          </div>
          {[...myRoster].sort((a, b) => getLoadMetrics(b).risk - getLoadMetrics(a).risk).slice(0, 10).map((p) => {
            const metrics = getLoadMetrics(p);
            const duration = Math.max(5, Math.round((100 - metrics.durability) * 0.35));
            const relapses = metrics.risk >= 70 ? "Sí" : "No";
            const status = metrics.risk >= 70 ? "Vigilancia" : "Ok";
            const type = metrics.durability < 55 ? "Muscular" : "Articular";
            return (
              <div className="row training load" key={p.id}>
                <div className="mono">{p.name}</div>
                <div>{type}</div>
                <div>{duration} días</div>
                <div>{relapses}</div>
                <div>
                  <span className={`training-badge ${status === "Vigilancia" ? "warn" : ""}`}>
                    {status}
                  </span>
                </div>
              </div>
            );
          })}
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

    return (
      <div className="roster-page">
        <div className="roster-tabs">
          <button
            className={`roster-tab ${rosterView === "plantilla" ? "active" : ""}`}
            onClick={() => setRosterView("plantilla")}
          >
            Plantilla
          </button>
          <button
            className={`roster-tab ${rosterView === "analysis" ? "active" : ""}`}
            onClick={() => setRosterView("analysis")}
          >
            Análisis + Dinámicas
          </button>
          <button
            className={`roster-tab ${rosterView === "mentoring" ? "active" : ""}`}
            onClick={() => setRosterView("mentoring")}
          >
            Mentoring
          </button>
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
                      placeholder="Buscar jugador..."
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
              <div className="roster-view-tabs">
                {ROSTER_VIEWS.map((view) => (
                  <button
                    key={view.id}
                    className={`roster-view-tab ${activeRosterView === view.id ? "active" : ""}`}
                    onClick={() => handleRosterViewChange(view.id)}
                  >
                    {view.name}
                  </button>
                ))}
                {(customRosterColumns.length > 0 || activeRosterView === "custom") && (
                  <button
                    className={`roster-view-tab ${activeRosterView === "custom" ? "active" : ""}`}
                    onClick={() => handleRosterViewChange("custom")}
                  >
                    Personalizada
                  </button>
                )}
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
                      <span className="sort-indicator">{rosterSort.direction === "asc" ? "?" : "?"}</span>
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
                          <span className="sort-indicator">{rosterSort.direction === "asc" ? "?" : "?"}</span>
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
                        onContextMenu={(e) =>
                          openContextMenu(e, [
                            { label: "Ver ficha", onClick: () => openPlayer(p.id, rosterIds) },
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
                          <button className="link mono" onClick={() => openPlayer(p.id, rosterIds)}>
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
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const editingEffects = trainingEditingSession ? computeTrainingEffects(trainingEditingSession) : null;
    const formatTrainingAttr = (key) => attributeLabelMap[key] || humanizeId(key);
    const editingAttrList = editingEffects?.attributeKeys || [];
    const editingAttrTooltip = editingAttrList.length ? editingAttrList.map(formatTrainingAttr).join(", ") : "";

    const isDatePast = (date) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const check = new Date(date);
      check.setHours(0, 0, 0, 0);
      return check < tomorrow;
    };

    const changeWeek = (direction) => {
      const next = new Date(weekStart);
      next.setDate(next.getDate() + (direction === "next" ? 7 : -7));
      const nextEnd = new Date(next);
      nextEnd.setDate(next.getDate() + 6);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      if (direction === "prev" && nextEnd < tomorrow) {
        alert("No puedes programar entrenamientos en semanas pasadas.");
        return;
      }
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
        day.sessions.forEach((session) => {
          const enriched = session.effects ? session : withTrainingEffects(session);
          weekSessions.push({
            ...enriched,
            clubId: myTeamId,
            date: dateStr,
            dayName: day.dayName,
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
              <span className="chip">Equipo {myTeam?.name}</span>
              <span className="chip muted">Carga {trainingLoad.status}</span>
              <span className="chip muted">Total {Math.round(trainingLoad.total)} AU</span>
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
                    {staff.name} ({staff.rating})
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
                const past = isDatePast(dayDate);
                const atLimit = day.sessions.length >= MAX_TRAINING_SESSIONS_PER_DAY;
                return (
                  <div key={`${day.dayName}-${dayIndex}`} className={`training-day ${past ? "past" : ""}`}>
                    <div className="training-day-head">
                      <span>{day.dayName}</span>
                      {!past && (
                        <button onClick={() => handleAddSession(dayIndex)} disabled={atLimit}>
                          {atLimit ? `Max ${MAX_TRAINING_SESSIONS_PER_DAY}` : "+ Sesion"}
                        </button>
                      )}
                    </div>
                    <div className="training-day-body">
                      {day.sessions.length === 0 ? (
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
              <span>{new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</span>
            </div>
            <div className="training-calendar-grid">
              {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
                <div key={d} className="training-calendar-weekday">{d}</div>
              ))}
              {Array.from({ length: startOffset }).map((_, idx) => (
                <div key={`offset-${idx}`} />
              ))}
              {trainingMonthDays.map((d) => {
                const today = new Date();
                const dayDate = new Date(today.getFullYear(), today.getMonth(), d.day);
                const dayStr = isoDate(dayDate);
                const sessionCount = trainingSavedSessions.filter((s) => s.date === dayStr).length;
                return (
                  <div
                    key={`day-${d.day}`}
                    className={`training-calendar-day ${d.type.toLowerCase()}`}
                    title={sessionCount ? `${sessionCount} sesiones` : undefined}
                  >
                    <span>{d.day}</span>
                    {sessionCount > 0 && <div className="training-calendar-badge">{sessionCount}</div>}
                  </div>
                );
              })}
            </div>
            <div className="training-calendar-note">
              {trainingAutoMode
                ? "Modo automatico activo: el plan se ajusta al contexto."
                : `Modo manual: ${trainingSavedSessions.length} sesiones programadas.`}
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
      if (key === "dorsal") return <div style={{ textAlign: "center", color: "#94a3b8" }}>{val}</div>;
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
        }[val] || { color: "white", bg: "transparent", label: val };
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
            <div style={{ flex: 1, height: 6, background: "#334155", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${val}%`, height: "100%", background: color }} />
            </div>
            <span style={{ fontSize: "0.75rem", color: "#cbd5e1", width: 28, textAlign: "right" }}>{val}%</span>
          </div>
        );
      }

      if (key === "trend") {
        if (val === "up") return <TrendingUp size={16} color="#ef4444" title="Subiendo carga" />;
        if (val === "down") return <TrendingDown size={16} color="#22c55e" title="Bajando carga" />;
        return <Minus size={16} color="#64748b" />;
      }

      return <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>{val}</div>;
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
              <div style={{ background: "rgba(15, 23, 42, 0.75)", padding: "15px 20px", borderRadius: 10, borderLeft: "4px solid #ef4444", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>ALERTA LESION</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "white" }}>{loadManagementStats.risk}</div>
                </div>
                <Activity color="#ef4444" size={24} />
              </div>
              <div style={{ background: "rgba(15, 23, 42, 0.75)", padding: "15px 20px", borderRadius: 10, borderLeft: "4px solid #22c55e", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>CARGA OPTIMA</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "white" }}>{loadManagementStats.optimal}</div>
                </div>
                <Check color="#22c55e" size={24} />
              </div>
              <div style={{ background: "rgba(15, 23, 42, 0.75)", padding: "15px 20px", borderRadius: 10, borderLeft: "4px solid #eab308", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>FATIGA MEDIA</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "white" }}>{loadManagementStats.avgFatigue}%</div>
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
                      background: loadActiveViewId === v.id ? "#3b82f6" : "rgba(255,255,255,0.05)",
                      border: "1px solid",
                      borderColor: loadActiveViewId === v.id ? "#3b82f6" : "rgba(255,255,255,0.1)",
                      color: loadActiveViewId === v.id ? "white" : "#94a3b8",
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
                  <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                  <input
                    type="text"
                    placeholder="Buscar jugador..."
                    value={loadSearchQuery}
                    onChange={(e) => setLoadSearchQuery(e.target.value)}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "white",
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
                    background: loadShowFilters ? "#eab308" : "rgba(255,255,255,0.05)",
                    color: loadShowFilters ? "black" : "white",
                    border: "1px solid rgba(255,255,255,0.1)",
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
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "white",
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
              <div style={{ background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: 8, padding: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "#fef08a", cursor: "pointer", fontWeight: "bold" }}>
                  <input type="checkbox" checked={loadFilters.onlyRisk} onChange={(e) => setLoadFilters({ ...loadFilters, onlyRisk: e.target.checked })} />
                  Solo Alto Riesgo
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "#fef08a", cursor: "pointer", fontWeight: "bold" }}>
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
                        {index > 2 && <GripVertical size={12} color="#475569" />}
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
                  background: "#1e293b",
                  border: "1px solid #475569",
                  borderRadius: 6,
                  zIndex: 100,
                  maxHeight: 300,
                  overflowY: "auto",
                  minWidth: 200,
                  padding: "5px 0",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
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
                      color: loadVisibleColumns.includes(key) ? "white" : "#64748b",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      justifyContent: "space-between",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#334155"; }}
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
            placeholder="Buscar nombre"
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
            placeholder="Buscar agencia o tier"
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
            placeholder="Buscar agente, estilo o agencia"
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
        roster={myRoster}
        tacticalRoles={tacticalRolesByPlayer}
        onRolesChange={setTacticalRolesByPlayer}
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

  const renderTacticsCreator = () => (
    <section className="bento tactics-creator-grid">
      <TacticsCreatorAdvanced
        clubId={myTeamId ? Number(myTeamId) : null}
        onSaveCustomPlay={handleSaveAdvancedPlay}
      />
      <div className="card roster player-card-elite roster-full">
        <div className="card-header">
          <h2>Catalogo de Jugadas</h2>
          <span className="tag">{customPlays.length} jugadas</span>
        </div>
        <div className="list compact">
          {customPlays.length === 0 ? (
            <div className="desc">Sin jugadas personalizadas.</div>
          ) : (
            customPlays.map((play) => (
              <div key={play.id} className="list-item">
                <div className="title">{play.name}</div>
                <div className="desc">
                  {play.type} · {play.focus} · {play.situation}
                </div>
                {play.notes && <div className="desc">{play.notes}</div>}
              </div>
            ))
          )}
        </div>
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

  const renderSection = () => {
    return (
      <SectionRouter
        section={section}
        myTeamId={myTeamId}
        myTeam={myTeam}
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
        clubView={clubView}
        setClubView={setClubView}
        renderClubProfile={renderClubProfile}
        renderStaff={renderStaff}
        renderDirectiva={renderDirectiva}
        renderClubEconomy={renderClubEconomy}
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
        renderScouting={renderScouting}
        renderAgencias={renderAgencias}
        renderAgentes={renderAgentes}
      />
    );
  };

  return (
    <div className={`app theme-${theme}`}>
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
              onClick={() => setSection(item.id)}
            >
              <img className="side-icon" src={item.icon} alt={item.label} />
              <span className="side-tooltip">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">Temporada 2026 ? Semana 3</div>
            <h1>{!myTeamId ? "Inicio" : section}</h1>
          </div>
          <div className="topbar-right">
            <div className="chip">Presupuesto: 3.2M</div>
            <div className="chip">Moral: {loopTeamState.morale}</div>
            <div className="chip">Fatiga: {loopTeamState.fatigue}</div>
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

        {renderSection()}
      </main>

      {(selectedPlayer || selectedTeam || selectedAgency || selectedAgent || selectedStaff || selectedBoard) && (
        <div className="detail-overlay" onClick={closeDetails}>
          <div className="detail-panel modal-glass-tactical" onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <div>
                <div className="eyebrow">View</div>
                <h2>
                  {selectedPlayer
                    ? "Player View"
                    : selectedTeam
                      ? "Team View"
                      : selectedAgency
                        ? "Agency View"
                        : selectedAgent
                          ? "Agent View"
                          : selectedStaff
                            ? "Staff View"
                            : "Board View"}
                </h2>
              </div>
              <button className="close" onClick={closeDetails}>Cerrar</button>
            </div>

            {selectedPlayer && (() => {
              const identity = selectedPlayer.data?.identity || {};
              const archeId = identity.arquetipo;
              const archeLabel = identity.arquetipo_label || labelFor("arche", archeId);
              const archeDesc = identity.arquetipo_desc || descFor("arche", archeId, archeLabel);
              const mentalId = identity.mentalidad;
              const mentalLabel = identity.mentalidad_label || labelFor("mental", mentalId);
              const mentalDesc = identity.mentalidad_desc || descFor("mental", mentalId, mentalLabel);
              const originId = identity.origin;
              const originLabel = identity.origin_label || labelFor("origin", originId);
              const originDesc = identity.origin_desc || descFor("origin", originId, originLabel);
              const personalityId = identity.personality;
              const personalityLabel = identity.personality_label || identity.personality || "--";
              const personalityDesc = identity.personality_desc || descFor("personality", personalityId, personalityLabel);
              const contract = contractMap[selectedPlayer.id];
              const contractData = contract?.data || {};
              const clauseItems = normalizeContractItems(contractData.clauses, contractData.clauses_detail);
              const bonusItems = normalizeContractItems(contractData.bonuses, contractData.bonuses_detail);

              return (
                <div className="detail-body">
                <div className="detail-hero">
                  <div>
                    <div className="detail-title">{selectedPlayer.name}</div>
                    <div className="detail-sub">
                      {teamMap[selectedPlayer.data?.team_id]?.name || "Agente Libre"} ·
                      {" "}{selectedPlayer.data?.bio?.pos || "--"} ·
                      {" "}{selectedPlayer.data?.bio?.age || "--"} años
                    </div>
                  </div>
                  <div className="detail-tags">
                    <span className="chip" title={archeDesc}>{archeLabel}</span>
                    <span className="chip" title={mentalDesc}>Mentalidad {mentalLabel}</span>
                    <span className="chip" title={originDesc}>Origen {originLabel}</span>
                    <span className="chip" title={personalityDesc}>Personalidad {personalityLabel}</span>
                  </div>
                  {playerContext.ids.length > 0 && (
                    <div className="detail-nav">
                      <button className="nav-arrow" onClick={() => openRelativePlayer(-1)} disabled={!canPrevPlayer}>
                        ‹
                      </button>
                      <button className="nav-arrow" onClick={() => openRelativePlayer(1)} disabled={!canNextPlayer}>
                        ›
                      </button>
                    </div>
                  )}
                </div>

                <div className="detail-tabs">
                  <button
                    className={`tab ${playerTab === "perfil" ? "active" : ""}`}
                    onClick={() => setPlayerTab("perfil")}
                  >
                    Perfil
                  </button>
                  <button
                    className={`tab ${playerTab === "contrato" ? "active" : ""}`}
                    onClick={() => setPlayerTab("contrato")}
                  >
                    Contrato
                  </button>
                  <button
                    className={`tab ${playerTab === "tactico" ? "active" : ""}`}
                    onClick={() => setPlayerTab("tactico")}
                  >
                    Rol tactico
                  </button>
                </div>

                {playerTab === "perfil" ? (
                  <>
                                  <div className="detail-grid">
                  <div className="detail-section">
                    <div className="section-title">Bio</div>
                    <div className="detail-list">
                      <div>Altura: {selectedPlayer.data?.bio?.height_cm || "--"} cm</div>
                      <div>Envergadura: {selectedPlayer.data?.bio?.wingspan_cm || "--"} cm</div>
                      <div>Peso: {selectedPlayer.data?.bio?.weight_kg || "--"} kg</div>
                      <div>Mano: {selectedPlayer.data?.bio?.hand || "--"}</div>
                      <div>Nacionalidad: {selectedPlayer.data?.bio?.nationality || "--"}</div>
                      <div>Origen: {selectedPlayer.data?.bio?.birthplace || "--"}</div>
                    </div>
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Agente</div>
                    <div className="detail-list">
                      <div>
                        Agente:{" "}
                        {selectedPlayer.data?.agent_id ? (
                          <button className="link mono" onClick={() => openAgent(selectedPlayer.data?.agent_id)}>
                            {selectedPlayer.data?.agent_name || "--"}
                          </button>
                        ) : (
                          selectedPlayer.data?.agent_name || "--"
                        )}
                      </div>
                      <div>
                        Agencia:{" "}
                        {selectedPlayer.data?.agency_id ? (
                          <button className="link" onClick={() => openAgency(selectedPlayer.data?.agency_id)}>
                            {selectedPlayer.data?.agency_name || "--"}
                          </button>
                        ) : (
                          selectedPlayer.data?.agency_name || "--"
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Traits & Perks</div>
                    <div className="detail-tags">
                      {(selectedPlayer.data?.traits || []).length === 0 && (
                        <span className="desc">Sin traits asignados.</span>
                      )}
                      {(selectedPlayer.data?.traits || []).map((t, idx) => {
                        const label = selectedPlayer.data?.traits_label?.[idx] || labelFor("trait", t);
                        const desc = selectedPlayer.data?.traits_desc?.[idx] || descFor("trait", t, label);
                        return (
                          <span key={t} className="chip muted" title={desc}>
                            {label}
                          </span>
                        );
                      })}
                      {(selectedPlayer.data?.perks || []).map((p, idx) => {
                        const label = selectedPlayer.data?.perks_label?.[idx] || labelFor("perk", p);
                        const desc = selectedPlayer.data?.perks_desc?.[idx] || descFor("perk", p, label);
                        return (
                          <span key={p} className="chip muted" title={desc}>
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-title">Atributos por Sección</div>
                  {renderRadarPanel(
                    ATTRIBUTE_SECTIONS,
                    selectedPlayer.data?.attributes || {},
                    selectedAttrSection,
                    setSelectedAttrSection,
                    selectedPlayer.data?.attributes_label,
                    selectedPlayer.data?.attributes_desc,
                  )}
                </div>
                  </>
              ) : playerTab === "contrato" ? (
                <div className="detail-grid">
                  <div className="detail-section">
                    <div className="section-title">Contrato</div>
                    {contract ? (
                      <div className="detail-list">
                        <div>Estado: {contractData.status || "--"}</div>
                        <div>Inicio: {contractData.start_date || "--"}</div>
                        <div>Fin: {contractData.end_date || "--"}</div>
                        <div>Anios: {contractData.years || "--"}</div>
                        <div>Salario base: {contractData.salary || "--"} {contractData.currency || ""}</div>
                        <div>Subida anual: {contractData.raise_pct ?? "--"}</div>
                        <div>Garantia: {contractData.guaranteed_pct ?? "--"}%</div>
                        {contractData.option ? (
                          <div>Opcion: {contractData.option.type} (anio {contractData.option.year})</div>
                        ) : (
                          <div>Opcion: --</div>
                        )}
                      </div>
                    ) : (
                      <div className="desc">Sin contrato registrado.</div>
                    )}
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Salario por Anio</div>
                    {contractData.yearly_salary ? (
                      <div className="detail-list">
                        {(contractData.yearly_salary || []).map((value, idx) => (
                          <div key={`salary-${idx}`}>Ano {idx + 1}: {value} {contractData.currency || ""}</div>
                        ))}
                      </div>
                    ) : (
                      <div className="desc">Sin desglose.</div>
                    )}
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Clausulas</div>
                    <div className="detail-tags">
                      {clauseItems.length === 0 ? (
                        <span className="desc">Sin clausulas.</span>
                      ) : (
                        clauseItems.map((c) => (
                          <span key={c.id || c.label} className="chip muted" title={c.desc || c.label}>
                            {c.label || c.id}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Bonus</div>
                    <div className="detail-tags">
                      {bonusItems.length === 0 ? (
                        <span className="desc">Sin bonus.</span>
                      ) : (
                        bonusItems.map((b) => (
                          <span key={b.id || b.label} className="chip muted" title={b.desc || b.label}>
                            {b.label || b.id}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (() => {
                const rolesEntry = tacticalRolesByPlayer[selectedPlayer.id] || {};
                const byPos = rolesEntry.byPos || {};
                const resolvedPos = playerTacticalPos || normalizePosition(selectedPlayer.data?.bio?.pos || selectedPlayer.position || "PG");
                const activePos = TACTICAL_POSITIONS.includes(resolvedPos) ? resolvedPos : "PG";
                const rolesForPos = TACTICAL_ROLES_BY_POS[activePos] || [];
                const selectedRole =
                  byPos[activePos]?.role ||
                  rolesEntry.role ||
                  getDefaultRoleForPosition(activePos);
                const selectedDuty = byPos[activePos]?.duty || rolesEntry.duty || "Apoyo";
                const selectedSuitability = calcRoleSuitability(selectedPlayer, selectedRole, activePos, selectedDuty);

                const updateRole = (role) => {
                  setTacticalRolesByPlayer((prev) => {
                    const existing = prev[selectedPlayer.id] || {};
                    const nextByPos = { ...(existing.byPos || {}) };
                    const duty = nextByPos[activePos]?.duty || existing.duty || "Apoyo";
                    nextByPos[activePos] = { role, duty };
                    return {
                      ...prev,
                      [selectedPlayer.id]: { ...existing, role, duty, byPos: nextByPos },
                    };
                  });
                };

                const updateDuty = (duty) => {
                  setTacticalRolesByPlayer((prev) => {
                    const existing = prev[selectedPlayer.id] || {};
                    const nextByPos = { ...(existing.byPos || {}) };
                    const role = nextByPos[activePos]?.role || existing.role || getDefaultRoleForPosition(activePos);
                    nextByPos[activePos] = { role, duty };
                    return {
                      ...prev,
                      [selectedPlayer.id]: { ...existing, role, duty, byPos: nextByPos },
                    };
                  });
                };

                return (
                  <div className="detail-section tactical-section">
                    <div className="section-title">Roles tacticos</div>
                    <div className="tactical-role-header">
                      <div className="tactical-pos-tabs">
                        {TACTICAL_POSITIONS.map((pos) => (
                          <button
                            key={pos}
                            className={`tactical-pos-btn ${activePos === pos ? "active" : ""}`}
                            onClick={() => setPlayerTacticalPos(pos)}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                      <div className="tactical-duty-tabs">
                        {TACTICAL_DUTIES.map((duty) => (
                          <button
                            key={duty}
                            className={`tactical-duty-btn ${selectedDuty === duty ? "active" : ""}`}
                            onClick={() => updateDuty(duty)}
                          >
                            {duty}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="tactical-role-summary">
                      <span className="chip muted">Posicion: {activePos}</span>
                      <span className="chip">Rol: {selectedRole}</span>
                      <span className="chip muted">Idoneidad: {selectedSuitability}%</span>
                    </div>
                    <div className="tactical-roles">
                      {rolesForPos.map((role) => {
                        const suitability = calcRoleSuitability(selectedPlayer, role, activePos, selectedDuty);
                        const suitColor =
                          suitability >= 90 ? "#4ade80" : suitability >= 75 ? "#facc15" : "#fb923c";
                        return (
                          <button
                            key={role}
                            className={`tactical-role-item ${role === selectedRole ? "active" : ""}`}
                            onClick={() => updateRole(role)}
                          >
                            <div className="tactical-role-title">{role}</div>
                            <div className="tactical-role-score">
                              <div className="tactical-role-bar">
                                <span style={{ width: `${suitability}%`, background: suitColor }} />
                              </div>
                              <span style={{ color: suitColor }}>{suitability}%</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            )}
              </div>
              );
            })()}

            {selectedTeam && (
              <div className="detail-body">
                <div className="detail-hero">
                  <div>
                    <div className="detail-title">{selectedTeam.name}</div>
                    <div className="detail-sub">{selectedTeam.data?.city || "--"}</div>
                  </div>
                  <div className="detail-tags">
                    <span className="chip">Budget {selectedTeam.data?.budget || "--"}</span>
                    <span className="chip">Reputación {selectedTeam.data?.reputation || "--"}</span>
                    <span className="chip">Roster {selectedTeam.data?.roster_size || "--"}</span>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-title">Plantilla</div>
                  <div className="detail-list roster-list">
                    {selectedTeamRoster.length === 0 ? (
                      <div className="desc">Sin jugadores asignados.</div>
                    ) : (
                      selectedTeamRoster.map((p) => {
                        const archeId = p.data?.identity?.arquetipo;
                        const archeLabel = p.data?.identity?.arquetipo_label || labelFor("arche", archeId);
                        const archeDesc = p.data?.identity?.arquetipo_desc || descFor("arche", archeId, archeLabel);
                        return (
                          <div
                            key={p.id}
                            className="roster-row"
                            onContextMenu={(e) =>
                              openContextMenu(e, [
                                { label: "Ver ficha", onClick: () => openPlayer(p.id, selectedTeamRosterIds) },
                              ])
                            }
                          >
                            <button className="link mono" onClick={() => openPlayer(p.id, selectedTeamRosterIds)}>
                              {p.name}
                            </button>
                            <span>{p.data?.bio?.pos || "--"}</span>
                            <span className="mono" title={archeDesc}>{archeLabel}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-title">Staff</div>
                  <div className="detail-list roster-list">
                    {(selectedTeam.data?.staff || []).length === 0 ? (
                      <div className="desc">Sin staff asignado.</div>
                    ) : (
                      selectedTeam.data?.staff?.map((s, idx) => (
                        <div
                          key={`${s.role_id}-${idx}`}
                          className="roster-row"
                          onContextMenu={(e) =>
                            openContextMenu(e, [{ label: "Ver ficha", onClick: () => openStaffMember(s, selectedTeam.id) }])
                          }
                        >
                          <button className="link mono" onClick={() => openStaffMember(s, selectedTeam.id)}>
                            {s.name}
                          </button>
                          <span>{s.role || "--"}</span>
                          <span className="mono">{s.department || "--"}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-title">Directiva</div>
                  <div className="detail-list roster-list">
                    {(selectedTeam.data?.board || []).length === 0 ? (
                      <div className="desc">Sin directiva asignada.</div>
                    ) : (
                      selectedTeam.data?.board?.map((m, idx) => (
                        <div
                          key={`${m.role_id}-${idx}`}
                          className="roster-row"
                          onContextMenu={(e) =>
                            openContextMenu(e, [{ label: "Ver ficha", onClick: () => openBoardMember(m, selectedTeam.id) }])
                          }
                        >
                          <button className="link mono" onClick={() => openBoardMember(m, selectedTeam.id)}>
                            {m.name}
                          </button>
                          <span>{m.role || "--"}</span>
                          <span className="mono" title={m.profile_desc || m.profile_label || ""}>{m.profile_label || "--"}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedStaff && (
              <div className="detail-body">
                <div className="detail-hero">
                  <div>
                    <div className="detail-title">{selectedStaff.name}</div>
                    <div className="detail-sub">
                      {teamMap[selectedStaff.team_id]?.name || "--"} · {selectedStaff.role || "--"} · {selectedStaff.department || "--"}
                    </div>
                  </div>
                  <div className="detail-tags">
                    <span className="chip" title={selectedStaff.personality_desc || selectedStaff.personality_label || selectedStaff.personality || ""}>
                      {selectedStaff.personality_label || selectedStaff.personality || "--"}
                    </span>
                    <span className="chip">Exp {selectedStaff.experience_years ?? "--"}y</span>
                    <span className="chip">{selectedStaff.nationality || "--"}</span>
                  </div>
                </div>

                <div className="detail-tabs">
                  <button
                    className={`tab ${staffTab === "perfil" ? "active" : ""}`}
                    onClick={() => setStaffTab("perfil")}
                  >
                    Perfil
                  </button>
                  <button
                    className={`tab ${staffTab === "contrato" ? "active" : ""}`}
                    onClick={() => setStaffTab("contrato")}
                  >
                    Contrato
                  </button>
                </div>

                {staffTab === "perfil" ? (
                  <>
                    <div className="detail-grid">
                      <div className="detail-section">
                        <div className="section-title">Traits & Perks</div>
                        <div className="detail-tags">
                          {(selectedStaff.traits || []).length === 0 && (selectedStaff.perks || []).length === 0 ? (
                            <span className="desc">Sin traits/perks asignados.</span>
                          ) : (
                            <>
                              {(selectedStaff.traits || []).map((t, idx) => (
                                <span
                                  key={t}
                                  className="chip muted"
                                  title={selectedStaff.traits_desc?.[idx] || selectedStaff.traits_label?.[idx] || t}
                                >
                                  {selectedStaff.traits_label?.[idx] || t}
                                </span>
                              ))}
                              {(selectedStaff.perks || []).map((p, idx) => (
                                <span
                                  key={p}
                                  className="chip muted"
                                  title={selectedStaff.perks_desc?.[idx] || selectedStaff.perks_label?.[idx] || p}
                                >
                                  {selectedStaff.perks_label?.[idx] || p}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="detail-section">
                      <div className="section-title">Atributos por Sección</div>
                      {renderRadarPanel(
                        STAFF_ATTR_SECTIONS,
                        selectedStaff.attributes || {},
                        selectedStaffAttrSection,
                        setSelectedStaffAttrSection,
                        selectedStaff.attributes_label,
                        selectedStaff.attributes_desc,
                      )}
                    </div>
                  </>
                ) : (
                  <div className="detail-grid">
                    <div className="detail-section">
                      <div className="section-title">Contrato</div>
                      {selectedStaffContract && Object.keys(selectedStaffContract).length ? (
                        <div className="detail-list">
                          <div>Estado: {selectedStaffContract.status || "--"}</div>
                          <div>Inicio: {selectedStaffContract.start_date || "--"}</div>
                          <div>Fin: {selectedStaffContract.end_date || "--"}</div>
                          <div>Anios: {selectedStaffContract.years || "--"}</div>
                          <div>Salario base: {selectedStaffContract.salary || "--"} {selectedStaffContract.currency || ""}</div>
                          <div>Subida anual: {selectedStaffContract.raise_pct ?? "--"}</div>
                          <div>Garantia: {selectedStaffContract.guaranteed_pct ?? "--"}%</div>
                          {selectedStaffContract.option ? (
                            <div>Opcion: {selectedStaffContract.option.type} (anio {selectedStaffContract.option.year})</div>
                          ) : (
                            <div>Opcion: --</div>
                          )}
                        </div>
                      ) : (
                        <div className="desc">Sin contrato registrado.</div>
                      )}
                    </div>
                    <div className="detail-section">
                      <div className="section-title">Salario por Anio</div>
                      {selectedStaffContract.yearly_salary ? (
                        <div className="detail-list">
                          {(selectedStaffContract.yearly_salary || []).map((value, idx) => (
                            <div key={`staff-salary-${idx}`}>Ano {idx + 1}: {value} {selectedStaffContract.currency || ""}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="desc">Sin desglose.</div>
                      )}
                    </div>
                    <div className="detail-section">
                      <div className="section-title">Clausulas</div>
                      <div className="detail-tags">
                        {selectedStaffClauses.length === 0 ? (
                          <span className="desc">Sin clausulas.</span>
                        ) : (
                          selectedStaffClauses.map((c) => (
                            <span key={c.id || c.label} className="chip muted" title={c.desc || c.label}>
                              {c.label || c.id}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="detail-section">
                      <div className="section-title">Bonus</div>
                      <div className="detail-tags">
                        {selectedStaffBonuses.length === 0 ? (
                          <span className="desc">Sin bonus.</span>
                        ) : (
                          selectedStaffBonuses.map((b) => (
                            <span key={b.id || b.label} className="chip muted" title={b.desc || b.label}>
                              {b.label || b.id}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedBoard && (
              <div className="detail-body">
                <div className="detail-hero">
                  <div>
                    <div className="detail-title">{selectedBoard.name}</div>
                    <div className="detail-sub">
                      {teamMap[selectedBoard.team_id]?.name || "--"} · {selectedBoard.role || "--"} · {selectedBoard.category || "--"}
                    </div>
                  </div>
                  <div className="detail-tags">
                    <span className="chip" title={selectedBoard.profile_desc || selectedBoard.profile_label || ""}>
                      {selectedBoard.profile_label || "--"}
                    </span>
                    <span className="chip">{selectedBoard.profile_philosophy || "--"}</span>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-title">Atributos por Sección</div>
                  {renderRadarPanel(
                    STAFF_ATTR_SECTIONS,
                    selectedBoard.attributes || {},
                    selectedBoardAttrSection,
                    setSelectedBoardAttrSection,
                    selectedBoard.attributes_label,
                    selectedBoard.attributes_desc,
                  )}
                </div>
              </div>
            )}

            {selectedAgency && (
              <div className="detail-body">
                <div className="detail-hero">
                  <div>
                    <div className="detail-title">{selectedAgency.name}</div>
                    <div className="detail-sub">{selectedAgency.data?.tier || "--"} · {selectedAgency.data?.market_segment || "--"}</div>
                  </div>
                  <div className="detail-tags">
                    <span className="chip">Focus {selectedAgency.data?.focus_niche || "--"}</span>
                    <span className="chip">Rep {selectedAgency.data?.reputation_score ?? "--"}</span>
                    <span className="chip">Scouting {selectedAgency.data?.scouting_power ?? "--"}</span>
                    <span className="chip">Dominance {selectedAgency.data?.market_dominance ?? "--"}</span>
                  </div>
                </div>

                <div className="detail-grid">
                  <div className="detail-section">
                    <div className="section-title">Perfil</div>
                    <div className="detail-list">
                      <div>Alumni Prestige: {selectedAgency.data?.alumni_prestige ?? "--"}</div>
                      <div>NIL Infra: {selectedAgency.data?.nil_infrastructure ?? "--"}</div>
                      <div>Legal Defense: {selectedAgency.data?.legal_defense ?? "--"}</div>
                    </div>
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Perks Corporativos</div>
                    <div className="detail-tags">
                      {(selectedAgency.data?.corporate_perks || []).length === 0 ? (
                        <span className="desc">Sin perks corporativos.</span>
                      ) : (
                        selectedAgency.data?.corporate_perks?.map((p) => (
                          <span key={p} className="chip muted" title={humanizeId(p)}>{humanizeId(p)}</span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-title">Agentes</div>
                  <div className="detail-list roster-list">
                    {agents.filter((a) => a.agency_id === selectedAgency.agency_id).length === 0 ? (
                      <div className="desc">Sin agentes asignados.</div>
                    ) : (
                      agents
                        .filter((a) => a.agency_id === selectedAgency.agency_id)
                        .map((a) => (
                          <div
                            key={a.agent_id}
                            className="roster-row"
                            onContextMenu={(e) =>
                              openContextMenu(e, [{ label: "Ver ficha", onClick: () => openAgent(a.agent_id) }])
                            }
                          >
                            <button className="link mono" onClick={() => openAgent(a.agent_id)}>
                              {a.name}
                            </button>
                            <span>{a.data?.style || "--"}</span>
                            <span className="mono">{a.data?.influence ?? "--"}</span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedAgent && (
              <div className="detail-body">
                <div className="detail-hero">
                  <div>
                    <div className="detail-title">{selectedAgent.name}</div>
                    <div className="detail-sub">
                      {agencyMap[selectedAgent.agency_id]?.name || "--"} · {selectedAgent.data?.style || "--"}
                    </div>
                  </div>
                  <div className="detail-tags">
                    <span className="chip">Greed {selectedAgent.data?.greed ?? "--"}</span>
                    <span className="chip">Influence {selectedAgent.data?.influence ?? "--"}</span>
                    <span className="chip">Media {selectedAgent.data?.media_reach ?? "--"}</span>
                  </div>
                </div>

                <div className="detail-grid">
                  <div className="detail-section">
                    <div className="section-title">Personalidad</div>
                    <div className="detail-list">
                      <div>Profesionalidad: {selectedAgent.data?.professionalism ?? "--"}</div>
                      <div>Agresividad: {selectedAgent.data?.aggressiveness ?? "--"}</div>
                      <div>Venganza: {selectedAgent.data?.vindictiveness ?? "--"}</div>
                      <div>Ética: {selectedAgent.data?.ethics_alignment ?? "--"}</div>
                      <div>Coerción: {selectedAgent.data?.coercion_level ?? "--"}</div>
                    </div>
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Negocio</div>
                    <div className="detail-list">
                      <div>Ventas: {selectedAgent.data?.salesmanship ?? "--"}</div>
                      <div>Hustle: {selectedAgent.data?.hustle_factor ?? "--"}</div>
                      <div>Flexibilidad: {selectedAgent.data?.flexibility ?? "--"}</div>
                      <div>Portal NCAA: {selectedAgent.data?.transfer_portal ?? "--"}</div>
                      <div>Cantera: {selectedAgent.data?.youth_recruitment ?? "--"}</div>
                    </div>
                  </div>
                </div>

                <div className="detail-grid">
                  <div className="detail-section">
                    <div className="section-title">Traits & Perks</div>
                    <div className="detail-tags">
                      {(selectedAgent.data?.traits || []).length === 0 && (selectedAgent.data?.active_perks || []).length === 0 ? (
                        <span className="desc">Sin traits/perks asignados.</span>
                      ) : (
                        <>
                          {(selectedAgent.data?.traits || []).map((t, idx) => (
                            <span
                              key={t}
                              className="chip muted"
                              title={selectedAgent.data?.traits_desc?.[idx] || selectedAgent.data?.traits_label?.[idx] || t}
                            >
                              {selectedAgent.data?.traits_label?.[idx] || t}
                            </span>
                          ))}
                          {(selectedAgent.data?.active_perks || []).map((p, idx) => (
                            <span
                              key={p}
                              className="chip muted"
                              title={selectedAgent.data?.active_perks_desc?.[idx] || selectedAgent.data?.active_perks_label?.[idx] || p}
                            >
                              {selectedAgent.data?.active_perks_label?.[idx] || p}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Network</div>
                    <div className="detail-tags">
                      {selectedAgent.data?.network ? (
                        Object.entries(selectedAgent.data.network).map(([region, value]) => (
                          <span key={region} className="chip muted">{region}: {value}</span>
                        ))
                      ) : (
                        <span className="desc">Sin red asignada.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-title">Jugadores</div>
                  <div className="detail-list roster-list">
                    {selectedAgentPlayers.length === 0 ? (
                      <div className="desc">Sin jugadores asignados.</div>
                    ) : (
                      selectedAgentPlayers.map((p) => (
                        <div
                          key={p.id}
                          className="roster-row"
                          onContextMenu={(e) =>
                            openContextMenu(e, [
                              { label: "Ver ficha", onClick: () => openPlayer(p.id, selectedAgentPlayerIds) },
                            ])
                          }
                        >
                          <button className="link mono" onClick={() => openPlayer(p.id, selectedAgentPlayerIds)}>
                            {p.name}
                          </button>
                          <span>{p.data?.bio?.pos || "--"}</span>
                          <span className="mono">{teamMap[p.data?.team_id]?.name || "Agente Libre"}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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







