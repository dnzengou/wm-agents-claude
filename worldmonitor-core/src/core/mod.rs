use std::collections::HashMap;
use tracing::{debug, error, info, warn};

use crate::models::{CountryCoords, GdeltResponse, IntelEvent, RssResponse};

/// Intelligence fusion engine - combines data from multiple sources
pub struct IntelligenceFusion;

impl IntelligenceFusion {
    /// Fetch and fuse intelligence from GDELT and RSS sources
    pub async fn fuse() -> Vec<IntelEvent> {
        info!("Starting intelligence fusion");

        let mut grid: HashMap<String, IntelEvent> = HashMap::new();

        // Fetch from GDELT
        match Self::fetch_gdelt().await {
            Ok(events) => {
                debug!("Fetched {} events from GDELT", events.len());
                for event in events {
                    let key = event.grid_key();
                    Self::merge_event(&mut grid, key, event);
                }
            }
            Err(e) => {
                warn!("Failed to fetch from GDELT: {}", e);
            }
        }

        // Fetch from RSS
        match Self::fetch_rss().await {
            Ok(events) => {
                debug!("Fetched {} events from RSS", events.len());
                for event in events {
                    let key = event.grid_key();
                    Self::merge_event(&mut grid, key, event);
                }
            }
            Err(e) => {
                warn!("Failed to fetch from RSS: {}", e);
            }
        }

        // Convert to sorted vector
        let mut events: Vec<IntelEvent> = grid.into_values().collect();
        events.sort_by(|a, b| b.severity.cmp(&a.severity));
        events.truncate(100); // Keep top 100

        info!("Fused {} unique events", events.len());
        events
    }

    /// Merge event into grid, keeping higher severity
    fn merge_event(grid: &mut HashMap<String, IntelEvent>, key: String, event: IntelEvent) {
        if let Some(existing) = grid.get(&key) {
            if existing.severity >= event.severity {
                return; // Keep existing
            }
        }
        grid.insert(key, event);
    }

    /// Fetch events from GDELT API
    async fn fetch_gdelt() -> anyhow::Result<Vec<IntelEvent>> {
        let url = "https://api.gdeltproject.org/api/v2/geo/geo?query=conflict&format=geojson&timespan=1h";
        
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        let response = client.get(url).send().await?;
        
        if !response.status().is_success() {
            return Err(anyhow::anyhow!("GDELT returned status: {}", response.status()));
        }

        let gdelt_data: GdeltResponse = response.json().await?;
        let mut events = Vec::new();

        for feature in gdelt_data.features {
            if feature.geometry.coordinates.len() < 2 {
                continue;
            }

            let lon = feature.geometry.coordinates[0];
            let lat = feature.geometry.coordinates[1];

            let severity = if let Some(props) = &feature.properties {
                if props.fatalities.unwrap_or(0) > 0 {
                    8
                } else {
                    4
                }
            } else {
                4
            };

            let country = feature.properties.as_ref()
                .and_then(|p| p.country.clone())
                .unwrap_or_else(|| "Unknown".to_string());

            let headline = feature.properties.as_ref()
                .and_then(|p| p.name.clone())
                .unwrap_or_else(|| "Conflict Event".to_string());

            events.push(IntelEvent::new(
                &country,
                lat,
                lon,
                severity,
                &headline,
                "gdelt",
            ));
        }

        Ok(events)
    }

