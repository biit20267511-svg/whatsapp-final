import { useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { DeliveryZone, Restaurant } from "@/lib/api";

const PK_AREAS = ["DHA", "Gulberg", "Johar Town", "Model Town", "Bahria Town", "Cantt", "Wapda Town", "Clifton", "North Nazimabad", "F-7", "G-11", "Saddar"];
const newZone = (name = ""): DeliveryZone => ({ name, aliases: [], fee: 150, min_order: null, eta_min: null, active: true });

type Props = { form: Restaurant; onChange: (patch: Partial<Restaurant>) => void };

export function DeliverySettings({ form, onChange }: Props) {
  const zones = form.delivery_zones || [];
  const mode = form.delivery_mode || "fixed";
  const [draft, setDraft] = useState("");
  const update = (i: number, patch: Partial<DeliveryZone>) => onChange({ delivery_zones: zones.map((z, idx) => (idx === i ? { ...z, ...patch } : z)) });
  const add = (name: string) => { const n = name.trim(); if (!n || zones.some((z) => z.name.toLowerCase() === n.toLowerCase())) return; onChange({ delivery_zones: [...zones, newZone(n)] }); setDraft(""); };
  const num = (v: string) => (v === "" ? null : Number(v));

  return <div data-testid="delivery-settings" className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span><span className="block text-sm font-semibold">Delivery available</span><span className="text-xs text-muted-foreground">Off = sirf pickup</span></span><Switch data-testid="delivery-enabled-switch" checked={form.delivery_enabled !== false} onCheckedChange={(v) => onChange({ delivery_enabled: v })} /></label>
      <label className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span><span className="block text-sm font-semibold">Table reservations</span><span className="text-xs text-muted-foreground">AI table book kar sakta hai</span></span><Switch data-testid="reservations-enabled-switch" checked={Boolean(form.reservations_enabled)} onCheckedChange={(v) => onChange({ reservations_enabled: v })} /></label>
    </div>

    {form.delivery_enabled !== false && <>
      <div className="flex rounded-full border border-border/60 p-0.5 text-sm font-semibold">
        {(["fixed", "zones"] as const).map((m) => <button key={m} type="button" data-testid={`delivery-mode-${m}`} onClick={() => onChange({ delivery_mode: m })} className={`flex-1 rounded-full px-4 py-2 transition-colors ${mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{m === "fixed" ? "Fixed charges (sab areas same)" : "Zone-wise charges (area ke hisab se)"}</button>)}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label>{mode === "zones" ? "Default charges (unlisted areas)" : "Delivery charges (PKR)"}</Label><Input data-testid="settings-delivery_fee" type="number" min={0} value={form.delivery_fee ?? 0} onChange={(e) => onChange({ delivery_fee: Number(e.target.value) })} /></div>
        <div><Label>Minimum order (PKR)</Label><Input data-testid="settings-min_order" type="number" min={0} value={form.min_order ?? 0} onChange={(e) => onChange({ min_order: Number(e.target.value) })} /></div>
      </div>

      {mode === "fixed" && <div><Label>Delivery areas (AI customers ko batata hai)</Label><Input data-testid="settings-delivery_areas" value={form.delivery_areas || ""} onChange={(e) => onChange({ delivery_areas: e.target.value })} placeholder="Gulberg, DHA, Model Town, Johar Town" /></div>}

      {mode === "zones" && <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <label className="flex items-center justify-between gap-4"><span><span className="block text-sm font-semibold">Sirf listed areas mein delivery</span><span className="text-xs text-muted-foreground">On: bahar ka area ho to AI politely mana karega aur pickup offer karega. Off: default charges lagenge.</span></span><Switch data-testid="restrict-to-zones-switch" checked={form.restrict_to_zones !== false} onCheckedChange={(v) => onChange({ restrict_to_zones: v })} /></label>

        <div className="space-y-2">
          {zones.map((z, i) => <div key={z.id || i} data-testid={`zone-row-${i}`} className={`grid gap-2 rounded-xl border border-border/60 bg-card p-3 sm:grid-cols-[1.4fr_1.4fr_.7fr_.8fr_.7fr_auto_auto] sm:items-end ${!z.active ? "opacity-60" : ""}`}>
            <div><Label className="text-xs">Area name</Label><Input data-testid={`zone-name-${i}`} value={z.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="DHA Phase 5" className="h-9" /></div>
            <div><Label className="text-xs">Other names (comma)</Label><Input data-testid={`zone-aliases-${i}`} value={z.aliases.join(", ")} onChange={(e) => update(i, { aliases: e.target.value.split(",").map((a) => a.trim()).filter(Boolean) })} placeholder="dha 5, phase 5" className="h-9" /></div>
            <div><Label className="text-xs">Charges</Label><Input data-testid={`zone-fee-${i}`} type="number" min={0} value={z.fee} onChange={(e) => update(i, { fee: Number(e.target.value) })} className="h-9" /></div>
            <div><Label className="text-xs">Min order</Label><Input data-testid={`zone-min-${i}`} type="number" min={0} value={z.min_order ?? ""} onChange={(e) => update(i, { min_order: num(e.target.value) })} placeholder="—" className="h-9" /></div>
            <div><Label className="text-xs">Ride min</Label><Input data-testid={`zone-eta-${i}`} type="number" min={0} value={z.eta_min ?? ""} onChange={(e) => update(i, { eta_min: num(e.target.value) })} placeholder="—" className="h-9" /></div>
            <Switch data-testid={`zone-active-${i}`} checked={z.active} onCheckedChange={(v) => update(i, { active: v })} />
            <button type="button" data-testid={`zone-delete-${i}`} onClick={() => onChange({ delivery_zones: zones.filter((_, idx) => idx !== i) })} className="rounded-lg p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 size={15} /></button>
          </div>)}
          {!zones.length && <p data-testid="zones-empty" className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Abhi koi zone nahi — neeche area type karein ya quick chips se add karein.</p>}
        </div>

        <div className="flex gap-2"><div className="relative flex-1"><MapPin size={15} className="absolute left-3 top-2.5 text-muted-foreground" /><Input data-testid="zone-draft-input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }} placeholder="Naya area (e.g. Johar Town)" className="h-9 pl-9" /></div><Button type="button" data-testid="zone-add-button" onClick={() => add(draft)} disabled={!draft.trim()} className="h-9 gap-1 rounded-full"><Plus size={14} /> Add zone</Button></div>
        <div className="flex flex-wrap gap-1.5">{PK_AREAS.filter((a) => !zones.some((z) => z.name.toLowerCase() === a.toLowerCase())).map((a) => <button key={a} type="button" data-testid={`zone-chip-${a.toLowerCase().replaceAll(" ", "-")}`} onClick={() => add(a)} className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary">+ {a}</button>)}</div>
      </div>}

      <div className="grid gap-4 sm:grid-cols-4">
        {([["prep_time_min", "Prep min (min)"], ["prep_time_max", "Prep max (min)"], ["delivery_time_min", "Ride min (min)"], ["delivery_time_max", "Ride max (min)"]] as const).map(([k, label]) => <div key={k}><Label className="text-xs">{label}</Label><Input data-testid={`settings-${k}`} type="number" min={0} value={form[k] ?? 0} onChange={(e) => onChange({ [k]: Number(e.target.value) })} /></div>)}
      </div>
    </>}
  </div>;
}
