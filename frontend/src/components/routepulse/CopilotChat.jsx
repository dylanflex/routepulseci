import React, { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Bot } from "lucide-react";
import { api } from "@/lib/api";

const SUGGESTIONS = [
  "Comment est la circulation ?",
  "Quelles routes éviter ?",
  "Y a-t-il des inondations ?",
];

const GREETING = {
  role: "assistant",
  content:
    "Bonjour, je suis ton copilote RoutePulse. Demande-moi l'état de la route à Abidjan — je me base sur les signalements en direct.",
};

export default function CopilotChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, sending]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput("");
    // History = the real exchange so far (drop the canned greeting).
    const history = messages
      .filter((m) => m !== GREETING)
      .map((m) => ({ role: m.role, content: m.content }));
    const next = [...messages, { role: "user", content: message }];
    setMessages(next);
    setSending(true);
    try {
      const res = await api.copilot(message, history);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply, source: res.source }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Désolé, je n'ai pas pu répondre. Réessaie dans un instant.", source: "error" },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating trigger — sits above the bottom nav */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le copilote IA"
          className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full bg-gradient-hero text-primary-foreground shadow-glow flex items-center justify-center hover:scale-105 transition-transform"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-end sm:p-4">
          <button
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          />
          <div className="relative w-full sm:max-w-md h-[75vh] sm:h-[70vh] bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-elevated flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <div className="w-9 h-9 rounded-xl bg-gradient-hero flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-display font-semibold text-sm">Copilote IA</p>
                <p className="text-[11px] text-muted-foreground">Basé sur les signalements en direct</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-muted" aria-label="Fermer le copilote">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-foreground text-background"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl px-3.5 py-2.5 text-sm text-muted-foreground">
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions (only before the first question) */}
            {messages.length === 1 && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="px-3 py-1.5 rounded-full border border-border bg-card text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2 p-3 border-t border-border"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pose ta question…"
                className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                aria-label="Envoyer"
                className="h-11 w-11 rounded-xl bg-gradient-hero text-primary-foreground flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
