import BRAND from '@/brand.generated.js';
import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

const AGENT_NAME = "support_assistant";
const GREETING =
  `Xin chào 👋 Mình là trợ lý AI của ${BRAND.name}. Bạn cần mình giúp gì hôm nay? Mình có thể hướng dẫn ghi hoạt động, kiểm tra tiến độ, giải thích điểm XP/Xu, hoặc gợi ý hành động để leo bảng xếp hạng.`;

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Create / resume conversation when opening
  useEffect(() => {
    if (!open || conversation) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await base44.agents.listConversations({ agent_name: AGENT_NAME });
        const list = (existing && (existing.data || existing)) || [];
        if (!cancelled && list.length > 0) {
          const conv = list[0];
          setConversation(conv);
          setMessages(conv.messages || []);
        } else if (!cancelled) {
          const conv = await base44.agents.createConversation({
            agent_name: AGENT_NAME,
            metadata: { name: "Hỗ trợ người dùng" },
          });
          setConversation(conv);
          setMessages([{ role: "assistant", content: GREETING }]);
        }
      } catch (e) {
        if (!cancelled) {
          const conv = await base44.agents.createConversation({
            agent_name: AGENT_NAME,
            metadata: { name: "Hỗ trợ người dùng" },
          });
          setConversation(conv);
          setMessages([{ role: "assistant", content: GREETING }]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Subscribe to conversation updates
  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !conversation || loading) return;
    setInput("");
    setLoading(true);
    try {
      await base44.agents.addMessage(conversation, { role: "user", content: text });
    } catch (e) {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-105 transition-transform"
          aria-label="Mở trợ lý AI"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 text-[10px] font-bold flex items-center justify-center text-black">
            AI
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-0 right-0 lg:bottom-6 lg:right-6 z-40 w-full sm:w-[400px] lg:w-[380px] h-[80vh] sm:h-[600px] lg:h-[620px] sm:rounded-3xl rounded-none shadow-2xl bg-card border border-border flex flex-col overflow-hidden animate-in">
          {/* Header */}
          <div className="bg-primary text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm leading-tight">Trợ lý AI</div>
                <div className="text-[11px] text-white/80 leading-tight flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-300" /> Đang trực tuyến
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-background">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">Đang kết nối với trợ lý...</div>
            )}
            {messages.map((m, i) => {
              const isUser = m.role === "user";
              return (
                <div key={i} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed",
                      isUser
                        ? "bg-primary text-white rounded-2xl rounded-br-md"
                        : "bg-card border border-border rounded-2xl rounded-bl-md"
                    )}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    ) : (
                      <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-1">
                        <ReactMarkdown>{m.content || ""}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border bg-card">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhập câu hỏi của bạn..."
                rows={1}
                className="flex-1 resize-none rounded-2xl border border-input bg-background px-3.5 py-2.5 text-sm max-h-28 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}