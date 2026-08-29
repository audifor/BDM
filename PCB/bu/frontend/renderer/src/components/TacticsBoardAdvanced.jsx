import { useEffect, useMemo, useState } from "react";
import {
  User,
  GripVertical,
  Move,
  Target,
  Lock,
  LayoutGrid,
  Repeat,
  Zap,
  Crosshair,
  Anchor,
  Shield,
  ArrowLeftRight,
  Scale,
  ShieldAlert,
  Flame,
  ArrowUpCircle,
  Circle,
  Check,
  ShieldCheck,
} from "lucide-react";
import {
  TACTICAL_DUTIES,
  TACTICAL_ROLES_BY_POS,
  calcRoleSuitability,
  getDefaultRoleForPosition,
  normalizePosition,
} from "../lib/tacticalRoles";

const SUITABILITY_MATRIX = {
  PG: { PG: 100, SG: 85, SF: 40, PF: 10, C: 0 },
  SG: { PG: 80, SG: 100, SF: 85, PF: 20, C: 0 },
  SF: { PG: 30, SG: 85, SF: 100, PF: 80, C: 10 },
  PF: { PG: 0, SG: 20, SF: 70, PF: 100, C: 85 },
  C: { PG: 0, SG: 0, SF: 20, PF: 85, C: 100 },
};

const SPACING_LAYOUTS = {
  "4-Out 1-In (Estandar)": { PG: { x: 50, y: 80 }, SG: { x: 15, y: 60 }, SF: { x: 85, y: 60 }, PF: { x: 25, y: 35 }, C: { x: 50, y: 25 } },
  "5-Out (Todos Abiertos)": { PG: { x: 50, y: 82 }, SG: { x: 15, y: 65 }, SF: { x: 85, y: 65 }, PF: { x: 5, y: 25 }, C: { x: 95, y: 25 } },
  "3-Out 2-In (Torres)": { PG: { x: 50, y: 80 }, SG: { x: 20, y: 65 }, SF: { x: 80, y: 65 }, PF: { x: 35, y: 25 }, C: { x: 65, y: 25 } },
  "Overload (Sobrecarga)": { PG: { x: 60, y: 80 }, SG: { x: 85, y: 60 }, SF: { x: 85, y: 30 }, PF: { x: 65, y: 30 }, C: { x: 20, y: 40 } },
  "Horns (Cuernos)": { PG: { x: 50, y: 75 }, SG: { x: 5, y: 15 }, SF: { x: 95, y: 15 }, PF: { x: 35, y: 50 }, C: { x: 65, y: 50 } },
  "Triangle (Triangulo)": { PG: { x: 30, y: 75 }, SG: { x: 80, y: 50 }, SF: { x: 90, y: 15 }, PF: { x: 60, y: 30 }, C: { x: 15, y: 30 } },
};

const TACTIC_OPTIONS = {
  pace: ["Muy Lento", "Lento", "Equilibrado", "Rapido", "Seven Seconds"],
  focus: ["Equilibrado", "Perimetro", "Poste Bajo", "Pick & Roll", "Aislamiento"],
  freedom: ["Rigido", "Disciplinado", "Creativo", "Libertad Total"],
  defenseType: ["Hombre a Hombre", "Zona 2-3", "Zona 3-2", "Box-and-1", "Presion"],
  pnrDefense: ["Drop", "Switch", "Hedge", "Blitz", "Ice"],
  postDefense: ["1vs1", "3/4 Delante", "Ayuda Bote", "2vs1 (Trap)"],
  transition: ["Cargar Rebote Of.", "Equilibrado", "Balance Defensivo"],
  playbook: ["Motion Offense", "Pick & Roll Heavy", "Triangle", "Princeton", "Iso-Heavy"],
  spacing: Object.keys(SPACING_LAYOUTS),
  passingRisk: ["Seguro", "Normal", "Arriesgado"],
};

const SLOT_IDS = ["PG", "SG", "SF", "PF", "C"];

