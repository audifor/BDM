import React, { useMemo, useState, useEffect, useRef } from "react";
import { COMMS_CHANNELS, COMMS_TYPES, COMMS_DM_PRESETS } from "../../data/commsPresets";

const formatEffect = (effect) => {
  if (!effect) return "";
  const labels = {
    morale: "Moral",
    fatigue: "Fatiga",
    cohesion: "Cohesion",
    tactical: "Tactica",
    recovery: "Recuperacion",
    prep: "Preparacion",
  };
  return Object.entries(effect)
    .map(([key, value]) => {
      const label = labels[key] || key;
      const sign = value >= 0 ? "+" : "";
      return `${sign}${value} ${label}`;
    })
    .join(" | ");
};

const getChannelLabel = (id) => COMMS_CHANNELS.find((c) => c.id === id)?.label || id;

const INITIAL_CONTACTS = [];

export default function CommsConsole({ loopTeamState, onApplyEffect, myTeamId }) {
  const [activeRoom, setActiveRoom] = useState(COMMS_CHANNELS[0]?.id || "all");
  const [activeType, setActiveType] = useState(COMMS_TYPES[0]?.id || "");
  const [log, setLog] = useState([]);
  const [composeMessage, setComposeMessage] = useState("");
  const [activeDmTarget, setActiveDmTarget] = useState("");
  const [directContacts, setDirectContacts] = useState(INITIAL_CONTACTS);
  const [contactMeta, setContactMeta] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchTimerRef = useRef(null);
  const searchReqRef = useRef(0);
  const visibleLog = useMemo(() => {
    let items = log;
    if (activeRoom === "dm") {
      if (!activeDmTarget) return [];
      items = log.filter((entry) => entry.channel === "dm" && entry.channelLabel === activeDmTarget);
    } else if (activeRoom !== "all") {
      items = log.filter((entry) => entry.channel === activeRoom);
    }
    return [...items].reverse();
  }, [log, activeRoom, activeDmTarget]);
  const allMembers = useMemo(() => {
    const pool = new Set(directContacts);
    searchResults.forEach((item) => {
      if (item?.name) pool.add(item.name);
    });
    return Array.from(pool);
  }, [directContacts, searchResults]);
  const targetMeta = useMemo(() => {
    if (activeRoom !== "dm" || !activeDmTarget) return null;
    return contactMeta[activeDmTarget] || null;
  }, [activeRoom, activeDmTarget, contactMeta]);
  const targetCategory = useMemo(() => {
    if (activeRoom !== "dm") return "channel";
    if (!activeDmTarget) return "unknown";
    if (!targetMeta) return "unknown";
    const type = targetMeta.type;
    const teamId = targetMeta.team_id;
    const sameTeam = teamId && myTeamId ? String(teamId) === String(myTeamId) : false;
    if (type === "agent") return "agent";
    if (type === "player") return sameTeam ? "player_internal" : "player_external";
    if (type === "staff" || type === "board") return sameTeam ? "staff_internal" : "staff_external";
    return "unknown";
  }, [activeRoom, activeDmTarget, targetMeta, myTeamId]);

  const filteredTypes = useMemo(() => {
    if (activeRoom === "dm") {
      if (targetCategory === "agent") return COMMS_DM_PRESETS.agent || [];
      if (targetCategory === "player_external") return COMMS_DM_PRESETS.player_external || [];
      if (targetCategory === "staff_external") return COMMS_DM_PRESETS.staff_external || [];
      if (targetCategory === "player_internal") {
        const ids = new Set(["locker_motivation", "role_clarity", "discipline_warning", "scouting_brief"]);
        return COMMS_TYPES.filter((type) => ids.has(type.id));
      }
      if (targetCategory === "staff_internal") {
        const ids = new Set([
          "training_focus",
          "medical_update",
          "analytics_nudge",
          "front_office_alignment",
          "leadership_alignment",
          "media_control",
          "scouting_brief",
        ]);
        return COMMS_TYPES.filter((type) => ids.has(type.id));
      }
      return COMMS_TYPES;
    }
    if (activeRoom === "all") return COMMS_TYPES;
    return COMMS_TYPES.filter((type) => type.channel === activeRoom);
  }, [activeRoom, targetCategory]);

  useEffect(() => {
    if (!filteredTypes.length) return;
    if (!filteredTypes.find((type) => type.id === activeType)) {
      setActiveType(filteredTypes[0].id);
    }
  }, [filteredTypes, activeType]);

  const activeTypeData = useMemo(
    () => filteredTypes.find((type) => type.id === activeType) || filteredTypes[0],
    [filteredTypes, activeType],
  );
  const activeRoomLabel = activeRoom === "dm" && activeDmTarget ? `DM ${activeDmTarget}` : getChannelLabel(activeRoom);
  const mentionQuery = useMemo(() => {
    const trimmed = composeMessage.trimStart();
    if (!trimmed.startsWith("@")) return "";
    return trimmed.slice(1).split(" ")[0];
  }, [composeMessage]);
  const ensureContact = (name) => {
    if (!name) return;
    setDirectContacts((prev) => (prev.includes(name) ? prev : [name, ...prev]));
  };
  const formatSearchMeta = (item) => {
    if (!item) return "";
    const parts = [];
    if (item.type === "player") parts.push(item.role || "Jugador");
    if (item.type === "staff") parts.push(item.role || "Staff");
    if (item.type === "board") parts.push(item.role || "Directiva");
    if (item.type === "agent") parts.push("Agente");
    if (item.team_name) parts.push(item.team_name);
    if (item.agency_name) parts.push(item.agency_name);
    return parts.filter(Boolean).join(" · ");
  };
  const handleSearchSelect = (item) => {
    const name = item?.name?.trim();
    if (!name) return;
    ensureContact(name);
    setContactMeta((prev) => ({ ...prev, [name]: item }));
    setActiveRoom("dm");
    setActiveDmTarget(name);
    const trimmed = composeMessage.trimStart();
    if (trimmed.startsWith("@")) {
      const after = trimmed.slice(1);
      const spaceIdx = after.indexOf(" ");
      const rest = spaceIdx === -1 ? "" : after.slice(spaceIdx + 1);
      setComposeMessage(rest.trimStart());
    }
    setSearchOpen(false);
    setSearchResults([]);
    setSearchError("");
  };
  useEffect(() => {
    if (!mentionQuery || mentionQuery.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      setSearchLoading(false);
      setSearchError("");
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      return;
    }
    setSearchOpen(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      const requestId = ++searchReqRef.current;
      setSearchLoading(true);
      setSearchError("");
      try {
        if (!window.pcbasket?.invoke) {
          setSearchResults([]);
          setSearchLoading(false);
          return;
        }
        const res = await window.pcbasket.invoke("person.search", { query: mentionQuery, limit: 12 });
        if (res?.ok === false) {
          throw new Error(res?.error?.message || "Error");
        }
        if (requestId !== searchReqRef.current) return;
        const items = res?.result?.items || [];
        setSearchResults(items);
      } catch (err) {
        if (requestId !== searchReqRef.current) return;
        setSearchResults([]);
        setSearchError("No se pudo buscar en el backend.");
      } finally {
        if (requestId === searchReqRef.current) {
          setSearchLoading(false);
        }
      }
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [mentionQuery]);
  const resolveTargetFromPrefix = (text) => {
    if (!text) return null;
    const trimmed = text.trim();
    if (trimmed.startsWith("@")) {
      const directMatch = allMembers.find((name) =>
        trimmed.toLowerCase().startsWith(`@${name.toLowerCase()}`),
      );
      if (directMatch) {
        return { room: "dm", dm: directMatch, rest: trimmed.slice(directMatch.length + 1).trim() };
      }
      const candidate = trimmed.slice(1).split(" ")[0];
      if (candidate) {
        return { room: "dm", dm: candidate, rest: trimmed.slice(candidate.length + 2).trim() };
      }
    }
    if (trimmed.startsWith("#")) {
      const candidate = trimmed.slice(1).split(" ")[0];
      const match = COMMS_CHANNELS.find((c) => c.id.toLowerCase() === candidate.toLowerCase() || c.label.toLowerCase().replace("#", "") === candidate.toLowerCase());
      if (match) return { room: match.id, rest: trimmed.slice(candidate.length + 2).trim() };
    }
    return null;
  };

  const handleSend = (message) => {
    if (!activeTypeData) return;
    if (activeRoom === "dm" && !activeDmTarget) return;
    if (activeRoom === "dm" && activeDmTarget) {
      ensureContact(activeDmTarget);
    }
    const timestamp = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const isDm = activeRoom === "dm";
    const channelLabel = isDm ? (activeDmTarget || "Directo") : getChannelLabel(activeRoom);
    const entry = {
      id: `${activeTypeData.id}-${Date.now()}`,
      time: timestamp,
      channel: isDm ? "dm" : activeRoom,
      channelLabel,
      typeLabel: activeTypeData.label,
      text: message,
      effect: activeTypeData.effect || {},
    };
    setLog((prev) => [entry, ...prev].slice(0, 18));
    if (onApplyEffect) {
      onApplyEffect(activeTypeData.effect || {});
    }
  };

  const handleSendCompose = () => {
    if (!composeMessage.trim()) return;
    const timestamp = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    let channel = activeRoom;
    let channelLabel = activeRoomLabel;
    let typeLabel = "Manual";
    let messageText = composeMessage.trim();
    const prefixTarget = resolveTargetFromPrefix(messageText);
    if (prefixTarget) {
      messageText = prefixTarget.rest || "";
      if (!messageText) {
        setComposeMessage("");
        return;
      }
      if (prefixTarget.room === "dm") {
        channel = "dm";
        channelLabel = prefixTarget.dm;
        typeLabel = "Directo";
        setActiveRoom("dm");
        setActiveDmTarget(prefixTarget.dm);
        ensureContact(prefixTarget.dm);
        const matched = searchResults.find((item) => item?.name === prefixTarget.dm);
        if (matched) {
          setContactMeta((prev) => ({ ...prev, [prefixTarget.dm]: matched }));
        }
      } else {
        channel = prefixTarget.room;
        channelLabel = getChannelLabel(channel);
        setActiveRoom(channel);
        setActiveDmTarget("");
      }
    } else if (activeRoom === "dm" && !activeDmTarget) {
      return;
    }
    if (activeRoom === "dm" && activeDmTarget) {
      ensureContact(activeDmTarget);
    }
    const entry = {
      id: `manual-${Date.now()}`,
      time: timestamp,
      channel,
      channelLabel,
      typeLabel,
      text: messageText,
      effect: {},
    };
    setLog((prev) => [entry, ...prev].slice(0, 18));
    setComposeMessage("");
  };

  return (
    <div className="comms-console comms-slack">
      <aside className="comms-sidebar">
        <div className="comms-workspace">
          <div className="comms-workspace-title">Comms HQ</div>
          <div className="comms-workspace-sub">Plantilla y staff</div>
        </div>

        <details className="comms-sidebar-section comms-sidebar-group" open>
          <summary>Canales</summary>
          <div className="comms-group-body">
            {COMMS_CHANNELS.map((channel) => (
              <button
                key={channel.id}
              className={`comms-channel ${activeRoom === channel.id ? "active" : ""}`}
              onClick={() => {
                setActiveRoom(channel.id);
                setActiveDmTarget("");
              }}
            >
                <span className="comms-hash">#</span>
                <span className="comms-channel-name">{channel.label}</span>
                {activeRoom === channel.id && <span className="comms-presence" />}
              </button>
            ))}
          </div>
        </details>

        <details className="comms-sidebar-section comms-sidebar-group" open>
          <summary>Chats</summary>
          <div className="comms-group-body">
            {directContacts.map((name) => (
              <button
                key={name}
              className={`comms-dm ${activeDmTarget === name ? "active" : ""}`}
              onClick={() => {
                setActiveRoom("dm");
                setActiveDmTarget(name);
              }}
            >
                {name}
              </button>
            ))}
          </div>
        </details>
      </aside>

      <div className="comms-main">
        <div className="comms-topbar">
          <div>
            <div className="comms-room-title">
              <span className="comms-hash">#</span>
              {activeRoomLabel}
            </div>
            <div className="comms-room-sub">
              Canal operativo - {activeTypeData?.label || "Plantillas"}
            </div>
          </div>
          <div className="comms-metrics">
            <span className="chip muted">Moral {loopTeamState.morale}</span>
            <span className="chip muted">Fatiga {loopTeamState.fatigue}</span>
            <span className="chip muted">Cohesion {loopTeamState.cohesion}</span>
          </div>
        </div>
        <div className="comms-search-area">
          <div className="comms-searchbar">
            <div className="comms-target-pill">{activeRoomLabel}</div>
            <input
              className="comms-search-input"
              placeholder=""
              value={composeMessage}
              onChange={(e) => setComposeMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (searchOpen && mentionQuery && searchResults.length > 0) {
                    e.preventDefault();
                    handleSearchSelect(searchResults[0]);
                    return;
                  }
                  handleSendCompose();
                }
              }}
            />
            <button className="comms-send" onClick={handleSendCompose}>Enviar</button>
          </div>
          {searchOpen && (
            <div className="comms-search-results">
              {searchLoading && <div className="comms-search-item muted">Buscando personas...</div>}
              {!searchLoading && searchError && (
                <div className="comms-search-item muted">{searchError}</div>
              )}
              {!searchLoading && !searchError && searchResults.length === 0 && (
                <div className="comms-search-item muted">Sin resultados.</div>
              )}
              {!searchLoading && !searchError && searchResults.map((item) => (
                <button
                  key={item.id || item.name}
                  className="comms-search-item"
                  onClick={() => handleSearchSelect(item)}
                >
                  <span className="comms-search-name">{item.name}</span>
                  <span className="comms-search-meta">{formatSearchMeta(item)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="comms-content">
          <div className="comms-thread">
            <div className="comms-thread-header">
              <div className="section-title">Actividad</div>
              <span className="tag muted">Live</span>
            </div>
            <div className="comms-thread-scroll">
              {visibleLog.length === 0 ? (
                <div className="comms-empty">
                  <div className="title">{activeRoom === "dm" && !activeDmTarget ? "Selecciona un chat" : "Sin conversaciones aun"}</div>
                  <div className="desc">
                    {activeRoom === "dm" && !activeDmTarget
                      ? "Elige un chat en Comms HQ para empezar."
                      : "Elige una plantilla a la derecha o usa un mensaje sugerido."}
                  </div>
                </div>
              ) : (
                visibleLog.map((entry) => (
                  <div key={entry.id} className="comms-message-row">
                    <div className="comms-avatar">GB</div>
                    <div className="comms-message-body">
                      <div className="comms-message-meta">
                        <span className="comms-sender">Tu</span>
                        <span className="comms-time">{entry.time}</span>
                        <span className="comms-pill">{entry.channelLabel || getChannelLabel(entry.channel)}</span>
                        <span className="comms-pill muted">{entry.typeLabel}</span>
                      </div>
                      <div className="comms-message-text">{entry.text}</div>
                      <div className="comms-message-effect">{formatEffect(entry.effect)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>

          <aside className="comms-panel">
            <details className="comms-panel-card comms-dropdown" open>
              <summary>Plantillas</summary>
              <div className="comms-dropdown-body">
                {filteredTypes.map((type) => (
                  <button
                    key={type.id}
                    className={`comms-type-card ${activeType === type.id ? "active" : ""}`}
                    onClick={() => setActiveType(type.id)}
                  >
                    <div className="comms-type-title">{type.label}</div>
                  </button>
                ))}
              </div>
            </details>

            <details className="comms-panel-card comms-dropdown">
              <summary>Respuestas rapidas</summary>
              <div className="comms-dropdown-body">
                {(activeTypeData?.messages || []).slice(0, 6).map((message, idx) => (
                  <button
                    key={`${activeTypeData?.id}-quick-${idx}`}
                    className="comms-message"
                    onClick={() => handleSend(message)}
                  >
                    {message}
                  </button>
                ))}
              </div>
            </details>

            {activeTypeData && (
              <details className="comms-panel-card comms-dropdown">
                <summary>Mensajes sugeridos</summary>
                <div className="comms-dropdown-body">
                  {activeTypeData.messages.map((message, idx) => (
                    <button
                      key={`${activeTypeData.id}-${idx}`}
                      className="comms-message"
                      onClick={() => handleSend(message)}
                    >
                      {message}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
