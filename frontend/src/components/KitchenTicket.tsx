import { useEffect } from "react";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { fmtMoney, type Order } from "@/lib/api";

const Dashed = () => <div className="my-2 border-t border-dashed border-black/60" />;

export const TicketBody = ({ order }: { order: Order }) => {
  const { session } = useAuth();
  const restaurantName = session?.restaurant?.name || "Kitchen";
  let placed = order.created_at;
  try {
    placed = format(new Date(order.created_at), "d MMM yyyy · h:mm a");
  } catch {
    /* keep raw */
  }
  return (
    <div className="kitchen-ticket-print mx-auto w-[300px] rounded-sm border border-border/70 bg-white px-4 py-5 font-mono text-[13px] leading-snug text-black shadow-sm">
      <p className="text-center text-base font-black uppercase tracking-wide">{restaurantName}</p>
      <p className="mt-0.5 text-center text-[11px] font-bold uppercase tracking-[0.3em]">· Kitchen Ticket ·</p>
      <Dashed />
      <div className="flex items-end justify-between">
        <span className="text-2xl font-black tracking-tight">#{order.order_number}</span>
        <span className="border-2 border-black px-1.5 py-0.5 text-[11px] font-black uppercase">{order.order_type}</span>
      </div>
      <p className="mt-1 text-[11px]">{placed}</p>
      <Dashed />
      <p className="font-bold uppercase">{order.customer_name}</p>
      <p>{order.customer_phone}</p>
      {order.order_type === "delivery" && order.address && <p className="mt-1">➜ {order.address}</p>}
      <Dashed />
      <div className="space-y-1.5">
        {order.items.map((item) => (
          <div key={item.item_id} className="flex gap-2">
            <span className="w-9 shrink-0 text-base font-black">{item.qty}×</span>
            <span className="pt-0.5 font-bold uppercase">{item.name}</span>
          </div>
        ))}
      </div>
      <Dashed />
      <div className="space-y-0.5 text-[12px]">
        <div className="flex justify-between"><span>Subtotal</span><span>{fmtMoney(order.subtotal, order.currency)}</span></div>
        <div className="flex justify-between"><span>Delivery</span><span>{fmtMoney(order.delivery_fee, order.currency)}</span></div>
        <div className="flex justify-between text-sm font-black"><span>TOTAL</span><span>{fmtMoney(order.total, order.currency)}</span></div>
      </div>
      <Dashed />
      <p className="text-center text-[11px]">ETA {order.eta_min}–{order.eta_max} min · prep counter copy</p>
      <p className="mt-1 text-center text-[11px] tracking-[0.25em]">* * *</p>
    </div>
  );
};

export const AutoPrintTicket = ({ order, onDone }: { order: Order; onDone: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
      onDone();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);
  return (
    <div data-testid="auto-print-ticket" className="offscreen-print" aria-hidden="true">
      <TicketBody order={order} />
    </div>
  );
};

export const KitchenTicket = ({ order, open, onOpenChange }: { order: Order; open: boolean; onOpenChange: (open: boolean) => void }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="kitchen-ticket-dialog" className="max-w-sm gap-3 p-4">
        <DialogTitle className="font-heading text-base font-bold">Kitchen ticket</DialogTitle>
        <TicketBody order={order} />
        <Button data-testid="kitchen-ticket-print-button" onClick={() => window.print()} className="w-full rounded-full font-bold">
          <Printer size={15} className="mr-1.5" /> Print ticket
        </Button>
      </DialogContent>
    </Dialog>
  );
};
