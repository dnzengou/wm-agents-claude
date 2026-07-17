import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ============================================================================
// WorldMonitor — Intelligence Platform 2.0
// Reverse-engineered lean rebuild. Single-file, production-grade artifact.
// Design system: Obsidian & Electric Cyan. Terminal-grade typography.
// ============================================================================

// ---------- DATA (seeded, deterministic, demo-ready) ------------------------
const CITIES = [
  { name: 'Kyiv',        lat: 50.45, lon: 30.52,  region: 'EU'  },
  { name: 'Taipei',      lat: 25.03, lon: 121.56, region: 'APAC'},
  { name: 'Tehran',      lat: 35.69, lon: 51.42,  region: 'MENA'},
  { name: 'Seoul',       lat: 37.57, lon: 126.98, region: 'APAC'},
  { name: 'Washington',  lat: 38.90, lon:-77.04,  region: 'NA'  },
  { name: 'Brussels',    lat: 50.85, lon: 4.35,   region: 'EU'  },
  { name: 'Mumbai',      lat: 19.08, lon: 72.88,  region: 'APAC'},
  { name: 'Cairo',       lat: 30.04, lon: 31.24,  region: 'MENA'},
  { name: 'Lagos',       lat: 6.52,  lon: 3.38,   region: 'AF'  },
  { name: 'São Paulo',   lat:-23.55, lon:-46.63,  region: 'SA'  },
  { name: 'Jakarta',     lat:-6.21,  lon: 106.84, region: 'APAC'},
  { name: 'Moscow',      lat: 55.75, lon: 37.62,  region: 'EU'  },
  { name: 'Tel Aviv',    lat: 32.08, lon: 34.78,  region: 'MENA'},
  { name: 'Ankara',      lat: 39.93, lon: 32.86,  region: 'MENA'},
  { name: 'London',      lat: 51.51, lon: -0.13,  region: 'EU'  },
  { name: 'Singapore',   lat: 1.35,  lon: 103.82, region: 'APAC'},
];

const AGENTS = [
  { id:'AG01', name:'SCRAPER',    role:'Data Collector', tasks: 1247, latency: 12, confidence: 94, status:'active'   },
  { id:'AG02', name:'ANALYZER',   role:'LLM Analyst',     tasks: 892,  latency: 34, confidence: 91, status:'thinking' },
  { id:'AG03', name:'CORRELATOR', role:'Signal Fusion',   tasks: 456,  latency: 18, confidence: 88, status:'active'   },
  { id:'AG04', name:'FORECASTER', role:'Predictor',       tasks: 203,  latency: 42, confidence: 79, status:'thinking' },
  { id:'AG05', name:'VALIDATOR',  role:'Fact Check',      tasks: 1102, latency: 8,  confidence: 96, status:'active'   },
  { id:'AG06', name:'NOTIFIER',   role:'Alert Router',    tasks: 67,   latency: 5,  confidence: 99, status:'idle'     },
  { id:'AG07', name:'SENTINEL',   role:'Anomaly Watch',   tasks: 334,  latency: 22, confidence: 85, status:'alert'    },
];

const SEED_EVENTS = [
  { agent:'AG07', severity:'critical', type:'CYBER',    title:'Coordinated probing against TLP:AMBER endpoints',     loc:'Tel Aviv',   lat:32.08, lon:34.78,  gated:true  },
  { agent:'AG01', severity:'high',     type:'MILITARY', title:'ADS-B: military transponder cluster over Baltic',      loc:'Baltic Sea', lat:57.5,  lon:19.0,   gated:false },
  { agent:'AG03', severity:'high',     type:'GEOPOL',   title:'Signal fusion: sanctions + capital outflow pattern',   loc:'Moscow',     lat:55.75, lon:37.62,  gated:true  },
  { agent:'AG02', severity:'medium',   type:'NEWS',     title:'Multi-source synthesis on semiconductor export curbs', loc:'Taipei',     lat:25.03, lon:121.56, gated:false },
  { agent:'AG04', severity:'medium',   type:'FORECAST', title:'72h risk index elevated for Eastern Med corridor',     loc:'Cairo',      lat:30.04, lon:31.24,  gated:true  },
  { agent:'AG05', severity:'low',      type:'NEWS',     title:'Validator: cross-referenced 14 reports, 3 dismissed',  loc:'London',     lat:51.51, lon:-0.13,  gated:false },
  { agent:'AG01', severity:'info',     type:'MARKET',   title:'Commodity baseline: WTI deviation within band',        loc:'Washington', lat:38.90, lon:-77.04, gated:false },
  { agent:'AG07', severity:'high',     type:'CYBER',    title:'Unusual DNS telemetry from APAC backbone',             loc:'Singapore',  lat:1.35,  lon:103.82, gated:true  },
  { agent:'AG03', severity:'medium',   type:'GEOPOL',   title:'Protest movement geographic correlation detected',     loc:'São Paulo',  lat:-23.55,lon:-46.63, gated:false },
  { agent:'AG02', severity:'low',      type:'NEWS',     title:'LLM summary: 47 sources consolidated, 2 conflicts',    loc:'Mumbai',     lat:19.08, lon:72.88,  gated:false },
];

