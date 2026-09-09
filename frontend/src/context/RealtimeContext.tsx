import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const RealtimeContext = createContext(true);
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth(); const queryClient = useQueryClient();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const token = localStorage.getItem("token"); if (!session || !token) return;
    const events = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    events.onerror = () => { if (closed) return; events.close(); timer = setTimeout(() => setRetry((count) => count + 1), Math.min(30000, 2000 * 2 ** Math.min(retry, 4))); };
    const isAdmin = session.user.role === "SUPER_ADMIN";
    events.onmessage = (event) => { try { const payload = JSON.parse(event.data) as { type: string; data?: { order?: { order_number?: number; customer_name?: string }; reservation?: { reservation_number?: number; customer_name?: string; party_size?: number } } }; if (isAdmin) { void queryClient.invalidateQueries({ queryKey: ["admin-summary"] }); void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] }); void queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] }); void queryClient.invalidateQueries({ queryKey: ["admin-restaurant-detail"] }); return; } if (["new_order", "order_update"].includes(payload.type)) { void queryClient.invalidateQueries({ queryKey: ["orders"] }); void queryClient.invalidateQueries({ queryKey: ["order"] }); void queryClient.invalidateQueries({ queryKey: ["analytics"] }); void queryClient.invalidateQueries({ queryKey: ["customers"] }); } if (payload.type === "new_order" && payload.data?.order?.order_number) { toast.success(`New order #${payload.data.order.order_number}`, { description: payload.data.order.customer_name ? `From ${payload.data.order.customer_name} — via WhatsApp AI` : "Received via WhatsApp AI" }); } if (["message", "handoff", "handoff_pending"].includes(payload.type)) { void queryClient.invalidateQueries({ queryKey: ["conversations"] }); void queryClient.invalidateQueries({ queryKey: ["conversation-messages"] }); } if (["new_reservation", "reservation_update"].includes(payload.type)) { void queryClient.invalidateQueries({ queryKey: ["reservations"] }); } if (payload.type === "new_reservation" && payload.data?.reservation?.reservation_number) { toast.success(`New reservation R-${payload.data.reservation.reservation_number}`, { description: `${payload.data.reservation.customer_name || "Guest"} — party of ${payload.data.reservation.party_size || "?"}` }); } if (payload.type === "handoff_pending") { toast.warning("Customer requested human support", { description: "Open Live Chat to take over the conversation" }); } if (payload.type === "message") void queryClient.invalidateQueries({ queryKey: ["simulation"] }); } catch { /* ignore heartbeat */ } };
    return () => { closed = true; if (timer) clearTimeout(timer); events.close(); };
  }, [session, queryClient, retry]);
  return <RealtimeContext.Provider value>{children}</RealtimeContext.Provider>;
}
export function useRealtime() { return useContext(RealtimeContext); }