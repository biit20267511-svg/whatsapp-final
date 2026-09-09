import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChefHat, CirclePlus, Eye, EyeOff, Flame, ImageIcon, LayoutGrid, MoreVertical, Pencil, Percent, Rows3, Search, Sparkles, Trash2, Upload, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiGet, apiPost, apiPut, type MenuCategory, type MenuItem, type MenuResponse } from "@/lib/api";

const TAG_PRESETS = ["Spicy", "Chef's Special", "Vegetarian", "BBQ", "Deal", "Dessert", "Drinks", "Family Pack"];
const PRESET_IMAGES = [
  { label: "Biryani", url: "https://images.pexels.com/photos/9738983/pexels-photo-9738983.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" },
  { label: "BBQ Boti", url: "https://images.pexels.com/photos/9867831/pexels-photo-9867831.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" },
  { label: "Seekh Kebab", url: "https://images.pexels.com/photos/7301037/pexels-photo-7301037.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" },
  { label: "Zinger Burger", url: "https://images.unsplash.com/photo-1561758033-d89a9ad46330?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { label: "Smash Burger", url: "https://images.unsplash.com/photo-1551782450-a2132b4ba21d?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
];
const rs = (value: number | undefined | null) => `Rs. ${Number(value || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

interface DishForm { id?: string; category_id: string; name: string; description: string; price: string; original_price: string; image_url: string; tags: string[]; available: boolean }
const emptyDish = (categoryId: string): DishForm => ({ category_id: categoryId, name: "", description: "", price: "", original_price: "", image_url: "", tags: [], available: true });

function DishImage({ item, className }: { item: MenuItem; className: string }) {
  if (item.image_url) return <img src={item.image_url} alt={item.name} loading="lazy" className={`${className} object-cover`} />;
  return <div className={`${className} grid place-items-center bg-gradient-to-br from-primary/15 via-muted to-secondary text-primary`}><UtensilsCrossed size={22} /></div>;
}

export default function Menu() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["menu"], queryFn: () => apiGet<MenuResponse>("/menu") });
  const [activeId, setActiveId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "live" | "hidden">("all");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [category, setCategory] = useState("");
  const [dishOpen, setDishOpen] = useState(false);
  const [dish, setDish] = useState<DishForm>(emptyDish(""));
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPercent, setBulkPercent] = useState("10");
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/image", { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` }, body: form });
      if (!res.ok) throw new Error("upload failed");
      const data = (await res.json()) as { url: string };
      setDish((d) => ({ ...d, image_url: data.url }));
      toast.success("Photo uploaded");
    } catch {
      toast.error("Upload failed — use a JPG/PNG/WEBP under 5 MB");
    } finally {
      setUploading(false);
    }
  };

  const categories = query.data?.categories || [];
  const items = query.data?.items || [];
  const selectedId = activeId !== "all" && categories.some((c) => c.id === activeId) ? activeId : "all";
  const selected = categories.find((c) => c.id === selectedId);
  const refresh = () => void client.invalidateQueries({ queryKey: ["menu"] });

  const visibleItems = useMemo(() => items.filter((entry) => {
    if (selectedId !== "all" && entry.category_id !== selectedId) return false;
    if (availabilityFilter === "live" && !entry.available) return false;
    if (availabilityFilter === "hidden" && entry.available) return false;
    return `${entry.name} ${entry.description} ${(entry.tags || []).join(" ")}`.toLowerCase().includes(search.toLowerCase());
  }), [items, selectedId, availabilityFilter, search]);

  const stats = useMemo(() => ({
    total: items.length,
    live: items.filter((i) => i.available).length,
    hidden: items.filter((i) => !i.available).length,
    avg: items.length ? Math.round(items.reduce((s, i) => s + i.price, 0) / items.length) : 0,
  }), [items]);

  const addCategory = useMutation({ mutationFn: () => apiPost<MenuCategory>("/menu/categories", { name: category.trim(), sort_order: categories.length + 1 }), onSuccess: (created) => { setCategory(""); setActiveId(created.id); refresh(); toast.success(`Category "${created.name}" added`); } });
  const renameCategory = useMutation({ mutationFn: () => apiPut(`/menu/categories/${selectedId}`, { name: renameValue.trim() }), onSuccess: () => { setRenameOpen(false); refresh(); toast.success("Category renamed"); } });
  const deleteCategory = useMutation({ mutationFn: (id: string) => apiDelete(`/menu/categories/${id}`), onSuccess: () => { setActiveId("all"); refresh(); toast.success("Category deleted"); } });
  const bulkAvailability = useMutation({ mutationFn: (available: boolean) => apiPost<{ updated: number }>("/menu/bulk-availability", { category_id: selectedId, available }), onSuccess: (res, available) => { refresh(); toast.success(`${res.updated} dishes ${available ? "now live on AI" : "hidden from AI"}`); } });
  const bulkPrice = useMutation({ mutationFn: () => apiPost<{ updated: number }>("/menu/bulk-price", { category_id: selectedId, percent: Number(bulkPercent) }), onSuccess: (res) => { setBulkOpen(false); refresh(); toast.success(`Prices adjusted for ${res.updated} dishes`); } });
  const saveDish = useMutation({
    mutationFn: () => {
      const payload = { category_id: dish.category_id, name: dish.name.trim(), description: dish.description.trim(), price: Number(dish.price), original_price: dish.original_price ? Number(dish.original_price) : null, image_url: dish.image_url.trim(), tags: dish.tags, available: dish.available, addon_item_ids: [] };
      return dish.id ? apiPut<MenuItem>(`/menu/items/${dish.id}`, payload) : apiPost<MenuItem>("/menu/items", payload);
    },
    onSuccess: () => { setDishOpen(false); refresh(); toast.success(dish.id ? "Dish updated" : "Dish added to menu"); },
    onError: () => toast.error("Could not save dish"),
  });
  const toggleItem = useMutation({ mutationFn: ({ id, available }: { id: string; available: boolean }) => apiPut(`/menu/items/${id}`, { available }), onSuccess: (_, vars) => { refresh(); toast.success(vars.available ? "Dish live — AI can sell it" : "Dish hidden — AI marks it out of stock"); } });
  const deleteItem = useMutation({ mutationFn: (id: string) => apiDelete(`/menu/items/${id}`), onSuccess: () => { refresh(); toast.success("Dish removed"); } });

  const openAdd = () => { setDish(emptyDish(selectedId !== "all" ? selectedId : categories[0]?.id || "")); setDishOpen(true); };
  const openEdit = (entry: MenuItem) => { setDish({ id: entry.id, category_id: entry.category_id, name: entry.name, description: entry.description, price: String(entry.price), original_price: entry.original_price ? String(entry.original_price) : "", image_url: entry.image_url || "", tags: entry.tags || [], available: entry.available }); setDishOpen(true); };
  const toggleTag = (tag: string) => setDish((d) => ({ ...d, tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag] }));
  const countFor = (id: string) => items.filter((entry) => entry.category_id === id).length;

  return <div data-testid="menu-page" className="page-enter mx-auto max-w-7xl space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Menu command center</p>
        <h1 data-testid="menu-heading" className="mt-2 font-heading text-4xl font-bold tracking-tight">Menu</h1>
        <p data-testid="menu-subtitle" className="mt-2 max-w-xl text-muted-foreground">Har dish yahan se control hoti hai — jo live hai, wohi AI WhatsApp par sell karta hai.</p>
      </div>
      <Button data-testid="add-item-button" onClick={openAdd} disabled={!categories.length} className="gap-2 rounded-full bg-primary px-5 shadow-lg shadow-primary/25 transition-transform duration-200 hover:-translate-y-0.5"><CirclePlus size={17} /> Add Dish</Button>
    </div>

    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {([["menu-stat-total", "Total Dishes", stats.total, ChefHat], ["menu-stat-live", "Live on AI", stats.live, Sparkles], ["menu-stat-hidden", "Hidden / Out of Stock", stats.hidden, EyeOff], ["menu-stat-avg", "Avg Dish Price", rs(stats.avg), Flame]] as const).map(([testId, label, value, Icon]) => <Card key={testId} data-testid={testId} className="relative overflow-hidden rounded-2xl border-border/60 transition-transform duration-200 hover:-translate-y-0.5">
        <div className="accent-line absolute left-0 top-0 w-full" />
        <CardContent className="p-4">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span><Icon size={16} className="text-primary" /></div>
          <p className="font-money mt-2 text-2xl font-bold">{value}</p>
        </CardContent>
      </Card>)}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button data-testid="select-category-all" onClick={() => setActiveId("all")} className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 ${selectedId === "all" ? "bg-foreground text-background" : "border border-border/60 bg-card text-muted-foreground hover:text-foreground"}`}>All <span className="ml-1 opacity-60">{items.length}</span></button>
      {categories.map((current) => <button key={current.id} data-testid={`select-category-${current.id}`} onClick={() => setActiveId(current.id)} className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 ${selectedId === current.id ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "border border-border/60 bg-card text-muted-foreground hover:text-foreground"}`}>{current.name} <span className="ml-1 opacity-60">{countFor(current.id)}</span></button>)}
      <div className="flex items-center gap-1.5 rounded-full border border-dashed border-border bg-card py-1 pl-3 pr-1">
        <Input data-testid="category-name-input" value={category} onChange={(event) => setCategory(event.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && category.trim()) addCategory.mutate(); }} placeholder="New category" className="h-7 w-32 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" />
        <Button data-testid="add-category-button" onClick={() => addCategory.mutate()} disabled={!category.trim() || addCategory.isPending} size="icon" className="h-7 w-7 rounded-full bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground"><CirclePlus size={14} /></Button>
      </div>
    </div>

    <Card className="rounded-2xl border-border/60">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-60"><Search size={15} className="absolute left-3 top-2.5 text-muted-foreground" /><Input data-testid="menu-search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dishes or tags" className="h-9 pl-9" /></div>
          <div className="flex rounded-full border border-border/60 p-0.5">
            {(["all", "live", "hidden"] as const).map((f) => <button key={f} data-testid={`filter-${f}`} onClick={() => setAvailabilityFilter(f)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors ${availabilityFilter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{f === "live" ? "Live on AI" : f}</button>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/60 p-0.5">
            <button data-testid="view-grid-button" onClick={() => setView("grid")} className={`rounded-md p-1.5 ${view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground"}`}><LayoutGrid size={16} /></button>
            <button data-testid="view-table-button" onClick={() => setView("table")} className={`rounded-md p-1.5 ${view === "table" ? "bg-muted text-foreground" : "text-muted-foreground"}`}><Rows3 size={16} /></button>
          </div>
          {selected && <DropdownMenu>
            <DropdownMenuTrigger data-testid="category-actions-button" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 text-sm font-medium transition-colors hover:bg-muted"><MoreVertical size={14} /> {selected.name}</DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem data-testid="category-rename-action" onClick={() => { setRenameValue(selected.name); setRenameOpen(true); }}><Pencil size={14} className="mr-2" /> Rename category</DropdownMenuItem>
              <DropdownMenuItem data-testid="category-all-live-action" onClick={() => bulkAvailability.mutate(true)}><Eye size={14} className="mr-2" /> All dishes live on AI</DropdownMenuItem>
              <DropdownMenuItem data-testid="category-all-hidden-action" onClick={() => bulkAvailability.mutate(false)}><EyeOff size={14} className="mr-2" /> Hide all from AI</DropdownMenuItem>
              <DropdownMenuItem data-testid="category-bulk-price-action" onClick={() => setBulkOpen(true)}><Percent size={14} className="mr-2" /> Bulk price adjust</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid={`delete-category-${selected.id}`} onClick={() => deleteCategory.mutate(selected.id)} className="text-rose-600 focus:text-rose-600"><Trash2 size={14} className="mr-2" /> Delete category</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
      </CardContent>
    </Card>

    {!categories.length && <Card className="rounded-2xl border-2 border-dashed"><CardContent className="grid place-items-center p-16 text-center text-muted-foreground"><UtensilsCrossed size={28} /><p className="mt-4 font-heading text-lg font-bold text-foreground">Your catalog starts here</p><p className="mt-1 max-w-sm text-sm">Upar "New category" mein pehli category banayen (e.g. Biryani, BBQ), phir dishes add karen.</p></CardContent></Card>}

    {categories.length > 0 && view === "grid" && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visibleItems.map((entry) => <Card data-testid={`menu-item-${entry.id}`} key={entry.id} className={`group overflow-hidden rounded-2xl border-border/60 py-0 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg ${!entry.available ? "opacity-70" : ""}`}>
        <div className="relative h-36 w-full overflow-hidden">
          <DishImage item={entry} className="h-36 w-full transition-transform duration-300 group-hover:scale-105" />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">{(entry.tags || []).slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">{tag}</span>)}</div>
          {!entry.available && <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[1px]"><span className="rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white">Out of stock on AI</span></div>}
        </div>
        <CardContent className="p-4 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><h3 className="truncate font-heading font-bold">{entry.name}</h3><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{entry.description || "No description yet"}</p></div>
            <DropdownMenu>
              <DropdownMenuTrigger data-testid={`item-menu-${entry.id}`} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><MoreVertical size={15} /></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-testid={`edit-item-${entry.id}`} onClick={() => openEdit(entry)}><Pencil size={14} className="mr-2" /> Edit dish</DropdownMenuItem>
                <DropdownMenuItem data-testid={`delete-item-${entry.id}`} onClick={() => deleteItem.mutate(entry.id)} className="text-rose-600 focus:text-rose-600"><Trash2 size={14} className="mr-2" /> Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="font-money text-lg font-bold text-primary">{rs(entry.price)}</span>
              {entry.original_price && entry.original_price > entry.price ? <span className="font-money text-xs text-muted-foreground line-through">{rs(entry.original_price)}</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${entry.available ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{entry.available ? "Live" : "Hidden"}</span>
              <Switch data-testid={`dish-availability-switch-${entry.id}`} checked={entry.available} onCheckedChange={(checked) => toggleItem.mutate({ id: entry.id, available: checked })} />
            </div>
          </div>
        </CardContent>
      </Card>)}
      {!visibleItems.length && <p data-testid="menu-empty-search" className="col-span-full py-10 text-center text-sm text-muted-foreground">No dishes match — search ya filter change karke dekhen, ya "Add Dish" se nayi dish banayen.</p>}
    </div>}

    {categories.length > 0 && view === "table" && <Card className="overflow-hidden rounded-2xl border-border/60"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr>{["Dish", "Category", "Tags", "Price", "AI Status", ""].map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{visibleItems.map((entry) => <tr key={entry.id} data-testid={`menu-row-${entry.id}`} className="border-t border-border/60 transition-colors hover:bg-muted/40">
        <td className="px-4 py-3"><div className="flex items-center gap-3"><DishImage item={entry} className="h-10 w-10 shrink-0 rounded-lg" /><div className="min-w-0"><p className="truncate font-semibold">{entry.name}</p><p className="max-w-[260px] truncate text-xs text-muted-foreground">{entry.description}</p></div></div></td>
        <td className="px-4">{categories.find((c) => c.id === entry.category_id)?.name || "—"}</td>
        <td className="px-4"><div className="flex flex-wrap gap-1">{(entry.tags || []).map((tag) => <Badge key={tag} className="border border-border bg-muted text-[10px] text-muted-foreground">{tag}</Badge>)}</div></td>
        <td className="px-4"><span className="font-money font-bold text-primary">{rs(entry.price)}</span></td>
        <td className="px-4"><Switch data-testid={`dish-availability-switch-${entry.id}`} checked={entry.available} onCheckedChange={(checked) => toggleItem.mutate({ id: entry.id, available: checked })} /></td>
        <td className="px-4"><div className="flex justify-end gap-1"><button data-testid={`edit-item-${entry.id}`} onClick={() => openEdit(entry)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil size={15} /></button><button data-testid={`delete-item-${entry.id}`} onClick={() => deleteItem.mutate(entry.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 size={15} /></button></div></td>
      </tr>)}</tbody>
    </table>{!visibleItems.length && <p className="p-8 text-center text-sm text-muted-foreground">No dishes match this view.</p>}</div></CardContent></Card>}

    <Dialog open={dishOpen} onOpenChange={setDishOpen}>
      <DialogContent data-testid="dish-dialog" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle className="font-heading text-2xl">{dish.id ? "Edit dish" : "Add a dish"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Dish name *</Label><Input data-testid="item-name-input" value={dish.name} onChange={(e) => setDish({ ...dish, name: e.target.value })} placeholder="e.g. Chicken Biryani (Full)" /></div>
          <div><Label>Category</Label><Select value={dish.category_id} onValueChange={(v) => setDish({ ...dish, category_id: v })}><SelectTrigger data-testid="item-category-select"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="sm:col-span-2"><Label>Description (AI isse customers ko batata hai)</Label><Textarea data-testid="item-description-input" value={dish.description} onChange={(e) => setDish({ ...dish, description: e.target.value })} placeholder="Basmati rice, tender chicken, signature masala — serves 2" className="min-h-16" /></div>
          <div><Label>Price (PKR) *</Label><Input data-testid="item-price-input" type="number" min="0" value={dish.price} onChange={(e) => setDish({ ...dish, price: e.target.value })} placeholder="650" /></div>
          <div><Label>Original price (discount dikhane ke liye)</Label><Input data-testid="item-original-price-input" type="number" min="0" value={dish.original_price} onChange={(e) => setDish({ ...dish, original_price: e.target.value })} placeholder="800" /></div>
          <div className="sm:col-span-2">
            <Label className="flex items-center gap-1.5"><ImageIcon size={14} /> Dish photo</Label>
            <div className="mt-1 flex items-center gap-3">
              {dish.image_url ? <img src={dish.image_url} alt="Dish preview" className="h-16 w-20 shrink-0 rounded-lg border border-border/60 object-cover" /> : <div className="grid h-16 w-20 shrink-0 place-items-center rounded-lg border border-dashed border-border text-muted-foreground"><ImageIcon size={18} /></div>}
              <div className="min-w-0 flex-1 space-y-2">
                <label data-testid="upload-photo-button" className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/20 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                  <Upload size={14} /> {uploading ? "Uploading…" : "Upload photo"}
                  <input data-testid="item-photo-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ""; }} />
                </label>
                <Input data-testid="item-image-input" value={dish.image_url} onChange={(e) => setDish({ ...dish, image_url: e.target.value })} placeholder="…ya image URL paste karein" className="h-8 text-xs" />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">{PRESET_IMAGES.map((preset) => <button key={preset.label} data-testid={`preset-image-${preset.label.toLowerCase().replaceAll(" ", "-")}`} type="button" onClick={() => setDish({ ...dish, image_url: preset.url })} className={`overflow-hidden rounded-lg border-2 transition-colors ${dish.image_url === preset.url ? "border-primary" : "border-transparent hover:border-border"}`}><img src={preset.url} alt={preset.label} className="h-12 w-16 object-cover" /></button>)}</div>
          </div>
          <div className="sm:col-span-2">
            <Label>Tags</Label>
            <div className="mt-1 flex flex-wrap gap-2">{TAG_PRESETS.map((tag) => <button key={tag} data-testid={`tag-toggle-${tag.toLowerCase().replaceAll(" ", "-").replace("'", "")}`} type="button" onClick={() => toggleTag(tag)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${dish.tags.includes(tag) ? "bg-primary text-primary-foreground" : "border border-border/60 text-muted-foreground hover:text-foreground"}`}>{tag}</button>)}</div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 p-3 sm:col-span-2">
            <div><p className="text-sm font-semibold">Live on WhatsApp AI</p><p className="text-xs text-muted-foreground">Off karne par AI isse out-of-stock batayega</p></div>
            <Switch data-testid="dish-form-availability-switch" checked={dish.available} onCheckedChange={(checked) => setDish({ ...dish, available: checked })} />
          </div>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDishOpen(false)}>Cancel</Button><Button data-testid="save-dish-button" disabled={!dish.name.trim() || !dish.price || !dish.category_id || saveDish.isPending} onClick={() => saveDish.mutate()} className="bg-primary">{dish.id ? "Save changes" : "Add dish"}</Button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
      <DialogContent data-testid="rename-category-dialog" className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="font-heading">Rename category</DialogTitle></DialogHeader>
        <Input data-testid="rename-category-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button><Button data-testid="rename-category-save" disabled={!renameValue.trim() || renameCategory.isPending} onClick={() => renameCategory.mutate()}>Save</Button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
      <DialogContent data-testid="bulk-price-dialog" className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="font-heading">Bulk price adjust — {selected?.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Poori category ki prices ek saath adjust karen (e.g. inflation par +10%).</p>
        <div><Label>Percent change</Label><Input data-testid="bulk-percent-input" type="number" value={bulkPercent} onChange={(e) => setBulkPercent(e.target.value)} placeholder="10" /><p className="mt-1 text-xs text-muted-foreground">Positive = increase, negative = discount (e.g. -15)</p></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button><Button data-testid="bulk-price-apply" disabled={!bulkPercent || bulkPrice.isPending} onClick={() => bulkPrice.mutate()}>Apply</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}