const REASONING_STEPS = [
  { order:1, title:'INGEST',    status:'done',     conf:94, text:'Correlated ADS-B + AIS telemetry with OSINT reports across 3 sources.' },
  { order:2, title:'EXTRACT',   status:'done',     conf:91, text:'NER pipeline identified 12 named entities, 4 strategic locations.' },
  { order:3, title:'CORRELATE', status:'done',     conf:88, text:'Signal fusion weights applied. Pattern matches historical precedent t-180d.' },
  { order:4, title:'INFER',     status:'active',   conf:79, text:'Bayesian update: posterior probability of coordinated activity at 0.72.' },
  { order:5, title:'VALIDATE',  status:'pending',  conf:null, text:'Awaiting cross-source confirmation from 2 independent feeds.' },
  { order:6, title:'PUBLISH',   status:'pending',  conf:null, text:'Alert will route if posterior exceeds 0.85 threshold.' },
];

// ---------- UTILITIES -------------------------------------------------------
// Mercator projection — good enough for a schematic world view.
const projectMercator = (lat, lon, w, h) => {
  const x = (lon + 180) * (w / 360);
  const latRad = lat * Math.PI / 180;
  const mercN = Math.log(Math.tan((Math.PI / 4) + (latRad / 2)));
  const y = (h / 2) - (w * mercN / (2 * Math.PI));
  return { x, y };
};

