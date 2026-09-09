import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Bell, BellOff, Eye, Flame, LayoutGrid, MessageCircle, Printer, Rows3, Search, Store, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, fmtMoney, type Order } from "@/lib/api";
import { OrderDrawer } from "@/components/OrderDrawer";
import { AutoPrintTicket } from "@/components/KitchenTicket";
import { FLOW, NEXT_LABEL, STATUS_THEME, nextStatus, timeAgo, waLink } from "@/lib/orderStatus";

const ALL_STATUSES = [...FLOW, "Cancelled"];
const ACTIVE = new Set(["New", "Confirmed", "Preparing", "Ready", "Out for Delivery"]);

function chime() {
  try {
    const ctx = new AudioContext();
    const play = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.4);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.45);
    };
    play(880, 0);
    play(1174.66, 0.18);
  } catch {
    /* audio unavailable */
  }
}

const MetricCard = ({ label, value, sub, icon, urgent, testId }: { label: string; value: string; sub: string; icon: React.ReactNode; urgent?: boolean; testId: string }) => (
  <div data-testid={testId} className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
    <span className={`absolute inset-x-0 top-0 h-0.5 ${urgent ? "bg-amber-500" : "bg-primary/70"}`} />
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <span className={urgent ? "text-amber-500" : "text-primary/80"}>{icon}</span>
    </div>
    <p className={`mt-2 font-mono text-3xl font-bold tabular-nums tracking-tight ${urgent ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
  </div>
);

const OrderCard = ({ order, onOpen, onAdvance, pending }: { order: Order; onOpen: () => void; onAdvance: (status: string) => void; pending: boolean }) => {
  const next = nextStatus(order.status);
  const theme = STATUS_THEME[order.status];
  return (
    <button data-testid={`order-card-${order.order_number}`} onClick={onOpen} className={`block w-full rounded-xl border border-border/60 border-l-4 ${theme?.accent || ""} bg-card p-4 text-left shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md`}>
      <div className="flex items-center justify-between">
        <span className="font-heading font-bold">#{order.order_number}</span>
        <span className="flex items-center gap-1 text-[11px] capitalize text-muted-foreground">{order.order_type === "delivery" ? <Bike size={12} /> : <Store size={12} />}{order.order_type}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(order.created_at)}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold">{order.customer_name}</p>
        <a data-testid={`order-card-whatsapp-${order.order_number}`} href={waLink(order.customer_phone)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="shrink-0 rounded-full bg-[#25D366]/15 p-1.5 text-[#128C4A] transition-colors hover:bg-[#25D366]/30 dark:text-[#4ce38a]" title={order.customer_phone}><MessageCircle size={13} /></a>
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {order.items.slice(0, 2).map((item) => <p key={item.item_id} className="truncate">{item.qty}× {item.name}</p>)}
        {order.items.length > 2 && <p className="font-medium">+{order.items.length - 2} more</p>}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
        <span className="font-mono text-sm font-bold tabular-nums">{fmtMoney(order.total, order.currency)}</span>
        {next && (
          <span
            data-testid={`order-action-advance-${order.order_number}`}
            role="button"
            onClick={(event) => { event.stopPropagation(); if (!pending) onAdvance(next); }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold text-white transition-transform duration-150 active:scale-95 ${theme?.btn || "bg-primary"} ${pending ? "opacity-60" : ""}`}
          >{NEXT_LABEL[order.status]} →</span>
        )}
      </div>
    </button>
  );
};

