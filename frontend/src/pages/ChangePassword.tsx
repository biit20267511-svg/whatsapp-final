import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { ApiError, apiPost, formatApiError } from "@/lib/api";

export const passwordChecks = (pw: string) => [
  ["8+ characters", pw.length >= 8],
  ["A letter (a-z)", /[A-Za-z]/.test(pw)],
  ["A number (0-9)", /\d/.test(pw)],
  ["A symbol (recommended)", /[^A-Za-z0-9]/.test(pw)],
] as const;

export function PasswordStrength({ value }: { value: string }) {
  const checks = passwordChecks(value);
  const score = checks.filter(([, ok]) => ok).length;
  const tone = score <= 1 ? "bg-rose-500" : score === 2 ? "bg-amber-500" : score === 3 ? "bg-lime-500" : "bg-emerald-500";
  return <div data-testid="password-strength" className="space-y-2">
    <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < score ? tone : "bg-muted"}`} />)}</div>
    <ul className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">{checks.map(([label, ok]) => <li key={label} className={`flex items-center gap-1.5 ${ok ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{ok ? <Check size={12} /> : <X size={12} />}{label}</li>)}</ul>
  </div>;
}

export default function ChangePassword() {
  const { session, applyToken, logout } = useAuth();
  const navigate = useNavigate();
  const forced = Boolean(session?.user.must_change_password);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const valid = passwordChecks(next).slice(0, 3).every(([, ok]) => ok) && next === confirm && next !== current;

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await apiPost<{ access_token: string }>("/auth/change-password", { current_password: current, new_password: next });
      const fresh = await applyToken(res.access_token);
      navigate(fresh.user.role === "SUPER_ADMIN" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) { setError(err instanceof ApiError ? formatApiError(err.body) : "Could not change password"); }
    finally { setLoading(false); }
  };

  return <div data-testid="change-password-page" className="noise-bg grid min-h-screen place-items-center bg-background p-6 text-foreground">
    <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl border border-border/60 bg-card p-8 shadow-xl">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25"><KeyRound size={20} /></span><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">Account security</p><h1 data-testid="change-password-heading" className="font-heading text-2xl font-bold">{forced ? "Set a new password" : "Change password"}</h1></div></div>
      {forced && <p data-testid="forced-change-notice" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">Pehli baar login ya admin ne password reset kiya hai — security ke liye apna naya password set karein.</p>}
      <div><Label htmlFor="current">Current password</Label><Input id="current" data-testid="current-password-input" type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} required className="h-11" autoComplete="current-password" /></div>
      <div><Label htmlFor="next">New password</Label><div className="relative"><Input id="next" data-testid="new-password-input" type={show ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)} required className="h-11 pr-11" autoComplete="new-password" /><button type="button" data-testid="toggle-password-visibility" onClick={() => setShow(!show)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
      <PasswordStrength value={next} />
      <div><Label htmlFor="confirm">Confirm new password</Label><Input id="confirm" data-testid="confirm-password-input" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="h-11" autoComplete="new-password" />{confirm && confirm !== next && <p data-testid="confirm-mismatch" className="mt-1 text-xs text-rose-600">Passwords do not match</p>}</div>
      {error && <p data-testid="change-password-error" className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" data-testid="change-password-submit" disabled={!valid || loading} className="h-11 w-full gap-2 rounded-full bg-primary">{loading ? <Loader2 className="animate-spin" /> : <><ShieldCheck size={16} /> Update password <ArrowRight size={16} /></>}</Button>
      <div className="flex justify-between text-xs text-muted-foreground">{!forced && <button type="button" data-testid="change-password-back" onClick={() => navigate(-1)} className="hover:text-foreground">← Back</button>}<button type="button" data-testid="change-password-logout" onClick={logout} className="ml-auto hover:text-foreground">Log out</button></div>
    </form>
  </div>;
}
