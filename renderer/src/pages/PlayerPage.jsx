import React, { useEffect, useMemo, useRef, useState } from "react";
import { BatteryMedium, ChevronLeft, Heart, Star } from "lucide-react";
import {
  TACTICAL_DUTIES,
  TACTICAL_POSITIONS,
  TACTICAL_ROLES_BY_POS,
  calcRoleSuitability,
  getDefaultRoleForPosition,
  getRoleAttributeWeights,
  normalizePosition,
} from "../lib/tacticalRoles";

const clamp = (min, value, max) => Math.max(min, Math.min(max, value));

const to1000 = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return clamp(1, Math.round(n), 1000);
};

const formatMoney = (amount, currency = "$") => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "--";
  const c = currency || "$";
  if (n >= 1_000_000) return `${c}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${c}${(n / 1_000).toFixed(0)}K`;
  return `${c}${Math.round(n)}`;
};

const formatMoneyRange = (range, currency = "$") => {
  if (!range || typeof range.min !== "number" || typeof range.max !== "number") return null;
  const min = Number(range.min);
  const max = Number(range.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) return formatMoney(min, currency);
  return `${formatMoney(min, currency)}-${formatMoney(max, currency)}`;
};

const expectedWageFromMarketValue = (marketValue, leagueId) => {
  const mv = Number(marketValue || 0);
  if (!Number.isFinite(mv) || mv <= 0) return 60_000;
  const lid = String(leagueId || "").toUpperCase();
  if (lid === "NBA") return Math.max(200_000, Math.floor(mv / 8));
  if (lid === "WNBA") return Math.max(40_000, Math.floor(mv / 14));
  if (lid.startsWith("NCAA")) return 0;
  return Math.max(60_000, Math.floor(mv / 12));
};

const getAttrToneClass = (value1000) => {
  const v = Number(value1000);
  if (!Number.isFinite(v)) return "attr-unknown";
  if (v <= 250) return "attr-verylow";
  if (v <= 500) return "attr-low";
  if (v <= 750) return "attr-mid";
  return "attr-high";
};

const Stars = ({ value = 0, uncertainty = 0, variant = "gold" }) => {
  const clamped = clamp(0, Number(value) || 0, 5);
  const full = Math.floor(clamped);
  const half = clamped - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  const uncertaintyCount = clamp(0, Math.round((Number(uncertainty) || 0) * 5), 5);
  const baseClass = variant === "silver" ? "silver" : variant === "black" ? "black" : "gold";

  const items = [];
  for (let i = 0; i < full; i++) items.push({ fill: 1, key: `f-${i}` });
  if (half) items.push({ fill: 0.5, key: "h" });
  for (let i = 0; i < empty; i++) items.push({ fill: 0, key: `e-${i}` });

  return (
    <div className="stars" aria-label={`${clamped.toFixed(1)} estrellas`}>
      {items.map((s, idx) => (
        <span key={s.key} className={`star-wrap ${baseClass}`}>
          <Star size={16} className="star-outline" />
          {s.fill > 0 && (
            <span className="star-fill" style={{ width: `${s.fill * 100}%` }}>
              <Star size={16} fill="currentColor" className="star-solid" />
            </span>
          )}
          {idx < uncertaintyCount && <Star size={16} className="star-uncertainty" />}
        </span>
      ))}
    </div>
  );
};

const FM_ATTR_COLUMNS = [
  {
    id: "tecnicos",
    label: "Técnicos",
    keys: [
      "finishing_close",
      "mid_range",
      "three_static",
      "three_off_dribble",
      "deep_range",
      "free_throw",
      "post_scoring",
      "shot_selection",
      "pass_short",
      "pass_long",
      "pass_bounce",
      "ball_control",
      "off_hand_dribble",
      "catching",
    ],
  },
  {
    id: "mentales",
    label: "Mentales",
    keys: [
      "court_vision",
      "creativity",
      "spacing_iq",
      "pnr_read",
      "help_read",
      "clock_mgmt",
      "court_leadership",
      "consistency",
      "work_ethic",
      "mental_tough",
      "professionalism",
      "pressure_res",
      "chemistry",
      "adaptability",
    ],
  },
  {
    id: "fisicos",
    label: "Físicos",
    keys: [
      "acceleration",
      "speed_top",
      "agility_lat",
      "strength_static",
      "vert_run",
      "stamina",
      "fatigue_recov",
      "durability",
    ],
  },
];

const RADAR_AXES = [
  { id: "defense", label: "Defensa", keys: ["def_perimeter", "help_defense", "closeout", "shot_contest", "block"] },
  { id: "physical", label: "Físico", keys: ["strength_static", "strength_explo", "durability", "stamina"] },
  { id: "speed", label: "Velocidad", keys: ["acceleration", "speed_top", "agility_lat", "deceleration"] },
  { id: "vision", label: "Visión", keys: ["court_vision", "pass_short", "pass_long", "creativity"] },
  { id: "attack", label: "Ataque", keys: ["finishing_close", "contact_finishing", "dunking", "off_ball_move"] },
  { id: "tech", label: "Técnica", keys: ["ball_control", "ball_protect", "off_hand_dribble", "triple_threat"] },
  { id: "shooting", label: "Tiro", keys: ["three_static", "three_off_dribble", "deep_range", "mid_range"] },
  { id: "mental", label: "Mental", keys: ["consistency", "clutch", "work_ethic", "professionalism"] },
];

const BADGE_PRIORITY = [
  "Les",
  "San",
  "Aus",
  "NoE",
  "Dsc",
  "Ctr",
  "Tra",
  "Ced",
  "Ofe",
  "Ofr",
  "Int",
  "NoI",
  "Ext",
  "Can",
  "Pais",
  "Via",
  "OK",
];

const sortBadges = (badges) => {
  const list = Array.isArray(badges) ? badges.slice() : [];
  list.sort((a, b) => {
    const pa = BADGE_PRIORITY.indexOf(a.code);
    const pb = BADGE_PRIORITY.indexOf(b.code);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
    return String(a.code || "").localeCompare(String(b.code || ""));
  });
  return list;
};

const getRangeLabel = (range) => {
  if (!range || typeof range.min !== "number" || typeof range.max !== "number") return null;
  const a = to1000(range.min);
  const b = to1000(range.max);
  if (a == null || b == null) return null;
  if (a === b) return String(a);
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  if (min <= 1 && max >= 1000) return "—";
  return `${min}-${max}`;
};

