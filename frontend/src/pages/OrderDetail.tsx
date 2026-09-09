import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Bike, Check, MapPin, MessageCircle, Phone, Printer, Store, Timer, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPatch, fmtMoney, type Order } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { KitchenTicket } from "@/components/KitchenTicket";
import { FLOW, NEXT_LABEL, STATUS_THEME, nextStatus, timeAgo, waLink } from "@/lib/orderStatus";

const fmtStamp = (iso: string) => {
  try {
    return format(new Date(iso), "d MMM yyyy · h:mm a");
  } catch {
    return iso;
  }
};

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [ticketOpen, setTicketOpen] = useState(false);
  const query = useQuery({ queryKey: ["order", id], queryFn: () => apiGet<Order>(`/orders/${id}`), enabled: Boolean(id) });
  const mutation = useMutation({
    mutationFn: (status: string) => apiPatch<Order>(`/orders/${id}/status`, { status }),
    onSuccess: (order) => { client.setQueryData(["order", id], order); void client.invalidateQueries({ queryKey: ["orders"] }); },
  });
  const order = query.data;
  if (query.isLoading || !order) return <p data-testid="order-detail-loading" className="text-muted-foreground">Loading order…</p>;
  const next = nextStatus(order.status);
  const history = [...(order.status_history || [])].reverse();
  const notifyText = `Assalam o Alaikum ${order.customer_name}! Aapke order #${order.order_number} ka status ab *${order.status}* hai. Total: ${fmtMoney(order.total, order.currency)}. Shukriya!`;

  return (
    <div data-testid="order-detail-page" className="mx-auto max-w-5xl space-y-6">
      <button data-testid="order-back-button" onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={16} /> Back to orders</button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2C614F] dark:text-emerald-400">Order detail</p>
          <div className="mt-2 flex items-center gap-3">
            <h1 data-testid="order-detail-heading" className="font-heading text-4xl font-extrabold tracking-tight">#{order.order_number}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground"><Timer size={14} /> Placed {timeAgo(order.created_at)} · {fmtStamp(order.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {next && (
            <Button data-testid="advance-order-status-button" disabled={mutation.isPending} onClick={() => mutation.mutate(next)} className={`gap-2 rounded-full font-bold text-white ${STATUS_THEME[order.status]?.btn || "bg-primary"}`}>
              <Check size={16} /> {NEXT_LABEL[order.status]}
            </Button>
          )}
          {order.status !== "Delivered" && order.status !== "Cancelled" && (
            <Button data-testid="cancel-order-button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate("Cancelled")} className="rounded-full text-rose-600 hover:text-rose-700">Cancel</Button>
          )}
          <Button data-testid="order-print-ticket-button" variant="outline" onClick={() => setTicketOpen(true)} className="gap-2 rounded-full"><Printer size={15} /> Kitchen ticket</Button>
        </div>
      </div>

      <div data-testid="order-status-stepper" className="flex flex-wrap gap-1.5 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        {FLOW.map((status) => {
          const active = status === order.status;
          return (
            <button
              data-testid={`set-order-status-${status.toLowerCase().replaceAll(" ", "-")}`}
              key={status}
              disabled={mutation.isPending || active}
              onClick={() => mutation.mutate(status)}
              className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${active ? `${STATUS_THEME[status]?.btn || "bg-primary"} text-white shadow-sm` : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}
            >{status}</button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div data-testid="order-receipt-card" className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Receipt</p>
          <div className="mt-4">
            {order.items.map((item) => (
              <div key={item.item_id} className="flex justify-between border-b border-dashed border-border/60 py-3 text-sm last:border-solid">
                <span className="font-medium"><span className="mr-2 font-mono font-bold">{item.qty}×</span>{item.name}</span>
                <span className="font-mono tabular-nums">{fmtMoney(item.line_total, order.currency)}</span>
              </div>
            ))}
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="font-mono tabular-nums">{fmtMoney(order.subtotal, order.currency)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Delivery fee</span><span className="font-mono tabular-nums">{fmtMoney(order.delivery_fee, order.currency)}</span></div>
              <div className="flex justify-between border-t border-border/60 pt-3 font-heading text-lg font-extrabold"><span>Total</span><span className="font-mono tabular-nums text-primary">{fmtMoney(order.total, order.currency)}</span></div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div data-testid="order-customer-card" className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Customer</p>
            <div className="mt-4 space-y-3 text-sm">
              <p className="flex items-center gap-2 font-semibold"><User size={15} className="text-muted-foreground" />{order.customer_name}</p>
              <p className="flex items-center gap-2"><Phone size={15} className="text-muted-foreground" />{order.customer_phone}
                <a data-testid="order-whatsapp-chat-link" href={waLink(order.customer_phone)} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#25D366]/15 px-2 py-0.5 text-xs font-semibold text-[#128C4A] transition-colors hover:bg-[#25D366]/25 dark:text-[#4ce38a]"><MessageCircle size={12} /> Chat</a>
              </p>
              {order.contact_number && order.contact_number !== order.customer_phone && (
                <p className="flex items-center gap-2"><Phone size={15} className="text-muted-foreground" /><span className="text-muted-foreground">Call:</span> {order.contact_number}</p>
              )}
              <p className="flex items-center gap-2 capitalize">{order.order_type === "delivery" ? <Bike size={15} className="text-muted-foreground" /> : <Store size={15} className="text-muted-foreground" />}{order.order_type}</p>
              {order.address && (
                <p className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-muted-foreground" /><span>{order.address}
                  <a data-testid="order-map-link" href={`https://www.google.com/maps/search/${encodeURIComponent(order.address)}`} target="_blank" rel="noreferrer" className="ml-1.5 text-xs font-semibold text-primary hover:underline">Map ↗</a></span></p>
              )}
              <p className="flex items-center gap-2 text-muted-foreground"><Timer size={15} /> ETA {order.eta_min}–{order.eta_max} minutes</p>
            </div>
            <a data-testid="order-notify-whatsapp" href={waLink(order.customer_phone, notifyText)} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-4 py-2 text-sm font-semibold text-[#128C4A] transition-colors hover:bg-[#25D366]/20 dark:text-[#4ce38a]">
              <MessageCircle size={15} /> Notify customer on WhatsApp
            </a>
          </div>

          {history.length > 0 && (
            <div data-testid="order-timeline-card" className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Timeline</p>
              <div className="mt-4">
                {history.map((entry, index) => (
                  <div key={`${entry.status}-${entry.at}`} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < history.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-border" />}
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_THEME[entry.status]?.dot || "bg-muted-foreground"}`} />
                    <div className="text-sm"><p className="font-semibold leading-tight">{entry.status}</p><p className="text-xs text-muted-foreground">{fmtStamp(entry.at)}</p></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <KitchenTicket order={order} open={ticketOpen} onOpenChange={setTicketOpen} />
    </div>
  );
}