    /// Fetch events from RSS feeds
    async fn fetch_rss() -> anyhow::Result<Vec<IntelEvent>> {
        let feeds = vec![
            "https://feeds.reuters.com/reuters/conflicts",
            "https://feeds.bbci.co.uk/news/world/rss.xml",
        ];

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        let mut events = Vec::new();

        for feed_url in feeds {
            let url = format!(
                "https://rss2json.com/api.json?rss_url={}",
                urlencoding::encode(feed_url)
            );

            match client.get(&url).send().await {
                Ok(response) => {
                    if let Ok(rss_data) = response.json::<RssResponse>().await {
                        for item in rss_data.items {
                            let text = format!(
                                "{} {}",
                                item.title,
                                item.description.unwrap_or_default()
                            );

                            let countries = CountryCoords::extract_from_text(&text);
                            
                            for country in countries {
                                if let Some((lat, lon)) = CountryCoords::get(&country) {
                                    let severity = Self::calculate_severity(&text);
                                    
                                    events.push(IntelEvent::new(
                                        &country,
                                        lat,
                                        lon,
                                        severity,
                                        &item.title,
                                        "rss",
                                    ));
                                    break; // Only take first country per item
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to fetch RSS feed {}: {}", feed_url, e);
                }
            }
        }

        Ok(events)
    }

    /// Calculate severity based on text analysis
    fn calculate_severity(text: &str) -> i32 {
        let text_lower = text.to_lowercase();
        let mut score = 5; // Default

        // High severity keywords
        let high_keywords = [
            "attack", "killed", "death", "bomb", "explosion", "war", "invasion",
            "missile", "strike", "casualties", "fatalities", "massacre",
        ];

        // Medium severity keywords
        let medium_keywords = [
            "conflict", "clash", "protest", "riot", "violence", "tension",
            "crisis", "emergency", "threat", "sanctions",
        ];

        for keyword in &high_keywords {
            if text_lower.contains(keyword) {
                score = 8;
                break;
            }
        }

        if score == 5 {
            for keyword in &medium_keywords {
                if text_lower.contains(keyword) {
                    score = 6;
                    break;
                }
            }
        }

        score.clamp(1, 10)
    }

    /// Generate AI brief from events
    pub fn generate_brief(events: &[IntelEvent], country: &str) -> String {
        if events.is_empty() {
            return format!("No significant activity detected in {} in the last 24 hours.", country);
        }

        let high_severity: Vec<_> = events.iter().filter(|e| e.severity >= 7).collect();
        let medium_severity: Vec<_> = events.iter().filter(|e| e.severity >= 5 && e.severity < 7).collect();

        let mut brief = format!("Intelligence Brief for {}:\n\n", country);

        if !high_severity.is_empty() {
            brief.push_str(&format!(
                "⚠️ HIGH PRIORITY: {} critical events detected. ",
                high_severity.len()
            ));
            brief.push_str("Monitor for escalation. Key developments:\n");
            for event in high_severity.iter().take(3) {
                brief.push_str(&format!("- {}\n", event.headline));
            }
            brief.push('\n');
        }

        if !medium_severity.is_empty() {
            brief.push_str(&format!(
                "📊 {} additional events of note. ",
                medium_severity.len()
            ));
            brief.push_str("Situation requires continued monitoring.\n\n");
        }

        brief.push_str(&format!(
            "Total events analyzed: {} in the last 24 hours.",
            events.len()
        ));

        brief
    }
}

/// AI Brief generator with fallback
pub struct BriefGenerator {
    groq_api_key: String,
}

impl BriefGenerator {
    pub fn new(groq_api_key: String) -> Self {
        Self { groq_api_key }
    }

    /// Generate AI brief using Groq API with local fallback
    pub async fn generate(&self, events: &[IntelEvent], country: &str) -> String {
        // Try Groq API first
        if !self.groq_api_key.is_empty() {
            match self.generate_with_groq(events, country).await {
                Ok(brief) => return brief,
                Err(e) => {
                    warn!("Groq API failed: {}, using local generation", e);
                }
            }
        }

        // Fallback to local generation
        IntelligenceFusion::generate_brief(events, country)
    }

    async fn generate_with_groq(&self, events: &[IntelEvent], country: &str) -> anyhow::Result<String> {
        let context = events
            .iter()
            .map(|e| e.headline.clone())
            .collect::<Vec<_>>()
            .join(". ");

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()?;

        let response = client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.groq_api_key))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({
                "model": "llama-3.3-70b-versatile",
                "messages": [{
                    "role": "user",
                    "content": format!(
                        "As an intelligence analyst, provide a concise 2-sentence summary of these events in {}: {}",
                        country, context
                    )
                }],
                "max_tokens": 200,
                "temperature": 0.3
            }))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Groq API error: {}", error_text));
        }

        let result: serde_json::Value = response.json().await?;
        let summary = result["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("Unable to generate summary")
            .to_string();

        Ok(summary)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_severity_calculation() {
        let text1 = "Multiple people killed in bombing attack";
        assert_eq!(IntelligenceFusion::calculate_severity(text1), 8);

        let text2 = "Protests continue amid rising tensions";
        assert_eq!(IntelligenceFusion::calculate_severity(text2), 6);

        let text3 = "Diplomatic meeting scheduled for next week";
        assert_eq!(IntelligenceFusion::calculate_severity(text3), 5);
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
