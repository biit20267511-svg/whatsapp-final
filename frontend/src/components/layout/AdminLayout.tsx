import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Building2, CreditCard, LayoutDashboard, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";
const links=[["/admin","Dashboard",LayoutDashboard],["/admin/restaurants","Restaurants",Building2],["/admin/subscriptions","Subscriptions",CreditCard],["/admin/settings","Settings",Settings]] as const;
export default function AdminLayout({children}:{children:ReactNode}) {
  const {logout}=useAuth(); const location=useLocation();
  return <div data-testid="admin-shell" className="noise-bg flex min-h-screen bg-background text-foreground">
    <aside className="hidden w-64 flex-col border-r border-white/10 bg-[#0D1111] text-white md:flex">
      <div className="flex items-center gap-3 border-b border-white/10 p-6">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#D94833] shadow-lg shadow-[#D94833]/30"><ShieldCheck size={20}/></span>
        <div><p className="font-heading font-bold">Restaurant AI</p><p className="text-xs text-white/50">Super Admin</p></div>
      </div>
      <nav className="flex-1 space-y-1 p-3">{links.map(([to,label,Icon])=><NavLink end={to==="/admin"} key={to} to={to} data-testid={`admin-nav-${label.toLowerCase()}`} className={({isActive})=>`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,color,transform] duration-200 hover:translate-x-0.5 ${isActive?"bg-[#D94833] text-white shadow-md shadow-[#D94833]/25":"text-white/60 hover:bg-white/10 hover:text-white"}`}><Icon size={18}/>{label}</NavLink>)}</nav>
      <div className="flex items-center justify-between border-t border-white/10 p-4"><ThemeToggle/><button data-testid="admin-logout-button" onClick={logout} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"><LogOut size={16}/> Logout</button></div>
    </aside>
    <main key={location.pathname} className="page-enter min-w-0 flex-1 p-5 md:p-9">{children}</main>
  </div>;
}
