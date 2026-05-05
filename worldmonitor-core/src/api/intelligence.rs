use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
};
use std::sync::Arc;
use tracing::{debug, info};

use crate::{
    cache::{strategies::*, Cache},
    models::IntelEvent,
    AppState,
};

/// GET /api/intelligence - Get latest intelligence events
pub async fn handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<IntelEvent>>, (StatusCode, Json<crate::models::responses::ErrorResponse>)> {
    info!("Handling GET /api/intelligence");

    // Check cache first
    let cache_key = Cache::key_intelligence();
    if let Some(cached) = state.cache.get_json::<Vec<IntelEvent>>(cache_key) {
        debug!("Returning cached intelligence data");
        return Ok(Json(cached));
    }

    // Fetch from database
    match state.db.get_recent_events(100).await {
        Ok(events) => {
            // Cache the result
            state.cache.put_json_with_ttl(cache_key, &events, INTELLIGENCE_TTL);
            info!("Returning {} events from database", events.len());
            Ok(Json(events))
        }
        Err(e) => {
            tracing::error!("Database error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(crate::models::responses::ErrorResponse {
                    error: "Failed to fetch intelligence data".to_string(),
                }),
            ))
        }
    }
}
