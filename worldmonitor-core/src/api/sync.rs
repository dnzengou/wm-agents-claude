use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Json,
};
use std::sync::Arc;
use tracing::{debug, info};

use crate::{
    models::{requests::SyncRequest, responses::ErrorResponse, SyncResponse},
    AppState,
};

/// GET /api/sync - Differential sync for efficient updates
pub async fn handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SyncRequest>,
) -> Result<Json<SyncResponse>, (StatusCode, Json<ErrorResponse>)> {
    info!("Handling GET /api/sync since: {}", params.since);

    // Fetch events since the provided timestamp
    match state.db.get_events_since(params.since).await {
        Ok(events) => {
            debug!("Returning {} new events since {}", events.len(), params.since);
            Ok(Json(SyncResponse {
                new_events: events,
                server_time: chrono::Utc::now().timestamp_millis(),
            }))
        }
        Err(e) => {
            tracing::error!("Database error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to sync events".to_string(),
                }),
            ))
        }
    }
}
