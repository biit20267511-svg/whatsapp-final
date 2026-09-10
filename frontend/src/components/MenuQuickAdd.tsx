import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, type MenuCategory, type MenuItem } from "@/lib/api";

const EXAMPLE = "Chicken Karahi | Half 1200 / Full 2200\nSeekh Kabab 4 pcs 450\nZinger Burger - 650 - crispy fillet, mayo\nMint Margarita 250";

export function MenuQuickAdd({ open, onOpenChange, categories, defaultCategoryId }: { open: boolean; onOpenChange: (v: boolean) => void; categories: MenuCategory[]; defaultCategoryId: string }) {
  const client = useQueryClient();
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [text, setText] = useState("");
  const lines = useMemo(() => text.split("\n").map((l) => l.trim()).filter(Boolean), [text]);
  const preview = useMemo(() => lines.map((l) => ({ line: l, ok: /\d/.test(l) })), [lines]);
  const mutation = useMutation({
    mutationFn: () => apiPost<{ created: MenuItem[]; failed: string[] }>("/menu/items/bulk", { category_id: categoryId || defaultCategoryId, lines }),
    onSuccess: (res) => { void client.invalidateQueries({ queryKey: ["menu"] }); toast.success(`${res.created.length} dishes added${res.failed.length ? ` · ${res.failed.length} line(s) skipped (price missing)` : ""}`); setText(res.failed.join("\n")); if (!res.failed.length) onOpenChange(false); },
    onError: () => toast.error("Quick add failed"),
  });
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-testid="quick-add-dialog" className="sm:max-w-xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2 font-heading text-2xl"><Zap size={20} className="text-primary" /> Quick add — ek line, ek dish</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Category</Label><Select value={categoryId || defaultCategoryId} onValueChange={setCategoryId}><SelectTrigger data-testid="quick-add-category"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Dishes (har line par ek)</Label><Textarea data-testid="quick-add-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} className="min-h-40 font-mono text-sm" /></div>
        <div className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Formats</p>
          <p><code>Chicken Karahi 1200</code> → naam + price</p>
          <p><code>Chicken Karahi | Half 1200 / Full 2200</code> → sizes ke saath</p>
          <p><code>Zinger Burger - 650 - description</code> → description bhi</p>
        </div>
        {lines.length > 0 && <p data-testid="quick-add-preview" className="text-xs text-muted-foreground">{preview.filter((p) => p.ok).length} ready · {preview.filter((p) => !p.ok).length} missing price</p>}
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button data-testid="quick-add-submit" disabled={!lines.length || !(categoryId || defaultCategoryId) || mutation.isPending} onClick={() => mutation.mutate()} className="bg-primary">Add {lines.length || ""} dishes</Button></div>
    </DialogContent>
  </Dialog>;
}
