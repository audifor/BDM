import React, { useEffect, useMemo, useState } from "react";
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
} from "./PcbTacticsIcons";
import {
  TACTICAL_DUTIES,
  TACTICAL_ROLES_BY_POS,
  calcRoleSuitability,
  getDefaultRoleForPosition,
  normalizePosition,
} from "./PcbTacticalRoles";

const SUITABILITY_MATRIX = {
  PG: { PG: 100, SG: 85, SF: 40, PF: 10, C: 0 },
  SG: { PG: 80, SG: 100, SF: 85, PF: 20, C: 0 },
  SF: { PG: 30, SG: 85, SF: 100, PF: 80, C: 10 },
  PF: { PG: 0, SG: 20, SF: 70, PF: 100, C: 85 },
  C: { PG: 0, SG: 0, SF: 20, PF: 85, C: 100 },
};

const BOARD_LAYOUT = { PG: { x: 50, y: 80 }, SG: { x: 15, y: 60 }, SF: { x: 85, y: 60 }, PF: { x: 25, y: 35 }, C: { x: 50, y: 25 } };

// Only what Match Next executes is editable here (MatchTacticalPlan): pace, shot profile, defensive preset, pick-and-roll
// coverage and the featured player. Every other Courtside setting is shown as not connected, never as a working control.
const PACE_LABELS = ["Muy lento", "Lento", "Equilibrado", "Rápido", "Máximo ritmo"];
const SHOT_LEVEL_LABELS = ["Evitar", "Menos", "Normal", "Más", "Priorizar"];
const SHOT_PROFILE_CONTROLS = [
  { key: "threePoint", title: "VOLUMEN TRIPLES", icon: (color) => <Zap size={16} color={color} />, color: "#f472b6" },
  { key: "rim", title: "ATAQUE AL ARO", icon: (color) => <Target size={16} color={color} />, color: "#22c55e" },
  { key: "midRange", title: "MEDIA DISTANCIA", icon: (color) => <Crosshair size={16} color={color} />, color: "#facc15" },
];
const DEFENSE_PRESETS = [
  { label: "Individual", interior: 0, perimeter: 0 },
  { label: "Proteger pintura", interior: 2, perimeter: -1 },
  { label: "Presión perimetral", interior: -1, perimeter: 2 },
];
const COVERAGE_OPTIONS = [
  { value: "switch", label: "Switch" },
  { value: "drop", label: "Drop" },
  { value: "hedge", label: "Hedge" },
  { value: "blitz", label: "Blitz" },
];
const DEFAULT_TEAM_PLAN = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0, pickAndRollCoverage: "switch" } };

const SLOT_IDS = ["PG", "SG", "SF", "PF", "C"];
const BENCH_SLOT_IDS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7"];

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

