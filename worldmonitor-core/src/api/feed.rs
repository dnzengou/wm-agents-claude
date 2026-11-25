//! Public Atom 1.0 feed — `/feed.atom`.
//!
//! A standards-compliant Atom representation of the live intelligence stream,
//! so retrieval crawlers, answer engines and plain old feed readers can poll
//! for new events without hitting the JSON API or SSE. Every entry links
//! back to its upstream source URL when the original feed provided one.
//!
//! Keep the implementation dependency-free: hand-rolled XML escaping and
//! formatting, no quick-xml or atom_syndication crate.

use axum::{extract::State, http::StatusCode};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tracing::error;

use crate::{
    cache::{strategies::*, Cache},
    models::IntelEvent,
    AppState,
};

const FEED_ENTRY_CAP: usize = 50;

/// GET /feed.atom — Atom 1.0 feed of the latest fused events.
pub async fn handler(State(state): State<Arc<AppState>>) -> axum::response::Response {
    use axum::http::header;

    // Reuse the same cached fetch path `/api/intelligence` uses so the feed is
    // consistent with what the UI shows and doesn't hammer the DB on each poll.
    let events = match load_events(&state).await {
        Ok(evs) => evs,
        Err(e) => {
            error!("feed: failed to load events: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to build feed").into_response();
        }
    };

    let body = render_atom(&state.config.app_base_url, &events);
    use axum::response::IntoResponse;
    (
        [(
            header::CONTENT_TYPE,
            "application/atom+xml; charset=utf-8".to_string(),
        )],
        body,
    )
        .into_response()
}

async fn load_events(state: &AppState) -> anyhow::Result<Vec<IntelEvent>> {
    let cache_key = Cache::key_intelligence();
    if let Some(cached) = state.cache.get_json::<Vec<IntelEvent>>(cache_key) {
        return Ok(cached);
    }
    let events = state.db.get_recent_events(100).await?;
    state
        .cache
        .put_json_with_ttl(cache_key, &events, INTELLIGENCE_TTL);
    Ok(events)
}

