import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { AuthProvider } from "@/context/AuthContext";
import { RealtimeProvider } from "@/context/RealtimeContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Conversations from "@/pages/Conversations";
import Reservations from "@/pages/Reservations";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import Menu from "@/pages/Menu";
import WhatsAppPage from "@/pages/WhatsAppPage";
import Settings from "@/pages/Settings";
import AISettings from "@/pages/AISettings";
import Billing from "@/pages/Billing";
import GoogleSheets from "@/pages/GoogleSheets";
import AdminLayout from "@/components/layout/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminRestaurants from "@/pages/admin/AdminRestaurants";
import AdminRestaurantDetail from "@/pages/admin/AdminRestaurantDetail";
import AdminSubscriptions from "@/pages/admin/AdminSubscriptions";
import AdminSettings from "@/pages/admin/AdminSettings";

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div data-testid="auth-loading" className="min-h-screen grid place-items-center text-muted-foreground">Loading workspace…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role === "SUPER_ADMIN") return <Navigate to="/admin" replace />;
  if (["EXPIRED","SUSPENDED"].includes(session.subscription?.status || "")) return <Navigate to="/billing" replace />;
  return <RealtimeProvider><DashboardLayout>{children}</DashboardLayout></RealtimeProvider>;
}

function BillingProtected({children}:{children:ReactNode}) { const {session,loading}=useAuth(); if(loading)return <div>Loading…</div>; if(!session)return <Navigate to="/login"/>; if(session.user.role==="SUPER_ADMIN")return <Navigate to="/admin"/>; return <DashboardLayout>{children}</DashboardLayout>; }
function AdminProtected({children}:{children:ReactNode}) { const {session,loading}=useAuth(); if(loading)return <div>Loading…</div>; if(!session)return <Navigate to="/login"/>; if(session.user.role!=="SUPER_ADMIN")return <Navigate to="/dashboard"/>; return <RealtimeProvider><AdminLayout>{children}</AdminLayout></RealtimeProvider>; }

export default function App() {
  return (
    <AuthProvider><Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/orders" element={<Protected><Orders /></Protected>} />
      <Route path="/orders/:id" element={<Protected><OrderDetail /></Protected>} />
      <Route path="/conversations" element={<Protected><Conversations /></Protected>} />
      <Route path="/reservations" element={<Protected><Reservations /></Protected>} />
      <Route path="/customers" element={<Protected><Customers /></Protected>} />
      <Route path="/customers/:id" element={<Protected><CustomerDetail /></Protected>} />
      <Route path="/menu" element={<Protected><Menu /></Protected>} />
      <Route path="/whatsapp" element={<Protected><WhatsAppPage /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/ai-settings" element={<Protected><AISettings /></Protected>} />
      <Route path="/google-sheets" element={<Protected><GoogleSheets /></Protected>} />
      <Route path="/billing" element={<BillingProtected><Billing /></BillingProtected>} />
      <Route path="/admin" element={<AdminProtected><AdminDashboard /></AdminProtected>} />
      <Route path="/admin/restaurants" element={<AdminProtected><AdminRestaurants /></AdminProtected>} />
      <Route path="/admin/restaurants/:id" element={<AdminProtected><AdminRestaurantDetail /></AdminProtected>} />
      <Route path="/admin/subscriptions" element={<AdminProtected><AdminSubscriptions /></AdminProtected>} />
      <Route path="/admin/settings" element={<AdminProtected><AdminSettings /></AdminProtected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes></AuthProvider>
  );
}
