use axum::{extract::State, http::StatusCode, response::Json, Json as AxumJson};
use std::sync::Arc;
use tracing::{debug, info};

use crate::{
    cache::{strategies::BRIEF_TTL, Cache},
    core::BriefGenerator,
    models::{requests::BriefRequest, responses::ErrorResponse, Brief},
    AppState,
};

/// POST /api/brief — Generate (or serve cached) AI intelligence brief.
///
/// Cache hierarchy:
///   1. In-memory DashMap (TTL = 1h) — fastest, shared across requests
///   2. SQLite briefs_cache table (TTL = 24h) — survives restarts
///   3. Groq LLaMA-3 generation — fallback, triggers cache writes
pub async fn handler(
    State(state): State<Arc<AppState>>,
    AxumJson(request): AxumJson<BriefRequest>,
) -> Result<Json<Brief>, (StatusCode, Json<ErrorResponse>)> {
    info!("POST /api/brief country={}", request.country);

    let cache_key = Cache::key_brief(&request.country);

    // 1. In-memory cache hit
    if let Some(cached) = state.cache.get_json::<Brief>(&cache_key) {
        debug!("brief: in-memory cache hit for {}", request.country);
        return Ok(Json(cached));
    }

    // 2. SQLite cache hit
    if let Some((summary, event_count)) = state
        .db
        .get_cached_brief(&request.country)
        .await
        .ok()
        .flatten()
    {
        debug!("brief: db cache hit for {}", request.country);
        let brief = Brief {
            summary,
            event_count,
            country: request.country.clone(),
            generated_at: chrono::Utc::now().timestamp_millis(),
        };
        state.cache.put_json_with_ttl(&cache_key, &brief, BRIEF_TTL);
        return Ok(Json(brief));
    }

    // 3. Fetch events and generate via Groq (or local fallback)
    let events = match state.db.get_events_by_country(&request.country).await {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("db error fetching events for brief: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to fetch events".to_string(),
                }),
            ));
        }
    };

    let event_count = events.len() as i32;
    let generator = BriefGenerator::new(state.config.groq_api_key.clone());
    let summary = generator.generate(&events, &request.country).await;

    let brief = Brief {
        summary: summary.clone(),
        event_count,
        country: request.country.clone(),
        generated_at: chrono::Utc::now().timestamp_millis(),
    };

    // Write-through to both cache layers
    state.cache.put_json_with_ttl(&cache_key, &brief, BRIEF_TTL);
    let _ = state
        .db
        .cache_brief(&request.country, &summary, event_count)
        .await;

    Ok(Json(brief))
}
