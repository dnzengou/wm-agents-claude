# WorldMonitor Agents — System Blueprint v8

> **Last updated:** 2026-05-19  
> **Git commit:** `a25c75c` — fix: revert MapContainer to width/height 100% — restore Leaflet tile rendering  
> **Repository:** https://github.com/dnzengou/wm-agents-claude  

This document is the single authoritative reference for the entire WorldMonitor Agents platform. It supersedes all previous blueprint/deliverable files (`WORLDMONITOR_DELIVERABLES.md`, `WORLDMONITOR_FIXES.md`, `WORLDMONITOR_ENHANCED_UI.md`, `PROJECT_SUMMARY.md`).

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Architecture Overview](#2-architecture-overview)
3. [Repository Structure](#3-repository-structure)
4. [Backend — Rust/Axum](#4-backend--rustaxum)
5. [Data Pipeline — 33 Feeds, 15 Domains](#5-data-pipeline--33-feeds-15-domains)
6. [Frontend — Next.js 14](#6-frontend--nextjs-14)
7. [Auth & Sessions](#7-auth--sessions)
8. [PWA](#8-pwa)
9. [Map — react-leaflet](#9-map--react-leaflet)
10. [Deployment](#10-deployment)
11. [Environment Variables](#11-environment-variables)
12. [Claude Performance Settings](#12-claude-performance-settings)
13. [Design System](#13-design-system)
14. [Known Limitations & Roadmap](#14-known-limitations--roadmap)

---

## 1. Product Vision

**WorldMonitor Agents** is a real-time, open-source OSINT intelligence platform that fuses three data layers:

| Layer | Source | Frequency |
|---|---|---|
| GDELT geopolitical events | GDELT GeoJSON API v2 | Every fusion cycle |
| Earth observation events | NASA EONET API v3 | Every fusion cycle |
| Domain-specific news | 31 RSS/Atom feeds | Every fusion cycle (concurrent) |

Events are severity-scored, deduplicated on a 0.1° grid, stored in SQLite, rendered on a dark CartoDB map with 15 domain filter pills, and surfaced through a live event feed. An AI brief is generated on demand via Groq LLaMA-3.

**Design principle:** Maximum signal, minimum dependencies. No bloat. Every screen element earns its place.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER (PWA)                             │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ GlobalLiveFeed │  │   WorldMap   │  │  AgentStatus +     │   │
│  │ (NL search,    │  │ (CartoDB DM, │  │  ReasoningTrace    │   │
│  │  card→fly-to)  │  │  Leaflet v4) │  │  (Groq brief CoT)  │   │
│  └───────┬────────┘  └──────┬───────┘  └──────────┬─────────┘   │
│          └──────────────────┴──────────────────────┘             │
│                     DashboardClient.tsx                          │
│           (selectedDomain, searchQuery, selectedEventId)         │
│                         │ fetch /api/*                           │
└─────────────────────────┼────────────────────────────────────────┘
                          │ Next.js rewrites (RUST_BACKEND_URL)
┌─────────────────────────▼────────────────────────────────────────┐
│                 RUST BACKEND  (Axum 0.7 / Railway)               │
│                                                                  │
│  IntelligenceFusion::fuse()  ← runs every 5 min (DashMap L1)    │
│  ├── fetch_gdelt()      GDELT GeoJSON, 6h window                 │
│  ├── fetch_eonet()      NASA EONET v3, open events, 7d           │
│  └── fetch_rss()        31 concurrent RSS/Atom feeds             │
│                                                                  │
│  L1 DashMap (in-memory) → L2 SQLite (sqlx 0.7) → L3 Groq LLM   │
│                                                                  │
│  Routes: GET /api/intelligence  GET /api/brief  GET /api/geo     │
│          GET /api/sync          POST /api/alerts                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Repository Structure

```
worldmonitor_rebuild_v3/
├── BLUEPRINT.md                    ← THIS FILE
├── worldmonitor-core/              ← Rust/Axum backend
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                 ← Server bootstrap, CORS, routes
│       ├── api/
│       │   ├── intelligence.rs     ← GET /api/intelligence
│       │   ├── brief.rs            ← GET /api/brief
│       │   ├── geo.rs              ← GET /api/geo (GeoJSON)
│       │   ├── sync.rs             ← GET /api/sync
│       │   ├── alerts.rs           ← POST /api/alerts
│       │   └── user.rs             ← User prefs
│       ├── cache/mod.rs            ← DashMap L1 + SQLite L2
│       ├── core/mod.rs             ← Intelligence fusion engine ★
│       ├── db/mod.rs               ← SQLite schema + queries
│       └── models/mod.rs           ← IntelEvent, CountryCoords, Brief
│
└── worldmonitor-ui-components/     ← Next.js 14 frontend
    ├── app/
    │   ├── layout.tsx              ← Fonts, PWA meta, Leaflet CSS import
    │   ├── page.tsx                ← SSR data fetch + AuthGate wrapper
    │   └── login/page.tsx          ← Sign-on route
    ├── components/
    │   ├── auth/
    │   │   ├── AuthGate.tsx        ← Client-side session check + redirect
    │   │   └── LoginPage.tsx       ← Guest + social login UI
    │   ├── dashboard/
    │   │   ├── DashboardClient.tsx ← Root client: state, filters, layout ★
    │   │   ├── GlobalLiveFeed.tsx  ← Event cards with domain/source links
    │   │   ├── StatusBar.tsx       ← Top bar: version, live status, alerts
    │   │   ├── AgentStatus.tsx     ← 4 agent cards (GDELT/RSS/BRIEF/EONET)
    │   │   └── ReasoningTrace.tsx  ← 5-step CoT reasoning display
    │   ├── map/
    │   │   ├── WorldMap.tsx        ← MapContainer, markers, MapFlyTo ★
    │   │   ├── WorldMap.css        ← Leaflet popup dark theme
    │   │   └── LayerControl.tsx    ← Layer toggle panel
    │   └── ui/                     ← Badge, StatusPulse, TimeAgo, etc.
    ├── lib/
    │   ├── api.ts                  ← Type-safe API client (IntelEvent type)
    │   ├── auth.ts                 ← localStorage session (guest UUID)
    │   └── user.ts                 ← User preferences
    ├── public/
    │   ├── manifest.json           ← PWA manifest
    │   ├── sw.js                   ← Service worker (network-first)
    │   └── icons/icon.svg          ← SVG app icon (PNG to be generated)
    └── styles/globals.css          ← Tailwind + custom tokens
```

---

## 4. Backend — Rust/Axum

### Stack

| Dependency | Version | Role |
|---|---|---|
| axum | 0.7 | HTTP framework |
| tokio | 1.35 (full) | Async runtime |
| sqlx | 0.7 (sqlite, chrono) | DB access + inline migrations |
| dashmap | 5.5 | In-memory L1 cache |
| reqwest | 0.12 (rustls-tls) | HTTP client for feeds + APIs |
| roxmltree | 0.19 | Zero-dependency RSS/Atom XML parser |
| serde + serde_json | 1.0 | JSON serialization |
| chrono | 0.4 | Timestamps |
| uuid | 1.6 (v4) | Event IDs |
| anyhow | 1.0 | Error handling |
| urlencoding | 2.1 | GDELT URL encoding |
| tower-http | 0.5 (cors, compression) | Middleware |
| tracing | 0.1 | Structured logging |

### Key invariants

- **SQLite** is created with `create_if_missing`. Schema is applied inline via safe `ALTER TABLE ... ADD COLUMN` statements that silently ignore `duplicate column` errors — so the DB is always up-to-date without migrations tooling.
- **Cache hierarchy:** L1 `DashMap<String, Vec<IntelEvent>>` (in-process, ~5min TTL) → L2 SQLite → L3 Groq (brief only). Cache miss on L1 triggers full `fuse()` and fills both L1 and L2.
- **Deduplication:** Events are merged per `(grid_key, domain)` where `grid_key = round(lat*10)/10 + "," + round(lon*10)/10`. Higher-severity event wins on collision.
- **Truncation:** Final fused event list is truncated to 150 events, sorted by severity descending.

### IntelEvent model

```rust
pub struct IntelEvent {
    pub id: String,          // UUID v4
    pub country: String,     // Resolved country name
    pub lat: f64,
    pub lon: f64,
    pub severity: i32,       // 1–10
    pub headline: String,
    pub source: String,      // "gdelt" | "rss" | "eonet"
    pub timestamp: i64,      // Unix millis
    pub created_at: Option<DateTime<Utc>>,
    pub domain: String,      // see domain list below
    pub link: Option<String>,// Original article URL (RSS/EONET only)
}
```

### API routes

| Route | Method | Description |
|---|---|---|
| `/api/intelligence` | GET | Up to 150 fused events (JSON array) |
| `/api/brief` | GET | Groq LLaMA-3 country brief (`?country=&interests=`) |
| `/api/geo` | GET | GeoJSON FeatureCollection for all events |
| `/api/sync` | GET | Differential sync (`?since=<millis>`) |
| `/api/alerts` | POST | Subscribe to country alert threshold |
| `/health` | GET | `{"status":"ok"}` |

---

## 5. Data Pipeline — 33 Feeds, 15 Domains

### Source 1: GDELT GeoJSON

```
URL: https://api.gdeltproject.org/api/v2/geo/geo?query={terms}&format=geojson&timespan=6h
Query: "conflict OR war OR attack OR nuclear OR cyber OR disaster"
```
- Provides exact lat/lon per event
- `fatalities > 0` → severity minimum 8
- Default domain: `geopolitical` (overridden by `classify_domain()`)

### Source 2: NASA EONET

```
URL: https://eonet.gsfc.nasa.gov/api/v3/events?days=7&status=open&limit=60
```
- Exact GeoJSON Point coordinates
- Category → domain mapping:

| EONET category | Internal domain |
|---|---|
| wildfires | wildfire |
| volcanoes, earthquakes, landslides, seaLakeIce | natural |
| severeStorms, floods, drought, snow, dustHaze, tempExtremes | climate |
| waterColor | ocean |
| manMade | geopolitical |

- Country extracted from event title via `CountryCoords::extract_from_text()` (word-boundary matched); falls back to `"Unknown"` — event still plotted at exact coordinates.

### Source 3: 31 RSS/Atom Feeds

Fetched concurrently. Each feed has a declared domain; `classify_domain()` can override it based on keyword signals in the item text.

#### Feeds by domain

| Domain | Feeds |
|---|---|
| **geopolitical** | BBC World, Al Jazeera, Deutsche Welle EN, Igihe.com (Rwanda), Daily Nation (Kenya), Punch Nigeria, Dawn Pakistan |
| **cyber** | The Hacker News, Krebs on Security |
| **energy** | OilPrice.com, IEA News |
| **climate** | NASA Climate, The Guardian Climate Crisis, NOAA Climate.gov, Carbon Brief |
| **wildfire** | InciWeb NWCG (US incidents), The Guardian Wildfires |
| **water** | Circle of Blue |
| **natural** | USGS Significant Earthquakes (Atom), ReliefWeb Disasters, NASA Earth Observatory Natural Hazards, GDACS |
| **nuclear** | NTI, IAEA Official |
| **mining** | Mining.com |
| **deforestation** | Mongabay |
| **ocean** | The Guardian Oceans |
| **demographics** | UN News Population |
| **uninsurability** | Insurance Journal |
| **critical_minerals** | Benchmark Minerals, Mining Weekly |

**Total: 33 data sources (3 APIs + 31 RSS), 15 domains**

### Domain keyword classifier

`classify_domain(text, feed_domain)` scans headline + description for strong signals. The keyword hierarchy (highest priority first):

```
nuclear → cyber → wildfire → natural → deforestation →
energy → water → critical_minerals → mining → ocean →
climate → demographics → uninsurability → [feed default]
```

### Severity scoring

```
Base score by domain:
  nuclear: 7, natural/cyber/wildfire/critical_minerals: 5,
  energy/water/climate/uninsurability: 4, mining/deforestation/ocean/demographics: 3,
  geopolitical: 4

Escalation keywords:
  CRITICAL (→ ≥8): killed, dead, explosion, attack, invasion, missile, casualties, meltdown...
  HIGH     (→ ≥6): conflict, crisis, breach, ransomware, earthquake, hurricane, outage...
  MEDIUM   (→ ≥5): protest, tension, sanctions, warning, flood, drought, fire, alert...

Final: clamp(1, 10)
```

### Geolocation

`CountryCoords::extract_from_text(text)` extracts country names using **word-boundary matching** (no substring false-positives like "woman"→Oman). US states (California, Texas, …) resolve to "United States". Returns results sorted by first occurrence in text. 110+ countries + 21 US states in the static table.

---

## 6. Frontend — Next.js 14

### Stack

| Dependency | Version | Role |
|---|---|---|
| Next.js | 14.0.4 | App Router, SSR, rewrites |
| React | 18.2.0 | UI |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.x | Utility classes + design tokens |
| react-leaflet | **4.2.1** | Map (⚠ v5 requires React 19 — do NOT upgrade) |
| leaflet | 1.9.x | Map engine |

### Data flow

```
app/page.tsx (Server Component)
  └── api.intelligence.getLatest()    ← SSR pre-fetch (RUST_BACKEND_URL)
  └── <AuthGate>                      ← client: check localStorage session
      └── <DashboardClient initialEvents={…}>
            ├── useIntelligence()     ← polls /api/intelligence every 30s
            ├── selectedDomain        ← domain filter state
            ├── searchQuery           ← NL search state
            ├── selectedEventId       ← card→map fly-to state
            ├── <GlobalLiveFeed>      ← left column; onEventClick → setSelectedEventId
            ├── <WorldMap>            ← center; receives selectedEventId
            │     ├── MapResizer      ← invalidateSize() on mount (fixes shift)
            │     ├── MapUpdater      ← fitBounds on first load
            │     └── MapFlyTo        ← flyTo(selectedEvent) on state change
            └── <AgentStatus> + <ReasoningTrace>  ← right column
```

### NL Search

Located above the live feed in `DashboardClient`. Multi-term, normalised (lowercase, strip punctuation). Filters across `headline + country + domain` for every term in the query. Shows match count, has clear (×) button. Combined with domain filter via `useMemo`.

```ts
const filteredEvents = useMemo(() => {
  let result = selectedDomain ? events.filter(e => e.domain === selectedDomain) : events;
  if (searchQuery.trim()) {
    const q = normalise(searchQuery.trim());
    const terms = q.split(/\s+/).filter(Boolean);
    result = result.filter(e => {
      const haystack = normalise(`${e.headline} ${e.country} ${e.domain ?? ''}`);
      return terms.every(t => haystack.includes(t));
    });
  }
  return result;
}, [events, selectedDomain, searchQuery]);
```

### Domain filter pills

15 pills rendered at `bottom-20` above the map. Active pill shows event count. Tapping an active pill deselects (back to "All"). Colors match the domain severity palette.

### Card → Map fly-to

Clicking an event card in the live feed:
1. Sets `selectedEventId` in `DashboardClient`
2. `MapFlyTo` (inside `<MapContainer>`) detects the change and calls `map.flyTo([lat, lon], max(currentZoom, 5), {animate: true, duration: 1.0})`
3. The matching `CircleMarker` renders 60% larger with higher fill opacity

### Agent Status (right panel)

4 agents derived from live event data:

| ID | Name | Source | Status logic |
|---|---|---|---|
| ag01 | AGENT_GDELT | gdelt | active if gdeltCount > 0 |
| ag02 | AGENT_RSS | rss | active if rssCount > 0 |
| ag03 | AGENT_BRIEF | groq | active/thinking based on brief state |
| ag04 | AGENT_EONET | eonet | active if eonetCount > 0 |

---

## 7. Auth & Sessions

### Current implementation (v1 — localStorage)

`lib/auth.ts` manages a `UserSession` object in `localStorage` under key `wm_session`.

```ts
type UserSession = {
  id: string;        // UUID v4
  mode: 'guest' | 'user';
  name: string;
  email?: string;
  createdAt: number;
};
```

**Guest flow:**
1. User lands on `/` → `AuthGate` checks `localStorage` on mount
2. No session → redirect to `/login`
3. User clicks "Continue as Guest" → `createGuestSession()` writes UUID to localStorage → redirect to `/`
4. `AuthGate` now finds session → renders `DashboardClient`

**Sign-in flow (placeholder):**
- Google OAuth button → disabled (COMING SOON)
- GitHub OAuth button → disabled (COMING SOON)
- Both marked with badge; full OAuth requires a DB-backed user table

### Planned v2 (when DB is ready)
- NextAuth.js or custom JWT
- SQLite `users` table (id, provider, provider_id, email, name, created_at)
- Session token stored in httpOnly cookie
- Google + GitHub provider credentials in Railway environment variables

---

## 8. PWA

### Files

| File | Purpose |
|---|---|
| `public/manifest.json` | App metadata, icons, theme colors, display mode |
| `public/sw.js` | Service worker (`wm-v2`) — network-first pages/API, cache-first assets |
| `public/icons/icon.svg` | SVG fallback icon |
| `public/icons/icon-192.png` | PNG icon 192×192 — Android install minimum, apple-touch-icon |
| `public/icons/icon-512.png` | PNG icon 512×512 — Android splash / adaptive |
| `public/icons/icon-512-maskable.png` | PNG 512×512 maskable — content within 80% safe zone |
| `generate-icons.js` | Pure Node.js (no deps) icon generator — crosshair/globe design, #080d16 bg, #00f5ff accent |

### Icon manifest entries

```json
"icons": [
  { "src": "/icons/icon-192.png",          "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-512.png",          "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
  { "src": "/icons/icon.svg",              "sizes": "any",     "type": "image/svg+xml", "purpose": "any" }
]
```

The maskable icon scales the crosshair design to 80% of the icon area so Android adaptive icons (squircle/circle crop) never clip content.

### HTML head entries (layout.tsx `metadata.icons`)

```ts
icons: {
  icon: [
    { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { url: '/icons/icon.svg', type: 'image/svg+xml' },
  ],
  apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
}
```

iOS reads `apple-touch-icon` from the HTML head — it ignores manifest icons and silently rejects SVG.

### Cache strategy (sw.js — wm-v2)

- **API calls** (`/api/*`) and cross-origin: pass-through (no cache)
- **Static assets** (`.js`, `.css`, `.woff2`, `.png`, `.svg`, `.ico`): cache-first, fill on miss
- **HTML pages**: network-first, fall back to cache
- **Pre-cached on install:** `/`, `/manifest.json`, `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-512-maskable.png`

Bumping `CACHE` to `wm-v2` forces existing users to evict the old cache on next service-worker activation.

### metadataBase

Set to `https://worldmonitor-core.vercel.app` in `layout.tsx` — resolves the Next.js OG image URL warning that appeared in every build.

### Registration

Inline script in `<body>` (layout.tsx):
```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
```

### Regenerating icons

```bash
cd worldmonitor-ui-components
node generate-icons.js
# → public/icons/icon-192.png, icon-512.png, icon-512-maskable.png
```

---

## 9. Map — react-leaflet

### Version constraint

**react-leaflet 4.2.1** — do NOT upgrade to v5. React-leaflet v5 requires React 19; this project targets React 18.2.0.

### Key components (WorldMap.tsx)

| Component | Purpose |
|---|---|
| `MapResizer` | `ResizeObserver` on `map.getContainer()` — calls `map.invalidateSize()` on every real layout change (flex reflows, panel collapses). Fires once immediately on mount too. Replaces the old 80 ms `setTimeout` guess. |
| `MapUpdater` | On first event load: `fitBounds()` to event extent ±5° with `maxZoom:5`. Fires once (ref guard). |
| `MapFlyTo` | Watches `selectedEventId`; calls `map.flyTo()` to matching event |
| `CircleMarker` | Radius: `4 + severity * 0.9` (4.9–13px). Selected: ×1.6. Colors: Critical=#FF3E3E, High=#FFB800, Medium=#00F5FF, Low=#00E676 |

### Positioning invariant ⚠

**`MapContainer` must keep `style={{ width: '100%', height: '100%' }}`** — do NOT change this to `position: absolute`.

Leaflet relies on `.leaflet-container` being `position: relative` (set in `leaflet.css`). Its tile pane, overlay pane, and marker pane are all absolutely positioned *relative to that container*. Overriding `position` via inline style collapses the containing block, making tiles and all markers invisible.

The surrounding `<div className="absolute inset-0">` wrapper provides reliable height regardless of the flex ancestor chain. `MapContainer` fills it via `width/height: 100%`; Leaflet's `position: relative` is left intact.

### CSS

Leaflet CSS is imported in `app/layout.tsx` (not inside the dynamic chunk) because Next.js App Router cannot reliably bundle relative CSS imports from `dynamic()` chunks.

```ts
// layout.tsx
import 'leaflet/dist/leaflet.css';
import '@/components/map/WorldMap.css';
```

`WorldMap.css` provides the dark-theme popup styles (`.wm-popup-inner`, `.wm-popup-header`, etc.) and the `wm-pulse` keyframe animation.

---

## 10. Deployment

### Backend — Railway

- **Repo watched:** `worldmonitor_rebuild_v3/worldmonitor-core`  
- **Auto-deploy:** on push to `main`
- **Build:** `cargo build --release` (LTO + strip enabled in `[profile.release]`)
- **Runtime:** single binary, listens on `$PORT`
- **Persistent storage:** SQLite file at `$DATABASE_URL` (Railway volume or ephemeral — survives restart if volume attached)

### Frontend — Vercel

- **Project:** `dnzengous-projects/worldmonitor-core`
- **Framework:** Next.js (auto-detected)
- **Deploy command:** `vercel --prod --yes` (from `worldmonitor-ui-components/`)
- **Latest deployment:** `https://worldmonitor-core-39t1s0s66-dnzengous-projects.vercel.app`
- **Inspect:** `https://vercel.com/dnzengous-projects/worldmonitor-core`

### Deploy checklist

```bash
# 1. Commit changes
git add <files>
git commit -m "feat: ..."

# 2. Push → Railway auto-deploys backend
git push

# 3. Deploy frontend
cd worldmonitor-ui-components
vercel --prod --yes
```

---

## 11. Environment Variables

### Backend (Railway)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite path, e.g. `sqlite:./data/worldmonitor.db` |
| `GROQ_API_KEY` | ✅ | Groq API key for LLaMA-3 brief generation |
| `PORT` | auto | Set by Railway |
| `RUST_LOG` | optional | e.g. `info,worldmonitor_core=debug` |

### Frontend (Vercel)

| Variable | Required | Description |
|---|---|---|
| `RUST_BACKEND_URL` | ✅ | Full URL to Railway backend (server-side SSR fetches) |
| `NEXT_PUBLIC_API_URL` | optional | Client-side base URL (defaults to relative `/` via rewrites) |

### Next.js rewrites (next.config.js)

All `/api/*` requests are proxied to `RUST_BACKEND_URL` so the client never needs the backend URL directly:

```js
async rewrites() {
  return [{ source: '/api/:path*', destination: `${process.env.RUST_BACKEND_URL}/api/:path*` }];
}
```

---

## 12. Claude Performance Settings

Applied to `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EFFORT_LEVEL": "max",
    "CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING": "1",
    "MAX_THINKING_TOKENS": "31999",
    "CLAUDE_CODE_DISABLE_1M_CONTEXT": "1",
    "CLAUDE_CODE_NO_FLICKER": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "alwaysThinkingEnabled": true
}
```

| Setting | Effect |
|---|---|
| `EFFORT_LEVEL=max` | Full reasoning every turn |
| `DISABLE_ADAPTIVE_THINKING=1` | Consistent deep thinking (no under-allocation) |
| `MAX_THINKING_TOKENS=31999` | Maximum reasoning budget |
| `DISABLE_1M_CONTEXT=1` | More compute reserved for thinking |
| `NO_FLICKER=1` | Smooth screen rendering |
| `DISABLE_NONESSENTIAL_TRAFFIC=1` | No telemetry / background network |
| `EXPERIMENTAL_AGENT_TEAMS=1` | Multi-agent coordination |
| `alwaysThinkingEnabled=true` | Extended thinking every turn |

---

## 13. Design System

### Color tokens (CSS variables in globals.css)

```
Background:  --obsidian: #080d16  --void: #060a12  --surface: #0f1520
Text:        --text-primary: #e2e8f0  --text-secondary: #94a3b8  --text-muted: #64748b
Accent:      --neon: #00f5ff  --alert: #FF3E3E  --warning: #FFB800  --success: #00E676
Border:      --border-default: rgba(255,255,255,0.08)  --border-subtle: rgba(255,255,255,0.05)
```

### Typography

- Body: Inter (variable font, `--font-inter`)
- Monospace: JetBrains Mono (variable font, `--font-jetbrains-mono`)
- Both loaded via `next/font/google` with `display: swap`

### Layout

```
┌──────────────────────────────────────────────────────┐
│  StatusBar (h-12, flex-shrink-0)                      │
├──────────────┬───────────────────────┬───────────────┤
│ Left (w-80)  │    Center (flex-1)    │ Right (w-80)  │
│              │                       │               │
│ NL Search    │ [Layer Control]       │ AgentStatus   │
│ ──────────── │                       │               │
│ GlobalLive   │     WorldMap          │ ──────────── │
│ Feed         │  (CartoDB Dark Matter)│ Reasoning     │
│              │                       │ Trace         │
│              │ [Domain Pills]        │               │
│              │ [Legend]              │ ──────────── │
│              │                       │ GateBanner    │
└──────────────┴───────────────────────┴───────────────┘
```

All three columns use `min-h-0` to respect flex overflow. The map fills the center column exactly via `w-full h-full` inside a `flex-1 min-h-0 relative` container.

---

## 14. Known Limitations & Roadmap

### Active limitations

| Issue | Status | Fix |
|---|---|---|
| PWA icons are SVG | ⚠ Partial | Generate 192×512 PNG icons (chip queued) |
| Auth is localStorage only | ⚠ MVP | Implement NextAuth + DB when DB is ready |
| Country for EONET "Unknown" events | ℹ Cosmetic | Events still plotted; "Unknown" shown in popup |
| Social login buttons are disabled | ℹ Placeholder | Needs OAuth credentials + user table |
| OG `metadataBase` warning | ℹ Non-critical | Add `metadataBase` to layout.tsx metadata |
| EONET only fetches Point geometry | ℹ By design | Polygon events skipped (too complex for markers) |

### Roadmap (priority order)

1. **PNG icons** — generate proper 192/512 PNG assets for full PWA installability
2. **OAuth sign-in** — Google + GitHub via NextAuth; SQLite `users` table
3. **Push notifications** — VAPID-based web push for high-severity events (severity ≥ 8)
4. **WebSocket / SSE** — replace 30s polling with Server-Sent Events from `/api/stream`
5. **Copernicus / NOAA direct API** — replace RSS proxies with official EO data APIs for higher frequency and spatial precision
6. **Alert system** — user subscribes to country/domain; backend sends push when threshold exceeded
7. **Historical archive** — extend SQLite retention (current: 150 events, live only); expose `/api/history?country=&days=`
8. **Mobile responsive layout** — current 3-column layout breaks below 1024px
9. **Map clustering** — cluster overlapping markers at low zoom levels
10. **Severity trend lines** — sparklines per domain in the right panel

---

## Appendix: Full Commit History

```
852956d  feat: UX polish, PWA, NL search, EONET, card-fly-to, sign-on
46f5efa  feat: source links — article URLs captured from RSS and surfaced in UI
a5e4649  update image
761357c  fix+feat: geolocation accuracy, critical_minerals domain, 7 new feeds
3569dee  docs: update blueprint to v5 — 13 domains, 19 feeds, roxmltree, uninsurability
ddd8b92  feat: add 4 feeds, uninsurability domain, wildfire geocoding fallback
76a6067  feat: domain expansion — 12 intel domains, 15 RSS feeds, domain filter UI
e63d7b3  fix: downgrade react-leaflet v5→v4.2.1 to fix client-side crash
956fd8e  fix: resolve client-side exception in WorldMap component
192e30c  chore: add .npmrc with legacy-peer-deps for react-leaflet v5 compat
```

---

*WorldMonitor Agents is open-source (MIT). Built with Rust, Next.js, Tailwind, Leaflet, Groq, GDELT, and NASA EONET.*
