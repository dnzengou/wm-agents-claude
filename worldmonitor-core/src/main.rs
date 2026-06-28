// Suppress lints on items kept for forward-compatibility / debug surfaces.
// Reviewed 2026-06-22 against deployed v12 build — the unused fields/fn/const
// are intentional scaffolding for upcoming endpoints.
#![allow(dead_code, clippy::unnecessary_sort_by)]

use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info, warn};

mod api;
mod cache;
mod core;
mod db;
mod models;

use api::{alerts, billing, brief, geo, intelligence, sse, sync, user};
use cache::Cache;
use db::Database;
use models::IntelEvent;

/// Shared application state — cheap to clone because everything inside is Arc'd.
#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub cache: Cache,
    pub config: AppConfig,
    /// Kafka-style fan-out: ingestion broadcasts new event batches here;
    /// every SSE subscriber holds its own Receiver via subscribe().
    /// Capacity 16 = up to 16 batches buffered per lagging subscriber.
    pub event_tx: broadcast::Sender<Arc<Vec<IntelEvent>>>,
}

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub groq_api_key: String,
    pub port: u16,
    pub database_url: String,
    pub max_alerts_free: i32,
    // ── Stripe billing ──────────────────────────────────────────────────────
    /// Publishable key (`pk_live_…` / `pk_test_…`). Public by design — served to
    /// clients via `GET /api/billing/config` for client-side Stripe.js. Not a
    /// secret and not used for server-side API calls.
    pub stripe_publishable_key: String,
    /// Secret API key (`sk_live_…` / `sk_test_…`). Empty disables billing.
    pub stripe_secret_key: String,
    /// Webhook signing secret (`whsec_…`) used to verify incoming events.
    pub stripe_webhook_secret: String,
    /// Recurring price id for the Pro plan (`price_…`).
    pub stripe_price_pro: String,
    /// Recurring price id for the Enterprise plan (`price_…`).
    pub stripe_price_enterprise: String,
    /// Hosted Stripe Payment Link for Pro (`https://buy.stripe.com/…`).
    /// When set, checkout redirects here instead of calling the API — no
    /// secret key required. The user id is appended as `client_reference_id`.
    pub stripe_payment_link_pro: String,
    /// Hosted Stripe Payment Link for Enterprise.
    pub stripe_payment_link_enterprise: String,
    /// Public base URL used to build Checkout success/cancel redirects.
    pub app_base_url: String,
}

/// Default hosted Payment Link for the Pro plan. Public, shareable URL (not a
/// secret) — overridable via `STRIPE_PAYMENT_LINK_PRO`.
const DEFAULT_PAYMENT_LINK_PRO: &str = "https://buy.stripe.com/6oU14neX647kcaI29Z0oM00";

impl AppConfig {
    fn from_env() -> anyhow::Result<Self> {
        dotenvy::dotenv().ok();
        Ok(Self {
            groq_api_key: std::env::var("GROQ_API_KEY").unwrap_or_default(),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .unwrap_or(8080),
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "sqlite:./worldmonitor.db".to_string()),
            max_alerts_free: std::env::var("MAX_ALERTS_FREE")
                .unwrap_or_else(|_| "3".to_string())
                .parse()
                .unwrap_or(3),
            stripe_publishable_key: std::env::var("STRIPE_PUBLISHABLE_KEY").unwrap_or_default(),
            stripe_secret_key: std::env::var("STRIPE_SECRET_KEY").unwrap_or_default(),
            stripe_webhook_secret: std::env::var("STRIPE_WEBHOOK_SECRET").unwrap_or_default(),
            stripe_price_pro: std::env::var("STRIPE_PRICE_PRO").unwrap_or_default(),
            stripe_price_enterprise: std::env::var("STRIPE_PRICE_ENTERPRISE").unwrap_or_default(),
            stripe_payment_link_pro: std::env::var("STRIPE_PAYMENT_LINK_PRO")
                .unwrap_or_else(|_| DEFAULT_PAYMENT_LINK_PRO.to_string()),
            stripe_payment_link_enterprise: std::env::var("STRIPE_PAYMENT_LINK_ENTERPRISE")
                .unwrap_or_default(),
            app_base_url: std::env::var("APP_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:8080".to_string()),
        })
    }

    /// Whether the platform can take a payment at all — either a hosted Payment
    /// Link or an API secret key is configured. Drives the upgrade CTA in the UI
    /// and the checkout endpoint's 503 fallback. (Auto-fulfilment additionally
    /// needs `STRIPE_WEBHOOK_SECRET`; see [`Self::webhooks_enabled`].)
    pub fn billing_enabled(&self) -> bool {
        !self.stripe_secret_key.is_empty()
            || !self.stripe_payment_link_pro.is_empty()
            || !self.stripe_payment_link_enterprise.is_empty()
    }

    /// Whether incoming Stripe webhooks can be verified and acted on.
    pub fn webhooks_enabled(&self) -> bool {
        !self.stripe_webhook_secret.is_empty()
    }

    /// Hosted Payment Link for a paid tier, if configured.
    pub fn payment_link_for(&self, tier: crate::models::Tier) -> Option<&str> {
        let link = match tier {
            crate::models::Tier::Pro => &self.stripe_payment_link_pro,
            crate::models::Tier::Enterprise => &self.stripe_payment_link_enterprise,
            crate::models::Tier::Free => return None,
        };
        if link.is_empty() {
            None
        } else {
            Some(link.as_str())
        }
    }

    /// Resolve the Stripe price id for a paid tier, if configured.
    pub fn price_for(&self, tier: crate::models::Tier) -> Option<&str> {
        let id = match tier {
            crate::models::Tier::Pro => &self.stripe_price_pro,
            crate::models::Tier::Enterprise => &self.stripe_price_enterprise,
            crate::models::Tier::Free => return None,
        };
        if id.is_empty() {
            None
        } else {
            Some(id.as_str())
        }
    }
}