fn render_atom(base_url: &str, events: &[IntelEvent]) -> String {
    let feed_updated = events
        .iter()
        .filter_map(|e| e.created_at)
        .max()
        .unwrap_or_else(Utc::now);

    let mut out = String::with_capacity(4096);
    out.push_str("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
    out.push_str("<feed xmlns=\"http://www.w3.org/2005/Atom\">\n");
    out.push_str("  <title>WorldMonitor Core — Live Intelligence Feed</title>\n");
    out.push_str("  <subtitle>Real-time global intelligence events from GDELT, NASA EONET and curated RSS. Classified and severity-scored in one Rust binary.</subtitle>\n");
    out.push_str(&format!(
        "  <link href=\"{}/feed.atom\" rel=\"self\" type=\"application/atom+xml\"/>\n",
        xml_escape(base_url)
    ));
    out.push_str(&format!(
        "  <link href=\"{}/\" rel=\"alternate\" type=\"text/html\"/>\n",
        xml_escape(base_url)
    ));
    out.push_str("  <id>tag:worldmonitor-core,2026:feed/intelligence</id>\n");
    out.push_str(&format!(
        "  <updated>{}</updated>\n",
        feed_updated.to_rfc3339()
    ));
    out.push_str("  <generator uri=\"https://github.com/dnzengou/wm-agents-claude\" version=\"0.2.0\">WorldMonitor Core</generator>\n");
    out.push_str("  <rights>Events classified and indexed from public sources (GDELT, NASA EONET, publisher RSS). Follow upstream links for the source's own licensing terms.</rights>\n");

    for ev in events.iter().take(FEED_ENTRY_CAP) {
        render_entry(&mut out, base_url, ev);
    }

    out.push_str("</feed>\n");
    out
}

fn render_entry(out: &mut String, base_url: &str, ev: &IntelEvent) {
    let updated: DateTime<Utc> = ev.created_at.unwrap_or_else(Utc::now);
    let link = ev
        .link
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(base_url);

    out.push_str("  <entry>\n");
    out.push_str(&format!(
        "    <title>[{}/10 · {}] {} — {}</title>\n",
        ev.severity,
        xml_escape(&ev.domain),
        xml_escape(&ev.country),
        xml_escape(&ev.headline)
    ));
    out.push_str(&format!(
        "    <link rel=\"alternate\" type=\"text/html\" href=\"{}\"/>\n",
        xml_escape(link)
    ));
    out.push_str(&format!(
        "    <id>tag:worldmonitor-core,2026:event/{}</id>\n",
        xml_escape(&ev.id)
    ));
    out.push_str(&format!(
        "    <updated>{}</updated>\n",
        updated.to_rfc3339()
    ));
    out.push_str(&format!(
        "    <published>{}</published>\n",
        updated.to_rfc3339()
    ));
    out.push_str(&format!(
        "    <category term=\"{}\" label=\"{}\"/>\n",
        xml_escape(&ev.domain),
        xml_escape(&ev.domain)
    ));
    out.push_str(&format!(
        "    <category scheme=\"https://worldmonitor-core/severity\" term=\"{}\"/>\n",
        ev.severity
    ));
    out.push_str(&format!(
        "    <author><name>{}</name></author>\n",
        xml_escape(&ev.source)
    ));
    out.push_str(&format!(
        "    <summary type=\"text\">{}</summary>\n",
        xml_escape(&ev.headline)
    ));
    out.push_str(&format!(
        "    <content type=\"html\">&lt;p&gt;{}&lt;/p&gt;&lt;p&gt;Country: {} · Domain: {} · Severity: {}/10 · Source: {}&lt;/p&gt;</content>\n",
        xml_escape(&ev.headline),
        xml_escape(&ev.country),
        xml_escape(&ev.domain),
        ev.severity,
        xml_escape(&ev.source)
    ));
    out.push_str("  </entry>\n");
}

fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ev(id: &str, country: &str, headline: &str, link: Option<&str>) -> IntelEvent {
        IntelEvent {
            id: id.into(),
            country: country.into(),
            lat: 0.0,
            lon: 0.0,
            severity: 7,
            headline: headline.into(),
            source: "Reuters".into(),
            timestamp: 1_700_000_000,
            created_at: Some(Utc.with_ymd_and_hms(2026, 11, 7, 12, 0, 0).unwrap()),
            domain: "geopolitical".into(),
            link: link.map(String::from),
        }
    }

    #[test]
    fn xml_escape_handles_specials() {
        assert_eq!(
            xml_escape("a <b> & \"c\" 'd'"),
            "a &lt;b&gt; &amp; &quot;c&quot; &apos;d&apos;"
        );
    }

    #[test]
    fn atom_includes_required_elements_and_escapes_payload() {
        let events = vec![ev(
            "evt1",
            "Côte d'Ivoire",
            "Peace talks resume between <faction A> & B",
            Some("https://example.com/story?a=1&b=2"),
        )];
        let atom = render_atom("https://worldmonitor.example", &events);
        // Top-level
        assert!(atom.starts_with("<?xml version=\"1.0\""));
        assert!(atom.contains("<feed xmlns=\"http://www.w3.org/2005/Atom\">"));
        assert!(atom.contains("<id>tag:worldmonitor-core,2026:feed/intelligence</id>"));
        // Entry structure
        assert!(atom.contains("tag:worldmonitor-core,2026:event/evt1"));
        // Escaping: raw '&' must not appear next to a non-entity char
        assert!(atom.contains("&amp;"));
        assert!(!atom.contains("<faction A>"));
        // Apostrophe in country name escaped
        assert!(atom.contains("Côte d&apos;Ivoire"));
    }

    #[test]
    fn missing_link_falls_back_to_homepage() {
        let events = vec![ev("x", "US", "headline", None)];
        let atom = render_atom("https://wm.test", &events);
        assert!(atom.contains("href=\"https://wm.test\""));
    }
}
