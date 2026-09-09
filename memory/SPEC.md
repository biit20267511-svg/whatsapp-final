# AI Restaurant WhatsApp Ordering SaaS

## What it does
Super Admin manages restaurant clients, credentials, manual subscriptions, payments, reminders and platform pricing. Restaurant owners manage a tenant-isolated dashboard while a controlled Gemini assistant takes WhatsApp orders through Baileys or Simulator. Both panels support system-aware dark mode.

## Data model
Mongo collections: users, restaurants, subscriptions, payments, notifications, audit_logs, admin_settings, google_sheet_connections, google_sync_jobs, ai_settings, whatsapp_connections, menu_categories, menu_items, customers, conversations, messages, orders, counters. Documents use string UUIDs and tenant scope through `restaurant_id`.

## Key flows
- Super Admin: /admin/restaurants list → click a restaurant name to open /admin/restaurants/:id detail page with stats, editable restaurant info, editable credentials (email/username/new password + reset), subscription actions (payment, extend, suspend, reminder), payment history and recent orders. Custom username/password can be supplied at creation.
- Login accepts email or username (case-insensitive, whitespace-trimmed) at POST /api/auth/login.
- Admin panel is realtime: SSE /api/stream mirrors all tenant events to SUPER_ADMIN subscribers and invalidates admin queries.
- Login with the seeded owner account, then view dashboard analytics and orders.
- Use WhatsApp → Test Simulator to send customer messages; the AI reads the real menu, mutates the cart only through backend tools, computes totals deterministically, and creates an order after explicit confirmation.
- Open Orders, inspect an order, and advance New → Confirmed → Preparing → Ready → Out for Delivery → Delivered; status notifications are persisted in the conversation and sent through the selected provider.
- Manage menu, customers, restaurant settings, AI settings, provider configuration, and human handoff.
- Menu command center: stats bar, category pills with counts, grid/table views, availability filter, dish dialog (image URL + presets, tags, original_price discount), instant AI-availability switch, category rename, bulk availability toggle and bulk price adjust (POST /api/menu/bulk-availability, /api/menu/bulk-price, PUT /api/menu/categories/{id}). MenuItem now has tags[] and original_price.
- UI theme: Plus Jakarta Sans body / Space Grotesk headings / JetBrains Mono numbers, light #F8F9FA / dark #0D1111 command-center palette, sonner toasts mounted globally.
- AI replies are normalized to WhatsApp syntax before persistence and delivery: `*bold*` is used instead of Markdown `**bold**`.
- Meta Cloud API has a tenant-scoped masked credential form for App ID, App Secret, Graph URL, Phone Number ID, WABA ID, Access Token, and Verify Token; blank secret fields never overwrite saved secrets and webhook URLs use the configured public app URL.

## Auth
JWT bearer tokens are stored by the frontend in localStorage and sent in the Authorization header. Roles are `SUPER_ADMIN` and `RESTAURANT_ADMIN`. Admin routes require the admin role; restaurant APIs are tenant scoped and blocked when subscription status is EXPIRED or SUSPENDED, while billing remains accessible.

## Integrations
The backend uses the Emergent Universal LLM key with `emergentintegrations` and Gemini `gemini-3-flash-preview`. The Simulator is fully usable without external WhatsApp credentials. Baileys is a free self-hosted QR provider with per-restaurant persistent sessions under `whatsapp-gateway/sessions`; Evolution and Meta remain configuration-dependent.