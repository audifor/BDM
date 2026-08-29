import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  TrendingUp,
  Flame,
  MessageSquare,
  Share2,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
} from "lucide-react";

export default function BreakingNewsApp({ onBack, onTriggerEvent, seedItems = [], seedOnly = false }) {
  const [activeTab, setActiveTab] = useState("breaking");
  const [news, setNews] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [selectedNews, setSelectedNews] = useState(null);

  useEffect(() => {
    const generatedNews = seedItems.length ? seedItems : [];
    setNews(generatedNews);

    const interval = setInterval(() => {
      // Placeholder para futuras actualizaciones desde DB
    }, 120000);

    return () => clearInterval(interval);
  }, [seedItems, seedOnly]);

  const filteredNews = news.filter((item) => {
    const kind = item?.type || "breaking";
    switch (activeTab) {
      case "breaking":
        return kind !== "rumor" && kind !== "analysis";
      case "rumors":
        return kind === "rumor";
      case "analysis":
        return kind === "analysis";
      default:
        return true;
    }
  });

  const handleResponse = (newsItem) => {
    setSelectedNews(newsItem);
    setShowResponseModal(true);
  };

  const submitResponse = (action) => {
    if (!selectedNews) return;
    if (onTriggerEvent) {
      onTriggerEvent({
        type: "news_response",
        newsId: selectedNews.id,
        action,
        impact: selectedNews.impact,
      });
    }

    setShowResponseModal(false);
    setSelectedNews(null);
  };

  return (
    <div className="h-full bg-[#0b1014] text-white flex flex-col font-sans">
      <div className="bg-gradient-to-r from-red-600 to-orange-600 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame size={24} className="text-white" />
            <h1 className="text-2xl font-black">BREAKING NEWS</h1>
          </div>
          <div className="bg-white/20 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </div>
        </div>

        <div className="flex gap-2">
          <TabButton active={activeTab === "breaking"} onClick={() => setActiveTab("breaking")} badge={news.filter((n) => n.type === "breaking" || n.type === "scandal").length}>
            🔥 Breaking
          </TabButton>
          <TabButton active={activeTab === "rumors"} onClick={() => setActiveTab("rumors")} badge={news.filter((n) => n.type === "rumor").length}>
            👀 Rumores
          </TabButton>
          <TabButton active={activeTab === "analysis"} onClick={() => setActiveTab("analysis")} badge={news.filter((n) => n.type === "analysis").length}>
            📊 Análisis
          </TabButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {filteredNews.map((item) => (
          <NewsCard
            key={item.id}
            news={item}
            expanded={expandedId === item.id}
            onExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
            onRespond={() => handleResponse(item)}
          />
        ))}

        {filteredNews.length === 0 && (
          <div className="text-center py-20">
            <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
            <p className="text-gray-400">Todo tranquilo... por ahora</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showResponseModal && selectedNews && (
          <ResponseModal
            news={selectedNews}
            onClose={() => setShowResponseModal(false)}
            onSubmit={submitResponse}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function NewsCard({ news, expanded, onExpand, onRespond }) {
  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case "critical":
        return "border-red-500 bg-red-500/10";
      case "high":
        return "border-orange-500 bg-orange-500/10";
      case "medium":
        return "border-yellow-500 bg-yellow-500/10";
      default:
        return "border-gray-700 bg-[#1f2937]";
    }
  };

  const getTierBadge = (tier) => {
    const colors = {
      1: "bg-green-500 text-white",
      2: "bg-blue-500 text-white",
      3: "bg-yellow-500 text-black",
      4: "bg-gray-500 text-white",
    };
    const labels = {
      1: "MUY CONFIABLE",
      2: "CONFIABLE",
      3: "RUMOR",
      4: "NO VERIFICADO",
    };
    return (
      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${colors[tier] || colors[4]}`}>
        {labels[tier] || labels[4]}
      </span>
    );
  };

  return (
    <motion.div layout className={`border-l-4 ${getUrgencyColor(news.urgency)} m-3 rounded-lg overflow-hidden`}>
      <div className="p-3" onClick={onExpand}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400">{news.timestamp}</span>
            {getTierBadge(news.tier)}
          </div>
          {news.requiresResponse && (
            <div className="bg-red-500/20 border border-red-500/50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertTriangle size={10} className="text-red-400" />
              <span className="text-[9px] text-red-400 font-bold">RESPUESTA REQUERIDA</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold">{news.source}</span>
          {news.verified && <CheckCircle size={12} className="text-blue-400" />}
          <span className="text-xs text-gray-500">{news.sourceHandle}</span>
        </div>

        <h3 className="font-bold text-base mb-2 leading-tight">{news.title}</h3>

        {news.image && (
          <div className="relative w-full h-32 bg-gray-800 rounded-lg overflow-hidden mb-2">
            <img src={news.image} alt="" className="w-full h-full object-cover" />
            {news.type === "breaking" && (
              <div className="absolute top-2 left-2 bg-red-600 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                <Zap size={12} fill="white" />
                BREAKING
              </div>
            )}
          </div>
        )}

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <p className="text-sm text-gray-300 mb-3 leading-relaxed">
                {news.content}
              </p>

              {Object.keys(news.impact || {}).length > 0 && (
                <div className="bg-black/30 p-2 rounded-lg mb-3">
                  <p className="text-xs text-gray-400 mb-1 font-bold">IMPACTO ESTIMADO:</p>
                  <div className="flex gap-3 text-xs">
                    {news.impact.morale && (
                      <span className={news.impact.morale > 0 ? "text-green-400" : "text-red-400"}>
                        Moral: {news.impact.morale > 0 ? "+" : ""}{news.impact.morale}
                      </span>
                    )}
                    {news.impact.reputation && (
                      <span className={news.impact.reputation > 0 ? "text-green-400" : "text-red-400"}>
                        Reputación: {news.impact.reputation > 0 ? "+" : ""}{news.impact.reputation}
                      </span>
                    )}
                    {news.impact.relationship && (
                      <span className={news.impact.relationship > 0 ? "text-green-400" : "text-red-400"}>
                        Relación: {news.impact.relationship > 0 ? "+" : ""}{news.impact.relationship}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {news.requiresResponse && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRespond();
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <AlertCircle size={16} />
                  RESPONDER ({news.deadline})
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
          <span className="flex items-center gap-1">
            <Eye size={12} /> {formatNumber(news.stats?.views)}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare size={12} /> {formatNumber(news.stats?.comments)}
          </span>
          <span className="flex items-center gap-1">
            <Share2 size={12} /> {formatNumber(news.stats?.shares)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function ResponseModal({ news, onClose, onSubmit }) {
  const responses = [
    {
      id: "ignore",
      label: "Ignorar",
      description: "No hacer comentarios públicos",
      risk: "Alto",
      icon: XCircle,
      color: "bg-gray-700",
    },
    {
      id: "deny",
      label: "Desmentir",
      description: "Negar públicamente las acusaciones",
      risk: "Medio",
      icon: AlertCircle,
      color: "bg-blue-600",
    },
    {
      id: "address",
      label: "Abordar Internamente",
      description: "Reunión privada con involucrados",
      risk: "Bajo",
      icon: CheckCircle,
      color: "bg-green-600",
    },
    {
      id: "press",
      label: "Rueda de Prensa",
      description: "Declaración pública oficial",
      risk: "Muy Alto",
      icon: TrendingUp,
      color: "bg-red-600",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-end z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-[#1f2937] rounded-t-3xl p-6 max-h-[80%] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">¿Cómo Responder?</h3>
          <button onClick={onClose} className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
            <XCircle size={16} />
          </button>
        </div>

        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
          <p className="text-xs text-red-400 font-bold mb-1">NOTICIA:</p>
          <p className="text-sm">{news.title}</p>
        </div>

        <div className="space-y-3">
          {responses.map((response) => (
            <button
              key={response.id}
              onClick={() => onSubmit(response.id)}
              className={`w-full ${response.color} hover:opacity-90 p-4 rounded-xl text-left transition-all active:scale-95`}
            >
              <div className="flex items-start gap-3">
                <response.icon size={24} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold">{response.label}</h4>
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                      Riesgo: {response.risk}
                    </span>
                  </div>
                  <p className="text-sm opacity-80">{response.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function TabButton({ active, onClick, badge, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${active ? "bg-white text-red-600" : "bg-white/20 text-white hover:bg-white/30"}`}
    >
      {children}
      {badge > 0 && (
        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-red-600 text-white" : "bg-white/20"}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

function formatNumber(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return "";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}
