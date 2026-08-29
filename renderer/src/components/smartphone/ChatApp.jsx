import React, { useState, useEffect, useRef } from "react";
import { Send, ArrowLeft, MoreVertical, Check, X } from "lucide-react";

export default function ChatApp({
  contactsById,
  initialChatId,
  history,
  onSendMessage,
  onBack,
  mutedContacts = [],
}) {
  const [activeChatId, setActiveChatId] = useState(initialChatId);
  const [input, setInput] = useState("");

  const scrollRef = useRef(null);

  useEffect(() => {
    if (initialChatId) setActiveChatId(initialChatId);
  }, [initialChatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, activeChatId]);

  const currentMessages = activeChatId ? (history[activeChatId] || []) : [];
  const activeContact = activeChatId ? contactsById?.[activeChatId] : null;

  const handleSend = (text) => {
    if (activeChatId && text.trim()) {
      onSendMessage(activeChatId, text, "me", false);
      setInput("");
    }
  };

  if (!activeChatId) {
    const chatIds = Object.keys(history || {}).length
      ? Object.keys(history || {})
      : Object.keys(contactsById || {});
    return (
      <div className="flex flex-col h-full bg-[#0b1014] text-white">
        <div className="h-16 bg-[#202c33] flex items-center px-4 gap-3 shadow-md z-20">
          <ArrowLeft onClick={onBack} className="cursor-pointer text-gray-400 hover:text-white" />
          <h1 className="text-xl font-bold">Chats</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chatIds.map((chatIdStr) => {
            const id = parseInt(chatIdStr, 10);
            const contact = contactsById?.[id] || { name: "Desconocido", avatarColor: "bg-gray-500" };
            const msgs = history[id] || [];
            const last = msgs[msgs.length - 1];
            const isContactMuted = mutedContacts.includes(id);

            return (
              <div
                key={id}
                onClick={() => setActiveChatId(id)}
                className="flex items-center gap-4 p-4 hover:bg-[#202c33] border-b border-[#202c33] cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-full ${contact.avatarColor} flex items-center justify-center font-bold relative`}>
                  {contact.name.charAt(0)}
                  {isContactMuted && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <X size={12} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between">
                    <h3 className="font-bold">{contact.name}</h3>
                    <span className="text-xs text-gray-500">{last?.time}</span>
                  </div>
                  <p className={`text-sm truncate ${isContactMuted ? "text-gray-600" : "text-gray-400"}`}>
                    {last?.text || ""}
                  </p>
                </div>
              </div>
            );
          })}
          {chatIds.length === 0 && (
            <div className="text-center text-sm text-gray-500 mt-10">Sin conversaciones.</div>
          )}
        </div>
      </div>
    );
  }

  if (!activeContact) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0b1014] text-gray-400">
        Sin contacto seleccionado.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0b1014] text-white relative font-sans">
      <div className="h-16 bg-[#202c33] flex items-center px-2 justify-between shrink-0 shadow-md z-20">
        <div className="flex items-center gap-2">
          <ArrowLeft
            size={20}
            className="text-gray-300 cursor-pointer hover:text-white"
            onClick={() => setActiveChatId(null)}
          />
          <div className={`w-10 h-10 ${activeContact.avatarColor} rounded-full flex items-center justify-center font-bold`}>
            {activeContact.name.charAt(0)}
          </div>
          <div>
            <h3 className="font-semibold text-sm">{activeContact.name}</h3>
          </div>
        </div>
        <MoreVertical className="text-gray-400" />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 pb-24"
      >
        {currentMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${msg.sender === "me" ? "bg-[#005c4b]" : "bg-[#202c33]"}`}>
              <p>{msg.text}</p>
              <span className="text-[10px] text-gray-400 block text-right mt-1 opacity-70 flex justify-end gap-1 items-center">
                {msg.time}
                {msg.sender === "me" && <Check size={12} className="text-blue-400" />}
              </span>
            </div>
          </div>
        ))}
        {!currentMessages.length && (
          <div className="text-center text-sm text-gray-500">Sin mensajes.</div>
        )}
      </div>

      <div className="bg-[#202c33] absolute bottom-0 w-full z-30 flex flex-col border-t border-gray-700">
        <div className="p-2 flex items-center gap-2 pb-6 pt-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend(input)}
            placeholder=""
            className="flex-1 bg-[#2a3942] text-white text-sm rounded-full px-4 py-2 outline-none"
          />
          <button onClick={() => handleSend(input)} className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-white">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
