import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiGet, apiPatch, apiPost, fmtMoney, formatApiError, type AdminRestaurant, type CreatedRestaurant } from "@/lib/api";

const emptyForm = { restaurant_name: "", owner_name: "", phone: "", email: "", username: "", password: "", monthly_price: 5000, setup_fee: 5000, start_date: new Date().toISOString().slice(0, 10), duration_days: 30, city: "" };

export default function AdminRestaurants() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [creds, setCreds] = useState<CreatedRestaurant["credentials"]>();
  const [form, setForm] = useState(emptyForm);
  const q = useQuery({ queryKey: ["admin-restaurants", search], queryFn: () => apiGet<AdminRestaurant[]>(`/admin/restaurants?search=${encodeURIComponent(search)}`) });
  const refresh = () => void client.invalidateQueries({ queryKey: ["admin-restaurants"] });
  const create = useMutation({
    mutationFn: () => apiPost<CreatedRestaurant>("/admin/restaurants", { ...form, username: form.username.trim() || null, password: form.password.trim() || null }),
    onSuccess: (data) => { setCreds(data.credentials); setShow(false); setForm(emptyForm); setError(""); refresh(); },
    onError: (err) => setError(err instanceof ApiError ? formatApiError(err.body) : "Unable to create restaurant"),
  });
  const action = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch(`/admin/restaurants/${id}/status`, { status }), onSuccess: refresh });
  const copyCreds = () => { if (!creds) return; void navigator.clipboard.writeText(`Username: ${creds.username}\nPassword: ${creds.password}\nLogin: ${window.location.origin}/login`); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return <div data-testid="admin-restaurants-page" className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#D94833]">Client management</p><h1 data-testid="admin-restaurants-heading" className="mt-2 font-heading text-4xl font-extrabold">Restaurants</h1></div>
      <Button data-testid="add-restaurant-button" onClick={() => setShow(!show)} className="gap-2 rounded-full bg-[#D94833]"><Plus size={16} /> Add Restaurant</Button>
    </div>
    {creds && <Card data-testid="created-credentials" className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950">
      <CardContent className="p-5">
        <p className="font-bold">Restaurant account created — save these credentials now</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><p className="text-xs font-bold uppercase text-muted-foreground">Username</p><code data-testid="created-username" className="mt-1 block rounded bg-background px-2 py-1.5 text-sm">{creds.username}</code></div>
          <div><p className="text-xs font-bold uppercase text-muted-foreground">Password</p><code data-testid="created-password" className="mt-1 block rounded bg-background px-2 py-1.5 text-sm">{creds.password}</code></div>
          <div className="flex items-end"><Button data-testid="copy-credentials-button" variant="outline" onClick={copyCreds} className="gap-2">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied!" : "Copy credentials"}</Button></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Restaurant owner in credentials se /login page par sign in kar sakta hai (username ya email dono chalte hain).</p>
      </CardContent>
    </Card>}
    {show && <Card><CardContent className="grid gap-4 p-5 md:grid-cols-3">
      {([["restaurant_name", "Restaurant name *"], ["owner_name", "Owner name"], ["email", "Email *"], ["phone", "Phone"], ["city", "City"]] as const).map(([key, label]) => <div key={key}><Label>{label}</Label><Input data-testid={`new-${key}`} value={String(form[key])} onChange={e => setForm({ ...form, [key]: e.target.value })} /></div>)}
      <div><Label>Username (optional — auto-generate)</Label><Input data-testid="new-username" value={form.username} placeholder="e.g. pizza_king" onChange={e => setForm({ ...form, username: e.target.value })} /></div>
      <div><Label>Password (optional — auto-generate)</Label><Input data-testid="new-password" value={form.password} placeholder="Leave blank to auto-generate" onChange={e => setForm({ ...form, password: e.target.value })} /></div>
      <div><Label>Start date</Label><Input data-testid="new-start-date" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
      <div><Label>Monthly price</Label><Input data-testid="new-monthly-price" type="number" value={form.monthly_price} onChange={e => setForm({ ...form, monthly_price: Number(e.target.value) })} /></div>
      <div><Label>Setup fee</Label><Input data-testid="new-setup-fee" type="number" value={form.setup_fee} onChange={e => setForm({ ...form, setup_fee: Number(e.target.value) })} /></div>
      <div className="flex items-end"><Button data-testid="create-restaurant-submit" disabled={!form.restaurant_name || !form.email || create.isPending} onClick={() => create.mutate()} className="w-full bg-[#2C614F]">Create & Generate</Button></div>
      {error && <p data-testid="create-restaurant-error" className="text-sm text-rose-700 md:col-span-3">{error}</p>}
    </CardContent></Card>}
    <div className="relative max-w-sm"><Search className="absolute left-3 top-2.5" size={16} /><Input data-testid="restaurant-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients" className="pl-9" /></div>
    <Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["Restaurant", "Username", "Owner", "Plan", "Expiry", "Status", "WhatsApp", "Actions"].map(h => <th className="px-4 py-3" key={h}>{h}</th>)}</tr></thead>
      <tbody>{(q.data || []).map(r => <tr data-testid={`admin-restaurant-${r.id}`} key={r.id} className="border-t hover:bg-muted/40">
        <td className="px-4 py-4 font-bold"><Link data-testid={`restaurant-name-link-${r.id}`} to={`/admin/restaurants/${r.id}`} className="text-[#D94833] underline-offset-4 hover:underline">{r.name}</Link><div className="text-xs font-normal text-muted-foreground">{r.email}</div></td>
        <td className="px-4 font-mono text-xs">{r.username}</td>
        <td className="px-4">{r.owner}</td>
        <td className="px-4">{fmtMoney(r.subscription.monthly_price)}</td>
        <td className="px-4">{r.subscription.end_date}</td>
        <td className="px-4"><span className="rounded-full bg-muted px-2 py-1 text-xs">{r.subscription.status}</span></td>
        <td className="px-4 capitalize">{r.whatsapp_status}</td>
        <td className="px-4"><div className="flex gap-2"><Link data-testid={`view-restaurant-${r.id}`} to={`/admin/restaurants/${r.id}`} className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">View</Link><Button data-testid={`toggle-restaurant-${r.id}`} size="sm" variant="outline" onClick={() => action.mutate({ id: r.id, status: r.subscription.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" })}>{r.subscription.status === "SUSPENDED" ? "Activate" : "Suspend"}</Button></div></td>
      </tr>)}</tbody>
    </table></div></CardContent></Card>
  </div>;
}
