'use client';

/**
 * Globe — immersive 3D scenario-planning view.
 *
 * A trimmed Three.js port of the Kimi Real-Time Satellite Orbit Visualizer,
 * repurposed for WorldMonitor intel-event visualisation.
 *
 *   • Damped OrbitControls (the sphere-like drag-to-rotate interaction)
 *   • Photo-real earth: day map + specular + normal + cloud + city-lights shader
 *   • Atmosphere rim glow + starfield (3500 pts)
 *   • Real sun direction from J2000 ephemeris → day/night terminator follows time
 *   • UnrealBloomPass with adaptive fallback (drops bloom < 16 fps)
 *   • Events plotted as glowing points on the earth-fixed frame (rotate w/ earth)
 *   • Scenario clock: play / pause / ×1…×3600 warp for what-if simulation
 *
 * Lightweight: three.js is only pulled into the bundle chunk that loads this
 * file. Parent must gate mounting via next/dynamic({ssr:false}).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { IntelEvent } from '@/lib/api';

// ─── Palette (mirrors WorldMap severity colours) ─────────────────────────────
const SEV_COLOR = (s: number) =>
  s >= 8 ? 0xff3e3e :
  s >= 6 ? 0xffb800 :
  s >= 4 ? 0x00f5ff :
           0x00e676;

const SEV_LABEL = (s: number) =>
  s >= 8 ? 'Critical' : s >= 6 ? 'High' : s >= 4 ? 'Medium' : 'Low';

// ─── Earth-fixed lat/lon → unit-sphere position ──────────────────────────────
// Match equirectangular texture used by earth_atmos_2048.jpg: prime meridian
// at +X, north pole at +Y, equator on the XZ plane.
function latLonToVec(lat: number, lon: number, r = 1.005, out = new THREE.Vector3()) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return out.set(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

// ─── Sun direction in ECI (J2000-based, good to ~arc-min) ────────────────────
function sunEci(date: Date) {
  const d = date.getTime() / 86400000 - 10957.5;
  const DEG = Math.PI / 180;
  const L = (280.460 + 0.9856474 * d) * DEG;
  const g = (357.528 + 0.9856003 * d) * DEG;
  const lam = L + 1.915 * DEG * Math.sin(g) + 0.020 * DEG * Math.sin(2 * g);
  const eps = 23.439 * DEG - 0.0000004 * d * DEG;
  return { x: Math.cos(lam), y: Math.cos(eps) * Math.sin(lam), z: Math.sin(eps) * Math.sin(lam) };
}

// Greenwich mean sidereal time (radians) — enough for a rotating basemap.
function gmst(date: Date) {
  const j = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const T = j / 36525;
  const g = 280.46061837 + 360.98564736629 * j + 0.000387933 * T * T - T * T * T / 38710000;
  return (g % 360) * Math.PI / 180;
}

type SelectedEvent = { event: IntelEvent; screen: { x: number; y: number } };

type Props = {
  events: IntelEvent[];
  /** Turn on the aurora sky-band + brighter city lights. Default true. */
  cinematic?: boolean;
};

