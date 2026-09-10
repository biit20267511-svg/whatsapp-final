import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { ApiError, apiGet, apiPut, formatApiError, type AdminProfileResult } from "@/lib/api";
import { PasswordStrength } from "@/pages/ChangePassword";

interface PlatformSettings { monthly_price: number; setup_fee: number; reminder_template: string }

export default function AdminSettings() {
  const c = useQueryClient();
  const { session, applyToken } = useAuth();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => apiGet<PlatformSettings>("/admin/settings") });
  const [email, setEmail] = useState(""); const [username, setUsername] = useState(""); const [current, setCurrent] = useState(""); const [password, setPassword] = useState(""); const [show, setShow] = useState(false);
  const save = useMutation({ mutationFn: (body: Partial<PlatformSettings>) => apiPut<PlatformSettings>("/admin/settings", body), onSuccess: (d) => { c.setQueryData(["admin-settings"], d); toast.success("Platform settings saved"); } });
  const profile = useMutation({
    mutationFn: () => apiPut<AdminProfileResult>("/admin/profile", { email: email.trim() || undefined, username: username.trim() || undefined, current_password: current, new_password: password || undefined }),
    onSuccess: async (res) => { await applyToken(res.access_token); setEmail(""); setUsername(""); setCurrent(""); setPassword(""); toast.success(`Admin login updated — ${res.email}${res.username ? ` / ${res.username}` : ""}. Purane sessions logout ho gaye.`); },
    onError: (err) => toast.error(err instanceof ApiError ? formatApiError(err.body) : "Update failed"),
  });
  if (!q.data) return <p>Loading…</p>;
  return <div data-testid="admin-settings-page" className="max-w-4xl space-y-6">
    <h1 className="font-heading text-4xl font-extrabold">Platform Settings</h1>
    <Card><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
      <div><Label>Default monthly price</Label><Input data-testid="platform-monthly-price" type="number" defaultValue={q.data.monthly_price} onBlur={(e) => save.mutate({ monthly_price: Number(e.target.value) })} /></div>
      <div><Label>Default setup fee</Label><Input data-testid="platform-setup-fee" type="number" defaultValue={q.data.setup_fee} onBlur={(e) => save.mutate({ setup_fee: Number(e.target.value) })} /></div>
      <div className="sm:col-span-2"><Label>Payment reminder template</Label><Textarea data-testid="reminder-template" defaultValue={q.data.reminder_template} onBlur={(e) => save.mutate({ reminder_template: e.target.value })} /></div>
    </CardContent></Card>
    <Card data-testid="admin-profile-card">
      <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><KeyRound size={17} /> Super Admin login</CardTitle><p className="text-sm text-muted-foreground">Current: <span data-testid="admin-current-email" className="font-semibold text-foreground">{session?.user.email}</span>{session?.user.username && <> · username <span className="font-semibold text-foreground">{session.user.username}</span></>}</p></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>New email (optional)</Label><Input data-testid="admin-new-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={session?.user.email} /></div>
          <div><Label>New username (optional)</Label><Input data-testid="admin-new-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={session?.user.username || "superadmin"} /></div>
        </div>
        <div><Label>Current password *</Label><Input data-testid="admin-current-password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></div>
        <div><Label>New password (optional)</Label><div className="relative"><Input data-testid="admin-new-password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-11" autoComplete="new-password" /><button type="button" data-testid="admin-toggle-password" onClick={() => setShow(!show)} className="absolute right-3 top-2.5 text-muted-foreground">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>{password && <div className="mt-2"><PasswordStrength value={password} /></div>}</div>
        <Button data-testid="save-admin-profile" onClick={() => profile.mutate()} disabled={!current || profile.isPending || (!email.trim() && !username.trim() && !password)} className="gap-2 bg-[#D94833]"><Save size={15} /> Update secure login</Button>
      </CardContent>
    </Card>
  </div>;
}
