import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  MoreVertical,
  MessageSquare,
  ExternalLink,
  Bell,
  BellOff,
  Phone,
  Video,
  Mail,
  Star,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

export default function ContactsApp({
  contacts = [],
  onNavigateToChat,
  onOpenExternalProfile,
  mutedContacts = [],
  onToggleMute,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [sortBy, setSortBy] = useState("name");
  const [showFilters, setShowFilters] = useState(false);

  const toggleMute = (e, id) => {
    e.stopPropagation();
    if (onToggleMute) onToggleMute(id);
  };

  let filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
    || c.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  switch (sortBy) {
    case "relationship":
      filtered.sort((a, b) => {
        const relA = Number.isFinite(a.relationship) ? a.relationship : -1;
        const relB = Number.isFinite(b.relationship) ? b.relationship : -1;
        return relB - relA;
      });
      break;
    case "recent":
      filtered.sort((a, b) => {
        const timeA = parseLastInteraction(a.lastInteraction);
        const timeB = parseLastInteraction(b.lastInteraction);
        return timeA - timeB;
      });
      break;
    default:
      filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  const getStatusColor = (status) => {
    switch (status) {
      case "online":
        return "bg-green-500";
      case "busy":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getRelationshipColor = (rel) => {
    if (!Number.isFinite(rel)) return "text-gray-500";
    if (rel >= 80) return "text-green-500";
    if (rel >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getRelationshipTrend = (rel) => {
    if (!Number.isFinite(rel)) return null;
    if (rel >= 80) return <TrendingUp size={12} className="text-green-500" />;
    if (rel >= 60) return <Star size={12} className="text-yellow-500" />;
    return <TrendingDown size={12} className="text-red-500" />;
  };

  return (
    <div className="h-full bg-[#0b1014] text-white flex flex-col font-sans">
      <div className="p-6 pb-2 sticky top-0 bg-[#0b1014] z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Agenda</h1>
          <button onClick={() => setShowFilters(!showFilters)} className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700">
            <MoreVertical size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder=""
            className="w-full bg-[#1f2937] text-white pl-10 pr-4 py-2 rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setSortBy("name")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-colors ${sortBy === "name" ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
                >
                  Nombre
                </button>
                <button
                  onClick={() => setSortBy("relationship")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-colors ${sortBy === "relationship" ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
                >
                  Relación
                </button>
                <button
                  onClick={() => setSortBy("recent")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-colors ${sortBy === "recent" ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
                >
                  Reciente
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 text-xs text-gray-400 mb-2">
          <span>{filtered.length} contactos</span>
          <span>•</span>
          <span>{filtered.filter((c) => c.status === "online").length} online</span>
          <span>•</span>
          <span>{filtered.reduce((sum, c) => sum + c.unreadMessages, 0)} sin leer</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-20 space-y-2">
        {filtered.map((contact) => {
          const isExpanded = expandedId === contact.id;
          const isMuted = mutedContacts.includes(contact.id);

          return (
            <motion.div
              key={contact.id}
              layout
              onClick={() => setExpandedId(isExpanded ? null : contact.id)}
              className={`rounded-xl border transition-colors cursor-pointer overflow-hidden ${isExpanded ? "bg-[#1f2937] border-blue-500/50" : "bg-[#1f2937]/50 border-transparent hover:bg-[#1f2937]"}`}
            >
              <div className="p-3 flex items-center gap-3">
                <div className={`w-1 h-10 rounded-full ${getStatusColor(contact.status)}`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-sm truncate">{contact.name}</h3>
                    {isMuted && <BellOff size={10} className="text-red-400 shrink-0" />}
                    {contact.unreadMessages > 0 && (
                      <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                        {contact.unreadMessages}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{contact.roleLabel || contact.role}</p>

                  <div className="flex items-center gap-3 mt-1">
                    {Number.isFinite(contact.relationship) && (
                      <span className={`text-[10px] font-bold flex items-center gap-1 ${getRelationshipColor(contact.relationship)}`}>
                        {getRelationshipTrend(contact.relationship)}
                        {contact.relationship}%
                      </span>
                    )}
                    <span className="text-[10px] text-gray-500">{contact.lastInteraction}</span>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    {(Number.isFinite(contact.stats?.messages)
                      || Number.isFinite(contact.stats?.meetings)
                      || Number.isFinite(contact.stats?.agreements)) && (
                      <div className="px-3 pb-3 grid grid-cols-3 gap-2 mb-2">
                        <div className="bg-black/30 p-2 rounded-lg text-center">
                          <p className="text-xs text-gray-400">Mensajes</p>
                          <p className="text-sm font-bold">{contact.stats?.messages ?? ""}</p>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg text-center">
                          <p className="text-xs text-gray-400">Reuniones</p>
                          <p className="text-sm font-bold">{contact.stats?.meetings ?? ""}</p>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg text-center">
                          <p className="text-xs text-gray-400">Acuerdos</p>
                          <p className="text-sm font-bold text-green-500">{contact.stats?.agreements ?? ""}</p>
                        </div>
                      </div>
                    )}

                    <div className="px-3 pb-3 flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); onNavigateToChat?.(contact); }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-bold active:scale-95 transition-all"
                      >
                        <MessageSquare size={14} /> Chat
                      </button>

                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenExternalProfile?.(contact.id); }}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-bold active:scale-95 transition-all"
                      >
                        <ExternalLink size={14} /> Ficha
                      </button>

                      <button
                        onClick={(e) => toggleMute(e, contact.id)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center active:scale-95 transition-all border ${isMuted ? "bg-red-500/20 border-red-500 text-red-500" : "bg-gray-700 border-transparent text-gray-300 hover:bg-gray-600"}`}
                      >
                        {isMuted ? <BellOff size={16} /> : <Bell size={16} />}
                      </button>
                    </div>

                    <div className="px-3 pb-3 flex gap-2">
                      <button className="flex-1 bg-gray-800/50 h-8 rounded-lg flex items-center justify-center gap-1 text-xs text-gray-400 hover:bg-gray-800 active:scale-95 transition-all">
                        <Phone size={12} /> Llamar
                      </button>
                      <button className="flex-1 bg-gray-800/50 h-8 rounded-lg flex items-center justify-center gap-1 text-xs text-gray-400 hover:bg-gray-800 active:scale-95 transition-all">
                        <Video size={12} /> Video
                      </button>
                      <button className="flex-1 bg-gray-800/50 h-8 rounded-lg flex items-center justify-center gap-1 text-xs text-gray-400 hover:bg-gray-800 active:scale-95 transition-all">
                        <Mail size={12} /> Email
                      </button>
                    </div>

                    <div className="px-3 pb-2">
                      <span className="inline-block px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded-full text-[10px] text-purple-400 font-bold uppercase">
                        {contact.personality}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <Search size={48} className="mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400">No se encontraron contactos</p>
          </div>
        )}
      </div>
    </div>
  );
}

function parseLastInteraction(text) {
  if (!text) return 999999;
  if (text.includes("m")) {
    const mins = parseInt(text, 10);
    return mins;
  }
  if (text.includes("h")) {
    const hours = parseInt(text, 10);
    return hours * 60;
  }
  if (text.includes("día")) {
    const days = parseInt(text, 10) || 1;
    return days * 24 * 60;
  }
  if (text.includes("semana")) {
    return 7 * 24 * 60;
  }
  return 999999;
}
