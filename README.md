# WorldMonitor

Real-time OSINT intelligence platform. Fuses 150+ data sources — GDELT, RSS, ADS-B — into a live threat dashboard.

## Stack

| Layer | Tech |
|---|---|
| Backend | Rust / Axum / SQLite |
| Frontend | Next.js 14 / Tailwind CSS |
| AI | Groq (LLaMA-3 brief generation) |
| Deploy | Railway (backend) · Vercel (frontend) |

## Local development

```bash
# Prerequisites: Docker, Docker Compose, a Groq API key
# Get one free at https://console.groq.com

GROQ_API_KEY=your_key docker compose up
```

- UI: http://localhost:3000
- API: http://localhost:8080
- Health: http://localhost:8080/health

## Production deployment

### Backend → Railway

1. Create a new Railway project at [railway.app](https://railway.app)
2. Connect this GitHub repo
3. Set **Root Directory** to `worldmonitor-core`
4. Add environment variables:
   - `GROQ_API_KEY` — your Groq API key
   - `DATABASE_URL` — `sqlite:/app/data/worldmonitor.db` (Railway mounts `/app/data` as persistent volume via `railway.toml`)
   - `MAX_ALERTS_FREE` — `3`
   - **Stripe billing (optional)** — set these to activate paid tiers:
     - `STRIPE_PAYMENT_LINK_PRO` — hosted `https://buy.stripe.com/…` link (Pro has a built-in default; override here). Simplest method — no secret key needed.
     - `STRIPE_WEBHOOK_SECRET` — `whsec_…` (from the webhook endpoint you point at `/api/billing/webhook`); required for auto-upgrade on payment
     - `STRIPE_SECRET_KEY` + `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE` — only needed for the API Checkout-Session method (alternative to Payment Links)
     - `APP_BASE_URL` — public URL for Checkout success/cancel redirects
5. Railway auto-deploys on every push to `main`

### Frontend → Vercel

1. Import this repo at [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `worldmonitor-ui-components`
3. Add environment variable:
   - `RUST_BACKEND_URL` — your Railway backend URL (e.g. `https://wm-backend.up.railway.app`)
4. Vercel auto-deploys on every push to `main`

## CI

GitHub Actions runs on every push and PR:
- `cargo check` + `cargo clippy` + release build (Rust)
- `tsc --noEmit` + `next build` (Next.js)
- Docker image smoke-test (main branch only)

## Price tiers & billing

Three tiers, enforced server-side and gated through Stripe Checkout:

| Tier | Price | Alerts | Notes |
|---|---|---|---|
| Free | $0 | `MAX_ALERTS_FREE` (default 3) | Default for every account |
| Pro | $19/mo | Unlimited | Subscription |
| Enterprise | $99/mo | Unlimited | Subscription + API access |

**Endpoints** (backend, under `/api/billing`):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/billing/tier` | Current tier, alert limit, whether billing is enabled |
| `POST` | `/api/billing/checkout` | Body `{ "tier": "pro" \| "enterprise" }` → returns a hosted Stripe Checkout `url` |
| `POST` | `/api/billing/webhook` | Stripe-signed events — promotes on `checkout.session.completed`, demotes on `customer.subscription.deleted` |

The user's tier is identified by the `X-User-Id` header and persisted in the
`users.tier` column. Webhook authenticity is verified with HMAC-SHA256 over the
raw request body (`STRIPE_WEBHOOK_SECRET`).

**Two ways to collect payment** (`/api/billing/checkout` picks whichever is configured):

1. **Hosted Payment Link** (simplest — no secret key). Set `STRIPE_PAYMENT_LINK_PRO`
   (a `https://buy.stripe.com/…` URL); checkout redirects to it with
   `?client_reference_id=<user>` appended. Pro ships with a built-in default link,
   overridable via env. For an Enterprise Payment Link, set its tier in the link's
   metadata in the Stripe dashboard so the webhook applies the right tier.
2. **API Checkout Sessions** (used only when no Payment Link is set for the tier).
   Requires `STRIPE_SECRET_KEY` + `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE`.

**Fulfilment** (auto-upgrade on payment) requires `STRIPE_WEBHOOK_SECRET` with
either method: add a webhook endpoint in the Stripe dashboard pointing at
`https://<your-backend>/api/billing/webhook`, subscribed to
`checkout.session.completed` and `customer.subscription.deleted`. With no
payment method and no webhook secret configured, checkout returns `503` and the
UI hides the upgrade CTA.

## Architecture

```
Browser → Vercel (Next.js SSR) → /api/* rewrite → Railway (Rust/Axum)
                                                        ↓
                                                   SQLite (persistent volume)
                                                   GDELT API + RSS feeds (ingested every 15 min)
```

## Distribution surfaces

The deployed PWA at https://worldmonitor-core.vercel.app/ is the canonical artifact. Additional install surfaces wrap that PWA — one Vercel push updates all of them.

| Surface | Path | Ship action |
|---|---|---|
| Chrome MV3 extension | `packages/chrome-ext/` | `bash packages/chrome-ext/build.sh` → upload zip to Web Store |
| NPM SDK | `packages/terminal-sdk/` | `npm publish --access public` (after `npm login`) |
| Android APK (TWA) | `packages/twa/` | `bubblewrap build` — needs JDK 17 + Android SDK |
| Desktop (Tauri) | `packages/tauri/` | `npm create tauri-app` per the README |

See [packages/README.md](packages/README.md) for the full distribution philosophy.