const defaultTactics = {
  pace: 2,
  focus: "Equilibrado",
  freedom: 1,
  defenseType: "Hombre a Hombre",
  pnrDefense: "Drop",
  postDefense: "1vs1",
  transition: 2,
  aggression: 50,
  rimProtect: 50,
  playbook: "Motion Offense",
  spacing: "4-Out 1-In (Estandar)",
  passingRisk: 1,
  pnrFrequency: 50,
  offRebound: 30,
  threePoint: 50,
};

const readJSON = (key, fallback) => {
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
};

const writeJSON = (key, value) => {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch (err) {
    // ignore
  }
};

const getSuitabilityColor = (playerPos, slotId) => {
  const score = SUITABILITY_MATRIX[playerPos]?.[slotId] ?? 0;
  if (score >= 90) return "#4ade80";
  if (score >= 70) return "#facc15";
  if (score >= 40) return "#f97316";
  return "#ef4444";
};

const calcRating = (player) => {
  const attrs = player?.data?.attributes || {};
  const values = Object.values(attrs).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
  if (values.length) {
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }
  return Math.round(Number(player?.current_ability || player?.rating || 50));
};

export default function TacticsBoardAdvanced({ teamId, roster, tacticalRoles, onRolesChange }) {
  const storagePrefix = `pcbasket.tactics.board.${teamId || "default"}`;
  const rolesKey = "pcbasket.tactics.roles";
  const legacyRolesKey = "pcbasket.tactics.board.roles";
  const startersKey = `${storagePrefix}.starters`;
  const tacticsKey = `${storagePrefix}.config`;

  const [starters, setStarters] = useState({ PG: null, SG: null, SF: null, PF: null, C: null });
  const [bench, setBench] = useState([]);
  const [draggedPlayer, setDraggedPlayer] = useState(null);
  const [dragSource, setDragSource] = useState(null);
  const [activePanel, setActivePanel] = useState("ATAQUE");
  const [contextMenu, setContextMenu] = useState(null);
  const [tactics, setTactics] = useState(defaultTactics);

  const rosterPlayers = useMemo(() => {
    if (!Array.isArray(roster)) return [];
    const rolesMap = tacticalRoles || readJSON(rolesKey, null) || readJSON(legacyRolesKey, {});
    return roster.map((p) => {
      const saved = rolesMap[p.id] || {};
      const primaryPos = normalizePosition(p.data?.bio?.pos || p.position || "PG");
      const savedByPos = saved.byPos || {};
      const savedPos = savedByPos[primaryPos] || {};
      return {
        id: p.id,
        name: p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        position: primaryPos,
        rating: calcRating(p),
        condition: 100,
        selectedRole: savedPos.role || saved.role || getDefaultRoleForPosition(primaryPos),
        selectedDuty: savedPos.duty || saved.duty || "Apoyo",
        data: p.data,
      };
    });
  }, [roster, tacticalRoles]);

  useEffect(() => {
    const savedTactics = readJSON(tacticsKey, null);
    if (savedTactics) setTactics({ ...defaultTactics, ...savedTactics });
  }, [tacticsKey]);

  useEffect(() => {
    if (!rosterPlayers.length) return;

    const savedStarters = readJSON(startersKey, null);
    const nextStarters = { PG: null, SG: null, SF: null, PF: null, C: null };
    const assigned = new Set();

    if (savedStarters) {
      SLOT_IDS.forEach((slot) => {
        const saved = savedStarters[slot];
        if (!saved) return;
        const full = rosterPlayers.find((p) => p.id === saved.id);
        if (full) {
          nextStarters[slot] = {
            ...full,
            selectedRole: saved.selectedRole || full.selectedRole,
            selectedDuty: saved.selectedDuty || full.selectedDuty,
          };
          assigned.add(full.id);
        }
      });
    }

    const nextBench = rosterPlayers
      .filter((p) => !assigned.has(p.id))
      .sort((a, b) => b.rating - a.rating);

    setStarters(nextStarters);
    setBench(nextBench);
  }, [rosterPlayers, startersKey]);

  useEffect(() => {
    if (tactics) writeJSON(tacticsKey, tactics);
  }, [tactics, tacticsKey]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const saveStarters = (nextStarters) => {
    const payload = {};
    SLOT_IDS.forEach((slot) => {
      const player = nextStarters[slot];
      payload[slot] = player
        ? {
            id: player.id,
            selectedRole: player.selectedRole,
            selectedDuty: player.selectedDuty,
          }
        : null;
    });
    writeJSON(startersKey, payload);
  };

  const savePlayerRole = (playerId, role, duty, position) => {
    const roles = readJSON(rolesKey, {});
    const existing = roles[playerId] || {};
    const byPos = { ...(existing.byPos || {}) };
    if (position) {
      byPos[position] = { role, duty };
    }
    roles[playerId] = { ...existing, role, duty, byPos };
    writeJSON(rolesKey, roles);
    if (typeof onRolesChange === "function") {
      onRolesChange(roles);
    }
  };

  const handleDragStart = (event, player, source) => {
    setDraggedPlayer(player);
    setDragSource(source);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(player.id));
  };

  const handleDragOver = (event) => event.preventDefault();

  const handleDropOnCourt = (event, positionKey) => {
    event.preventDefault();
    if (!draggedPlayer) return;

    const playerToDrop = { ...draggedPlayer };
    if (!playerToDrop.selectedRole || playerToDrop.selectedRole === "Estandar") {
      playerToDrop.selectedRole = getDefaultRoleForPosition(positionKey);
    }

    const currentPlayerInSlot = starters[positionKey];

    if (dragSource === "roster") {
      const newStarters = { ...starters, [positionKey]: playerToDrop };
      setStarters(newStarters);
      setBench((prev) => prev.filter((p) => p.id !== playerToDrop.id));
      if (currentPlayerInSlot) {
        setBench((prev) => [...prev, currentPlayerInSlot].sort((a, b) => b.rating - a.rating));
      }
      saveStarters(newStarters);
    } else if (dragSource && dragSource !== "roster" && dragSource !== positionKey) {
      const newStarters = {
        ...starters,
        [positionKey]: playerToDrop,
        [dragSource]: currentPlayerInSlot,
      };
      setStarters(newStarters);
      saveStarters(newStarters);
    }

    setDraggedPlayer(null);
    setDragSource(null);
  };

  const handleDropOnRoster = (event) => {
    event.preventDefault();
    if (dragSource && dragSource !== "roster" && draggedPlayer) {
      setBench((prev) => [...prev, draggedPlayer].sort((a, b) => b.rating - a.rating));
      const newStarters = { ...starters, [dragSource]: null };
      setStarters(newStarters);
      saveStarters(newStarters);
    }
    setDraggedPlayer(null);
    setDragSource(null);
  };

  const handleContextMenu = (event, type, id) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, targetType: type, targetId: id });
  };

  const updatePlayerRole = (key, value) => {
    if (!contextMenu) return;
    const contextPos =
      contextMenu.targetType === "slot"
        ? contextMenu.targetId
        : getContextPlayer()?.position || "PG";

    if (contextMenu.targetType === "roster") {
      const playerId = contextMenu.targetId;
      setBench((prev) =>
        prev.map((p) => {
          if (p.id === playerId) {
            const updated = { ...p, [key]: value };
            savePlayerRole(playerId, updated.selectedRole, updated.selectedDuty, contextPos);
            return updated;
          }
          return p;
        }),
      );
    } else {
      setStarters((prev) => {
        const player = prev[contextMenu.targetId];
        if (!player) return prev;
        const updated = { ...player, [key]: value };
        savePlayerRole(player.id, updated.selectedRole, updated.selectedDuty, contextPos);
        return { ...prev, [contextMenu.targetId]: updated };
      });
    }
  };

  const getContextPlayer = () => {
    if (!contextMenu) return null;
    if (contextMenu.targetType === "roster") return bench.find((p) => p.id === contextMenu.targetId);
    return starters[contextMenu.targetId];
  };

  const getPositionCoords = (posId) => (SPACING_LAYOUTS[tactics.spacing] || SPACING_LAYOUTS["4-Out 1-In (Estandar)"])[posId];

  const teamEfficiency = useMemo(() => {
    const filled = Object.entries(starters).filter(([_, p]) => p !== null);
    if (!filled.length) return 0;
    const total = filled.reduce((acc, [slot, player]) => acc + (SUITABILITY_MATRIX[player.position]?.[slot] || 0), 0);
    return Math.round(total / 5);
  }, [starters]);

  const tabBtnStyle = (isActive) => ({
    flex: 1,
    padding: "12px 5px",
    background: isActive ? "#1e293b" : "transparent",
    color: isActive ? "#a5f3fc" : "#64748b",
    border: "none",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "0.75rem",
    borderBottom: isActive ? "2px solid #a5f3fc" : "1px solid #334155",
  });

  return (
    <div className="card roster player-card-elite roster-full tactics-board-advanced" onClick={() => setContextMenu(null)}>
      <div className="tactics-board-panel" onDragOver={handleDragOver} onDrop={handleDropOnRoster}>
        <div className="tactics-board-panel-header">
          <span className="tactics-board-panel-title">BANQUILLO</span>
          <span className="tactics-board-panel-count">{bench.length} disp.</span>
        </div>
        <div className="tactics-board-panel-body">
          {bench.map((p) => (
            <div
              key={p.id}
              draggable
              onDragStart={(event) => handleDragStart(event, p, "roster")}
              onContextMenu={(event) => handleContextMenu(event, "roster", p.id)}
              className="tactics-board-player"
            >
              <div className="tactics-board-player-pos">{p.position}</div>
              <div className="tactics-board-player-info">
                <div className="tactics-board-player-name">{p.name}</div>
                <div className="tactics-board-player-meta">
                  <span className="tactics-board-player-rating">{p.rating}</span>
                  <span>{p.selectedRole || "Sin rol"}</span>
                </div>
              </div>
              <GripVertical size={16} color="#475569" />
            </div>
          ))}
        </div>
      </div>

      <div className="tactics-board-court">
        <div className="tactics-board-court-header">
          <div className="tactics-board-chip">
            <span>MEDIA Q1:</span>
            <b>{(Object.values(starters).reduce((acc, p) => acc + (p?.rating || 0), 0) / 5).toFixed(1)}</b>
          </div>
          <div className="tactics-board-chip" style={{ borderColor: teamEfficiency > 80 ? "#4ade80" : "#ef4444" }}>
            <ShieldCheck size={16} color={teamEfficiency > 80 ? "#4ade80" : "#ef4444"} />
            <span>Sinergia:</span>
            <b style={{ color: teamEfficiency > 80 ? "#4ade80" : teamEfficiency > 60 ? "#facc15" : "#ef4444" }}>
              {teamEfficiency}%
            </b>
          </div>
          <button
            className="tactics-board-clear"
            onClick={() => {
              const empty = { PG: null, SG: null, SF: null, PF: null, C: null };
              setBench((prev) => [...prev, ...Object.values(starters).filter(Boolean)].sort((a, b) => b.rating - a.rating));
              setStarters(empty);
              saveStarters(empty);
            }}
          >
            LIMPIAR
          </button>
        </div>

        <div className="tactics-board-court-surface">
          <div className="tactics-board-court-lines" />
          <svg className="tactics-board-court-svg" viewBox="0 0 500 470" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <g className="court-lines">
              <rect x="0" y="0" width="500" height="470" />
              <rect x="170" y="0" width="160" height="190" />
              <path d="M 330,190 A 80,80 0 0,1 170,190" />
              <path className="court-line-dash" d="M 170,190 A 80,80 0 0,0 330,190" />
              <line className="court-backboard" x1="220" y1="40" x2="280" y2="40" />
              <circle className="court-rim" cx="250" cy="52.5" r="7.5" />
              <path d="M 30,0 L 30,140 A 237.5,237.5 0 0,0 470,140 L 470,0" />
              <path d="M 190,470 A 60,60 0 0,1 310,470" />
            </g>
          </svg>
          {SLOT_IDS.map((slotId) => {
            const coords = getPositionCoords(slotId);
            const player = starters[slotId];
            const suitabilityColor = player ? getSuitabilityColor(player.position, slotId) : "#475569";
            const dutyColor =
              player?.selectedDuty === "Ataque"
                ? "#4ade80"
                : player?.selectedDuty === "Defensa"
                  ? "#60a5fa"
                  : "#facc15";
            const penalty = player && (SUITABILITY_MATRIX[player.position]?.[slotId] || 0) < 50;

            return (
              <div
                key={slotId}
                onDragOver={handleDragOver}
                onDrop={(event) => handleDropOnCourt(event, slotId)}
                onContextMenu={(event) => handleContextMenu(event, "slot", slotId)}
                className="tactics-board-slot"
                style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
              >
                <div className="tactics-board-slot-ring" style={{ borderColor: suitabilityColor }}>
                  {player ? (
                    <div
                      className="tactics-board-slot-player"
                      draggable
                      onDragStart={(event) => handleDragStart(event, player, slotId)}
                    >
                      <User size={38} color="#cbd5e1" />
                      <div className="tactics-board-slot-rating" style={{ background: suitabilityColor }}>
                        {player.rating}
                      </div>
                      {penalty && (
                        <div className="tactics-board-slot-warning">
                          <ShieldAlert size={12} color="white" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="tactics-board-slot-label">{slotId}</span>
                  )}
                </div>
                {player && (
                  <div className="tactics-board-slot-info" style={{ borderColor: suitabilityColor }}>
                    <div className="tactics-board-slot-name">{player.name}</div>
                    <div className="tactics-board-slot-duty">
                      <span>{player.selectedRole}</span>
                      {player.selectedDuty === "Ataque" && <ArrowUpCircle size={10} color={dutyColor} />}
                      {player.selectedDuty === "Apoyo" && <Circle size={8} color={dutyColor} />}
                      {player.selectedDuty === "Defensa" && <Shield size={10} color={dutyColor} />}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="tactics-board-panel tactics-board-panel-right">
        <div className="tactics-board-tabs">
          <button onClick={() => setActivePanel("GENERAL")} style={tabBtnStyle(activePanel === "GENERAL")}>GENERAL</button>
          <button onClick={() => setActivePanel("ATAQUE")} style={tabBtnStyle(activePanel === "ATAQUE")}>ATAQUE</button>
          <button onClick={() => setActivePanel("DEFENSA")} style={tabBtnStyle(activePanel === "DEFENSA")}>DEFENSA</button>
        </div>
        <div className="tactics-board-panel-body">
          {activePanel === "GENERAL" && (
            <>
              <TacticalControl title="RITMO (PACE)" icon={<Move size={16} color="#a5f3fc" />}>
                <input
                  type="range"
                  min="0"
                  max="4"
                  value={tactics.pace}
                  onChange={(e) => setTactics({ ...tactics, pace: parseInt(e.target.value, 10) })}
                />
                <div className="tactics-board-control-value">{TACTIC_OPTIONS.pace[tactics.pace]}</div>
              </TacticalControl>
              <TacticalControl title="ENFOQUE PRINCIPAL" icon={<Target size={16} color="#fbbf24" />}>
                <select
                  value={tactics.focus}
                  onChange={(e) => setTactics({ ...tactics, focus: e.target.value })}
                >
                  {TACTIC_OPTIONS.focus.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </TacticalControl>
              <TacticalControl title="LIBERTAD CREATIVA" icon={<Lock size={16} color="#c084fc" />}>
                <div className="tactics-board-btn-group">
                  {TACTIC_OPTIONS.freedom.map((f, i) => (
                    <button
                      key={f}
                      className={tactics.freedom === i ? "active" : ""}
                      onClick={() => setTactics({ ...tactics, freedom: i })}
                      title={f}
                    >
                      {["RIG", "DIS", "CRE", "LIB"][i]}
                    </button>
                  ))}
                </div>
              </TacticalControl>
            </>
          )}

          {activePanel === "ATAQUE" && (
            <>
              <TacticalControl title="SISTEMA (PLAYBOOK)" icon={<LayoutGrid size={16} color="#22c55e" />}>
                <select
                  value={tactics.playbook}
                  onChange={(e) => setTactics({ ...tactics, playbook: e.target.value })}
                >
                  {TACTIC_OPTIONS.playbook.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </TacticalControl>
              <TacticalControl title="ESPACIADO (SPACING)" icon={<LayoutGrid size={16} color="#fbbf24" />}>
                <select
                  value={tactics.spacing}
                  onChange={(e) => setTactics({ ...tactics, spacing: e.target.value })}
                >
                  {TACTIC_OPTIONS.spacing.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </TacticalControl>
              <TacticalControl title="FRECUENCIA P&R" icon={<Repeat size={16} color="#a5f3fc" />}>
                <div className="tactics-board-range">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={tactics.pnrFrequency}
                    onChange={(e) => setTactics({ ...tactics, pnrFrequency: parseInt(e.target.value, 10) })}
                  />
                  <span>{tactics.pnrFrequency}%</span>
                </div>
              </TacticalControl>
              <TacticalControl title="VOLUMEN TRIPLES" icon={<Zap size={16} color="#f472b6" />}>
                <div className="tactics-board-range">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={tactics.threePoint}
                    onChange={(e) => setTactics({ ...tactics, threePoint: parseInt(e.target.value, 10) })}
                  />
                  <span>{tactics.threePoint}%</span>
                </div>
              </TacticalControl>
              <TacticalControl title="RIESGO EN EL PASE" icon={<Crosshair size={16} color="#facc15" />}>
                <div className="tactics-board-btn-group">
                  {TACTIC_OPTIONS.passingRisk.map((p, i) => (
                    <button
                      key={p}
                      className={tactics.passingRisk === i ? "active" : ""}
                      onClick={() => setTactics({ ...tactics, passingRisk: i })}
                      title={p}
                    >
                      {["SEG", "NOR", "ARR"][i]}
                    </button>
                  ))}
                </div>
              </TacticalControl>
              <TacticalControl title="REBOTE OFENSIVO" icon={<Anchor size={16} color="#ef4444" />}>
                <div className="tactics-board-range">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={tactics.offRebound}
                    onChange={(e) => setTactics({ ...tactics, offRebound: parseInt(e.target.value, 10) })}
                  />
                  <span>{tactics.offRebound}%</span>
                </div>
              </TacticalControl>
            </>
          )}

          {activePanel === "DEFENSA" && (
            <>
              <TacticalControl title="ESQUEMA DEFENSIVO" icon={<Shield size={16} color="#ef4444" />}>
                <select
                  value={tactics.defenseType}
                  onChange={(e) => setTactics({ ...tactics, defenseType: e.target.value })}
                >
                  {TACTIC_OPTIONS.defenseType.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </TacticalControl>
              <TacticalControl title="DEFENSA P&R" icon={<ArrowLeftRight size={16} color="#fbbf24" />}>
                <select
                  value={tactics.pnrDefense}
                  onChange={(e) => setTactics({ ...tactics, pnrDefense: e.target.value })}
                >
                  {TACTIC_OPTIONS.pnrDefense.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </TacticalControl>
              <TacticalControl title="DEFENSA AL POSTE" icon={<Scale size={16} color="#a5f3fc" />}>
                <select
                  value={tactics.postDefense}
                  onChange={(e) => setTactics({ ...tactics, postDefense: e.target.value })}
                >
                  {TACTIC_OPTIONS.postDefense.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </TacticalControl>
              <TacticalControl title="TRANSICION DEFENSIVA" icon={<ArrowLeftRight size={16} color="#c084fc" />}>
                <input
                  type="range"
                  min="0"
                  max="2"
                  value={tactics.transition}
                  onChange={(e) => setTactics({ ...tactics, transition: parseInt(e.target.value, 10) })}
                />
                <div className="tactics-board-control-value">{TACTIC_OPTIONS.transition[tactics.transition]}</div>
              </TacticalControl>
              <TacticalControl title="AGRESIVIDAD" icon={<Flame size={16} color="#ef4444" />}>
                <div className="tactics-board-range">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={tactics.aggression}
                    onChange={(e) => setTactics({ ...tactics, aggression: parseInt(e.target.value, 10) })}
                  />
                  <span>{tactics.aggression}%</span>
                </div>
              </TacticalControl>
              <TacticalControl title="PROTECCION DE ARO" icon={<ShieldAlert size={16} color="#4ade80" />}>
                <div className="tactics-board-range">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={tactics.rimProtect}
                    onChange={(e) => setTactics({ ...tactics, rimProtect: parseInt(e.target.value, 10) })}
                  />
                  <span>{tactics.rimProtect}%</span>
                </div>
              </TacticalControl>
            </>
          )}
        </div>
        <div className="tactics-board-footer">
          <button className="tactics-board-save">GUARDAR AJUSTES</button>
        </div>
      </div>

      {contextMenu && (
        <div
          className="tactics-board-context"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="tactics-board-context-header">
            <span>{contextMenu.targetType === "roster" ? "BANQUILLO" : "PISTA"}</span>
            <span>{getContextPlayer()?.name}</span>
          </div>
          <div className="tactics-board-context-section">
            <div className="tactics-board-context-label">Rol Tactico</div>
            {(TACTICAL_ROLES_BY_POS[
              contextMenu.targetType === "slot" ? contextMenu.targetId : getContextPlayer()?.position || "PG"
            ] || []).map((role) => {
              const player = getContextPlayer();
              const isActive = player?.selectedRole === role;
              const targetPos =
                contextMenu.targetType === "slot" ? contextMenu.targetId : getContextPlayer()?.position || "PG";
              const duty = getContextPlayer()?.selectedDuty || "Apoyo";
              const suitability = calcRoleSuitability(player, role, targetPos, duty);
              const suitColor = suitability >= 90 ? "#4ade80" : suitability >= 75 ? "#facc15" : "#fb923c";
              return (
                <div
                  key={role}
                  className={`tactics-board-context-item ${isActive ? "active" : ""}`}
                  onClick={() => {
                    updatePlayerRole("selectedRole", role);
                    setContextMenu(null);
                  }}
                >
                  <span>{role}</span>
                  <div className="tactics-board-context-score">
                    <div className="tactics-board-context-bar">
                      <div style={{ width: `${suitability}%`, background: suitColor }} />
                    </div>
                    <span style={{ color: suitColor }}>{suitability}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="tactics-board-context-section">
            <div className="tactics-board-context-label">Tarea (Duty)</div>
            {TACTICAL_DUTIES.map((duty) => (
              <div
                key={duty}
                className={`tactics-board-context-item ${getContextPlayer()?.selectedDuty === duty ? "active" : ""}`}
                onClick={() => {
                  updatePlayerRole("selectedDuty", duty);
                  setContextMenu(null);
                }}
              >
                <span>{duty}</span>
                {getContextPlayer()?.selectedDuty === duty && <Check size={12} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TacticalControl({ title, icon, children }) {
  return (
    <div className="tactics-board-control">
      <div className="tactics-board-control-title">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
