use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, info, warn};

use crate::models::{CountryCoords, GdeltResponse, IntelEvent};

// ─── Feed configuration ───────────────────────────────────────────────────────

struct FeedConfig {
    url: &'static str,
    /// Default domain for events from this feed (may be overridden by classify_domain)
    domain: &'static str,
}

/// 15 authoritative, public RSS/Atom feeds across 12 intelligence domains.
/// Direct XML fetch via roxmltree — no third-party proxy dependency.
const FEEDS: &[FeedConfig] = &[
    // ── Geopolitical ──────────────────────────────────────────────────────────
    FeedConfig { url: "https://feeds.bbci.co.uk/news/world/rss.xml",              domain: "geopolitical" },
    FeedConfig { url: "https://www.aljazeera.com/xml/rss/all.xml",                domain: "geopolitical" },
    // ── Cyber / Social Engineering ────────────────────────────────────────────
    FeedConfig { url: "https://feeds.feedburner.com/TheHackersNews",              domain: "cyber" },
    FeedConfig { url: "https://krebsonsecurity.com/feed/",                        domain: "cyber" },
    // ── Energy ───────────────────────────────────────────────────────────────
    FeedConfig { url: "https://oilprice.com/rss/main",                            domain: "energy" },
    FeedConfig { url: "https://www.iea.org/news/rss/news.rss",                    domain: "energy" },
    // ── Climate / Environmental ───────────────────────────────────────────────
    FeedConfig { url: "https://climate.nasa.gov/news/rss.xml",                    domain: "climate" },
    FeedConfig { url: "https://www.theguardian.com/environment/climate-crisis/rss", domain: "climate" },
    // ── Wildfire ─────────────────────────────────────────────────────────────
    FeedConfig { url: "https://inciweb.nwcg.gov/feeds/rss/incidents/",            domain: "wildfire" },
    // ── Water Systems ────────────────────────────────────────────────────────
    FeedConfig { url: "https://www.circleofblue.org/feed/",                       domain: "water" },
    // ── Natural Hazards ───────────────────────────────────────────────────────
    FeedConfig { url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom", domain: "natural" },
    FeedConfig { url: "https://reliefweb.int/disasters/rss.xml",                  domain: "natural" },
    // ── Nuclear Risks ────────────────────────────────────────────────────────
    FeedConfig { url: "https://www.nti.org/feed/",                                domain: "nuclear" },
    // ── Mining / Critical Raw Materials ──────────────────────────────────────
    FeedConfig { url: "https://www.mining.com/feed/",                             domain: "mining" },
    // ── Deforestation + Carbon MRV ───────────────────────────────────────────
    FeedConfig { url: "https://news.mongabay.com/feed/",                          domain: "deforestation" },
];

// ─── Domain keyword classifier ────────────────────────────────────────────────

/// Keyword-based domain refinement.
/// Checks text for strong domain signals; falls back to the feed's declared domain.
fn classify_domain(text: &str, feed_domain: &'static str) -> &'static str {
    let t = text.to_lowercase();
    if t.contains("nuclear") || t.contains("reactor") || t.contains("radiation")
        || t.contains("radioactiv") || t.contains("atomic weapon")
    {
        return "nuclear";
    }
    if t.contains("ransomware") || t.contains("cyberattack") || t.contains("data breach")
        || t.contains("zero-day") || t.contains("malware") || t.contains("phishing")
        || t.contains("social engineering") || t.contains("ddos")
    {
        return "cyber";
    }
    if t.contains("wildfire") || t.contains("forest fire") || t.contains("bushfire") {
        return "wildfire";
    }
    if t.contains("earthquake") || t.contains("tsunami") || t.contains("volcanic")
        || t.contains("eruption") || t.contains("seismic")
    {
        return "natural";
    }
    if t.contains("deforestation") || t.contains("amazon forest") || t.contains("rainforest")
        || t.contains("carbon credit") || t.contains("agb") || t.contains("biomass loss")
    {
        return "deforestation";
    }
    if t.contains("oil spill") || t.contains("pipeline") || t.contains("gas shortage")
        || t.contains("energy crisis") || t.contains("power blackout")
        || t.contains("electricity grid")
    {
        return "energy";
    }
    if t.contains("water shortage") || t.contains("aquifer") || t.contains("water crisis")
        || t.contains("desalination") || t.contains("water stress")
    {
        return "water";
    }
    if t.contains("lithium") || t.contains("cobalt") || t.contains("rare earth")
        || t.contains("mine collapse") || t.contains("tailings")
    {
        return "mining";
    }
    if t.contains("sea level") || t.contains("ocean acidif") || t.contains("coral bleach")
        || t.contains("maritime") || t.contains("shipping lane")
    {
        return "ocean";
    }
    if t.contains("flood") || t.contains("hurricane") || t.contains("cyclone")
        || t.contains("climate change") || t.contains("global warming") || t.contains("drought")
    {
        return "climate";
    }
    if t.contains("housing affordab") || t.contains("labor shortage") || t.contains("migration")
        || t.contains("demographic") || t.contains("workforce shortage")
        || t.contains("population decline")
    {
        return "demographics";
    }
    feed_domain
}

// ─── Domain-aware severity scoring ───────────────────────────────────────────

fn calculate_severity(text: &str, domain: &str) -> i32 {
    let t = text.to_lowercase();

    // Base score reflects inherent domain threat level
    let base: i32 = match domain {
        "nuclear"       => 7,
        "cyber"         => 5,
        "energy"        => 4,
        "wildfire"      => 5,
        "water"         => 4,
        "climate"       => 4,
        "natural"       => 5,
        "mining"        => 3,
        "deforestation" => 3,
        "ocean"         => 3,
        "demographics"  => 3,
        _               => 4, // geopolitical
    };

    // Escalation signals — override upward only
    const CRITICAL: &[&str] = &[
        "killed", "dead", "death", "explosion", "attack", "invasion", "missile",
        "strike", "casualties", "meltdown", "detonation", "catastrophe", "massacre",
    ];
    const HIGH: &[&str] = &[
        "conflict", "crisis", "emergency", "breach", "ransomware", "hack", "outage",
        "shortage", "hurricane", "earthquake", "eruption", "wildfire", "contamination",
        "spill", "critical", "extreme",
    ];
    const MEDIUM: &[&str] = &[
        "protest", "tension", "sanctions", "disruption", "warning", "flood", "drought",
        "leak", "fire", "arrest", "recall", "alert",
    ];

    let mut score = base;
    for kw in CRITICAL { if t.contains(kw) { score = score.max(8); break; } }
    for kw in HIGH     { if t.contains(kw) { score = score.max(6); break; } }
    for kw in MEDIUM   { if t.contains(kw) { score = score.max(5); break; } }

    score.clamp(1, 10)
}

// ─── RSS / Atom XML parser ────────────────────────────────────────────────────

/// Parse RSS 2.0 (`<item>`) or Atom (`<entry>`) XML.
/// Returns (title, description) pairs — at most 10 per feed.
fn parse_rss_xml(xml: &str) -> Vec<(String, String)> {
    let doc = match roxmltree::Document::parse(xml) {
        Ok(d) => d,
        Err(e) => {
            debug!("RSS XML parse error: {}", e);
            return Vec::new();
        }
    };

    let mut items = Vec::new();
    for node in doc.descendants() {
        let tag = node.tag_name().name();
        if tag != "item" && tag != "entry" {
            continue;
        }
        let title = node
            .children()
            .find(|n| n.tag_name().name() == "title")
            .and_then(|n| n.text())
            .unwrap_or("")
            .trim()
            .to_string();

        let desc = node
            .children()
            .find(|n| matches!(n.tag_name().name(), "description" | "summary" | "content"))
            .and_then(|n| n.text())
            .unwrap_or("")
            .trim()
            .to_string();

        if !title.is_empty() {
            items.push((title, desc));
        }
        if items.len() >= 10 {
            break;
        }
    }
    items
}

// ─── Intelligence fusion engine ───────────────────────────────────────────────

/// Fuses GDELT + 15 domain RSS feeds into a deduplicated, severity-ranked event set.
pub struct IntelligenceFusion;

impl IntelligenceFusion {
    /// Fetch and fuse intelligence from GDELT and all domain RSS feeds.
    pub async fn fuse() -> Vec<IntelEvent> {
        info!("Intelligence fusion: starting");

        let mut grid: HashMap<String, IntelEvent> = HashMap::new();

        // GDELT (geopolitical backbone)
        match Self::fetch_gdelt().await {
            Ok(events) => {
                debug!("GDELT: {} events", events.len());
                for e in events { Self::merge_event(&mut grid, e); }
            }
            Err(e) => warn!("GDELT fetch failed: {}", e),
        }

        // Domain RSS feeds (concurrent)
        match Self::fetch_rss().await {
            Ok(events) => {
                debug!("RSS: {} events across {} feeds", events.len(), FEEDS.len());
                for e in events { Self::merge_event(&mut grid, e); }
            }
            Err(e) => warn!("RSS fetch failed: {}", e),
        }

        let mut events: Vec<IntelEvent> = grid.into_values().collect();
        events.sort_by(|a, b| b.severity.cmp(&a.severity));
        events.truncate(150);

        info!("Intelligence fusion: {} unique events across all domains", events.len());
        events
    }

    /// Merge: keep the higher-severity event per 0.1° grid cell.
    fn merge_event(grid: &mut HashMap<String, IntelEvent>, event: IntelEvent) {
        let key = format!("{}:{}", event.grid_key(), &event.domain);
        if let Some(existing) = grid.get(&key) {
            if existing.severity >= event.severity {
                return;
            }
        }
        grid.insert(key, event);
    }

    // ── GDELT ─────────────────────────────────────────────────────────────────

    async fn fetch_gdelt() -> anyhow::Result<Vec<IntelEvent>> {
        let query = urlencoding::encode("conflict OR war OR attack OR nuclear OR cyber OR disaster");
        let url = format!(
            "https://api.gdeltproject.org/api/v2/geo/geo?query={}&format=geojson&timespan=6h",
            query
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()?;

        let response = client.get(&url).send().await?;
        if !response.status().is_success() {
            return Err(anyhow::anyhow!("GDELT status: {}", response.status()));
        }

        let gdelt_data: GdeltResponse = response.json().await?;
        let mut events = Vec::new();

        for feature in gdelt_data.features {
            if feature.geometry.coordinates.len() < 2 {
                continue;
            }
            let lon = feature.geometry.coordinates[0];
            let lat = feature.geometry.coordinates[1];

            let country = feature
                .properties
                .as_ref()
                .and_then(|p| p.country.clone())
                .unwrap_or_else(|| "Unknown".to_string());

            let headline = feature
                .properties
                .as_ref()
                .and_then(|p| p.name.clone())
                .unwrap_or_else(|| "Intelligence Event".to_string());

            let domain = classify_domain(&headline, "geopolitical");
            let mut severity = calculate_severity(&headline, domain);

            // GDELT fatalities are a hard signal
            if feature
                .properties
                .as_ref()
                .and_then(|p| p.fatalities)
                .unwrap_or(0)
                > 0
            {
                severity = severity.max(8);
            }

            events.push(
                IntelEvent::new(&country, lat, lon, severity, &headline, "gdelt")
                    .with_domain(domain),
            );
        }

        Ok(events)
    }

    // ── RSS / Atom (all domains, concurrent) ──────────────────────────────────

    async fn fetch_rss() -> anyhow::Result<Vec<IntelEvent>> {
        let client = Arc::new(
            reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(12))
                .user_agent(
                    "WorldMonitor-Agents/3.0 (OSINT Intelligence; +https://worldmonitor.app)",
                )
                .build()?,
        );

        // Fire all feed fetches concurrently
        let handles: Vec<_> = FEEDS
            .iter()
            .map(|feed| {
                let client = client.clone();
                let url = feed.url;
                let domain = feed.domain;
                tokio::spawn(async move { fetch_single_feed(&client, url, domain).await })
            })
            .collect();

        let mut all_events = Vec::new();
        for handle in handles {
            if let Ok(Ok(events)) = handle.await {
                all_events.extend(events);
            }
        }

        Ok(all_events)
    }

    // ── Legacy local brief (fallback when Groq is unavailable) ────────────────

    pub fn generate_brief(events: &[IntelEvent], country: &str) -> String {
        if events.is_empty() {
            return format!(
                "No significant activity detected in {} in the last 24 hours.",
                country
            );
        }

        let high: Vec<_> = events.iter().filter(|e| e.severity >= 7).collect();
        let mut brief = format!("Intelligence Brief — {}:\n\n", country);

        if !high.is_empty() {
            brief.push_str(&format!(
                "⚠ HIGH PRIORITY: {} critical events detected. Key developments:\n",
                high.len()
            ));
            for e in high.iter().take(3) {
                brief.push_str(&format!("• {}\n", e.headline));
            }
            brief.push('\n');
        }

        let med = events.iter().filter(|e| e.severity >= 5 && e.severity < 7).count();
        if med > 0 {
            brief.push_str(&format!(
                "📊 {} additional events of note. Situation requires monitoring.\n\n",
                med
            ));
        }

        brief.push_str(&format!(
            "Total events analysed: {} (last 24 h).",
            events.len()
        ));
        brief
    }
}

// ─── Single-feed fetcher ──────────────────────────────────────────────────────

async fn fetch_single_feed(
    client: &reqwest::Client,
    url: &str,
    feed_domain: &'static str,
) -> anyhow::Result<Vec<IntelEvent>> {
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Feed {} → HTTP {}", url, response.status()));
    }
    let xml = response.text().await?;
    let parsed = parse_rss_xml(&xml);

    let mut events = Vec::new();
    for (title, desc) in parsed {
        let text = format!("{} {}", title, desc);
        let domain = classify_domain(&text, feed_domain);
        let countries = CountryCoords::extract_from_text(&text);

        // Only emit geocodable events (map requires lat/lon)
        if let Some(country) = countries.into_iter().next() {
            if let Some((lat, lon)) = CountryCoords::get(&country) {
                let severity = calculate_severity(&text, domain);
                events.push(
                    IntelEvent::new(&country, lat, lon, severity, &title, "rss")
                        .with_domain(domain),
                );
            }
        }
    }

    Ok(events)
}

// ─── Groq brief generator ─────────────────────────────────────────────────────

pub struct BriefGenerator {
    groq_api_key: String,
}

impl BriefGenerator {
    pub fn new(groq_api_key: String) -> Self {
        Self { groq_api_key }
    }

    pub async fn generate(&self, events: &[IntelEvent], country: &str) -> String {
        if !self.groq_api_key.is_empty() {
            match self.generate_with_groq(events, country).await {
                Ok(brief) => return brief,
                Err(e) => warn!("Groq API failed: {}, using local fallback", e),
            }
        }
        IntelligenceFusion::generate_brief(events, country)
    }

    async fn generate_with_groq(
        &self,
        events: &[IntelEvent],
        country: &str,
    ) -> anyhow::Result<String> {
        let context = events
            .iter()
            .take(20)
            .map(|e| format!("[{}] {}", e.domain, e.headline))
            .collect::<Vec<_>>()
            .join(". ");

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()?;

        let response = client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.groq_api_key))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({
                "model": "llama-3.3-70b-versatile",
                "messages": [{
                    "role": "system",
                    "content": "You are a concise OSINT intelligence analyst. Respond in exactly 2 sentences."
                }, {
                    "role": "user",
                    "content": format!(
                        "Summarise the current intelligence situation in {} based on these events: {}",
                        country, context
                    )
                }],
                "max_tokens": 220,
                "temperature": 0.25
            }))
            .send()
            .await?;

        if !response.status().is_success() {
            let err = response.text().await?;
            return Err(anyhow::anyhow!("Groq error: {}", err));
        }

        let result: serde_json::Value = response.json().await?;
        let summary = result["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("Unable to generate summary")
            .to_string();

        Ok(summary)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_severity_geopolitical() {
        assert_eq!(calculate_severity("Multiple people killed in bombing attack", "geopolitical"), 8);
        assert_eq!(calculate_severity("Protests amid rising tensions", "geopolitical"), 6);
        assert_eq!(calculate_severity("Diplomatic meeting next week", "geopolitical"), 4);
    }

    #[test]
    fn test_severity_nuclear_base() {
        // Nuclear base is 7; no escalation keyword → stays at 7
        assert_eq!(calculate_severity("Nuclear talks resume", "nuclear"), 7);
    }

    #[test]
    fn test_classify_domain() {
        assert_eq!(classify_domain("Ransomware attack on hospital", "geopolitical"), "cyber");
        assert_eq!(classify_domain("Earthquake strikes coastal city", "geopolitical"), "natural");
        assert_eq!(classify_domain("Oil pipeline explosion causes spill", "geopolitical"), "energy");
        assert_eq!(classify_domain("Diplomatic summit in Brussels", "geopolitical"), "geopolitical");
    }

    #[test]
    fn test_parse_rss_xml_rss2() {
        let xml = r#"<?xml version="1.0"?><rss version="2.0"><channel>
            <item><title>Test headline</title><description>Detail here</description></item>
        </channel></rss>"#;
        let items = parse_rss_xml(xml);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].0, "Test headline");
    }

    #[test]
    fn test_parse_rss_xml_atom() {
        let xml = r#"<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <entry><title>Earthquake M6.2</title><summary>Strike-slip fault event</summary></entry>
        </feed>"#;
        let items = parse_rss_xml(xml);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].0, "Earthquake M6.2");
    }

    #[test]
    fn test_generate_brief() {
        let events = vec![
            IntelEvent::new("Ukraine", 48.0, 31.0, 8, "Missile strike kills 10", "gdelt"),
            IntelEvent::new("Ukraine", 48.1, 31.1, 6, "Protests in Kyiv", "rss"),
        ];
        let brief = IntelligenceFusion::generate_brief(&events, "Ukraine");
        assert!(brief.contains("HIGH PRIORITY"));
        assert!(brief.contains("Ukraine"));
    }
}
