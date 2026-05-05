use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    Json as AxumJson,
};
use std::sync::Arc;
use tracing::{debug, info};

use crate::{
    cache::{strategies::*, Cache},
    core::BriefGenerator,
    models::{requests::BriefRequest, responses::ErrorResponse, Brief},
    AppState,
};

/// POST /api/brief - Generate AI intelligence brief for a country
pub async fn handler(
    State(state): State<Arc<AppState>>,
    AxumJson(request): AxumJson<BriefRequest>,
) -> Result<Json<Brief>, (StatusCode, Json<ErrorResponse>)> {
    info!("Handling POST /api/brief for country: {}", request.country);

    // Check cache first
    let cache_key = Cache::key_brief(&request.country);
    if let Some((summary, event_count)) = state.db.get_cached_brief(&request.country).await.ok().flatten() {
        debug!("Returning cached brief for {}", request.country);
        return Ok(Json(Brief {
            summary,
            event_count,
            country: request.country,
            generated_at: chrono::Utc::now().timestamp_millis(),
        }));
    }

    // Fetch events for this country
    let events = match state.db.get_events_by_country(&request.country).await {
        Ok(events) => events,
        Err(e) => {
            tracing::error!("Database error: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to fetch events".to_string(),
                }),
            ));
        }
    };

    let event_count = events.len() as i32;

    // Generate brief using AI
    let generator = BriefGenerator::new(state.config.groq_api_key.clone());
    let summary = generator.generate(&events, &request.country).await;

    // Cache the brief
    let _ = state.db.cache_brief(&request.country, &summary, event_count).await;

    Ok(Json(Brief {
        summary,
        event_count,
        country: request.country,
        generated_at: chrono::Utc::now().timestamp_millis(),
    }))
}
