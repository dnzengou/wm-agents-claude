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

use api::{alerts, brief, geo, intelligence, sse, sync, user};
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
}

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
        })
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

    let state = Arc::new(AppState { db, cache, config, event_tx });

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
        .route("/health",         get(health))
        .route("/api/intelligence", get(intelligence::handler))
        .route("/api/stream",     get(sse::handler))      // Kafka-style SSE fan-out
        .route("/api/brief",      post(brief::handler))
        .route("/api/geo",        get(geo::handler))
        .route("/api/alerts",     post(alerts::handler))
        .route("/api/sync",       get(sync::handler))
        .route("/api/user",       get(user::get_handler).post(user::post_handler))
        .route("/",               get(serve_frontend))
        .route("/*path",          get(serve_static))
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
