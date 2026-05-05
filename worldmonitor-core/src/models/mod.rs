use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Intelligence event from fused data sources
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct IntelEvent {
    pub id: String,
    pub country: String,
    pub lat: f64,
    pub lon: f64,
    pub severity: i32,
    pub headline: String,
    pub source: String,
    pub timestamp: i64,
    pub created_at: Option<DateTime<Utc>>,
}

impl IntelEvent {
    pub fn new(country: &str, lat: f64, lon: f64, severity: i32, headline: &str, source: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            country: country.to_string(),
            lat,
            lon,
            severity: severity.clamp(1, 10),
            headline: headline.to_string(),
            source: source.to_string(),
            timestamp: Utc::now().timestamp_millis(),
            created_at: Some(Utc::now()),
        }
    }

    /// Get grid key for deduplication (0.1 degree precision)
    pub fn grid_key(&self) -> String {
        format!("{},{}", (self.lat * 10.0).round() as i32, (self.lon * 10.0).round() as i32)
    }
}

/// User preferences and state
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub interests: String, // JSON array
    pub countries: String, // JSON array
    pub alert_threshold: i32,
    pub streak: i32,
    pub last_visit: Option<DateTime<Utc>>,
    pub created_at: Option<DateTime<Utc>>,
}

impl User {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            interests: "[]".to_string(),
            countries: "[]".to_string(),
            alert_threshold: 5,
            streak: 0,
            last_visit: Some(Utc::now()),
            created_at: Some(Utc::now()),
        }
    }

    pub fn get_interests(&self) -> Vec<String> {
        serde_json::from_str(&self.interests).unwrap_or_default()
    }

    pub fn get_countries(&self) -> Vec<String> {
        serde_json::from_str(&self.countries).unwrap_or_default()
    }

    pub fn set_interests(&mut self, interests: Vec<String>) {
        self.interests = serde_json::to_string(&interests).unwrap_or_default();
    }

    pub fn set_countries(&mut self, countries: Vec<String>) {
        self.countries = serde_json::to_string(&countries).unwrap_or_default();
    }
}

/// User alert subscription
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Alert {
    pub id: i64,
    pub user_id: String,
    pub country: String,
    pub threshold: i32,
    pub created_at: Option<DateTime<Utc>>,
}

/// AI-generated intelligence brief
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Brief {
    pub summary: String,
    pub event_count: i32,
    pub country: String,
    pub generated_at: i64,
}

/// Sync response for differential updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResponse {
    pub new_events: Vec<IntelEvent>,
    pub server_time: i64,
}

