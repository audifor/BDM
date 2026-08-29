import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  PhoneOff,
  PhoneMissed,
  Voicemail,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  User,
  X,
  Volume2,
  PhoneIncoming,
  MessageSquare,
} from "lucide-react";

export default function TheWireApp({ onBack, onTriggerEvent, seedCalls = [], seedVoicemails = [], seedOnly = false }) {
  const [view, setView] = useState("home");
  const initialCalls = seedCalls.length ? seedCalls : [];
  const [incomingCalls, setIncomingCalls] = useState(initialCalls);
  const [activeCall, setActiveCall] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentNode, setCurrentNode] = useState(null);
  const missedCalls = useMemo(
    () => (incomingCalls || []).filter((call) => call?.missed).length,
    [incomingCalls],
  );
  const voicemails = useMemo(() => {
    if (seedVoicemails.length) return seedVoicemails;
    return [];
  }, [seedVoicemails, seedOnly]);
  const [selectedVoicemail, setSelectedVoicemail] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (seedOnly) {
      setIncomingCalls(seedCalls);
      return;
    }
    if (seedCalls.length) {
      setIncomingCalls(seedCalls);
    }
  }, [seedCalls, seedOnly]);

  useEffect(() => {
    if (activeCall && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => prev - 1);
      }, 1000);
    } else if (timeRemaining === 0 && activeCall) {
      handleIgnoreCall();
    }
    return () => clearInterval(timerRef.current);
  }, [activeCall, timeRemaining]);

  const handleAnswerCall = (call) => {
    if (!call) return;
    setActiveCall(call);
    setView("active");
    setTimeRemaining(call.timeLimit);
    const startNode = call.dialogue.nodes[call.dialogue.currentNode];
    setCurrentNode(startNode);
    setConversationHistory([{ speaker: "them", text: startNode.text }]);
  };

  const handleIgnoreCall = () => {
    if (!activeCall) return;
    setIncomingCalls((prev) => prev.filter((c) => c.id !== activeCall.id));
    if (onTriggerEvent) {
      onTriggerEvent({ type: "call_ended", callId: activeCall.id, action: "ignored" });
    }
    setActiveCall(null);
    setView("home");
  };

  const handleChooseOption = (option) => {
    const newHistory = [...conversationHistory, { speaker: "me", text: option.text, tone: option.tone }];
    setConversationHistory(newHistory);
    const next = activeCall.dialogue.nodes[option.nextNode];

    if (option.impact && onTriggerEvent) {
      onTriggerEvent({ type: "call_ended", callId: activeCall.id, action: option.id, impact: option.impact });
    }

    if (next.end) {
      setTimeout(() => {
        setActiveCall(null);
        setView("home");
        setIncomingCalls((prev) => prev.filter((c) => c.id !== activeCall.id));
      }, 1600);
      return;
    }

    setCurrentNode(next);
    setConversationHistory((prev) => [...prev, { speaker: "them", text: next.text }]);
  };

  return (
    <div className="h-full bg-[#0b1014] text-white flex flex-col font-sans">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Phone size={24} className="text-white" />
            <h1 className="text-2xl font-black">THE WIRE</h1>
          </div>
          <div className="bg-white/20 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
            <PhoneIncoming size={12} />
            {incomingCalls.length} entrantes
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === "home" && (
          <HomeView
            incomingCalls={incomingCalls}
            voicemailsCount={voicemails.length}
            missedCallsCount={missedCalls}
            onViewVoicemails={() => setView("voicemails")}
            onAnswer={handleAnswerCall}
          />
        )}
        {view === "incoming" && activeCall && (
          <IncomingCallView call={activeCall} timeRemaining={timeRemaining} onAnswer={() => setView("active")} onIgnore={handleIgnoreCall} />
        )}
        {view === "active" && activeCall && currentNode && (
          <ActiveCallView
            call={activeCall}
            currentNode={currentNode}
            conversationHistory={conversationHistory}
            onChoose={handleChooseOption}
            onHangup={handleIgnoreCall}
          />
        )}
        {view === "voicemails" && (
          <VoicemailView
            voicemails={voicemails}
            onBack={() => setView("home")}
            onSelect={setSelectedVoicemail}
            selected={selectedVoicemail}
          />
        )}
      </div>
    </div>
  );
}

