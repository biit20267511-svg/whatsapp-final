import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, MessageCircle, Phone, StickyNote, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiPut, type Reservation, type Restaurant } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { timeAgo, waLink } from "@/lib/orderStatus";

const STATUSES = ["Pending", "Confirmed", "Seated", "Completed", "Cancelled", "No-show"];
const FLOW = ["Pending", "Confirmed", "Seated", "Completed"];
const NEXT_LABEL: Record<string, string> = { Pending: "Confirm", Confirmed: "Seat guests", Seated: "Complete" };
const PILL: Record<string, string> = {
  Pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Confirmed: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  Seated: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Cancelled: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "No-show": "bg-muted text-muted-foreground",
};
const BTN: Record<string, string> = { Pending: "bg-amber-500 hover:bg-amber-600", Confirmed: "bg-blue-600 hover:bg-blue-700", Seated: "bg-purple-600 hover:bg-purple-700" };

export default function Reservations() {
  const client = useQueryClient();
  const { session, refresh } = useAuth();
  const enabled = Boolean(session?.restaurant?.reservations_enabled);
  const [filter, setFilter] = useState<"upcoming" | "today" | "all">("upcoming");

  const query = useQuery({ queryKey: ["reservations"], queryFn: () => apiGet<Reservation[]>("/reservations"), refetchInterval: 30000 });
  const reservations = useMemo(() => query.data || [], [query.data]);

  const toggle = useMutation({
    mutationFn: (value: boolean) => apiPut<Restaurant>("/restaurant", { reservations_enabled: value }),
    onSuccess: async (restaurant) => { await refresh(); toast.success(restaurant.reservations_enabled ? "Reservations enabled — AI ab tables book karega" : "Reservations disabled — AI politely mana kar dega"); },
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch<Reservation>(`/reservations/${id}/status`, { status }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["reservations"] }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const filtered = reservations.filter((entry) => {
    if (filter === "today") return entry.date === today;
    if (filter === "upcoming") return entry.date >= today && !["Completed", "Cancelled", "No-show"].includes(entry.status);
    return true;
  });
  const todayCount = reservations.filter((entry) => entry.date === today && !["Cancelled", "No-show"].includes(entry.status)).length;
  const pendingCount = reservations.filter((entry) => entry.status === "Pending").length;
  const upcomingGuests = reservations.filter((entry) => entry.date >= today && ["Pending", "Confirmed"].includes(entry.status)).reduce((sum, entry) => sum + entry.party_size, 0);

  return (
    <div data-testid="reservations-page" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2C614F] dark:text-emerald-400">Front of house</p>
          <h1 data-testid="reservations-heading" className="mt-2 font-heading text-4xl font-extrabold tracking-tight">Reservations</h1>
          <p className="mt-2 text-muted-foreground">AI WhatsApp par table bookings le sakta hai — yahan se manage karein.</p>
        </div>
        <div data-testid="reservations-toggle-card" className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${enabled ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-card"}`}>
          <CalendarClock size={18} className={enabled ? "text-emerald-600" : "text-muted-foreground"} />
          <div>
            <p className="text-sm font-bold">{enabled ? "Reservations ON" : "Reservations OFF"}</p>
            <p className="text-xs text-muted-foreground">{enabled ? "AI tables book kar raha hai" : "AI booking requests politely decline karega"}</p>
          </div>
          <Switch data-testid="reservations-enable-toggle" checked={enabled} disabled={toggle.isPending} onCheckedChange={(checked) => toggle.mutate(checked)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {([["metric-reservations-today", "Today's bookings", todayCount, false], ["metric-reservations-pending", "Awaiting confirm", pendingCount, pendingCount > 0], ["metric-upcoming-guests", "Upcoming guests", upcomingGuests, false]] as const).map(([testId, label, value, urgent]) => (
          <div data-testid={testId} key={testId} className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <span className={`absolute inset-x-0 top-0 h-0.5 ${urgent ? "bg-amber-500" : "bg-primary/70"}`} />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className={`mt-2 font-mono text-3xl font-bold tabular-nums ${urgent ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex rounded-full border border-border/60 bg-card p-0.5 w-fit">
        {(["upcoming", "today", "all"] as const).map((option) => (
          <button data-testid={`reservations-filter-${option}`} key={option} onClick={() => setFilter(option)} className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-colors duration-200 ${filter === option ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{option}</button>
        ))}
      </div>

      {query.isLoading ? (
        <p className="text-muted-foreground">Loading reservations…</p>
      ) : !filtered.length ? (
        <div data-testid="reservations-empty" className="rounded-2xl border border-dashed border-border bg-card/60 py-16 text-center">
          <p className="font-heading text-lg font-bold">No reservations {filter !== "all" ? `(${filter})` : "yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{enabled ? "Jab customer WhatsApp par table book karega, yahan turant nazar aayega." : "Pehle upar se reservations ON karein, phir AI bookings lega."}</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((entry) => {
            const next = FLOW.indexOf(entry.status) >= 0 && FLOW.indexOf(entry.status) < FLOW.length - 1 ? FLOW[FLOW.indexOf(entry.status) + 1] : null;
            return (
              <div data-testid={`reservation-card-${entry.reservation_number}`} key={entry.id} className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-heading text-lg font-extrabold">R-{entry.reservation_number}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${PILL[entry.status] || "bg-muted"}`}>{entry.status}</span>
                    </div>
                    <p className="mt-1.5 font-semibold">{entry.customer_name}</p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Phone size={12} /> {entry.contact_number || entry.customer_phone}
                      <a data-testid={`reservation-whatsapp-${entry.reservation_number}`} href={waLink(entry.customer_phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#25D366]/15 px-2 py-0.5 font-semibold text-[#128C4A] transition-colors hover:bg-[#25D366]/25 dark:text-[#4ce38a]"><MessageCircle size={11} /> Chat</a>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold">{entry.date}</p>
                    <p className="font-mono text-2xl font-bold tracking-tight text-primary">{entry.time}</p>
                    <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground"><Users size={12} /> {entry.party_size} guests</p>
                  </div>
                </div>
                {entry.notes && <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs"><StickyNote size={13} className="mt-0.5 shrink-0 text-muted-foreground" />{entry.notes}</p>}
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <p className="text-[11px] text-muted-foreground">Booked {timeAgo(entry.created_at)}</p>
                  <div className="flex items-center gap-2">
                    <Select value={entry.status} onValueChange={(status) => setStatus.mutate({ id: entry.id, status })}>
                      <SelectTrigger data-testid={`reservation-status-select-${entry.reservation_number}`} className="h-8 rounded-full text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
                    </Select>
                    {next && (
                      <button data-testid={`reservation-advance-${entry.reservation_number}`} disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: entry.id, status: next })} className={`rounded-full px-3.5 py-1.5 text-xs font-bold text-white transition-transform duration-150 active:scale-95 ${BTN[entry.status] || "bg-primary"}`}>{NEXT_LABEL[entry.status]} →</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