export default function Orders() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["orders"], queryFn: () => apiGet<Order[]>("/orders"), refetchInterval: 30000 });
  const orders = useMemo(() => query.data || [], [query.data]);
  const [view, setView] = useState<"board" | "table">("board");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sound, setSound] = useState(() => localStorage.getItem("orders-sound") !== "off");
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem("orders-autoprint") === "on");
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const prevStatuses = useRef<Map<string, string> | null>(null);
  const prevMax = useRef<number | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch<Order>(`/orders/${id}/status`, { status }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["orders"] }),
  });
  const setStatus = (id: string, status: string) => mutation.mutate({ id, status });

  const maxNumber = orders.reduce((max, order) => Math.max(max, order.order_number), 0);
  useEffect(() => {
    if (prevMax.current !== null && maxNumber > prevMax.current && sound) chime();
    if (maxNumber > 0) prevMax.current = maxNumber;
  }, [maxNumber, sound]);

  useEffect(() => {
    if (prevStatuses.current && autoPrint) {
      const confirmed = orders.find((order) => {
        const previous = prevStatuses.current?.get(order.id);
        return order.status === "Confirmed" && previous !== undefined && previous !== "Confirmed";
      });
      if (confirmed) setPrintOrder(confirmed);
    }
    if (orders.length) prevStatuses.current = new Map(orders.map((order) => [order.id, order.status]));
  }, [orders, autoPrint]);

  const toggleAutoPrint = () => {
    const value = !autoPrint;
    setAutoPrint(value);
    localStorage.setItem("orders-autoprint", value ? "on" : "off");
  };

  const toggleSound = () => {
    const value = !sound;
    setSound(value);
    localStorage.setItem("orders-sound", value ? "on" : "off");
  };

  const today = new Date().toISOString().slice(0, 10);
  const activeCount = orders.filter((order) => ACTIVE.has(order.status)).length;
  const newCount = orders.filter((order) => order.status === "New").length;
  const todayOrders = orders.filter((order) => order.created_at.startsWith(today) && order.status !== "Cancelled");
  const todayRevenue = todayOrders.reduce((sum, order) => sum + order.total, 0);
  const avgOrder = todayOrders.length ? Math.round(todayRevenue / todayOrders.length) : 0;

  const filtered = orders.filter((order) => {
    if (typeFilter !== "all" && order.order_type !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return `#${order.order_number} ${order.customer_name} ${order.customer_phone} ${order.items.map((item) => item.name).join(" ")}`.toLowerCase().includes(q);
  });
  const selected = orders.find((order) => order.id === selectedId) || null;

  return (
    <div data-testid="orders-page" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2C614F] dark:text-emerald-400">Live operations</p>
          <div className="mt-2 flex items-center gap-3">
            <h1 data-testid="orders-heading" className="font-heading text-4xl font-extrabold tracking-tight">Orders</h1>
            <span data-testid="orders-live-indicator" className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              AI bot live
            </span>
          </div>
          <p className="mt-2 text-muted-foreground">Your live order board updates as customers chat with the assistant.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="orders-sound-toggle" onClick={toggleSound} className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${sound ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
            {sound ? <Bell size={14} /> : <BellOff size={14} />} New order chime {sound ? "on" : "off"}
          </button>
          <button data-testid="orders-autoprint-toggle" onClick={toggleAutoPrint} className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${autoPrint ? "border-[#2C614F]/50 bg-[#2C614F]/10 text-[#2C614F] dark:text-emerald-300" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
            <Printer size={14} /> Auto-print on confirm {autoPrint ? "on" : "off"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard testId="metric-active-orders" label="Active orders" value={String(activeCount)} sub="In the pipeline right now" icon={<Flame size={16} />} />
        <MetricCard testId="metric-awaiting-confirm" label="Awaiting confirm" value={String(newCount)} sub={newCount ? "Needs your attention" : "All caught up"} icon={<Bell size={16} />} urgent={newCount > 0} />
        <MetricCard testId="metric-today-revenue" label="Revenue today" value={fmtMoney(todayRevenue)} sub={`${todayOrders.length} orders today`} icon={<Wallet size={16} />} />
        <MetricCard testId="metric-avg-order" label="Avg order today" value={fmtMoney(avgOrder)} sub="Per confirmed order" icon={<Rows3 size={16} />} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="orders-search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order #, customer, phone, dish…" className="rounded-full pl-9" />
        </div>
        <div className="flex rounded-full border border-border/60 bg-card p-0.5">
          {["all", "delivery", "pickup"].map((type) => (
            <button data-testid={`orders-filter-${type}`} key={type} onClick={() => setTypeFilter(type)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors duration-200 ${typeFilter === type ? "bg-[#2C614F] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{type}</button>
          ))}
        </div>
        <div className="ml-auto flex rounded-full border border-border/60 bg-card p-0.5">
          <button data-testid="orders-view-toggle-board" onClick={() => setView("board")} className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${view === "board" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><LayoutGrid size={13} /> Board</button>
          <button data-testid="orders-view-toggle-table" onClick={() => setView("table")} className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${view === "table" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Rows3 size={13} /> Table</button>
        </div>
      </div>

      {query.isLoading ? (
        <p data-testid="orders-loading" className="text-muted-foreground">Loading orders…</p>
      ) : !orders.length ? (
        <div data-testid="orders-empty-state" className="rounded-2xl border border-dashed border-border bg-card/60 py-16 text-center">
          <p className="font-heading text-lg font-bold">No orders yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Try the Simulator on the WhatsApp page — the AI will take an order end to end.</p>
        </div>
      ) : view === "board" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {FLOW.map((column) => {
            const list = filtered.filter((order) => order.status === column);
            return (
              <section data-testid={`orders-column-${column.toLowerCase().replaceAll(" ", "-")}`} key={column} className="min-h-[380px] min-w-[272px] flex-1 rounded-2xl border border-border/50 bg-muted/50 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><span className={`h-2 w-2 rounded-full ${STATUS_THEME[column]?.dot}`} />{column}</span>
                  <span className="rounded-full bg-card px-2 py-0.5 font-mono text-xs font-bold tabular-nums shadow-sm">{list.length}</span>
                </div>
                <div className="space-y-3">
                  {list.map((order) => <OrderCard key={order.id} order={order} pending={mutation.isPending} onOpen={() => setSelectedId(order.id)} onAdvance={(status) => setStatus(order.id, status)} />)}
                  {!list.length && <p className="py-10 text-center text-xs text-muted-foreground/70">No orders</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div data-testid="orders-table-view" className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-24">Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead className="w-44">Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => (
                <TableRow data-testid={`order-row-${order.order_number}`} key={order.id} className="cursor-pointer" onClick={() => setSelectedId(order.id)}>
                  <TableCell className="font-heading font-bold">#{order.order_number}</TableCell>
                  <TableCell><p className="font-semibold">{order.customer_name}</p><p className="text-xs text-muted-foreground">{order.customer_phone}</p></TableCell>
                  <TableCell><span className="flex items-center gap-1.5 text-xs capitalize text-muted-foreground">{order.order_type === "delivery" ? <Bike size={13} /> : <Store size={13} />}{order.order_type}</span></TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{order.items.map((item) => `${item.qty}× ${item.name}`).join(", ")}</TableCell>
                  <TableCell className="text-right font-mono font-bold tabular-nums">{fmtMoney(order.total, order.currency)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{timeAgo(order.created_at)}</TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Select value={order.status} onValueChange={(status) => setStatus(order.id, status)}>
                      <SelectTrigger data-testid={`order-status-select-${order.order_number}`} className="h-8 rounded-full text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{ALL_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <button data-testid={`order-quick-view-${order.order_number}`} onClick={() => setSelectedId(order.id)} className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Quick view"><Eye size={15} /></button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No orders match your filters.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}

      <OrderDrawer order={selected} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }} onSetStatus={setStatus} pending={mutation.isPending} />
      {printOrder && <AutoPrintTicket order={printOrder} onDone={() => setPrintOrder(null)} />}
    </div>
  );
}
