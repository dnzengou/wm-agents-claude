//! Stripe billing — the functional price-tiers layer.
//!
//! Three endpoints, all under `/api/billing`:
//!   * `GET  /tier`     — the caller's current tier + what it unlocks
//!   * `POST /checkout` — start a hosted Stripe Checkout session for a paid tier
//!   * `POST /webhook`  — Stripe → us: promote/demote on subscription events
//!
//! We talk to Stripe's REST API directly with `reqwest` (form-encoded) instead
//! of the heavyweight SDK, and verify webhook authenticity with an HMAC-SHA256
//! signature check over the raw request body — the same scheme Stripe's
//! libraries use. Deployments without Stripe configured keep working: checkout
//! returns a clean 503 and `/tier` reports `billing_enabled: false`.

use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json,
    Json as AxumJson,
};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::sync::Arc;
use tracing::{error, info, warn};

use crate::{
    models::{
        requests::CheckoutRequest,
        responses::{CheckoutResponse, ErrorResponse, TierResponse},
        Tier,
    },
    AppState,
};

type HmacSha256 = Hmac<Sha256>;

const STRIPE_CHECKOUT_URL: &str = "https://api.stripe.com/v1/checkout/sessions";

/// Pull the caller's id from the `X-User-Id` header (defaults to `anonymous`,
/// matching the rest of the API).
fn user_id_from(headers: &HeaderMap) -> &str {
    headers
        .get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("anonymous")
}

fn err(status: StatusCode, msg: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        status,
        Json(ErrorResponse {
            error: msg.to_string(),
        }),
    )
}

/// GET /api/billing/tier — current tier and its limits.
pub async fn tier_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<TierResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_id = user_id_from(&headers);

    let user = state.db.get_or_create_user(user_id).await.map_err(|e| {
        error!("Database error in tier_handler: {}", e);
        err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load tier")
    })?;

    let tier = user.tier();
    Ok(Json(TierResponse {
        tier: tier.as_str().to_string(),
        max_alerts: tier.max_alerts(state.config.max_alerts_free),
        billing_enabled: state.config.billing_enabled(),
    }))
}

/// POST /api/billing/checkout — create a Stripe Checkout session for a paid
/// tier and return the hosted-payment URL for the client to redirect to.
pub async fn checkout_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    AxumJson(request): AxumJson<CheckoutRequest>,
) -> Result<Json<CheckoutResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_id = user_id_from(&headers).to_string();

    if !state.config.billing_enabled() {
        return Err(err(
            StatusCode::SERVICE_UNAVAILABLE,
            "Billing is not configured on this deployment",
        ));
    }

    // Only paid tiers are purchasable.
    let tier = Tier::from_str(&request.tier);
    if !tier.is_paid() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Choose a paid tier: 'pro' or 'enterprise'",
        ));
    }

    let price_id = state.config.price_for(tier).ok_or_else(|| {
        warn!(
            "Checkout requested for {} but no price id configured",
            tier.as_str()
        );
        err(
            StatusCode::SERVICE_UNAVAILABLE,
            "Selected plan is not available right now",
        )
    })?;

    let base = state.config.app_base_url.trim_end_matches('/');
    let success_url = format!("{}/?upgrade=success&tier={}", base, tier.as_str());
    let cancel_url = format!("{}/?upgrade=cancelled", base);

    info!(
        "Creating Stripe checkout session for user={} tier={}",
        user_id,
        tier.as_str()
    );

    // Stripe wants application/x-www-form-urlencoded with bracketed nesting.
    let params = [
        ("mode", "subscription"),
        ("line_items[0][price]", price_id),
        ("line_items[0][quantity]", "1"),
        ("success_url", success_url.as_str()),
        ("cancel_url", cancel_url.as_str()),
        ("client_reference_id", user_id.as_str()),
        ("metadata[user_id]", user_id.as_str()),
        ("metadata[tier]", tier.as_str()),
        // Mirror onto the subscription so cancellation events keep the mapping.
        ("subscription_data[metadata][user_id]", user_id.as_str()),
        ("subscription_data[metadata][tier]", tier.as_str()),
    ];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| {
            error!("Failed to build HTTP client: {}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, "Checkout unavailable")
        })?;

    let response = client
        .post(STRIPE_CHECKOUT_URL)
        .bearer_auth(&state.config.stripe_secret_key)
        .form(&params)
        .send()
        .await
        .map_err(|e| {
            error!("Stripe request failed: {}", e);
            err(StatusCode::BAD_GATEWAY, "Payment provider unreachable")
        })?;

    let status = response.status();
    let body: serde_json::Value = response.json().await.map_err(|e| {
        error!("Failed to parse Stripe response: {}", e);
        err(StatusCode::BAD_GATEWAY, "Invalid payment provider response")
    })?;

    if !status.is_success() {
        let message = body
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("Stripe rejected the checkout request");
        error!("Stripe checkout error ({}): {}", status, message);
        return Err(err(StatusCode::BAD_GATEWAY, message));
    }

    let url = body
        .get("url")
        .and_then(|u| u.as_str())
        .ok_or_else(|| {
            error!("Stripe checkout response missing url: {}", body);
            err(StatusCode::BAD_GATEWAY, "Checkout session has no URL")
        })?
        .to_string();

    Ok(Json(CheckoutResponse { url }))
}

