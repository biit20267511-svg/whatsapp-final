const BASE = "/api";

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);

export interface User { id: string; email: string; name: string; role?: string; restaurant_id?: string | null; username?: string; must_change_password?: boolean }
export interface Restaurant { id: string; name: string; description?: string; address?: string; city?: string; currency?: string; delivery_fee?: number; min_order?: number; prep_time_min?: number; prep_time_max?: number; delivery_time_min?: number; delivery_time_max?: number; ai_greeting?: string; opening_hours?: string; delivery_areas?: string; contact_number?: string; whatsapp_number?: string; reservations_enabled?: boolean }
export interface Subscription { id: string; restaurant_id: string; plan: string; status: "TRIAL" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "SUSPENDED"; payment_status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED"; start_date: string; end_date: string; next_payment_date: string; monthly_price: number; setup_fee: number; last_payment_date?: string | null; days_remaining: number }
export interface Session { user: User; restaurant: Restaurant; subscription: Subscription | null }
export interface AdminSummary { total_restaurants: number; active_restaurants: number; trial_restaurants: number; expiring_soon: number; expired: number; mrr: number; total_orders: number; today_orders: number; total_customers: number; total_revenue: number }
export interface AdminRestaurant extends Restaurant { owner: string; email: string; username: string; phone?: string; whatsapp_status: string; subscription: Subscription }
export interface CreatedRestaurant { restaurant: Restaurant; credentials: { username: string; password: string; login_url: string } }
export interface BillingResponse { subscription: Subscription; payments: Array<{ id: string; amount: number; status: string; paid_at: string; period_end: string }> }
export interface SheetsConfig { spreadsheet_id: string; google_client_id: string; google_client_secret_masked: string; status: string; tabs: string[]; callback_url: string }
export interface OrderItem { item_id: string; name: string; qty: number; unit_price: number; line_total: number }
export interface StatusHistory { status: string; at: string }
export interface Order { id: string; order_number: number; customer_name: string; customer_phone: string; customer_id: string; order_type: string; address?: string | null; contact_number?: string | null; items: OrderItem[]; subtotal: number; delivery_fee: number; total: number; currency: string; status: string; eta_min: number; eta_max: number; status_history: StatusHistory[]; created_at: string; updated_at: string }
export interface Analytics { today_orders: number; today_sales: number; week_sales: number; month_sales: number; pending_orders: number; completed_orders: number; average_order_value: number; total_orders: number; top_items: Array<{ name: string; qty: number; revenue: number }> }
export interface MenuCategory { id: string; name: string; sort_order: number }
export interface MenuItem { id: string; category_id: string; name: string; description: string; price: number; available: boolean; image_url?: string; addon_item_ids?: string[]; tags?: string[]; original_price?: number | null }
export interface MenuResponse { categories: MenuCategory[]; items: MenuItem[] }
export interface WhatsAppConfig { provider: string; status: string; connected_number?: string; logs: string[]; evolution?: { evolution_api_url: string; evolution_api_key_masked: string; evolution_instance_name: string }; meta?: { meta_app_id: string; meta_app_secret_masked: string; meta_graph_api_url: string; webhook_url: string; configured: boolean; meta_phone_number_id: string; meta_waba_id: string; meta_access_token_masked: string; meta_verify_token_masked: string }; evolution_webhook_url?: string; qr_code?: string | null; detail?: string }
export interface Message { id: string; direction: "in" | "out"; sender: string; text: string; created_at: string }
export interface Simulation { conversation: { id: string; ai_active: boolean; customer_phone: string; customer_name?: string; state: string } | null; messages: Message[] }
export interface Customer { id: string; name: string; phone: string; total_orders: number; total_spent: number; last_order_at?: string | null }
export interface Reservation { id: string; reservation_number: number; customer_name: string; customer_phone: string; contact_number?: string | null; party_size: number; date: string; time: string; notes?: string; status: string; status_history: StatusHistory[]; created_at: string }

export interface AdminPayment { id: string; restaurant_id: string; amount: number; status: string; paid_at: string; period_end: string }
export interface AdminRestaurantDetail { restaurant: Restaurant & { owner_name?: string; phone?: string; created_at?: string }; owner: { name: string; email: string; username: string; must_change_password: boolean; created_at: string }; subscription: Subscription; whatsapp: { provider: string; status: string; connected_number: string }; payments: AdminPayment[]; recent_orders: Array<{ id: string; order_number?: number; customer_name: string; total: number; status: string; created_at: string }>; stats: { total_orders: number; today_orders: number; total_revenue: number; total_customers: number; menu_items: number }; notifications: Array<{ id: string; type: string; message: string; status: string; created_at: string }> }
export interface CredentialsResult { ok: boolean; username: string; email: string; password_changed: boolean }

export function formatApiError(detail: unknown): string {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => typeof item === "object" && item && "msg" in item ? String(item.msg) : JSON.stringify(item)).join(" ");
  return typeof detail === "object" && detail && "detail" in detail ? formatApiError(detail.detail) : String(detail);
}

export const fmtMoney = (value: number | undefined | null, currency = "PKR") => `${currency} ${Number(value || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
