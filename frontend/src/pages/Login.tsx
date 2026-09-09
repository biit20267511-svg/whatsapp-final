import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, MessageCircle, Pizza, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { ApiError, formatApiError } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

const HERO = "https://images.unsplash.com/photo-1503453776591-b4548af666a2?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setError("");
    try { const session = await login(identifier.trim(), password); navigate(session.user.role === "SUPER_ADMIN" ? "/admin" : "/dashboard"); }
    catch (err) { setError(err instanceof ApiError ? formatApiError(err.body) : "Unable to sign in"); }
    finally { setLoading(false); }
  };
  return <div data-testid="login-page" className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[.95fr_1.05fr]">
    <section className="relative hidden overflow-hidden bg-[#0D1111] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <img src={HERO} alt="Professional restaurant kitchen" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(13,17,17,0.92) 0%, rgba(13,17,17,0.78) 60%, rgba(217,72,51,0.30) 100%)" }} />
      <div className="relative z-10 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#D94833] shadow-lg shadow-[#D94833]/40"><Pizza /></span>
        <span className="font-heading text-xl font-bold">Restaurant AI</span>
      </div>
      <div className="relative z-10 space-y-6">
        <h1 className="max-w-lg font-heading text-5xl font-bold leading-[1.05] tracking-tight">Orders aate rahen,<br />AI sab sambhal lega.</h1>
        <p className="max-w-md text-white/70">WhatsApp par 24/7 order-taking assistant — menu, prices aur delivery sab automated. One platform for restaurants, orders and WhatsApp AI.</p>
        <div className="flex flex-wrap gap-3 text-xs font-semibold">
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-sm"><MessageCircle size={13} className="text-[#25D366]" /> WhatsApp Native</span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-sm"><Sparkles size={13} className="text-[#FCA5A5]" /> AI Upselling</span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-sm"><ShieldCheck size={13} className="text-[#4ADE80]" /> Tenant Isolated</span>
        </div>
      </div>
    </section>
    <section className="relative flex items-center justify-center p-6">
      <div className="absolute right-6 top-6"><ThemeToggle /></div>
      <form data-testid="auth-form" onSubmit={submit} className="w-full max-w-md space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">Secure workspace</p>
          <h2 data-testid="login-heading" className="mt-2 font-heading text-4xl font-bold tracking-tight">Welcome back</h2>
          <p className="mt-2 text-muted-foreground">Restaurant ya Super Admin credentials se login karein.</p>
        </div>
        <div><Label htmlFor="identifier">Email or username</Label><Input id="identifier" data-testid="login-email-input" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="owner@restaurant.pk" required className="h-11" /></div>
        <div><Label htmlFor="password">Password</Label><Input id="password" data-testid="login-password-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required className="h-11" /></div>
        {error && <p data-testid="auth-error" className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" data-testid="login-submit-button" disabled={loading} className="h-11 w-full gap-2 rounded-full bg-primary shadow-lg shadow-primary/25 transition-transform duration-200 hover:-translate-y-0.5">{loading ? <Loader2 className="animate-spin" /> : <>Sign in <ArrowRight size={16} /></>}</Button>
      </form>
    </section>
  </div>;
}
