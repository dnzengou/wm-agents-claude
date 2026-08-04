//! Outbound alert delivery — Slack incoming-webhooks and Telegram bots.
//!
//! [`dispatch_alerts`] runs at the tail of each ingestion cycle: for every
//! user with alert subscriptions *and* a configured channel *and* a paid tier,
//! it finds the freshly-fused events that match one of their alerts
//! (country + severity threshold) and pushes them. An idempotency guard in the
//! database (`alert_notifications`) ensures each event reaches each user at most
//! once, even though ingestion re-fuses overlapping event sets every 15 minutes.

use std::collections::HashMap;
use std::time::Duration;
use tracing::{error, info, warn};

use crate::{models::IntelEvent, AppState};

const HTTP_TIMEOUT: Duration = Duration::from_secs(15);

/// Post a message to a Slack incoming webhook.
pub async fn send_slack(webhook_url: &str, text: &str) -> anyhow::Result<()> {
    let client = reqwest::Client::builder().timeout(HTTP_TIMEOUT).build()?;
    let resp = client
        .post(webhook_url)
        .json(&serde_json::json!({ "text": text }))
        .send()
        .await?;
    let status = resp.status();
    if !status.is_success() {
        anyhow::bail!("Slack webhook returned {}", status);
    }
    Ok(())
}

/// Send a message via the Telegram Bot API.
pub async fn send_telegram(bot_token: &str, chat_id: &str, text: &str) -> anyhow::Result<()> {
    let url = format!("https://api.telegram.org/bot{}/sendMessage", bot_token);
    let client = reqwest::Client::builder().timeout(HTTP_TIMEOUT).build()?;
    let resp = client
        .post(&url)
        .json(&serde_json::json!({
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": true,
        }))
        .send()
        .await?;
    let status = resp.status();
    if !status.is_success() {
        anyhow::bail!("Telegram API returned {}", status);
    }
    Ok(())
}

/// Render an event into a short, channel-friendly message.
fn format_event(e: &IntelEvent) -> String {
    let link = e
        .link
        .as_deref()
        .filter(|l| !l.is_empty())
        .map(|l| format!("\n{}", l))
        .unwrap_or_default();
    format!(
        "\u{1F6A8} [{}] severity {}/10 — {}\n{} · {}{}",
        e.domain, e.severity, e.headline, e.country, e.source, link
    )
}

/// Does any of this user's alerts match the event? Country match is
/// case-insensitive; the event must meet or exceed the alert's threshold.
fn matches(alerts: &[&crate::models::Alert], e: &IntelEvent) -> bool {
    alerts
        .iter()
        .any(|a| a.country.eq_ignore_ascii_case(&e.country) && e.severity >= a.threshold)
}

/// Fan out newly-fused matching events to every eligible user's channels.
///
/// Best-effort and self-contained: any per-user or per-channel failure is
/// logged and skipped so one bad webhook never stalls ingestion.
pub async fn dispatch_alerts(state: &AppState, events: &[IntelEvent]) {
    if events.is_empty() {
        return;
    }

    let alerts = match state.db.get_all_alerts().await {
        Ok(a) => a,
        Err(e) => {
            error!("Alert dispatch: failed to load alerts: {}", e);
            return;
        }
    };
    if alerts.is_empty() {
        return;
    }

    // Group alerts by user so we touch each user's channels/tier just once.
    let mut by_user: HashMap<&str, Vec<&crate::models::Alert>> = HashMap::new();
    for a in &alerts {
        by_user.entry(a.user_id.as_str()).or_default().push(a);
    }

    let mut sent = 0usize;
    for (user_id, user_alerts) in by_user {
        // Channels configured?
        let channels = match state.db.get_notification_channels(user_id).await {
            Ok(Some(c)) if c.any_configured() => c,
            Ok(_) => continue,
            Err(e) => {
                error!(
                    "Alert dispatch: channels lookup failed for {}: {}",
                    user_id, e
                );
                continue;
            }
        };

        // Delivery is a paid feature.
        let tier = match state.db.get_or_create_user(user_id).await {
            Ok(u) => u.tier(),
            Err(e) => {
                error!("Alert dispatch: user lookup failed for {}: {}", user_id, e);
                continue;
            }
        };
        if !tier.is_paid() {
            continue;
        }

        for e in events {
            if !matches(&user_alerts, e) {
                continue;
            }
            // Exactly-once guard: only the first insert wins.
            match state.db.mark_event_notified(user_id, &e.id).await {
                Ok(true) => {}
                Ok(false) => continue, // already delivered
                Err(err) => {
                    error!(
                        "Alert dispatch: guard insert failed for {}: {}",
                        user_id, err
                    );
                    continue;
                }
            }

            let text = format_event(e);
            if channels.slack_configured() {
                if let Some(url) = channels.slack_webhook_url.as_deref() {
                    if let Err(err) = send_slack(url, &text).await {
                        warn!("Slack delivery failed for {}: {}", user_id, err);
                    }
                }
            }
            if channels.telegram_configured() {
                if let (Some(tok), Some(chat)) = (
                    channels.telegram_bot_token.as_deref(),
                    channels.telegram_chat_id.as_deref(),
                ) {
                    if let Err(err) = send_telegram(tok, chat, &text).await {
                        warn!("Telegram delivery failed for {}: {}", user_id, err);
                    }
                }
            }
            sent += 1;
        }
    }

    if sent > 0 {
        info!("Alert dispatch: pushed {} event notification(s)", sent);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Alert;

    fn ev(country: &str, severity: i32) -> IntelEvent {
        let mut e = IntelEvent::new(country, 0.0, 0.0, severity, "headline", "gdelt");
        e.id = format!("{}-{}", country, severity);
        e
    }

    fn alert(country: &str, threshold: i32) -> Alert {
        Alert {
            id: 1,
            user_id: "u1".to_string(),
            country: country.to_string(),
            threshold,
            created_at: None,
        }
    }

    #[test]
    fn matching_respects_country_and_threshold() {
        let a = alert("Ukraine", 6);
        let alerts = vec![&a];

        // Below threshold → no match.
        assert!(!matches(&alerts, &ev("Ukraine", 5)));
        // At threshold → match.
        assert!(matches(&alerts, &ev("Ukraine", 6)));
        // Case-insensitive country.
        assert!(matches(&alerts, &ev("ukraine", 8)));
        // Different country → no match.
        assert!(!matches(&alerts, &ev("Poland", 9)));
    }

    #[test]
    fn format_includes_key_fields() {
        let text = format_event(&ev("Ukraine", 8));
        assert!(text.contains("Ukraine"));
        assert!(text.contains("8/10"));
        assert!(text.contains("headline"));
    }
}
