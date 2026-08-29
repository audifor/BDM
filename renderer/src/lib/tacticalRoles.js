export const TACTICAL_POSITIONS = ["PG", "SG", "SF", "PF", "C"];

export const TACTICAL_DUTIES = ["Ataque", "Apoyo", "Defensa"];

export const TACTICAL_ROLES_BY_POS = {
  PG: ["Director de Juego", "Creador P&R", "Anotador", "Defensivo", "Francotirador"],
  SG: ["Anotador", "3&D", "Penetrador", "Creador Secundario", "Defensivo"],
  SF: ["Alero Completo", "3&D", "Defensor Elite", "Point Forward", "Slasher"],
  PF: ["Cuatro Abierto", "Interior", "Defensivo", "Poste", "Reboteador"],
  C: ["Protector Aro", "Pivot Pasador", "Reboteador", "Poste Bajo", "Finalizador P&R"],
};

const ROLE_WEIGHTS = {
  "Director de Juego": {
    court_vision: 1.2,
    pass_short: 1.0,
    pass_long: 0.9,
    creativity: 0.9,
    ball_control: 0.9,
    spacing_iq: 0.8,
    court_leadership: 0.8,
  },
  "Creador P&R": {
    pnr_read: 1.1,
    pass_bounce: 0.9,
    pass_short: 0.9,
    ball_control: 0.9,
    shot_selection: 0.8,
    creativity: 0.7,
  },
  Anotador: {
    mid_range: 0.9,
    three_off_dribble: 1.0,
    three_static: 0.8,
    finishing_close: 0.8,
    free_throw: 0.7,
    shot_selection: 0.8,
    aggressiveness: 0.6,
  },
  Defensivo: {
    def_perimeter: 1.0,
    steal_onball: 0.9,
    screen_nav: 0.8,
    help_defense: 0.8,
    closeout: 0.8,
    agility_lat: 0.7,
  },
  Francotirador: {
    three_static: 1.1,
    off_screen_shot: 0.9,
    deep_range: 0.8,
    free_throw: 0.6,
    shot_selection: 0.7,
  },
  "3&D": {
    three_static: 0.9,
    off_screen_shot: 0.7,
    def_perimeter: 0.9,
    closeout: 0.8,
    help_defense: 0.7,
  },
  Penetrador: {
    acceleration: 1.0,
    speed_top: 0.9,
    finishing_close: 0.9,
    contact_finishing: 0.8,
    ball_control: 0.7,
  },
  "Creador Secundario": {
    pass_short: 0.9,
    creativity: 0.8,
    court_vision: 0.8,
    ball_control: 0.7,
    pnr_read: 0.7,
  },
  "Alero Completo": {
    finishing_close: 0.8,
    three_static: 0.7,
    court_vision: 0.6,
    def_perimeter: 0.8,
    reb_def: 0.7,
  },
  "Defensor Elite": {
    def_perimeter: 0.9,
    def_post: 0.7,
    help_defense: 0.9,
    shot_contest: 0.8,
    block: 0.7,
  },
  "Point Forward": {
    court_vision: 0.9,
    pass_short: 0.8,
    ball_control: 0.8,
    spacing_iq: 0.7,
    creativity: 0.7,
  },
  Slasher: {
    acceleration: 0.9,
    speed_top: 0.8,
    finishing_close: 0.9,
    contact_finishing: 0.8,
    vert_run: 0.7,
  },
  "Cuatro Abierto": {
    three_static: 0.9,
    mid_range: 0.7,
    spacing_iq: 0.7,
    free_throw: 0.5,
    shot_selection: 0.6,
  },
  Interior: {
    post_scoring: 0.9,
    hook_shot: 0.8,
    strength_static: 0.8,
    reb_def: 0.7,
    box_out: 0.7,
  },
  Poste: {
    post_scoring: 1.0,
    hook_shot: 0.8,
    contact_finishing: 0.7,
    strength_static: 0.8,
    shot_selection: 0.6,
  },
  Reboteador: {
    reb_def: 1.0,
    box_out: 0.9,
    strength_static: 0.7,
    vert_static: 0.7,
    second_jump: 0.6,
  },
  "Protector Aro": {
    block: 1.0,
    intimidation: 0.9,
    def_post: 0.8,
    shot_contest: 0.8,
    reb_def: 0.7,
  },
  "Pivot Pasador": {
    pass_short: 0.8,
    pass_post: 0.8,
    court_vision: 0.7,
    ball_security_iq: 0.7,
    post_scoring: 0.6,
  },
  "Poste Bajo": {
    post_scoring: 1.0,
    hook_shot: 0.8,
    strength_static: 0.8,
    contact_finishing: 0.7,
    shot_selection: 0.6,
  },
  "Finalizador P&R": {
    finishing_close: 0.9,
    contact_finishing: 0.8,
    strength_explo: 0.7,
    vert_run: 0.7,
    hands: 0.6,
  },
};

const normalizeAttrValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 1) return num * 100;
  if (num <= 100) return num;
  return num / 10;
};

const calcAverage = (values) => {
  if (!values.length) return null;
  const total = values.reduce((acc, value) => acc + value, 0);
  return total / values.length;
};

const getAttrMap = (player) => player?.data?.attributes || player?.attributes || {};

export const getPlayerOverall = (player) => {
  const attrs = getAttrMap(player);
  const values = Object.values(attrs).map(normalizeAttrValue).filter((v) => v !== null);
  const avg = calcAverage(values);
  if (avg !== null) return avg;
  return 50;
};

export const getDefaultRoleForPosition = (position) =>
  TACTICAL_ROLES_BY_POS[position]?.[0] || "Estandar";

const parsePositions = (raw) => {
  if (!raw) return [];
  return String(raw)
    .toUpperCase()
    .split(/[\\/ ,]+/)
    .filter(Boolean);
};

export const normalizePosition = (raw) => parsePositions(raw)[0] || "PG";

const DUTY_WEIGHTS = {
  Ataque: {
    finishing_close: 0.8,
    contact_finishing: 0.7,
    mid_range: 0.5,
    three_static: 0.6,
    three_off_dribble: 0.6,
    free_throw: 0.4,
    shot_selection: 0.5,
    aggressiveness: 0.3,
    ball_control: 0.4,
  },
  Apoyo: {
    court_vision: 0.7,
    pass_short: 0.7,
    pass_bounce: 0.5,
    spacing_iq: 0.5,
    off_ball_move: 0.5,
    help_read: 0.4,
    consistency: 0.3,
    chemistry: 0.4,
  },
  Defensa: {
    def_perimeter: 0.8,
    def_post: 0.6,
    shot_contest: 0.7,
    help_defense: 0.7,
    def_pnr_inside: 0.5,
    def_transition: 0.5,
    reb_def: 0.4,
    block: 0.5,
    intimidation: 0.5,
  },
};

export const getRoleAttributeWeights = (role, duty = "Apoyo") => {
  const roleWeights = ROLE_WEIGHTS[role] || {};
  const dutyWeights = DUTY_WEIGHTS[duty] || DUTY_WEIGHTS.Apoyo;
  const combined = { ...roleWeights };
  Object.entries(dutyWeights).forEach(([key, weight]) => {
    combined[key] = (combined[key] || 0) + weight * 0.6;
  });
  return combined;
};

const calcWeightedScore = (attrs, weights) => {
  let total = 0;
  let weightSum = 0;
  Object.entries(weights).forEach(([key, weight]) => {
    const value = normalizeAttrValue(attrs[key]);
    if (value === null) return;
    total += value * weight;
    weightSum += weight;
  });
  if (weightSum === 0) return null;
  return total / weightSum;
};

const ADJACENT_POSITIONS = {
  PG: ["SG"],
  SG: ["PG", "SF"],
  SF: ["SG", "PF"],
  PF: ["SF", "C"],
  C: ["PF"],
};

export const calcRoleSuitability = (player, role, position, duty = "Apoyo") => {
  if (!player || !role) return 0;
  const attrs = getAttrMap(player);
  const weights = ROLE_WEIGHTS[role] || {};
  const baseRole = calcWeightedScore(attrs, weights);
  const dutyWeights = DUTY_WEIGHTS[duty] || DUTY_WEIGHTS.Apoyo;
  const dutyScore = calcWeightedScore(attrs, dutyWeights);

  let base = baseRole !== null ? baseRole : getPlayerOverall(player);
  const overall = getPlayerOverall(player);
  let score = base * 0.5 + overall * 0.4 + (dutyScore !== null ? dutyScore : overall) * 0.1;

  const posKey = position ? String(position).toUpperCase() : "";
  const playerPositions = parsePositions(player?.data?.bio?.pos || player?.position || "");
  if (posKey) {
    let factor = 1;
    if (playerPositions.includes(posKey)) {
      factor = 1.2;
    } else if (playerPositions.some((p) => (ADJACENT_POSITIONS[p] || []).includes(posKey))) {
      factor = 1.05;
    }
    score *= factor;
  }

  const clamped = Math.max(40, Math.min(97, Math.round(score)));
  return clamped;
};