export default function TacticsBoardAdvanced({ teamId, roster, tacticalRoles, onRolesChange, onLineupSlotChange, onLineupSlotClear, onOpenPlayer, plan, onPlanChange }) {
  const rolesKey = `pcbasket.tactics.roles.${teamId || "default"}`;

  const [starters, setStarters] = useState({ PG: null, SG: null, SF: null, PF: null, C: null });
  const [bench, setBench] = useState({ B1: null, B2: null, B3: null, B4: null, B5: null, B6: null, B7: null });
  const [unassigned, setUnassigned] = useState([]);
  const [draggedPlayer, setDraggedPlayer] = useState(null);
  const [dragSource, setDragSource] = useState(null);
  const [activePanel, setActivePanel] = useState("ATAQUE");
  const [contextMenu, setContextMenu] = useState(null);
  const tacticalPlan = plan ?? DEFAULT_TEAM_PLAN;
  const updatePlan = (patch) => { if (typeof onPlanChange === "function") onPlanChange({ ...tacticalPlan, ...patch }); };

  const rosterPlayers = useMemo(() => {
    if (!Array.isArray(roster)) return [];
    const rolesMap = tacticalRoles ?? readJSON(rolesKey, {});
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
        lineupSlot: p.lineupSlot ?? null,
        data: p.data,
      };
    });
  }, [roster, tacticalRoles, rolesKey]);

  useEffect(() => {
    if (!rosterPlayers.length) return;

    const nextStarters = { PG: null, SG: null, SF: null, PF: null, C: null };
    const nextBench = { B1: null, B2: null, B3: null, B4: null, B5: null, B6: null, B7: null };
    const assigned = new Set();

    SLOT_IDS.forEach((slot) => {
      const full = rosterPlayers.find((p) => p.lineupSlot === slot);
      if (full) {
        nextStarters[slot] = full;
        assigned.add(full.id);
      }
    });

    BENCH_SLOT_IDS.forEach((slot) => {
      const full = rosterPlayers.find((p) => p.lineupSlot === slot);
      if (full) {
        nextBench[slot] = full;
        assigned.add(full.id);
      }
    });

    const nextUnassigned = rosterPlayers
      .filter((p) => !assigned.has(p.id))
      .sort((a, b) => b.rating - a.rating);

    setStarters(nextStarters);
    setBench(nextBench);
    setUnassigned(nextUnassigned);
  }, [rosterPlayers]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const saveStarters = (nextStarters) => {
    SLOT_IDS.forEach((slot) => {
      const player = nextStarters[slot];
      if (player) {
        if (typeof onLineupSlotChange === "function") onLineupSlotChange(slot, player.id);
      } else if (typeof onLineupSlotClear === "function") {
        onLineupSlotClear(slot);
      }
    });
  };

  const firstFreeBenchSlot = (benchState) => BENCH_SLOT_IDS.find((slot) => !benchState[slot]);

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

    if (dragSource === "roster" || dragSource === "unassigned") {
      // Bench or unassigned player becomes a starter: the canonical engine vacates
      // whichever slot (bench or none) they previously held as part of the assignment.
      const newStarters = { ...starters, [positionKey]: playerToDrop };
      setStarters(newStarters);
      if (dragSource === "roster") setBench((prev) => Object.fromEntries(Object.entries(prev).map(([slot, p]) => [slot, p?.id === playerToDrop.id ? null : p])));
      else setUnassigned((prev) => prev.filter((p) => p.id !== playerToDrop.id));
      if (typeof onLineupSlotChange === "function") onLineupSlotChange(positionKey, playerToDrop.id);
    } else if (dragSource && dragSource !== positionKey && SLOT_IDS.includes(dragSource)) {
      const currentPlayerInSlot = starters[positionKey];
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
    const droppedOnUnassigned = Boolean(
      event.target instanceof Element &&
        (event.target.closest(".tactics-board-panel-body--unassigned") ||
          event.target.closest(".tactics-board-panel-header")?.textContent?.includes("SIN ASIGNAR")),
    );
    if (droppedOnUnassigned || !draggedPlayer || dragSource === "roster") {
      setDraggedPlayer(null);
      setDragSource(null);
      return;
    }
    // Court starter or unassigned player dropped on BANQUILLO: must land on a real
    // canonical bench slot. If the bench is full, leave the player where they were.
    const slot = firstFreeBenchSlot(bench);
    if (slot) {
      setBench((prev) => ({ ...prev, [slot]: draggedPlayer }));
      if (dragSource === "unassigned") {
        setUnassigned((prev) => prev.filter((player) => player.id !== draggedPlayer.id));
      } else if (SLOT_IDS.includes(dragSource)) {
        setStarters((prev) => ({ ...prev, [dragSource]: null }));
      }
      if (typeof onLineupSlotChange === "function") onLineupSlotChange(slot, draggedPlayer.id);
    }
    setDraggedPlayer(null);
    setDragSource(null);
  };

  const handleContextMenu = (event, type, id) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 320;
    const menuHeight = 440;
    const x = Math.max(8, Math.min(event.clientX + 12, window.innerWidth - menuWidth - 8));
    const y = Math.max(8, Math.min(event.clientY + 8, window.innerHeight - menuHeight - 8));
    setContextMenu({ x, y, targetType: type, targetId: id });
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
        Object.fromEntries(
          Object.entries(prev).map(([slot, p]) => {
            if (p?.id === playerId) {
              const updated = { ...p, [key]: value };
              savePlayerRole(playerId, updated.selectedRole, updated.selectedDuty, contextPos);
              return [slot, updated];
            }
            return [slot, p];
          }),
        ),
      );
    } else if (contextMenu.targetType === "unassigned") {
      const playerId = contextMenu.targetId;
      setUnassigned((prev) =>
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
    if (contextMenu.targetType === "roster") return Object.values(bench).find((p) => p?.id === contextMenu.targetId);
    if (contextMenu.targetType === "unassigned") return unassigned.find((p) => p.id === contextMenu.targetId);
    return starters[contextMenu.targetId];
  };

  const getPositionCoords = (posId) => BOARD_LAYOUT[posId];

  const teamEfficiency = useMemo(() => {
    const filled = Object.entries(starters).filter(([_, p]) => p !== null);
    if (!filled.length) return 0;
    const total = filled.reduce((acc, [slot, player]) => acc + (SUITABILITY_MATRIX[player.position]?.[slot] || 0), 0);
    return Math.round(total / 5);
  }, [starters]);

  const contextPlayer = getContextPlayer();
  const contextPosition = contextMenu?.targetType === "slot"
    ? contextMenu.targetId : contextPlayer?.position || "PG";
  const contextDuty = contextPlayer?.selectedDuty || "Apoyo";
  const rankedContextRoles = (TACTICAL_ROLES_BY_POS[contextPosition] || [])
    .map(role => ({
      role,
      suitability: calcRoleSuitability(contextPlayer, role, contextPosition, contextDuty),
    }))
    .sort((a, b) => (b.suitability ?? -1) - (a.suitability ?? -1));

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
          <span className="tactics-board-panel-count">{BENCH_SLOT_IDS.filter((slot) => bench[slot]).length} disp.</span>
        </div>
        <div className="tactics-board-panel-body">
          {BENCH_SLOT_IDS.filter((slot) => bench[slot]).map((slot) => {
            const p = bench[slot];
            return (
              <div
                key={p.id}
                draggable
                onDragStart={(event) => handleDragStart(event, p, "roster")}
                onContextMenu={(event) => handleContextMenu(event, "roster", p.id)}
                className="tactics-board-player"
              >
                <div className="tactics-board-player-pos ng-play-position">{slot}</div>
                <div className="tactics-board-player-info">
                  {onOpenPlayer ? (
                    <button
                      className="tactics-board-player-name pcb-player-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenPlayer(p.id);
                      }}
                      type="button"
                    >
                      {p.name}
                    </button>
                  ) : (
                    <div className="tactics-board-player-name">{p.name}</div>
                  )}
                  <div className="tactics-board-player-meta">
                    <span className="tactics-board-player-rating">{p.rating}</span>
                    <span>{p.selectedRole || "Sin rol"}</span>
                  </div>
                </div>
                <GripVertical size={16} color="#475569" />
              </div>
            );
          })}
        </div>
        <div className="tactics-board-panel-header">
          <span className="tactics-board-panel-title">SIN ASIGNAR</span>
          <span className="tactics-board-panel-count">{unassigned.length} disp.</span>
        </div>
        <div className="tactics-board-panel-body tactics-board-panel-body--unassigned">
          {unassigned.map((p) => (
            <div
              key={p.id}
              draggable
              onDragStart={(event) => handleDragStart(event, p, "unassigned")}
              onContextMenu={(event) => handleContextMenu(event, "unassigned", p.id)}
              className="tactics-board-player"
            >
              <div className="tactics-board-player-pos ng-play-position">{p.position}</div>
              <div className="tactics-board-player-info">
                {onOpenPlayer ? (
                  <button
                    className="tactics-board-player-name pcb-player-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenPlayer(p.id);
                    }}
                    type="button"
                  >
                    {p.name}
                  </button>
                ) : (
                  <div className="tactics-board-player-name">{p.name}</div>
                )}
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
              let nextBench = { ...bench };
              const displacedToUnassigned = [];
              SLOT_IDS.forEach((slot) => {
                const player = starters[slot];
                if (!player) return;
                const freeSlot = firstFreeBenchSlot(nextBench);
                if (freeSlot) {
                  nextBench = { ...nextBench, [freeSlot]: player };
                  if (typeof onLineupSlotChange === "function") onLineupSlotChange(freeSlot, player.id);
                } else {
                  displacedToUnassigned.push(player);
                  if (typeof onLineupSlotClear === "function") onLineupSlotClear(slot);
                }
              });
              setBench(nextBench);
              setUnassigned((prev) => [...prev, ...displacedToUnassigned].sort((a, b) => b.rating - a.rating));
              setStarters({ PG: null, SG: null, SF: null, PF: null, C: null });
            }}
          >
            LIMPIAR
          </button>
        </div>

        <div className="tactics-board-court-frame">
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
                    {onOpenPlayer ? (
                      <button
                        className="tactics-board-slot-name pcb-player-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenPlayer(player.id);
                        }}
                        type="button"
                      >
                        {player.name}
                      </button>
                    ) : (
                      <div className="tactics-board-slot-name">{player.name}</div>
                    )}
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
      </div>

      <div className="tactics-board-panel tactics-board-panel-right">
        <div className="tactics-board-tabs">
          <button className={activePanel === "GENERAL" ? 'is-active' : ''} onClick={() => setActivePanel("GENERAL")} style={tabBtnStyle(activePanel === "GENERAL")}>GENERAL</button>
          <button className={activePanel === "ATAQUE" ? 'is-active' : ''} onClick={() => setActivePanel("ATAQUE")} style={tabBtnStyle(activePanel === "ATAQUE")}>ATAQUE</button>
          <button className={activePanel === "DEFENSA" ? 'is-active' : ''} onClick={() => setActivePanel("DEFENSA")} style={tabBtnStyle(activePanel === "DEFENSA")}>DEFENSA</button>
        </div>
        <div className="tactics-board-panel-body">
          {activePanel === "GENERAL" && (
            <>
              <TacticalControl title="RITMO (PACE)" icon={<Move size={16} color="#a5f3fc" />}>
                <input
                  type="range"
                  min="0"
                  max="4"
                  aria-label="Ritmo"
                  value={tacticalPlan.pace + 2}
                  disabled={!onPlanChange}
                  onChange={(e) => updatePlan({ pace: parseInt(e.target.value, 10) - 2 })}
                />
                <div className="tactics-board-control-value">{PACE_LABELS[tacticalPlan.pace + 2]}</div>
              </TacticalControl>
              <TacticalControl title="JUGADOR DESTACADO" icon={<Target size={16} color="#fbbf24" />}>
                <select
                  aria-label="Jugador destacado"
                  value={tacticalPlan.featuredPlayerId ?? ""}
                  disabled={!onPlanChange}
                  onChange={(e) => {
                    const { featuredPlayerId: _removed, ...rest } = tacticalPlan;
                    if (typeof onPlanChange === "function") onPlanChange(e.target.value === "" ? rest : { ...rest, featuredPlayerId: e.target.value });
                  }}
                >
                  <option value="">Ninguno</option>
                  {rosterPlayers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {p.position}</option>
                  ))}
                </select>
                <div className="tactics-board-control-value">El ataque le busca más veces cuando está en pista.</div>
              </TacticalControl>
              <UnconnectedControl title="ENFOQUE PRINCIPAL" icon={<Target size={16} color="#fbbf24" />} />
              <UnconnectedControl title="LIBERTAD CREATIVA" icon={<Lock size={16} color="#c084fc" />} />
            </>
          )}

          {activePanel === "ATAQUE" && (
            <>
              {SHOT_PROFILE_CONTROLS.map(({ key, title, icon, color }) => (
                <TacticalControl key={key} title={title} icon={icon(color)}>
                  <input
                    type="range"
                    min="0"
                    max="4"
                    aria-label={title}
                    value={tacticalPlan.shotProfile[key] + 2}
                    disabled={!onPlanChange}
                    onChange={(e) => updatePlan({ shotProfile: { ...tacticalPlan.shotProfile, [key]: parseInt(e.target.value, 10) - 2 } })}
                  />
                  <div className="tactics-board-control-value">{SHOT_LEVEL_LABELS[tacticalPlan.shotProfile[key] + 2]}</div>
                </TacticalControl>
              ))}
              <UnconnectedControl title="SISTEMA (PLAYBOOK)" icon={<LayoutGrid size={16} color="#22c55e" />} />
              <UnconnectedControl title="ESPACIADO (SPACING)" icon={<LayoutGrid size={16} color="#fbbf24" />} />
              <UnconnectedControl title="FRECUENCIA P&R" icon={<Repeat size={16} color="#a5f3fc" />} />
              <UnconnectedControl title="RIESGO EN EL PASE" icon={<Crosshair size={16} color="#facc15" />} />
              <UnconnectedControl title="REBOTE OFENSIVO" icon={<Anchor size={16} color="#ef4444" />} />
            </>
          )}

          {activePanel === "DEFENSA" && (
            <>
              <TacticalControl title="ESQUEMA DEFENSIVO" icon={<Shield size={16} color="#ef4444" />}>
                <select
                  aria-label="Esquema defensivo"
                  value={DEFENSE_PRESETS.findIndex((o) => o.interior === tacticalPlan.defense.interior && o.perimeter === tacticalPlan.defense.perimeter)}
                  disabled={!onPlanChange}
                  onChange={(e) => {
                    const preset = DEFENSE_PRESETS[parseInt(e.target.value, 10)];
                    if (preset) updatePlan({ defense: { ...tacticalPlan.defense, interior: preset.interior, perimeter: preset.perimeter } });
                  }}
                >
                  {DEFENSE_PRESETS.map((o, index) => (
                    <option key={o.label} value={index}>{o.label}</option>
                  ))}
                </select>
              </TacticalControl>
              <TacticalControl title="DEFENSA P&R" icon={<ArrowLeftRight size={16} color="#fbbf24" />}>
                <select
                  aria-label="Defensa del bloqueo directo"
                  value={tacticalPlan.defense.pickAndRollCoverage ?? "switch"}
                  disabled={!onPlanChange}
                  onChange={(e) => updatePlan({ defense: { ...tacticalPlan.defense, pickAndRollCoverage: e.target.value } })}
                >
                  {COVERAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </TacticalControl>
              <UnconnectedControl title="DEFENSA AL POSTE" icon={<Scale size={16} color="#a5f3fc" />} />
              <UnconnectedControl title="TRANSICION DEFENSIVA" icon={<ArrowLeftRight size={16} color="#c084fc" />} />
              <UnconnectedControl title="AGRESIVIDAD" icon={<Flame size={16} color="#ef4444" />} />
              <UnconnectedControl title="PROTECCION DE ARO" icon={<ShieldAlert size={16} color="#4ade80" />} />
            </>
          )}
        </div>
        <div className="tactics-board-footer">
          <p className="tactics-board-footer__status" role="status">
            {onPlanChange ? "Plan del equipo guardado en la partida. Se aplica a cada encuentro salvo el ajuste de Plan de Partido." : "Sin partida activa."}
          </p>
          <button
            className="tactics-board-save"
            disabled={!onPlanChange}
            onClick={() => { if (typeof onPlanChange === "function") onPlanChange(DEFAULT_TEAM_PLAN); }}
            type="button"
          >
            RESTABLECER PLAN
          </button>
        </div>
      </div>

      {contextMenu && (
        <div
          className="tactics-board-context"
          role="dialog"
          aria-label="Roles tácticos del jugador"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={event => { if (event.key === "Escape") setContextMenu(null) }}
        >
          <div className="tactics-board-context-header">
            <span>ROL TÁCTICO · {contextPosition}</span>
            <button className="tactics-board-context-close" aria-label="Cerrar roles tácticos" type="button" onClick={() => setContextMenu(null)}>×</button>
          </div>
          <div className="tactics-board-context-player">{contextPlayer?.name ?? "Sin jugador"}</div>
          <div className="tactics-board-context-section">
            <div className="tactics-board-context-label">ENCAJE SEGÚN RATINGS REALES</div>
            {rankedContextRoles.length ? rankedContextRoles.map(({role,suitability}, index) => (
              <button type="button"
                key={role}
                aria-pressed={contextPlayer?.selectedRole === role}
                className={`tactics-board-context-item ${contextPlayer?.selectedRole === role ? "active" : ""}`}
                onClick={() => { updatePlayerRole("selectedRole", role); setContextMenu(null); }}
              >
                <span className="tactics-board-context-role">
                  {role}
                  {index === 0 && suitability !== null && <small>MEJOR ENCAJE</small>}
                </span>
                <span className="tactics-board-context-score">
                  {suitability !== null ? <>
                    <span className="tactics-board-context-bar"><i style={{width: `${suitability}%`}}/></span>
                    <strong>{suitability}%</strong>
                  </> : <small>Sin evaluación</small>}
                </span>
              </button>
            )) : <p className="tactics-board-context-empty">Sin roles tácticos para esta posición.</p>}
            <p className="tactics-board-context-note">
              Encaje estimado con los atributos reales del jugador. No es una probabilidad de éxito. El rol y la tarea son notas de pizarra: el motor de partidos todavía no los ejecuta.
            </p>
          </div>
          <div className="tactics-board-context-section">
            <div className="tactics-board-context-label">TAREA DEL JUGADOR</div>
            <div className="tactics-board-context-duties">
              {TACTICAL_DUTIES.map(duty => (
                <button type="button" key={duty}
                  aria-pressed={contextDuty === duty}
                  className={`tactics-board-context-item ${contextDuty === duty ? "active" : ""}`}
                  onClick={() => { updatePlayerRole("selectedDuty", duty); setContextMenu(null); }}
                >{duty}{contextDuty === duty && <Check size={13}/>}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UnconnectedControl({ title, icon }) {
  return (
    <TacticalControl title={title} icon={icon}>
      <div className="tactics-board-control-value is-unconnected" data-engine-support="none">
        SIN EFECTO EN EL PARTIDO · el motor todavía no lo ejecuta
      </div>
    </TacticalControl>
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

