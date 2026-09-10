import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ItemOption } from "@/lib/api";

const PRESETS: Record<string, string[]> = { variants: ["Half / Full", "Small / Medium / Large", "Single / Double", "1 Kg / Half Kg", "Regular / Family"], addons: ["Extra Cheese", "Raita", "Salad", "Extra Sauce", "Naan", "Cold Drink"] };

type Props = { kind: "variants" | "addons"; value: ItemOption[]; onChange: (next: ItemOption[]) => void };

export function OptionListEditor({ kind, value, onChange }: Props) {
  const set = (i: number, patch: Partial<ItemOption>) => onChange(value.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const addMany = (names: string[]) => onChange([...value, ...names.filter((n) => !value.some((v) => v.name.toLowerCase() === n.toLowerCase())).map((name) => ({ name, price: 0 }))]);
  const isVariant = kind === "variants";
  return <div data-testid={`${kind}-editor`} className="space-y-2 rounded-xl border border-border/60 p-3">
    <div className="flex items-center justify-between"><Label>{isVariant ? "Sizes / variants" : "Add-ons (extras)"}</Label><button type="button" data-testid={`${kind}-add-button`} onClick={() => addMany([""])} className="flex items-center gap-1 text-xs font-semibold text-primary"><Plus size={13} /> Add</button></div>
    <p className="text-xs text-muted-foreground">{isVariant ? "Har size ki apni price (e.g. Half 700, Full 1300). Set hone par base price ignore hota hai." : "Customer extra add kar sake — price cart mein plus hoti hai."}</p>
    {value.map((o, i) => <div key={i} className="flex gap-2">
      <Input data-testid={`${kind}-name-${i}`} value={o.name} onChange={(e) => set(i, { name: e.target.value })} placeholder={isVariant ? "Full" : "Extra Cheese"} className="h-9" />
      <Input data-testid={`${kind}-price-${i}`} type="number" min={0} value={o.price} onChange={(e) => set(i, { price: Number(e.target.value) })} placeholder="PKR" className="h-9 w-28" />
      <button type="button" data-testid={`${kind}-remove-${i}`} onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="rounded-lg p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 size={14} /></button>
    </div>)}
    <div className="flex flex-wrap gap-1.5">{PRESETS[kind].map((p) => <button key={p} type="button" data-testid={`${kind}-preset-${p.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`} onClick={() => addMany(isVariant ? p.split(" / ") : [p])} className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary hover:text-primary">+ {p}</button>)}</div>
  </div>;
}