/// POST /api/billing/webhook — Stripe-signed subscription lifecycle events.
///
/// Verifies the `Stripe-Signature` header against the raw body before acting,
/// then promotes (`checkout.session.completed`) or demotes
/// (`customer.subscription.deleted`) the referenced user. Always returns 200
/// for events we recognise so Stripe stops retrying.
pub async fn webhook_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    if !state.config.billing_enabled() {
        return Err(err(
            StatusCode::SERVICE_UNAVAILABLE,
            "Billing is not configured on this deployment",
        ));
    }

    let signature = headers
        .get("Stripe-Signature")
        .and_then(|h| h.to_str().ok())
        .unwrap_or_default();

    if !verify_signature(&body, signature, &state.config.stripe_webhook_secret) {
        warn!("Rejected Stripe webhook with invalid signature");
        return Err(err(StatusCode::BAD_REQUEST, "Invalid signature"));
    }

    let event: serde_json::Value = serde_json::from_slice(&body).map_err(|e| {
        error!("Webhook body is not valid JSON: {}", e);
        err(StatusCode::BAD_REQUEST, "Invalid payload")
    })?;

    let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let object = event
        .get("data")
        .and_then(|d| d.get("object"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    match event_type {
        "checkout.session.completed" => {
            let user_id = object
                .get("client_reference_id")
                .and_then(|v| v.as_str())
                .or_else(|| {
                    object
                        .get("metadata")
                        .and_then(|m| m.get("user_id"))
                        .and_then(|v| v.as_str())
                });
            let tier = object
                .get("metadata")
                .and_then(|m| m.get("tier"))
                .and_then(|v| v.as_str())
                .map(Tier::from_str)
                .unwrap_or(Tier::Pro);
            let customer = object.get("customer").and_then(|v| v.as_str());

            match user_id {
                Some(uid) if tier.is_paid() => {
                    if let Err(e) = state.db.set_user_tier(uid, tier.as_str(), customer).await {
                        error!("Failed to upgrade user {}: {}", uid, e);
                        return Err(err(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "Failed to apply upgrade",
                        ));
                    }
                    info!("Upgraded user {} to {}", uid, tier.as_str());
                }
                _ => warn!("checkout.session.completed missing usable user_id/tier"),
            }
        }
        "customer.subscription.deleted" => {
            // Prefer the metadata user_id; fall back to the customer mapping.
            let by_meta = object
                .get("metadata")
                .and_then(|m| m.get("user_id"))
                .and_then(|v| v.as_str());

            if let Some(uid) = by_meta {
                if let Err(e) = state.db.set_user_tier(uid, Tier::Free.as_str(), None).await {
                    error!("Failed to downgrade user {}: {}", uid, e);
                    return Err(err(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to apply downgrade",
                    ));
                }
                info!("Downgraded user {} to free (subscription cancelled)", uid);
            } else if let Some(customer) = object.get("customer").and_then(|v| v.as_str()) {
                match state.db.downgrade_by_stripe_customer(customer).await {
                    Ok(Some(uid)) => {
                        info!("Downgraded user {} to free (subscription cancelled)", uid)
                    }
                    Ok(None) => warn!("No user found for cancelled customer {}", customer),
                    Err(e) => {
                        error!("Failed to downgrade customer {}: {}", customer, e);
                        return Err(err(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "Failed to apply downgrade",
                        ));
                    }
                }
            }
        }
        other => {
            // Acknowledge unrelated events so Stripe doesn't retry them.
            info!("Ignoring unhandled Stripe event: {}", other);
        }
    }

    Ok(StatusCode::OK)
}

/// Verify a `Stripe-Signature` header against the raw payload.
///
/// Header format: `t=<unix>,v1=<hex hmac>[,v1=<hex hmac>...]`. The signed
/// message is `"<t>.<raw body>"`, HMAC-SHA256'd with the webhook secret. We
/// accept the event if any `v1` candidate matches (constant-time via
/// `verify_slice`).
fn verify_signature(payload: &[u8], sig_header: &str, secret: &str) -> bool {
    if secret.is_empty() || sig_header.is_empty() {
        return false;
    }

    let mut timestamp: Option<&str> = None;
    let mut candidates: Vec<&str> = Vec::new();
    for part in sig_header.split(',') {
        match part.split_once('=') {
            Some(("t", v)) => timestamp = Some(v),
            Some(("v1", v)) => candidates.push(v),
            _ => {}
        }
    }

    let Some(t) = timestamp else {
        return false;
    };
    if candidates.is_empty() {
        return false;
    }

    candidates.iter().any(|cand| {
        let Ok(expected) = hex::decode(cand) else {
            return false;
        };
        let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
            return false;
        };
        mac.update(t.as_bytes());
        mac.update(b".");
        mac.update(payload);
        mac.verify_slice(&expected).is_ok()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a valid signature the way Stripe does, then confirm we accept it
    /// and reject tampering.
    #[test]
    fn signature_roundtrip() {
        let secret = "whsec_test_secret";
        let payload = br#"{"id":"evt_1","type":"checkout.session.completed"}"#;
        let t = "1700000000";

        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(t.as_bytes());
        mac.update(b".");
        mac.update(payload);
        let sig = hex::encode(mac.finalize().into_bytes());

        let header = format!("t={},v1={}", t, sig);
        assert!(verify_signature(payload, &header, secret));

        // Wrong secret → reject.
        assert!(!verify_signature(payload, &header, "whsec_wrong"));
        // Tampered body → reject.
        assert!(!verify_signature(b"{}", &header, secret));
        // Missing timestamp → reject.
        assert!(!verify_signature(payload, &format!("v1={}", sig), secret));
    }
}