// ─── Health ──────────────────────────────────────────────────────────────────

async fn health() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "status": "ok",
        "version": "0.2.0",
        "timestamp": chrono::Utc::now().timestamp_millis()
    }))
}

// ─── Static file serving ─────────────────────────────────────────────────────

async fn serve_frontend() -> axum::response::Html<&'static str> {
    axum::response::Html(include_str!("../static/index.html"))
}

async fn serve_static(
    axum::extract::Path(path): axum::extract::Path<String>,
) -> impl axum::response::IntoResponse {
    match path.as_str() {
        "app.js" => axum::response::Html(include_str!("../static/app.js")),
        _ => axum::response::Html("Not found"),
    }
}

// ─── Background data ingestion ────────────────────────────────────────────────

/// Pulls from GDELT + RSS and stores events in the database.
/// Invalidates the in-memory cache so the next API request returns fresh data.
async fn ingest_once(state: &AppState) {
    use crate::core::IntelligenceFusion;

    info!("Starting intelligence ingestion...");
    let events = IntelligenceFusion::fuse().await;

    if events.is_empty() {
        warn!("Ingestion returned 0 events — external APIs may be unavailable");
        return;
    }

    match state.db.batch_insert_events(&events).await {
        Ok(inserted) => {
            state.cache.delete(Cache::key_intelligence());
            info!(
                "Ingestion complete: {} fetched, {} new events stored",
                events.len(),
                inserted
            );
            // Broadcast to all SSE subscribers (Kafka-style fan-out).
            // send() only errors when 0 receivers exist — that's normal when no
            // clients are connected, so we silently discard the error.
            let _ = state.event_tx.send(Arc::new(events));
        }
        Err(e) => error!("Failed to persist ingested events: {}", e),
    }

    // Purge events older than 30 days
    match state.db.cleanup_old_events().await {
        Ok(deleted) if deleted > 0 => info!("Pruned {} stale events", deleted),
        Err(e) => error!("Cleanup error: {}", e),
        _ => {}
    }
}

/// Long-running task: runs ingestion immediately on startup, then every 15 min.
async fn run_ingestion_loop(state: Arc<AppState>) {
    // Immediate run
    ingest_once(&state).await;

    // Then every 15 minutes — consume the first (immediate) tick so we don't double-run
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(900));
    interval.tick().await; // discard first tick

    loop {
        interval.tick().await;
        ingest_once(&state).await;
    }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("Starting WorldMonitor Core v0.2.0");

    let config = AppConfig::from_env()?;
    info!("Config: port={}, db={}", config.port, config.database_url);

    let db = Database::new(&config.database_url).await?;
    db.run_migrations().await?;
    info!("Database ready");

    let cache = Cache::new();
    info!("Cache ready");

    // Kafka-style broadcast channel: capacity 16 batches per lagging subscriber
    let (event_tx, _) = broadcast::channel::<Arc<Vec<IntelEvent>>>(16);

    let state = Arc::new(AppState {
        db,
        cache,
        config,
        event_tx,
    });

    // Spawn background ingestion — runs immediately on startup then every 15 min.
    // This is the critical fix: previously the DB was never populated from external sources.
    let ingestion_state = Arc::clone(&state);
    tokio::spawn(async move {
        run_ingestion_loop(ingestion_state).await;
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/intelligence", get(intelligence::handler))
        .route("/api/stream", get(sse::handler)) // Kafka-style SSE fan-out
        .route("/api/brief", post(brief::handler))
        .route("/api/geo", get(geo::handler))
        .route("/api/alerts", post(alerts::handler))
        .route("/api/sync", get(sync::handler))
        .route("/api/user", get(user::get_handler).post(user::post_handler))
        // ── Stripe billing ──────────────────────────────────────────────────
        .route("/api/billing/config", get(billing::config_handler))
        .route("/api/billing/tier", get(billing::tier_handler))
        .route("/api/billing/checkout", post(billing::checkout_handler))
        .route("/api/billing/webhook", post(billing::webhook_handler))
        .route("/", get(serve_frontend))
        .route("/*path", get(serve_static))
        .layer(cors)
        .layer(CompressionLayer::new())
        .with_state(Arc::clone(&state));

    let port = state.config.port;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