function HomeView({ incomingCalls = [], voicemailsCount, missedCallsCount, onViewVoicemails, onAnswer }) {
  const incomingCallsCount = incomingCalls.length;
  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<PhoneIncoming size={20} />} label="Entrantes" value={incomingCallsCount} color="bg-blue-600" />
        <StatCard icon={<Voicemail size={20} />} label="Voicemails" value={voicemailsCount} color="bg-purple-600" />
        <StatCard icon={<PhoneMissed size={20} />} label="Perdidas" value={missedCallsCount} color="bg-red-600" />
      </div>

      <div className="bg-[#1f2937] rounded-xl p-4 border border-gray-700">
        <h3 className="font-bold mb-2">Acciones rápidas</h3>
        <div className="flex gap-2">
          <button onClick={onViewVoicemails} className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm font-bold">
            Ver voicemails
          </button>
        </div>
      </div>

      {incomingCalls.length > 0 && (
        <div className="bg-[#1f2937] rounded-xl p-4 border border-gray-700">
          <h3 className="font-bold mb-3">Llamadas entrantes</h3>
          <div className="space-y-2">
            {incomingCalls.map((call) => (
              <div key={call.id} className="flex items-center justify-between bg-[#111827] p-3 rounded-lg">
                <div>
                  <p className="text-sm font-semibold">{call.contactName}</p>
                  <p className="text-xs text-gray-400">{call.contactRole}</p>
                </div>
                <button
                  onClick={() => onAnswer(call)}
                  className="bg-blue-600 hover:bg-blue-700 text-xs px-3 py-1 rounded-full"
                >
                  Contestar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className={`rounded-xl p-4 ${color} text-white`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs uppercase">{label}</span>
      </div>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}

function IncomingCallView({ call, timeRemaining, onAnswer, onIgnore }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-4">
        <User size={40} className="text-blue-400" />
      </div>
      <h2 className="text-xl font-bold">{call.contactName}</h2>
      <p className="text-sm text-gray-400">{call.contactRole}</p>
      <p className="text-xs text-red-400 mt-2">{call.reason}</p>

      <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
        <Clock size={12} />
        {timeRemaining}s
      </div>

      <div className="flex gap-4 mt-6">
        <button onClick={onIgnore} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center">
          <PhoneOff size={26} />
        </button>
        <button onClick={onAnswer} className="w-16 h-16 rounded-full bg-green-600 flex items-center justify-center">
          <Phone size={26} />
        </button>
      </div>
    </div>
  );
}

function ActiveCallView({ call, currentNode, conversationHistory, onChoose, onHangup }) {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="font-bold">{call.contactName}</h2>
          <p className="text-xs text-gray-400">{call.contactRole}</p>
        </div>
        <button onClick={onHangup} className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
          <PhoneOff size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {conversationHistory.map((msg, i) => (
          <div key={i} className={`flex ${msg.speaker === "me" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${msg.speaker === "me" ? "bg-blue-600" : "bg-[#1f2937]"}`}>
              <p>{msg.text}</p>
            </div>
          </div>
        ))}
      </div>

      {currentNode?.options && (
        <div className="p-4 border-t border-gray-700 space-y-2">
          {currentNode.options.map((option) => (
            <button
              key={option.id}
              onClick={() => onChoose(option)}
              className="w-full text-left p-3 rounded-xl border border-gray-600 bg-gray-700 hover:bg-gray-600"
            >
              <div className="text-sm font-semibold">{option.text}</div>
              <div className="text-xs text-gray-300 mt-1">{option.tone}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VoicemailView({ voicemails, onBack, onSelect, selected }) {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-700 flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
          <X size={14} />
        </button>
        <h2 className="font-bold">Voicemails</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {voicemails.map((vm) => (
          <VoicemailCard key={vm.id} voicemail={vm} selected={selected?.id === vm.id} onSelect={onSelect} />
        ))}
      </div>

      {selected && <VoicemailPlayer voicemail={selected} onClose={() => onSelect(null)} />}
    </div>
  );
}

function VoicemailCard({ voicemail, selected, onSelect }) {
  return (
    <div
      className={`p-3 rounded-xl border ${selected ? "border-blue-500 bg-blue-500/10" : "border-gray-700 bg-[#1f2937]"}`}
      onClick={() => onSelect(voicemail)}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-sm">{voicemail.contactName}</h3>
        <span className="text-xs text-gray-500">{voicemail.timestamp}</span>
      </div>
      <p className="text-xs text-gray-400">{voicemail.message}</p>
      <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
        <Clock size={10} /> {voicemail.duration}
      </div>
    </div>
  );
}

function VoicemailPlayer({ voicemail, onClose }) {
  return (
    <div className="p-4 border-t border-gray-700 bg-[#111827]">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold text-sm">{voicemail.contactName}</h4>
          <p className="text-xs text-gray-400">{voicemail.duration}</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
          <X size={14} />
        </button>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
          <Volume2 size={16} />
        </button>
        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-blue-500" />
        </div>
        <span className="text-xs text-gray-400">0:12</span>
      </div>
    </div>
  );
}
