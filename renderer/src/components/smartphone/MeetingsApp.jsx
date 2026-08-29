import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  User,
  Building2,
  Briefcase,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Users,
  MessageSquare,
  ChevronRight,
  XCircle,
} from "lucide-react";

export default function MeetingsApp({ onBack, requests = [], scheduled = [], seedOnly = false }) {
  const [view, setView] = useState("main");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [activeTab, setActiveTab] = useState("requests");
  const resolvedRequests = requests.length ? requests : [];
  const resolvedScheduled = scheduled.length ? scheduled : [];

  const openDetail = (request) => {
    setSelectedRequest(request);
    setView("detail");
  };

  const closeDetail = () => {
    setView("main");
    setSelectedRequest(null);
  };

  const startMeeting = null;

  return (
    <div className="h-full bg-[#0b1014] text-white flex flex-col font-sans">
      <AnimatePresence mode="wait">
        {view === "main" ? (
          <MainView
            key="main"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            requests={resolvedRequests}
            scheduled={resolvedScheduled}
            onOpenDetail={openDetail}
            onBack={onBack}
            onStartMeeting={startMeeting}
          />
        ) : (
          <DetailView key="detail" request={selectedRequest} onBack={closeDetail} />
        )}
      </AnimatePresence>
    </div>
  );
}

