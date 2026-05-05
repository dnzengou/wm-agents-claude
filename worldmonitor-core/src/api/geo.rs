use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
};
use std::sync::Arc;
use tracing::{debug, info};

use crate::{
    cache::{strategies::*, Cache},
    models::{responses::ErrorResponse, GeoJson},
    AppState,
};

/// GET /api/geo - Get GeoJSON for map rendering
pub async fn handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<GeoJson>, (StatusCode, Json<ErrorResponse>)> {
    info!("Handling GET /api/geo");

    // Check cache first
    let cache_key = Cache::key_geo();
    if let Some(cached) = state.cache.get_json::<GeoJson>(cache_key) {
        debug!("Returning cached geo data");
        return Ok(Json(cached));
    }

    // Fetch events and convert to GeoJSON
    match state.db.get_recent_events(100).await {
        Ok(events) => {
            let geojson = GeoJson::from_events(&events);
            // Cache the result
            state.cache.put_json_with_ttl(cache_key, &geojson, GEO_TTL);
            info!("Returning GeoJSON with {} features", geojson.features.len());
            Ok(Json(geojson))
        }
        Err(e) => {
            tracing::error!("Database error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to fetch geo data".to_string(),
                }),
            ))
        }
    }
}
