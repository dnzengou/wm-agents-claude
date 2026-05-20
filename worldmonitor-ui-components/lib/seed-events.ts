import type { IntelEvent } from './api';

const NOW = () => Date.now();

export const SEED_EVENTS: IntelEvent[] = [
  // ── Geopolitical ──────────────────────────────────────────────────────────
  { id: 's-geo-01', country: 'Ukraine', lat: 50.45, lon: 30.52, severity: 9, headline: 'Frontline shelling in Donetsk region — civilian evacuations ordered by authorities', source: 'rss', domain: 'geopolitical', timestamp: NOW() - 900_000 },
  { id: 's-geo-02', country: 'Taiwan', lat: 25.03, lon: 121.56, severity: 8, headline: 'PLA exercises encircle Taiwan Strait — US carrier group repositioning to region', source: 'gdelt', domain: 'geopolitical', timestamp: NOW() - 3_600_000 },
  { id: 's-geo-03', country: 'Israel', lat: 31.77, lon: 35.21, severity: 8, headline: 'Ceasefire negotiations collapse as cross-border rocket fire resumes in Gaza', source: 'gdelt', domain: 'geopolitical', timestamp: NOW() - 7_200_000 },
  { id: 's-geo-04', country: 'Sudan', lat: 15.55, lon: 32.53, severity: 9, headline: 'RSF advance on Khartoum; UN warns of imminent humanitarian catastrophe', source: 'rss', domain: 'geopolitical', timestamp: NOW() - 10_800_000 },
  { id: 's-geo-05', country: 'North Korea', lat: 39.03, lon: 125.75, severity: 7, headline: 'DPRK launches two ballistic missiles into the East Sea; Japan issues alert', source: 'gdelt', domain: 'geopolitical', timestamp: NOW() - 14_400_000 },

  // ── Cyber ─────────────────────────────────────────────────────────────────
  { id: 's-cyber-01', country: 'United States', lat: 38.90, lon: -77.03, severity: 9, headline: 'Critical infrastructure SCADA systems breached in multi-state power grid attack', source: 'rss', domain: 'cyber', timestamp: NOW() - 1_800_000 },
  { id: 's-cyber-02', country: 'Germany', lat: 52.52, lon: 13.40, severity: 7, headline: 'Bundestag network intrusion attributed to APT28 — classified documents exfiltrated', source: 'rss', domain: 'cyber', timestamp: NOW() - 5_400_000 },
  { id: 's-cyber-03', country: 'India', lat: 28.61, lon: 77.20, severity: 6, headline: 'Ransomware hits 400 Indian hospitals; patient records encrypted across 12 states', source: 'rss', domain: 'cyber', timestamp: NOW() - 9_000_000 },
  { id: 's-cyber-04', country: 'Australia', lat: -35.28, lon: 149.12, severity: 7, headline: 'State-sponsored group compromises Australian Defence procurement systems', source: 'gdelt', domain: 'cyber', timestamp: NOW() - 12_600_000 },

  // ── Energy ────────────────────────────────────────────────────────────────
  { id: 's-energy-01', country: 'Russia', lat: 55.75, lon: 37.61, severity: 8, headline: 'Gazprom halts gas transit via Ukraine pipeline — European spot prices spike 40%', source: 'rss', domain: 'energy', timestamp: NOW() - 2_700_000 },
  { id: 's-energy-02', country: 'Saudi Arabia', lat: 24.68, lon: 46.72, severity: 7, headline: 'OPEC+ announces surprise 1 mbpd output cut effective immediately', source: 'rss', domain: 'energy', timestamp: NOW() - 6_300_000 },
  { id: 's-energy-03', country: 'Iran', lat: 35.69, lon: 51.38, severity: 8, headline: 'Strait of Hormuz: Iran seizes second oil tanker this week amid tensions', source: 'gdelt', domain: 'energy', timestamp: NOW() - 11_700_000 },

  // ── Climate ───────────────────────────────────────────────────────────────
  { id: 's-climate-01', country: 'Bangladesh', lat: 23.71, lon: 90.40, severity: 7, headline: 'Cyclone Remal: 5 million displaced, Bay of Bengal surge floods coastal zones', source: 'eonet', domain: 'climate', timestamp: NOW() - 4_500_000 },
  { id: 's-climate-02', country: 'Brazil', lat: -15.77, lon: -47.92, severity: 6, headline: 'Amazon drought — Rio Negro at lowest recorded level in 121 years', source: 'rss', domain: 'climate', timestamp: NOW() - 18_000_000 },
  { id: 's-climate-03', country: 'Pakistan', lat: 33.72, lon: 73.06, severity: 8, headline: 'Heatwave: 52°C in Jacobabad; grid collapse cuts power to 20 million residents', source: 'gdelt', domain: 'climate', timestamp: NOW() - 21_600_000 },

  // ── Wildfire ──────────────────────────────────────────────────────────────
  { id: 's-fire-01', country: 'Canada', lat: 53.53, lon: -113.49, severity: 7, headline: 'Fort McMurray wildfire complex forces 80,000 to evacuate; oil sands production offline', source: 'eonet', domain: 'wildfire', timestamp: NOW() - 3_150_000 },
  { id: 's-fire-02', country: 'Greece', lat: 38.00, lon: 23.73, severity: 6, headline: 'Attica region fires destroy 12,000 hectares; EU aerial assets deployed to Athens', source: 'eonet', domain: 'wildfire', timestamp: NOW() - 16_200_000 },

  // ── Nuclear ───────────────────────────────────────────────────────────────
  { id: 's-nuke-01', country: 'Ukraine', lat: 47.81, lon: 34.09, severity: 9, headline: 'IAEA: External power to Zaporizhzhia nuclear plant cut for 6th time this year', source: 'rss', domain: 'nuclear', timestamp: NOW() - 5_700_000 },
  { id: 's-nuke-02', country: 'Iran', lat: 32.99, lon: 59.56, severity: 8, headline: 'IAEA inspectors denied access to Natanz — uranium enrichment reaches 84%', source: 'gdelt', domain: 'nuclear', timestamp: NOW() - 19_800_000 },

  // ── Water ─────────────────────────────────────────────────────────────────
  { id: 's-water-01', country: 'Egypt', lat: 26.82, lon: 30.80, severity: 7, headline: 'GERD dam dispute: Ethiopia begins fourth filling — Egypt declares national water crisis', source: 'gdelt', domain: 'water', timestamp: NOW() - 8_100_000 },
  { id: 's-water-02', country: 'China', lat: 31.23, lon: 121.47, severity: 5, headline: 'Yangtze River drought forces hydro curtailments; semiconductor fabs on 40% power', source: 'rss', domain: 'water', timestamp: NOW() - 25_200_000 },

  // ── Critical Minerals ─────────────────────────────────────────────────────
  { id: 's-min-01', country: 'Democratic Republic of the Congo', lat: -4.32, lon: 15.32, severity: 7, headline: 'Armed group seizes Rubaya coltan mine; global cobalt supply chain at risk', source: 'rss', domain: 'critical_minerals', timestamp: NOW() - 13_500_000 },
  { id: 's-min-02', country: 'Chile', lat: -33.45, lon: -70.66, severity: 5, headline: 'Codelco strike halts 8% of global copper output; EV manufacturer supply chains disrupted', source: 'rss', domain: 'critical_minerals', timestamp: NOW() - 28_800_000 },

  // ── Ocean / Maritime ──────────────────────────────────────────────────────
  { id: 's-ocean-01', country: 'Yemen', lat: 15.35, lon: 44.20, severity: 8, headline: 'Houthi missile strike sinks bulk carrier in Red Sea — 23rd commercial vessel attacked this month', source: 'gdelt', domain: 'ocean', timestamp: NOW() - 7_650_000 },
  { id: 's-ocean-02', country: 'Philippines', lat: 9.31, lon: 118.23, severity: 6, headline: 'China Coast Guard water cannon targets Philippine resupply vessel at Scarborough Shoal', source: 'gdelt', domain: 'ocean', timestamp: NOW() - 23_400_000 },

  // ── Natural Disaster ──────────────────────────────────────────────────────
  { id: 's-nat-01', country: 'Japan', lat: 35.68, lon: 139.69, severity: 7, headline: 'M7.4 earthquake strikes Noto Peninsula; tsunami advisory issued for Pacific coastline', source: 'eonet', domain: 'natural', timestamp: NOW() - 2_250_000 },
  { id: 's-nat-02', country: 'Turkey', lat: 37.00, lon: 35.32, severity: 8, headline: 'M6.9 quake collapses 400+ buildings in Hatay province; rescue operations underway', source: 'eonet', domain: 'natural', timestamp: NOW() - 17_100_000 },

  // ── Deforestation ─────────────────────────────────────────────────────────
  { id: 's-defo-01', country: 'Indonesia', lat: -0.78, lon: 113.92, severity: 5, headline: 'Satellite data: 300,000 ha of Borneo primary forest cleared illegally in Q1', source: 'rss', domain: 'deforestation', timestamp: NOW() - 32_400_000 },

  // ── Uninsurability ────────────────────────────────────────────────────────
  { id: 's-unins-01', country: 'United States', lat: 25.77, lon: -80.19, severity: 6, headline: 'State Farm exits Florida homeowner market — 1.2M properties now effectively uninsurable', source: 'rss', domain: 'uninsurability', timestamp: NOW() - 36_000_000 },

  // ── HackerNews / YC — technology & systemic risk ──────────────────────────
  { id: 's-hn-01', country: 'United States', lat: 37.77, lon: -122.41, severity: 7, headline: 'HN: Critical zero-day in widely-used open-source SSH library actively exploited in the wild', source: 'rss', domain: 'cyber', timestamp: NOW() - 1_200_000, link: 'https://news.ycombinator.com' },
  { id: 's-hn-02', country: 'China', lat: 39.90, lon: 116.40, severity: 8, headline: 'HN: Chinese researchers demonstrate chip-level side-channel attack bypassing all existing mitigations', source: 'rss', domain: 'cyber', timestamp: NOW() - 4_200_000, link: 'https://news.ycombinator.com' },
  { id: 's-hn-03', country: 'United States', lat: 37.39, lon: -122.08, severity: 6, headline: 'YC Blog: AI model weight exfiltration — new threat vector as frontier labs scale compute clusters', source: 'rss', domain: 'cyber', timestamp: NOW() - 8_400_000, link: 'https://www.ycombinator.com/blog' },
  { id: 's-hn-04', country: 'Germany', lat: 51.16, lon: 10.45, severity: 5, headline: 'HN: EU AI Act enforcement begins — first audits target high-risk biometric and critical infrastructure systems', source: 'rss', domain: 'geopolitical', timestamp: NOW() - 15_000_000, link: 'https://news.ycombinator.com' },
  { id: 's-hn-05', country: 'United States', lat: 40.71, lon: -74.00, severity: 7, headline: 'HN: Algorithmic trading cascade triggers flash crash across 12 major indices simultaneously', source: 'rss', domain: 'energy', timestamp: NOW() - 20_000_000, link: 'https://news.ycombinator.com' },
  { id: 's-hn-06', country: 'Israel', lat: 32.08, lon: 34.78, severity: 6, headline: 'YC Blog: Startup raises $80M for grid-scale iron-air batteries after European energy crisis accelerates demand', source: 'rss', domain: 'energy', timestamp: NOW() - 26_000_000, link: 'https://www.ycombinator.com/blog' },
  { id: 's-hn-07', country: 'United Kingdom', lat: 51.50, lon: -0.12, severity: 7, headline: 'HN: GCHQ warns UK critical national infrastructure facing unprecedented AI-augmented spear-phishing campaign', source: 'rss', domain: 'cyber', timestamp: NOW() - 31_000_000, link: 'https://news.ycombinator.com' },
  { id: 's-hn-08', country: 'India', lat: 12.97, lon: 77.59, severity: 5, headline: 'HN: Open-source satellite imagery analysis reveals unreported industrial construction near disputed border zone', source: 'rss', domain: 'geopolitical', timestamp: NOW() - 40_000_000, link: 'https://news.ycombinator.com' },
];
