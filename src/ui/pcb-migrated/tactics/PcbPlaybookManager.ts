export type PlayType = 'custom' | 'Set' | 'Quick' | 'Flow' | 'ATO' | string;

export interface SavedPlay {
  id: string;
  clubId: number;
  name: string;
  playType: PlayType;
  description?: string;
  frames: any[];
  engineData: any;
  efficiency: number;
  familiarity: number;
  timesUsed: number;
  timesSuccessful: number;
  createdAt: string;
}

export interface Playbook {
  id: string;
  clubId: number;
  name: string;
  playIds: string[];
  isActive: boolean;
  createdAt: string;
}

interface SavePlayPayload {
  clubId: number;
  name: string;
  playType: PlayType;
  description?: string;
  frames: any[];
  engineData: any;
  efficiency?: number;
  familiarity?: number;
  timesUsed?: number;
  timesSuccessful?: number;
}

interface SavePlaybookPayload {
  clubId: number;
  name: string;
  playIds: string[];
  isActive?: boolean;
}

const PLAYS_KEY = 'pcbasket.db.plays.v1';
const PLAYBOOKS_KEY = 'pcbasket.db.playbooks.v1';

const readJSON = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
};

const writeJSON = (key: string, value: any) => {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};

let nextTemporaryId = 0
const createId = (prefix: string) => `${prefix}-${Date.now()}-${++nextTemporaryId}`;

export const analyzePlayFrames = (frames: any[]) => {
  const paths = (frames || []).flatMap((frame: any) => frame?.paths || []);
  const stats = {
    passes: paths.filter((path: any) => path?.type === 'pass').length,
    screens: paths.filter((path: any) => path?.type === 'screen').length,
    dribbles: paths.filter((path: any) => path?.type === 'dribble').length,
    moves: paths.filter((path: any) => path?.type === 'move').length,
    total_actions: paths.length,
    total_frames: (frames || []).length,
  };

  let playType: PlayType = 'Set';
  if (stats.dribbles >= 3 && stats.dribbles >= stats.passes) playType = 'Flow';
  if (stats.passes >= 3 && stats.screens <= 1) playType = 'Quick';
  if (stats.screens >= 2 && stats.passes >= 2) playType = 'ATO';

  return {
    play_type: playType,
    focus: stats.screens >= 2 ? 'Pick & Roll' : stats.passes >= 4 ? '3PT' : stats.moves >= 3 ? 'Cut' : 'Isolation',
    stats,
  };
};

export const loadPlays = async (clubId: number): Promise<SavedPlay[]> => {
  const plays = readJSON<SavedPlay[]>(PLAYS_KEY, []);
  const scoped = plays.filter((play) => Number(play.clubId) === Number(clubId));
  if (scoped.length) return scoped;
  const seed: SavedPlay = { id: `seed-play-${clubId}`, clubId, name: 'Horns Spain Pick & Roll', playType: 'Set', description: 'Seed visual temporal de migración.', frames: [], engineData: {}, efficiency: 62, familiarity: 48, timesUsed: 12, timesSuccessful: 7, createdAt: '2026-01-01T00:00:00.000Z' };
  writeJSON(PLAYS_KEY, [...plays, seed]);
  return [seed];
};

export const savePlay = async (payload: SavePlayPayload): Promise<SavedPlay> => {
  const plays = readJSON<SavedPlay[]>(PLAYS_KEY, []);
  const created: SavedPlay = {
    id: createId('play'),
    clubId: Number(payload.clubId),
    name: payload.name,
    playType: payload.playType || 'custom',
    description: payload.description || '',
    frames: payload.frames || [],
    engineData: payload.engineData || {},
    efficiency: payload.efficiency ?? 50,
    familiarity: payload.familiarity ?? 0,
    timesUsed: payload.timesUsed ?? 0,
    timesSuccessful: payload.timesSuccessful ?? 0,
    createdAt: new Date().toISOString(),
  };
  writeJSON(PLAYS_KEY, [...plays, created]);
  return created;
};

export const deletePlay = async (playId: string): Promise<void> => {
  const plays = readJSON<SavedPlay[]>(PLAYS_KEY, []);
  writeJSON(
    PLAYS_KEY,
    plays.filter((play) => play.id !== playId),
  );

  const playbooks = readJSON<Playbook[]>(PLAYBOOKS_KEY, []);
  writeJSON(
    PLAYBOOKS_KEY,
    playbooks.map((pb) => ({ ...pb, playIds: pb.playIds.filter((id) => id !== playId) })),
  );
};

export const loadPlaybooks = async (clubId: number): Promise<Playbook[]> => {
  const playbooks = readJSON<Playbook[]>(PLAYBOOKS_KEY, []);
  const scoped = playbooks.filter((pb) => Number(pb.clubId) === Number(clubId));
  if (scoped.length) return scoped;
  const seed: Playbook = { id: `seed-playbook-${clubId}`, clubId, name: 'Ataque Base', playIds: [`seed-play-${clubId}`], isActive: true, createdAt: '2026-01-01T00:00:00.000Z' };
  writeJSON(PLAYBOOKS_KEY, [...playbooks, seed]);
  return [seed];
};

export const savePlaybook = async (payload: SavePlaybookPayload): Promise<Playbook> => {
  const playbooks = readJSON<Playbook[]>(PLAYBOOKS_KEY, []);
  const created: Playbook = {
    id: createId('pb'),
    clubId: Number(payload.clubId),
    name: payload.name,
    playIds: payload.playIds || [],
    isActive: !!payload.isActive,
    createdAt: new Date().toISOString(),
  };
  writeJSON(PLAYBOOKS_KEY, [...playbooks, created]);
  return created;
};

export const updatePlaybook = async (playbook: Playbook): Promise<Playbook> => {
  const playbooks = readJSON<Playbook[]>(PLAYBOOKS_KEY, []);
  const updated = playbooks.map((pb) => (pb.id === playbook.id ? { ...pb, ...playbook } : pb));
  writeJSON(PLAYBOOKS_KEY, updated);
  return { ...playbook };
};

export const deletePlaybook = async (playbookId: string): Promise<void> => {
  const playbooks = readJSON<Playbook[]>(PLAYBOOKS_KEY, []);
  writeJSON(
    PLAYBOOKS_KEY,
    playbooks.filter((pb) => pb.id !== playbookId),
  );
};

export const setActivePlaybook = async (clubId: number, playbookId: string): Promise<void> => {
  const playbooks = readJSON<Playbook[]>(PLAYBOOKS_KEY, []);
  const updated = playbooks.map((pb) => {
    if (Number(pb.clubId) !== Number(clubId)) return pb;
    return { ...pb, isActive: pb.id === playbookId };
  });
  writeJSON(PLAYBOOKS_KEY, updated);
};

