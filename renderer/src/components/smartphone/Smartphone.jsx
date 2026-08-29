import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  X,
  MessageSquare,
  Twitter,
  Battery,
  Wifi,
  Signal,
  Users,
  BrainCircuit,
  Binoculars,
  Lock,
  ChevronUp,
  Flame,
  Phone,
  Camera,
  Target,
  Minimize2,
  Calendar,
  LayoutGrid,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import ChatApp from "./ChatApp";
import SocialApp from "./SocialApp";
import ContactsApp from "./ContactsApp";
import HeadspaceApp from "./HeadspaceApp";
import TalentSwipeApp from "./TalentSwipeApp";
import BreakingNewsApp from "./BreakingNewsApp";
import TheWireApp from "./TheWireApp";
import ScandalFeedApp from "./ScandalFeedApp";
import FanPulseApp from "./FanPulseApp";
import FortuneTellerApp from "./FortuneTellerApp";
import MeetingsApp from "./MeetingsApp";

const seedHistory = () => ({});

export default function Smartphone({
  isOpen,
  onClose,
  teamName,
  contacts = [],
  newsItems = [],
  rumorItems = [],
  socialFeed = [],
  prospects = [],
  scandals = [],
  calls = [],
  voicemails = [],
  meetingsRequests = [],
  meetingsScheduled = [],
  fanPulse = {},
  seedOnly = false,
  sentimentChange = null,
  hotSeatRank = null,
  initialStress = null,
  onEvent,
}) {
  const [isLocked, setIsLocked] = useState(true);
  const [currentApp, setCurrentApp] = useState("home");
  const [notification, setNotification] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null);
  const [mutedContacts, setMutedContacts] = useState([]);
  const [globalChatHistory, setGlobalChatHistory] = useState(() => seedHistory(contacts));
  const [seenNewsIds, setSeenNewsIds] = useState([]);
  const [handledCallIds, setHandledCallIds] = useState([]);
  const [handledScandalIds, setHandledScandalIds] = useState([]);
  const countsRef = useRef(null);
  const hasMountedRef = useRef(false);

  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const sentimentBadge = Number.isFinite(Number(sentimentChange)) && Number(sentimentChange) < -10 ? "!" : undefined;
  const hotSeatBadge = Number.isFinite(Number(hotSeatRank)) && Number(hotSeatRank) <= 5 ? "🔥" : undefined;

  const contactsById = useMemo(() => {
    const map = {};
    contacts.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [contacts]);

  const buildItemKey = (item, fallback) =>
    String(item?.id ?? item?.created_at ?? item?.timestamp ?? item?.title ?? fallback ?? "");

  const rawNewsItems = useMemo(() => [...newsItems, ...rumorItems], [newsItems, rumorItems]);
  const unreadNews = useMemo(() => {
    const seen = new Set(seenNewsIds.map(String));
    return rawNewsItems.filter((item, idx) => !seen.has(buildItemKey(item, idx))).length;
  }, [rawNewsItems, seenNewsIds]);

  const missedCalls = useMemo(() => {
    const handled = new Set(handledCallIds.map(String));
    const incomingCount = calls.filter((call, idx) => !handled.has(buildItemKey(call, idx))).length;
    return incomingCount + (voicemails || []).length;
  }, [calls, voicemails, handledCallIds]);

  const activeScandals = useMemo(() => {
    const handled = new Set(handledScandalIds.map(String));
    return (scandals || []).filter((sc, idx) => !handled.has(buildItemKey(sc, idx))).length;
  }, [scandals, handledScandalIds]);

  const meetingsCount = useMemo(
    () => (meetingsRequests || []).length + (meetingsScheduled || []).length,
    [meetingsRequests, meetingsScheduled],
  );

  useEffect(() => {
    setGlobalChatHistory((prev) => {
      const next = { ...prev };
      contacts.forEach((c) => {
        if (!next[c.id]) next[c.id] = [];
      });
      return next;
    });
  }, [contacts]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setDate(now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const nextCounts = {
      news: unreadNews,
      calls: missedCalls,
      scandals: activeScandals,
      meetings: meetingsCount,
    };
    if (!hasMountedRef.current) {
      countsRef.current = nextCounts;
      hasMountedRef.current = true;
      return;
    }
    const prevCounts = countsRef.current || nextCounts;
    const triggerNotification = (title, msg) => {
      setNotification({ title, msg, contactId: 0 });
      setTimeout(() => setNotification(null), 3000);
    };
    if (nextCounts.calls > prevCounts.calls) {
      triggerNotification("Llamada entrante", `Tienes ${nextCounts.calls} llamadas pendientes`);
    } else if (nextCounts.scandals > prevCounts.scandals) {
      triggerNotification("Escandalo activo", "Revisa el feed de crisis");
    } else if (nextCounts.news > prevCounts.news) {
      triggerNotification("Breaking News", "Nueva noticia disponible");
    } else if (nextCounts.meetings > prevCounts.meetings) {
      triggerNotification("Nueva cita", "Tienes reuniones pendientes");
    }
    countsRef.current = nextCounts;
  }, [unreadNews, missedCalls, activeScandals, meetingsCount]);

  const handleSendMessage = (chatId, text, sender = "me", aiGenerated = false) => {
    if (!chatId) return;
    const newMsg = {
      id: Date.now(),
      text,
      sender,
      time: sender === "me"
        ? "Ahora"
        : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      context: "NEUTRAL",
      replied: sender !== "me",
      aiGenerated,
    };
    setGlobalChatHistory((prev) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), newMsg],
    }));

    if (sender === "other" && activeChatId !== chatId && !mutedContacts.includes(chatId)) {
      const contact = contactsById[chatId];
      setNotification({
        title: contact ? contact.name : "Nuevo mensaje",
        msg: text,
        contactId: chatId,
      });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleGameEvent = (event) => {
    switch (event.type) {
      case "news_response":
        if (event.newsId !== undefined && event.newsId !== null) {
          setSeenNewsIds((prev) => {
            const key = String(event.newsId);
            return prev.includes(key) ? prev : [...prev, key];
          });
        }
        break;
      case "call_ended":
        if (event.callId !== undefined && event.callId !== null) {
          setHandledCallIds((prev) => {
            const key = String(event.callId);
            return prev.includes(key) ? prev : [...prev, key];
          });
        }
        break;
      case "scandal_managed":
        if (event.scandalId !== undefined && event.scandalId !== null) {
          setHandledScandalIds((prev) => {
            const key = String(event.scandalId);
            return prev.includes(key) ? prev : [...prev, key];
          });
        }
        break;
      default:
        break;
    }
    if (onEvent) {
      onEvent(event);
    }
  };

  const toggleMute = (contactId) => {
    setMutedContacts((prev) => (
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    ));
  };

  const renderApp = () => {
    switch (currentApp) {
      case "chat":
        return (
          <ChatApp
            contactsById={contactsById}
            initialChatId={activeChatId}
            history={globalChatHistory}
            onSendMessage={handleSendMessage}
            onBack={() => { setCurrentApp("home"); setActiveChatId(null); }}
            mutedContacts={mutedContacts}
          />
        );
      case "contacts":
        return (
          <ContactsApp
            contacts={contacts}
            mutedContacts={mutedContacts}
            onToggleMute={toggleMute}
            onNavigateToChat={(contact) => {
              if (!globalChatHistory[contact.id]) {
                setGlobalChatHistory((prev) => ({ ...prev, [contact.id]: [] }));
              }
              setActiveChatId(contact.id);
              setCurrentApp("chat");
            }}
            onOpenExternalProfile={() => {
              setNotification({ title: "Sistema", msg: "Ficha abierta en pantalla principal", contactId: 0 });
              setTimeout(() => setNotification(null), 3000);
            }}
          />
        );
      case "social":
        return <SocialApp feed={socialFeed} />;
      case "headspace":
        return <HeadspaceApp stress={initialStress} />;
      case "swipe":
        return <TalentSwipeApp prospects={prospects} />;
      case "news":
        return (
          <BreakingNewsApp
            onBack={() => setCurrentApp("home")}
            onTriggerEvent={handleGameEvent}
            seedItems={[...newsItems, ...rumorItems]}
            seedOnly={seedOnly}
          />
        );
      case "wire":
        return (
          <TheWireApp
            onBack={() => setCurrentApp("home")}
            onTriggerEvent={handleGameEvent}
            seedCalls={calls}
            seedVoicemails={voicemails}
            seedOnly={seedOnly}
          />
        );
      case "scandal":
        return (
          <ScandalFeedApp
            onBack={() => setCurrentApp("home")}
            onTriggerEvent={handleGameEvent}
            seedItems={scandals}
            seedOnly={seedOnly}
          />
        );
      case "fanpulse":
        return (
          <FanPulseApp
            onBack={() => setCurrentApp("home")}
            onTriggerEvent={handleGameEvent}
            feed={fanPulse.feed || fanPulse.posts || []}
            trending={fanPulse.trending || []}
            polls={fanPulse.polls || []}
            sentiment={fanPulse.sentiment || null}
          />
        );
      case "fortune":
        return (
          <FortuneTellerApp
            onBack={() => setCurrentApp("home")}
            teamName={teamName}
            hotSeatRank={hotSeatRank}
            predictions={fanPulse?.predictions || fanPulse?.fortune?.predictions || []}
            rankings={fanPulse?.rankings || fanPulse?.fortune?.rankings || []}
            hotSeat={fanPulse?.hotSeat || fanPulse?.fortune?.hotSeat || []}
            expectations={fanPulse?.expectations || fanPulse?.fortune?.expectations || []}
            narratives={fanPulse?.narratives || fanPulse?.fortune?.narratives || []}
          />
        );
      case "meetings":
        return (
          <MeetingsApp
            onBack={() => setCurrentApp("home")}
            requests={meetingsRequests}
            scheduled={meetingsScheduled}
            seedOnly={seedOnly}
          />
        );
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: 500, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 500, opacity: 0 }}
          className="fixed bottom-8 right-8 w-[320px] h-[640px] bg-black rounded-[45px] border-[8px] border-gray-900 shadow-2xl overflow-hidden flex flex-col z-50 ring-4 ring-black/20 font-sans"
        >
          <div className="absolute top-0 w-full z-50">
            <div className="h-8 flex justify-between items-center px-6 text-[10px] text-white pt-2 font-medium">
              <span>{time}</span>

              <div className="absolute left-1/2 -translate-x-1/2 top-2 w-20 h-5 bg-black rounded-b-xl z-0 pointer-events-none" />

              <div className="flex gap-2 items-center z-10">
                <div className="flex gap-1.5"><Signal size={12} /><Wifi size={12} /><Battery size={12} /></div>
                <button
                  onClick={onClose}
                  className="ml-2 w-6 h-6 bg-white/10 hover:bg-red-500/80 rounded-full flex items-center justify-center transition-colors cursor-pointer backdrop-blur-md z-50"
                  title="Guardar móvil"
                >
                  <Minimize2 size={12} className="text-white" />
                </button>
              </div>
            </div>

            <div className="absolute left-1/2 -translate-x-1/2 top-2 flex justify-center w-full pointer-events-none">
              <AnimatePresence>
                {notification ? (
                  <motion.div
                    initial={{ width: 96, height: 24, borderRadius: 12, opacity: 0 }}
                    animate={{ width: 280, height: 60, borderRadius: 20, opacity: 1 }}
                    exit={{ width: 96, height: 24, borderRadius: 12, opacity: 0 }}
                    className="bg-zinc-900/90 backdrop-blur-md shadow-xl flex items-center gap-3 px-4 cursor-pointer pointer-events-auto mt-2"
                    onClick={() => {
                      if (notification.contactId) {
                        setActiveChatId(notification.contactId);
                        setCurrentApp("chat");
                      }
                      setNotification(null);
                    }}
                  >
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                      <MessageSquare size={16} fill="white" />
                    </div>
                    <div className="flex-1 min-w-0 text-white">
                      <h4 className="font-bold text-xs">{notification.title}</h4>
                      <p className="text-[10px] truncate text-gray-300">{notification.msg}</p>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop')" }} />
          <div className="absolute inset-0 bg-black/20" />

          <div className="relative flex-1 flex flex-col z-10 h-full">
            {isLocked ? (
              <div className="flex-1 flex flex-col items-center justify-start pt-24 backdrop-blur-sm text-white" onClick={() => setIsLocked(false)}>
                <Lock size={20} className="mb-4 opacity-50" />
                <h1 className="text-6xl font-thin tracking-tighter">{time}</h1>
                <p className="mt-2 text-sm font-light opacity-80">{date}</p>

                <div className="mt-8 w-full px-6 space-y-2">
                  {unreadNews > 0 && (
                    <div className="bg-red-600/80 backdrop-blur-md p-3 rounded-xl text-white">
                      <p className="text-xs font-bold">🚨 Breaking News</p>
                      <p className="text-[10px] opacity-80">{unreadNews} noticias sin leer</p>
                    </div>
                  )}
                  {missedCalls > 0 && (
                    <div className="bg-blue-600/80 backdrop-blur-md p-3 rounded-xl text-white">
                      <p className="text-xs font-bold">📞 Llamadas Perdidas</p>
                      <p className="text-[10px] opacity-80">{missedCalls} llamadas urgentes</p>
                    </div>
                  )}
                  {activeScandals > 0 && (
                    <div className="bg-pink-600/80 backdrop-blur-md p-3 rounded-xl text-white">
                      <p className="text-xs font-bold">📸 Escándalos Activos</p>
                      <p className="text-[10px] opacity-80">{activeScandals} crisis sin gestionar</p>
                    </div>
                  )}
                </div>

                <div className="mt-auto mb-10 animate-bounce flex flex-col items-center opacity-50">
                  <ChevronUp />
                  <span className="text-[10px]">Deslizar</span>
                </div>
              </div>
            ) : (
              <>
                {currentApp === "home" ? (
                  <div className="flex-1 p-5 flex flex-col">
                    <div className="grid grid-cols-4 gap-3 mt-16">
                      <AppIcon
                        icon={<Flame size={28} />}
                        label="News"
                        color="bg-red-500"
                        badge={unreadNews}
                        onClick={() => setCurrentApp("news")}
                      />
                      <AppIcon
                        icon={<Phone size={28} />}
                        label="Wire"
                        color="bg-blue-500"
                        badge={missedCalls}
                        onClick={() => setCurrentApp("wire")}
                      />
                      <AppIcon
                        icon={<Camera size={28} />}
                        label="Scandal"
                        color="bg-pink-500"
                        badge={activeScandals}
                        onClick={() => setCurrentApp("scandal")}
                      />
                      <AppIcon
                        icon={<Users size={28} />}
                        label="Pulse"
                        color="bg-purple-500"
                        badge={sentimentBadge}
                        onClick={() => setCurrentApp("fanpulse")}
                      />
                      <AppIcon
                        icon={<Target size={28} />}
                        label="Fortune"
                        color="bg-indigo-500"
                        badge={hotSeatBadge}
                        onClick={() => setCurrentApp("fortune")}
                      />
                      <AppIcon
                        icon={<BrainCircuit size={28} />}
                        label="Mind"
                        color="bg-teal-500"
                        onClick={() => setCurrentApp("headspace")}
                      />
                      <AppIcon
                        icon={<Binoculars size={28} />}
                        label="Scout"
                        color="bg-amber-500"
                        onClick={() => setCurrentApp("swipe")}
                      />
                      <AppIcon
                        icon={<Calendar size={28} />}
                        label="Meet"
                        color="bg-emerald-500"
                        onClick={() => setCurrentApp("meetings")}
                      />
                      <AppIcon
                        icon={<LayoutGrid size={28} />}
                        label="Apps"
                        color="bg-slate-500"
                        onClick={() => setCurrentApp("contacts")}
                      />
                    </div>

                    <div className="flex-1" />

                    <div className="bg-white/10 backdrop-blur-xl p-4 rounded-[30px] flex justify-around items-end border border-white/10 shadow-lg mb-6">
                      <DockIcon
                        icon={<MessageSquare fill="white" size={24} />}
                        color="bg-green-500"
                        onClick={() => setCurrentApp("chat")}
                      />
                      <DockIcon
                        icon={<Users fill="white" size={24} />}
                        color="bg-orange-500"
                        onClick={() => setCurrentApp("contacts")}
                      />
                      <DockIcon
                        icon={<Twitter fill="white" size={24} />}
                        color="bg-blue-400"
                        onClick={() => setCurrentApp("social")}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-black z-20 pt-8 rounded-[35px] overflow-hidden">
                    {renderApp()}
                  </div>
                )}

                <div
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-white/50 rounded-full cursor-pointer z-50"
                  onClick={() => setCurrentApp("home")}
                />
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const DockIcon = ({ icon, color, badge, onClick }) => (
  <motion.button
    whileTap={{ scale: 0.8 }}
    onClick={onClick}
    className={`relative w-14 h-14 ${color} rounded-2xl flex items-center justify-center shadow-lg text-white border border-white/10`}
  >
    {icon}
    {badge ? (
      <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-2 border-black flex items-center justify-center text-[9px] font-bold">
        {badge}
      </div>
    ) : null}
  </motion.button>
);

const AppIcon = ({ icon, label, color, badge, onClick }) => (
  <div className="flex flex-col items-center gap-1" onClick={onClick}>
    <motion.div
      whileTap={{ scale: 0.9 }}
      className={`relative w-14 h-14 ${color} rounded-2xl flex items-center justify-center shadow-lg text-white cursor-pointer`}
    >
      {icon}
      {badge ? (
        <div className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 rounded-full border-2 border-black flex items-center justify-center text-[9px] font-bold">
          {badge}
        </div>
      ) : null}
    </motion.div>
    <span className="text-white text-[9px] font-medium">{label}</span>
  </div>
);
