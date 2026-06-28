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
     - `STRIPE_SECRET_KEY` — `sk_live_…` / `sk_test_…`
     - `STRIPE_WEBHOOK_SECRET` — `whsec_…` (from the webhook endpoint you point at `/api/billing/webhook`)
     - `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE` — recurring price ids
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
raw request body (`STRIPE_WEBHOOK_SECRET`). When `STRIPE_SECRET_KEY` /
`STRIPE_WEBHOOK_SECRET` are unset the platform runs unchanged — checkout returns
`503` and the UI hides the upgrade CTA.

In the Stripe dashboard, add a webhook endpoint pointing at
`https://<your-backend>/api/billing/webhook` subscribed to
`checkout.session.completed` and `customer.subscription.deleted`.

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