function MainView({ activeTab, setActiveTab, requests, scheduled, onOpenDetail, onBack, onStartMeeting }) {
  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="h-full flex flex-col">
      <div className="p-6 pb-4 sticky top-0 bg-[#0b1014] z-10">
        <div className="flex items-center gap-3 mb-4">
          <ArrowLeft size={24} className="cursor-pointer text-gray-400 hover:text-white" onClick={onBack} />
          <h1 className="text-3xl font-bold">Reuniones</h1>
        </div>

        <div className="flex gap-2 bg-[#1f2937]/50 p-1 rounded-xl">
          <TabButton active={activeTab === "requests"} onClick={() => setActiveTab("requests")} count={requests.length}>
            Solicitudes
          </TabButton>
          <TabButton active={activeTab === "scheduled"} onClick={() => setActiveTab("scheduled")} count={scheduled.length}>
            Agendadas
          </TabButton>
          <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")} count={0}>
            Historial
          </TabButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-20 space-y-3">
        {activeTab === "requests" && requests.map((request) => (
          <RequestCard key={request.id} request={request} onClick={() => onOpenDetail(request)} />
        ))}

        {activeTab === "scheduled" && scheduled.map((meeting) => (
          <ScheduledCard key={meeting.id} meeting={meeting} onStartMeeting={onStartMeeting} />
        ))}

        {activeTab === "history" && (
          <div className="text-center text-gray-500 py-20">
            <Calendar size={48} className="mx-auto mb-4 opacity-30" />
            <p>No hay reuniones pasadas</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function DetailView({ request, onBack }) {
  const [showScheduler, setShowScheduler] = useState(false);

  const getTypeIcon = (type) => {
    switch (type) {
      case "board": return <Building2 size={20} />;
      case "agent": return <Briefcase size={20} />;
      case "player": return <User size={20} />;
      case "sponsor": return <DollarSign size={20} />;
      default: return <Users size={20} />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case "board": return "from-blue-600 to-blue-800";
      case "agent": return "from-purple-600 to-purple-800";
      case "player": return "from-green-600 to-green-800";
      case "sponsor": return "from-orange-600 to-orange-800";
      default: return "from-gray-600 to-gray-800";
    }
  };

  const getUrgencyBadge = (urgency) => {
    const styles = {
      critical: "bg-red-500/20 text-red-400 border-red-500/30",
      high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      low: "bg-green-500/20 text-green-400 border-green-500/30",
    };
    const labels = { critical: "CRÍTICO", high: "ALTA", medium: "MEDIA", low: "BAJA" };

    return (
      <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${styles[urgency]}`}>
        {labels[urgency]}
      </span>
    );
  };

  if (!request) return null;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="h-full flex flex-col">
      <div className={`bg-gradient-to-br ${getTypeColor(request.type)} p-6`}>
        <div className="flex items-center gap-3 mb-4">
          <ArrowLeft size={24} className="cursor-pointer text-white/80 hover:text-white" onClick={onBack} />
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{request.requester}</h2>
            <p className="text-sm text-white/70">{request.requesterRole}</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getTypeIcon(request.type)}
            <span className="text-sm font-semibold">{request.topic}</span>
          </div>
          {getUrgencyBadge(request.urgency)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="bg-[#1f2937] p-4 rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={16} className="text-blue-400" />
            <span className="text-xs font-bold text-gray-400 uppercase">Mensaje</span>
          </div>
          <p className="text-sm leading-relaxed">{request.message}</p>
        </div>
      </div>

      <div className="p-4 bg-[#1f2937] border-t border-gray-700 space-y-2">
        <button onClick={() => setShowScheduler(true)} className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
          <Calendar size={20} />
          AGENDAR REUNIÓN
        </button>
        <div className="flex gap-2">
          <button className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-xl font-bold transition-colors">
            APLAZAR
          </button>
          <button className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 py-3 rounded-xl font-bold transition-colors">
            RECHAZAR
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showScheduler && (
          <SchedulerModal onClose={() => setShowScheduler(false)} request={request} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TabButton({ active, onClick, count, children }) {
  return (
    <button onClick={onClick} className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${active ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>
      {children}
      {count > 0 && (
        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${active ? "bg-white/20" : "bg-gray-700"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function RequestCard({ request, onClick }) {
  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case "critical": return "border-red-500";
      case "high": return "border-orange-500";
      case "medium": return "border-yellow-500";
      default: return "border-green-500";
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "board": return <Building2 size={16} className="text-blue-400" />;
      case "agent": return <Briefcase size={16} className="text-purple-400" />;
      case "player": return <User size={16} className="text-green-400" />;
      case "sponsor": return <DollarSign size={16} className="text-orange-400" />;
      default: return <Users size={16} />;
    }
  };

  return (
    <motion.div whileTap={{ scale: 0.98 }} onClick={onClick} className={`bg-[#1f2937] rounded-xl p-4 cursor-pointer border-l-4 ${getUrgencyColor(request.urgency)} hover:bg-[#2a3642] transition-colors`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {getTypeIcon(request.type)}
          <div>
            <h3 className="font-bold text-sm">{request.requester}</h3>
            <p className="text-xs text-gray-400">{request.requesterRole}</p>
          </div>
        </div>
        <span className="text-xs text-gray-500">{request.date}</span>
      </div>

      <p className="text-sm font-semibold text-blue-400 mb-2">{request.topic}</p>
      <p className="text-xs text-gray-400 line-clamp-2">{request.message}</p>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700">
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <Clock size={12} /> Duración est: 30-45 min
        </span>
        <ChevronRight size={16} className="text-gray-500" />
      </div>
    </motion.div>
  );
}

function ScheduledCard({ meeting, onStartMeeting }) {
  return (
    <div className="bg-[#1f2937] rounded-xl p-4 border border-gray-700">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-sm">{meeting.participant}</h3>
          <p className="text-xs text-gray-400">{meeting.topic}</p>
        </div>
        <CheckCircle2 size={16} className="text-green-500" />
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1"><Calendar size={12} /> {meeting.scheduledDate}</span>
        <span className="flex items-center gap-1"><Clock size={12} /> {meeting.scheduledTime}</span>
        <span>({meeting.duration})</span>
      </div>
      {typeof onStartMeeting === "function" && (
        <button onClick={() => onStartMeeting(meeting.type)} className="w-full mt-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 py-2 rounded-lg text-xs font-bold transition-colors">
          INICIAR REUNI??N
        </button>
      )}
    </div>
  );
}

function SchedulerModal({ onClose, request }) {
  const [selectedDate, setSelectedDate] = useState("mañana");
  const [selectedTime, setSelectedTime] = useState("10:00");

  const dates = ["Hoy", "Mañana", "Pasado Mañana", "Esta Semana"];
  const times = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-end z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-[#1f2937] rounded-t-3xl p-6 max-h-[80%] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Agendar Reunión</h3>
          <button onClick={onClose} className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
            <XCircle size={16} />
          </button>
        </div>

        <div className="mb-6">
          <label className="text-xs text-gray-400 uppercase font-bold mb-2 block">Fecha</label>
          <div className="grid grid-cols-2 gap-2">
            {dates.map((date) => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`py-3 rounded-xl font-bold text-sm transition-colors ${selectedDate === date ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
              >
                {date}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="text-xs text-gray-400 uppercase font-bold mb-2 block">Hora</label>
          <div className="grid grid-cols-3 gap-2">
            {times.map((time) => (
              <button
                key={time}
                onClick={() => setSelectedTime(time)}
                className={`py-3 rounded-xl font-bold text-sm transition-colors ${selectedTime === time ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
              >
                {time}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
          <p className="text-xs text-gray-400 mb-2">REUNIÓN PROGRAMADA:</p>
          <p className="font-bold">{request.requester}</p>
          <p className="text-sm text-gray-400">{selectedDate} a las {selectedTime}</p>
          <p className="text-xs text-gray-500 mt-2">Duración estimada: 45 minutos</p>
        </div>

        <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 py-4 rounded-xl font-bold text-white transition-colors">
          CONFIRMAR REUNIÓN
        </button>
      </motion.div>
    </motion.div>
  );
}
