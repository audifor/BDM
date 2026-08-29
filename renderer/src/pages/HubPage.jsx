import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  Flag,
  HeartPulse,
  HelpCircle,
  History,
  Inbox,
  ListTodo,
  Mail,
  MessageSquare,
  Plus,
  RotateCcw,
  Settings,
  ShieldAlert,
  Star,
  Target,
  Trash2,
  Upload as UploadIcon,
  Users,
} from "lucide-react";
import CommsConsole from "../components/hub/CommsConsole";

const isoToday = () => new Date().toISOString().slice(0, 10);

const safeJsonParse = (raw, fallback) => {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const toIsoDate = (raw) => {
  if (!raw) return "";
  if (typeof raw === "string") {
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return "";
  }
  if (typeof raw === "number") {
    const ms = raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return "";
};

const formatTimeHHMM = (raw) => {
  if (!raw) return "";
  const s = String(raw);
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
};

const severityRank = (sev) => {
  const s = String(sev || "info").toLowerCase();
  if (s === "critical" || s === "critica") return 4;
  if (s === "high" || s === "alta") return 3;
  if (s === "medium" || s === "media") return 2;
  if (s === "low" || s === "baja") return 1;
  return 1;
};

const fmtMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const defaultNotificationPolicy = {
  criticalSeverities: ["critical", "high"],
  categories: { club: true, squad: true, market: true, medical: true, competition: true, press: true, staff: true, other: true },
};

const HUB_PRESETS = {
  classic: {
    id: "classic",
    label: "FM Clásico",
    layout: [
      { id: "alerts", zone: "top", size: "normal" },
      { id: "inbox", zone: "left", size: "normal" },
      { id: "todo", zone: "left", size: "compact" },
      { id: "watchlist", zone: "left", size: "compact" },
      { id: "recent", zone: "left", size: "compact" },
      { id: "today", zone: "center", size: "normal" },
      { id: "next_event", zone: "center", size: "compact" },
      { id: "next_match", zone: "center", size: "normal" },
      { id: "training", zone: "center", size: "compact" },
      { id: "results", zone: "center", size: "compact" },
      { id: "squad_state", zone: "right", size: "normal" },
      { id: "medical", zone: "right", size: "compact" },
      { id: "finance", zone: "right", size: "compact" },
      { id: "market", zone: "right", size: "compact" },
      { id: "meetings", zone: "right", size: "compact" },
      { id: "decisions", zone: "right", size: "compact" },
      { id: "deadlines", zone: "right", size: "compact" },
      { id: "board", zone: "right", size: "compact" },
      { id: "staff", zone: "right", size: "compact" },
      { id: "comms", zone: "right", size: "compact" },
      { id: "settings", zone: "right", size: "compact" },
    ],
  },
  market: {
    id: "market",
    label: "Mercado",
    layout: [
      { id: "alerts", zone: "top", size: "normal" },
      { id: "inbox", zone: "left", size: "compact" },
      { id: "watchlist", zone: "left", size: "compact" },
      { id: "market", zone: "center", size: "normal" },
      { id: "finance", zone: "right", size: "compact" },
      { id: "todo", zone: "right", size: "normal" },
      { id: "settings", zone: "right", size: "compact" },
    ],
  },
  match: {
    id: "match",
    label: "Partido",
    layout: [
      { id: "alerts", zone: "top", size: "normal" },
      { id: "today", zone: "left", size: "compact" },
      { id: "next_match", zone: "center", size: "normal" },
      { id: "matchups", zone: "center", size: "normal" },
      { id: "results", zone: "center", size: "compact" },
      { id: "todo", zone: "right", size: "normal" },
      { id: "squad_state", zone: "right", size: "normal" },
      { id: "medical", zone: "right", size: "compact" },
      { id: "settings", zone: "right", size: "compact" },
    ],
  },
  development: {
    id: "development",
    label: "Desarrollo",
    layout: [
      { id: "alerts", zone: "top", size: "normal" },
      { id: "todo", zone: "left", size: "normal" },
      { id: "training", zone: "center", size: "compact" },
      { id: "development", zone: "center", size: "normal" },
      { id: "youth", zone: "center", size: "normal" },
      { id: "analysis", zone: "right", size: "normal" },
      { id: "settings", zone: "right", size: "compact" },
    ],
  },
};

const WIDGET_META = {
  alerts: { title: "Alertas", icon: ShieldAlert },
  inbox: { title: "Bandeja", icon: Inbox },
  todo: { title: "Tareas", icon: ListTodo },
  today: { title: "Hoy", icon: Calendar },
  next_event: { title: "Siguiente evento", icon: Calendar },
  next_match: { title: "Próximo partido", icon: Flag },
  results: { title: "Resultados", icon: History },
  matchups: { title: "Matchups clave", icon: Target },
  squad_state: { title: "Estado plantilla", icon: ShieldAlert },
  market: { title: "Mercado", icon: Target },
  watchlist: { title: "Watchlist", icon: Star },
  recent: { title: "Recientes", icon: History },
  training: { title: "Entrenamiento", icon: Activity },
  medical: { title: "Médico", icon: HeartPulse },
  finance: { title: "Finanzas", icon: DollarSign },
  meetings: { title: "Reuniones", icon: Mail },
  decisions: { title: "Decisiones", icon: Check },
  deadlines: { title: "Deadlines", icon: Calendar },
  board: { title: "Directiva", icon: ShieldAlert },
  staff: { title: "Staff", icon: Users },
  analysis: { title: "Análisis", icon: BarChart3 },
  yesterday: { title: "Ayer", icon: History },
  development: { title: "Desarrollo", icon: Target },
  youth: { title: "Juveniles", icon: Target },
  comms: { title: "Comunicaciones", icon: MessageSquare },
  settings: { title: "Ajustes", icon: Settings },
};

const ZONES = ["left", "center", "right"];
const SIZES = ["compact", "normal", "expanded"];
const ORDER_ZONES = ["top", "left", "center", "right"];

const normalizeLayoutOrders = (raw) => {
  const list = Array.isArray(raw) ? raw.filter((w) => w && w.id) : [];
  const indexed = list.map((w, i) => ({ w, i }));
  const out = [];

  ORDER_ZONES.forEach((zone) => {
    const items = indexed.filter((x) => (x.w.zone || "right") === zone);
    items.sort((a, b) => {
      const ao = typeof a.w.order === "number" ? a.w.order : 1e9;
      const bo = typeof b.w.order === "number" ? b.w.order : 1e9;
      if (ao !== bo) return ao - bo;
      return a.i - b.i;
    });
    items.forEach((x, idx) => out.push({ ...x.w, zone, order: idx }));
  });

  indexed
    .filter((x) => !ORDER_ZONES.includes(x.w.zone))
    .forEach((x) => out.push({ ...x.w, order: typeof x.w.order === "number" ? x.w.order : out.length }));

  return out;
};

export default function HubPage({
  loopState,
  loopTeamState,
  loopTodayFixture,
  loopNextFixture,
  loopLastResult,
  loopRecord,
  teamMap,
  myTeamId,
  myTeam,
  myRoster = [],
  myStaff = [],
  playerMap = {},
  marketShortlist = [],
  analyticsSnapshot,
  onRemoveFromShortlist,
  applyCommsEffect,
  hubSnapshot,
  hubLoading,
  gmState,
  gmEvents,
  gmAgenda,
  gmDecisions,
  openPlayer,
  onCreateEvent,
  onApplyDecision,
  onNavigate,
}) {
  const loopDateIso = loopState?.date || "";
  const [customize, setCustomize] = useState(false);
  const [presetId, setPresetId] = useState("classic");
  const [layout, setLayout] = useState(() => HUB_PRESETS.classic.layout);
  const [policy, setPolicy] = useState(defaultNotificationPolicy);

  const layoutKey = `pcbasket.hub.fm.layout.${myTeamId || "0"}`;
  const presetKey = `pcbasket.hub.fm.preset.${myTeamId || "0"}`;
  const policyKey = `pcbasket.hub.fm.policy.${myTeamId || "0"}`;
  const inboxStateKey = `pcbasket.hub.fm.inbox.${myTeamId || "0"}`;
  const tasksKey = `pcbasket.hub.fm.tasks.${myTeamId || "0"}`;
  const focusKey = `pcbasket.hub.fm.focus.${myTeamId || "0"}`;
  const recentKey = `pcbasket.hub.fm.recent.${myTeamId || "0"}`;

  const [inboxQuery, setInboxQuery] = useState("");
  const [inboxUnreadOnly, setInboxUnreadOnly] = useState(true);
  const [inboxCategory, setInboxCategory] = useState("all");
  const [inboxShowThreads, setInboxShowThreads] = useState(true);
  const [readMap, setReadMap] = useState({});
  const [archivedMap, setArchivedMap] = useState({});
  const [pinnedMap, setPinnedMap] = useState({});
  const [selectedThreadKey, setSelectedThreadKey] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [recentIds, setRecentIds] = useState([]);

  const [tasks, setTasks] = useState([]);
  const [taskDraft, setTaskDraft] = useState({ text: "", due: "" });
  const [mandateTarget, setMandateTarget] = useState("Asistente");
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const [widgetPickerQuery, setWidgetPickerQuery] = useState("");
  const [layoutJsonOpen, setLayoutJsonOpen] = useState(false);
  const [layoutJsonMode, setLayoutJsonMode] = useState("export"); // export | import
  const [layoutJsonDraft, setLayoutJsonDraft] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusCenter, setFocusCenter] = useState(false);
  const [flashWidgetId, setFlashWidgetId] = useState("");

  const lastSelectedRef = useRef({ threadKey: "", itemId: "" });
  const flashTimerRef = useRef(null);

  useEffect(() => {
    const storedPreset = window.localStorage?.getItem(presetKey);
    if (storedPreset && HUB_PRESETS[storedPreset]) setPresetId(storedPreset);
  }, [presetKey]);

  useEffect(() => {
    const stored = window.localStorage?.getItem(focusKey);
    setFocusCenter(stored === "1");
  }, [focusKey]);

  useEffect(() => {
    const storedLayout = safeJsonParse(window.localStorage?.getItem(layoutKey), null);
    if (Array.isArray(storedLayout) && storedLayout.length) setLayout(normalizeLayoutOrders(storedLayout));
    else setLayout(normalizeLayoutOrders((HUB_PRESETS[presetId] || HUB_PRESETS.classic).layout));
  }, [layoutKey, presetId]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(layoutKey, JSON.stringify(layout));
    } catch {
      // ignore
    }
  }, [layoutKey, layout]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(focusKey, focusCenter ? "1" : "0");
    } catch {
      // ignore
    }
  }, [focusKey, focusCenter]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (layoutJsonOpen) setLayoutJsonOpen(false);
        else if (widgetPickerOpen) setWidgetPickerOpen(false);
        else if (helpOpen) setHelpOpen(false);
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layoutJsonOpen, widgetPickerOpen, helpOpen]);

  useEffect(() => {
    const storedPolicy = safeJsonParse(window.localStorage?.getItem(policyKey), null);
    if (storedPolicy && typeof storedPolicy === "object") setPolicy({ ...defaultNotificationPolicy, ...storedPolicy });
    else setPolicy(defaultNotificationPolicy);
  }, [policyKey]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(policyKey, JSON.stringify(policy));
    } catch {
      // ignore
    }
  }, [policyKey, policy]);

  useEffect(() => {
    const stored = safeJsonParse(window.localStorage?.getItem(inboxStateKey), null);
    if (!stored || typeof stored !== "object") return;
    if (typeof stored.query === "string") setInboxQuery(stored.query);
    if (typeof stored.unreadOnly === "boolean") setInboxUnreadOnly(stored.unreadOnly);
    if (typeof stored.category === "string") setInboxCategory(stored.category);
    if (typeof stored.showThreads === "boolean") setInboxShowThreads(stored.showThreads);
    if (stored.readMap && typeof stored.readMap === "object") setReadMap(stored.readMap);
    if (stored.archivedMap && typeof stored.archivedMap === "object") setArchivedMap(stored.archivedMap);
    if (stored.pinnedMap && typeof stored.pinnedMap === "object") setPinnedMap(stored.pinnedMap);
  }, [inboxStateKey]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(
        inboxStateKey,
        JSON.stringify({
          query: inboxQuery,
          unreadOnly: inboxUnreadOnly,
          category: inboxCategory,
          showThreads: inboxShowThreads,
          readMap,
          archivedMap,
          pinnedMap,
        }),
      );
    } catch {
      // ignore
    }
  }, [inboxStateKey, inboxQuery, inboxUnreadOnly, inboxCategory, inboxShowThreads, readMap, archivedMap, pinnedMap]);

  useEffect(() => {
    const stored = safeJsonParse(window.localStorage?.getItem(tasksKey), []);
    if (Array.isArray(stored)) setTasks(stored);
  }, [tasksKey]);

  useEffect(() => {
    const stored = safeJsonParse(window.localStorage?.getItem(recentKey), []);
    if (Array.isArray(stored)) setRecentIds(stored);
  }, [recentKey]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(tasksKey, JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [tasksKey, tasks]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(recentKey, JSON.stringify((Array.isArray(recentIds) ? recentIds : []).slice(0, 30)));
    } catch {
      // ignore
    }
  }, [recentKey, recentIds]);

  const applyPreset = (nextPresetId) => {
    const preset = HUB_PRESETS[nextPresetId];
    if (!preset) return;
    setPresetId(nextPresetId);
    try {
      window.localStorage?.setItem(presetKey, nextPresetId);
    } catch {
      // ignore
    }
    setLayout(normalizeLayoutOrders(preset.layout));
    setCustomize(false);
  };

  const resetLayoutToPreset = () => {
    const preset = HUB_PRESETS[presetId] || HUB_PRESETS.classic;
    setLayout(normalizeLayoutOrders(preset.layout));
    setCustomize(false);
  };

  const openLayoutJson = (mode) => {
    setLayoutJsonMode(mode);
    if (mode === "export") setLayoutJsonDraft(JSON.stringify(layout, null, 2));
    else setLayoutJsonDraft("");
    setLayoutJsonOpen(true);
  };

  const seedWidgetConfig = (id) => {
    const base = (HUB_PRESETS[presetId] || HUB_PRESETS.classic).layout?.find((w) => w.id === id) || null;
    return { id, zone: base?.zone || "right", size: base?.size || "normal", hidden: false, collapsed: false };
  };

  const upsertWidget = (id, patch) => {
    setLayout((prev) => {
      const list = normalizeLayoutOrders(prev);
      const idx = list.findIndex((w) => w.id === id);
      if (idx === -1) {
        const next = normalizeLayoutOrders([...list, { ...seedWidgetConfig(id), ...patch, order: 9999 }]);
        return next;
      }
      const before = list[idx];
      const nextZone = patch?.zone && patch.zone !== before.zone ? patch.zone : before.zone;
      const next = list.slice();
      next[idx] = { ...before, ...patch, zone: nextZone, order: patch?.zone && patch.zone !== before.zone ? 9999 : before.order };
      return normalizeLayoutOrders(next);
    });
  };

  const updateWidget = (id, patch) => upsertWidget(id, patch);

  const moveWidget = (id, dir) => {
    setLayout((prev) => {
      const list = normalizeLayoutOrders(prev);
      const current = list.find((w) => w.id === id);
      if (!current) return list;
      const zone = current.zone || "right";
      const zoneItems = list
        .filter((w) => w.zone === zone && !w.hidden)
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const pos = zoneItems.findIndex((w) => w.id === id);
      const nextPos = pos + (dir === "up" ? -1 : 1);
      if (pos === -1 || nextPos < 0 || nextPos >= zoneItems.length) return list;
      const a = zoneItems[pos];
      const b = zoneItems[nextPos];
      const swapped = list.map((w) => (w.id === a.id ? { ...w, order: b.order } : w.id === b.id ? { ...w, order: a.order } : w));
      return normalizeLayoutOrders(swapped);
    });
  };

  const renderWidgetShell = (widget, children, extraRight = null) => {
    const meta = WIDGET_META[widget.id] || { title: widget.id, icon: Mail };
    const Icon = meta.icon || Mail;
    const isCollapsed = Boolean(widget.collapsed);
    return (
      <div
        id={`hub-widget-${widget.id}`}
        className={`card hub-widget hub-widget-${widget.id} hub-size-${widget.size || "normal"} ${isCollapsed ? "collapsed" : ""} ${flashWidgetId === widget.id ? "flash" : ""}`}
      >
        <div className="hub-widget-head">
          <div className="hub-widget-title">
            <Icon size={16} />
            <span>{meta.title}</span>
          </div>
          <div className="hub-widget-actions">
            {extraRight}
            {widget.id !== "alerts" && (
              <button
                className="hub-iconbtn"
                type="button"
                onClick={() => updateWidget(widget.id, { collapsed: !isCollapsed })}
                title={isCollapsed ? "Expandir" : "Colapsar"}
              >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
            {customize && widget.id !== "alerts" && (
              <>
                <button className="hub-iconbtn" type="button" onClick={() => moveWidget(widget.id, "up")} title="Subir">
                  <ArrowUp size={14} />
                </button>
                <button className="hub-iconbtn" type="button" onClick={() => moveWidget(widget.id, "down")} title="Bajar">
                  <ArrowDown size={14} />
                </button>
                <select className="hub-select" value={widget.zone} onChange={(e) => updateWidget(widget.id, { zone: e.target.value })} title="Zona">
                  {ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
                <select className="hub-select" value={widget.size || "normal"} onChange={(e) => updateWidget(widget.id, { size: e.target.value })} title="Densidad">
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="hub-iconbtn" type="button" onClick={() => updateWidget(widget.id, { hidden: true })} title="Ocultar">
                  <EyeOff size={14} />
                </button>
              </>
            )}
          </div>
        </div>
        {!isCollapsed ? <div className="hub-widget-body">{children}</div> : null}
      </div>
    );
  };

  const phoneNews = Array.isArray(hubSnapshot?.news) ? hubSnapshot.news : [];
  const phoneRumors = Array.isArray(hubSnapshot?.rumors) ? hubSnapshot.rumors : [];
  const meetingRequests = hubSnapshot?.meetings?.requests || [];

  const inboxItems = useMemo(() => {
    const out = [];
    (Array.isArray(gmEvents) ? gmEvents : []).forEach((e) => {
      const kind = String(e.event_type || "news");
      const sev = String(e.severity || "info");
      const date = toIsoDate(e.event_date) || loopDateIso || "";
      out.push({
        id: `gm:${e.id}`,
        source: "gm",
        kind,
        category:
          kind === "medical" || kind === "injury"
            ? "medical"
            : kind === "market" || kind === "transfer"
              ? "market"
              : kind === "competition" || kind === "match"
                ? "competition"
                : kind === "meeting"
                  ? "staff"
                  : kind === "press"
                    ? "press"
                    : "club",
        severity: sev,
        priority: severityRank(sev),
        title: e.title || "",
        text: e.body || "",
        date,
        time: formatTimeHHMM(e.time) || "",
        data: e.data || {},
        threadKey: String((e.data || {}).thread_id || `${kind}:${e.title || e.id}`),
        from: (e.data || {}).origin || "system",
      });
    });

    phoneNews.forEach((n) => {
      out.push({
        id: `phone:news:${n.id}`,
        source: "phone",
        kind: "news",
        category: "press",
        severity: n.severity || "info",
        priority: severityRank(n.severity || "info"),
        title: n.title || n.headline || "Noticia",
        text: n.content || n.body || n.text || "",
        date: toIsoDate(n.timestamp || n.date || n.created_at) || "",
        time: "",
        data: n.data || {},
        threadKey: String((n.data || {}).thread_id || `news:${n.title || n.id}`),
        from: "press",
      });
    });

    phoneRumors.forEach((n) => {
      out.push({
        id: `phone:rumor:${n.id}`,
        source: "phone",
        kind: "rumor",
        category: "market",
        severity: n.severity || "low",
        priority: severityRank(n.severity || "low"),
        title: n.title || n.headline || "Rumor",
        text: n.content || n.body || n.text || "",
        date: toIsoDate(n.timestamp || n.date || n.created_at) || "",
        time: "",
        data: n.data || {},
        threadKey: String((n.data || {}).thread_id || `rumor:${n.title || n.id}`),
        from: "media",
      });
    });

    return out
      .filter((i) => (policy.categories[i.category] ?? true))
      .sort((a, b) => {
        const pinA = Boolean(pinnedMap?.[a.id]);
        const pinB = Boolean(pinnedMap?.[b.id]);
        if (pinA !== pinB) return pinA ? -1 : 1;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return String(b.date || "").localeCompare(String(a.date || ""));
      });
  }, [gmEvents, phoneNews, phoneRumors, loopDateIso, policy.categories, pinnedMap]);

  const threads = useMemo(() => {
    const groups = new Map();
    inboxItems.forEach((item) => {
      const key = item.threadKey || item.id;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    });
    const out = [];
    for (const [key, items] of groups.entries()) {
      const sorted = items.slice().sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return String(b.date || "").localeCompare(String(a.date || ""));
      });
      const top = sorted[0];
      const unread = sorted.some((i) => !readMap?.[i.id] && !archivedMap?.[i.id]);
      const count = sorted.filter((i) => !archivedMap?.[i.id]).length;
      const critical = sorted.some((i) => policy.criticalSeverities.includes(String(i.severity || "").toLowerCase()));
      out.push({ key, top, items: sorted, unread, count, critical });
    }
    return out
      .filter((t) => t.count > 0)
      .sort((a, b) => {
        const pinA = Boolean(pinnedMap?.[`thread:${a.key}`]);
        const pinB = Boolean(pinnedMap?.[`thread:${b.key}`]);
        if (pinA !== pinB) return pinA ? -1 : 1;
        if (a.critical !== b.critical) return a.critical ? -1 : 1;
        if (a.unread !== b.unread) return a.unread ? -1 : 1;
        if (a.top.priority !== b.top.priority) return b.top.priority - a.top.priority;
        return String(b.top.date || "").localeCompare(String(a.top.date || ""));
      });
  }, [inboxItems, readMap, archivedMap, pinnedMap, policy.criticalSeverities]);

  const filteredThreads = useMemo(() => {
    const q = inboxQuery.trim().toLowerCase();
    return threads.filter((t) => {
      if (inboxCategory !== "all" && !t.items.some((i) => i.category === inboxCategory)) return false;
      if (inboxUnreadOnly && !t.unread) return false;
      if (!q) return true;
      return String(t.top.title || "").toLowerCase().includes(q) || String(t.top.text || "").toLowerCase().includes(q);
    });
  }, [threads, inboxQuery, inboxCategory, inboxUnreadOnly]);

  const flatFilteredItems = useMemo(() => {
    const q = inboxQuery.trim().toLowerCase();
    return inboxItems.filter((i) => {
      if (archivedMap?.[i.id]) return false;
      if (inboxUnreadOnly && readMap?.[i.id]) return false;
      if (inboxCategory !== "all" && i.category !== inboxCategory) return false;
      if (!q) return true;
      return String(i.title || "").toLowerCase().includes(q) || String(i.text || "").toLowerCase().includes(q);
    });
  }, [inboxItems, archivedMap, readMap, inboxUnreadOnly, inboxCategory, inboxQuery]);

  const selectedThread = useMemo(
    () => (selectedThreadKey ? threads.find((t) => t.key === selectedThreadKey) || null : null),
    [threads, selectedThreadKey],
  );
  const selectedItem = useMemo(() => {
    const id = selectedItemId || selectedThread?.top?.id || "";
    if (!id) return null;
    return inboxItems.find((i) => i.id === id) || null;
  }, [inboxItems, selectedItemId, selectedThread]);

  useEffect(() => {
    const prev = lastSelectedRef.current || {};
    if (prev.threadKey && threads.some((t) => t.key === prev.threadKey)) setSelectedThreadKey(prev.threadKey);
    else if (!selectedThreadKey && filteredThreads.length) setSelectedThreadKey(filteredThreads[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.length]);

  useEffect(() => {
    if (selectedThreadKey) lastSelectedRef.current.threadKey = selectedThreadKey;
  }, [selectedThreadKey]);

  useEffect(() => {
    if (selectedItemId) lastSelectedRef.current.itemId = selectedItemId;
  }, [selectedItemId]);

  const markRead = (id, value = true) => {
    if (!id) return;
    setReadMap((prev) => ({ ...(prev || {}), [id]: Boolean(value) }));
  };
  const togglePinned = (id) => {
    if (!id) return;
    setPinnedMap((prev) => ({ ...(prev || {}), [id]: !prev?.[id] }));
  };
  const archiveItem = (id) => {
    if (!id) return;
    setArchivedMap((prev) => ({ ...(prev || {}), [id]: true }));
  };
  const unarchiveAll = () => setArchivedMap({});

  const delegateItem = (item, toLabel) => {
    if (!item || !onCreateEvent || !myTeamId) return;
    onCreateEvent({
      team_id: myTeamId,
      event_type: "note",
      severity: "low",
      title: `Delegado a ${toLabel}: ${item.title || item.kind}`,
      body: item.text || "",
      date: loopDateIso || isoToday(),
      add_to_agenda: false,
      data: { origin: "delegation", source_item_id: item.id, to: toLabel, category: "staff" },
    });
    archiveItem(item.id);
  };

  const addTask = (text, due, sourceId) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    const id = `t:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    setTasks((prev) => [
      { id, text: trimmed, due: due || "", done: false, sourceId: sourceId || null, createdAt: Date.now() },
      ...(Array.isArray(prev) ? prev : []),
    ].slice(0, 300));
  };
  const toggleTask = (id) =>
    setTasks((prev) => (Array.isArray(prev) ? prev : []).map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const deleteTask = (id) => setTasks((prev) => (Array.isArray(prev) ? prev : []).filter((t) => t.id !== id));

  const systemTasks = useMemo(() => {
    const out = [];
    if (loopTodayFixture?.id) {
      out.push({
        id: "sys:match",
        text: "Día de partido: preparar y decidir jugar/simular",
        due: loopTodayFixture.date || loopDateIso,
      });
    }
    if (Array.isArray(gmDecisions) && gmDecisions.length) {
      out.push({ id: "sys:decisions", text: `Resolver decisiones (${gmDecisions.length})`, due: loopDateIso });
    }
    if (Array.isArray(meetingRequests) && meetingRequests.length) {
      out.push({ id: "sys:meetings", text: `Responder reuniones (${meetingRequests.length})`, due: loopDateIso });
    }
    const criticalUnread = inboxItems.filter(
      (i) => !archivedMap?.[i.id] && !readMap?.[i.id] && policy.criticalSeverities.includes(String(i.severity || "").toLowerCase()),
    );
    if (criticalUnread.length) {
      out.push({ id: "sys:critical", text: `Revisar críticas (${criticalUnread.length})`, due: loopDateIso });
    }
    return out;
  }, [loopTodayFixture, loopDateIso, gmDecisions, meetingRequests, inboxItems, archivedMap, readMap, policy.criticalSeverities]);

  const allTasks = useMemo(() => {
    const userTasks = Array.isArray(tasks) ? tasks : [];
    const merged = [...systemTasks.map((t) => ({ ...t, done: false, system: true })), ...userTasks];
    return merged.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.system !== b.system) return a.system ? -1 : 1;
      return String(a.due || "9999-99-99").localeCompare(String(b.due || "9999-99-99"));
    });
  }, [systemTasks, tasks]);

  const agendaItems = useMemo(() => {
    const items = [];
    const pushAgenda = (item, kind) => {
      const date = toIsoDate(item?.date || item?.event_date || item?.when || item?.timestamp || "");
      items.push({
        id: `${kind}:${item?.id || item?.title || item?.subject || Math.random()}`,
        kind,
        date,
        time: formatTimeHHMM(item?.time || item?.start_time || item?.scheduled_time || ""),
        title: item?.title || item?.subject || item?.topic || (kind === "match" ? "Partido" : kind),
        text: item?.body || item?.summary || item?.description || item?.content || "",
        raw: item,
      });
    };
    (Array.isArray(gmAgenda) ? gmAgenda : []).forEach((a) => pushAgenda(a, "agenda"));
    (hubSnapshot?.meetings?.scheduled || []).forEach((m) => pushAgenda(m, "meeting"));
    (hubSnapshot?.meetings?.requests || []).forEach((m) => pushAgenda(m, "meeting_request"));
    if (loopTodayFixture) {
      const opponentId = String(loopTodayFixture.homeId) === String(myTeamId) ? loopTodayFixture.awayId : loopTodayFixture.homeId;
      const opponent = opponentId ? teamMap?.[opponentId] : null;
      items.push({
        id: `match:${loopTodayFixture.id || loopTodayFixture.date}`,
        kind: "match",
        date: toIsoDate(loopTodayFixture.date) || loopDateIso,
        time: formatTimeHHMM(loopTodayFixture.time) || "",
        title: `Partido: ${opponent?.name || "Rival"}`,
        text: String(loopTodayFixture.homeId) === String(myTeamId) ? "Local" : "Visitante",
        raw: loopTodayFixture,
      });
    }
    const today = loopDateIso || isoToday();
    return items
      .filter((i) => !i.date || i.date === today)
      .sort((a, b) => String(a.time || "99:99").localeCompare(String(b.time || "99:99")));
  }, [gmAgenda, hubSnapshot, loopTodayFixture, loopDateIso, myTeamId, teamMap]);

  const weekStrip = useMemo(() => {
    const anchor = loopDateIso || isoToday();
    const base = new Date(anchor);
    if (Number.isNaN(base.getTime())) return [];
    const next7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      return { iso, label: d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" }) };
    });
    const agendaByDate = {};
    (Array.isArray(gmAgenda) ? gmAgenda : []).forEach((a) => {
      const date = toIsoDate(a?.date || a?.event_date || "");
      if (!date) return;
      agendaByDate[date] = (agendaByDate[date] || 0) + 1;
    });
    return next7.map((d) => {
      const hasMatch =
        (loopTodayFixture && toIsoDate(loopTodayFixture.date) === d.iso) ||
        (loopNextFixture && toIsoDate(loopNextFixture.date) === d.iso);
      return { ...d, match: Boolean(hasMatch), agenda: agendaByDate[d.iso] || 0 };
    });
  }, [loopDateIso, gmAgenda, loopTodayFixture, loopNextFixture]);

  const alerts = useMemo(() => {
    const criticalUnread = inboxItems.filter(
      (i) => !archivedMap?.[i.id] && !readMap?.[i.id] && policy.criticalSeverities.includes(String(i.severity || "").toLowerCase()),
    );
    const unread = inboxItems.filter((i) => !archivedMap?.[i.id] && !readMap?.[i.id]);
    const decisions = Array.isArray(gmDecisions) ? gmDecisions.length : 0;
    const meetings = Array.isArray(meetingRequests) ? meetingRequests.length : 0;
    const market = (myTeam?.data?.active_negotiations || []).length + (Array.isArray(phoneRumors) ? phoneRumors.length : 0);
    const injuries = (Array.isArray(myRoster) ? myRoster : []).filter((p) => Boolean(p?.data?.health?.injury_status) || Boolean(p?.data?.health?.injured)).length;
    return { criticalUnread: criticalUnread.length, unread: unread.length, decisions, meetings, market, injuries };
  }, [inboxItems, archivedMap, readMap, policy.criticalSeverities, gmDecisions, meetingRequests, myTeam, phoneRumors, myRoster]);

  const scrollToWidget = (id) => {
    const targetId = `hub-widget-${id}`;
    const el = typeof document !== "undefined" ? document.getElementById(targetId) : null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlashWidgetId(id);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashWidgetId(""), 900);
  };

  const openPlayerFromHub = (playerId) => {
    if (!playerId) return;
    const pid = String(playerId);
    setRecentIds((prev) => {
      const list = Array.isArray(prev) ? prev.map(String) : [];
      const next = [pid, ...list.filter((x) => x !== pid)].slice(0, 30);
      return next;
    });
    openPlayer?.(playerId);
  };

  const renderAlertsWidget = () => {
    const chip = (label, value, tone, onClick) => (
      <button type="button" className={`hub-chip ${tone || "neutral"}`} onClick={onClick} title={label}>
        <span className="hub-chip-label">{label}</span>
        <span className="hub-chip-value mono">{value}</span>
      </button>
    );
    return (
      <div className="card hub-widget hub-widget-alerts hub-size-normal">
        <div className="hub-widget-head">
          <div className="hub-widget-title">
            <ShieldAlert size={16} />
            <span>Alertas</span>
          </div>
          <div className="hub-widget-actions">
            <select className="hub-select" value={presetId} onChange={(e) => applyPreset(e.target.value)} title="Preset">
              {Object.values(HUB_PRESETS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button className="hub-iconbtn" type="button" onClick={() => setWidgetPickerOpen(true)} title="Widgets">
              <Plus size={14} />
            </button>
            <button className="hub-iconbtn" type="button" onClick={() => openLayoutJson("export")} title="Exportar layout">
              <Download size={14} />
            </button>
            <button className="hub-iconbtn" type="button" onClick={() => openLayoutJson("import")} title="Importar layout">
              <UploadIcon size={14} />
            </button>
            <button className="hub-iconbtn" type="button" onClick={resetLayoutToPreset} title="Reset preset">
              <RotateCcw size={14} />
            </button>
            <button className={`hub-iconbtn ${focusCenter ? "active" : ""}`} type="button" onClick={() => setFocusCenter((v) => !v)} title="Focus centro">
              <Eye size={14} />
            </button>
            <button className={`hub-iconbtn ${helpOpen ? "active" : ""}`} type="button" onClick={() => setHelpOpen((v) => !v)} title="Ayuda">
              <HelpCircle size={14} />
            </button>
            <button className={`hub-iconbtn ${customize ? "active" : ""}`} type="button" onClick={() => setCustomize((v) => !v)} title="Personalizar">
              <Settings size={14} />
            </button>
          </div>
        </div>
        <div className="hub-widget-body">
          <div className="hub-alertbar">
            {chip("Críticas", alerts.criticalUnread, alerts.criticalUnread ? "warn" : "neutral", () => setInboxUnreadOnly(true))}
            {chip("No leídas", alerts.unread, alerts.unread ? "info" : "neutral", () => setInboxUnreadOnly(true))}
            {chip("Decisiones", alerts.decisions, alerts.decisions ? "warn" : "neutral", () => scrollToWidget("decisions"))}
            {chip("Reuniones", alerts.meetings, alerts.meetings ? "warn" : "neutral", () => scrollToWidget("meetings"))}
            {chip("Mercado", alerts.market, alerts.market ? "info" : "neutral", () => onNavigate?.({ section: "Mercado", view: "negotiations" }))}
            {chip("Lesiones", alerts.injuries, alerts.injuries ? "warn" : "neutral", () => onNavigate?.({ section: "Medical", view: "injured" }))}
            <div className="hub-alertbar-right">
              <span className="hub-muted mono">{loopDateIso || isoToday()}</span>
              {hubLoading ? <span className="pill subtle">Sync…</span> : <span className="pill subtle">OK</span>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderInboxWidget = (widget) => {
    const list = inboxShowThreads ? filteredThreads : null;
    const items = inboxShowThreads ? null : flatFilteredItems;

    const selectThread = (key) => {
      setSelectedThreadKey(key);
      setSelectedItemId("");
    };
    const selectItem = (id) => {
      setSelectedItemId(id);
      if (id) markRead(id, true);
    };

    const previewItems = selectedThread?.items?.filter((i) => !archivedMap?.[i.id]) || [];
    const preview = inboxShowThreads ? (selectedItem || selectedThread?.top || null) : selectedItem;

    const staffTargets = (() => {
      const base = ["Asistente", "Director Deportivo", "Médico", "Analista", "Director de cantera"];
      const fromTeam = (Array.isArray(myStaff) ? myStaff : [])
        .map((s) => s?.role || s?.name)
        .filter(Boolean)
        .slice(0, 10);
      return Array.from(new Set([...base, ...fromTeam]));
    })();

    return renderWidgetShell(widget, (
      <div className="hub-inbox-split">
        <div className="hub-inbox-left">
          <div className="hub-toolbar">
            <div className="hub-field">
              <span className="hub-field-icon">
                <Mail size={14} />
              </span>
              <input type="text" value={inboxQuery} placeholder="Filtrar…" onChange={(e) => setInboxQuery(e.target.value)} />
            </div>
            <label className="hub-check">
              <input type="checkbox" checked={inboxUnreadOnly} onChange={(e) => setInboxUnreadOnly(e.target.checked)} /> No leídas
            </label>
          </div>
          <div className="hub-toolbar" style={{ marginTop: 8 }}>
            <select className="hub-select" value={inboxCategory} onChange={(e) => setInboxCategory(e.target.value)} title="Categoría">
              <option value="all">Todas</option>
              <option value="club">Club</option>
              <option value="squad">Plantilla</option>
              <option value="market">Mercado</option>
              <option value="medical">Médico</option>
              <option value="competition">Competición</option>
              <option value="press">Prensa</option>
              <option value="staff">Staff</option>
              <option value="other">Otros</option>
            </select>
            <button className={`hub-iconbtn ${inboxShowThreads ? "active" : ""}`} type="button" onClick={() => setInboxShowThreads((v) => !v)} title="Agrupar por hilos">
              <MessageSquare size={14} />
            </button>
            <button className="hub-iconbtn" type="button" onClick={unarchiveAll} title="Reset archivado">
              <Trash2 size={14} />
            </button>
          </div>

          <div className="hub-inbox-list">
            {hubLoading && inboxItems.length === 0 ? (
              <div className="desc">Cargando…</div>
            ) : inboxShowThreads ? (
              list?.length ? (
                list.slice(0, 80).map((t) => {
                  const pinId = `thread:${t.key}`;
                  const isPinned = Boolean(pinnedMap?.[pinId]);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`hub-inbox-row ${selectedThreadKey === t.key ? "active" : ""} ${t.unread ? "unread" : "read"}`}
                      onClick={() => selectThread(t.key)}
                      title={t.top?.text || t.top?.title || ""}
                    >
                      <div className="hub-inbox-row-top">
                        <span className={`pill subtle ${t.top?.severity || "info"}`}>{t.top?.category || "club"}</span>
                        <span className="mono hub-muted">{t.top?.date || ""}</span>
                      </div>
                      <div className="hub-inbox-row-title">
                        <span className="hub-ellipsis">{t.top?.title || "--"}</span>
                        <span className="hub-inbox-row-count mono">{t.count}</span>
                      </div>
                      <div className="hub-inbox-row-actions" onClick={(e) => e.stopPropagation()}>
                        <button className={`hub-iconbtn ${isPinned ? "active" : ""}`} type="button" onClick={() => togglePinned(pinId)} title="Fijar hilo">
                          <Flag size={14} />
                        </button>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="desc">Sin resultados.</div>
              )
            ) : items?.length ? (
              items.slice(0, 80).map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className={`hub-inbox-row ${selectedItemId === i.id ? "active" : ""} ${readMap?.[i.id] ? "read" : "unread"}`}
                  onClick={() => selectItem(i.id)}
                >
                  <div className="hub-inbox-row-top">
                    <span className={`pill subtle ${i.severity || "info"}`}>{i.category}</span>
                    <span className="mono hub-muted">{i.date || ""}</span>
                  </div>
                  <div className="hub-inbox-row-title">
                    <span className="hub-ellipsis">{i.title || "--"}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="desc">Sin mensajes.</div>
            )}
          </div>
        </div>

        <div className="hub-inbox-right">
          {!preview ? (
            <div className="hub-empty">
              <div className="desc">Selecciona un elemento.</div>
            </div>
          ) : (
            <div className="hub-preview">
              <div className="hub-preview-meta">
                <span className={`pill subtle ${preview.severity || "info"}`}>{preview.kind}</span>
                <span className="pill subtle">{preview.category}</span>
                <span className="mono hub-muted">{preview.date || ""} {preview.time || ""}</span>
              </div>
              <div className="hub-preview-title">{preview.title || "--"}</div>
              {preview.text ? <div className="hub-preview-body">{preview.text}</div> : <div className="desc">Sin detalles.</div>}

              <div className="hub-preview-actions">
                <button className="subnav-item secondary" type="button" onClick={() => markRead(preview.id, !readMap?.[preview.id])}>
                  {readMap?.[preview.id] ? "Marcar no leído" : "Marcar leído"}
                </button>
                <button className="subnav-item secondary" type="button" onClick={() => togglePinned(preview.id)}>
                  {pinnedMap?.[preview.id] ? "Desfijar" : "Fijar"}
                </button>
                <button className="subnav-item secondary" type="button" onClick={() => archiveItem(preview.id)}>
                  Archivar
                </button>
                <button className="subnav-item secondary" type="button" onClick={() => addTask(`Revisar: ${preview.title}`, loopDateIso, preview.id)}>
                  Crear tarea
                </button>
              </div>

              <div className="hub-preview-delegate">
                <div className="desc">Delegar</div>
                <div className="hub-row">
                  <select className="hub-select" defaultValue={staffTargets[0]} onChange={(e) => delegateItem(preview, e.target.value)} title="Delegar a…">
                    {staffTargets.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button className="subnav-item secondary" type="button" onClick={() => delegateItem(preview, staffTargets[0])}>
                    Delegar
                  </button>
                </div>
              </div>

              {inboxShowThreads && previewItems.length > 1 && (
                <div className="hub-thread">
                  <div className="section-title">Hilo</div>
                  <div className="hub-thread-list">
                    {previewItems.slice(0, 18).map((i) => (
                      <button key={i.id} type="button" className={`hub-thread-item ${selectedItemId === i.id ? "active" : ""}`} onClick={() => selectItem(i.id)}>
                        <span className={`pill subtle ${i.severity || "info"}`}>{i.kind}</span>
                        <span className="hub-ellipsis">{i.title || "--"}</span>
                        <span className="mono hub-muted">{i.date || ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    ));
  };

  const renderTodoWidget = (widget) =>
    renderWidgetShell(widget, (
      <div className="hub-todo">
        <div className="hub-toolbar">
          <div className="hub-field">
            <span className="hub-field-icon">
              <ListTodo size={14} />
            </span>
            <input
              type="text"
              placeholder="Añadir tarea…"
              value={taskDraft.text}
              onChange={(e) => setTaskDraft((p) => ({ ...p, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addTask(taskDraft.text, taskDraft.due, null);
                  setTaskDraft({ text: "", due: "" });
                }
              }}
            />
          </div>
        </div>
        <div className="hub-toolbar" style={{ marginTop: 8 }}>
          <input
            className="hub-input"
            type="date"
            value={taskDraft.due}
            onChange={(e) => setTaskDraft((p) => ({ ...p, due: e.target.value }))}
            title="Vence"
          />
          <button
            className="subnav-item primary"
            type="button"
            onClick={() => {
              addTask(taskDraft.text, taskDraft.due, null);
              setTaskDraft({ text: "", due: "" });
            }}
          >
            Añadir
          </button>
        </div>
        <div className="hub-todo-list">
          {allTasks.length === 0 ? (
            <div className="desc">Sin tareas.</div>
          ) : (
            allTasks.slice(0, 30).map((t) => (
              <div key={t.id} className={`hub-todo-item ${t.done ? "done" : ""}`}>
                <button
                  type="button"
                  className="hub-todo-check"
                  onClick={() => (t.system ? null : toggleTask(t.id))}
                  disabled={t.system}
                  title={t.system ? "Tarea del sistema" : "Completar"}
                >
                  <Check size={14} />
                </button>
                <div className="hub-todo-main">
                  <div className="hub-todo-text">{t.text}</div>
                  <div className="hub-todo-meta">
                    <span className="mono">{t.due || "--"}</span>
                    {t.system ? <span className="pill subtle">Sistema</span> : null}
                  </div>
                </div>
                {!t.system && (
                  <button className="hub-iconbtn" type="button" onClick={() => deleteTask(t.id)} title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    ));

  const renderTodayWidget = (widget) =>
    renderWidgetShell(widget, (
      <div className="hub-today">
        <div className="hub-weekstrip">
          {weekStrip.map((d) => (
            <div key={d.iso} className={`hub-day ${d.iso === (loopDateIso || isoToday()) ? "active" : ""}`}>
              <div className="hub-day-label">{d.label}</div>
              <div className="hub-day-icons">
                {d.match ? <span className="pill subtle">Partido</span> : null}
                {d.agenda ? <span className="pill subtle">{d.agenda} agenda</span> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="hub-timeline">
          {agendaItems.length === 0 ? (
            <div className="desc">Sin eventos para hoy.</div>
          ) : (
            agendaItems.map((a) => (
              <div key={a.id} className={`hub-timeline-item kind-${a.kind}`}>
                <div className="mono hub-timeline-time">{a.time || "--"}</div>
                <div className="hub-timeline-main">
                  <div className="hub-timeline-title">{a.title}</div>
                  {a.text ? <div className="hub-timeline-text">{a.text}</div> : null}
                </div>
                <span className="pill subtle">{a.kind}</span>
              </div>
            ))
          )}
        </div>
      </div>
    ));

  const renderNextEventWidget = (widget) => {
    const today = loopDateIso || isoToday();
    const candidates = [];
    const push = (kind, payload) => {
      const date = toIsoDate(payload?.date || payload?.event_date || payload?.when || payload?.timestamp || "");
      if (!date) return;
      candidates.push({
        kind,
        date,
        time: formatTimeHHMM(payload?.time || payload?.start_time || payload?.scheduled_time || payload?.kickoff || ""),
        title: payload?.title || payload?.subject || payload?.topic || "Evento",
        text: payload?.body || payload?.summary || payload?.description || payload?.content || "",
        raw: payload,
      });
    };
    (Array.isArray(gmAgenda) ? gmAgenda : []).forEach((a) => push("agenda", a));
    (hubSnapshot?.meetings?.scheduled || []).forEach((m) => push("meeting", m));
    (hubSnapshot?.meetings?.requests || []).forEach((m) => push("meeting_request", m));
    if (loopNextFixture) {
      const opponentId = String(loopNextFixture.homeId) === String(myTeamId) ? loopNextFixture.awayId : loopNextFixture.homeId;
      const opponent = opponentId ? teamMap?.[opponentId] : null;
      candidates.push({
        kind: "match",
        date: toIsoDate(loopNextFixture.date) || "",
        time: formatTimeHHMM(loopNextFixture.time) || "",
        title: `Partido: ${opponent?.name || "Rival"}`,
        text: String(loopNextFixture.homeId) === String(myTeamId) ? "Local" : "Visitante",
        raw: loopNextFixture,
      });
    }

    const next = candidates
      .filter((c) => c.date >= today)
      .sort((a, b) => `${a.date} ${a.time || "99:99"}`.localeCompare(`${b.date} ${b.time || "99:99"}`))[0] || null;

    return renderWidgetShell(widget, (
      <div className="hub-next-event">
        {!next ? (
          <div className="desc">Sin eventos próximos.</div>
        ) : (
          <>
            <div className="detail-list">
              <div>
                <span className="pill subtle">{next.kind}</span>{" "}
                <span className="mono">{next.date}</span>{" "}
                <span className="mono hub-muted">{next.time || "--"}</span>
              </div>
            </div>
            <div className="hub-next-event-title">{next.title}</div>
            {next.text ? <div className="desc">{next.text}</div> : null}
            <div className="hub-row" style={{ marginTop: 10 }}>
              <button className="subnav-item secondary" type="button" onClick={() => scrollToWidget("today")}>
                Ver agenda
              </button>
              {next.kind === "match" ? (
                <button className="subnav-item primary" type="button" onClick={() => onNavigate?.({ section: "Tacticas", view: "match" })}>
                  Ir al partido
                </button>
              ) : null}
              <button className="subnav-item secondary" type="button" onClick={() => addTask(`Preparar: ${next.title}`, next.date, `hub:next:${next.kind}`)}>
                Crear tarea
              </button>
            </div>
          </>
        )}
      </div>
    ));
  };

  const renderResultsWidget = (widget) => {
    const last = loopLastResult || null;
    const rec = loopRecord || {};
    if (!last) {
      return renderWidgetShell(widget, <div className="desc">Sin resultados aún.</div>);
    }
    const home = teamMap?.[last.homeId]?.name || `Equipo ${last.homeId}`;
    const away = teamMap?.[last.awayId]?.name || `Equipo ${last.awayId}`;
    const isHome = String(last.homeId) === String(myTeamId);
    const myScore = isHome ? last.homeScore : last.awayScore;
    const oppScore = isHome ? last.awayScore : last.homeScore;
    const outcome = myScore > oppScore ? "Victoria" : "Derrota";

    return renderWidgetShell(widget, (
      <div className="hub-results">
        <div className="hub-results-top">
          <div className="hub-results-line">{home} <span className="mono">{last.homeScore}</span> - <span className="mono">{last.awayScore}</span> {away}</div>
          <div className="hub-row" style={{ marginTop: 6 }}>
            <span className={`pill ${outcome === "Victoria" ? "subtle" : "warn"}`}>{outcome}</span>
            <span className="pill subtle">Récord</span>
            <span className="mono">{Number(rec.w || 0)}-{Number(rec.l || 0)}</span>
            <span className="mono hub-muted">{last.date || ""}</span>
          </div>
        </div>
        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Competicion", view: "standings" })}>
            Clasificación
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Competicion", view: "calendar" })}>
            Calendario
          </button>
        </div>
      </div>
    ));
  };

  const renderTrainingWidget = (widget) => {
    const roster = Array.isArray(myRoster) ? myRoster : [];
    const rows = roster
      .map((p) => {
        const hs = p?.data?.health || {};
        const fatigue = Number(hs?.fatigue || 0);
        const fitness = Number(hs?.match_fitness ?? hs?.matchFitness ?? 0);
        return { p, fatigue, fitness };
      })
      .sort((a, b) => b.fatigue - a.fatigue);
    const avgFatigue = rows.length ? Math.round(rows.reduce((acc, r) => acc + r.fatigue, 0) / rows.length) : 0;
    const top = rows.slice(0, 5);

    return renderWidgetShell(widget, (
      <div className="hub-training">
        <div className="detail-list">
          <div>Fatiga equipo: <span className="mono">{loopTeamState?.fatigue ?? avgFatigue}</span></div>
          <div>Moral equipo: <span className="mono">{loopTeamState?.morale ?? "--"}</span></div>
        </div>
        {top.length ? (
          <div style={{ marginTop: 10 }}>
            <div className="section-title">Más cargados</div>
            <div className="hub-squad-list">
              {top.map(({ p, fatigue, fitness }) => (
                <div key={p.id} className="hub-squad-row">
                  <button className="link hub-ellipsis" type="button" onClick={() => openPlayerFromHub(p.id)}>
                    {p.name}
                  </button>
                  <span className="pill subtle">FAT</span>
                  <span className="mono">{fatigue}</span>
                  <span className="pill subtle">FIT</span>
                  <span className="mono">{fitness}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="desc" style={{ marginTop: 10 }}>Sin plantilla.</div>
        )}
        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Entrenamiento", view: "team" })}>
            Plan equipo
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Entrenamiento", view: "load" })}>
            Load
          </button>
        </div>
      </div>
    ));
  };

  const renderMedicalWidget = (widget) => {
    const roster = Array.isArray(myRoster) ? myRoster : [];
    const injured = roster
      .map((p) => {
        const hs = p?.data?.health || {};
        const status = hs?.injury_status || (hs?.injured ? "Lesionado" : "");
        return { p, status: String(status || "").trim() };
      })
      .filter((x) => x.status)
      .slice(0, 8);

    return renderWidgetShell(widget, (
      <div className="hub-medical">
        {injured.length ? (
          <div className="hub-medical-list">
            {injured.map(({ p, status }) => (
              <div key={p.id} className="hub-squad-row">
                <button className="link hub-ellipsis" type="button" onClick={() => openPlayerFromHub(p.id)}>
                  {p.name}
                </button>
                <span className="pill subtle warn">LES</span>
                <span className="hub-ellipsis">{status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="desc">Sin lesionados.</div>
        )}
        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Medical", view: "injured" })}>
            Ver bajas
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Medical", view: "overview" })}>
            Resumen
          </button>
        </div>
      </div>
    ));
  };

  const renderFinanceWidget = (widget) => {
    const d = myTeam?.data || {};
    const budget = d.budget ?? d.season_budget ?? d.balance ?? null;
    const wages = d.wages ?? d.payroll ?? d.payroll_total ?? d.wage_budget ?? null;
    const balance = d.balance ?? null;

    return renderWidgetShell(widget, (
      <div className="hub-finance">
        <div className="detail-list">
          <div>Presupuesto: <span className="mono">{fmtMoney(budget)}</span></div>
          <div>Balance: <span className="mono">{fmtMoney(balance)}</span></div>
          <div>Salarios: <span className="mono">{fmtMoney(wages)}</span></div>
        </div>
        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Club", view: "finances" })}>
            Finanzas
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Club", view: "dashboard" })}>
            Club
          </button>
        </div>
      </div>
    ));
  };

  const renderWatchlistWidget = (widget) => {
    const list = Array.isArray(marketShortlist) ? marketShortlist : [];
    const priorityRank = (p) => (p === "high" ? 0 : p === "medium" ? 1 : 2);
    const top = list.slice().sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)).slice(0, 10);

    return renderWidgetShell(widget, (
      <div className="hub-watchlist">
        {top.length ? (
          <div className="hub-watchlist-list">
            {top.map((s) => {
              const pid = s.player_id ?? s.id;
              const p = playerMap?.[pid] || null;
              return (
                <div key={s.id || pid} className="hub-watchlist-row">
                  <button className="link hub-ellipsis" type="button" onClick={() => openPlayerFromHub(pid)}>
                    {p?.name || `Jugador ${pid}`}
                  </button>
                  <span className="pill subtle">{s.priority || "—"}</span>
                  {onRemoveFromShortlist ? (
                    <button className="hub-iconbtn" type="button" onClick={() => onRemoveFromShortlist(pid)} title="Quitar">
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="desc">Watchlist vacía.</div>
        )}
        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Mercado", view: "shortlist" })}>
            Abrir objetivos
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Mercado", view: "search" })}>
            Buscar
          </button>
        </div>
      </div>
    ));
  };

  const renderRecentWidget = (widget) => {
    const top = (Array.isArray(recentIds) ? recentIds : []).slice(0, 10);
    const clearBtn = (
      <button className="hub-iconbtn" type="button" onClick={() => setRecentIds([])} title="Limpiar">
        <Trash2 size={14} />
      </button>
    );
    return renderWidgetShell(widget, (
      <div className="hub-recent">
        {top.length ? (
          <div className="hub-watchlist-list">
            {top.map((pid) => (
              <div key={pid} className="hub-watchlist-row">
                <button className="link hub-ellipsis" type="button" onClick={() => openPlayerFromHub(pid)}>
                  {playerMap?.[pid]?.name || `Jugador ${pid}`}
                </button>
                <span className="pill subtle">perfil</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="desc">Sin recientes.</div>
        )}
      </div>
    ), clearBtn);
  };

  const renderStaffWidget = (widget) => {
    const staff = Array.isArray(myStaff) ? myStaff : [];
    const delegations = (Array.isArray(gmEvents) ? gmEvents : [])
      .filter((e) => String(e.event_type || "") === "note" && (e.data || {})?.origin === "delegation")
      .slice()
      .reverse()
      .slice(0, 5);

    return renderWidgetShell(widget, (
      <div className="hub-staff">
        <div className="section-title">Equipo técnico</div>
        {staff.length ? (
          <div className="detail-list">
            {staff.slice(0, 6).map((s) => (
              <div key={s.id || s.name}>
                <span className="mono">{s.role || "Staff"}</span>: {s.name || "--"}
              </div>
            ))}
          </div>
        ) : (
          <div className="desc">Sin staff cargado.</div>
        )}

        <div className="section-title" style={{ marginTop: 10 }}>Delegaciones</div>
        {delegations.length ? (
          <div className="detail-list">
            {delegations.map((d) => (
              <div key={d.id}>
                <span className="pill subtle">delegado</span> {d.title || "--"}
              </div>
            ))}
          </div>
        ) : (
          <div className="desc">Sin delegaciones.</div>
        )}

        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Club", view: "staff" })}>
            Staff & roles
          </button>
        </div>
      </div>
    ));
  };

  const renderAnalysisWidget = (widget) => {
    const snap = analyticsSnapshot || {};
    const metrics = snap?.metrics || snap?.summary || snap?.overview || null;
    const entries = metrics && typeof metrics === "object" ? Object.entries(metrics).slice(0, 8) : [];

    return renderWidgetShell(widget, (
      <div className="hub-analysis">
        {entries.length ? (
          <div className="detail-list">
            {entries.map(([k, v]) => (
              <div key={k}>
                {k}: <span className="mono">{typeof v === "number" ? Math.round(v) : String(v)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="desc">Sin snapshot analítico (o sin métricas). Se refresca al simular/terminar partidos.</div>
        )}
        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Club", view: "analytics" })}>
            Abrir analítica
          </button>
        </div>
      </div>
    ));
  };

  const renderYesterdayWidget = (widget) => {
    const base = new Date(loopDateIso || isoToday());
    if (Number.isNaN(base.getTime())) return renderWidgetShell(widget, <div className="desc">--</div>);
    const d = new Date(base);
    d.setDate(base.getDate() - 1);
    const yIso = d.toISOString().slice(0, 10);
    const inboxCount = inboxItems.filter((i) => i.date === yIso).length;
    const delegated = inboxItems.filter((i) => i.date === yIso && String(i.from || "") === "delegation").length;
    const done = (Array.isArray(tasks) ? tasks : []).filter((t) => t.done && toIsoDate(t?.createdAt) === yIso).length;

    return renderWidgetShell(widget, (
      <div className="hub-yesterday">
        <div className="detail-list">
          <div>Fecha: <span className="mono">{yIso}</span></div>
          <div>Mensajes: <span className="mono">{inboxCount}</span></div>
          <div>Tareas completadas: <span className="mono">{done}</span></div>
          <div>Delegaciones: <span className="mono">{delegated}</span></div>
        </div>
      </div>
    ));
  };

  const renderCommsWidget = (widget) =>
    renderWidgetShell(widget, (
      <div className="hub-comms">
        <CommsConsole loopTeamState={loopTeamState} onApplyEffect={applyCommsEffect} myTeamId={myTeamId} />
      </div>
    ));

  const renderSettingsWidget = (widget) => {
    const toggleCategory = (key) => {
      setPolicy((prev) => ({
        ...prev,
        categories: { ...(prev.categories || {}), [key]: !(prev.categories?.[key] ?? true) },
      }));
    };
    const toggleCriticalSeverity = (sev) => {
      setPolicy((prev) => {
        const set = new Set(prev.criticalSeverities || []);
        if (set.has(sev)) set.delete(sev);
        else set.add(sev);
        return { ...prev, criticalSeverities: Array.from(set) };
      });
    };

    return renderWidgetShell(widget, (
      <div className="hub-settings">
        <div className="section-title">Accesos</div>
        <div className="hub-row">
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Plantilla", view: "plantilla" })}>
            Plantilla
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Mercado", view: "search" })}>
            Mercado
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Competicion", view: "calendar" })}>
            Competicion
          </button>
        </div>

        <div className="section-title" style={{ marginTop: 10 }}>Inbox</div>
        <div className="hub-row">
          <button className="subnav-item secondary" type="button" onClick={() => setInboxUnreadOnly((v) => !v)}>
            {inboxUnreadOnly ? "Mostrar todo" : "Solo no leidas"}
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => setInboxShowThreads((v) => !v)}>
            {inboxShowThreads ? "Ver items" : "Ver hilos"}
          </button>
          <button className="subnav-item secondary" type="button" onClick={unarchiveAll}>
            Reset archivado
          </button>
        </div>

        <div className="section-title" style={{ marginTop: 10 }}>Critico</div>
        <div className="hub-row">
          <button
            className={`subnav-item secondary ${policy.criticalSeverities?.includes("critical") ? "active" : ""}`}
            type="button"
            onClick={() => toggleCriticalSeverity("critical")}
          >
            critical
          </button>
          <button
            className={`subnav-item secondary ${policy.criticalSeverities?.includes("high") ? "active" : ""}`}
            type="button"
            onClick={() => toggleCriticalSeverity("high")}
          >
            high
          </button>
        </div>

        <div className="section-title" style={{ marginTop: 10 }}>Categorias</div>
        <div className="hub-row">
          {Object.keys(defaultNotificationPolicy.categories).map((k) => (
            <button
              key={k}
              className={`subnav-item secondary ${policy.categories?.[k] ?? true ? "active" : ""}`}
              type="button"
              onClick={() => toggleCategory(k)}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
    ));
  };

  const renderNextMatchWidget = (widget) => {
    const nextFixture = loopNextFixture;
    const oppId = nextFixture
      ? (String(nextFixture.homeId) === String(myTeamId) ? nextFixture.awayId : nextFixture.homeId)
      : null;
    const opp = oppId ? teamMap?.[oppId] : null;
    const isHome = nextFixture ? String(nextFixture.homeId) === String(myTeamId) : false;
    const fatigue = Number(loopTeamState?.fatigue || 0);
    const morale = Number(loopTeamState?.morale || 0);
    const recs = [];
    if (fatigue > 75) recs.push("Reducir carga: rotación más profunda + ritmo controlado.");
    if (morale < 45) recs.push("Mejorar clima: charla + roles claros antes del partido.");
    if (!recs.length) recs.push("Preparación estándar: scouting rival + repaso de playbook.");

    return renderWidgetShell(widget, (
      <div className="hub-next-match">
        {nextFixture ? (
          <>
            <div className="hub-next-title">{opp?.name || "Rival"}</div>
            <div className="desc">
              <span className="mono">{nextFixture.date || "--"}</span> · {isHome ? "Local" : "Visitante"}
            </div>
            <div className="hub-recs">
              {recs.slice(0, 3).map((r, idx) => (
                <div key={idx} className="hub-rec">
                  <span className="pill subtle">Tip</span> <span>{r}</span>
                </div>
              ))}
            </div>
            <div className="hub-row" style={{ marginTop: 10 }}>
              <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Tacticas", view: "board" })}>
                Tácticas
              </button>
              <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Plantilla", view: "plantilla" })}>
                Plantilla
              </button>
              <button className="subnav-item primary" type="button" onClick={() => onNavigate?.({ section: "Tacticas", view: "match" })}>
                Preparar
              </button>
            </div>
          </>
        ) : (
          <div className="desc">Sin partidos próximos.</div>
        )}
      </div>
    ));
  };

  const renderSquadStateWidget = (widget) => {
    const roster = Array.isArray(myRoster) ? myRoster : [];
    const risk = roster
      .map((p) => {
        const hs = p?.data?.health || {};
        const fatigue = Number(hs?.fatigue || 0);
        const fitness = Number(hs?.match_fitness ?? hs?.matchFitness ?? 0);
        const morale = Number(p?.data?.morale ?? 50);
        const injured = Boolean(hs?.injury_status) || Boolean(hs?.injured);
        const score = (injured ? 100 : 0) + fatigue * 1.2 + (100 - fitness) * 0.6 + (60 - morale) * 0.4;
        return { p, score: Math.round(score) };
      })
      .sort((a, b) => b.score - a.score);
    const top = risk.slice(0, 7);

    return renderWidgetShell(widget, (
      <div className="hub-squad">
        {top.length ? (
          <div className="hub-squad-list">
            {top.map(({ p, score }) => (
              <div key={p.id} className="hub-squad-row">
                <button className="link hub-ellipsis" type="button" onClick={() => openPlayerFromHub(p.id)}>
                  {p.name}
                </button>
                <span className="pill subtle">Riesgo</span>
                <span className="mono">{score}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="desc">Sin plantilla.</div>
        )}
        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Medical", view: "overview" })}>
            Médico
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Entrenamiento", view: "load" })}>
            Load
          </button>
        </div>
      </div>
    ));
  };

  const renderMarketWidget = (widget) => {
    const negotiations = myTeam?.data?.active_negotiations || [];
    const outgoing = negotiations.filter((n) => String(n.type) === "outgoing").slice(0, 5);
    const incoming = negotiations.filter((n) => String(n.type) === "incoming").slice(0, 5);
    const rumors = phoneRumors.slice(0, 3);

    return renderWidgetShell(widget, (
      <div className="hub-market">
        <div className="hub-market-grid">
          <div>
            <div className="hub-muted">Salientes</div>
            {outgoing.length ? outgoing.map((n) => (
              <div key={n.id} className="hub-market-row">
                <button className="link hub-ellipsis" type="button" onClick={() => openPlayerFromHub(n.player_id)}>
                  {n.player_name || `Jugador ${n.player_id}`}
                </button>
                <span className="pill subtle">{n.status || "open"}</span>
              </div>
            )) : <div className="desc">--</div>}
          </div>
          <div>
            <div className="hub-muted">Entrantes</div>
            {incoming.length ? incoming.map((n) => (
              <div key={n.id} className="hub-market-row">
                <button className="link hub-ellipsis" type="button" onClick={() => openPlayerFromHub(n.player_id)}>
                  {n.player_name || `Jugador ${n.player_id}`}
                </button>
                <span className="pill subtle">{n.status || "open"}</span>
              </div>
            )) : <div className="desc">--</div>}
          </div>
        </div>
        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Mercado", view: "negotiations" })}>
            Abrir
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Mercado", view: "search" })}>
            Buscar
          </button>
        </div>
        <div className="section-title" style={{ marginTop: 10 }}>Rumores</div>
        {rumors.length ? (
          <div className="hub-market-rumors">
            {rumors.map((r) => (
              <div key={r.id} className="hub-rumor">
                <span className="pill subtle">Rumor</span>
                <span className="hub-ellipsis">{r.title || "--"}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="desc">Sin rumores.</div>
        )}
      </div>
    ));
  };

  const renderMeetingsWidget = (widget) => {
    const requests = Array.isArray(meetingRequests) ? meetingRequests : [];
    const scheduled = hubSnapshot?.meetings?.scheduled || [];

    const accept = (req) => {
      if (!onCreateEvent || !myTeamId) return;
      onCreateEvent({
        team_id: myTeamId,
        event_type: "meeting",
        severity: "info",
        title: req?.title || req?.subject || "Reunión",
        body: req?.body || req?.summary || "",
        date: loopDateIso || isoToday(),
        time: req?.time || "",
        add_to_agenda: true,
      });
    };

    const decline = (req) => {
      if (!onCreateEvent || !myTeamId) return;
      onCreateEvent({
        team_id: myTeamId,
        event_type: "note",
        severity: "low",
        title: `Rechazada: ${req?.title || req?.subject || "Reunión"}`,
        body: req?.body || req?.summary || "",
        date: loopDateIso || isoToday(),
        time: "",
        add_to_agenda: false,
      });
    };

    return renderWidgetShell(widget, (
      <div className="hub-meetings-widget">
        <div className="section-title">Solicitudes</div>
        {requests.length === 0 ? (
          <div className="desc">Sin solicitudes.</div>
        ) : (
          <div className="hub-meeting-list">
            {requests.slice(0, 6).map((r) => (
              <div key={r.id || r.title || r.subject} className="hub-meeting-row">
                <div className="hub-meeting-main">
                  <div className="hub-meeting-title">{r.title || r.subject || "Reunión"}</div>
                  {r.body || r.summary ? <div className="hub-meeting-body">{r.body || r.summary}</div> : null}
                </div>
                <div className="hub-meeting-actions">
                  <button className="subnav-item primary" type="button" onClick={() => accept(r)}>
                    Aceptar
                  </button>
                  <button className="subnav-item secondary" type="button" onClick={() => decline(r)}>
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="section-title" style={{ marginTop: 10 }}>Programadas</div>
        {(Array.isArray(scheduled) ? scheduled : []).length === 0 ? (
          <div className="desc">Sin reuniones programadas.</div>
        ) : (
          <div className="detail-list">
            {(Array.isArray(scheduled) ? scheduled : []).slice(0, 6).map((r) => (
              <div key={r.id || r.title || r.subject}>
                {r.title || r.subject || "Reunión"} · <span className="mono">{toIsoDate(r.date) || loopDateIso || "--"}</span> {formatTimeHHMM(r.time) || ""}
              </div>
            ))}
          </div>
        )}
      </div>
    ));
  };

  const renderDecisionsWidget = (widget) => {
    const list = Array.isArray(gmDecisions) ? gmDecisions : [];
    const renderEffects = (effects) => {
      if (!effects || typeof effects !== "object") return null;
      const entries = Object.entries(effects).filter(([, value]) => Number(value) !== 0);
      if (!entries.length) return null;
      return (
        <div className="decision-effects">
          {entries.slice(0, 6).map(([key, value]) => (
            <span key={key} className="chip muted">
              {key} {Number(value) > 0 ? "+" : ""}{value}
            </span>
          ))}
        </div>
      );
    };
    return renderWidgetShell(widget, (
      <div className="hub-decisions-widget">
        {list.length === 0 ? (
          <div className="desc">Sin decisiones pendientes.</div>
        ) : (
          <div className="hub-decision-list">
            {list.slice(0, 6).map((d) => (
              <div key={d.id} className="hub-decision-item">
                <div className="hub-decision-head">
                  <div className="hub-decision-title">{d.event_title || "Decisión"}</div>
                  <span className="pill subtle">{d.event_type || "evento"}</span>
                </div>
                <div className="hub-decision-options">
                  {(d.options || []).slice(0, 4).map((opt) => (
                    <div key={opt.key || opt.label} className="hub-decision-opt">
                      <button className="subnav-item secondary" type="button" onClick={() => onApplyDecision?.(d.id, opt.key)}>
                        {opt.label || opt.key}
                      </button>
                      {renderEffects(opt.effects)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ));
  };

  const renderDeadlinesWidget = (widget) => {
    const items = [
      { label: "Cierre mercado", date: String(myTeam?.data?.market_window_end || "").slice(0, 10) },
      { label: "Registro", date: String(myTeam?.data?.registration_deadline || "").slice(0, 10) },
      { label: "Próximo partido", date: loopNextFixture?.date || "" },
    ].filter((d) => d.date);
    return renderWidgetShell(widget, (
      <div className="hub-deadlines-widget">
        {items.length ? (
          <div className="detail-list">
            {items.map((d) => (
              <div key={d.label}>
                {d.label}: <span className="mono">{d.date}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="desc">Sin deadlines configurados.</div>
        )}
      </div>
    ));
  };

  const renderBoardWidget = (widget) => {
    const state = gmState?.state || gmState || {};
    const objectives = state.objectives || {};
    const confidence = state.board_confidence ?? state.boardConfidence ?? null;
    const job = state.job_security ?? state.jobSecurity ?? null;
    const entries = Object.entries(objectives || {}).slice(0, 8);

    return renderWidgetShell(widget, (
      <div className="hub-board-widget">
        <div className="detail-list">
          <div>Confianza: <span className="mono">{confidence ?? "--"}</span></div>
          <div>Puesto: <span className="mono">{job ?? "--"}</span></div>
        </div>
        {entries.length ? (
          <div style={{ marginTop: 10 }}>
            <div className="section-title">Objetivos</div>
            <div className="detail-list">
              {entries.map(([k, v]) => (
                <div key={k}>
                  {k}: <span className="mono">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="desc" style={{ marginTop: 10 }}>Sin objetivos.</div>
        )}
      </div>
    ));
  };

  const renderMatchupsWidget = (widget) =>
    renderWidgetShell(widget, (
      <div className="hub-matchups-widget">
        <div className="desc">Duelos clave y asignaciones recomendadas. (MVP)</div>
        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Tacticas", view: "matchups" })}>
            Abrir matchups
          </button>
        </div>
      </div>
    ));

  const renderDevelopmentWidget = (widget) =>
    renderWidgetShell(widget, (
      <div className="hub-development-widget">
        <div className="desc">Entrenamiento individual, mentoring y seguimiento. (MVP)</div>
        <div className="hub-row" style={{ marginTop: 10 }}>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Entrenamiento", view: "team" })}>
            Entrenamiento
          </button>
          <button className="subnav-item secondary" type="button" onClick={() => onNavigate?.({ section: "Entrenamiento", view: "personal" })}>
            Individual
          </button>
        </div>
      </div>
    ));

  const renderYouthWidget = (widget) =>
    renderWidgetShell(widget, (
      <div className="hub-youth-widget">
        <div className="desc">Talentos de cantera, informes y plan de integración. (MVP)</div>
      </div>
    ));

  const normalizedLayout = useMemo(() => {
    const base = (HUB_PRESETS[presetId] || HUB_PRESETS.classic).layout || [];
    const current = Array.isArray(layout) ? layout : [];
    const byId = new Map(current.map((w) => [w.id, w]));
    const out = [];
    base.forEach((w, idx) => {
      const existing = byId.get(w.id);
      out.push({ ...w, ...(existing || {}), order: existing?.order ?? w.order ?? idx });
    });
    current.forEach((w) => {
      if (!w?.id) return;
      if (out.some((x) => x.id === w.id)) return;
      out.push({ ...w, order: w.order ?? out.length });
    });
    return out;
  }, [layout, presetId]);

  const byZone = (zone) =>
    normalizedLayout
      .filter((w) => w.zone === zone && !w.hidden)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const topWidgets = byZone("top");
  const leftWidgets = byZone("left");
  const centerWidgets = byZone("center");
  const rightWidgets = byZone("right");

  const widgetRenderer = (widget) => {
    if (!widget?.id) return null;
    switch (widget.id) {
      case "alerts":
        return renderAlertsWidget();
      case "inbox":
        return renderInboxWidget(widget);
      case "todo":
        return renderTodoWidget(widget);
      case "today":
        return renderTodayWidget(widget);
      case "next_event":
        return renderNextEventWidget(widget);
      case "next_match":
        return renderNextMatchWidget(widget);
      case "results":
        return renderResultsWidget(widget);
      case "training":
        return renderTrainingWidget(widget);
      case "squad_state":
        return renderSquadStateWidget(widget);
      case "medical":
        return renderMedicalWidget(widget);
      case "finance":
        return renderFinanceWidget(widget);
      case "market":
        return renderMarketWidget(widget);
      case "watchlist":
        return renderWatchlistWidget(widget);
      case "recent":
        return renderRecentWidget(widget);
      case "meetings":
        return renderMeetingsWidget(widget);
      case "decisions":
        return renderDecisionsWidget(widget);
      case "deadlines":
        return renderDeadlinesWidget(widget);
      case "board":
        return renderBoardWidget(widget);
      case "staff":
        return renderStaffWidget(widget);
      case "analysis":
        return renderAnalysisWidget(widget);
      case "yesterday":
        return renderYesterdayWidget(widget);
      case "matchups":
        return renderMatchupsWidget(widget);
      case "development":
        return renderDevelopmentWidget(widget);
      case "youth":
        return renderYouthWidget(widget);
      case "comms":
        return renderCommsWidget(widget);
      case "settings":
        return renderSettingsWidget(widget);
      default:
        return renderWidgetShell(widget, <div className="desc">Widget pendiente.</div>);
    }
  };

  const pickerQuery = widgetPickerQuery.trim().toLowerCase();
  const allWidgetIds = Object.keys(WIDGET_META).filter((id) => id !== "alerts");
  const visibleWidgetIds = new Set(normalizedLayout.filter((w) => !w.hidden).map((w) => w.id));

  const applyImportedLayout = () => {
    const parsed = safeJsonParse(layoutJsonDraft, null);
    if (Array.isArray(parsed) && parsed.length) {
      setLayout(normalizeLayoutOrders(parsed));
      setLayoutJsonOpen(false);
    }
  };

  const downloadLayout = () => {
    try {
      const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pcbasket-hub-layout-${myTeamId || "0"}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 400);
    } catch {
      // ignore
    }
  };

  const copyLayout = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(layout, null, 2));
    } catch {
      // ignore
    }
  };

  return (
    <>
      <section className={`hub-fm ${focusCenter ? "hub-focus-center" : ""}`}>
        <div className="hub-fm-top">
          {topWidgets.length ? topWidgets.map((w) => <React.Fragment key={w.id}>{widgetRenderer(w)}</React.Fragment>) : renderAlertsWidget()}
        </div>
        <div className="hub-fm-body">
          <aside className="hub-zone hub-zone-left">
            {leftWidgets.map((w) => (
              <React.Fragment key={w.id}>{widgetRenderer(w)}</React.Fragment>
            ))}
          </aside>
          <main className="hub-zone hub-zone-center">
            {centerWidgets.map((w) => (
              <React.Fragment key={w.id}>{widgetRenderer(w)}</React.Fragment>
            ))}
          </main>
          <aside className="hub-zone hub-zone-right">
            {rightWidgets.map((w) => (
              <React.Fragment key={w.id}>{widgetRenderer(w)}</React.Fragment>
            ))}
          </aside>
        </div>
      </section>

      {widgetPickerOpen && (
        <div className="hub-modal" onClick={() => setWidgetPickerOpen(false)}>
          <div className="hub-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="hub-modal-head">
              <div>
                <div className="eyebrow">Personalización</div>
                <h3>Widgets</h3>
              </div>
              <button className="close" type="button" onClick={() => setWidgetPickerOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="hub-modal-body">
              <div className="hub-toolbar">
                <div className="hub-field">
                  <span className="hub-field-icon">
                    <Inbox size={14} />
                  </span>
                  <input type="text" value={widgetPickerQuery} placeholder="Filtrar widgets…" onChange={(e) => setWidgetPickerQuery(e.target.value)} />
                </div>
                <span className="pill subtle">{visibleWidgetIds.size}/{allWidgetIds.length} visibles</span>
              </div>
              <div className="hub-picker-list">
                {allWidgetIds
                  .filter((id) => {
                    if (!pickerQuery) return true;
                    const title = String(WIDGET_META[id]?.title || id).toLowerCase();
                    return id.includes(pickerQuery) || title.includes(pickerQuery);
                  })
                  .map((id) => {
                    const existing = normalizedLayout.find((w) => w.id === id) || null;
                    const seed = seedWidgetConfig(id);
                    const zone = existing?.zone || seed.zone;
                    const size = existing?.size || seed.size;
                    const hidden = Boolean(existing?.hidden);
                    const visible = visibleWidgetIds.has(id);
                    return (
                      <div key={id} className={`hub-picker-row ${visible ? "visible" : "hidden"}`}>
                        <div className="hub-picker-main">
                          <div className="hub-picker-title">{WIDGET_META[id]?.title || id}</div>
                          <div className="desc mono">{id}</div>
                        </div>
                        <div className="hub-picker-actions">
                          <select className="hub-select" value={zone} onChange={(e) => upsertWidget(id, { zone: e.target.value, hidden: false })} title="Zona">
                            <option value="left">left</option>
                            <option value="center">center</option>
                            <option value="right">right</option>
                          </select>
                          <select className="hub-select" value={size} onChange={(e) => upsertWidget(id, { size: e.target.value, hidden: false })} title="Tamaño">
                            {SIZES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          {!existing ? (
                            <button className="subnav-item secondary" type="button" onClick={() => upsertWidget(id, { ...seed, hidden: false })}>
                              Añadir
                            </button>
                          ) : hidden ? (
                            <button className="subnav-item secondary" type="button" onClick={() => upsertWidget(id, { hidden: false })}>
                              Mostrar
                            </button>
                          ) : (
                            <button className="subnav-item secondary" type="button" onClick={() => upsertWidget(id, { hidden: true })}>
                              Ocultar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {layoutJsonOpen && (
        <div className="hub-modal" onClick={() => setLayoutJsonOpen(false)}>
          <div className="hub-modal-card hub-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="hub-modal-head">
              <div>
                <div className="eyebrow">Layout</div>
                <h3>{layoutJsonMode === "export" ? "Exportar JSON" : "Importar JSON"}</h3>
              </div>
              <button className="close" type="button" onClick={() => setLayoutJsonOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="hub-modal-body">
              <textarea
                className="hub-textarea"
                value={layoutJsonMode === "export" ? JSON.stringify(layout, null, 2) : layoutJsonDraft}
                onChange={(e) => setLayoutJsonDraft(e.target.value)}
                readOnly={layoutJsonMode === "export"}
              />
              <div className="hub-row" style={{ marginTop: 10 }}>
                {layoutJsonMode === "export" ? (
                  <>
                    <button className="subnav-item secondary" type="button" onClick={copyLayout}>
                      Copiar
                    </button>
                    <button className="subnav-item secondary" type="button" onClick={downloadLayout}>
                      Descargar
                    </button>
                  </>
                ) : (
                  <button className="subnav-item primary" type="button" onClick={applyImportedLayout}>
                    Aplicar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="hub-modal" onClick={() => setHelpOpen(false)}>
          <div className="hub-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="hub-modal-head">
              <div>
                <div className="eyebrow">Ayuda</div>
                <h3>Atajos y uso</h3>
              </div>
              <button className="close" type="button" onClick={() => setHelpOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="hub-modal-body">
              <div className="detail-list">
                <div><span className="mono">Esc</span>: cerrar modales</div>
                <div><span className="mono">?</span>: abrir/cerrar ayuda</div>
                <div><span className="mono">Personalizar</span>: cambia zona/tamaño, sube/baja, oculta widgets</div>
                <div><span className="mono">Widgets</span>: añade/oculta widgets del catálogo</div>
                <div><span className="mono">Focus centro</span>: oculta columnas laterales</div>
              </div>
              <div className="desc" style={{ marginTop: 10 }}>
                Tip: desde <span className="mono">Alertas</span> puedes saltar a <span className="mono">Decisiones</span> y <span className="mono">Reuniones</span>.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
