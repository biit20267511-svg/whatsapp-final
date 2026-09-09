import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, string> = {
  New: "bg-sky-500/15 text-sky-700 border border-sky-500/30 dark:text-sky-300",
  Confirmed: "bg-amber-500/15 text-amber-700 border border-amber-500/30 dark:text-amber-300",
  Preparing: "bg-orange-500/15 text-orange-700 border border-orange-500/30 dark:text-orange-300",
  Ready: "bg-purple-500/15 text-purple-700 border border-purple-500/30 dark:text-purple-300",
  "Out for Delivery": "bg-cyan-500/15 text-cyan-700 border border-cyan-500/30 dark:text-cyan-300",
  Delivered: "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-300",
  Cancelled: "bg-rose-500/15 text-rose-700 border border-rose-500/30 dark:text-rose-300",
};
export function StatusBadge({ status }: { status: string }) { return <Badge data-testid={`status-badge-${status.toLowerCase().replaceAll(" ", "-")}`} className={`${statusStyles[status] || "bg-muted text-muted-foreground border border-border"}`}>{status}</Badge>; }
export function ConnectionBadge({ status = "disconnected" }: { status?: string }) { const value = status.toLowerCase(); return <Badge data-testid="connection-status" className={value === "connected" ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"}><span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${value === "connected" ? "animate-pulse bg-emerald-500" : "bg-amber-500"}`} />{value}</Badge>; }
