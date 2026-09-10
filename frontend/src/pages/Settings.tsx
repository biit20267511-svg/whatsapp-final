import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bike, Save, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DeliverySettings } from "@/components/DeliverySettings";
import { ApiError, apiGet, apiPut, formatApiError, type Restaurant } from "@/lib/api";

const TEXT_FIELDS = [["name", "Restaurant name"], ["currency", "Currency"], ["contact_number", "Contact number"], ["whatsapp_number", "WhatsApp number"], ["city", "City"], ["opening_hours", "Opening hours"]] as const;

export default function Settings() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["restaurant"], queryFn: () => apiGet<Restaurant>("/restaurant") });
  const [form, setForm] = useState<Restaurant | null>(null);
  useEffect(() => { if (query.data) setForm(query.data); }, [query.data]);
  const mutation = useMutation({
    mutationFn: () => {
      const { id: _id, ...body } = form as Restaurant;
      return apiPut<Restaurant>("/restaurant", { ...body, delivery_zones: (body.delivery_zones || []).filter((z) => z.name.trim()) });
    },
    onSuccess: (data) => { setForm(data); client.setQueryData(["restaurant"], data); void client.invalidateQueries({ queryKey: ["session"] }); toast.success("Settings saved — AI ab nayi settings use karega"); },
    onError: (err) => toast.error(err instanceof ApiError ? formatApiError(err.body) : "Could not save settings"),
  });
  if (!form) return <p data-testid="settings-loading">Loading settings…</p>;
  const patch = (p: Partial<Restaurant>) => setForm((f) => (f ? { ...f, ...p } : f));

  return <div data-testid="settings-page" className="mx-auto max-w-4xl space-y-6">
    <div className="flex items-end justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2C614F]">Workspace</p><h1 data-testid="settings-heading" className="mt-2 font-heading text-4xl font-extrabold">Restaurant settings</h1></div>
      <Button data-testid="save-settings-button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2 rounded-full bg-[#D94833] hover:bg-[#C23E2A]"><Save size={16} /> {mutation.isPending ? "Saving…" : "Save"}</Button>
    </div>

    <Card className="rounded-2xl border-[#E5E7E2]">
      <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><Store size={17} /> Basic info</CardTitle></CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        {TEXT_FIELDS.map(([key, label]) => <div key={key}><Label>{label}</Label><Input data-testid={`settings-${key}`} value={String(form[key] ?? "")} onChange={(e) => patch({ [key]: e.target.value })} /></div>)}
        <div className="md:col-span-2"><Label>Address</Label><Input data-testid="settings-address" value={form.address || ""} onChange={(e) => patch({ address: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>Description</Label><Textarea data-testid="settings-description" value={form.description || ""} onChange={(e) => patch({ description: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>AI greeting</Label><Textarea data-testid="settings-ai-greeting" value={form.ai_greeting || ""} onChange={(e) => patch({ ai_greeting: e.target.value })} /></div>
      </CardContent>
    </Card>

    <Card className="rounded-2xl border-[#E5E7E2]">
      <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><Bike size={17} /> Delivery, areas & charges</CardTitle><p className="text-sm text-muted-foreground">AI WhatsApp par customer ka area dekh kar yahi charges lagayega.</p></CardHeader>
      <CardContent><DeliverySettings form={form} onChange={patch} /></CardContent>
    </Card>
  </div>;
}
