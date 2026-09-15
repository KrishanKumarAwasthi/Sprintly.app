"use client";

import { useState, useEffect, useRef } from "react";
import * as api from "../app/lib/api";

const SUGGESTIONS = [
  "How many cards are on the board?",
  "Which cards are overdue?",
  "Which tasks are related to authentication?",
  "Which security tasks are still in To Do?"
];

export default function SprintlyAI({ boardId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Clear chat if board changes
  useEffect(() => {
    setMessages([]);
    setInputValue("");
    setIsLoading(false);
    setIsOpen(false);
  }, [boardId]);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  const toggleChat = () => setIsOpen((prev) => !prev);

  const sendMessage = async (text) => {
    const trimmedText = text.trim();
    if (!trimmedText || !boardId || isLoading) return;

    // Add user message immediately
    const userMsg = { role: "user", content: trimmedText };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      const res = await api.chatWithBoardAI(boardId, trimmedText);
      const answerText = res?.data?.answer || "No response received.";
      setMessages((prev) => [...prev, { role: "assistant", content: answerText }]);
    } catch (err) {
      console.error("AI Chat Error:", err);
      const errorMsg = "Sorry, I couldn't process that question. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: errorMsg, isError: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(suggestion);
  };

  // Helper to render simple markdown line breaks safely
  const formatMessageText = (text) => {
    return text.split("\n").map((line, idx) => (
      <span key={idx}>
        {line}
        <br />
      </span>
    ));
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={toggleChat}
          aria-label="Open Sprintly AI Chatbot"
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-12 h-12 bg-[#579DFF] hover:bg-[#85B8FF] text-[#1D2125] rounded-full shadow-lg shadow-black/50 flex items-center justify-center transition-transform hover:scale-105 z-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#579DFF]"
        >
          <span className="material-symbols-outlined text-2xl font-bold">temp_preferences_custom</span>
        </button>
      )}

      {/* Chat drawer */}
      {isOpen && (
        <div className="fixed bottom-0 right-0 sm:bottom-4 sm:right-4 w-full sm:w-96 max-w-full h-[60vh] sm:h-[500px] max-h-screen bg-[#22272B] border border-white/10 sm:rounded-2xl shadow-2xl z-50 flex flex-col font-sans overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#1D2125] border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#579DFF] text-xl">temp_preferences_custom</span>
              <h2 className="text-[#FFFFFF] text-sm font-semibold tracking-wide">Sprintly AI</h2>
            </div>
            <button
              onClick={toggleChat}
              aria-label="Close Chat"
              className="text-[#B6C2CF] hover:text-[#FFFFFF] rounded p-1 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar bg-[#22272B]">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <div className="w-12 h-12 bg-[#1D2125] rounded-full flex items-center justify-center border border-white/5">
                  <span className="material-symbols-outlined text-[#579DFF] text-2xl">auto_awesome</span>
                </div>
                <h3 className="text-[#FFFFFF] text-sm font-medium">Ask me about this board</h3>
                <div className="flex flex-col gap-2 mt-2 w-full max-w-[250px]">
                  {SUGGESTIONS.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="text-left text-xs bg-[#1D2125] hover:bg-white/5 text-[#B6C2CF] border border-white/5 p-2.5 rounded-lg transition-colors leading-relaxed"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#579DFF] text-[#1D2125] font-medium"
                          : msg.isError
                          ? "bg-[#EF5C48]/20 text-[#EF5C48] border border-[#EF5C48]/20"
                          : "bg-[#1D2125] text-[#B6C2CF] border border-white/5"
                      }`}
                    >
                      {formatMessageText(msg.content)}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#1D2125] border border-white/5 rounded-2xl px-4 py-3 text-sm text-[#B6C2CF] flex items-center gap-2">
                      <span className="material-symbols-outlined text-base animate-pulse text-[#579DFF]">pending</span>
                      AI is thinking...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <form onSubmit={handleFormSubmit} className="p-3 bg-[#1D2125] border-t border-white/10 shrink-0 flex items-end gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleFormSubmit(e);
                }
              }}
              placeholder="Ask a question..."
              rows={1}
              disabled={isLoading}
              className="flex-1 bg-[#22272B] text-[#FFFFFF] text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-1 focus:ring-[#579DFF]/50 border border-white/10 placeholder:text-[#B6C2CF]/40 resize-none min-h-[44px] max-h-32 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              aria-label="Send message"
              className="w-11 h-11 shrink-0 bg-[#579DFF] text-[#1D2125] rounded-lg flex items-center justify-center hover:bg-[#85B8FF] transition-colors disabled:opacity-50 disabled:hover:bg-[#579DFF]"
            >
              <span className="material-symbols-outlined text-lg">send</span>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
