import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BellRing, Check, Copy, KeyRound, RefreshCcw, Save, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiGet, apiPost, apiPut, apiPatch, fmtMoney, formatApiError, type AdminRestaurantDetail, type CredentialsResult } from "@/lib/api";

const statusColor: Record<string, string> = { ACTIVE: "bg-emerald-100 text-emerald-800", TRIAL: "bg-sky-100 text-sky-800", EXPIRING_SOON: "bg-amber-100 text-amber-800", EXPIRED: "bg-rose-100 text-rose-800", SUSPENDED: "bg-stone-200 text-stone-700" };
const genPassword = () => { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#%"; return Array.from(crypto.getRandomValues(new Uint32Array(14))).map(n => chars[n % chars.length]).join(""); };

export default function AdminRestaurantDetailPage() {
  const { id = "" } = useParams();
  const client = useQueryClient();
  const q = useQuery({ queryKey: ["admin-restaurant-detail", id], queryFn: () => apiGet<AdminRestaurantDetail>(`/admin/restaurants/${id}`), enabled: Boolean(id) });
  const d = q.data;

  const [info, setInfo] = useState({ name: "", owner_name: "", phone: "", city: "", address: "", whatsapp_number: "", delivery_fee: 0, monthly_price: 0 });
  const [creds, setCreds] = useState({ email: "", username: "", new_password: "" });
  const [infoMsg, setInfoMsg] = useState(""); const [credMsg, setCredMsg] = useState(""); const [credErr, setCredErr] = useState(""); const [tempPassword, setTempPassword] = useState(""); const [copied, setCopied] = useState(false); const [reminderMsg, setReminderMsg] = useState("");

  useEffect(() => {
    if (!d) return;
    setInfo({ name: d.restaurant.name || "", owner_name: d.restaurant.owner_name || d.owner.name || "", phone: d.restaurant.phone || "", city: d.restaurant.city || "", address: d.restaurant.address || "", whatsapp_number: d.restaurant.whatsapp_number || "", delivery_fee: d.restaurant.delivery_fee || 0, monthly_price: d.subscription.monthly_price || 0 });
    setCreds(prev => ({ ...prev, email: d.owner.email, username: d.owner.username }));
  }, [d]);

  const refresh = () => { void client.invalidateQueries({ queryKey: ["admin-restaurant-detail", id] }); void client.invalidateQueries({ queryKey: ["admin-restaurants"] }); void client.invalidateQueries({ queryKey: ["admin-subscriptions"] }); void client.invalidateQueries({ queryKey: ["admin-summary"] }); };

  const saveInfo = useMutation({ mutationFn: () => apiPut(`/admin/restaurants/${id}`, info), onSuccess: () => { setInfoMsg("Saved!"); setTimeout(() => setInfoMsg(""), 2500); refresh(); } });
  const saveCreds = useMutation({
    mutationFn: () => apiPut<CredentialsResult>(`/admin/restaurants/${id}/credentials`, { email: creds.email || null, username: creds.username || null, new_password: creds.new_password || null }),
    onSuccess: (res) => { setCredErr(""); setCredMsg(res.password_changed ? `Credentials updated — username: ${res.username}, new password: ${creds.new_password}` : `Credentials updated — username: ${res.username}`); setCreds(prev => ({ ...prev, new_password: "" })); refresh(); },
    onError: (err) => { setCredMsg(""); setCredErr(err instanceof ApiError ? formatApiError(err.body) : "Update failed"); },
  });
  const resetPassword = useMutation({ mutationFn: () => apiPost<{ temporary_password: string }>(`/admin/restaurants/${id}/reset-password`), onSuccess: (res) => { setTempPassword(res.temporary_password); refresh(); } });
  const payment = useMutation({ mutationFn: () => apiPost(`/admin/restaurants/${id}/payment`), onSuccess: refresh });
  const extend = useMutation({ mutationFn: () => apiPost(`/admin/restaurants/${id}/extend`, { days: 30 }), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: (status: string) => apiPatch(`/admin/restaurants/${id}/status`, { status }), onSuccess: refresh });
  const remind = useMutation({ mutationFn: () => apiPost("/admin/reminders", { restaurant_id: id }), onSuccess: () => { setReminderMsg("Reminder created!"); setTimeout(() => setReminderMsg(""), 2500); refresh(); } });

  if (q.isLoading) return <div data-testid="detail-loading" className="grid min-h-[40vh] place-items-center text-muted-foreground">Loading restaurant…</div>;
  if (!d) return <div data-testid="detail-not-found" className="space-y-4"><p>Restaurant not found.</p><Link data-testid="back-not-found" to="/admin/restaurants" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"><ArrowLeft size={15} />Back</Link></div>;

  const sub = d.subscription;
  const stats = [["Total Orders", d.stats.total_orders], ["Today's Orders", d.stats.today_orders], ["Revenue", fmtMoney(d.stats.total_revenue)], ["Customers", d.stats.total_customers], ["Menu Items", d.stats.menu_items], ["Days Remaining", sub.days_remaining]] as const;

  return <div data-testid="admin-restaurant-detail-page" className="space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <Link data-testid="back-to-restaurants" to="/admin/restaurants" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> All restaurants</Link>
        <h1 data-testid="detail-restaurant-name" className="mt-2 font-heading text-4xl font-extrabold">{d.restaurant.name}</h1>
        <p className="mt-1 text-muted-foreground">{d.owner.name} · {d.owner.email} · {d.restaurant.city || "—"}</p>
      </div>
      <div className="flex items-center gap-2">
        <span data-testid="detail-subscription-status" className={`rounded-full px-3 py-1 text-xs font-bold ${statusColor[sub.status] || "bg-muted"}`}>{sub.status}</span>
        <span data-testid="detail-whatsapp-status" className="rounded-full bg-muted px-3 py-1 text-xs font-bold capitalize">WhatsApp: {d.whatsapp.status}</span>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {stats.map(([label, value]) => <Card key={label} data-testid={`detail-stat-${String(label).toLowerCase().replaceAll(" ", "-").replace("'", "")}`}><CardContent className="p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 font-heading text-2xl font-extrabold">{value}</p></CardContent></Card>)}
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card data-testid="detail-info-card">
        <CardHeader><CardTitle className="font-heading">Restaurant Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {([["name", "Restaurant name"], ["owner_name", "Owner name"], ["phone", "Phone"], ["city", "City"], ["address", "Address"], ["whatsapp_number", "WhatsApp number"]] as const).map(([key, label]) => <div key={key}><Label>{label}</Label><Input data-testid={`edit-${key}`} value={String(info[key])} onChange={e => setInfo({ ...info, [key]: e.target.value })} /></div>)}
          <div><Label>Delivery fee</Label><Input data-testid="edit-delivery_fee" type="number" value={info.delivery_fee} onChange={e => setInfo({ ...info, delivery_fee: Number(e.target.value) })} /></div>
          <div><Label>Monthly price</Label><Input data-testid="edit-monthly_price" type="number" value={info.monthly_price} onChange={e => setInfo({ ...info, monthly_price: Number(e.target.value) })} /></div>
          <div className="flex items-center gap-3 sm:col-span-2"><Button data-testid="save-restaurant-info" disabled={saveInfo.isPending} onClick={() => saveInfo.mutate()} className="gap-2 bg-[#2C614F]"><Save size={15} /> Save details</Button>{infoMsg && <span data-testid="info-saved-msg" className="text-sm font-bold text-emerald-700">{infoMsg}</span>}</div>
        </CardContent>
      </Card>

      <Card data-testid="detail-credentials-card">
        <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><KeyRound size={17} /> Login Credentials</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Email</Label><Input data-testid="edit-cred-email" value={creds.email} onChange={e => setCreds({ ...creds, email: e.target.value })} /></div>
            <div><Label>Username</Label><Input data-testid="edit-cred-username" value={creds.username} onChange={e => setCreds({ ...creds, username: e.target.value })} /></div>
          </div>
          <div><Label>New password (leave blank to keep current)</Label><div className="flex gap-2"><Input data-testid="edit-cred-password" value={creds.new_password} placeholder="Set a new password" onChange={e => setCreds({ ...creds, new_password: e.target.value })} /><Button data-testid="generate-password-button" type="button" variant="outline" onClick={() => setCreds({ ...creds, new_password: genPassword() })}>Generate</Button></div></div>
          <div className="flex flex-wrap items-center gap-3">
            <Button data-testid="save-credentials-button" disabled={saveCreds.isPending} onClick={() => saveCreds.mutate()} className="gap-2 bg-[#D94833]"><Save size={15} /> Update credentials</Button>
            <Button data-testid="reset-password-button" variant="outline" disabled={resetPassword.isPending} onClick={() => resetPassword.mutate()} className="gap-2"><RefreshCcw size={15} /> Reset password</Button>
          </div>
          {credMsg && <div data-testid="credentials-updated-msg" className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><span>{credMsg}</span></div>}
          {credErr && <p data-testid="credentials-error-msg" className="text-sm text-rose-700">{credErr}</p>}
          {tempPassword && <div data-testid="temp-password-box" className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950"><span>Temporary password: <code className="font-bold">{tempPassword}</code></span><Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(tempPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="gap-1">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</Button></div>}
          <p className="text-xs text-muted-foreground">Login identifiers case-insensitive hain — owner username ya email dono se sign in kar sakta hai.</p>
        </CardContent>
      </Card>
    </div>

    <Card data-testid="detail-subscription-card">
      <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><Wallet size={17} /> Subscription & Billing</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {([["Plan", sub.plan], ["Start", sub.start_date], ["Expiry", sub.end_date], ["Payment", sub.payment_status], ["Last paid", sub.last_payment_date || "—"]] as const).map(([label, value]) => <div key={label}><p className="text-xs font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button data-testid="detail-payment-button" disabled={payment.isPending} onClick={() => payment.mutate()} className="bg-[#2C614F]">Payment Received (+30 days)</Button>
          <Button data-testid="detail-extend-button" variant="outline" disabled={extend.isPending} onClick={() => extend.mutate()}>Extend 30 days</Button>
          <Button data-testid="detail-toggle-status" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(sub.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED")}>{sub.status === "SUSPENDED" ? "Activate" : "Suspend"}</Button>
          <Button data-testid="detail-remind-button" variant="outline" disabled={remind.isPending} onClick={() => remind.mutate()} className="gap-2"><BellRing size={15} /> Send Reminder</Button>
          {reminderMsg && <span data-testid="reminder-sent-msg" className="text-sm font-bold text-emerald-700">{reminderMsg}</span>}
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card data-testid="detail-payments-card">
        <CardHeader><CardTitle className="font-heading">Payment History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {d.payments.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No payments recorded yet.</p> : <table className="w-full text-sm"><thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["Amount", "Status", "Paid at", "Period end"].map(h => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr></thead><tbody>{d.payments.map(p => <tr key={p.id} data-testid={`payment-row-${p.id}`} className="border-t"><td className="px-4 py-3 font-bold">{fmtMoney(p.amount)}</td><td className="px-4"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{p.status}</span></td><td className="px-4">{p.paid_at?.slice(0, 10)}</td><td className="px-4">{p.period_end}</td></tr>)}</tbody></table>}
        </CardContent>
      </Card>
      <Card data-testid="detail-orders-card">
        <CardHeader><CardTitle className="font-heading">Recent Orders</CardTitle></CardHeader>
        <CardContent className="p-0">
          {d.recent_orders.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No orders yet.</p> : <table className="w-full text-sm"><thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["#", "Customer", "Total", "Status", "Date"].map(h => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr></thead><tbody>{d.recent_orders.map(o => <tr key={o.id} data-testid={`order-row-${o.id}`} className="border-t"><td className="px-4 py-3 font-bold">{o.order_number ?? "—"}</td><td className="px-4">{o.customer_name}</td><td className="px-4">{fmtMoney(o.total)}</td><td className="px-4"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{o.status}</span></td><td className="px-4">{o.created_at?.slice(0, 10)}</td></tr>)}</tbody></table>}
        </CardContent>
      </Card>
    </div>
  </div>;
}
