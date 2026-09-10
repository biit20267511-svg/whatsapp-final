import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PlugZap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPost, apiPut, formatApiError } from "@/lib/api";

interface AISettings { provider: string; model: string; personality: string; language_behavior: string; upsell_enabled: boolean; max_upsell_attempts: number; human_handoff_enabled: boolean; api_key_masked?: string; has_api_key?: boolean }
type Form = AISettings & { api_key?: string };

export default function AISettings() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["ai-settings"], queryFn: () => apiGet<AISettings>("/restaurant/ai-settings") });
  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => { if (query.data) setForm(query.data); }, [query.data]);
  const mutation = useMutation({
    mutationFn: () => { const { api_key_masked: _m, has_api_key: _h, ...body } = form as Form; return apiPut<AISettings>("/restaurant/ai-settings", { ...body, api_key: body.api_key?.trim() || undefined }); },
    onSuccess: (data) => { setForm(data); client.setQueryData(["ai-settings"], data); toast.success("AI settings saved"); },
    onError: (err) => toast.error(err instanceof ApiError ? formatApiError(err.body) : "Could not save"),
  });
  const test = useMutation({ mutationFn: () => apiPost<{ ok: boolean; detail: string; model: string }>("/restaurant/ai-settings/test"), onSuccess: (r) => (r.ok ? toast.success(`Connected — ${r.model}: ${r.detail}`) : toast.error(r.detail)) });
  if (!form) return <p data-testid="ai-settings-loading">Loading AI settings…</p>;
  const patch = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));
  const toggle = (key: "upsell_enabled" | "human_handoff_enabled", label: string, hint: string, testId: string) => <label className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span><span className="block text-sm font-semibold">{label}</span><span className="text-xs text-muted-foreground">{hint}</span></span><Switch data-testid={testId} checked={Boolean(form[key])} onCheckedChange={(v) => patch({ [key]: v })} /></label>;

  return <div data-testid="ai-settings-page" className="mx-auto max-w-3xl space-y-6">
    <div className="flex items-end justify-between">
      <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#2C614F]"><Sparkles size={14} /> Assistant behavior</p><h1 data-testid="ai-settings-heading" className="mt-2 font-heading text-4xl font-extrabold">AI settings</h1></div>
      <div className="flex gap-2"><Button data-testid="test-ai-button" variant="outline" onClick={() => test.mutate()} disabled={test.isPending} className="gap-2 rounded-full"><PlugZap size={15} /> {test.isPending ? "Testing…" : "Test connection"}</Button><Button data-testid="save-ai-settings-button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded-full bg-[#D94833] hover:bg-[#C23E2A]">Save</Button></div>
    </div>
    <Card className="rounded-2xl border-[#E5E7E2]"><CardContent className="space-y-5 p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div><Label>Provider</Label><Input data-testid="ai-provider-input" value={form.provider} readOnly className="bg-muted/50" /></div>
        <div><Label>Model</Label><Input data-testid="ai-model-input" value={form.model} onChange={(e) => patch({ model: e.target.value })} /></div>
      </div>
      <div><Label>Own API key (optional — blank = platform key)</Label><Input data-testid="ai-api-key-input" type="password" value={form.api_key || ""} onChange={(e) => patch({ api_key: e.target.value })} placeholder={form.has_api_key ? `Saved: ${form.api_key_masked}` : "Platform key in use"} /></div>
      <div><Label>Personality</Label><Input data-testid="ai-personality-input" value={form.personality || ""} onChange={(e) => patch({ personality: e.target.value })} placeholder="friendly Pakistani restaurant receptionist" /></div>
      <div><Label>Language behavior</Label><Textarea data-testid="ai-language-input" value={form.language_behavior || ""} onChange={(e) => patch({ language_behavior: e.target.value })} placeholder="Auto-detect and reply in English, Urdu or Roman Urdu" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        {toggle("upsell_enabled", "Upselling", "AI drinks/sides suggest karega", "ai-upsell-switch")}
        {toggle("human_handoff_enabled", "Human handoff", "Customer staff se baat maang sake", "ai-handoff-switch")}
      </div>
      <div className="sm:w-1/2"><Label>Max upsell attempts</Label><Input data-testid="ai-max-upsell-input" type="number" min={0} max={5} value={form.max_upsell_attempts ?? 1} onChange={(e) => patch({ max_upsell_attempts: Number(e.target.value) })} /></div>
      <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">Delivery areas & charges <a href="/settings" className="font-semibold text-primary underline">Restaurant Settings → Delivery</a> mein set hote hain — AI unhi ko follow karta hai.</p>
    </CardContent></Card>
  </div>;
}
