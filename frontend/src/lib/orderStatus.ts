import { formatDistanceToNowStrict } from "date-fns";

export const DELIVERY_FLOW: string[] = ["New", "Confirmed", "Preparing", "Ready", "Out for Delivery", "Delivered"];
export const PICKUP_FLOW: string[] = ["New", "Confirmed", "Preparing", "Ready", "Picked Up"];
export const FLOW = DELIVERY_FLOW;
export const BOARD_COLUMNS: string[] = ["New", "Confirmed", "Preparing", "Ready", "Out for Delivery", "Completed"];
export const DONE = new Set(["Delivered", "Picked Up"]);

export const flowFor = (orderType: string) => (orderType === "pickup" ? PICKUP_FLOW : DELIVERY_FLOW);
export const columnFor = (status: string) => (DONE.has(status) ? "Completed" : status);

export const STATUS_THEME: Record<string, { accent: string; btn: string; dot: string }> = {
  New: { accent: "border-l-amber-500", btn: "bg-amber-500 hover:bg-amber-600", dot: "bg-amber-500" },
  Confirmed: { accent: "border-l-blue-500", btn: "bg-blue-600 hover:bg-blue-700", dot: "bg-blue-500" },
  Preparing: { accent: "border-l-orange-500", btn: "bg-orange-500 hover:bg-orange-600", dot: "bg-orange-500" },
  Ready: { accent: "border-l-purple-500", btn: "bg-purple-600 hover:bg-purple-700", dot: "bg-purple-500" },
  "Out for Delivery": { accent: "border-l-cyan-600", btn: "bg-cyan-600 hover:bg-cyan-700", dot: "bg-cyan-500" },
  Delivered: { accent: "border-l-emerald-500", btn: "bg-emerald-600 hover:bg-emerald-700", dot: "bg-emerald-500" },
  "Picked Up": { accent: "border-l-emerald-500", btn: "bg-emerald-600 hover:bg-emerald-700", dot: "bg-emerald-500" },
  Completed: { accent: "border-l-emerald-500", btn: "bg-emerald-600 hover:bg-emerald-700", dot: "bg-emerald-500" },
  Cancelled: { accent: "border-l-rose-500", btn: "bg-rose-600 hover:bg-rose-700", dot: "bg-rose-500" },
};

const DELIVERY_LABEL: Record<string, string> = { New: "Confirm order", Confirmed: "Start prep", Preparing: "Mark ready", Ready: "Dispatch rider", "Out for Delivery": "Mark delivered" };
const PICKUP_LABEL: Record<string, string> = { New: "Confirm order", Confirmed: "Start prep", Preparing: "Ready for pickup", Ready: "Handed over" };
export const NEXT_LABEL = DELIVERY_LABEL;
export const nextLabel = (status: string, orderType: string) => (orderType === "pickup" ? PICKUP_LABEL : DELIVERY_LABEL)[status];

export function nextStatus(status: string, orderType = "delivery"): string | null {
  const flow = flowFor(orderType);
  const index = flow.indexOf(status);
  return index >= 0 && index < flow.length - 1 ? flow[index + 1] : null;
}

export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/[^0-9]/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export function timeAgo(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