export default function PlayerPage({
  player,
  teamMap,
  contractMap,
  getRosterStatusBadges,
  humanizeId,
  labelFor,
  descFor,
  myTeamId,
  myTeam,
  marketShortlist = [],
  agents,
  agencyMap,
  onBack,
  onOpenTeam,
  onOpenAgent,
  onMakeOffer,
  onAssignScout,
  onAddToShortlist,
  onRemoveFromShortlist,
  onToggleCompare,
  compareIds = [],
  onOpenCompare,
  onPatchPlayer,
}) {
  const [tab, setTab] = useState("perfil");
  const [selectedAxis, setSelectedAxis] = useState(RADAR_AXES[0].id);
  const [compactHeader, setCompactHeader] = useState(false);
  const rafRef = useRef(0);
  const [devFocus, setDevFocus] = useState("General");
  const [devIntensity, setDevIntensity] = useState(60);
  const [devNotes, setDevNotes] = useState("");
  const [matchLogState, setMatchLogState] = useState({ loading: false, error: null, items: [], seasons: [] });
  const [scoutReportState, setScoutReportState] = useState({ loading: false, error: null, report: null });
  const [scoutTierRequest, setScoutTierRequest] = useState(3);

  useEffect(() => {
    setTab("perfil");
    setSelectedAxis(RADAR_AXES[0].id);
  }, [player?.id]);

  useEffect(() => {
    const main = document.querySelector(".main");
    if (!main) return;
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0;
        setCompactHeader((main.scrollTop || 0) > 72);
      });
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      main.removeEventListener("scroll", onScroll);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, []);

  if (!player) {
    return (
      <section className="section">
        <div className="card">
          <div className="card-header">
            <h2>Jugador</h2>
          </div>
          <div className="desc">No hay jugador seleccionado.</div>
          <div style={{ marginTop: 12 }}>
            <button className="subnav-item" onClick={onBack}>
              Volver
            </button>
          </div>
        </div>
      </section>
    );
  }

  const data = player.data || {};
  const bio = data.bio || {};
  const identity = data.identity || {};
  const attrs = data.attributes || {};
  const labelMap = data.attributes_label || {};
  const descMap = data.attributes_desc || {};
  const scoutView = data.scout_view || null;

  const team = data.team_id ? teamMap?.[data.team_id] : null;
  const isFreeAgent = !data.team_id;
  const isMyPlayer = Boolean(myTeamId && data.team_id && String(data.team_id) === String(myTeamId));
  const isInShortlist = useMemo(() => {
    const list = Array.isArray(marketShortlist) ? marketShortlist : [];
    return list.some((item) => String(item?.player_id || item?.playerId || item?.id || "") === String(player.id));
  }, [marketShortlist, player.id]);
  const isInCompare = useMemo(() => {
    const list = Array.isArray(compareIds) ? compareIds : [];
    return list.map(String).includes(String(player.id));
  }, [compareIds, player.id]);
  const contract = contractMap?.[player.id] || null;
  const contractData = contract?.data || {};

  const [transferDraft, setTransferDraft] = useState({ listed: false, asking_price: "" });
  const [noteDraft, setNoteDraft] = useState("");
  const notes = useMemo(() => (Array.isArray(data.notes) ? data.notes : []), [data.notes]);

  useEffect(() => {
    const tr = data.transfer || {};
    const listed = Boolean(tr.listed);
    const ap = tr.asking_price != null ? String(tr.asking_price) : "";
    setTransferDraft({ listed, asking_price: ap });
    setNoteDraft("");
  }, [player.id]);

  useEffect(() => {
    if (tab !== "informes") return;
    if (!player?.id) return;

    let cancelled = false;
    const invoke = window?.pcbasket?.invoke;
    if (!invoke) return;

    const leagueId = String(data.league_id || team?.data?.league_id || myTeam?.data?.league_id || "")
      .toUpperCase()
      .trim();

    const loadMatchLog = async () => {
      setMatchLogState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await invoke("player.match_log", {
          player_id: player.id,
          league_id: leagueId || undefined,
          limit: 18,
        });
        if (cancelled) return;
        if (!res?.ok) {
          setMatchLogState({
            loading: false,
            error: res?.error?.message || res?.error || "No se pudo cargar",
            items: [],
            seasons: [],
          });
          return;
        }
        setMatchLogState({
          loading: false,
          error: null,
          items: Array.isArray(res.items) ? res.items : [],
          seasons: Array.isArray(res.seasons) ? res.seasons : [],
        });
      } catch (err) {
        if (cancelled) return;
        setMatchLogState({ loading: false, error: err?.message || String(err), items: [], seasons: [] });
      }
    };

    const loadScoutReport = async () => {
      if (!myTeamId || isMyPlayer) {
        setScoutReportState({ loading: false, error: null, report: null });
        return;
      }
      setScoutReportState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await invoke("market.get_scout_report", { team_id: myTeamId, player_id: player.id });
        if (cancelled) return;
        if (!res?.ok) {
          setScoutReportState({ loading: false, error: null, report: null });
          return;
        }
        setScoutReportState({ loading: false, error: null, report: res.report || null });
      } catch (err) {
        if (cancelled) return;
        setScoutReportState({ loading: false, error: err?.message || String(err), report: null });
      }
    };

    void loadMatchLog();
    void loadScoutReport();

    return () => {
      cancelled = true;
    };
  }, [tab, player?.id, data.league_id, team?.id, myTeamId, myTeam?.id, myTeam?.data?.league_id, isMyPlayer]);
  const isScholarship = ["scholarship", "beca", "amateur", "non_pro", "non-pro"].includes(
    String(contractData?.type || "").toLowerCase(),
  );
  const showSalaryBlock = Boolean(!isFreeAgent && contract && contractData);
  const showExpectedBlock = Boolean(isFreeAgent);
  const showNoContractBlock = Boolean(!isFreeAgent && !contract);

  const expectedWage = expectedWageFromMarketValue(data.market_value, data.league_id || team?.data?.league_id);
  const expectedWageLabel = formatMoney(expectedWage, "€");

  const salaryLabel = isScholarship ? "Beca" : contractData?.salary != null ? formatMoney(contractData.salary, contractData.currency) : "--";
  const endDate = contractData?.end_date || contractData?.endDate || "";

  const moraleValue = Number(data.morale ?? data?.morale?.happiness ?? 0);
  const moraleLabel = moraleValue >= 75 ? "Excelente" : moraleValue >= 60 ? "Buena" : moraleValue >= 40 ? "Neutral" : "Mala";
  const moraleClass = moraleValue >= 75 ? "ok" : moraleValue >= 60 ? "info" : moraleValue >= 40 ? "neutral" : "warn";

  const condition = clamp(0, 100 - Number(data.health?.fatigue || 0), 100);
  const matchFitness = clamp(0, Number(data.health?.match_fitness ?? data.health?.matchFitness ?? 0), 100);

  const badges = useMemo(() => sortBadges(getRosterStatusBadges ? getRosterStatusBadges(player) : []), [player]);
  const badgeMain = badges.length > 6 ? badges.slice(0, 5) : badges;
  const badgeExtra = badges.length > 6 ? badges.slice(5) : [];

  const overall1000 = useMemo(() => {
    const values = FM_ATTR_COLUMNS
      .flatMap((col) => col.keys.map((k) => to1000(attrs?.[k])))
      .filter((v) => v != null);
    if (!values.length) return 500;
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  }, [attrs]);

  const potential1000 = to1000(data.potential);
  const caStars = clamp(0, overall1000 / 200, 5);
  const cpStars = clamp(0, (potential1000 ?? overall1000) / 200, 5);
  const uncertainty = scoutView ? clamp(0, (Number(scoutView.tier || 6) - 1) / 5, 1) : 0;
  const starVariant = bio.age && Number(bio.age) < 20 ? "silver" : "gold";

  const axisData = useMemo(() => {
    const showRadar = !scoutView || scoutView.source === "report";
    const axes = RADAR_AXES.map((axis) => {
      const values = axis.keys.map((k) => Number(attrs?.[k])).filter((v) => Number.isFinite(v));
      const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
      return { ...axis, value1000: avg == null ? null : to1000(avg) };
    });
    return { showRadar, axes };
  }, [attrs, scoutView]);

  const selectedAxisDef = RADAR_AXES.find((a) => a.id === selectedAxis) || RADAR_AXES[0];

  const agent = data.agent_id ? agents?.find((a) => String(a.agent_id) === String(data.agent_id)) : null;
  const agency = data.agency_id ? agencyMap?.[data.agency_id] : null;

  const initialPos = normalizePosition(bio.pos || data.position || "PG");
  const [rolePos, setRolePos] = useState(initialPos);
  const [roleDuty, setRoleDuty] = useState("Apoyo");
  const [roleRole, setRoleRole] = useState(getDefaultRoleForPosition(initialPos));

  useEffect(() => {
    const storageKey = `pcbasket.dev.player.${player.id}`;
    try {
      const raw = window.localStorage?.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.focus === "string") setDevFocus(parsed.focus);
        const intensity = Number(parsed.intensity);
        if (Number.isFinite(intensity)) setDevIntensity(Math.max(0, Math.min(100, intensity)));
        if (typeof parsed.notes === "string") setDevNotes(parsed.notes);
      } else {
        setDevFocus("General");
        setDevIntensity(60);
        setDevNotes("");
      }
    } catch {
      setDevFocus("General");
      setDevIntensity(60);
      setDevNotes("");
    }
  }, [player.id]);

  useEffect(() => {
    const storageKey = `pcbasket.dev.player.${player.id}`;
    try {
      window.localStorage?.setItem(
        storageKey,
        JSON.stringify({ focus: devFocus, intensity: devIntensity, notes: devNotes }),
      );
    } catch {
      // ignore
    }
  }, [player.id, devFocus, devIntensity, devNotes]);

  useEffect(() => {
    const nextPos = normalizePosition(bio.pos || data.position || "PG");
    setRolePos(nextPos);
    setRoleRole(getDefaultRoleForPosition(nextPos));
    setRoleDuty("Apoyo");
  }, [player.id]);

  const roleOptions = useMemo(() => {
    const pos = TACTICAL_POSITIONS.includes(rolePos) ? rolePos : "PG";
    return TACTICAL_ROLES_BY_POS[pos] || [];
  }, [rolePos]);

  useEffect(() => {
    if (!roleOptions.includes(roleRole)) {
      setRoleRole(getDefaultRoleForPosition(rolePos));
    }
  }, [roleOptions]);

  const roleHighlights = useMemo(() => {
    const weights = getRoleAttributeWeights(roleRole, roleDuty);
    const entries = Object.entries(weights).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const key = new Set(entries.slice(0, 6).map(([k]) => k));
    const secondary = new Set(entries.slice(6, 12).map(([k]) => k));
    return { key, secondary };
  }, [roleRole, roleDuty]);

  const axisFocus = useMemo(() => {
    const def = RADAR_AXES.find((a) => a.id === selectedAxis) || RADAR_AXES[0];
    return new Set(def.keys);
  }, [selectedAxis]);

  const marketValueLabel = useMemo(() => {
    const rangeLabel = formatMoneyRange(scoutView?.ranges?.market_value, "€");
    return rangeLabel || formatMoney(data.market_value, "€");
  }, [scoutView, data.market_value]);

  const attrDisplay = (key) => {
    const value1000 = to1000(attrs?.[key]);
    const rangeLabel =
      scoutView?.source === "baseline"
        ? getRangeLabel(scoutView?.ranges?.attributes?.[key])
        : null;
    const display = rangeLabel || (value1000 == null ? "—" : value1000);
    return { value1000, display };
  };

  const renderHeader = () => (
    <div className={`player-header ${compactHeader ? "compact" : ""}`}>
      <div className="player-header-left">
        <button className="player-back" onClick={onBack} title="Volver">
          <ChevronLeft size={18} />
        </button>
        <div className="player-avatar" aria-hidden>
          <div className="player-avatar-silhouette" />
          {bio.nationality && <div className="player-flag">{bio.nationality}</div>}
          {!isFreeAgent && <div className="player-club">{team?.short || team?.name?.slice(0, 3) || "CLB"}</div>}
          {isFreeAgent && <div className="player-club free">FA</div>}
        </div>
        <div className="player-identity">
          <div className="player-name">{player.name}</div>
          <div className="player-sub">
            {bio.age != null ? `${bio.age} años` : "—"} {bio.birthplace ? `(${bio.birthplace})` : ""} ·{" "}
            {team?.name || "Agente Libre"} · {bio.pos || data.position || "—"}
          </div>
          {compactHeader && (
            <div className="player-compact-meta">
              <span className="pill subtle">OVR {overall1000}</span>
              <Stars value={caStars} uncertainty={uncertainty} variant={starVariant} />
            </div>
          )}
        </div>
      </div>

      {!compactHeader && (
        <div className="player-header-center">
          <div className="player-kpi">
            <div className="kpi-label">Valor</div>
            <div className="kpi-value mono">{marketValueLabel}</div>
          </div>
          {showSalaryBlock ? (
            <>
              <div className="player-kpi">
                <div className="kpi-label">Sueldo</div>
                <div className="kpi-value mono">{salaryLabel}</div>
              </div>
              <div className="player-kpi">
                <div className="kpi-label">Caduca</div>
                <div className="kpi-value mono">{endDate || "—"}</div>
              </div>
            </>
          ) : showExpectedBlock ? (
            <div className="player-kpi">
              <div className="kpi-label">Expectativas</div>
              <div className="kpi-value mono">{expectedWageLabel} / año</div>
            </div>
          ) : showNoContractBlock ? (
            <div className="player-kpi">
              <div className="kpi-label">Contrato</div>
              <div className="kpi-value mono">—</div>
            </div>
          ) : null}
        </div>
      )}

      {!compactHeader && (
        <div className="player-header-right">
          <div className="player-state-row">
            <div className="pill">{data.playing_time || data.rotation_slot || "Tiempo juego: —"}</div>
            <div className="player-meters">
              <span className="meter" title={`Condición: ${condition}%`}>
                <Heart size={14} />
                <span className="mono">{condition}</span>
              </span>
              <span className="meter" title={`Ritmo de partido: ${matchFitness}%`}>
                <BatteryMedium size={14} />
                <span className="mono">{matchFitness}</span>
              </span>
              <span className={`pill morale ${moraleClass}`}>Moral: {moraleLabel}</span>
            </div>
          </div>
          <div className="player-badges" title={badgeExtra.length ? badgeExtra.map((b) => b.label).join(", ") : ""}>
            {badgeMain.map((b) => (
              <span key={b.code} className={`player-badge tone-${b.tone || "neutral"}`}>
                {b.code}
              </span>
            ))}
            {badgeExtra.length > 0 && <span className="player-badge tone-neutral">+{badgeExtra.length}</span>}
          </div>
          <div className="player-header-actions">
            {team?.id && (
              <button type="button" className="subnav-item secondary" onClick={() => onOpenTeam?.(team.id)}>
                Club
              </button>
            )}
            {agent?.agent_id && (
              <button type="button" className="subnav-item secondary" onClick={() => onOpenAgent?.(agent.agent_id)}>
                Agente
              </button>
            )}

            {!isMyPlayer && (
              <>
                <button type="button" className="subnav-item secondary" onClick={() => onAssignScout?.(player.id)}>
                  Scout
                </button>
                <button
                  type="button"
                  className="subnav-item secondary"
                  onClick={() => (isInShortlist ? onRemoveFromShortlist?.(player.id) : onAddToShortlist?.(player.id))}
                >
                  {isInShortlist ? "Quitar objetivo" : "Añadir objetivo"}
                </button>
                <button type="button" className="subnav-item primary" onClick={() => onMakeOffer?.(player.id)}>
                  Ofertar
                </button>
              </>
            )}

            <button
              type="button"
              className="subnav-item secondary"
              onClick={() => onToggleCompare?.(player.id)}
              title="Añadir/Quitar del comparador"
            >
              {isInCompare ? "✓ Comparar" : "Comparar"}
            </button>
            <button type="button" className="subnav-item secondary" onClick={() => onOpenCompare?.()} disabled={!compareIds?.length}>
              Ver comparador
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderTabs = () => (
    <div className="player-tabs">
      {[
        ["perfil", "Perfil"],
        ["contrato", "Contrato"],
        ["traspaso", "Traspaso"],
        ["desarrollo", "Desarrollo"],
        ["informes", "Informes"],
        ["historial", "Historial"],
      ].map(([id, label]) => (
        <button key={id} className={`player-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
          {label}
        </button>
      ))}
    </div>
  );

  const renderRadar = () => {
    if (!axisData.showRadar) {
      return (
        <div className="card player-panel">
          <div className="card-header">
            <h3>Radar</h3>
            <span className="pill warn">Sin ojeo</span>
          </div>
          <div className="desc">
            El radar se desbloquea con un informe de ojeador. Mientras tanto, verás rangos en los atributos.
          </div>
        </div>
      );
    }

    const size = 260;
    const center = size / 2;
    const radius = 92;
    const labelRadius = 118;
    const levels = 4;
    const angleFor = (i) => (-Math.PI / 2) + (i * (2 * Math.PI / axisData.axes.length));
    const pointFor = (value1000, i, r = radius) => {
      const v = clamp(0, (Number(value1000) || 0) / 1000, 1);
      const angle = angleFor(i);
      return { x: center + Math.cos(angle) * r * v, y: center + Math.sin(angle) * r * v };
    };
    const polygonPoints = axisData.axes
      .map((axis, i) => {
        const p = pointFor(axis.value1000, i);
        return `${p.x},${p.y}`;
      })
      .join(" ");

    return (
      <div className="card player-panel player-radar">
        <div className="card-header">
          <h3>Radar</h3>
          <span className="pill subtle">Click para filtrar</span>
        </div>
        <div className="player-radar-wrap">
          <svg className="radar" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {[...Array(levels)].map((_, level) => {
              const r = radius * ((level + 1) / levels);
              const ringPoints = axisData.axes
                .map((_, i) => {
                  const angle = angleFor(i);
                  const x = center + Math.cos(angle) * r;
                  const y = center + Math.sin(angle) * r;
                  return `${x},${y}`;
                })
                .join(" ");
              return <polygon key={r} points={ringPoints} className="radar-grid" />;
            })}
            {axisData.axes.map((_, i) => {
              const angle = angleFor(i);
              const x = center + Math.cos(angle) * radius;
              const y = center + Math.sin(angle) * radius;
              return <line key={`axis-${i}`} x1={center} y1={center} x2={x} y2={y} className="radar-axis" />;
            })}
            <polygon points={polygonPoints} className="radar-shape" />
          </svg>
          {axisData.axes.map((axis, i) => {
            const angle = angleFor(i);
            const x = center + Math.cos(angle) * labelRadius;
            const y = center + Math.sin(angle) * labelRadius;
            return (
              <button
                key={axis.id}
                className={`radar-label ${selectedAxis === axis.id ? "active" : ""}`}
                style={{ left: `${x}px`, top: `${y}px` }}
                onClick={() => setSelectedAxis(axis.id)}
              >
                {axis.label}
                <span className="radar-avg mono">{axis.value1000 ?? "—"}</span>
              </button>
            );
          })}
        </div>
        <div className="player-radar-footer desc">
          Sección activa: <strong>{selectedAxisDef.label}</strong>
        </div>
      </div>
    );
  };

  const renderAttributes = () => (
    <div className="card player-panel">
      <div className="card-header">
        <h3>Atributos</h3>
        <div className="player-attr-toolbar">
          <span className="pill subtle">Escala: 1-1000</span>
          <label className="inline-field">
            Pos
            <select value={rolePos} onChange={(e) => setRolePos(e.target.value)}>
              {TACTICAL_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            Rol
            <select value={roleRole} onChange={(e) => setRoleRole(e.target.value)}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            Deber
            <select value={roleDuty} onChange={(e) => setRoleDuty(e.target.value)}>
              {TACTICAL_DUTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          {scoutView?.source === "baseline" && <span className="pill warn">Datos estimados</span>}
        </div>
      </div>
      <div className="player-attr-grid">
        {FM_ATTR_COLUMNS.map((col) => (
          <div key={col.id} className="attr-col">
            <div className="attr-col-title">{col.label}</div>
            <div className="attr-list">
              {[...col.keys].sort((a, b) => {
                const aa = axisFocus.has(a) ? 0 : 1;
                const bb = axisFocus.has(b) ? 0 : 1;
                return aa - bb;
              }).map((key) => {
                const label = labelMap?.[key] || humanizeId?.(key) || key;
                const desc = descMap?.[key] || "";
                const item = attrDisplay(key);
                const toneClass = getAttrToneClass(item.value1000);
                const keyClass = roleHighlights.key.has(key) ? "key" : roleHighlights.secondary.has(key) ? "secondary" : "";
                const axisClass = axisFocus.has(key) ? "axis" : "";
                return (
                  <div key={key} className={`attr-row ${toneClass} ${keyClass} ${axisClass}`} title={desc || label}>
                    <span className="attr-label">{label}</span>
                    <span className="attr-value mono">{item.display}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPositions = () => (
    <div className="card player-panel">
      <div className="card-header">
        <h3>Posiciones</h3>
        <span className="pill subtle">Mano: {bio.hand || "—"}</span>
      </div>
      {(() => {
        const primary = normalizePosition(bio.pos || data.position || "PG");
        const computePositionRating = (pos) => {
          const roles = TACTICAL_ROLES_BY_POS[pos] || [];
          const best = roles.reduce((bestScore, role) => {
            const score = calcRoleSuitability(player, role, pos, "Apoyo");
            return Math.max(bestScore, Number(score) || 0);
          }, 0);
          const normalized = clamp(1, Math.round(((clamp(40, best || 40, 97) - 40) / 57) * 19) + 1, 20);
          return normalized;
        };
        const toneFor = (v) => {
          if (v >= 20) return "pos-natural";
          if (v >= 15) return "pos-good";
          if (v >= 10) return "pos-ok";
          if (v >= 5) return "pos-low";
          return "pos-bad";
        };
        const labelForPos = (v) => {
          if (v >= 20) return "Natural";
          if (v >= 15) return "Eficaz";
          if (v >= 10) return "Competente";
          if (v >= 5) return "Poco convincente";
          return "Inadecuado";
        };

        const handValue = to1000(attrs?.off_hand_dribble);
        const handStrength =
          handValue == null ? "—" : handValue >= 800 ? "Muy fuerte" : handValue >= 600 ? "Fuerte" : handValue >= 400 ? "Aceptable" : "Débil";

        const POS_LAYOUT = {
          PG: { x: 50, y: 18 },
          SG: { x: 78, y: 34 },
          SF: { x: 22, y: 34 },
          PF: { x: 66, y: 58 },
          C: { x: 50, y: 74 },
        };

        const positions = ["PG", "SG", "SF", "PF", "C"].map((pos) => {
          const v20 = computePositionRating(pos);
          const v = clamp(1, Math.round((v20 / 20) * 1000), 1000);
          return {
            pos,
            value: v,
            tone: toneFor(v20),
            label: labelForPos(v20),
            ...POS_LAYOUT[pos],
          };
        });

        return (
          <>
            <div className="player-court">
              <svg className="player-court-svg" viewBox="0 0 100 100" aria-hidden>
                <rect x="6" y="6" width="88" height="88" rx="6" className="court-line" />
                <line x1="6" y1="12" x2="94" y2="12" className="court-line faint" />
                <rect x="32" y="58" width="36" height="30" rx="2" className="court-line faint" />
                <circle cx="50" cy="58" r="10" className="court-line faint" />
                <path d="M 22 88 A 28 28 0 0 1 78 88" className="court-line faint" />
                <circle cx="50" cy="88" r="2" className="court-line" />
                <rect x="46" y="86" width="8" height="1.8" className="court-line" />
              </svg>

              {positions.map((p) => (
                <button
                  key={p.pos}
                  type="button"
                  className={`pos-dot ${p.tone} ${p.pos === primary ? "active" : ""}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  title={`${p.pos} · ${p.label} (${p.value}/1000)`}
                  onClick={() => {
                    setRolePos(p.pos);
                    setRoleRole(getDefaultRoleForPosition(p.pos));
                  }}
                >
                  <span className="pos-dot-code">{p.pos}</span>
                  <span className="pos-dot-val mono">{p.value}</span>
                </button>
              ))}
            </div>

            <div className="player-pos-meta">
              <div className="detail-list">
                <div>Posición principal: <span className="mono">{primary}</span></div>
                <div>Mano dominante: <span className="mono">{bio.hand || "—"}</span></div>
                <div>Mano no dominante: <span className="mono">{handStrength}</span></div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );

  const renderReport = () => (
    <div className="card player-panel">
      <div className="card-header">
        <h3>Informe</h3>
        <span className="pill subtle">{scoutView?.source === "report" ? "Ojeador" : "Estimado"}</span>
      </div>
      <div className="player-report-stars">
        <div className="report-line">
          <span className="report-label">Calidad actual (CA)</span>
          <Stars value={caStars} uncertainty={uncertainty} variant={starVariant} />
        </div>
        <div className="report-line">
          <span className="report-label">Calidad potencial (CP)</span>
          <Stars value={cpStars} uncertainty={uncertainty} variant={starVariant} />
        </div>
      </div>
      {(() => {
        const pros = [];
        const cons = [];
        const n = (k) => Number(attrs?.[k]);
        if (n("three_static") >= 800 || n("three_off_dribble") >= 800) pros.push("Gran tiro exterior");
        if (n("court_vision") >= 750 || n("pass_short") >= 750) pros.push("Visión y pase");
        if (n("help_defense") >= 780 || n("def_perimeter") >= 780) pros.push("Impacto defensivo");
        if (n("work_ethic") >= 700) pros.push("Alta ética de trabajo");
        if (n("durability") <= 350) cons.push("Propenso a lesiones");
        if (n("consistency") <= 350) cons.push("Irregularidad");
        if (n("clutch") <= 350) cons.push("Rinde peor en momentos decisivos");
        if (n("professionalism") <= 350) cons.push("Baja profesionalidad");
        if (!pros.length && !cons.length) return <div className="desc">Sin señales claras (faltan datos o el perfil es equilibrado).</div>;
        return (
          <div className="player-proscons">
            <div>
              <div className="section-title">Pros</div>
              {pros.length ? pros.map((p) => <div key={p} className="pros-item ok">+ {p}</div>) : <div className="desc">—</div>}
            </div>
            <div>
              <div className="section-title">Contras</div>
              {cons.length ? cons.map((c) => <div key={c} className="pros-item warn">- {c}</div>) : <div className="desc">—</div>}
            </div>
          </div>
        );
      })()}
    </div>
  );

  const renderTraits = () => (
    <div className="card player-panel">
      <div className="card-header">
        <h3>Rasgos & Datos</h3>
      </div>
      <div className="detail-list">
        <div>Altura: {bio.height_cm ?? "—"} cm</div>
        <div>Peso: {bio.weight_kg ?? "—"} kg</div>
        <div>Nacionalidad: {bio.nationality ?? "—"}</div>
        <div title={identity.arquetipo_desc || ""}>Arquetipo: {identity.arquetipo_label || labelFor?.("arche", identity.arquetipo) || "—"}</div>
        <div title={identity.mentalidad_desc || ""}>Mentalidad: {identity.mentalidad_label || labelFor?.("mental", identity.mentalidad) || "—"}</div>
      </div>
      <div className="detail-tags" style={{ marginTop: 10 }}>
        {(data.traits || []).map((t, idx) => (
          <span
            key={t}
            className="chip muted"
            title={data.traits_desc?.[idx] || data.traits_label?.[idx] || descFor?.("trait", t, t) || t}
          >
            {data.traits_label?.[idx] || labelFor?.("trait", t) || t}
          </span>
        ))}
        {(data.perks || []).map((p, idx) => (
          <span
            key={p}
            className="chip muted"
            title={data.perks_desc?.[idx] || data.perks_label?.[idx] || descFor?.("perk", p, p) || p}
          >
            {data.perks_label?.[idx] || labelFor?.("perk", p) || p}
          </span>
        ))}
        {(data.traits || []).length === 0 && (data.perks || []).length === 0 && <span className="desc">Sin rasgos.</span>}
      </div>
      <div className="player-agent-line">
        <span className="desc">
          Agente:{" "}
          {agent ? (
            <button className="link mono" onClick={() => onOpenAgent && onOpenAgent(agent.agent_id)}>
              {agent.name}
            </button>
          ) : (
            data.agent_name || "—"
          )}
          {agency ? (
            <>
              {" "}
              · Agencia: <span className="mono">{agency.name}</span>
            </>
          ) : null}
        </span>
        {team ? (
          <button className="subnav-item secondary" onClick={() => onOpenTeam && onOpenTeam(team.id)}>
            Ver equipo
          </button>
        ) : null}
      </div>
    </div>
  );

  const renderPerfil = () => (
    <div className="player-grid">
      <div className="player-col span-6">{renderAttributes()}</div>
      <div className="player-col span-3">{renderPositions()}</div>
      <div className="player-col span-3">{renderRadar()}</div>
      <div className="player-col span-6">{renderTraits()}</div>
      <div className="player-col span-6">{renderReport()}</div>
    </div>
  );

  const renderContrato = () => {
    if (!contract) {
      return (
        <div className="card player-panel">
          <div className="card-header">
            <h3>Contrato</h3>
          </div>
          <div className="desc">{isFreeAgent ? "Agente libre. Sin contrato registrado." : "Sin contrato registrado."}</div>
        </div>
      );
    }
    const clauseItems = contractData?.clauses_detail || (contractData?.clauses || []).map((id) => ({ id, label: id }));
    const bonusItems = contractData?.bonuses_detail || (contractData?.bonuses || []).map((id) => ({ id, label: id }));
    return (
      <div className="player-grid">
        <div className="player-col span-6">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Info contrato</h3>
            </div>
            <div className="detail-list">
              <div>Estado: {contractData.status || "—"}</div>
              <div>Inicio: {contractData.start_date || "—"}</div>
              <div>Fin: {contractData.end_date || "—"}</div>
              <div>Años: {contractData.years || "—"}</div>
              <div>Tipo: {contractData.type || "—"}</div>
              <div>Sueldo base: {salaryLabel}</div>
            </div>
          </div>
        </div>
        <div className="player-col span-6">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Cláusulas</h3>
              <span className="pill subtle">{clauseItems.length}</span>
            </div>
            <div className="detail-tags">
              {clauseItems.length === 0 ? (
                <span className="desc">Sin cláusulas.</span>
              ) : (
                clauseItems.map((c) => (
                  <span key={c.id || c.label} className="chip muted" title={c.desc || c.label}>
                    {c.label || c.id}
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="card player-panel" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Bonus</h3>
              <span className="pill subtle">{bonusItems.length}</span>
            </div>
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
      </div>
    );
  };

  const renderPlaceholder = (title, text) => (
    <div className="card player-panel">
      <div className="card-header">
        <h3>{title}</h3>
      </div>
      <div className="desc">{text}</div>
    </div>
  );

  const renderTraspaso = () => {
    const market = data.market || {};
    const transfer = data.transfer || {};
    const loan = data.loan || {};
    const status = data.status || {};
    const interest = market.interested_clubs || market.watchers || market.interest || [];
    const offers = market.offers || [];

    const booleanFlag = (value) => Boolean(value) && value !== "0" && value !== "false";
    const transferListed =
      booleanFlag(market.transfer_listed) ||
      booleanFlag(transfer.listed) ||
      booleanFlag(transfer.transfer_listed) ||
      booleanFlag(status.transfer_listed);
    const loanListed = booleanFlag(market.loan_listed) || booleanFlag(loan.listed) || booleanFlag(loan.loan_listed);

    const askingPrice = transfer.asking_price ?? transfer.askingPrice ?? null;
    const askingLabel = askingPrice != null ? formatMoney(askingPrice, "€") : "—";

    const saveTransfer = async () => {
      if (!onPatchPlayer) return;
      const nextPrice = transferDraft.asking_price.trim() ? Number(transferDraft.asking_price) : null;
      await onPatchPlayer(player.id, {
        transfer: {
          listed: Boolean(transferDraft.listed),
          asking_price: Number.isFinite(nextPrice) ? Math.max(0, Math.round(nextPrice)) : null,
        },
      });
    };

    const addNote = async () => {
      if (!onPatchPlayer) return;
      const text = String(noteDraft || "").trim();
      if (!text) return;
      await onPatchPlayer(player.id, { notes_append: text });
      setNoteDraft("");
    };

    return (
      <div className="player-grid">
        <div className="player-col span-6">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Estado</h3>
              <span className="pill subtle">{team?.name || "Agente Libre"}</span>
            </div>
            <div className="detail-list">
              <div>Transferible: <span className="mono">{transferListed ? "Sí" : "No"}</span></div>
              <div>Precio pedido: <span className="mono">{askingLabel}</span></div>
              <div>Cedible: <span className="mono">{loanListed ? "Sí" : "No"}</span></div>
              <div>Interés: <span className="mono">{Array.isArray(interest) ? interest.length : market.interest ? "Sí" : "No"}</span></div>
              <div>Ofertas: <span className="mono">{Array.isArray(offers) ? offers.length : market.offer_received ? "Sí" : "No"}</span></div>
            </div>
          </div>

          <div className="card player-panel" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Acciones</h3>
              <span className="pill subtle">{isMyPlayer ? "Mi jugador" : "Rival"}</span>
            </div>

            {isMyPlayer ? (
              <div className="detail-list">
                <label className="simulate-option" style={{ justifyContent: "space-between" }}>
                  <span>Listar como transferible</span>
                  <input
                    type="checkbox"
                    checked={Boolean(transferDraft.listed)}
                    onChange={(e) => setTransferDraft((p) => ({ ...p, listed: e.target.checked }))}
                  />
                </label>
                <label>
                  Precio pedido
                  <input
                    type="number"
                    min="0"
                    step="50000"
                    value={transferDraft.asking_price}
                    onChange={(e) => setTransferDraft((p) => ({ ...p, asking_price: e.target.value }))}
                  />
                </label>
                <button className="subnav-item primary" type="button" onClick={saveTransfer} disabled={!onPatchPlayer}>
                  Guardar
                </button>
              </div>
            ) : (
              <div className="detail-list">
                <div className="desc">La oferta y el ojeo están arriba (Scout / Objetivo / Ofertar).</div>
              </div>
            )}
          </div>
        </div>

        <div className="player-col span-6">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Cláusulas de mercado</h3>
            </div>
            <div className="detail-list">
              <div>Valor estimado: <span className="mono">{marketValueLabel}</span></div>
              <div>Salario esperado: <span className="mono">{expectedWageLabel} / año</span></div>
              <div>Agente: <span className="mono">{agent?.name || data.agent_name || "—"}</span></div>
            </div>
          </div>

          <div className="card player-panel" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Notas (GM)</h3>
              <span className="pill subtle">{notes.length}</span>
            </div>
            <div className="detail-list">
              <label>
                Nueva nota
                <textarea rows={3} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="subnav-item primary" type="button" onClick={addNote} disabled={!onPatchPlayer}>
                  Añadir nota
                </button>
              </div>
              {notes.length === 0 ? (
                <div className="desc">Sin notas.</div>
              ) : (
                <div className="detail-list" style={{ marginTop: 8 }}>
                  {notes.slice(0, 12).map((n, idx) => (
                    <div key={n.ts || idx}>
                      <span className="mono">
                        {n.ts ? new Date(Number(n.ts) * 1000).toLocaleDateString("es-ES") : "—"}
                      </span>{" "}
                      · {n.text || "—"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDesarrollo = () => {
    const focusOptions = [
      "General",
      "Tiro",
      "Finalización",
      "Playmaking",
      "Defensa",
      "Físico",
      "Manejo",
      "Mentalidad",
    ];

    return (
      <div className="player-grid">
        <div className="player-col span-6">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Entrenamiento individual</h3>
              <span className="pill subtle">Persistencia local (MVP)</span>
            </div>
            <div className="detail-list">
              <div>
                Foco:{" "}
                <select value={devFocus} onChange={(e) => setDevFocus(e.target.value)}>
                  {focusOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                Intensidad:{" "}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={devIntensity}
                  onChange={(e) => setDevIntensity(Number(e.target.value))}
                />{" "}
                <span className="mono">{Math.round(devIntensity)}</span>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label className="desc">
                Notas
                <textarea rows={3} value={devNotes} onChange={(e) => setDevNotes(e.target.value)} />
              </label>
            </div>
          </div>
        </div>
        <div className="player-col span-6">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Tutela (Mentoría)</h3>
            </div>
            <div className="desc">
              Próximo: asignar mentor/mentees, impactos en personalidad/traits y seguimiento semanal.
            </div>
          </div>
          <div className="card player-panel" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Tácticas (Desarrollo)</h3>
            </div>
            <div className="desc">
              Próximo: rol a desarrollar, aprendizaje por posición y objetivos por temporada.
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderInformes = () => {
    const health = data.health || {};
    const injuryHistory = health.injury_history || [];
    const scoutTier = scoutView?.tier || data.scout?.tier || null;
    return (
      <div className="player-grid">
        <div className="player-col span-6">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Médico</h3>
            </div>
            <div className="detail-list">
              <div>Fatiga: <span className="mono">{health.fatigue ?? "—"}</span></div>
              <div>Estado lesión: <span className="mono">{health.injury_status || "—"}</span></div>
              <div>Durabilidad: <span className="mono">{to1000(attrs?.durability) ?? "—"}</span></div>
              <div>Riesgo (heurístico): <span className="mono">{to1000(attrs?.durability) != null && to1000(attrs?.durability) < 350 ? "Alto" : "Normal"}</span></div>
            </div>
          </div>
          <div className="card player-panel" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Historial de lesiones</h3>
              <span className="pill subtle">{Array.isArray(injuryHistory) ? injuryHistory.length : 0}</span>
            </div>
            {Array.isArray(injuryHistory) && injuryHistory.length ? (
              <div className="detail-list">
                {injuryHistory.slice(0, 8).map((entry, idx) => (
                  <div key={entry.id || idx}>
                    {entry.label || "Lesión"} · {entry.start_date || "—"} → {entry.end_date || "—"} ({entry.days || "?"}d)
                  </div>
                ))}
              </div>
            ) : (
              <div className="desc">Sin historial.</div>
            )}
          </div>
        </div>
        <div className="player-col span-6">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Ojeo</h3>
            </div>
            <div className="detail-list">
              <div>Tier: <span className="mono">{scoutTier ?? "—"}</span></div>
              <div>Fuente: <span className="mono">{scoutView?.source || "—"}</span></div>
              <div>Conocimiento: <span className="mono">{scoutView?.source === "report" ? "Completo" : scoutView ? "Estimado" : "Propio"}</span></div>
            </div>
            <div className="desc" style={{ marginTop: 8 }}>
              Próximo: forma (últimos partidos), estadísticas avanzadas y comparación con plantilla.
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderInformesFmLike = () => {
    const health = data.health || {};
    const injuryHistory = health.injury_history || [];
    const scoutTier = scoutView?.tier || data.scout?.tier || null;
    const items = Array.isArray(matchLogState.items) ? matchLogState.items : [];
    const last5 = items.slice(0, 5);
    const season = (Array.isArray(matchLogState.seasons) ? matchLogState.seasons : [])[0] || null;

    const avg = (key) => {
      if (!last5.length) return "—";
      const total = last5.reduce((s, it) => s + Number(it?.stats?.[key] || 0), 0);
      return Math.round((total / last5.length) * 10) / 10;
    };

    const fmtEpoch = (ts) => {
      const n = Number(ts);
      if (!Number.isFinite(n) || n <= 0) return "—";
      const d = new Date(n * 1000);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("es-ES");
    };

    const fmtMatchDate = (entry) => {
      const raw = entry?.date;
      if (typeof raw === "string" && raw.trim()) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("es-ES");
        return raw;
      }
      return fmtEpoch(entry?.created_at);
    };

    const requestScout = async () => {
      if (!onAssignScout || !player?.id) return;
      await onAssignScout(player.id, Number(scoutTierRequest) || 3);
      if (window?.pcbasket?.invoke && myTeamId && !isMyPlayer) {
        try {
          setScoutReportState((s) => ({ ...s, loading: true, error: null }));
          const res = await window.pcbasket.invoke("market.get_scout_report", { team_id: myTeamId, player_id: player.id });
          if (res?.ok) setScoutReportState({ loading: false, error: null, report: res.report || null });
          else setScoutReportState({ loading: false, error: null, report: null });
        } catch (err) {
          setScoutReportState({ loading: false, error: err?.message || String(err), report: null });
        }
      }
    };

    return (
      <div className="player-grid">
        <div className="player-col span-4">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Médico</h3>
            </div>
            <div className="detail-list">
              <div>Fatiga: <span className="mono">{health.fatigue ?? "—"}</span></div>
              <div>Estado lesión: <span className="mono">{health.injury_status || "—"}</span></div>
              <div>Durabilidad: <span className="mono">{to1000(attrs?.durability) ?? "—"}</span></div>
              <div>Riesgo (heurístico): <span className="mono">{to1000(attrs?.durability) != null && to1000(attrs?.durability) < 350 ? "Alto" : "Normal"}</span></div>
            </div>
          </div>
          <div className="card player-panel" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Historial de lesiones</h3>
              <span className="pill subtle">{Array.isArray(injuryHistory) ? injuryHistory.length : 0}</span>
            </div>
            {Array.isArray(injuryHistory) && injuryHistory.length ? (
              <div className="detail-list">
                {injuryHistory.slice(0, 8).map((entry, idx) => (
                  <div key={entry.id || idx}>
                    {entry.label || "Lesión"} · {entry.start_date || "—"} → {entry.end_date || "—"} ({entry.days || "?"}d)
                  </div>
                ))}
              </div>
            ) : (
              <div className="desc">Sin historial.</div>
            )}
          </div>
        </div>

        <div className="player-col span-4">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Forma (últimos 5)</h3>
              {matchLogState.loading ? <span className="pill subtle">Cargando...</span> : null}
            </div>
            {matchLogState.error ? (
              <div className="desc">Error: <span className="mono">{String(matchLogState.error)}</span></div>
            ) : last5.length ? (
              <div className="detail-list">
                <div>PTS: <span className="mono">{avg("pts")}</span></div>
                <div>REB: <span className="mono">{avg("reb")}</span></div>
                <div>AST: <span className="mono">{avg("ast")}</span></div>
                <div>MIN: <span className="mono">{avg("min")}</span></div>
                <div>eFG%: <span className="mono">{avg("efg")}</span></div>
                <div>TS%: <span className="mono">{avg("ts")}</span></div>
              </div>
            ) : (
              <div className="desc">Sin partidos recientes registrados.</div>
            )}
          </div>

          <div className="card player-panel" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Temporada</h3>
              {season ? <span className="pill subtle">{season.season_id ?? "—"}</span> : <span className="pill subtle">—</span>}
            </div>
            {season ? (
              <div className="detail-list">
                <div>GP: <span className="mono">{season.gp ?? "—"}</span></div>
                <div>PPG: <span className="mono">{season.ppg ?? "—"}</span></div>
                <div>RPG: <span className="mono">{season.rpg ?? "—"}</span></div>
                <div>APG: <span className="mono">{season.apg ?? "—"}</span></div>
                <div>eFG%: <span className="mono">{season.efg ?? "—"}</span></div>
                <div>TS%: <span className="mono">{season.ts ?? "—"}</span></div>
              </div>
            ) : (
              <div className="desc">Sin agregados de temporada.</div>
            )}
          </div>
        </div>

        <div className="player-col span-4">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Ojeo</h3>
            </div>
            <div className="detail-list">
              <div>Tier: <span className="mono">{scoutTier ?? "—"}</span></div>
              <div>Fuente: <span className="mono">{scoutView?.source || "—"}</span></div>
              <div>Conocimiento: <span className="mono">{scoutView?.source === "report" ? "Completo" : scoutView ? "Estimado" : "Propio"}</span></div>
            </div>
            {!isMyPlayer && myTeamId && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label className="inline-field">
                  Informe
                  <select value={scoutTierRequest} onChange={(e) => setScoutTierRequest(Number(e.target.value))}>
                    <option value={2}>Rápido (T2)</option>
                    <option value={3}>Normal (T3)</option>
                    <option value={4}>Barato (T4)</option>
                    <option value={5}>Muy barato (T5)</option>
                  </select>
                </label>
                <button type="button" className="subnav-item secondary" onClick={requestScout}>
                  Pedir informe
                </button>
              </div>
            )}
            <div className="detail-list" style={{ marginTop: 10 }}>
              <div>Precisión: <span className="mono">{scoutReportState.report?.accuracy ?? "—"}%</span></div>
              <div>Asignado: <span className="mono">{scoutReportState.report?.assigned_at || "—"}</span></div>
              <div>Creado: <span className="mono">{fmtEpoch(scoutReportState.report?.created_at)}</span></div>
              <div>Caduca: <span className="mono">{fmtEpoch(scoutReportState.report?.expires_at)}</span></div>
            </div>
            {scoutReportState.loading ? <div className="desc">Cargando informe...</div> : null}
            {scoutReportState.error ? <div className="desc">Error: <span className="mono">{String(scoutReportState.error)}</span></div> : null}
          </div>
        </div>

        <div className="player-col span-8">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Partidos recientes</h3>
              <span className="pill subtle">{items.length ? `${items.length}` : "—"}</span>
            </div>
            {matchLogState.loading ? (
              <div className="desc">Cargando...</div>
            ) : matchLogState.error ? (
              <div className="desc">Error: <span className="mono">{String(matchLogState.error)}</span></div>
            ) : items.length ? (
              <div className="table">
                <div className="row head" style={{ gridTemplateColumns: "92px 1fr 46px repeat(7, 50px)" }}>
                  <div>Fecha</div>
                  <div>Rival</div>
                  <div>R</div>
                  <div>MIN</div>
                  <div>PTS</div>
                  <div>REB</div>
                  <div>AST</div>
                  <div>+/-</div>
                  <div>eFG</div>
                  <div>TS</div>
                </div>
                {items.map((m) => {
                  const opp = teamMap?.[m.opponent_id]?.name || `Equipo ${m.opponent_id}`;
                  const marker = m.is_home ? "vs" : "@";
                  const resTone = m.result === "W" ? "ok" : "warn";
                  return (
                    <div
                      className="row"
                      key={m.match_id}
                      style={{ gridTemplateColumns: "92px 1fr 46px repeat(7, 50px)" }}
                      title={`Match #${m.match_id}`}
                    >
                      <div className="mono">{fmtMatchDate(m)}</div>
                      <div title={opp}>{marker} {opp}</div>
                      <div><span className={`pill ${resTone}`}>{m.result}</span></div>
                      <div className="mono">{m.stats?.min ?? "—"}</div>
                      <div className="mono">{m.stats?.pts ?? "—"}</div>
                      <div className="mono">{m.stats?.reb ?? "—"}</div>
                      <div className="mono">{m.stats?.ast ?? "—"}</div>
                      <div className="mono">{m.stats?.pm ?? "—"}</div>
                      <div className="mono">{m.stats?.efg ?? "—"}</div>
                      <div className="mono">{m.stats?.ts ?? "—"}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="desc">Sin partidos.</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderHistorial = () => {
    const generatedAt = data.generated_at ? new Date(Number(data.generated_at) * 1000) : null;
    return (
      <div className="player-grid">
        <div className="player-col span-6">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Biografía</h3>
            </div>
            <div className="detail-list">
              <div>Origen: <span className="mono">{identity.origin_label || identity.origin || "—"}</span></div>
              <div>Personalidad: <span className="mono">{identity.personality_label || identity.personality || "—"}</span></div>
              <div>Generado: <span className="mono">{generatedAt && !Number.isNaN(generatedAt.getTime()) ? generatedAt.toLocaleString("es-ES") : "—"}</span></div>
            </div>
          </div>
        </div>
        <div className="player-col span-6">
          <div className="card player-panel">
            <div className="card-header">
              <h3>Carrera</h3>
            </div>
            <div className="desc">
              Próximo: estadísticas por temporada/equipo, logros y récords.
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="section player-page">
      {renderHeader()}
      {renderTabs()}
      <div className="player-content">
        {tab === "perfil"
          ? renderPerfil()
          : tab === "contrato"
            ? renderContrato()
            : tab === "traspaso"
              ? renderTraspaso()
              : tab === "desarrollo"
                ? renderDesarrollo()
                : tab === "informes"
                  ? renderInformesFmLike()
                  : renderHistorial()}
      </div>
    </section>
  );
}
