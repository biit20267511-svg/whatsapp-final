import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, ShoppingBag, Users, UtensilsCrossed, MessageCircle, MessagesSquare, CalendarClock, Settings, Sparkles, LogOut, Pizza, CreditCard, Sheet } from "lucide-react";
import { apiGet, type WhatsAppConfig } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ConnectionBadge } from "@/components/StatusBadge";
import ThemeToggle from "@/components/ThemeToggle";

const navigation = [["/dashboard", "Dashboard", LayoutDashboard], ["/orders", "Orders", ShoppingBag], ["/reservations", "Reservations", CalendarClock], ["/conversations", "Live Chat", MessagesSquare], ["/customers", "Customers", Users], ["/menu", "Menu", UtensilsCrossed], ["/whatsapp", "WhatsApp", MessageCircle], ["/google-sheets", "Google Sheets", Sheet], ["/billing", "Billing", CreditCard], ["/settings", "Restaurant Settings", Settings], ["/ai-settings", "AI Settings", Sparkles]] as const;
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth(); const location = useLocation();
  const waQuery = useQuery({ queryKey: ["whatsapp-config"], queryFn: () => apiGet<WhatsAppConfig>("/whatsapp/config"), refetchInterval: 20000 });
  return <div data-testid="dashboard-shell" className="noise-bg flex min-h-screen bg-background text-foreground">
    <aside className="hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-6 py-6">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25"><Pizza size={20} /></div>
        <div className="min-w-0"><p data-testid="restaurant-name" className="truncate font-heading font-bold">{session?.restaurant?.name}</p><p className="text-xs text-muted-foreground">AI Ordering</p></div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-5">{navigation.map(([to, label, Icon]) => <NavLink key={to} to={to} data-testid={`nav-${label.toLowerCase().replaceAll(" ", "-")}`} className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,color,transform] duration-200 hover:translate-x-0.5 ${isActive ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}>{({ isActive }) => <><span className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`} /><Icon size={18} />{label}</>}</NavLink>)}</nav>
      <div className="space-y-3 border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between rounded-xl bg-sidebar-accent px-3 py-2"><span className="text-xs font-semibold text-muted-foreground">WhatsApp</span><ConnectionBadge status={waQuery.data?.status} /></div>
        <div className="flex items-center justify-between"><ThemeToggle /><button data-testid="logout-button" onClick={logout} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600"><LogOut size={16} /> Log out</button></div>
      </div>
    </aside>
    <main key={location.pathname} className="page-enter min-w-0 flex-1 overflow-y-auto p-5 md:p-8 lg:p-10"><div className="mb-6 flex items-center justify-between md:hidden"><p className="font-heading text-lg font-bold">{session?.restaurant?.name}</p><ConnectionBadge status={waQuery.data?.status} /></div>{children}</main>
  </div>;
}
