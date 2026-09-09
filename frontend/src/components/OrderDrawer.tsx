import { Link } from "react-router-dom";
import { useState } from "react";
import { format } from "date-fns";
import { ArrowUpRight, Bike, MapPin, MessageCircle, Phone, Printer, Store, Timer, User } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { fmtMoney, type Order } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { KitchenTicket } from "@/components/KitchenTicket";
import { FLOW, NEXT_LABEL, STATUS_THEME, nextStatus, timeAgo, waLink } from "@/lib/orderStatus";

interface Props {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetStatus: (orderId: string, status: string) => void;
  pending: boolean;
}

const fmtStamp = (iso: string) => {
  try {
    return format(new Date(iso), "d MMM · h:mm a");
  } catch {
    return iso;
  }
};

export const OrderDrawer = ({ order, open, onOpenChange, onSetStatus, pending }: Props) => {
  const [ticketOpen, setTicketOpen] = useState(false);
  if (!order) return null;
  const next = nextStatus(order.status);
  const history = [...(order.status_history || [])].reverse();
  const notifyText = `Assalam o Alaikum ${order.customer_name}! Aapke order #${order.order_number} ka status ab *${order.status}* hai. Total: ${fmtMoney(order.total, order.currency)}. Shukriya!`;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="order-detail-drawer" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 bg-muted/40 px-6 py-5">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-heading text-2xl font-extrabold tracking-tight">#{order.order_number}</SheetTitle>
            <StatusBadge status={order.status} />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Timer size={13} /> Placed {timeAgo(order.created_at)} · ETA {order.eta_min}–{order.eta_max} min</p>
        </SheetHeader>

        <div className="space-y-6 px-6 py-5">
          <section className="space-y-2.5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Customer</p>
            <p className="flex items-center gap-2 font-semibold"><User size={15} className="text-muted-foreground" />{order.customer_name}</p>
            <p className="flex items-center gap-2"><Phone size={15} className="text-muted-foreground" />{order.customer_phone}
              <a data-testid="drawer-whatsapp-link" href={waLink(order.customer_phone)} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#25D366]/15 px-2 py-0.5 text-xs font-semibold text-[#128C4A] transition-colors hover:bg-[#25D366]/25 dark:text-[#4ce38a]"><MessageCircle size={12} /> Chat</a>
            </p>
            {order.contact_number && order.contact_number !== order.customer_phone && (
              <p className="flex items-center gap-2"><Phone size={15} className="text-muted-foreground" /><span className="text-muted-foreground">Call:</span> {order.contact_number}</p>
            )}
            <p className="flex items-center gap-2 capitalize">{order.order_type === "delivery" ? <Bike size={15} className="text-muted-foreground" /> : <Store size={15} className="text-muted-foreground" />}{order.order_type}</p>
            {order.address && (
              <p className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-muted-foreground" /><span>{order.address}
                <a data-testid="drawer-map-link" href={`https://www.google.com/maps/search/${encodeURIComponent(order.address)}`} target="_blank" rel="noreferrer" className="ml-1.5 text-xs font-semibold text-primary hover:underline">Map ↗</a></span></p>
            )}
          </section>

          <section>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Receipt</p>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              {order.items.map((item) => (
                <div key={item.item_id} className="flex justify-between border-b border-dashed border-border/60 py-2 text-sm last:border-0">
                  <span>{item.qty}× {item.name}</span>
                  <span className="font-mono tabular-nums">{fmtMoney(item.line_total, order.currency)}</span>
                </div>
              ))}
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="font-mono tabular-nums">{fmtMoney(order.subtotal, order.currency)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Delivery fee</span><span className="font-mono tabular-nums">{fmtMoney(order.delivery_fee, order.currency)}</span></div>
                <div className="flex justify-between border-t border-border/60 pt-2 font-heading text-base font-extrabold"><span>Total</span><span className="font-mono tabular-nums text-primary">{fmtMoney(order.total, order.currency)}</span></div>
              </div>
            </div>
          </section>

          <section>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Update status</p>
            <div className="flex flex-wrap gap-1.5">
              {FLOW.map((status) => {
                const active = status === order.status;
                return (
                  <button
                    data-testid={`drawer-set-status-${status.toLowerCase().replaceAll(" ", "-")}`}
                    key={status}
                    disabled={pending || active}
                    onClick={() => onSetStatus(order.id, status)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${active ? `${STATUS_THEME[status]?.btn || "bg-primary"} text-white shadow-sm` : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}
                  >{status}</button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              {next && (
                <Button data-testid="drawer-advance-status" disabled={pending} onClick={() => onSetStatus(order.id, next)} className={`flex-1 rounded-full font-bold text-white ${STATUS_THEME[order.status]?.btn || "bg-primary"}`}>
                  {NEXT_LABEL[order.status]} →
                </Button>
              )}
              {order.status !== "Delivered" && order.status !== "Cancelled" && (
                <Button data-testid="drawer-cancel-order" variant="outline" disabled={pending} onClick={() => onSetStatus(order.id, "Cancelled")} className="rounded-full text-rose-600 hover:text-rose-700">Cancel</Button>
              )}
            </div>
            <a data-testid="drawer-notify-whatsapp" href={waLink(order.customer_phone, notifyText)} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-2 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-4 py-2 text-sm font-semibold text-[#128C4A] transition-colors hover:bg-[#25D366]/20 dark:text-[#4ce38a]">
              <MessageCircle size={15} /> Notify customer on WhatsApp
            </a>
            <button data-testid="drawer-print-ticket" onClick={() => setTicketOpen(true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              <Printer size={15} /> Print kitchen ticket
            </button>
          </section>

          {history.length > 0 && (
            <section>
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Timeline</p>
              <div className="space-y-0">
                {history.map((entry, index) => (
                  <div key={`${entry.status}-${entry.at}`} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < history.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-border" />}
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_THEME[entry.status]?.dot || "bg-muted-foreground"}`} />
                    <div className="text-sm"><p className="font-semibold leading-tight">{entry.status}</p><p className="text-xs text-muted-foreground">{fmtStamp(entry.at)}</p></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Link data-testid="drawer-open-full-page" to={`/orders/${order.id}`} className="flex items-center justify-center gap-1.5 pb-4 text-sm font-semibold text-primary hover:underline">
            Open full order page <ArrowUpRight size={15} />
          </Link>
        </div>
        <KitchenTicket order={order} open={ticketOpen} onOpenChange={setTicketOpen} />
      </SheetContent>
    </Sheet>
  );
};
