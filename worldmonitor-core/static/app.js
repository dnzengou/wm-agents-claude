import { h, render } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import html from 'htm/preact';

const htmlx = html;

// ============== API Client ==============
const API = {
    baseUrl: '',
    
    async getIntelligence() {
        const res = await fetch(`${this.baseUrl}/api/intelligence`);
        if (!res.ok) throw new Error('Failed to fetch intelligence');
        return res.json();
    },
    
    async getBrief(country) {
        const res = await fetch(`${this.baseUrl}/api/brief`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, interests: [] })
        });
        if (!res.ok) throw new Error('Failed to generate brief');
        return res.json();
    },
    
    async getUser() {
        const res = await fetch(`${this.baseUrl}/api/user`, {
            headers: { 'Authorization': 'Bearer anonymous' }
        });
        if (!res.ok) throw new Error('Failed to get user');
        return res.json();
    },
    
    async updateUser(data) {
        const res = await fetch(`${this.baseUrl}/api/user`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer anonymous'
            },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to update user');
        return res.json();
    },
    
    async sync(since) {
        const res = await fetch(`${this.baseUrl}/api/sync?since=${since}`);
        if (!res.ok) throw new Error('Failed to sync');
        return res.json();
    },
    
    async createAlert(country, threshold = 5) {
        const res = await fetch(`${this.baseUrl}/api/alerts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Id': 'anonymous' },
            body: JSON.stringify({ user_id: 'anonymous', country, threshold })
        });
        return res.json();
    },

    async getTier() {
        const res = await fetch(`${this.baseUrl}/api/billing/tier`, {
            headers: { 'X-User-Id': 'anonymous' }
        });
        if (!res.ok) throw new Error('Failed to get tier');
        return res.json();
    },

    // Kick off Stripe Checkout for a paid tier and hand back the hosted URL.
    async checkout(tier) {
        const res = await fetch(`${this.baseUrl}/api/billing/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Id': 'anonymous' },
            body: JSON.stringify({ tier })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Checkout failed');
        return data;
    },

    // ---- Paid-tier features -------------------------------------------------

    // Tier-scoped event archive (Free 1d · Pro 90d · Enterprise 365d).
    async getHistory({ days = 90, country, limit = 500 } = {}) {
        const q = new URLSearchParams({ days: String(days), limit: String(limit) });
        if (country) q.set('country', country);
        const res = await fetch(`${this.baseUrl}/api/history?${q}`, {
            headers: { 'X-User-Id': 'anonymous' }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load history');
        return data;
    },

    // Current Slack/Telegram delivery status (secrets never returned).
    async getNotifications() {
        const res = await fetch(`${this.baseUrl}/api/notifications`, {
            headers: { 'X-User-Id': 'anonymous' }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load channels');
        return data;
    },

    // Patch delivery channels (paid tiers). Absent field = unchanged, "" = clear.
    async setNotifications(channels) {
        const res = await fetch(`${this.baseUrl}/api/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Id': 'anonymous' },
            body: JSON.stringify(channels)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to save channels');
        return data;
    },

    // Enterprise API keys.
    async listKeys() {
        const res = await fetch(`${this.baseUrl}/api/keys`, {
            headers: { 'X-User-Id': 'anonymous' }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to list keys');
        return data.keys || [];
    },

    // Returns the raw key exactly once — surface it to the user immediately.
    async createKey(name) {
        const res = await fetch(`${this.baseUrl}/api/keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Id': 'anonymous' },
            body: JSON.stringify({ name })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to create key');
        return data;
    },

    async revokeKey(id) {
        const res = await fetch(`${this.baseUrl}/api/keys/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'X-User-Id': 'anonymous' }
        });
        if (!res.ok && res.status !== 204) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to revoke key');
        }
        return true;
    }
};

// ============== Canvas Map Component ==============
function MapView({ data, onSelect }) {
    const canvasRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    // Handle resize
    useEffect(() => {
        const updateDimensions = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                setDimensions({ width: rect.width, height: rect.height });
            }
        };
        
        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    // Draw map
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data || dimensions.width === 0) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        
        canvas.width = dimensions.width * dpr;
        canvas.height = dimensions.height * dpr;
        ctx.scale(dpr, dpr);

        const width = dimensions.width;
        const height = dimensions.height;

        // Clear background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for (let i = 0; i < width; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
        }
        for (let i = 0; i < height; i += 50) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
            ctx.stroke();
        }

        // Equirectangular projection
        const project = (lat, lon) => ({
            x: ((lon + 180) / 360) * width,
            y: ((90 - lat) / 180) * height
        });

        // Draw heatmap bubbles
        data.forEach(event => {
            const pos = project(event.lat, event.lon);
            const radius = Math.max(5, event.severity * 3);
            
            const gradient = ctx.createRadialGradient(
                pos.x, pos.y, 0,
                pos.x, pos.y, radius
            );
            
            const alpha = event.severity / 10;
            if (event.severity >= 8) {
                gradient.addColorStop(0, `rgba(239, 68, 68, ${alpha})`);
                gradient.addColorStop(0.5, `rgba(239, 68, 68, ${alpha * 0.5})`);
                gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
            } else if (event.severity >= 5) {
                gradient.addColorStop(0, `rgba(245, 158, 11, ${alpha})`);
                gradient.addColorStop(0.5, `rgba(245, 158, 11, ${alpha * 0.5})`);
                gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
            } else {
                gradient.addColorStop(0, `rgba(59, 130, 246, ${alpha})`);
                gradient.addColorStop(0.5, `rgba(59, 130, 246, ${alpha * 0.5})`);
                gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
            }

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw center dot for high severity
            if (event.severity >= 7) {
                ctx.fillStyle = event.severity >= 8 ? '#ef4444' : '#f59e0b';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }, [data, dimensions]);

    // Handle click
    const handleClick = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas || !data) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const width = dimensions.width;
        const height = dimensions.height;

        // Equirectangular projection
        const project = (lat, lon) => ({
            x: ((lon + 180) / 360) * width,
            y: ((90 - lat) / 180) * height
        });

        // Find closest event
        let closest = null;
        let minDist = Infinity;

        data.forEach(event => {
            const pos = project(event.lat, event.lon);
            const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
            if (dist < 25 && dist < minDist) {
                minDist = dist;
                closest = event;
            }
        });

        if (closest) {
            onSelect(closest);
            setTooltip({
                x: Math.min(x + 10, width - 230),
                y: Math.max(y - 100, 10),
                data: closest
            });
            setTimeout(() => setTooltip(null), 4000);
        }
    }, [data, dimensions, onSelect]);

    // Calculate stats
    const highSeverity = data.filter(e => e.severity >= 8).length;
    const mediumSeverity = data.filter(e => e.severity >= 5 && e.severity < 8).length;

    return htmlx`
        <div class="heatmap">
            <canvas 
                ref=${canvasRef} 
                style="width: 100%; height: 100%;"
                onClick=${handleClick}
            />
            
            ${tooltip && htmlx`
                <div class="country-popup" style="left: ${tooltip.x}px; top: ${tooltip.y}px;">
                    <h4>${tooltip.data.country}</h4>
                    <p>${tooltip.data.headline}</p>
                    <span class="severity ${tooltip.data.severity >= 8 ? 'high' : tooltip.data.severity >= 5 ? 'medium' : 'low'}">
                        ${tooltip.data.severity >= 8 ? '🔴' : tooltip.data.severity >= 5 ? '🟠' : '🔵'}
                        Severity: ${tooltip.data.severity}/10
                    </span>
                </div>
            `}
            
            <div class="legend">
                <div class="legend-item">
                    <div class="legend-dot high"></div>
                    <span>Critical (${highSeverity})</span>
                </div>
                <div class="legend-item">
                    <div class="legend-dot medium"></div>
                    <span>Elevated (${mediumSeverity})</span>
                </div>
                <div class="legend-item">
                    <div class="legend-dot low"></div>
                    <span>Monitoring</span>
                </div>
            </div>
        </div>
    `;
}

// ============== 3D Globe Component (dependency-free canvas) ==============
// Orthographic projection of an auto-rotating sphere. No WebGL, no libraries —
// keeps the "29x lighter" ethos while giving the intelligence feed a real globe.
function GlobeView({ data, onSelect }) {
    const canvasRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);
    // Mutable render state kept in a ref so the rAF loop never re-subscribes.
    const s = useRef({ lon0: 0, lat0: 18, dragging: false, moved: 0, lastX: 0, lastY: 0,
        w: 0, h: 0, cx: 0, cy: 0, r: 0 });

    // Orthographic projection of (lat,lon) with current rotation. z>=0 => front.
    const project = (st, lat, lon) => {
        const lam = (lon - st.lon0) * Math.PI / 180;
        const phi = lat * Math.PI / 180;
        const p0 = st.lat0 * Math.PI / 180;
        const cphi = Math.cos(phi), sphi = Math.sin(phi);
        const clam = Math.cos(lam), slam = Math.sin(lam);
        const x = cphi * slam;
        const y = Math.cos(p0) * sphi - Math.sin(p0) * cphi * clam;
        const z = Math.sin(p0) * sphi + Math.cos(p0) * cphi * clam;
        return { x: st.cx + st.r * x, y: st.cy - st.r * y, z };
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let raf;

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            const st = s.current;
            st.w = rect.width; st.h = rect.height;
            st.cx = rect.width / 2; st.cy = rect.height / 2;
            st.r = Math.min(rect.width, rect.height) * 0.42;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        const strokeArc = (st, coords) => {
            ctx.beginPath();
            let started = false;
            for (const [lat, lon] of coords) {
                const p = project(st, lat, lon);
                if (p.z >= 0) {
                    if (started) ctx.lineTo(p.x, p.y);
                    else { ctx.moveTo(p.x, p.y); started = true; }
                } else started = false;
            }
            ctx.stroke();
        };

        const draw = () => {
            const st = s.current;
            if (!st.dragging) st.lon0 = (st.lon0 + 0.12) % 360;

            ctx.clearRect(0, 0, st.w, st.h);
            ctx.fillStyle = '#0a0a0f';
            ctx.fillRect(0, 0, st.w, st.h);
            const { cx, cy, r } = st;

            // Atmosphere halo
            const atm = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.16);
            atm.addColorStop(0, 'rgba(59,130,246,0.28)');
            atm.addColorStop(1, 'rgba(59,130,246,0)');
            ctx.fillStyle = atm;
            ctx.beginPath(); ctx.arc(cx, cy, r * 1.16, 0, Math.PI * 2); ctx.fill();

            // Ocean sphere, lit from top-left for a 3D read
            const oc = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
            oc.addColorStop(0, '#1e3a5f');
            oc.addColorStop(1, '#0b1220');
            ctx.fillStyle = oc;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

            // Graticule (front hemisphere only), clipped to the disc
            ctx.save();
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
            ctx.strokeStyle = 'rgba(148,163,184,0.16)';
            ctx.lineWidth = 1;
            for (let lon = -180; lon < 180; lon += 30) {
                const arc = [];
                for (let lat = -90; lat <= 90; lat += 3) arc.push([lat, lon]);
                strokeArc(st, arc);
            }
            for (let lat = -60; lat <= 60; lat += 30) {
                const arc = [];
                for (let lon = -180; lon <= 180; lon += 3) arc.push([lat, lon]);
                strokeArc(st, arc);
            }
            ctx.restore();

            // Event points — hidden on the far side, dimmed toward the limb
            data.forEach(ev => {
                const p = project(st, ev.lat, ev.lon);
                if (p.z < 0) return;
                const depth = 0.35 + 0.65 * p.z;
                const rad = Math.max(4, ev.severity * 2.2);
                const c = ev.severity >= 8 ? '239,68,68' : ev.severity >= 5 ? '245,158,11' : '59,130,246';
                const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 2);
                g.addColorStop(0, `rgba(${c},${0.9 * depth})`);
                g.addColorStop(0.5, `rgba(${c},${0.35 * depth})`);
                g.addColorStop(1, `rgba(${c},0)`);
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(p.x, p.y, rad * 2, 0, Math.PI * 2); ctx.fill();
                if (ev.severity >= 7) {
                    ctx.fillStyle = `rgba(${c},${depth})`;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
                }
            });

            raf = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
        };
    }, [data]);

    // Pointer: drag to spin, tap to select the nearest visible event.
    const onDown = useCallback((e) => {
        const st = s.current;
        st.dragging = true; st.moved = 0;
        st.lastX = e.clientX; st.lastY = e.clientY;
    }, []);
    const onMove = useCallback((e) => {
        const st = s.current;
        if (!st.dragging) return;
        const dx = e.clientX - st.lastX, dy = e.clientY - st.lastY;
        st.moved += Math.abs(dx) + Math.abs(dy);
        st.lon0 -= dx * 0.4;
        st.lat0 = Math.max(-85, Math.min(85, st.lat0 + dy * 0.3));
        st.lastX = e.clientX; st.lastY = e.clientY;
    }, []);
    const onUp = useCallback((e) => {
        const st = s.current;
        st.dragging = false;
        if (st.moved > 6 || !data) return; // a drag, not a tap
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        let closest = null, min = Infinity;
        data.forEach(ev => {
            const p = project(st, ev.lat, ev.lon);
            if (p.z < 0) return;
            const d = Math.hypot(x - p.x, y - p.y);
            if (d < 22 && d < min) { min = d; closest = ev; }
        });
        if (closest) {
            onSelect(closest);
            setTooltip({
                x: Math.min(x + 10, st.w - 230),
                y: Math.max(y - 100, 10),
                data: closest,
            });
            setTimeout(() => setTooltip(null), 4000);
        }
    }, [data, onSelect]);

    const high = data.filter(e => e.severity >= 8).length;
    const med = data.filter(e => e.severity >= 5 && e.severity < 8).length;

    return htmlx`
        <div class="heatmap">
            <canvas
                ref=${canvasRef}
                style="width:100%;height:100%;cursor:grab;touch-action:none;"
                onPointerDown=${onDown}
                onPointerMove=${onMove}
                onPointerUp=${onUp}
                onPointerLeave=${() => { s.current.dragging = false; }}
            />
            ${tooltip && htmlx`
                <div class="country-popup" style="left: ${tooltip.x}px; top: ${tooltip.y}px;">
                    <h4>${tooltip.data.country}</h4>
                    <p>${tooltip.data.headline}</p>
                    <span class="severity ${tooltip.data.severity >= 8 ? 'high' : tooltip.data.severity >= 5 ? 'medium' : 'low'}">
                        ${tooltip.data.severity >= 8 ? '🔴' : tooltip.data.severity >= 5 ? '🟠' : '🔵'}
                        Severity: ${tooltip.data.severity}/10
                    </span>
                </div>
            `}
            <div class="legend">
                <div class="legend-item"><div class="legend-dot high"></div><span>Critical (${high})</span></div>
                <div class="legend-item"><div class="legend-dot medium"></div><span>Elevated (${med})</span></div>
                <div class="legend-item"><div class="legend-dot low"></div><span>Monitoring</span></div>
            </div>
            <div class="globe-hint">Drag to rotate · tap a marker</div>
        </div>
    `;
}

// ============== Map wrapper: 3D globe / flat toggle ==============
function WorldMap({ data, onSelect }) {
    const [mode, setMode] = useState('globe');
    return htmlx`
        <div class="map-wrap">
            <div class="map-toggle">
                <button class=${mode === 'globe' ? 'active' : ''} onClick=${() => setMode('globe')}>🌐 Globe</button>
                <button class=${mode === 'flat' ? 'active' : ''} onClick=${() => setMode('flat')}>🗺️ Flat</button>
            </div>
            ${mode === 'globe'
                ? htmlx`<${GlobeView} data=${data} onSelect=${onSelect} />`
                : htmlx`<${MapView} data=${data} onSelect=${onSelect} />`}
        </div>
    `;
}

// ============== Brief Component ==============
function BriefView({ country, onBack }) {
    const [brief, setBrief] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!country) return;
        
        setLoading(true);
        setError(null);
        
        API.getBrief(country)
            .then(data => {
                setBrief(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [country]);

    if (loading) return htmlx`
        <div class="loading">
            <div class="loading-spinner"></div>
            <p>Generating intelligence brief...</p>
        </div>
    `;
    
    if (error) return htmlx`
        <div class="brief">
            <div class="card severity-high">
                <h3>Error</h3>
                <p>${error}</p>
            </div>
            <button class="btn" onClick=${onBack}>Back to Map</button>
        </div>
    `;
    
    const severityClass = brief?.event_count > 5 ? 'severity-high' : 
                         brief?.event_count > 2 ? 'severity-med' : 'severity-low';

    return htmlx`
        <div class="brief fade-in">
            <div class="card ${severityClass}">
                <h3>${country} - Intelligence Brief</h3>
                <p>${brief?.summary || 'No significant activity detected.'}</p>
                <div class="meta">
                    Based on ${brief?.event_count || 0} events in the last 24h • 
                    Generated ${new Date(brief?.generated_at).toLocaleTimeString()}
                </div>
            </div>
            
            ${brief?.event_count > 0 && htmlx`
                <div class="card">
                    <h3>📊 Situation Analysis</h3>
                    <p>
                        ${brief.event_count > 10 ? '🔴 High activity detected. Multiple concurrent events suggest elevated tensions.' :
                          brief.event_count > 5 ? '🟠 Moderate activity. Monitor for escalation patterns.' :
                          '🟢 Low activity. Standard monitoring protocols apply.'}
                    </p>
                </div>
            `}

            <button class="btn" onClick=${onBack}>Back to Global Map</button>
            <button class="btn secondary" onClick=${() => {
                API.createAlert(country, 5).then(() => alert(`Alert set for ${country}`));
            }}>
                🔔 Set Alert for ${country}
            </button>
        </div>
    `;
}

// ============== Onboarding Flow ==============
function Onboarding({ onComplete }) {
    const [step, setStep] = useState(1);
    const [interests, setInterests] = useState([]);

    const toggleInterest = (interest) => {
        if (interests.includes(interest)) {
            setInterests(interests.filter(i => i !== interest));
        } else {
            setInterests([...interests, interest]);
        }
    };

    const saveAndProceed = async () => {
        await API.updateUser({ interests, countries: [] });
        if (step < 3) {
            setStep(step + 1);
        } else {
            onComplete();
        }
    };

    // Step 1: Welcome
    if (step === 1) return htmlx`
        <div class="onboarding fade-in">
            <h2>⚡ WorldMonitor Core</h2>
            <p>Real-time global intelligence from 150+ sources. Now 10× faster and 29× lighter.</p>
            
            <div class="features">
                <div class="feature">
                    <span class="feature-icon">🌍</span>
                    <span class="feature-text">Global conflict monitoring in real-time</span>
                </div>
                <div class="feature">
                    <span class="feature-icon">🤖</span>
                    <span class="feature-text">AI-powered intelligence briefings</span>
                </div>
                <div class="feature">
                    <span class="feature-icon">⚡</span>
                    <span class="feature-text">Sub-second load times, mobile-first</span>
                </div>
            </div>
            
            <button class="btn" onClick=${() => setStep(2)}>Get Started</button>
        </div>
    `;

    // Step 2: Interest Selection
    if (step === 2) return htmlx`
        <div class="onboarding fade-in">
            <h2>What impacts you?</h2>
            <p>Select your interests for a personalized dashboard:</p>
            
            <div class="interest-grid">
                <button 
                    class="btn secondary ${interests.includes('security') ? 'selected' : ''}"
                    onClick=${() => toggleInterest('security')}>
                    🛡️ Security
                </button>
                <button 
                    class="btn secondary ${interests.includes('finance') ? 'selected' : ''}"
                    onClick=${() => toggleInterest('finance')}>
                    📈 Finance
                </button>
                <button 
                    class="btn secondary ${interests.includes('climate') ? 'selected' : ''}"
                    onClick=${() => toggleInterest('climate')}>
                    🌍 Climate
                </button>
                <button 
                    class="btn secondary ${interests.includes('tech') ? 'selected' : ''}"
                    onClick=${() => toggleInterest('tech')}>
                    💻 Technology
                </button>
            </div>
            
            <button class="btn" onClick=${saveAndProceed} disabled=${interests.length === 0}>
                Continue
            </button>
        </div>
    `;

    // Step 3: Notifications
    return htmlx`
        <div class="onboarding fade-in">
            <h2>Stay Informed</h2>
            <p>Enable notifications for critical alerts in your regions of interest.</p>
            
            <button class="btn" onClick=${() => {
                if ('Notification' in window) {
                    Notification.requestPermission();
                }
                saveAndProceed();
            }}>
                Enable Notifications
            </button>
            <button class="btn secondary" onClick=${saveAndProceed}>Skip for Now</button>
        </div>
    `;
}

// ============== Settings: Event History (Pro) ==============
function HistoryPanel({ tier }) {
    const [days, setDays] = useState('90');
    const [country, setCountry] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const r = await API.getHistory({
                days: Number(days),
                country: country.trim() || undefined,
                limit: 200,
            });
            setResult(r);
        } catch (e) { setErr(e.message); }
        setLoading(false);
    }, [days, country]);

    const sevClass = s => s >= 8 ? 'sev-high' : s >= 5 ? 'sev-med' : 'sev-low';

    return htmlx`
        <div class="panel">
            <div class="panel-head">
                <h3>📚 Event History</h3>
                <span class="badge ${tier?.tier || ''}">${tier?.tier || '…'}</span>
            </div>
            <p class="panel-sub">Look back through the archive. Free: 1 day · Pro: 90 days · Enterprise: 365 days.</p>
            <div class="form-row">
                <select value=${days} onChange=${e => setDays(e.target.value)}>
                    <option value="1">Last 24 hours</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last 365 days</option>
                </select>
                <input placeholder="Country (optional)" value=${country}
                    onInput=${e => setCountry(e.target.value)} />
                <button class="btn-sm" onClick=${load} disabled=${loading}>
                    ${loading ? 'Loading…' : 'Load'}
                </button>
            </div>
            ${err && htmlx`<p class="msg err">${err}</p>`}
            ${result && htmlx`
                <div class="history-meta">
                    ${result.events.length} events · window ${result.days}d (max ${result.max_days}d on ${result.tier})
                    ${result.truncated ? htmlx`<span class="warn"> — upgrade for a longer window</span>` : ''}
                </div>
                <div class="history-list">
                    ${result.events.length === 0
                        ? htmlx`<p class="muted">No events in this window.</p>`
                        : result.events.slice(0, 120).map(ev => htmlx`
                            <div class="history-item" key=${ev.id}>
                                <span class="sev ${sevClass(ev.severity)}">${ev.severity}</span>
                                <div>
                                    <div class="history-headline">${ev.headline}</div>
                                    <div class="history-sub">${ev.country} · ${ev.domain} · ${new Date(ev.timestamp).toLocaleString()}</div>
                                </div>
                            </div>
                        `)}
                </div>
            `}
        </div>
    `;
}

// ============== Settings: Slack / Telegram delivery (paid) ==============
function NotificationsPanel({ isPaid }) {
    const [status, setStatus] = useState(null);
    const [slack, setSlack] = useState('');
    const [tgToken, setTgToken] = useState('');
    const [tgChat, setTgChat] = useState('');
    const [msg, setMsg] = useState(null);
    const [saving, setSaving] = useState(false);

    const refresh = useCallback(() => {
        API.getNotifications().then(setStatus).catch(() => {});
    }, []);
    useEffect(() => { refresh(); }, [refresh]);

    const save = useCallback(async () => {
        // Only send fields the user filled — absent = unchanged server-side.
        const payload = {};
        if (slack.trim()) payload.slack_webhook_url = slack.trim();
        if (tgToken.trim()) payload.telegram_bot_token = tgToken.trim();
        if (tgChat.trim()) payload.telegram_chat_id = tgChat.trim();
        if (Object.keys(payload).length === 0) {
            setMsg({ ok: false, text: 'Enter at least one value to save.' });
            return;
        }
        setSaving(true); setMsg(null);
        try {
            const r = await API.setNotifications(payload);
            setStatus(r);
            setMsg({ ok: true, text: 'Channels saved. Matching alerts will be delivered.' });
            setSlack(''); setTgToken(''); setTgChat('');
        } catch (e) { setMsg({ ok: false, text: e.message }); }
        setSaving(false);
    }, [slack, tgToken, tgChat]);

    const clearChannel = useCallback(async (kind) => {
        const payload = kind === 'slack'
            ? { slack_webhook_url: '' }
            : { telegram_bot_token: '', telegram_chat_id: '' };
        setMsg(null);
        try {
            const r = await API.setNotifications(payload);
            setStatus(r);
            setMsg({ ok: true, text: 'Channel cleared.' });
        } catch (e) { setMsg({ ok: false, text: e.message }); }
    }, []);

    return htmlx`
        <div class="panel">
            <div class="panel-head">
                <h3>🔔 Alert Delivery</h3>
                ${status && htmlx`<span class="badge ${status.delivery_enabled ? 'enterprise' : ''}">
                    ${status.delivery_enabled ? 'active' : 'paid only'}</span>`}
            </div>
            <p class="panel-sub">Push alerts that match your subscriptions to Slack and Telegram.</p>
            ${status && htmlx`
                <div class="status-row">
                    <span class="chip ${status.slack_configured ? 'on' : ''}">
                        ${status.slack_configured ? '✓' : '○'} Slack
                        ${status.slack_configured ? htmlx`<button class="btn-sm ghost" style="padding:0.1rem 0.4rem;margin-left:0.3rem;" onClick=${() => clearChannel('slack')}>clear</button>` : ''}
                    </span>
                    <span class="chip ${status.telegram_configured ? 'on' : ''}">
                        ${status.telegram_configured ? '✓' : '○'} Telegram
                        ${status.telegram_chat_id ? htmlx`<span class="muted">(chat ${status.telegram_chat_id})</span>` : ''}
                        ${status.telegram_configured ? htmlx`<button class="btn-sm ghost" style="padding:0.1rem 0.4rem;margin-left:0.3rem;" onClick=${() => clearChannel('telegram')}>clear</button>` : ''}
                    </span>
                </div>
            `}
            ${!isPaid ? htmlx`
                <p class="muted">Slack & Telegram delivery is a <span class="warn">Pro</span> feature. Upgrade to enable push alerts.</p>
            ` : htmlx`
                <div class="field">
                    <label>Slack incoming webhook URL</label>
                    <input placeholder="https://hooks.slack.com/services/…" value=${slack}
                        onInput=${e => setSlack(e.target.value)} />
                </div>
                <div class="field">
                    <label>Telegram bot token</label>
                    <input placeholder="123456:ABC-DEF…" value=${tgToken}
                        onInput=${e => setTgToken(e.target.value)} />
                </div>
                <div class="field">
                    <label>Telegram chat id</label>
                    <input placeholder="987654321" value=${tgChat}
                        onInput=${e => setTgChat(e.target.value)} />
                </div>
                <button class="btn-sm" onClick=${save} disabled=${saving}>
                    ${saving ? 'Saving…' : 'Save channels'}
                </button>
                <p class="muted" style="margin-top:0.5rem;">Existing secrets are never shown. Leave a field blank to keep it unchanged.</p>
            `}
            ${msg && htmlx`<p class="msg ${msg.ok ? 'ok' : 'err'}">${msg.text}</p>`}
        </div>
    `;
}

// ============== Settings: API keys (Enterprise) ==============
function ApiKeysPanel() {
    const [keys, setKeys] = useState([]);
    const [name, setName] = useState('');
    const [created, setCreated] = useState(null);
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(() => {
        API.listKeys().then(setKeys).catch(() => {});
    }, []);
    useEffect(() => { refresh(); }, [refresh]);

    const create = useCallback(async () => {
        setBusy(true); setErr(null);
        try {
            const r = await API.createKey(name.trim() || undefined);
            setCreated(r);
            setName('');
            refresh();
        } catch (e) { setErr(e.message); }
        setBusy(false);
    }, [name, refresh]);

    const revoke = useCallback(async (id) => {
        setErr(null);
        try { await API.revokeKey(id); refresh(); }
        catch (e) { setErr(e.message); }
    }, [refresh]);

    return htmlx`
        <div class="panel">
            <div class="panel-head">
                <h3>🔑 API Keys</h3>
                <span class="badge enterprise">enterprise</span>
            </div>
            <p class="panel-sub">Programmatic access. Send a key as <code>Authorization: Bearer wm_…</code> or <code>X-API-Key</code>.</p>
            ${created && htmlx`
                <div class="key-reveal">
                    <strong>Copy your new key now — it won't be shown again.</strong>
                    <code>${created.key}</code>
                    <button class="btn-sm ghost" onClick=${() => setCreated(null)}>Done</button>
                </div>
            `}
            <div class="form-row">
                <input placeholder="Key name (e.g. ci-pipeline)" value=${name}
                    onInput=${e => setName(e.target.value)} />
                <button class="btn-sm" onClick=${create} disabled=${busy}>
                    ${busy ? 'Creating…' : 'Create key'}
                </button>
            </div>
            ${err && htmlx`<p class="msg err">${err}</p>`}
            ${keys.length === 0
                ? htmlx`<p class="muted">No keys yet.</p>`
                : keys.map(k => htmlx`
                    <div class="key-row" key=${k.id}>
                        <div>
                            <span class="key-mono ${k.revoked ? 'key-revoked' : ''}">${k.prefix}…</span>
                            <div class="key-meta">
                                ${k.name || 'unnamed'} · created ${k.created_at ? new Date(k.created_at).toLocaleDateString() : '—'}
                                ${k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : ' · never used'}
                                ${k.revoked ? ' · revoked' : ''}
                            </div>
                        </div>
                        ${!k.revoked && htmlx`<button class="btn-sm danger" onClick=${() => revoke(k.id)}>Revoke</button>`}
                    </div>
                `)}
        </div>
    `;
}

// ============== Settings: locked upsell for lower tiers ==============
function LockedPanel({ icon, title, need, desc }) {
    return htmlx`
        <div class="panel">
            <div class="panel-head"><h3>${title}</h3><span class="badge">${need}</span></div>
            <div class="locked">
                <div class="lock-icon">${icon}</div>
                <p class="muted">${desc}</p>
                <p class="muted">Available on the <span class="warn">${need}</span> plan.</p>
            </div>
        </div>
    `;
}

// ============== Settings view ==============
function Settings({ tier }) {
    const isPaid = !!tier && tier.tier !== 'free';
    const isEnterprise = !!tier && tier.tier === 'enterprise';
    return htmlx`
        <div class="settings fade-in">
            <${HistoryPanel} tier=${tier} />
            <${NotificationsPanel} isPaid=${isPaid} />
            ${isEnterprise
                ? htmlx`<${ApiKeysPanel} />`
                : htmlx`<${LockedPanel} icon="🔑" title="API Keys" need="Enterprise"
                    desc="Issue wm_ API keys for programmatic access to the intelligence feed and history." />`}
        </div>
    `;
}

// ============== Main App ==============
function App() {
    const [view, setView] = useState('onboarding');
    const [data, setData] = useState([]);
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastSync, setLastSync] = useState(Date.now());
    const [error, setError] = useState(null);
    const [tier, setTier] = useState(null);
    const [upgrading, setUpgrading] = useState(false);
    const [notice, setNotice] = useState(null);

    // Initial load
    useEffect(() => {
        Promise.all([API.getIntelligence(), API.getUser()])
            .then(([intel, userData]) => {
                setData(intel);
                setUser(userData);
                setLoading(false);
                if (!userData.isNew) {
                    setView('map');
                }
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    // Load billing tier (separate so a billing outage never blocks the app).
    useEffect(() => {
        API.getTier().then(setTier).catch(() => {});
    }, []);

    // Close the purchase funnel: read the ?upgrade= flag Stripe redirects back
    // with, show a confirmation, and — on success — re-poll the tier a few times
    // so the UI flips to Pro as soon as the fulfilment webhook lands (it may lag
    // the redirect by a second or two). The query param is stripped either way.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const upgrade = params.get('upgrade');
        if (!upgrade) return;

        window.history.replaceState({}, '', window.location.pathname);

        if (upgrade === 'success') {
            setNotice({ kind: 'success', text: '🎉 Payment received — activating your plan…' });
            let tries = 0;
            const poll = setInterval(() => {
                tries += 1;
                API.getTier()
                    .then(t => {
                        setTier(t);
                        if (t.tier !== 'free') {
                            clearInterval(poll);
                            setNotice({ kind: 'success', text: `✓ You're on the ${t.tier} plan — unlimited alerts unlocked.` });
                        }
                    })
                    .catch(() => {});
                if (tries >= 6) clearInterval(poll);
            }, 2000);
        } else if (upgrade === 'cancelled') {
            setNotice({ kind: 'info', text: 'Checkout cancelled — no charge was made.' });
        }
    }, []);

    // Start Stripe Checkout and redirect to the hosted payment page.
    const handleUpgrade = useCallback(async (plan = 'pro') => {
        if (upgrading) return;
        setUpgrading(true);
        try {
            const { url } = await API.checkout(plan);
            window.location.href = url;
        } catch (err) {
            alert(err.message || 'Could not start checkout. Please try again.');
            setUpgrading(false);
        }
    }, [upgrading]);

    // Periodic sync (every 60 seconds)
    useEffect(() => {
        if (view === 'onboarding') return;
        
        const interval = setInterval(() => {
            API.sync(lastSync)
                .then(({ newEvents, serverTime }) => {
                    if (newEvents.length > 0) {
                        setData(prev => {
                            const merged = [...prev];
                            newEvents.forEach(event => {
                                const idx = merged.findIndex(e => e.id === event.id);
                                if (idx >= 0) merged[idx] = event;
                                else merged.push(event);
                            });
                            return merged.sort((a, b) => b.severity - a.severity).slice(0, 100);
                        });
                    }
                    setLastSync(serverTime);
                })
                .catch(console.error);
        }, 60000);
        
        return () => clearInterval(interval);
    }, [view, lastSync]);

    // Handle country selection
    const handleCountrySelect = useCallback((event) => {
        setSelectedCountry(event.country);
        setView('brief');
    }, []);

    // Handle back navigation
    const handleBack = useCallback(() => {
        setSelectedCountry(null);
        setView('map');
    }, []);

    // Handle onboarding complete
    const handleOnboardingComplete = useCallback(() => {
        setView('map');
    }, []);

    if (loading) return htmlx`
        <div class="loading">
            <div class="loading-spinner"></div>
            <p>Loading intelligence data...</p>
        </div>
    `;

    if (error) return htmlx`
        <div class="loading">
            <p style="color: #ef4444;">Error: ${error}</p>
            <button class="btn" onClick=${() => window.location.reload()}>Retry</button>
        </div>
    `;

    if (view === 'onboarding') {
        return htmlx`<${Onboarding} onComplete=${handleOnboardingComplete} />`;
    }

    const highSeverity = data.filter(e => e.severity >= 8).length;

    return htmlx`
        <div class="app">
            ${notice && htmlx`
                <div class="notice notice-${notice.kind}" role="status">
                    <span>${notice.text}</span>
                    <button class="notice-close" aria-label="Dismiss" onClick=${() => setNotice(null)}>×</button>
                </div>
            `}
            ${(!tier || tier.tier === 'free') ? htmlx`
                <div class="upgrade-banner" onClick=${() => tier?.billing_enabled !== false && handleUpgrade('pro')}>
                    Free tier: ${tier?.max_alerts ?? 3} alerts, 24h delayed data
                    ${tier?.billing_enabled === false ? htmlx`
                        <span style="margin-left:0.5rem; opacity:0.85;">Pro coming soon</span>
                    ` : htmlx`
                        <a href="#" onClick=${e => { e.preventDefault(); handleUpgrade('pro'); }}>
                            ${upgrading ? 'Redirecting…' : 'Upgrade to Pro ($19/mo) →'}
                        </a>
                    `}
                </div>
            ` : htmlx`
                <div class="upgrade-banner" style="cursor:default;">
                    ${tier.tier === 'enterprise' ? '🏛️ Enterprise' : '⭐ Pro'} plan active — unlimited alerts, full access
                </div>
            `}
            
            <header>
                <h1><span>⚡</span> WorldMonitor Core</h1>
                ${user?.streak > 0 && htmlx`
                    <span class="streak">
                        <span>🔥</span> ${user.streak} day streak
                    </span>
                `}
            </header>
            
            <div class="nav">
                <button 
                    class=${view === 'map' ? 'active' : ''}
                    onClick=${handleBack}>
                    🌍 Global Map
                </button>
                <button
                    class=${view === 'brief' ? 'active' : ''}
                    onClick=${() => setView('brief')}>
                    📋 Daily Brief
                </button>
                <button
                    class=${view === 'settings' ? 'active' : ''}
                    onClick=${() => setView('settings')}>
                    ⚙️ Settings
                </button>
            </div>
            
            <div class="content">
                ${view === 'map' && htmlx`
                    <${WorldMap}
                        data=${data}
                        onSelect=${handleCountrySelect}
                    />
                    <div class="stats-bar">
                        <span>📊 ${data.length} events tracked</span>
                        <span>🔴 ${highSeverity} critical</span>
                        <span>🔄 Updated ${new Date(lastSync).toLocaleTimeString()}</span>
                    </div>
                `}
                ${view === 'brief' && htmlx`
                    <${BriefView}
                        country=${selectedCountry || 'Global'}
                        onBack=${handleBack}
                    />
                `}
                ${view === 'settings' && htmlx`
                    <${Settings} tier=${tier} />
                `}
            </div>
        </div>
    `;
}

// Mount app
render(htmlx`<${App} />`, document.getElementById('app'));
