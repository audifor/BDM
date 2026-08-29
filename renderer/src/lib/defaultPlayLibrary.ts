import type { Playbook, PlayType, SavedPlay } from "./playbookManager";

type Pt = { x: number; y: number };

type PlayerToken = {
  id: number;
  x: number;
  y: number;
  label: string;
  role: string;
};

type ActionPath = {
  id: number;
  type: "move" | "pass" | "dribble" | "screen";
  points: Pt[];
  linkedId?: number;
};

type FrameData = {
  players: PlayerToken[];
  ballOwnerId: number | null;
  ballPosition: Pt;
  paths: ActionPath[];
  defenders: Pt[];
};

const deepCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const SPOTS = {
  rim: { x: 250, y: 70 },
  ft: { x: 250, y: 190 },
  top: { x: 250, y: 360 },
  slotL: { x: 185, y: 340 },
  slotR: { x: 315, y: 340 },
  wingL: { x: 95, y: 290 },
  wingR: { x: 405, y: 290 },
  cornerL: { x: 70, y: 150 },
  cornerR: { x: 430, y: 150 },
  elbowL: { x: 190, y: 210 },
  elbowR: { x: 310, y: 210 },
  blockL: { x: 215, y: 120 },
  blockR: { x: 285, y: 120 },
  dunkerL: { x: 195, y: 95 },
  dunkerR: { x: 305, y: 95 },
  hashL: { x: 150, y: 250 },
  hashR: { x: 350, y: 250 },
  sidelineL: { x: 20, y: 250 },
  sidelineR: { x: 480, y: 250 },
  inboundBL: { x: 35, y: 12 },
  inboundBR: { x: 465, y: 12 },
};

const baseHorns = (): PlayerToken[] => [
  { id: 1, label: "1", role: "PG", x: SPOTS.top.x, y: SPOTS.top.y },
  { id: 2, label: "2", role: "SG", x: SPOTS.wingL.x, y: SPOTS.wingL.y },
  { id: 3, label: "3", role: "SF", x: SPOTS.wingR.x, y: SPOTS.wingR.y },
  { id: 4, label: "4", role: "PF", x: SPOTS.elbowL.x, y: SPOTS.elbowL.y },
  { id: 5, label: "5", role: "C", x: SPOTS.elbowR.x, y: SPOTS.elbowR.y },
];

const base5Out = (): PlayerToken[] => [
  { id: 1, label: "1", role: "PG", x: SPOTS.top.x, y: SPOTS.top.y },
  { id: 2, label: "2", role: "SG", x: SPOTS.cornerL.x, y: SPOTS.cornerL.y },
  { id: 3, label: "3", role: "SF", x: SPOTS.cornerR.x, y: SPOTS.cornerR.y },
  { id: 4, label: "4", role: "PF", x: SPOTS.wingL.x, y: SPOTS.wingL.y },
  { id: 5, label: "5", role: "C", x: SPOTS.wingR.x, y: SPOTS.wingR.y },
];

const baseBoxATO = (side: "L" | "R"): PlayerToken[] => {
  const inbound = side === "L" ? SPOTS.inboundBL : SPOTS.inboundBR;
  const wing = side === "L" ? SPOTS.wingL : SPOTS.wingR;
  const corner = side === "L" ? SPOTS.cornerL : SPOTS.cornerR;
  return [
    { id: 1, label: "1", role: "PG", x: inbound.x, y: inbound.y },
    { id: 2, label: "2", role: "SG", x: wing.x, y: wing.y },
    { id: 3, label: "3", role: "SF", x: corner.x, y: corner.y },
    { id: 4, label: "4", role: "PF", x: SPOTS.blockL.x, y: SPOTS.blockL.y },
    { id: 5, label: "5", role: "C", x: SPOTS.blockR.x, y: SPOTS.blockR.y },
  ];
};

const ballPosForOwner = (players: PlayerToken[], ownerId: number | null): Pt => {
  if (!ownerId) return { x: SPOTS.top.x, y: SPOTS.top.y };
  const p = players.find((x) => x.id === ownerId);
  return p ? { x: p.x, y: p.y } : { x: SPOTS.top.x, y: SPOTS.top.y };
};