/// GDELT GeoJSON feature
#[derive(Debug, Clone, Deserialize)]
pub struct GdeltFeature {
    #[serde(rename = "type")]
    pub feature_type: String,
    pub geometry: GdeltGeometry,
    pub properties: Option<GdeltProperties>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GdeltGeometry {
    #[serde(rename = "type")]
    pub geometry_type: String,
    pub coordinates: Vec<f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GdeltProperties {
    pub name: Option<String>,
    pub country: Option<String>,
    pub fatalities: Option<i32>,
}

/// GDELT GeoJSON response
#[derive(Debug, Clone, Deserialize)]
pub struct GdeltResponse {
    #[serde(rename = "type")]
    pub response_type: String,
    pub features: Vec<GdeltFeature>,
}

/// RSS item from feed
#[derive(Debug, Clone, Deserialize)]
pub struct RssItem {
    pub title: String,
    pub description: Option<String>,
    pub pub_date: Option<String>,
    pub link: Option<String>,
}

/// RSS feed response
#[derive(Debug, Clone, Deserialize)]
pub struct RssResponse {
    pub items: Vec<RssItem>,
}

/// GeoJSON for map rendering
#[derive(Debug, Clone, Serialize)]
pub struct GeoJson {
    #[serde(rename = "type")]
    pub geo_type: String,
    pub features: Vec<GeoFeature>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GeoFeature {
    #[serde(rename = "type")]
    pub feature_type: String,
    pub geometry: GeoGeometry,
    pub properties: GeoProperties,
}

#[derive(Debug, Clone, Serialize)]
pub struct GeoGeometry {
    #[serde(rename = "type")]
    pub geometry_type: String,
    pub coordinates: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GeoProperties {
    pub country: String,
    pub severity: i32,
    pub headline: String,
}

impl GeoJson {
    pub fn from_events(events: &[IntelEvent]) -> Self {
        Self {
            geo_type: "FeatureCollection".to_string(),
            features: events.iter().map(|e| GeoFeature {
                feature_type: "Feature".to_string(),
                geometry: GeoGeometry {
                    geometry_type: "Point".to_string(),
                    coordinates: vec![e.lon, e.lat],
                },
                properties: GeoProperties {
                    country: e.country.clone(),
                    severity: e.severity,
                    headline: e.headline.clone(),
                },
            }).collect(),
        }
    }
}

/// Country coordinates lookup
pub struct CountryCoords;

impl CountryCoords {
    pub fn get(country: &str) -> Option<(f64, f64)> {
        let coords: std::collections::HashMap<&str, (f64, f64)> = [
            ("Ukraine", (48.3794, 31.1656)),
            ("Russia", (61.5240, 105.3188)),
            ("Israel", (31.0461, 34.8516)),
            ("Gaza", (31.5017, 34.4668)),
            ("China", (35.8617, 104.1954)),
            ("Taiwan", (23.6978, 120.9605)),
            ("Iran", (32.4279, 53.6880)),
            ("Syria", (34.8021, 38.9968)),
            ("United States", (37.0902, -95.7129)),
            ("United Kingdom", (55.3781, -3.4360)),
            ("Germany", (51.1657, 10.4515)),
            ("France", (46.2276, 2.2137)),
            ("Turkey", (38.9637, 35.2433)),
            ("Saudi Arabia", (23.8859, 45.0792)),
            ("India", (20.5937, 78.9629)),
            ("Pakistan", (30.3753, 69.3451)),
            ("North Korea", (40.3399, 127.5101)),
            ("South Korea", (35.9078, 127.7669)),
            ("Japan", (36.2048, 138.2529)),
            ("Australia", (-25.2744, 133.7751)),
            ("Brazil", (-14.2350, -51.9253)),
            ("Mexico", (23.6345, -102.5528)),
            ("Canada", (56.1304, -106.3468)),
            ("Egypt", (26.8206, 30.8025)),
            ("South Africa", (-30.5595, 22.9375)),
            ("Nigeria", (9.0820, 8.6753)),
            ("Ethiopia", (9.1450, 40.4897)),
            ("Venezuela", (6.4238, -66.5897)),
            ("Colombia", (4.5709, -74.2973)),
            ("Argentina", (-38.4161, -63.6167)),
            ("Poland", (51.9194, 19.1451)),
            ("Italy", (41.8719, 12.5674)),
            ("Spain", (40.4637, -3.7492)),
            ("Netherlands", (52.1326, 5.2913)),
            ("Belgium", (50.5039, 4.4699)),
            ("Sweden", (60.1282, 18.6435)),
            ("Norway", (60.4720, 8.4689)),
            ("Denmark", (56.2639, 9.5018)),
            ("Finland", (61.9241, 25.7482)),
            ("Austria", (47.5162, 14.5501)),
            ("Switzerland", (46.8182, 8.2275)),
            ("Czech Republic", (49.8175, 15.4730)),
            ("Hungary", (47.1625, 19.5033)),
            ("Romania", (45.9432, 24.9668)),
            ("Bulgaria", (42.7339, 25.4858)),
            ("Greece", (39.0742, 21.8243)),
            ("Portugal", (39.3999, -8.2245)),
            ("Ireland", (53.1424, -7.6921)),
            ("New Zealand", (-40.9006, 174.8869)),
            ("Singapore", (1.3521, 103.8198)),
            ("Malaysia", (4.2105, 101.9758)),
            ("Indonesia", (-0.7893, 113.9213)),
            ("Thailand", (15.8700, 100.9925)),
            ("Vietnam", (14.0583, 108.2772)),
            ("Philippines", (12.8797, 121.7740)),
            ("Bangladesh", (23.6850, 90.3563)),
            ("Myanmar", (21.9162, 95.9560)),
            ("Afghanistan", (33.9391, 67.7100)),
            ("Iraq", (33.2232, 43.6793)),
            ("Lebanon", (33.8547, 35.8623)),
            ("Jordan", (30.5852, 36.2384)),
            ("Yemen", (15.5527, 48.5164)),
            ("Oman", (21.4735, 55.9754)),
            ("Qatar", (25.3548, 51.1839)),
            ("Kuwait", (29.3117, 47.4818)),
            ("Bahrain", (25.9304, 50.6378)),
            ("United Arab Emirates", (23.4241, 53.8478)),
            ("Morocco", (31.7917, -7.0926)),
            ("Algeria", (28.0339, 1.6596)),
            ("Tunisia", (33.8869, 9.5375)),
            ("Libya", (26.3351, 17.2283)),
            ("Sudan", (12.8628, 30.2176)),
            ("Somalia", (5.1521, 46.1996)),
            ("Kenya", (-0.0236, 37.9062)),
            ("Tanzania", (-6.3690, 34.8888)),
            ("Uganda", (1.3733, 32.2903)),
            ("Rwanda", (-1.9403, 29.8739)),
            ("Ghana", (7.9465, -1.0232)),
            ("Senegal", (14.4974, -14.4524)),
            ("Mali", (17.5707, -3.9962)),
            ("Chad", (15.4542, 18.7322)),
            ("Angola", (-11.2027, 17.8739)),
            ("Zimbabwe", (-19.0154, 29.1549)),
            ("Zambia", (-13.1339, 27.8493)),
            ("Mozambique", (-18.6657, 35.5296)),
            ("Madagascar", (-18.7669, 46.8691)),
            ("Cameroon", (7.3697, 12.3547)),
            ("Ivory Coast", (7.5400, -5.5471)),
            ("Niger", (17.6078, 8.0817)),
            ("Burkina Faso", (12.2383, -1.5616)),
            ("Guinea", (9.9456, -9.6966)),
            ("Malawi", (-13.2543, 34.3015)),
            ("Bolivia", (-16.2902, -63.5887)),
            ("Paraguay", (-23.4425, -58.4438)),
            ("Uruguay", (-32.5228, -55.7658)),
            ("Chile", (-35.6751, -71.5430)),
            ("Peru", (-9.1900, -75.0152)),
            ("Ecuador", (-1.8312, -78.1834)),
            ("Guyana", (4.8604, -58.9302)),
            ("Suriname", (3.9193, -56.0278)),
            ("Panama", (8.5380, -80.7821)),
            ("Costa Rica", (9.7489, -83.7534)),
            ("Nicaragua", (12.8654, -85.2072)),
            ("Honduras", (15.2000, -86.2419)),
            ("Guatemala", (15.7835, -90.2308)),
            ("El Salvador", (13.7942, -88.8965)),
            ("Belize", (17.1899, -88.4976)),
            ("Cuba", (21.5218, -77.7812)),
            ("Haiti", (18.9712, -72.2852)),
            ("Dominican Republic", (18.7357, -70.1627)),
            ("Jamaica", (18.1096, -77.2975)),
            ("Trinidad and Tobago", (10.6918, -61.2225)),
            ("Barbados", (13.1939, -59.5432)),
            ("Saint Lucia", (13.9094, -60.9789)),
            ("Grenada", (12.1165, -61.6790)),
            ("Saint Vincent", (13.2528, -61.1971)),
            ("Antigua and Barbuda", (17.0608, -61.7964)),
            ("Saint Kitts and Nevis", (17.3578, -62.7820)),
            ("Dominica", (15.4150, -61.3710)),
        ].iter().cloned().collect();

        coords.get(country).copied()
    }

    /// Extract country names from text using keyword matching
    pub fn extract_from_text(text: &str) -> Vec<String> {
        let countries = vec![
            "Ukraine", "Russia", "Israel", "Gaza", "China", "Taiwan", "Iran", "Syria",
            "United States", "United Kingdom", "Germany", "France", "Turkey", "Saudi Arabia",
            "India", "Pakistan", "North Korea", "South Korea", "Japan", "Australia",
            "Brazil", "Mexico", "Canada", "Egypt", "South Africa", "Nigeria", "Ethiopia",
            "Venezuela", "Colombia", "Argentina", "Poland", "Italy", "Spain", "Netherlands",
            "Belgium", "Sweden", "Norway", "Denmark", "Finland", "Austria", "Switzerland",
            "Czech Republic", "Hungary", "Romania", "Bulgaria", "Greece", "Portugal",
            "Ireland", "New Zealand", "Singapore", "Malaysia", "Indonesia", "Thailand",
            "Vietnam", "Philippines", "Bangladesh", "Myanmar", "Afghanistan", "Iraq",
            "Lebanon", "Jordan", "Yemen", "Oman", "Qatar", "Kuwait", "Bahrain",
            "United Arab Emirates", "Morocco", "Algeria", "Tunisia", "Libya", "Sudan",
            "Somalia", "Kenya", "Tanzania", "Uganda", "Rwanda", "Ghana", "Senegal",
            "Mali", "Chad", "Angola", "Zimbabwe", "Zambia", "Mozambique", "Madagascar",
            "Cameroon", "Ivory Coast", "Niger", "Burkina Faso", "Guinea", "Malawi",
            "Bolivia", "Paraguay", "Uruguay", "Chile", "Peru", "Ecuador", "Guyana",
            "Suriname", "Panama", "Costa Rica", "Nicaragua", "Honduras", "Guatemala",
            "El Salvador", "Belize", "Cuba", "Haiti", "Dominican Republic", "Jamaica",
            "Trinidad and Tobago", "Barbados", "Saint Lucia", "Grenada", "Saint Vincent",
            "Antigua and Barbuda", "Saint Kitts and Nevis", "Dominica",
        ];

        let text_lower = text.to_lowercase();
        countries
            .into_iter()
            .filter(|c| text_lower.contains(&c.to_lowercase()))
            .map(|c| c.to_string())
            .collect()
    }
}

/// API request/response types
pub mod requests {
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    pub struct BriefRequest {
        pub country: String,
        pub interests: Vec<String>,
    }

    #[derive(Debug, Deserialize)]
    pub struct AlertRequest {
        pub country: String,
        pub threshold: i32,
    }

    #[derive(Debug, Deserialize)]
    pub struct UserUpdateRequest {
        pub interests: Option<Vec<String>>,
        pub countries: Option<Vec<String>>,
    }

    #[derive(Debug, Deserialize)]
    pub struct SyncRequest {
        pub since: i64,
    }
}

pub mod responses {
    use serde::Serialize;

    #[derive(Debug, Serialize)]
    pub struct ErrorResponse {
        pub error: String,
    }

    #[derive(Debug, Serialize)]
    pub struct SuccessResponse {
        pub success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub message: Option<String>,
    }

    #[derive(Debug, Serialize)]
    pub struct UserResponse {
        pub user_id: String,
        pub streak: i32,
        pub interests: Vec<String>,
        pub countries: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub is_new: Option<bool>,
    }
}
