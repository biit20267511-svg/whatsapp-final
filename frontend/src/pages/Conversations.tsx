import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, MessageCircle, Search, Send, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPost, type Message } from "@/lib/api";
import { timeAgo, waLink } from "@/lib/orderStatus";

interface Convo { id: string; customer_phone: string; customer_name?: string; ai_active: boolean; state: string; last_message_at?: string; provider?: string; customer?: { name?: string; phone?: string } | null; last_message?: { text: string; created_at: string; direction: string } | null }
interface Thread { conversation: Convo; messages: Message[] }

const convoName = (convo: Convo) => convo.customer_name || convo.customer?.name || convo.customer_phone;

export default function Conversations() {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const listQuery = useQuery({ queryKey: ["conversations"], queryFn: () => apiGet<Convo[]>("/conversations"), refetchInterval: 20000 });
  const conversations = listQuery.data || [];
  const activeId = selectedId || conversations[0]?.id || null;
  const threadQuery = useQuery({ queryKey: ["conversation-messages", activeId], queryFn: () => apiGet<Thread>(`/conversations/${activeId}/messages`), enabled: Boolean(activeId), refetchInterval: 10000 });
  const thread = threadQuery.data;
  const active = conversations.find((convo) => convo.id === activeId) || thread?.conversation || null;

  const handoff = useMutation({
    mutationFn: (aiActive: boolean) => apiPost(`/conversations/${activeId}/handoff`, { ai_active: aiActive }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["conversations"] }); void client.invalidateQueries({ queryKey: ["conversation-messages"] }); },
  });
  const reply = useMutation({
    mutationFn: (text: string) => apiPost(`/conversations/${activeId}/reply`, { text }),
    onSuccess: () => { setDraft(""); void client.invalidateQueries({ queryKey: ["conversation-messages"] }); void client.invalidateQueries({ queryKey: ["conversations"] }); },
  });

  const messages = thread?.messages || [];
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, activeId]);

  const filtered = conversations.filter((convo) => `${convoName(convo)} ${convo.customer_phone}`.toLowerCase().includes(search.trim().toLowerCase()));
  const send = () => { if (draft.trim() && activeId && !reply.isPending) reply.mutate(draft.trim()); };

  return (
    <div data-testid="conversations-page" className="flex h-[calc(100vh-7rem)] flex-col space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2C614F] dark:text-emerald-400">Live operations</p>
        <h1 data-testid="conversations-heading" className="mt-2 font-heading text-4xl font-extrabold tracking-tight">Live Chat</h1>
        <p className="mt-2 text-muted-foreground">Watch AI conversations in real time — take over whenever a customer needs a human.</p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div data-testid="conversations-list" className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="relative border-b border-border/60 p-3">
            <Search size={14} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="conversations-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or phone…" className="rounded-full pl-9" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.map((convo) => {
              const needsHuman = convo.state === "HUMAN_HANDOFF" || !convo.ai_active;
              return (
                <button data-testid={`conversation-item-${convo.customer_phone.replace(/[^0-9]/g, "")}`} key={convo.id} onClick={() => setSelectedId(convo.id)} className={`block w-full border-b border-border/40 px-4 py-3 text-left transition-colors ${convo.id === activeId ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{convoName(convo)}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{convo.last_message_at ? timeAgo(convo.last_message_at) : ""}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">{convo.last_message?.text || convo.customer_phone}</p>
                    {needsHuman
                      ? <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">Human</span>
                      : <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">AI</span>}
                  </div>
                </button>
              );
            })}
            {!filtered.length && <p data-testid="conversations-empty" className="p-8 text-center text-sm text-muted-foreground">No conversations yet — jab customer WhatsApp/Simulator par message karega, yahan nazar aayega.</p>}
          </div>
        </div>

        <div data-testid="chat-panel" className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          {!active ? (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground"><p>Select a conversation to view the chat</p></div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/40 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-heading font-bold">{convoName(active)}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">{active.customer_phone}
                    <a data-testid="chat-whatsapp-link" href={waLink(active.customer_phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#25D366]/15 px-2 py-0.5 font-semibold text-[#128C4A] transition-colors hover:bg-[#25D366]/25 dark:text-[#4ce38a]"><MessageCircle size={11} /> WhatsApp</a>
                  </p>
                </div>
                <div className="flex items-center gap-2.5 rounded-full border border-border/60 bg-card px-3.5 py-1.5">
                  {active.ai_active ? <Bot size={15} className="text-emerald-600" /> : <UserRound size={15} className="text-amber-500" />}
                  <span className="text-xs font-semibold">{active.ai_active ? "AI replying" : "Human takeover"}</span>
                  <Switch data-testid="chat-ai-toggle" checked={active.ai_active} disabled={handoff.isPending} onCheckedChange={(checked) => handoff.mutate(checked)} />
                </div>
              </div>

              <div data-testid="chat-messages" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messages.map((message) => {
                  const incoming = message.direction === "in";
                  return (
                    <div key={message.id} className={`flex ${incoming ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${incoming ? "rounded-bl-sm bg-muted" : "rounded-br-sm bg-[#2C614F] text-white"}`}>
                        {!incoming && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">{message.sender === "human" ? "Staff" : "AI"}</p>}
                        <p className="whitespace-pre-wrap break-words">{message.text}</p>
                        <p className={`mt-1 text-right text-[10px] ${incoming ? "text-muted-foreground" : "text-white/60"}`}>{timeAgo(message.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
                {!messages.length && <p className="py-10 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-border/60 p-3">
                {active.ai_active && <p className="mb-2 px-1 text-[11px] text-muted-foreground">AI abhi reply kar raha hai — aap bhi message bhej sakte hain, ya toggle off kar ke poora takeover karein.</p>}
                <div className="flex gap-2">
                  <Input data-testid="chat-reply-input" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} placeholder={`Reply to ${convoName(active)}…`} className="rounded-full" />
                  <button data-testid="chat-send-button" onClick={send} disabled={!draft.trim() || reply.isPending} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-white transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-50"><Send size={15} /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