export function Globe({ events, cinematic = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<SelectedEvent | null>(null);
  const [clockText, setClockText] = useState('');
  const [fps, setFps] = useState('');

  // Scenario time state (kept in a ref to avoid re-render churn in animate())
  const simRef = useRef({ ms: Date.now(), warp: 1, paused: false });
  const [warpLabel, setWarpLabel] = useState('×1');
  const [paused, setPaused] = useState(false);

  // Latest events (ref → animate() can read without a re-mount)
  const eventsRef = useRef<IntelEvent[]>(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  // Selection state pushed from within the scene → React
  const setSelectedRef = useRef(setSelected);
  setSelectedRef.current = setSelected;

  // ── Mount / unmount the scene once ─────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
    renderer.setClearColor(0x020409, 1);
    wrap.appendChild(renderer.domElement);

    // Scene + camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, wrap.clientWidth / wrap.clientHeight, 0.01, 500);
    // Open on the day side
    const s0 = sunEci(new Date());
    camera.position.set(s0.x, s0.z, -s0.y).multiplyScalar(3.2);
    camera.position.y += 0.7;
    camera.lookAt(0, 0, 0);

    // Damped orbit controls — this is the sphere-like drag interaction.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.35;
    controls.maxDistance = 12;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;

    // Lights
    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.4);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x334455, 0.6));
    scene.add(new THREE.HemisphereLight(0x8fb4dd, 0x1a2233, 0.25));

    // Earth (attach markers here so they rotate with the earth)
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);
    const tex = new THREE.TextureLoader();
    const TEX = '/globe/textures/';
    const earthMat = new THREE.MeshPhongMaterial({
      map:         tex.load(TEX + 'earth_atmos_2048.jpg'),
      specularMap: tex.load(TEX + 'earth_specular_2048.jpg'),
      normalMap:   tex.load(TEX + 'earth_normal_2048.jpg'),
      specular:    new THREE.Color(0x4a6a8a),
      shininess:   16,
    });
    earthGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1, 72, 72), earthMat));

    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.004, 48, 48),
      new THREE.MeshLambertMaterial({
        map: tex.load(TEX + 'earth_clouds_1024.png'),
        transparent: true, opacity: 0.45, depthWrite: false,
      }),
    );
    earthGroup.add(clouds);

    // Day/night city-lights shader
    const lightsMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex.load(TEX + 'earth_lights_2048.png') },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vN;
        void main(){ vUv = uv; vN = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform vec3 uSun;
        varying vec2 vUv; varying vec3 vN;
        void main(){
          vec3 L = texture2D(uMap, vUv).rgb;
          float night = smoothstep(0.12, -0.30, dot(normalize(vN), normalize(uSun)));
          gl_FragColor = vec4(L * night * ${cinematic ? '1.35' : '1.0'}, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    earthGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1.002, 48, 48), lightsMat));

    // Atmosphere rim glow
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader: `varying vec3 vN;
          void main(){ vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: `varying vec3 vN;
          void main(){
            float i = pow(0.72 - dot(vN, vec3(0.,0.,1.)), 3.5);
            gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * i;
          }`,
        blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false,
      }),
    );
    scene.add(atmo);

    // Starfield
    {
      const n = 3500, p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 90 + Math.random() * 160;
        const t = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        p[i*3]   = r * Math.sin(ph) * Math.cos(t);
        p[i*3+1] = r * Math.cos(ph);
        p[i*3+2] = r * Math.sin(ph) * Math.sin(t);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({
        color: 0xafc4e8, size: 0.5, sizeAttenuation: false,
        transparent: true, opacity: 0.75, fog: false,
      })));
    }

    // ── Event markers ────────────────────────────────────────────────────────
    // Points cloud attached to earthGroup — markers rotate with the earth.
    const markerGeo = new THREE.BufferGeometry();
    const markerMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aSev;
        varying vec3 vColor;
        varying float vSev;
        uniform float uTime; uniform float uPR;
        void main(){
          vColor = aColor;
          vSev = aSev;
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          float pulse = 1.0 + 0.35 * sin(uTime * 3.0 + aSev * 1.7) * smoothstep(5.0, 8.0, aSev);
          gl_PointSize = aSize * pulse * uPR * (10.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vSev;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.06, d);
          if (a < 0.01) discard;
          float glow = 0.65 + 1.5 * a;
          gl_FragColor = vec4(vColor * glow, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const markers = new THREE.Points(markerGeo, markerMat);
    earthGroup.add(markers);

    // Cache of event refs indexed by attribute position — for raycasting.
    let markerEvents: IntelEvent[] = [];

    function rebuildMarkers(list: IntelEvent[]) {
      const N = Math.min(list.length, 400);
      const pos = new Float32Array(N * 3);
      const col = new Float32Array(N * 3);
      const siz = new Float32Array(N);
      const sev = new Float32Array(N);
      const _v = new THREE.Vector3();
      const _c = new THREE.Color();
      const kept: IntelEvent[] = [];
      for (let i = 0; i < N; i++) {
        const e = list[i];
        if (!isFinite(e.lat) || !isFinite(e.lon)) continue;
        latLonToVec(e.lat, e.lon, 1.006, _v);
        pos[i*3] = _v.x; pos[i*3+1] = _v.y; pos[i*3+2] = _v.z;
        _c.setHex(SEV_COLOR(e.severity));
        col[i*3] = _c.r; col[i*3+1] = _c.g; col[i*3+2] = _c.b;
        siz[i] = 3.4 + e.severity * 0.8;   // 4.2 (low) → 11.4 (crit)
        sev[i] = e.severity;
        kept.push(e);
      }
      markerGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      markerGeo.setAttribute('aColor',   new THREE.BufferAttribute(col, 3));
      markerGeo.setAttribute('aSize',    new THREE.BufferAttribute(siz, 1));
      markerGeo.setAttribute('aSev',     new THREE.BufferAttribute(sev, 1));
      markerGeo.attributes.position.needsUpdate = true;
      markerEvents = kept;
    }
    rebuildMarkers(events);

    // Watch the ref for prop-driven event updates (2 Hz — cheap, avoids re-mount).
    let lastEventsRef: IntelEvent[] = events;
    let eventsPollT = 0;

    // ── Post: bloom ──────────────────────────────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.setSize(wrap.clientWidth, wrap.clientHeight);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(wrap.clientWidth, wrap.clientHeight), 1.05, 0.55, 0.22,
    );
    composer.addPass(bloom);

    // Resize
    const onResize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h); composer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize); ro.observe(wrap);

    // ── Click-to-select ─────────────────────────────────────────────────────
    const ray = new THREE.Raycaster();
    ray.params.Points = { threshold: 0.025 };
    const ndc = new THREE.Vector2();
    let downXY: [number, number] | null = null;

    const canvas = renderer.domElement;
    const onDown = (e: PointerEvent) => { downXY = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!downXY) return;
      const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
      downXY = null;
      if (moved > 5) return;
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        (e.clientX - rect.left) / rect.width  * 2 - 1,
        -((e.clientY - rect.top)  / rect.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObject(markers);
      if (hits.length) {
        const idx = hits[0].index ?? -1;
        const ev = markerEvents[idx];
        if (ev) setSelectedRef.current({
          event: ev,
          screen: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        });
        return;
      }
      setSelectedRef.current(null);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);

    // ── Main loop ────────────────────────────────────────────────────────────
    const _yup = new THREE.Vector3(0, 1, 0);
    let frames = 0, fpsT = performance.now(), lowFpsRun = 0;
    let uiT = 0, lastReal = performance.now();
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const nowR = performance.now();
      const dt = nowR - lastReal; lastReal = nowR;

      // Poll for prop-driven event updates (~2Hz)
      eventsPollT += dt;
      if (eventsPollT > 500) {
        eventsPollT = 0;
        if (eventsRef.current !== lastEventsRef) {
          lastEventsRef = eventsRef.current;
          rebuildMarkers(lastEventsRef);
        }
      }

      // Scenario time
      const sim = simRef.current;
      if (!sim.paused) sim.ms += dt * sim.warp;
      const simDate = new Date(sim.ms);
      const g = gmst(simDate);
      earthGroup.rotation.y = -g;
      clouds.rotation.y += dt * 1e-6;

      // Sun direction rotates with GMST for accurate day/night terminator.
      const s = sunEci(simDate);
      sunLight.position.set(s.x, s.z, -s.y).multiplyScalar(20);
      lightsMat.uniforms.uSun.value.set(s.x, s.z, -s.y).applyAxisAngle(_yup, g).normalize();

      markerMat.uniforms.uTime.value = nowR * 0.001;

      controls.update();
      composer.render();

      // 4 Hz UI updates
      uiT += dt;
      if (uiT > 250) {
        uiT = 0;
        const iso = simDate.toISOString();
        setClockText(`${iso.slice(0, 10)}  ${iso.slice(11, 19)} UTC${sim.paused ? ' · PAUSED' : ''}`);
      }

      // FPS + adaptive perf
      frames++;
      if (nowR - fpsT > 1000) {
        const f = frames;
        setFps(`${f} fps · ${markerEvents.length} events`);
        if (f < 16 && bloom.enabled) {
          lowFpsRun++;
          if (lowFpsRun >= 3) { bloom.enabled = false; renderer.setPixelRatio(1); }
        } else {
          lowFpsRun = 0;
        }
        frames = 0; fpsT = nowR;
      }
    };
    animate();

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      // Dispose geometries + materials + textures across the scene.
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose());
        else if (mat) mat.dispose();
      });
      earthMat.map?.dispose();
      earthMat.specularMap?.dispose();
      earthMat.normalMap?.dispose();
      if (canvas.parentNode === wrap) wrap.removeChild(canvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // mount once; scene is orchestrated via refs

  // ── HUD handlers ───────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    simRef.current.paused = !simRef.current.paused;
    setPaused(simRef.current.paused);
  }, []);
  const resetNow = useCallback(() => {
    simRef.current.ms = Date.now();
    simRef.current.warp = 1;
    setWarpLabel('×1');
  }, []);
  const onWarp = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const w = Math.pow(10, parseFloat(e.target.value));
    simRef.current.warp = w;
    setWarpLabel('×' + (w >= 100 ? Math.round(w) : (Math.round(w * 10) / 10)));
  }, []);

  // ── Aggregate counts for legend ────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { crit: 0, high: 0, med: 0, low: 0, total: events.length };
    for (const e of events) {
      if (e.severity >= 8) c.crit++;
      else if (e.severity >= 6) c.high++;
      else if (e.severity >= 4) c.med++;
      else c.low++;
    }
    return c;
  }, [events]);

  return (
    <div className="w-full h-full relative bg-obsidian">
      {/* WebGL canvas mounts here */}
      <div ref={wrapRef} className="absolute inset-0" />

      {/* ── Stats bar (top-center) ──────────────────────────────────────────── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[10] pointer-events-none"
           style={{ whiteSpace: 'nowrap' }}>
        <div className="glass-panel rounded-lg px-4 py-2 flex items-center gap-5 text-center">
          <div>
            <div className="text-base font-bold text-alert leading-none">{counts.crit}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mt-0.5">Critical</div>
          </div>
          <div className="w-px h-7 bg-border-default" />
          <div>
            <div className="text-base font-bold text-warning leading-none">{counts.high}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mt-0.5">High</div>
          </div>
          <div className="w-px h-7 bg-border-default" />
          <div>
            <div className="text-base font-bold text-neon leading-none">{counts.total}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mt-0.5">Total</div>
          </div>
        </div>
      </div>

      {/* ── Clock (top-right) ─────────────────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-[10] pointer-events-none">
        <div className="glass-panel rounded-lg px-3 py-1.5">
          <div className="text-2xs font-mono text-neon tabular-nums">{clockText || '—'}</div>
        </div>
      </div>

      {/* ── Scenario time controls (bottom-center) ─────────────────────────── */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[10] pointer-events-auto">
        <div className="glass-panel rounded-lg px-3 py-2 flex items-center gap-3">
          <button
            onClick={togglePause}
            className="w-7 h-7 rounded bg-neon/10 hover:bg-neon/25 border border-neon/20 text-neon text-xs flex items-center justify-center transition-colors"
            title={paused ? 'Play' : 'Pause'}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          <button
            onClick={resetNow}
            className="h-7 px-2 rounded bg-neon/10 hover:bg-neon/25 border border-neon/20 text-neon text-2xs font-mono transition-colors"
            title="Reset to real-time"
          >
            NOW
          </button>
          <input
            type="range" min="-1" max="3.6" step="0.1" defaultValue="0"
            onChange={onWarp}
            className="w-40 accent-neon"
            title="Time warp (×0.1 – ×3600)"
          />
          <span className="text-2xs font-mono text-neon w-12 text-center tabular-nums">
            {warpLabel}
          </span>
        </div>
      </div>

      {/* ── Legend (bottom-right) ───────────────────────────────────────────── */}
      <div className="absolute bottom-8 right-4 z-[10] glass-panel rounded-lg px-3 py-2 flex flex-col gap-1 pointer-events-none">
        {[
          { c: '#FF3E3E', l: 'Critical 8+' },
          { c: '#FFB800', l: 'High 6-7' },
          { c: '#00F5FF', l: 'Medium 4-5' },
          { c: '#00E676', l: 'Low 1-3' },
        ].map(x => (
          <div key={x.l} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                 style={{ backgroundColor: x.c, boxShadow: `0 0 6px ${x.c}` }} />
            <span className="text-2xs text-text-muted">{x.l}</span>
          </div>
        ))}
      </div>

      {/* ── FPS indicator ─────────────────────────────────────────────────── */}
      <div className="absolute bottom-1 right-2 z-[10] text-2xs text-text-disabled font-mono pointer-events-none">
        {fps}
      </div>

      {/* ── Selected event popup ──────────────────────────────────────────── */}
      {selected && (
        <div
          className="absolute z-[20] glass-panel rounded-lg px-3 py-2 max-w-xs pointer-events-auto"
          style={{
            left: Math.min(selected.screen.x + 12, (wrapRef.current?.clientWidth ?? 0) - 280),
            top:  Math.max(selected.screen.y - 12, 12),
          }}
        >
          <button
            onClick={() => setSelected(null)}
            className="absolute top-1 right-2 text-text-muted hover:text-white text-sm leading-none"
          >×</button>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-2xs font-mono uppercase tracking-wider"
              style={{ color: `#${SEV_COLOR(selected.event.severity).toString(16).padStart(6, '0')}` }}
            >
              {SEV_LABEL(selected.event.severity)} {selected.event.severity}/10
            </span>
            <span className="text-2xs text-text-muted">·</span>
            <span className="text-2xs text-text-muted">{selected.event.country}</span>
          </div>
          <p className="text-xs text-text-primary leading-snug pr-3">{selected.event.headline}</p>
          <div className="text-2xs text-text-disabled mt-1 font-mono uppercase">
            {selected.event.source} · {selected.event.domain}
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {events.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[500] pointer-events-none">
          <div className="text-4xl mb-3">🛰️</div>
          <p className="text-sm text-text-muted">Ingesting live intelligence data…</p>
          <p className="text-xs text-text-disabled mt-1">First run takes ~30 seconds</p>
        </div>
      )}
    </div>
  );
}