const frame = (players: PlayerToken[], ballOwnerId: number | null, paths: ActionPath[]): FrameData => ({
  players: deepCopy(players),
  ballOwnerId,
  ballPosition: ballPosForOwner(players, ballOwnerId),
  paths,
  defenders: [],
});

const path = (id: number, type: ActionPath["type"], linkedId: number, points: Pt[]): ActionPath => ({
  id,
  type,
  linkedId,
  points,
});

const sideLabel = (side: "L" | "R") => (side === "L" ? "Izquierda" : "Derecha");

const tagSide = (side: "L" | "R") => (side === "L" ? "side:L" : "side:R");

const makePlay = (opts: {
  clubId: number;
  name: string;
  playType: PlayType;
  description: string;
  tags: string[];
  frames: FrameData[];
}): Omit<SavedPlay, "id" | "createdAt"> => ({
  clubId: Number(opts.clubId),
  name: opts.name,
  playType: opts.playType,
  description: opts.description,
  frames: opts.frames as any[],
  engineData: {
    tags: opts.tags,
  },
  efficiency: 50,
  familiarity: 0,
  timesUsed: 0,
  timesSuccessful: 0,
});

const hornPnR = (clubId: number, side: "L" | "R") => {
  const players = baseHorns();
  const screener = side === "L" ? 4 : 5;
  const slot = side === "L" ? SPOTS.slotL : SPOTS.slotR;
  const roll = side === "L" ? SPOTS.dunkerL : SPOTS.dunkerR;
  const corner = side === "L" ? SPOTS.cornerR : SPOTS.cornerL;
  const wingOpp = side === "L" ? SPOTS.wingR : SPOTS.wingL;
  const paths: ActionPath[] = [
    path(1, "screen", screener, [slot, { x: slot.x, y: slot.y - 20 }]),
    path(2, "dribble", 1, [SPOTS.top, slot]),
    path(3, "move", screener, [{ x: slot.x, y: slot.y - 5 }, roll]),
    path(4, "move", 2, [SPOTS.wingL, corner]),
    path(5, "move", 3, [SPOTS.wingR, wingOpp]),
  ];
  return makePlay({
    clubId,
    name: `Horns PnR (${sideLabel(side)})`,
    playType: "Set",
    description: `Bloqueo directo desde horns hacia ${sideLabel(side)}. Lecturas: roll / kick a esquina / skip.`,
    tags: ["horns", "pnr", tagSide(side), "half-court", "reads:2-3"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const hornFlare = (clubId: number, side: "L" | "R") => {
  const players = baseHorns();
  const screener = side === "L" ? 5 : 4;
  const shooter = side === "L" ? 3 : 2;
  const flareTo = side === "L" ? { x: 410, y: 245 } : { x: 90, y: 245 };
  const slot = side === "L" ? SPOTS.slotL : SPOTS.slotR;
  const paths: ActionPath[] = [
    path(1, "pass", 1, [SPOTS.top, slot]),
    path(2, "move", 1, [SPOTS.top, { x: slot.x, y: slot.y + 10 }]),
    path(3, "screen", screener, [side === "L" ? SPOTS.elbowR : SPOTS.elbowL, flareTo]),
    path(4, "move", shooter, [side === "L" ? SPOTS.wingR : SPOTS.wingL, flareTo]),
    path(5, "pass", 1, [slot, flareTo]),
  ];
  return makePlay({
    clubId,
    name: `Horns Flare 3PT (${sideLabel(side)})`,
    playType: "Quick",
    description: `Entrada horns + flare screen para tiro exterior en ${sideLabel(side)}.`,
    tags: ["horns", "flare", "3pt", tagSide(side), "half-court", "quick"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const hornHighLow = (clubId: number, side: "L" | "R") => {
  const players = baseHorns();
  const hi = side === "L" ? 4 : 5;
  const lo = side === "L" ? 5 : 4;
  const hiSpot = side === "L" ? SPOTS.elbowL : SPOTS.elbowR;
  const loSpot = side === "L" ? SPOTS.blockR : SPOTS.blockL;
  const paths: ActionPath[] = [
    path(1, "pass", 1, [SPOTS.top, hiSpot]),
    path(2, "move", lo, [side === "L" ? SPOTS.elbowR : SPOTS.elbowL, loSpot]),
    path(3, "move", 2, [SPOTS.wingL, SPOTS.cornerL]),
    path(4, "move", 3, [SPOTS.wingR, SPOTS.cornerR]),
    path(5, "pass", hi, [hiSpot, loSpot]),
  ];
  return makePlay({
    clubId,
    name: `Horns High-Low (${sideLabel(side)})`,
    playType: "Set",
    description: `High-low desde horns: poste alto a poste bajo (sell + lob).`,
    tags: ["horns", "post", "high-low", tagSide(side), "half-court", "reads:2"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const spainPnR = (clubId: number, side: "L" | "R") => {
  const players = baseHorns();
  const slot = side === "L" ? SPOTS.slotL : SPOTS.slotR;
  const roller = side === "L" ? 4 : 5;
  const backScreener = side === "L" ? 3 : 2;
  const corner = side === "L" ? SPOTS.cornerR : SPOTS.cornerL;
  const rollTo = side === "L" ? SPOTS.dunkerL : SPOTS.dunkerR;
  const paths: ActionPath[] = [
    path(1, "screen", roller, [slot, { x: slot.x, y: slot.y - 25 }]),
    path(2, "dribble", 1, [SPOTS.top, slot]),
    path(3, "move", roller, [{ x: slot.x, y: slot.y - 10 }, rollTo]),
    path(4, "screen", backScreener, [corner, rollTo]),
    path(5, "move", backScreener, [side === "L" ? SPOTS.wingR : SPOTS.wingL, corner]),
  ];
  return makePlay({
    clubId,
    name: `Spain PnR (${sideLabel(side)})`,
    playType: "ATO",
    description: `PnR + backscreen al roller (Spain). Lecturas: roller, pop, esquina.`,
    tags: ["spain", "pnr", "backscreen", tagSide(side), "ATO", "half-court", "reads:3"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const zipperPnR = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const zipperFrom = side === "L" ? SPOTS.cornerL : SPOTS.cornerR;
  const zipperTo = side === "L" ? SPOTS.wingL : SPOTS.wingR;
  const screener = side === "L" ? 4 : 5;
  const slot = side === "L" ? SPOTS.slotL : SPOTS.slotR;
  const paths: ActionPath[] = [
    path(1, "screen", screener, [zipperTo, { x: zipperTo.x, y: zipperTo.y - 20 }]),
    path(2, "move", 2, [zipperFrom, zipperTo]),
    path(3, "pass", 1, [SPOTS.top, zipperTo]),
    path(4, "dribble", 2, [zipperTo, slot]),
    path(5, "screen", screener, [zipperTo, slot]),
  ];
  return makePlay({
    clubId,
    name: `Zipper → PnR (${sideLabel(side)})`,
    playType: "Set",
    description: `Zipper para recibir y enlazar con PnR en ${sideLabel(side)}.`,
    tags: ["zipper", "pnr", tagSide(side), "half-court", "reads:2-3"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const chicagoAction = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const pindownFrom = side === "L" ? SPOTS.blockL : SPOTS.blockR;
  const pindownTo = side === "L" ? SPOTS.wingL : SPOTS.wingR;
  const shooter = side === "L" ? 2 : 3;
  const dhoBig = side === "L" ? 4 : 5;
  const dhoSpot = side === "L" ? SPOTS.hashL : SPOTS.hashR;
  const slot = side === "L" ? SPOTS.slotL : SPOTS.slotR;
  const paths: ActionPath[] = [
    path(1, "screen", dhoBig, [dhoSpot, pindownTo]),
    path(2, "move", shooter, [pindownFrom, pindownTo]),
    path(3, "pass", 1, [SPOTS.top, pindownTo]),
    path(4, "screen", dhoBig, [pindownTo, slot]),
    path(5, "dribble", shooter, [pindownTo, slot]),
  ];
  return makePlay({
    clubId,
    name: `Chicago Action (${sideLabel(side)})`,
    playType: "Flow",
    description: `Pin-down para recibir + DHO/hand-off enlazado. Mucha libertad en lecturas.`,
    tags: ["chicago", "pindown", "dho", tagSide(side), "flow", "reads:3+"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const iversonCut = (clubId: number, side: "L" | "R") => {
  const players = baseHorns();
  const cutter = side === "L" ? 2 : 3;
  const cutTo = side === "L" ? SPOTS.wingR : SPOTS.wingL;
  const screen1 = 4;
  const screen2 = 5;
  const paths: ActionPath[] = [
    path(1, "screen", screen1, [SPOTS.elbowL, SPOTS.ft]),
    path(2, "screen", screen2, [SPOTS.elbowR, SPOTS.ft]),
    path(3, "move", cutter, [side === "L" ? SPOTS.wingL : SPOTS.wingR, cutTo]),
    path(4, "pass", 1, [SPOTS.top, cutTo]),
  ];
  return makePlay({
    clubId,
    name: `Iverson Cut (${sideLabel(side)})`,
    playType: "Quick",
    description: `Doble screen (Iverson) para liberar al exterior en el lado opuesto.`,
    tags: ["iverson", "double-screen", "3pt", tagSide(side), "half-court", "quick"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const doubleDrag = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const lane = side === "L" ? SPOTS.slotL : SPOTS.slotR;
  const drag1 = 4;
  const drag2 = 5;
  const paths: ActionPath[] = [
    path(1, "dribble", 1, [SPOTS.top, lane]),
    path(2, "screen", drag1, [SPOTS.wingL, lane]),
    path(3, "screen", drag2, [SPOTS.wingR, lane]),
    path(4, "move", drag1, [SPOTS.wingL, { x: lane.x - 20, y: lane.y - 45 }]),
    path(5, "move", drag2, [SPOTS.wingR, { x: lane.x + 20, y: lane.y - 45 }]),
  ];
  return makePlay({
    clubId,
    name: `Double Drag (Transición) (${sideLabel(side)})`,
    playType: "Flow",
    description: `Dos bloqueos consecutivos en transición para atacar temprano.`,
    tags: ["transition", "double-drag", "pnr", tagSide(side), "flow", "pace"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const emptyCornerPnR = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const emptyCorner = side === "L" ? SPOTS.cornerL : SPOTS.cornerR;
  const pnrLane = side === "L" ? SPOTS.hashL : SPOTS.hashR;
  const screener = side === "L" ? 4 : 5;
  const paths: ActionPath[] = [
    path(1, "move", side === "L" ? 2 : 3, [emptyCorner, { x: emptyCorner.x, y: emptyCorner.y - 60 }]),
    path(2, "screen", screener, [side === "L" ? SPOTS.wingL : SPOTS.wingR, pnrLane]),
    path(3, "dribble", 1, [SPOTS.top, pnrLane]),
    path(4, "move", screener, [pnrLane, side === "L" ? SPOTS.dunkerL : SPOTS.dunkerR]),
  ];
  return makePlay({
    clubId,
    name: `Empty Corner PnR (${sideLabel(side)})`,
    playType: "Set",
    description: `Vaciar esquina para PnR lateral con más espacio (roll / floater / skip).`,
    tags: ["empty-corner", "pnr", tagSide(side), "half-court", "spacing", "reads:2-3"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const delayDHO = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const big = 5;
  const receiver = side === "L" ? 4 : 3;
  const dhoSpot = side === "L" ? SPOTS.hashL : SPOTS.hashR;
  const paths: ActionPath[] = [
    path(1, "pass", 1, [SPOTS.top, { x: SPOTS.ft.x, y: SPOTS.ft.y + 50 }]),
    path(2, "move", big, [SPOTS.wingR, { x: SPOTS.ft.x, y: SPOTS.ft.y + 50 }]),
    path(3, "screen", big, [{ x: SPOTS.ft.x, y: SPOTS.ft.y + 50 }, dhoSpot]),
    path(4, "move", receiver, [side === "L" ? SPOTS.wingL : SPOTS.cornerR, dhoSpot]),
    path(5, "dribble", receiver, [dhoSpot, side === "L" ? SPOTS.slotL : SPOTS.slotR]),
  ];
  return makePlay({
    clubId,
    name: `5-Out Delay DHO (${sideLabel(side)})`,
    playType: "Flow",
    description: `Delay con el 5 arriba + hand-off. Ideal para atacar mismatches con libertad.`,
    tags: ["5-out", "delay", "dho", tagSide(side), "flow", "reads:3+"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const floppy = (clubId: number, side: "L" | "R") => {
  const players = baseHorns();
  const shooter = side === "L" ? 2 : 3;
  const screenA = side === "L" ? 4 : 5;
  const screenB = side === "L" ? 5 : 4;
  const curlTo = side === "L" ? SPOTS.wingL : SPOTS.wingR;
  const flareTo = side === "L" ? { x: 155, y: 255 } : { x: 345, y: 255 };
  const paths: ActionPath[] = [
    path(1, "screen", screenA, [side === "L" ? SPOTS.blockL : SPOTS.blockR, curlTo]),
    path(2, "screen", screenB, [side === "L" ? SPOTS.blockR : SPOTS.blockL, flareTo]),
    path(3, "move", shooter, [side === "L" ? SPOTS.cornerL : SPOTS.cornerR, curlTo]),
    path(4, "pass", 1, [SPOTS.top, curlTo]),
  ];
  return makePlay({
    clubId,
    name: `Floppy (${sideLabel(side)})`,
    playType: "ATO",
    description: `Doble salida para tirador: curl o flare según defensa.`,
    tags: ["floppy", "shooter", "3pt", tagSide(side), "ATO", "reads:2"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const elevator = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const shooter = side === "L" ? 2 : 3;
  const doorA = 4;
  const doorB = 5;
  const lane = { x: SPOTS.ft.x, y: SPOTS.ft.y + 40 };
  const exit = side === "L" ? { x: 150, y: 235 } : { x: 350, y: 235 };
  const paths: ActionPath[] = [
    path(1, "move", shooter, [side === "L" ? SPOTS.cornerL : SPOTS.cornerR, lane]),
    path(2, "screen", doorA, [SPOTS.elbowL, lane]),
    path(3, "screen", doorB, [SPOTS.elbowR, lane]),
    path(4, "move", shooter, [lane, exit]),
    path(5, "pass", 1, [SPOTS.top, exit]),
  ];
  return makePlay({
    clubId,
    name: `Elevator Doors (${sideLabel(side)})`,
    playType: "ATO",
    description: `Elevator para liberar tiro. Alternativa: slip si el defensor se anticipa.`,
    tags: ["elevator", "3pt", tagSide(side), "ATO", "reads:2"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const ucla = (clubId: number, side: "L" | "R") => {
  const players = baseHorns();
  const cutter = side === "L" ? 2 : 3;
  const cutFrom = side === "L" ? SPOTS.wingL : SPOTS.wingR;
  const cutTo = SPOTS.rim;
  const screener = side === "L" ? 4 : 5;
  const paths: ActionPath[] = [
    path(1, "screen", screener, [side === "L" ? SPOTS.elbowL : SPOTS.elbowR, SPOTS.ft]),
    path(2, "move", cutter, [cutFrom, cutTo]),
    path(3, "pass", 1, [SPOTS.top, cutTo]),
  ];
  return makePlay({
    clubId,
    name: `UCLA Cut (${sideLabel(side)})`,
    playType: "Quick",
    description: `Corte UCLA al aro. Segunda lectura: high-low o salida a perímetro.`,
    tags: ["ucla", "cut", "rim", tagSide(side), "half-court", "quick", "reads:2"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const flex = (clubId: number, side: "L" | "R") => {
  const players = baseHorns();
  const cutter = side === "L" ? 3 : 2;
  const baselineFrom = side === "L" ? SPOTS.cornerR : SPOTS.cornerL;
  const baselineTo = side === "L" ? SPOTS.blockL : SPOTS.blockR;
  const screener = side === "L" ? 5 : 4;
  const downScreener = side === "L" ? 4 : 5;
  const downTo = side === "L" ? SPOTS.wingL : SPOTS.wingR;
  const paths: ActionPath[] = [
    path(1, "screen", screener, [side === "L" ? SPOTS.blockR : SPOTS.blockL, baselineTo]),
    path(2, "move", cutter, [baselineFrom, baselineTo]),
    path(3, "pass", 1, [SPOTS.top, baselineTo]),
    path(4, "screen", downScreener, [side === "L" ? SPOTS.elbowL : SPOTS.elbowR, downTo]),
  ];
  return makePlay({
    clubId,
    name: `Flex (${sideLabel(side)})`,
    playType: "Set",
    description: `Flex cut en línea de fondo + down screen para continuidad.`,
    tags: ["flex", "cut", "screen-the-screener", tagSide(side), "half-court", "reads:2-3"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const shuffleCut = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const cutter = side === "L" ? 4 : 5;
  const from = side === "L" ? SPOTS.wingL : SPOTS.wingR;
  const to = SPOTS.rim;
  const passer = 1;
  const paths: ActionPath[] = [
    path(1, "move", cutter, [from, { x: SPOTS.ft.x, y: SPOTS.ft.y + 20 }]),
    path(2, "move", cutter, [{ x: SPOTS.ft.x, y: SPOTS.ft.y + 20 }, to]),
    path(3, "pass", passer, [SPOTS.top, to]),
  ];
  return makePlay({
    clubId,
    name: `Shuffle Cut (${sideLabel(side)})`,
    playType: "Quick",
    description: `Corte shuffle al aro desde el lado débil.`,
    tags: ["shuffle", "cut", "rim", tagSide(side), "half-court", "quick"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const crossPost = (clubId: number, side: "L" | "R") => {
  const players = baseHorns();
  const post = side === "L" ? 5 : 4;
  const screener = side === "L" ? 4 : 5;
  const postTo = side === "L" ? SPOTS.blockL : SPOTS.blockR;
  const paths: ActionPath[] = [
    path(1, "screen", screener, [side === "L" ? SPOTS.blockR : SPOTS.blockL, postTo]),
    path(2, "move", post, [side === "L" ? SPOTS.elbowR : SPOTS.elbowL, postTo]),
    path(3, "pass", 1, [SPOTS.top, postTo]),
  ];
  return makePlay({
    clubId,
    name: `Cross Screen → Post (${sideLabel(side)})`,
    playType: "Set",
    description: `Cross screen para poste profundo. Lectura: post-up / kick a esquina.`,
    tags: ["post", "cross-screen", tagSide(side), "half-court", "reads:2"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const postSplit = (clubId: number, side: "L" | "R") => {
  const players = baseHorns();
  const postSpot = side === "L" ? SPOTS.blockL : SPOTS.blockR;
  const cutterA = side === "L" ? 2 : 3;
  const cutterB = side === "L" ? 3 : 2;
  const paths: ActionPath[] = [
    path(1, "pass", 1, [SPOTS.top, postSpot]),
    path(2, "move", cutterA, [side === "L" ? SPOTS.wingL : SPOTS.wingR, SPOTS.rim]),
    path(3, "move", cutterB, [side === "L" ? SPOTS.wingR : SPOTS.wingL, side === "L" ? SPOTS.cornerR : SPOTS.cornerL]),
  ];
  return makePlay({
    clubId,
    name: `Post Split (${sideLabel(side)})`,
    playType: "Flow",
    description: `Entrada al poste + split cuts (backdoor / flare). Mucha lectura.`,
    tags: ["post", "split", "cut", tagSide(side), "flow", "reads:3+"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const pindownDHO = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const shooter = side === "L" ? 2 : 3;
  const screener = side === "L" ? 4 : 5;
  const to = side === "L" ? SPOTS.wingL : SPOTS.wingR;
  const dhoBig = 5;
  const dhoSpot = { x: SPOTS.ft.x, y: SPOTS.ft.y + 60 };
  const paths: ActionPath[] = [
    path(1, "screen", screener, [side === "L" ? SPOTS.blockL : SPOTS.blockR, to]),
    path(2, "move", shooter, [side === "L" ? SPOTS.cornerL : SPOTS.cornerR, to]),
    path(3, "pass", 1, [SPOTS.top, to]),
    path(4, "screen", dhoBig, [dhoSpot, to]),
    path(5, "dribble", shooter, [to, side === "L" ? SPOTS.hashL : SPOTS.hashR]),
  ];
  return makePlay({
    clubId,
    name: `Pin-down → DHO (${sideLabel(side)})`,
    playType: "Flow",
    description: `Salida por pin-down que enlaza con hand-off. Lecturas según closeout.`,
    tags: ["pindown", "dho", tagSide(side), "flow", "reads:3+"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const hammer = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const driveLane = side === "L" ? SPOTS.hashL : SPOTS.hashR;
  const hammerScreener = side === "L" ? 3 : 2;
  const corner = side === "L" ? SPOTS.cornerR : SPOTS.cornerL;
  const shooter = side === "L" ? 2 : 3;
  const paths: ActionPath[] = [
    path(1, "dribble", 1, [SPOTS.top, driveLane]),
    path(2, "screen", hammerScreener, [side === "L" ? SPOTS.wingR : SPOTS.wingL, corner]),
    path(3, "move", shooter, [side === "L" ? SPOTS.cornerL : SPOTS.cornerR, corner]),
    path(4, "pass", 1, [driveLane, corner]),
  ];
  return makePlay({
    clubId,
    name: `Hammer (${sideLabel(side)})`,
    playType: "ATO",
    description: `Penetración + screen en línea de fondo para triple en la esquina opuesta.`,
    tags: ["hammer", "corner-3", tagSide(side), "ATO", "reads:2"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const stackAto3 = (clubId: number, side: "L" | "R") => {
  const players = baseBoxATO(side);
  const exit = side === "L" ? SPOTS.wingL : SPOTS.wingR;
  const shooter = 2;
  const screenerA = 4;
  const screenerB = 5;
  const paths: ActionPath[] = [
    path(1, "screen", screenerA, [SPOTS.blockL, exit]),
    path(2, "screen", screenerB, [SPOTS.blockR, exit]),
    path(3, "move", shooter, [exit, { x: exit.x, y: exit.y + 10 }]),
    path(4, "pass", 1, [ballPosForOwner(players, 1), exit]),
  ];
  return makePlay({
    clubId,
    name: `Stack ATO 3PT (${sideLabel(side)})`,
    playType: "ATO",
    description: `Salida stack para tiro rápido tras saque.`,
    tags: ["ATO", "stack", "3pt", tagSide(side), "SLOB/BLOB", "quick"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const boxSlip = (clubId: number, side: "L" | "R") => {
  const players = baseBoxATO(side);
  const slip = side === "L" ? SPOTS.dunkerL : SPOTS.dunkerR;
  const screener = side === "L" ? 4 : 5;
  const paths: ActionPath[] = [
    path(1, "screen", screener, [side === "L" ? SPOTS.blockL : SPOTS.blockR, SPOTS.ft]),
    path(2, "move", screener, [SPOTS.ft, slip]),
    path(3, "pass", 1, [ballPosForOwner(players, 1), slip]),
  ];
  return makePlay({
    clubId,
    name: `Box ATO Slip (${sideLabel(side)})`,
    playType: "ATO",
    description: `Saque en box + slip rápido al aro (castiga cambios automáticos).`,
    tags: ["ATO", "box", "slip", "rim", tagSide(side), "BLOB/SLOB"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const blobLob = (clubId: number, side: "L" | "R") => {
  const players = baseBoxATO(side);
  const lobTarget = SPOTS.rim;
  const screener = side === "L" ? 5 : 4;
  const paths: ActionPath[] = [
    path(1, "screen", screener, [side === "L" ? SPOTS.blockR : SPOTS.blockL, lobTarget]),
    path(2, "move", 4, [SPOTS.blockL, side === "L" ? SPOTS.dunkerL : SPOTS.dunkerR]),
    path(3, "pass", 1, [ballPosForOwner(players, 1), lobTarget]),
  ];
  return makePlay({
    clubId,
    name: `BLOB Lob (${sideLabel(side)})`,
    playType: "ATO",
    description: `Saque de fondo buscando alley-oop / sello bajo aro.`,
    tags: ["BLOB", "ATO", "lob", "rim", tagSide(side)],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const slobQuick3 = (clubId: number, side: "L" | "R") => {
  const players = baseBoxATO(side);
  const exit = side === "L" ? SPOTS.hashL : SPOTS.hashR;
  const shooter = 2;
  const screener = 5;
  const paths: ActionPath[] = [
    path(1, "screen", screener, [SPOTS.ft, exit]),
    path(2, "move", shooter, [side === "L" ? SPOTS.wingL : SPOTS.wingR, exit]),
    path(3, "pass", 1, [ballPosForOwner(players, 1), exit]),
  ];
  return makePlay({
    clubId,
    name: `SLOB Quick 3 (${sideLabel(side)})`,
    playType: "ATO",
    description: `Saque de banda para triple rápido con screen corto.`,
    tags: ["SLOB", "ATO", "3pt", tagSide(side), "quick"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const eoqGhost = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const lane = side === "L" ? SPOTS.slotL : SPOTS.slotR;
  const ghost = side === "L" ? 4 : 5;
  const popTo = side === "L" ? SPOTS.wingL : SPOTS.wingR;
  const paths: ActionPath[] = [
    path(1, "dribble", 1, [SPOTS.top, lane]),
    path(2, "move", ghost, [side === "L" ? SPOTS.wingL : SPOTS.wingR, { x: lane.x, y: lane.y - 25 }]),
    path(3, "move", ghost, [{ x: lane.x, y: lane.y - 25 }, popTo]),
    path(4, "pass", 1, [lane, popTo]),
  ];
  return makePlay({
    clubId,
    name: `EoQ Ghost Screen (${sideLabel(side)})`,
    playType: "ATO",
    description: `Final de cuarto: ghost screen + pop para tiro antes de la bocina.`,
    tags: ["EoQ", "ATO", "ghost", "3pt", tagSide(side), "clock"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const pressBreaker = (clubId: number, side: "L" | "R") => {
  const players = base5Out();
  const outlet = side === "L" ? SPOTS.sidelineL : SPOTS.sidelineR;
  const middle = { x: SPOTS.ft.x, y: SPOTS.ft.y + 140 };
  const paths: ActionPath[] = [
    path(1, "move", 5, [SPOTS.wingR, middle]),
    path(2, "pass", 1, [SPOTS.top, outlet]),
    path(3, "pass", 2, [outlet, middle]),
    path(4, "pass", 5, [middle, side === "L" ? SPOTS.wingR : SPOTS.wingL]),
  ];
  return makePlay({
    clubId,
    name: `Press Breaker (Salida) (${sideLabel(side)})`,
    playType: "Quick",
    description: `Salida rápida vs presión: banda → medio → avance.`,
    tags: ["press-break", "quick", tagSide(side), "transition", "vs-press"],
    frames: [frame(players, 1, []), frame(players, 1, paths)],
  });
};

const PLAY_BUILDERS: Array<(clubId: number, side: "L" | "R") => Omit<SavedPlay, "id" | "createdAt">> = [
  hornPnR,
  hornFlare,
  hornHighLow,
  spainPnR,
  zipperPnR,
  chicagoAction,
  iversonCut,
  doubleDrag,
  emptyCornerPnR,
  delayDHO,
  floppy,
  elevator,
  ucla,
  flex,
  shuffleCut,
  crossPost,
  postSplit,
  pindownDHO,
  hammer,
  stackAto3,
  boxSlip,
  blobLob,
  slobQuick3,
  eoqGhost,
  pressBreaker,
];

export const buildDefaultPlays = (clubId: number): Array<Omit<SavedPlay, "id" | "createdAt">> => {
  const out: Array<Omit<SavedPlay, "id" | "createdAt">> = [];
  for (const builder of PLAY_BUILDERS) {
    out.push(builder(clubId, "L"));
    out.push(builder(clubId, "R"));
  }
  // Ensure exactly 50
  return out.slice(0, 50);
};

export const buildDefaultPlaybooks = (
  clubId: number,
  seededPlays: SavedPlay[],
): Array<Omit<Playbook, "id" | "createdAt">> => {
  const byTag = (tag: string) =>
    seededPlays.filter((p) => (p.engineData?.tags || []).includes(tag)).map((p) => p.id);

  const ato = byTag("ATO");
  const half = seededPlays
    .filter((p) => !(p.engineData?.tags || []).includes("transition"))
    .map((p) => p.id);
  const transition = byTag("transition");

  const mk = (name: string, playIds: string[], isActive: boolean) => ({
    clubId: Number(clubId),
    name,
    playIds,
    isActive,
  });

  return [
    mk("Base · Half-Court", half, true),
    mk("Specials · ATO (BLOB/SLOB/EoQ)", ato, false),
    mk("Tempo · Transition/Flow", transition, false),
  ];
};
