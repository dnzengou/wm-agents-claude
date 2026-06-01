/// GET /api/stream — Server-Sent Events endpoint.
///
/// Kafka-style fan-out: the ingestion loop publishes a batch of new events on a
/// tokio::sync::broadcast channel every time fresh data arrives (~15 min). Each
/// SSE subscriber receives its own receiver and drains events in real time.
///
/// Protocol:
///   event: intel
///   data: <JSON array of IntelEvent>
///
///   event: heartbeat
///   data: {"ts":<unix ms>}   (every 30 s — keeps proxies alive)
///
/// Clients should reconnect with Last-Event-ID on disconnect (browser EventSource
/// handles this automatically).
use axum::{
    extract::State,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
};
use std::{convert::Infallible, sync::Arc, time::Duration};
use tokio_stream::{wrappers::BroadcastStream, StreamExt};

use crate::{models::IntelEvent, AppState};

pub async fn handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // Subscribe to the broadcast channel — each subscriber gets its own queue.
    let rx = state.event_tx.subscribe();

    // Convert broadcast::Receiver → Stream<Item = IntelEvent batch>
    let stream = BroadcastStream::new(rx)
        .filter_map(|msg| {
            // BroadcastStream wraps errors: Lagged means we missed some batches.
            // Skip lagged errors gracefully (client will catch up on next batch).
            msg.ok()
        })
        .map(|events: Arc<Vec<IntelEvent>>| -> Result<Event, Infallible> {
            let data = serde_json::to_string(&*events)
                .unwrap_or_else(|_| "[]".to_string());
            Ok(Event::default().event("intel").data(data))
        });

    // KeepAlive sends a comment line every 30 s to prevent proxy timeouts.
    // The comment `: hb` is invisible to EventSource clients but keeps TCP alive.
    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(30))
            .text("hb"),
    )
}