const formatRelative = (secondsAgo) => {
  if (secondsAgo < 60) return `${secondsAgo}s`;
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo/60)}m`;
  return `${Math.floor(secondsAgo/3600)}h`;
};

const SEVERITY = {
  critical: { label:'CRIT', bg:'rgba(255,62,62,.14)',  fg:'#FF6B6B',  bar:'#FF3E3E' },
  high:     { label:'HIGH', bg:'rgba(255,184,0,.12)',  fg:'#FFC43D',  bar:'#FFB800' },
  medium:   { label:'MED',  bg:'rgba(0,245,255,.10)',  fg:'#7FE9F3',  bar:'#00F5FF' },
  low:      { label:'LOW',  bg:'rgba(110,160,210,.10)',fg:'#9CB4CF',  bar:'#6EA0D2' },
  info:     { label:'INFO', bg:'rgba(255,255,255,.06)',fg:'#8E9BAE',  bar:'#8E9BAE' },
};

// ---------- ATOMS -----------------------------------------------------------
const Pulse = ({ status='active', size=8 }) => {
  const color = {
    active:   '#00F5FF',
    thinking: '#FFB800',
    alert:    '#FF3E3E',
    idle:     '#4B5A70',
  }[status];
  const dur = { active:'2s', thinking:'1s', alert:'.7s', idle:'0s' }[status];
  return (
    <span
      style={{
        display:'inline-block', width:size, height:size, borderRadius:'50%',
        background:color, boxShadow: status==='idle' ? 'none' : `0 0 ${size*1.4}px ${color}`,
        animation: status==='idle' ? 'none' : `wm-pulse ${dur} ease-in-out infinite`,
      }}
    />
  );
};

const Badge = ({ tone='default', children, mono=true }) => {
  const tones = {
    default: { bg:'rgba(255,255,255,.05)', fg:'#A8B4C8', bd:'rgba(255,255,255,.08)' },
    cyan:    { bg:'rgba(0,245,255,.08)',    fg:'#00F5FF', bd:'rgba(0,245,255,.25)' },
    amber:   { bg:'rgba(255,184,0,.08)',    fg:'#FFB800', bd:'rgba(255,184,0,.25)' },
    red:     { bg:'rgba(255,62,62,.08)',    fg:'#FF6B6B', bd:'rgba(255,62,62,.25)' },
    green:   { bg:'rgba(0,230,118,.08)',    fg:'#00E676', bd:'rgba(0,230,118,.25)' },
  };
  const t = tones[tone] || tones.default;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'2px 6px', fontSize:10, letterSpacing:'.08em',
      fontFamily: mono ? 'var(--mono)' : 'var(--body)',
      background:t.bg, color:t.fg, border:`1px solid ${t.bd}`,
      textTransform:'uppercase', fontWeight:500, borderRadius:2,
    }}>{children}</span>
  );
};

// ---------- MAP -------------------------------------------------------------
const WorldMap = ({ events, hoveredEventId, setHoveredEventId, onEventClick }) => {
  const ref = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 480 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const r = new ResizeObserver(entries => {
      for (const e of entries) {
        setDims({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    if (ref.current) r.observe(ref.current);
    return () => r.disconnect();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  // Build an arc between two points on the map (for connection pulses).
  const arcPath = (a, b, lift=40) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - lift;
    return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
  };

  // Pick a few "active corridors" — arcs between event locations.
  const corridors = useMemo(() => {
    const pts = events.slice(0, 6).map(e => ({
      ...projectMercator(e.lat, e.lon, dims.w, dims.h),
      id: e.id, severity: e.severity,
    }));
    const out = [];
    for (let i = 0; i < pts.length - 1; i += 2) {
      if (pts[i+1]) out.push({ a: pts[i], b: pts[i+1], severity: pts[i].severity, id:`c-${i}` });
    }
    return out;
  }, [events, dims.w, dims.h]);

  return (
    <div ref={ref} style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden' }}>
      {/* Grid backdrop */}
      <svg width="100%" height="100%" style={{ position:'absolute', inset:0 }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,245,255,.04)" strokeWidth="1"/>
          </pattern>
          <pattern id="grid-fine" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(0,245,255,.02)" strokeWidth=".5"/>
          </pattern>
          <radialGradient id="spotlight" cx="50%" cy="50%" r="60%">
            <stop offset="0%"  stopColor="rgba(0,245,255,.08)"/>
            <stop offset="100%" stopColor="rgba(0,245,255,0)"/>
          </radialGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-fine)"/>
        <rect width="100%" height="100%" fill="url(#grid)"/>
        <rect width="100%" height="100%" fill="url(#spotlight)"/>

        {/* Schematic continent silhouettes (minimal, hand-shaped) */}
        <g fill="rgba(0,245,255,.035)" stroke="rgba(0,245,255,.12)" strokeWidth=".8">
          {/* N America */}
          <path d={`M ${dims.w*.08} ${dims.h*.22} Q ${dims.w*.18} ${dims.h*.15}, ${dims.w*.28} ${dims.h*.28} L ${dims.w*.30} ${dims.h*.52} Q ${dims.w*.22} ${dims.h*.58}, ${dims.w*.15} ${dims.h*.50} L ${dims.w*.10} ${dims.h*.38} Z`}/>
          {/* S America */}
          <path d={`M ${dims.w*.24} ${dims.h*.55} Q ${dims.w*.30} ${dims.h*.68}, ${dims.w*.28} ${dims.h*.88} Q ${dims.w*.22} ${dims.h*.80}, ${dims.w*.22} ${dims.h*.62} Z`}/>
          {/* Europe */}
          <path d={`M ${dims.w*.46} ${dims.h*.22} Q ${dims.w*.54} ${dims.h*.18}, ${dims.w*.56} ${dims.h*.30} Q ${dims.w*.50} ${dims.h*.36}, ${dims.w*.46} ${dims.h*.32} Z`}/>
          {/* Africa */}
          <path d={`M ${dims.w*.48} ${dims.h*.40} Q ${dims.w*.58} ${dims.h*.42}, ${dims.w*.56} ${dims.h*.70} Q ${dims.w*.48} ${dims.h*.68}, ${dims.w*.46} ${dims.h*.48} Z`}/>
          {/* Asia */}
          <path d={`M ${dims.w*.58} ${dims.h*.22} Q ${dims.w*.82} ${dims.h*.18}, ${dims.w*.86} ${dims.h*.42} Q ${dims.w*.72} ${dims.h*.48}, ${dims.w*.60} ${dims.h*.38} Z`}/>
          {/* Oceania */}
          <path d={`M ${dims.w*.80} ${dims.h*.65} Q ${dims.w*.90} ${dims.h*.68}, ${dims.w*.88} ${dims.h*.78} Q ${dims.w*.80} ${dims.h*.76}, ${dims.w*.78} ${dims.h*.70} Z`}/>
        </g>

        {/* Corridors (arcs) with animated dashes */}
        {corridors.map((c, i) => {
          const col = SEVERITY[c.severity]?.bar || '#00F5FF';
          return (
            <g key={c.id}>
              <path d={arcPath(c.a, c.b, 60)} fill="none" stroke={col} strokeWidth="1" opacity=".35"/>
              <path d={arcPath(c.a, c.b, 60)} fill="none" stroke={col} strokeWidth="1.5"
                strokeDasharray="4 120"
                strokeDashoffset={-(tick*4 + i*30)}
                filter="url(#glow)"/>
            </g>
          );
        })}

        {/* Event dots */}
        {events.map(e => {
          const p = projectMercator(e.lat, e.lon, dims.w, dims.h);
          const sev = SEVERITY[e.severity];
          const isHover = hoveredEventId === e.id;
          const r = e.severity === 'critical' ? 7 : e.severity === 'high' ? 5 : 4;
          const phase = (tick + e.id.charCodeAt(0)) % 60;
          const ringR = r + 4 + (phase / 60) * 18;
          const ringO = 1 - (phase / 60);
          return (
            <g key={e.id} style={{ cursor:'pointer' }}
               onMouseEnter={() => setHoveredEventId(e.id)}
               onMouseLeave={() => setHoveredEventId(null)}
               onClick={() => onEventClick(e)}>
              {/* Expanding ring */}
              <circle cx={p.x} cy={p.y} r={ringR} fill="none" stroke={sev.bar} strokeWidth=".8" opacity={ringO*.7}/>
              {/* Core dot */}
              <circle cx={p.x} cy={p.y} r={r+2} fill={sev.bar} opacity=".25"/>
              <circle cx={p.x} cy={p.y} r={r} fill={sev.bar} filter="url(#glow)"/>
              {/* Hover label */}
              {isHover && (
                <g>
                  <rect x={p.x+10} y={p.y-26} width="170" height="42" fill="#05070A" stroke={sev.bar} strokeWidth="1" opacity=".98"/>
                  <text x={p.x+18} y={p.y-12} fill={sev.fg} fontSize="9" fontFamily="var(--mono)" letterSpacing=".1em">{e.loc.toUpperCase()} · {sev.label}</text>
                  <text x={p.x+18} y={p.y+3} fill="#E8EEF6" fontSize="10" fontFamily="var(--mono)">{e.agent}</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Crosshair at center (subtle) */}
        <line x1={dims.w/2} y1="0" x2={dims.w/2} y2={dims.h} stroke="rgba(0,245,255,.05)" strokeWidth=".5"/>
        <line x1="0" y1={dims.h/2} x2={dims.w} y2={dims.h/2} stroke="rgba(0,245,255,.05)" strokeWidth=".5"/>
      </svg>

      {/* Corner frames */}
      <CornerBrackets />

      {/* Top-left metadata overlay */}
      <div style={{
        position:'absolute', top:14, left:14, fontFamily:'var(--mono)', fontSize:10,
        letterSpacing:'.12em', color:'rgba(232,238,246,.45)', pointerEvents:'none',
      }}>
        <div style={{color:'#00F5FF', fontSize:9, marginBottom:4}}>WM://LIVE/GLOBAL</div>
        <div>PROJECTION · MERCATOR</div>
        <div>FEED · {events.length} ACTIVE</div>
      </div>

      {/* Bottom-right coordinates */}
      <div style={{
        position:'absolute', bottom:14, right:14, fontFamily:'var(--mono)', fontSize:10,
        letterSpacing:'.1em', color:'rgba(232,238,246,.35)', textAlign:'right',
      }}>
        <div>LAT 00°00'00"N</div>
        <div>LON 000°00'00"E</div>
      </div>
    </div>
  );
};

const CornerBrackets = () => {
  const s = { position:'absolute', width:18, height:18, borderColor:'rgba(0,245,255,.35)' };
  return (
    <>
      <div style={{...s, top:8, left:8, borderTop:'1px solid', borderLeft:'1px solid'}}/>
      <div style={{...s, top:8, right:8, borderTop:'1px solid', borderRight:'1px solid'}}/>
      <div style={{...s, bottom:8, left:8, borderBottom:'1px solid', borderLeft:'1px solid'}}/>
      <div style={{...s, bottom:8, right:8, borderBottom:'1px solid', borderRight:'1px solid'}}/>
    </>
  );
};

// ---------- HEADER ---------------------------------------------------------
const Header = ({ agentsActive, latency, alerts, tier, setCmdOpen }) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const utc = now.toISOString().replace('T',' ').split('.')[0] + ' UTC';

  return (
    <header style={{
      height:52, borderBottom:'1px solid var(--border)', background:'var(--void)',
      display:'flex', alignItems:'center', padding:'0 16px', gap:24,
      position:'relative', zIndex:10,
    }}>
      {/* Logo mark */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{
          width:28, height:28, position:'relative',
          background:'linear-gradient(135deg, #00F5FF 0%, #0066FF 100%)',
          clipPath:'polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%)',
        }}>
          <div style={{
            position:'absolute', inset:2, background:'var(--obsidian)',
            clipPath:'polygon(0 0, 100% 0, 100% 68%, 68% 100%, 0 100%)',
          }}/>
          <div style={{
            position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'var(--display)', fontSize:14, color:'#00F5FF', fontWeight:600,
          }}>W</div>
        </div>
        <div>
          <div style={{ fontFamily:'var(--display)', fontSize:15, letterSpacing:'.02em', color:'#E8EEF6', fontWeight:500 }}>
            WorldMonitor
          </div>
          <div style={{ fontFamily:'var(--mono)', fontSize:9, letterSpacing:'.15em', color:'rgba(232,238,246,.4)' }}>
            INTELLIGENCE · v2.0
          </div>
        </div>
      </div>

      {/* Search / command bar */}
      <button onClick={() => setCmdOpen(true)} style={{
        flex:1, maxWidth:520, height:32, background:'var(--surface)',
        border:'1px solid var(--border)', display:'flex', alignItems:'center',
        padding:'0 10px', gap:10, cursor:'pointer',
        fontFamily:'var(--mono)', fontSize:11, color:'rgba(232,238,246,.5)', textAlign:'left',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <span style={{flex:1}}>Search entities, regions, agents…</span>
        <kbd style={{
          padding:'1px 6px', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.08)',
          fontSize:10, fontFamily:'var(--mono)', color:'rgba(232,238,246,.7)',
        }}>⌘K</kbd>
      </button>

      {/* Telemetry */}
      <div style={{ display:'flex', alignItems:'center', gap:20, fontFamily:'var(--mono)', fontSize:11 }}>
        <Metric label="AGENTS" value={agentsActive} tone="cyan"/>
        <Metric label="LAT"    value={`${latency}ms`} tone={latency<20?'green':'amber'}/>
        <Metric label="ALERT"  value={alerts} tone={alerts>0?'red':'default'}/>
      </div>

      <div style={{ height:20, width:1, background:'var(--border)' }}/>

      <div style={{ fontFamily:'var(--mono)', fontSize:10, letterSpacing:'.1em', color:'rgba(232,238,246,.5)' }}>
        {utc}
      </div>

      {/* Tier */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <Badge tone={tier==='ENTERPRISE'?'cyan':tier==='PRO'?'amber':'default'}>{tier}</Badge>
        <div style={{
          width:30, height:30, borderRadius:'50%',
          background:'linear-gradient(135deg,#243242,#1A2332)',
          border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center',
          fontFamily:'var(--mono)', fontSize:11, color:'#00F5FF',
        }}>AS</div>
      </div>
    </header>
  );
};

const Metric = ({ label, value, tone='default' }) => {
  const color = {
    cyan:'#00F5FF', green:'#00E676', amber:'#FFB800', red:'#FF6B6B', default:'#E8EEF6',
  }[tone];
  return (
    <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
      <span style={{ color:'rgba(232,238,246,.4)', fontSize:10, letterSpacing:'.1em' }}>{label}</span>
      <span style={{ color, fontWeight:500 }}>{value}</span>
    </div>
  );
};

// ---------- LIVE FEED (left column) ---------------------------------------
const LiveFeed = ({ events, tier, onUpgrade, onSelect, selectedId }) => {
  return (
    <aside style={{
      width:340, borderRight:'1px solid var(--border)', background:'var(--void)',
      display:'flex', flexDirection:'column',
    }}>
      <PanelHeader title="GLOBAL LIVE FEED" subtitle={`${events.length} signals · streaming`}>
        <Pulse status="active" size={6}/>
      </PanelHeader>

      <div style={{ overflowY:'auto', flex:1 }} className="wm-scroll">
        {events.map((e, i) => {
          const sev = SEVERITY[e.severity];
          const secondsAgo = Math.floor((Date.now() - e.timestamp) / 1000);
          const isGated = e.gated && tier === 'FREE';
          const selected = selectedId === e.id;
          return (
            <div key={e.id}
              onClick={() => onSelect(e)}
              style={{
                padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.03)',
                borderLeft: selected ? `2px solid ${sev.bar}` : '2px solid transparent',
                background: selected ? 'rgba(0,245,255,.04)' : 'transparent',
                cursor:'pointer', transition:'background .15s',
                position:'relative',
              }}
              onMouseEnter={ev => { if (!selected) ev.currentTarget.style.background = 'rgba(255,255,255,.02)'; }}
              onMouseLeave={ev => { if (!selected) ev.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                <Badge tone={e.severity==='critical'?'red':e.severity==='high'?'amber':e.severity==='medium'?'cyan':'default'}>
                  {sev.label}
                </Badge>
                <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'#00F5FF', letterSpacing:'.1em' }}>
                  {e.agent}
                </span>
                <span style={{ flex:1 }}/>
                <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'rgba(232,238,246,.4)' }}>
                  {formatRelative(secondsAgo)}
                </span>
              </div>

              <div style={{
                fontSize:12, color: isGated ? 'rgba(232,238,246,.35)' : '#E8EEF6',
                lineHeight:1.45, filter: isGated ? 'blur(4px)' : 'none',
                userSelect: isGated ? 'none' : 'auto', pointerEvents: isGated ? 'none' : 'auto',
              }}>
                {e.title}
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'rgba(232,238,246,.5)' }}>
                  ◉ {e.loc}
                </span>
                <span style={{ flex:1 }}/>
                {isGated && (
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onUpgrade(); }}
                    style={{
                      fontFamily:'var(--mono)', fontSize:9, letterSpacing:'.1em',
                      color:'#FFB800', background:'rgba(255,184,0,.08)',
                      border:'1px solid rgba(255,184,0,.3)',
                      padding:'2px 6px', cursor:'pointer',
                    }}>
                    ↗ UNLOCK
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        padding:'10px 14px', borderTop:'1px solid var(--border)',
        fontFamily:'var(--mono)', fontSize:10, color:'rgba(232,238,246,.4)',
        display:'flex', justifyContent:'space-between',
      }}>
        <span>WSS · CONNECTED</span>
        <span>+{Math.floor(Math.random()*3)+1}/s</span>
      </div>
    </aside>
  );
};

// ---------- AGENT GRAPH (right column, top) -------------------------------
const AgentGraph = ({ agents, selectedAgent, setSelectedAgent }) => {
  return (
    <div style={{ padding:'14px', borderBottom:'1px solid var(--border)' }}>
      <PanelHeader inline title="AGENT LATTICE" subtitle={`${agents.filter(a=>a.status==='active').length}/${agents.length} active`}/>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6, marginTop:10 }}>
        {agents.map(a => {
          const isSel = selectedAgent === a.id;
          return (
            <button key={a.id}
              onClick={() => setSelectedAgent(isSel ? null : a.id)}
              style={{
                padding:'8px 6px', background: isSel ? 'rgba(0,245,255,.08)' : 'var(--surface)',
                border: `1px solid ${isSel ? '#00F5FF' : 'var(--border)'}`,
                cursor:'pointer', textAlign:'left', position:'relative',
                transition:'all .15s',
              }}>
              <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:2 }}>
                <Pulse status={a.status} size={5}/>
                <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'#00F5FF' }}>{a.id}</span>
              </div>
              <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'#E8EEF6', fontWeight:500 }}>
                {a.name}
              </div>
              <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'rgba(232,238,246,.4)', marginTop:2 }}>
                {a.latency}ms · {a.confidence}%
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---------- REASONING TRACE -----------------------------------------------
const ReasoningTrace = ({ steps }) => {
  const doneCount = steps.filter(s => s.status === 'done').length;
  const pct = Math.round((doneCount / steps.length) * 100);
  return (
    <div style={{ padding:'14px', borderBottom:'1px solid var(--border)', flex:1, overflow:'auto' }} className="wm-scroll">
      <PanelHeader inline title="REASONING TRACE" subtitle="chain-of-thought · focal event">
        <Badge tone="cyan">{pct}%</Badge>
      </PanelHeader>

      {/* Progress bar */}
      <div style={{ marginTop:10, height:2, background:'rgba(255,255,255,.06)', position:'relative' }}>
        <div style={{
          position:'absolute', inset:0, right:`${100-pct}%`,
          background:'linear-gradient(90deg, transparent, #00F5FF)',
          boxShadow:'0 0 8px rgba(0,245,255,.5)',
          transition:'all .5s',
        }}/>
      </div>

      <div style={{ marginTop:12 }}>
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          const isActive = s.status === 'active';
          const isDone = s.status === 'done';
          const color = isDone ? '#00E676' : isActive ? '#00F5FF' : 'rgba(255,255,255,.2)';
          return (
            <div key={s.order} style={{ display:'flex', gap:10, marginBottom: isLast ? 0 : 10 }}>
              {/* Timeline */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:2 }}>
                <div style={{
                  width:16, height:16, borderRadius:'50%',
                  border:`1px solid ${color}`,
                  background: isDone ? color : 'var(--obsidian)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  boxShadow: isActive ? `0 0 10px ${color}` : 'none',
                  animation: isActive ? 'wm-pulse 1.5s ease-in-out infinite' : 'none',
                }}>
                  {isDone && <svg width="8" height="8" viewBox="0 0 12 12"><path d="M2 6 L5 9 L10 3" stroke="var(--obsidian)" strokeWidth="2" fill="none"/></svg>}
                  {isActive && <div style={{ width:4, height:4, background:color, borderRadius:'50%' }}/>}
                </div>
                {!isLast && <div style={{ width:1, flex:1, background: isDone ? '#00E676' : 'rgba(255,255,255,.1)', marginTop:2, minHeight:18 }}/>}
              </div>

              {/* Content */}
              <div style={{ flex:1, paddingBottom: isLast ? 0 : 4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                  <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'rgba(232,238,246,.4)' }}>
                    STEP_{String(s.order).padStart(2,'0')}
                  </span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:10, color, letterSpacing:'.08em' }}>
                    {s.title}
                  </span>
                  {s.conf !== null && (
                    <span style={{ marginLeft:'auto', fontFamily:'var(--mono)', fontSize:9, color: s.conf > 85 ? '#00E676' : '#FFB800' }}>
                      conf {s.conf}
                    </span>
                  )}
                </div>
                <div style={{ fontSize:11, color: isDone ? 'rgba(232,238,246,.7)' : isActive ? '#E8EEF6' : 'rgba(232,238,246,.35)', lineHeight:1.45 }}>
                  {s.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------- UPGRADE CARD --------------------------------------------------
const UpgradeCard = ({ onUpgrade }) => (
  <div style={{
    margin:14, padding:14,
    background:'linear-gradient(135deg, rgba(0,245,255,.06), rgba(0,102,255,.03))',
    border:'1px solid rgba(0,245,255,.25)', position:'relative', overflow:'hidden',
  }}>
    <div style={{
      position:'absolute', top:-20, right:-20, width:80, height:80,
      background:'radial-gradient(circle, rgba(0,245,255,.2), transparent 70%)',
      pointerEvents:'none',
    }}/>
    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
      <Badge tone="cyan">ENTERPRISE</Badge>
      <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'#00F5FF' }}>UNLOCK FULL COT + API</span>
    </div>
    <div style={{ fontFamily:'var(--display)', fontSize:14, color:'#E8EEF6', marginBottom:4 }}>
      See every signal. Build every alert.
    </div>
    <div style={{ fontSize:11, color:'rgba(232,238,246,.6)', lineHeight:1.45, marginBottom:10 }}>
      PII-unlocked feeds · custom agents · webhook routing · 99.95% SLA.
    </div>
    <button onClick={onUpgrade} style={{
      width:'100%', height:32, background:'#00F5FF', color:'var(--obsidian)',
      border:'none', fontFamily:'var(--mono)', fontSize:11, letterSpacing:'.1em',
      fontWeight:600, cursor:'pointer',
    }}>
      UPGRADE →
    </button>
  </div>
);

// ---------- PANEL HEADER --------------------------------------------------
const PanelHeader = ({ title, subtitle, children, inline=false }) => (
  <div style={{
    padding: inline ? 0 : '12px 14px',
    borderBottom: inline ? 'none' : '1px solid var(--border)',
    display:'flex', alignItems:'center', gap:8,
  }}>
    <div style={{ flex:1 }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'#E8EEF6', letterSpacing:'.12em', fontWeight:500 }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'rgba(232,238,246,.45)', letterSpacing:'.05em', marginTop:2 }}>
          {subtitle}
        </div>
      )}
    </div>
    {children}
  </div>
);

// ---------- COMMAND PALETTE -----------------------------------------------
const CommandPalette = ({ open, onClose }) => {
  const [q, setQ] = useState('');
  const commands = [
    { id:'c1', cat:'NAV',    title:'Go to Global Feed',        shortcut:'G F' },
    { id:'c2', cat:'NAV',    title:'Open Agent Lattice',       shortcut:'G A' },
    { id:'c3', cat:'ACTION', title:'Create watchlist',         shortcut:'⌘ N' },
    { id:'c4', cat:'ACTION', title:'Export focal event',       shortcut:'⌘ E' },
    { id:'c5', cat:'ACTION', title:'Route alert to webhook',   shortcut:'⌘ W' },
    { id:'c6', cat:'FILTER', title:'Severity: CRITICAL only' },
    { id:'c7', cat:'FILTER', title:'Region: MENA'              },
    { id:'c8', cat:'VIEW',   title:'Toggle dense view',        shortcut:'⌘ D' },
    { id:'c9', cat:'VIEW',   title:'Isolate agent AG07'        },
  ];
  const filtered = useMemo(() => {
    if (!q) return commands;
    const s = q.toLowerCase();
    return commands.filter(c => c.title.toLowerCase().includes(s) || c.cat.toLowerCase().includes(s));
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(5,7,10,.75)', backdropFilter:'blur(4px)',
      zIndex:100, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'12vh',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:560, maxWidth:'90vw', background:'var(--void)', border:'1px solid rgba(0,245,255,.25)',
        boxShadow:'0 20px 60px rgba(0,0,0,.6), 0 0 40px rgba(0,245,255,.1)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'#00F5FF', letterSpacing:'.15em' }}>WM://</span>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Type a command or search…"
            style={{
              flex:1, background:'transparent', border:'none', outline:'none',
              color:'#E8EEF6', fontSize:14, fontFamily:'var(--mono)',
            }}/>
          <kbd style={{ padding:'2px 6px', fontSize:10, fontFamily:'var(--mono)', background:'rgba(255,255,255,.06)', color:'rgba(232,238,246,.5)' }}>ESC</kbd>
        </div>
        <div style={{ maxHeight:380, overflowY:'auto' }} className="wm-scroll">
          {filtered.length === 0 && (
            <div style={{ padding:'30px', textAlign:'center', fontFamily:'var(--mono)', fontSize:11, color:'rgba(232,238,246,.4)' }}>
              NO RESULTS
            </div>
          )}
          {filtered.map((c, i) => (
            <div key={c.id} style={{
              padding:'10px 16px', display:'flex', alignItems:'center', gap:10,
              borderBottom:'1px solid rgba(255,255,255,.03)', cursor:'pointer',
              background: i === 0 ? 'rgba(0,245,255,.04)' : 'transparent',
            }}>
              <Badge tone="default">{c.cat}</Badge>
              <span style={{ flex:1, fontSize:12, color:'#E8EEF6' }}>{c.title}</span>
              {c.shortcut && (
                <kbd style={{ padding:'2px 6px', fontSize:10, fontFamily:'var(--mono)', background:'rgba(255,255,255,.06)', color:'rgba(232,238,246,.5)' }}>
                  {c.shortcut}
                </kbd>
              )}
            </div>
          ))}
        </div>
        <div style={{
          padding:'8px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:14,
          fontFamily:'var(--mono)', fontSize:9, color:'rgba(232,238,246,.4)', letterSpacing:'.08em',
        }}>
          <span>↑↓ NAVIGATE</span>
          <span>↵ SELECT</span>
          <span>ESC CLOSE</span>
        </div>
      </div>
    </div>
  );
};

// ---------- FOCAL EVENT BAR ------------------------------------------------
const FocalEventBar = ({ event }) => {
  if (!event) return null;
  const sev = SEVERITY[event.severity];
  return (
    <div style={{
      borderTop:'1px solid var(--border)', background:'var(--void)',
      padding:'10px 16px', display:'flex', alignItems:'center', gap:14, height:44,
    }}>
      <div style={{ width:2, height:24, background:sev.bar, boxShadow:`0 0 8px ${sev.bar}` }}/>
      <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'rgba(232,238,246,.5)', letterSpacing:'.1em' }}>FOCAL</span>
      <Badge tone={event.severity==='critical'?'red':event.severity==='high'?'amber':'cyan'}>{sev.label}</Badge>
      <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'#00F5FF' }}>{event.agent}</span>
      <span style={{ fontSize:12, color:'#E8EEF6', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        {event.title}
      </span>
      <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'rgba(232,238,246,.5)' }}>◉ {event.loc}</span>
      <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'rgba(232,238,246,.5)' }}>{event.type}</span>
    </div>
  );
};

// ---------- ROOT -----------------------------------------------------------
export default function WorldMonitor() {
  const [tier, setTier] = useState('FREE');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [hoveredEventId, setHoveredEventId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);

  // Build live events from seed, with rolling timestamps.
  const [events, setEvents] = useState(() =>
    SEED_EVENTS.map((e, i) => ({
      ...e,
      id: `evt-${i}`,
      timestamp: Date.now() - (i * 120 + Math.floor(Math.random()*60)) * 1000,
    }))
  );

  // Simulate new events trickling in.
  useEffect(() => {
    const id = setInterval(() => {
      setEvents(prev => {
        const base = SEED_EVENTS[Math.floor(Math.random()*SEED_EVENTS.length)];
        const fresh = {
          ...base,
          id: `evt-${Date.now()}`,
          timestamp: Date.now(),
        };
        return [fresh, ...prev].slice(0, 20);
      });
    }, 9000);
    return () => clearInterval(id);
  }, []);

  // ⌘K handler
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const focalEvent = events.find(e => e.id === selectedEventId) || events[0];
  const alertsCount = events.filter(e => e.severity === 'critical' || e.severity === 'high').length;
  const agentsActive = AGENTS.filter(a => a.status === 'active' || a.status === 'thinking').length;

  const handleUpgrade = useCallback(() => {
    setTier(t => t === 'FREE' ? 'PRO' : t === 'PRO' ? 'ENTERPRISE' : 'FREE');
  }, []);

  return (
    <>
      <style>{`
        :root {
          --obsidian: #05070A;
          --void: #0A0E14;
          --void-light: #111820;
          --surface: #1A2332;
          --surface-elevated: #243242;
          --border: rgba(255,255,255,.06);
          --border-strong: rgba(255,255,255,.1);
          --display: 'IBM Plex Serif', 'Playfair Display', Georgia, serif;
          --mono: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
          --body: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Serif:wght@400;500;600&display=swap');

        * { box-sizing: border-box; }
        body, html, #root { margin:0; padding:0; background:var(--obsidian); color:#E8EEF6; font-family:var(--body); }

        @keyframes wm-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .55; transform: scale(1.15); }
        }

        .wm-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .wm-scroll::-webkit-scrollbar-track { background: transparent; }
        .wm-scroll::-webkit-scrollbar-thumb { background: rgba(0,245,255,.15); border-radius: 3px; }
        .wm-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,245,255,.3); }

        .wm-scanline::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(0deg, rgba(0,245,255,.015) 0 1px, transparent 1px 4px);
          z-index: 1;
        }
      `}</style>

      <div style={{
        height:'100vh', width:'100vw', background:'var(--obsidian)',
        color:'#E8EEF6', fontFamily:'var(--body)', overflow:'hidden',
        display:'flex', flexDirection:'column',
      }}>
        <Header
          agentsActive={agentsActive}
          latency={9}
          alerts={alertsCount}
          tier={tier}
          setCmdOpen={setCmdOpen}
        />

        <div style={{ flex:1, display:'flex', minHeight:0 }}>
          <LiveFeed
            events={events}
            tier={tier}
            onUpgrade={handleUpgrade}
            onSelect={e => setSelectedEventId(e.id)}
            selectedId={selectedEventId}
          />

          {/* Center: map */}
          <main style={{ flex:1, position:'relative', background:'var(--obsidian)' }} className="wm-scanline">
            <WorldMap
              events={events.slice(0, 12)}
              hoveredEventId={hoveredEventId}
              setHoveredEventId={setHoveredEventId}
              onEventClick={e => setSelectedEventId(e.id)}
            />
            <FocalEventBar event={focalEvent}/>
          </main>

          {/* Right column */}
          <aside style={{
            width:360, borderLeft:'1px solid var(--border)', background:'var(--void)',
            display:'flex', flexDirection:'column',
          }}>
            <AgentGraph agents={AGENTS} selectedAgent={selectedAgent} setSelectedAgent={setSelectedAgent}/>
            <ReasoningTrace steps={REASONING_STEPS}/>
            {tier !== 'ENTERPRISE' && <UpgradeCard onUpgrade={handleUpgrade}/>}
          </aside>
        </div>

        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)}/>
      </div>
    </>
  );
}
