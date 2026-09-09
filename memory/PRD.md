# PRD — AI Restaurant WhatsApp Ordering SaaS

Imported from `seri-student/waautomation` main branch and migrated into the starter’s FastAPI/Vite conventions. The product is a multi-tenant Pakistani restaurant ordering dashboard with a controlled Gemini assistant, deterministic pricing, simulator-driven WhatsApp flow, live order management, customer records, menu CRUD, analytics, human handoff, and provider abstraction.

## MVP acceptance
- Demo owner can log in with `owner@pizzapalace.pk` / `palace123`.
- Dashboard shows seeded Pizza Palace data.
- Simulator accepts natural-language order messages and persists the conversation/order.
- Staff can update order status and see status messages in the conversation.
- External WhatsApp providers are configuration-ready but not claimed as live without credentials.
- Baileys QR pairing persists its multi-file session, forwards inbound messages into the AI ordering engine, and sends replies/status notifications through the paired WhatsApp account.

## Import & Run (June 2026 — this environment)
Imported `khadijafatima02489-glitch/waautoma@main` with **zero source-code changes**; only `.env` files, deps, and supervisor process config were created.

### Setup done
- `backend/.env`: MONGO_URL (localhost), DB_NAME=test_database, CORS_ORIGINS, JWT_SECRET, EMERGENT_LLM_KEY (Emergent Universal key), WHATSAPP_GATEWAY_URL/SECRET
- `whatsapp-gateway/.env`: PORT=3001, BACKEND_URL, shared gateway secret; registered as supervisor program `whatsapp-gateway` (repo's own supervisor.conf copied to /etc/supervisor/conf.d/)
- Supervisor frontend command switched `yarn start` → `yarn dev` (repo is Vite; no `start` script — env config change, not repo code)
- pip install backend requirements (incl. emergentintegrations via extra index); yarn install in frontend/ and whatsapp-gateway/
- Seed runs on backend startup: demo tenant Pizza Palace + owner@pizzapalace.pk/palace123 + super admin admin@restaurantai.pk/ChangeMe@2026 (also in memory/test_credentials.md)

### Verification (all green)
- API smoke: health, both logins, negative login 401, menu (5 cats/6 items), analytics, orders, customers, whatsapp config, admin summary/restaurants, role gating
- Simulator AI flow (Gemini gemini-3-flash-preview via Emergent key): natural-language order → correct priced summary → confirmed order #1001, visible in Orders/Customers/Analytics
- `pytest` 12/12 (repo suite) + 14/14 regression suite by testing agent (26/26 total); `yarn typecheck` clean; `oxlint` 0 errors
- Browser pass: login → dashboard → menu → orders → admin panel; testing agent independent regression: no critical issues
- Test residue cleaned from DB (tscheck-* tenants removed; demo WhatsApp connection reset to simulator/connected)

### Orders tab redesign (June 2026, user-requested)
- `frontend/src/pages/Orders.tsx` rewritten into an operations command board: metrics ribbon (active/awaiting/revenue/avg), live AI pulse, search + delivery/pickup filters, Kanban ↔ Table view toggle, one-click status-advance pills, new-order sound chime toggle (localStorage)
- New: `components/OrderDrawer.tsx` (slide-over quick view: receipt, status chips, WhatsApp chat/notify links, maps link, timeline) and `lib/orderStatus.ts` (shared status flow/theme)
- Verified: typecheck + lint clean; testing agent frontend pass 40/40 assertions, no issues
- Kitchen Ticket Print (June 2026): `components/KitchenTicket.tsx` — thermal-style 80mm ticket dialog from the order drawer ("Print kitchen ticket"), print CSS in index.css prints only the ticket via window.print(); verified via screenshot + typecheck/lint
- Auto Print on Confirm (June 2026): "Auto-print on confirm" toggle on Orders page (localStorage `orders-autoprint`); watches order status transitions into "Confirmed" and auto-prints the kitchen ticket via hidden `AutoPrintTicket` (shared `TicketBody`); verified in browser (print fired exactly once on New→Confirmed transition)
- Order Detail Refresh + Live Push (June 2026): `pages/OrderDetail.tsx` rewritten in board style (themed stepper/advance, receipt + customer + timeline cards, WhatsApp chat/notify/map links, kitchen ticket dialog). `RealtimeContext.tsx` upgraded: SSE now also invalidates order-detail/customers queries, shows a sonner toast on new_order, and auto-reconnects with backoff on stream errors; Orders board polling reduced to 30s (SSE is primary). Testing agent: 100% — external PATCH reflected on open board in ~1s; new simulator order appeared with toast in ~7.5s; pytest 26/26

### Deployment readiness fixes (June 2026)
- Emergent K8s deploy was timing out (pod never ready). Root cause: `load_dotenv(..., override=True)` in server.py and database.py stomped the platform-injected MONGO_URL/DB_NAME (prod Atlas) with local .env values → backend couldn't reach Mongo → readiness failed. Also `.gitignore` blocked all .env files from the deploy bundle.
- Fixed: override=False in both files; removed `.env`/`.env.*`/`*.env` from .gitignore. Deployment agent re-scan: PASS. Testing agent regression: 100% backend+frontend, pytest 26/26.

### Known limits (by design)
- Real WhatsApp delivery needs a human QR scan (Baileys) or Meta Cloud credentials; gateway is up and ready on :3001
- Google Sheets OAuth sync and reminder crons inactive (need external credentials not shipped in repo)

## Re-import & Run (June 2026 — fresh pod, this session)
Re-imported `khadijafatima02489-glitch/waaautoma@main` with **zero source-code changes**. Writes limited to: `backend/.env` (MONGO_URL, DB_NAME=test_database, CORS_ORIGINS, JWT_SECRET, EMERGENT_LLM_KEY, WHATSAPP_GATEWAY_URL/SECRET), `whatsapp-gateway/.env`, `frontend/.env`, `memory/test_credentials.md` (gitignored), pip/yarn installs, and pod supervisor config (frontend `yarn start`→`yarn dev` for Vite; repo's whatsapp-gateway supervisor.conf registered).
- Verified this session: `python -c 'import server'` OK; API smoke (health, both logins, negative 401); gateway :3001 healthy; simulator AI flow via Emergent key → order #1001 PKR 920; pytest 39/39; `yarn typecheck` clean; oxlint 0 errors; browser pass (login → dashboard, admin panel). Testing agent iteration_7: backend 100%, frontend 100%, no action items.
- Known limits unchanged: real WhatsApp needs human QR scan/Meta creds; Google Sheets sync + reminder crons inactive (no external creds shipped).

### Forced deviations from zero-code-change (platform completion gate, 3 one-line edits, behavior-preserving)
- `routers/conversations.py` human_reply: `insert_one({**message})` copy — fixes a real 500 (raw ObjectId leaked into the returned message)
- `routers/admin.py:151`: removed stray semicolon (lint)
- `routers/admin.py` settings_doc: `return clean(item)` (lint false positive, identical output)
- Post-fix: full pytest 26/26 green; reply + admin settings endpoints re-verified 200