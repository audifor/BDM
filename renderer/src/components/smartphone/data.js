const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const hashCode = (input) => {
  const str = String(input || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const nameFromItem = (item, fallback) => (
  item?.name
  || item?.full_name
  || item?.data?.bio?.full_name
  || item?.data?.bio?.name
  || item?.data?.identity?.full_name
  || item?.data?.identity?.name
  || fallback
);

const roleForStaff = (raw) => {
  const value = String(raw || "").toLowerCase();
  if (value.includes("med") || value.includes("fisio") || value.includes("phys")) return "Servicios Médicos";
  if (value.includes("scout")) return "Scouting";
  if (value.includes("coach") || value.includes("asist") || value.includes("entren")) return "Cuerpo Técnico";
  return "Cuerpo Técnico";
};

const makeContact = ({ item, group, role, roleLabel }) => {
  const name = nameFromItem(item, "");
  const stableId = item?.id ?? item?.contact_id ?? hashCode(`${group}:${name || "unknown"}`);
  const relationshipRaw = Number(item?.relationship ?? item?.data?.relationship);
  const relationship = Number.isFinite(relationshipRaw) ? clamp(Math.round(relationshipRaw), 0, 100) : null;
  const status = item?.status || item?.data?.status || "";
  const lastInteraction = item?.lastInteraction || item?.last_interaction || "";
  const unreadMessages = Number.isFinite(Number(item?.unreadMessages ?? item?.unread_messages))
    ? Number(item?.unreadMessages ?? item?.unread_messages)
    : 0;
  const personality = item?.personality || "";
  const avatarColor = item?.avatarColor || item?.avatar_color || "bg-gray-500";
  const stats = item?.stats || {};

  return {
    id: stableId,
    name,
    role,
    roleLabel,
    status,
    relationship,
    lastInteraction,
    unreadMessages,
    personality,
    avatarColor,
    stats,
  };
};


export const buildContacts = ({ players = [], staff = [], board = [], agents = [] }) => {
  const contacts = [];

  players.forEach((item, idx) => {
    const pos = item?.data?.bio?.pos || item?.position;
    const roleLabel = pos ? `Jugador · ${pos}` : "Jugador";
    const contact = makeContact({
      item,
      group: "Jugador",
      role: "Jugador",
      roleLabel,
      idx,
      baseRelationship: 62,
    });
    if (contact.name) contacts.push(contact);
  });

  staff.forEach((item, idx) => {
    const rawRole = item?.role || item?.department;
    const baseRole = roleForStaff(rawRole);
    const roleLabel = rawRole ? `${baseRole} · ${rawRole}` : baseRole;
    const contact = makeContact({
      item,
      group: "Staff",
      role: baseRole,
      roleLabel,
      idx,
      baseRelationship: 68,
    });
    if (contact.name) contacts.push(contact);
  });

  board.forEach((item, idx) => {
    const baseRole = "Directiva";
    const detail = item?.role || item?.category;
    const roleLabel = detail ? `${baseRole} · ${detail}` : baseRole;
    const contact = makeContact({
      item,
      group: "Directiva",
      role: baseRole,
      roleLabel,
      idx,
      baseRelationship: 58,
    });
    if (contact.name) contacts.push(contact);
  });

  agents.forEach((item, idx) => {
    const agency = item?.agency_name || item?.data?.agency_name || item?.data?.agency;
    const roleLabel = agency ? `Agente · ${agency}` : "Agente";
    const contact = makeContact({
      item,
      group: "Agente",
      role: "Agente",
      roleLabel,
      idx,
      baseRelationship: 55,
    });
    if (contact.name) contacts.push(contact);
  });

  return contacts;
};

export const buildNewsItems = ({ news = [], rumors = [], teamName }) => {
  const out = [];
  const team = teamName || "";

  news.forEach((item, idx) => {
    const title = item.title || item.text || item.body || item.content;
    if (!title) return;
    out.push({
      id: item.id ?? hashCode(`news:${title || idx}`),
      type: item.type || "breaking",
      tier: item.tier,
      source: item.source || item.origin || "",
      sourceHandle: item.sourceHandle || item.source_handle || "",
      verified: item.verified,
      title: item.title || title,
      content: item.text || item.body || item.content || "",
      timestamp: item.time || item.timestamp || "",
      image: item.image,
      stats: item.stats || {},
      sentiment: item.sentiment,
      urgency: item.urgency,
      impact: item.impact || {},
      requiresResponse: Boolean(item.requiresResponse),
      deadline: item.deadline,
    });
  });

  rumors.forEach((item, idx) => {
    const title = item.title || item.text || item.body || item.content;
    if (!title) return;
    out.push({
      id: item.id ?? hashCode(`rumor:${title || idx}`),
      type: "rumor",
      tier: item.tier,
      source: item.source || item.origin || "",
      sourceHandle: item.sourceHandle || item.source_handle || "",
      verified: item.verified,
      title: item.title || title,
      content: item.text || item.body || item.content || "",
      timestamp: item.time || item.timestamp || "",
      image: item.image,
      stats: item.stats || {},
      sentiment: item.sentiment,
      urgency: item.urgency,
      impact: item.impact || {},
      requiresResponse: Boolean(item.requiresResponse),
    });
  });

  return out;
};

export const buildSocialFeed = ({ news = [], rumors = [], teamName }) => {
  const team = teamName || "";
  const combined = [...news, ...rumors];
  if (!combined.length) return [];

  return combined
    .map((item, idx) => {
      const body = item.text || item.title || item.body || item.content;
      if (!body) return null;
      return {
        id: item.id ?? hashCode(`social:${body || idx}`),
        sender: item.sender || item.source || (team ? `${team} Media` : ""),
        timestamp: item.time || item.timestamp || "",
        body,
      };
    })
    .filter(Boolean);
};

export const buildProspects = ({ players = [], teamId = null }) => {
  if (!players.length) return [];

  return players
    .filter((p) => {
      const data = p?.data || {};
      const isProspect = Boolean(data.is_prospect || data.is_academy || data.academy_team_id);
      if (!isProspect) return false;
      const academyTeamId = data.academy_team_id;
      const isHidden = Boolean(data.scout_hidden);
      const hasReport = Boolean(data.scout_view);
      if (academyTeamId && teamId && String(academyTeamId) !== String(teamId) && !hasReport) {
        return false;
      }
      if (isHidden && !hasReport) return false;
      return true;
    })
    .map((p) => {
      const name = nameFromItem(p, "");
      if (!name) return null;
      const parts = String(name).split(" ");
      const first = parts.shift() || "";
      const last = parts.join(" ");
      const age = p?.data?.bio?.age ?? p?.age ?? null;
      const height = p?.data?.bio?.height_cm
        ? `${p.data.bio.height_cm} cm`
        : (p?.data?.bio?.height || "");
      const stats = p?.data?.stats || p?.stats || {};
      const matchRaw = p?.data?.scout?.match || p?.data?.scout?.rating || null;
      const match = Number.isFinite(Number(matchRaw)) ? Math.round(Number(matchRaw)) : null;
      const image = p?.data?.photo || p?.data?.bio?.avatar || p?.photo || "";
      const role = p?.data?.bio?.pos || p?.position || "";

      return {
        id: p?.id ?? hashCode(`prospect:${name}`),
        name: first,
        surname: last || "",
        role,
        age,
        height,
        stats,
        image,
        match,
        color: "",
      };
    })
    .filter(Boolean);
};

export const buildScandals = () => [];
