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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: 'anonymous', country, threshold })
        });
        return res.json();
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

// ============== Main App ==============
function App() {
    const [view, setView] = useState('onboarding');
    const [data, setData] = useState([]);
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastSync, setLastSync] = useState(Date.now());
    const [error, setError] = useState(null);

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
            <div class="upgrade-banner" onClick=${() => alert('Upgrade to Pro for $9/month\n\n✓ Real-time data\n✓ Unlimited alerts\n✓ 90-day history\n✓ API access')}>
                Free tier: 3 alerts, 24h delayed data
                <a href="#" onClick=${e => e.preventDefault()}>Upgrade to Pro →</a>
            </div>
            
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
            </div>
            
            <div class="content">
                ${view === 'map' && htmlx`
                    <${MapView} 
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
            </div>
        </div>
    `;
}

// Mount app
render(htmlx`<${App} />`, document.getElementById('app'));
