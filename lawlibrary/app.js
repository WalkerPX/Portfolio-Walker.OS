// Walker's Law Library: the Law School vault drawn as orbiting course systems, in the style of the
// Rho Network Obsidian plugin. Top level: the Law School "sun" with one orbit per course; each course
// keeps its notes sealed inside its globe. Clicking (or zooming into) a course opens its own system:
// the course hub note as the sun, one orbit ring per folder, one planet per note, wikilinks as threads.
// Data comes from data/manifest.json, built by tools/build-lawlibrary.mjs.
(() => {
  'use strict';

  const BASE = '/lawlibrary/';
  const DATA = BASE + 'data/';
  const TILT = 0.46;                        // how flat the orbit ellipses are (Rho's ring tilt)
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IN_DUR = REDUCED ? 1 : 1150, OUT_DUR = REDUCED ? 1 : 950, SWAP_DUR = REDUCED ? 1 : 600;

  const $ = (id) => document.getElementById(id);
  const canvas = $('sky'), ctx = canvas.getContext('2d');
  const els = { crumbs: $('crumbs'), legend: $('legend'), hint: $('hint'), tip: $('tip'), q: $('q'), sugg: $('sugg'),
    reader: $('reader'), rbar: $('rbar'), rBack: $('rBack'), rPath: $('rPath'), rNew: $('rNew'), rClose: $('rClose'), rScroll: $('rScroll'), doc: $('doc') };

  let W = 0, H = 0, DPR = 1;
  let M = null;
  const notesById = new Map(), courseById = new Map(), backlinks = new Map(), groupOfNote = new Map();
  const htmlCache = new Map();

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const mix = (hex, to, t) => { const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
    const c = [16, 8, 0].map((s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t)));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); };
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------------------------------------------------------------- routing
  const standalone = { on: false };
  function routeOf(pathname) {
    let p = pathname.replace(/index\.html$/, '');
    if (p === BASE.slice(0, -1)) p = BASE;
    if (!p.startsWith(BASE)) return { course: null, slug: null };
    const parts = p.slice(BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    return { course: parts[0] || null, slug: parts[1] || null };
  }
  function setUrl(path, replace) {
    if (location.pathname === path && !location.hash) return;
    try { history[replace ? 'replaceState' : 'pushState']({ law: path }, '', path); } catch (_) { /* file:// */ }
  }

  // ---------------------------------------------------------------- scenes
  function noteDegree(n) { return n.links.length + (backlinks.get(n.id) || []).length; }

  function buildRoot() {
    const cs = M.courses, rings = [], bodies = [];
    const R0 = 250, GAP = 165;
    const crossings = new Map();
    for (const n of M.notes) for (const l of n.links) {
      const t = notesById.get(l);
      if (!t || t.course === n.course) continue;
      const k = [n.course, t.course].sort().join('|');
      crossings.set(k, (crossings.get(k) || 0) + 1);
    }
    cs.forEach((c, i) => {
      const r = R0 + i * GAP;
      const ring = { r, color: c.color, w: 0.05 * Math.pow(220 / r, 1.5), phase: 0, label: null, course: c };
      rings.push(ring);
      bodies.push({ kind: 'course', course: c, ring, a0: i * 2.39996 + 0.6, size: c.count ? 15 + 3 * Math.sqrt(c.count) : 12,
        color: c.color, gem: c.gem, seed: (hash(c.id) % 1000) / 1000, specks: makeSpecks(c) });
    });
    const links = [...crossings].map(([k, n]) => { const [a, b] = k.split('|'); return { a: bodies.find((x) => x.course.id === a), b: bodies.find((x) => x.course.id === b), n }; });
    const R = rings.length ? rings[rings.length - 1].r : 200;
    return { kind: 'root', id: '', rings, bodies, links, R, maxBody: Math.max(...bodies.map((b) => b.size), 20),
      sun: { r: 64, color: '#e9e6df', gem: 'diamond', label: (M.root || 'Law School').toUpperCase(), sub: `${M.notes.length} notes · ${cs.length} courses`, note: null } };
  }
  function makeSpecks(c) {
    const R = rng(hash(c.id)), n = Math.min(c.count, 46), out = [];
    for (let i = 0; i < n; i++) out.push({ a: R() * Math.PI * 2, r: 1.5 + R() * 1.3, w: 0.25 + R() * 0.5, s: 0.6 + R() * 0.9 });
    return out;
  }

  function buildCourse(c) {
    const rings = [], bodies = [], ids = new Set();
    let r = 240;
    c.groups.forEach((g, gi) => {
      const n = g.notes.length;
      const lanes = n > 40 ? 2 : 1;
      r = Math.max(r, (n * 44) / lanes / (Math.PI * 2) + (lanes - 1) * 20);
      const gem = c.groups.length === 1 ? c.gem : RING_GEMS[gi % RING_GEMS.length], color = GEMS[gem].glow;
      const ring = { r, color, w: 0.04 * Math.pow(180 / r, 1.5) * (gi % 2 ? -1 : 1), phase: 0, label: g.name.toUpperCase(), group: g, count: n };
      rings.push(ring);
      const off = (hash(g.key) % 628) / 100;
      g.notes.forEach((id, k) => {
        const note = notesById.get(id);
        ids.add(id);
        const deg = noteDegree(note);
        bodies.push({ kind: 'note', note, ring, a0: off + (k / n) * Math.PI * 2, lane: lanes > 1 ? (k % 2 ? 20 : -20) : 0, size: clamp(6 + 1.3 * Math.sqrt(deg), 6.5, 15), color, gem, seed: (hash(id) % 1000) / 1000 });
      });
      r += 125 + (lanes - 1) * 30;
    });
    const hub = c.hub ? notesById.get(c.hub) : null;
    if (hub) ids.add(hub.id);
    const byId = new Map(bodies.map((b) => [b.note.id, b]));
    const seen = new Set(), links = [];
    for (const b of bodies) for (const l of b.note.links) {
      const o = byId.get(l);
      if (!o) continue;
      const k = b.note.id < l ? b.note.id + '|' + l : l + '|' + b.note.id;
      if (seen.has(k)) continue;
      seen.add(k); links.push({ a: b, b: o });
    }
    const R = rings.length ? Math.max(300, rings[rings.length - 1].r + 20) : 320;
    return { kind: 'course', id: c.id, course: c, rings, bodies, links, byId, R, maxBody: 18, empty: !rings.length,
      sun: { r: 54 + Math.min(22, Math.sqrt(c.count) * 1.7), color: c.color, gem: c.gem, label: c.name.toUpperCase(), sub: c.count ? `${c.count} note${c.count === 1 ? '' : 's'}` : 'no notes yet', note: hub } };
  }

  // ---------------------------------------------------------------- view state
  const scenes = new Map();
  const sceneFor = (id) => { if (!scenes.has(id)) scenes.set(id, id ? buildCourse(courseById.get(id)) : buildRoot()); return scenes.get(id); };
  let view = null;              // { scene, cam: {x, y, z} }
  let tr = null;                // transition in progress
  let hover = null;             // hovered body / sun / ring label
  let selected = null;          // note id shown in the reader
  let linkHover = null;         // note id hovered inside the reader
  let focusRing = null;         // ring highlighted from the legend or its label
  let labelRects = [];
  let lastT = performance.now(), clock = 0;

  function layout(scene) {
    const side = W > 760 ? 270 : 0, top = W > 760 ? 64 : 100, bottom = W > 760 ? 44 : 70;
    const availW = W - side - 30, availH = H - top - bottom;
    const vHalf = Math.max(scene.R * TILT + scene.maxBody, scene.sun.r * 1.25) + 34;
    const fit = Math.min(availW / (2 * (scene.R + scene.maxBody + (scene.kind === 'root' ? 80 : 20))), availH / (2 * vHalf));
    return { fit, cx: side + (W - side) / 2, cy: top + availH / 2 };
  }

  // positions for this frame
  function place(scene, cam, L) {
    const k = L.fit * cam.z, sz = L.fit * Math.pow(cam.z, 0.65);
    for (const ring of scene.rings) ring.sr = ring.r * k;
    for (const b of scene.bodies) {
      const a = b.a0 + b.ring.phase;
      const rr = b.ring.r + (b.lane || 0);
      b.wx = Math.cos(a) * rr; b.wy = Math.sin(a) * rr * TILT; b.d = Math.sin(a);
      b.px = L.cx + (b.wx - cam.x) * k; b.py = L.cy + (b.wy - cam.y) * k;
      b.pr = b.size * sz * (1 + 0.14 * b.d);
    }
    scene.sun.px = L.cx - cam.x * k; scene.sun.py = L.cy - cam.y * k; scene.sun.pr = scene.sun.r * sz;
    scene.k = k; scene.L = L;
  }

  // ---------------------------------------------------------------- stars
  const stars = (() => { const R = rng(7), out = []; for (let i = 0; i < 520; i++) out.push({ x: R(), y: R(), z: 0.2 + R() * 0.8, s: R() < 0.06 ? 1.6 : R() < 0.3 ? 1.1 : 0.7, ph: R() * 6.28, warm: R() < 0.22 }); return out; })();
  let comet = null, nextComet = 6;
  // faint clouds of Rho's palette colours behind everything; redrawn only when the window changes size
  let nebulaCv = null;
  function nebula() {
    if (nebulaCv && nebulaCv.w === W && nebulaCv.h === H) return nebulaCv;
    const cv = document.createElement('canvas'), sc = 0.25; cv.width = Math.max(1, Math.round((W + 80) * sc)); cv.height = Math.max(1, Math.round((H + 80) * sc));
    const g = cv.getContext('2d'), R = rng(31), cols = ['#9cc8f0', '#b8a8f0', '#8fd9b6', '#e89ab8', '#8f9ce8', '#efe0b0'];
    for (let i = 0; i < 9; i++) {
      const x = R() * cv.width, y = R() * cv.height, rad = (0.25 + R() * 0.35) * Math.max(cv.width, cv.height), c = cols[i % cols.length];
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(c, 0.045)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height);
    }
    cv.w = W; cv.h = H; nebulaCv = cv; return cv;
  }
  function drawSky(cam, L) {
    ctx.fillStyle = '#040405'; ctx.fillRect(0, 0, W, H);
    // ambient light round the system (Rho "deep": lift + vignette)
    const sun = view && view.scene ? view.scene.sun : null, tint = sun ? GEMS[sun.gem].glow : '#e9e6df';
    const g = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, Math.max(W, H) * 0.7);
    g.addColorStop(0, rgba(mix(tint, '#12151b', 0.85), 0.42)); g.addColorStop(0.3, 'rgba(14,16,21,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(nebula(), -cam.x * 0.02 - 40, -cam.y * 0.02 - 40, W + 80, H + 80); ctx.globalCompositeOperation = 'source-over';
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    const px = cam.x * 0.015, py = cam.y * 0.015;
    for (const s of stars) {
      const x = ((s.x * W - px * s.z * W * 0.02) % W + W) % W, y = ((s.y * H - py * s.z * H * 0.02) % H + H) % H;
      const tw = REDUCED ? 0.8 : 0.55 + 0.45 * Math.sin(clock * (0.6 + s.z) + s.ph);
      ctx.fillStyle = s.warm ? `rgba(255,226,190,${0.5 * s.z * tw})` : `rgba(220,228,255,${0.55 * s.z * tw})`;
      ctx.fillRect(x, y, s.s, s.s);
    }
    if (!REDUCED && !standalone.on) {
      nextComet -= dtSec;
      if (!comet && nextComet <= 0) { const R = Math.random; comet = { x: R() * W, y: R() * H * 0.4, vx: 380 + R() * 260, vy: 120 + R() * 140, life: 0 }; nextComet = 9 + Math.random() * 12; }
      if (comet) {
        comet.life += dtSec; comet.x += comet.vx * dtSec; comet.y += comet.vy * dtSec;
        const a = Math.sin(Math.min(1, comet.life / 1.1) * Math.PI) * 0.7;
        const gr = ctx.createLinearGradient(comet.x, comet.y, comet.x - comet.vx * 0.22, comet.y - comet.vy * 0.22);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = gr; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo(comet.x - comet.vx * 0.22, comet.y - comet.vy * 0.22); ctx.stroke();
        if (comet.life > 1.1) comet = null;
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  // ---------------------------------------------------------------- gems
  // Every orbit is cut from one stone. deep/mid/light colour the gem itself; glow is the matching
  // tone from Rho Network's "Classic" palette, used for halos, rings and links.
  const GEMS = {
    sapphire:   { deep: '#040d33', mid: '#1c4fd6', light: '#b4d0ff', glow: '#9cc8f0' },
    emerald:    { deep: '#02251a', mid: '#0c9a62', light: '#a6f7d4', glow: '#8fd9b6' },
    citrine:    { deep: '#402503', mid: '#d99a1e', light: '#ffeeb8', glow: '#efe0b0' },
    amethyst:   { deep: '#1a0840', mid: '#7646dc', light: '#e0d2ff', glow: '#b8a8f0' },
    ruby:       { deep: '#36040d', mid: '#c91f3c', light: '#ffbcc4', glow: '#e88b7a' },
    tourmaline: { deep: '#360823', mid: '#d4518f', light: '#ffd0e6', glow: '#e89ab8' },
    aquamarine: { deep: '#022b2a', mid: '#21aca7', light: '#c6fff8', glow: '#6fc7c0' },
    topaz:      { deep: '#371d03', mid: '#cc7a14', light: '#ffdca6', glow: '#e8b45c' },
    tanzanite:  { deep: '#101147', mid: '#4d59da', light: '#d2d6ff', glow: '#8f9ce8' },
    diamond:    { deep: '#222836', mid: '#aeb9cf', light: '#ffffff', glow: '#e9e6df' },
  };
  const COURSE_GEMS = ['sapphire', 'emerald', 'ruby', 'amethyst', 'citrine', 'aquamarine', 'tourmaline', 'topaz', 'tanzanite'];
  const RING_GEMS = ['citrine', 'amethyst', 'emerald', 'tourmaline', 'sapphire', 'aquamarine', 'topaz', 'ruby', 'tanzanite'];
  const SPR = 96, sprites = new Map();
  const TAU = Math.PI * 2;

  // A round brilliant seen from above: table, star, kite and girdle facets, lit from the upper left,
  // then a metallic sheen, a dark edge and a hard specular spot. Drawn once per gem and reused.
  function gemSprite(name) {
    const key = 'g:' + name;
    if (sprites.has(key)) return sprites.get(key);
    const G = GEMS[name], R = SPR, c = R + 4, cv = document.createElement('canvas');
    cv.width = cv.height = c * 2;
    const g = cv.getContext('2d');
    const body = g.createRadialGradient(c - R * 0.28, c - R * 0.32, R * 0.04, c, c, R);
    body.addColorStop(0, G.light); body.addColorStop(0.32, G.mid); body.addColorStop(0.82, G.deep); body.addColorStop(1, '#000000');
    g.fillStyle = body; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(c, c, R, 0, TAU); g.clip();
    const N = 8, LIGHT = -2.35, P = (a, r) => [c + Math.cos(a) * r, c + Math.sin(a) * r];
    const facet = (pts, a, k = 1) => {
      const s = 0.5 + 0.5 * Math.cos(a - LIGHT);
      g.fillStyle = s > 0.5 ? rgba(mix(G.mid, G.light, (s - 0.5) * 1.7), 0.5 * k) : rgba(mix(G.mid, G.deep, (0.5 - s) * 2), 0.62 * k);
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill();
      g.strokeStyle = rgba(G.light, 0.22); g.lineWidth = 0.9; g.stroke();
    };
    const T = 0.45 * R, S = 0.74 * R, E = R * 1.02;
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * TAU + Math.PI / N, t1 = t0 + TAU / N, m = (t0 + t1) / 2, mp = m - TAU / N;
      facet([P(t0, T), P(t1, T), P(m, S)], m, 1);                       // star
      facet([P(t0, T), P(mp, S), P(t0, E), P(m, S)], t0 + 0.3, 0.9);    // kite
      facet([P(m, S), P(t1 - TAU / N / 2, E), P(m, E)], m - 0.25, 0.8); // upper girdle halves
      facet([P(m, S), P(m, E), P(t1, E)], m + 0.25, 0.7);
    }
    const tp = []; for (let i = 0; i < N; i++) tp.push(P((i / N) * TAU + Math.PI / N, T));
    const tab = g.createLinearGradient(c - T, c - T, c + T, c + T);
    tab.addColorStop(0, rgba(G.light, 0.75)); tab.addColorStop(0.55, rgba(G.mid, 0.35)); tab.addColorStop(1, rgba(G.deep, 0.55));
    g.fillStyle = tab; g.beginPath(); tp.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill();
    g.strokeStyle = rgba(G.light, 0.35); g.lineWidth = 1; g.stroke();
    // metallic sheen: a bright diagonal band and a coloured counter-light
    g.globalCompositeOperation = 'screen';
    const sh = g.createLinearGradient(c - R, c - R, c + R, c + R);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.3, 'rgba(255,255,255,0.32)'); sh.addColorStop(0.42, 'rgba(255,255,255,0.04)');
    sh.addColorStop(0.7, 'rgba(255,255,255,0)'); sh.addColorStop(0.9, rgba(G.light, 0.28)); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, c * 2, c * 2);
    g.globalCompositeOperation = 'source-over';
    const edge = g.createRadialGradient(c, c, R * 0.62, c, c, R);
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = edge; g.fillRect(0, 0, c * 2, c * 2);
    const sp = g.createRadialGradient(c - R * 0.36, c - R * 0.42, 0, c - R * 0.36, c - R * 0.42, R * 0.34);
    sp.addColorStop(0, 'rgba(255,255,255,0.95)'); sp.addColorStop(0.25, 'rgba(255,255,255,0.45)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp; g.fillRect(0, 0, c * 2, c * 2);
    g.restore();
    g.strokeStyle = rgba(G.light, 0.85); g.lineWidth = 2; g.beginPath(); g.arc(c, c, R - 1, 0, TAU); g.stroke();
    g.strokeStyle = rgba(G.deep, 0.9); g.lineWidth = 1.5; g.beginPath(); g.arc(c, c, R - 3, 0, TAU); g.stroke();
    sprites.set(key, cv);
    return cv;
  }
  function glowSprite(hex) {
    const key = 'w:' + hex;
    if (sprites.has(key)) return sprites.get(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgba(hex, 0.9)); gr.addColorStop(0.12, rgba(hex, 0.5)); gr.addColorStop(0.35, rgba(hex, 0.14)); gr.addColorStop(0.7, rgba(hex, 0.03)); gr.addColorStop(1, rgba(hex, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    sprites.set(key, cv);
    return cv;
  }
  function drawGlow(hex, x, y, rad, a) {
    if (a <= 0.003 || rad < 1) return;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(glowSprite(hex), x - rad, y - rad, rad * 2, rad * 2);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function drawGem(name, x, y, r, a) {
    if (a <= 0.003) return;
    const sp = gemSprite(name), s = sp.width * (r / SPR);
    ctx.globalAlpha = Math.min(1, a); ctx.drawImage(sp, x - s / 2, y - s / 2, s, s); ctx.globalAlpha = 1;
  }
  // the four-point glint a cut stone throws now and then
  function sparkle(x, y, size, a) {
    if (a <= 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const [dx, dy, w] of [[1, 0, 1], [0, 1, 1], [0.7, 0.7, 0.45], [0.7, -0.7, 0.45]]) {
      const L = size * w, gr = ctx.createLinearGradient(x - dx * L, y - dy * L, x + dx * L, y + dy * L);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = gr; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x - dx * L, y - dy * L); ctx.lineTo(x + dx * L, y + dy * L); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function ringArc(scene, ring, front, alpha) {
    const { px, py } = scene.sun, a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : TAU;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.ellipse(px, py, ring.sr, ring.sr * TILT, 0, a0, a1);
    ctx.strokeStyle = rgba(ring.color, alpha * 0.28); ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = rgba(ring.color, alpha * 0.5); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = rgba(mix(ring.color, '#ffffff', 0.3), alpha); ctx.lineWidth = 1; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  function glowText(text, x, y, color, alpha, font) {
    ctx.font = font; ctx.textAlign = 'center';
    ctx.save(); ctx.shadowColor = rgba(color, 0.9 * alpha); ctx.shadowBlur = 12;
    ctx.fillStyle = rgba(color, 0.55 * alpha); ctx.fillText(text, x, y); ctx.restore();
    ctx.fillStyle = rgba(mix(color, '#ffffff', 0.55), 0.95 * alpha); ctx.fillText(text, x, y);
  }
  function drawSun(scene, alpha) {
    const s = scene.sun, r = s.pr, G = GEMS[s.gem], hot = hover && hover.sun === s;
    const pulse = REDUCED ? 0.5 : 0.5 + 0.5 * Math.sin(clock * 0.9);
    drawGlow(G.glow, s.px, s.py, r * 6.5, (0.5 + 0.12 * pulse) * alpha);
    drawGlow(G.light, s.px, s.py, r * 2.4, (0.35 + (hot ? 0.25 : 0)) * alpha);
    drawGem(s.gem, s.px, s.py, r, alpha);
    if (!REDUCED) { const tw = Math.sin(clock * 0.7 + 1.3); if (tw > 0.6) sparkle(s.px - r * 0.36, s.py - r * 0.42, r * 0.9, (tw - 0.6) * 2 * alpha); }
    glowText(spaced(s.label), s.px, s.py - r - 16, G.glow, alpha, '500 11.5px "JetBrains Mono", ui-monospace, monospace');
    ctx.font = '9.5px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(185,182,174,${0.85 * alpha})`;
    ctx.fillText(s.sub.toUpperCase(), s.px, s.py + r + 20);
  }
  const spaced = (t) => t.split('').join(' ');

  function drawCourseBody(b, alpha, hot) {
    const r = b.pr, G = GEMS[b.gem], empty = !b.course.count;
    drawGlow(G.glow, b.px, b.py, r * 5, (hot ? 0.85 : 0.55) * alpha * (empty ? 0.5 : 1));
    // the sealed system: specks of its notes circle inside a faint ring round the gem
    const back = [], front = [];
    for (const s of b.specks) { const a = s.a + clock * s.w * (REDUCED ? 0 : 1); (Math.sin(a) < 0 ? back : front).push([s, a]); }
    const dot = (s, a) => { const x = b.px + Math.cos(a) * s.r * r, y = b.py + Math.sin(a) * s.r * r * TILT; drawGlow(G.glow, x, y, Math.max(2, s.s * r * 0.22), 0.5 * alpha); };
    const orbit = (f) => { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(G.glow, (hot ? 0.6 : 0.32) * alpha); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(b.px, b.py, r * 2.3, r * 2.3 * TILT, 0, f ? 0 : Math.PI, f ? Math.PI : TAU); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; };
    orbit(false);
    for (const [s, a] of back) dot(s, a);
    drawGem(b.gem, b.px, b.py, r, alpha * (empty ? 0.45 : 1));
    if (!REDUCED && !empty) { const tw = Math.sin(clock * 1.1 + b.seed * 9); if (tw > 0.82) sparkle(b.px - r * 0.36, b.py - r * 0.42, r * 0.8, (tw - 0.82) * 5 * alpha); }
    orbit(true);
    for (const [s, a] of front) dot(s, a);
    const ly = b.py + r * 2.3 * TILT + r * 0.25 + 18;
    glowText(spaced(b.course.name.toUpperCase()), b.px, ly, G.glow, alpha * (hot ? 1 : 0.85), `500 ${hot ? 11 : 10.5}px "JetBrains Mono", ui-monospace, monospace`);
    ctx.font = '9px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(150,153,160,${0.95 * alpha})`;
    ctx.fillText(b.course.count ? `${b.course.count} NOTE${b.course.count === 1 ? '' : 'S'}` : 'EMPTY', b.px, ly + 13);
  }

  function drawNoteBody(b, alpha, lit) {
    const r = b.pr, a = alpha * (0.6 + 0.4 * (b.d + 1) / 2);
    drawGlow(b.color, b.px, b.py, r * 4.4, (lit ? 0.95 : 0.42) * a);
    drawGem(b.gem, b.px, b.py, r, a);
    if (!REDUCED && r > 3) { const tw = Math.sin(clock * 1.6 + b.seed * 40); if (tw > 0.94) sparkle(b.px - r * 0.36, b.py - r * 0.42, r * 1.5, (tw - 0.94) * 14 * a); }
    if (lit) { ctx.strokeStyle = `rgba(255,255,255,${0.8 * alpha})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(b.px, b.py, r + 3.5, 0, TAU); ctx.stroke(); }
  }

  function label(text, x, y, alpha, strong) {
    const t = text.length > 34 ? text.slice(0, 32) + '…' : text;
    ctx.font = `${strong ? 500 : 400} 10.5px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = `rgba(4,4,5,${0.85 * alpha})`; ctx.strokeText(t, x, y);
    ctx.fillStyle = strong ? `rgba(255,255,255,${alpha})` : `rgba(200,198,190,${0.85 * alpha})`; ctx.fillText(t, x, y);
  }

  function drawScene(scene, cam, alpha) {
    if (alpha <= 0.002) return;
    const L = layout(scene);
    place(scene, cam, L);
    const course = scene.kind === 'course';
    const active = hover && hover.body ? hover.body : null;
    const focusId = course ? (linkHover || (active && active.note && active.note.id) || selected) : null;
    const nbr = new Set();
    if (focusId && course) {
      const n = notesById.get(focusId);
      if (n) { for (const l of n.links) nbr.add(l); for (const l of backlinks.get(focusId) || []) nbr.add(l); }
    }
    const dimRing = (ring) => (focusRing && focusRing !== ring ? 0.3 : 1);

    // back halves of the rings
    for (const ring of scene.rings) ringArc(scene, ring, false, (course ? 0.13 : 0.12) * alpha * dimRing(ring) * (focusRing === ring ? 2.4 : 1));

    // links
    if (scene.links.length) {
      if (course) {
        ctx.lineWidth = 0.6; ctx.strokeStyle = `rgba(200,205,215,${(focusId ? 0.025 : 0.05) * alpha})`;
        ctx.beginPath();
        for (const l of scene.links) { ctx.moveTo(l.a.px, l.a.py); ctx.lineTo(l.b.px, l.b.py); }
        ctx.stroke();
        if (focusId && scene.byId.has(focusId)) {
          const fb = scene.byId.get(focusId);
          ctx.lineWidth = 1; ctx.strokeStyle = rgba(fb.color, 0.7 * alpha);
          ctx.beginPath();
          for (const id of nbr) { const o = scene.byId.get(id); if (o) { ctx.moveTo(fb.px, fb.py); ctx.lineTo(o.px, o.py); } }
          ctx.stroke();
        }
      } else {
        for (const l of scene.links) {
          if (!l.a || !l.b) continue;
          ctx.strokeStyle = `rgba(233,230,223,${Math.min(0.28, 0.05 + Math.log10(l.n + 1) * 0.08) * alpha})`; ctx.lineWidth = 1;
          const mx = (l.a.px + l.b.px) / 2, my = (l.a.py + l.b.py) / 2 - 40;
          ctx.beginPath(); ctx.moveTo(l.a.px, l.a.py); ctx.quadraticCurveTo(mx, my, l.b.px, l.b.py); ctx.stroke();
        }
      }
    }

    const order = scene.bodies.slice().sort((p, q) => p.d - q.d);
    const drawBody = (b) => {
      if (course) {
        const lit = b.note.id === focusId || b.note.id === selected;
        const dim = (focusId && !lit && !nbr.has(b.note.id) ? 0.35 : 1) * dimRing(b.ring);
        drawNoteBody(b, alpha * dim, lit || nbr.has(b.note.id) && !!linkHover);
      } else drawCourseBody(b, alpha * (focusRing && focusRing !== b.ring ? 0.4 : 1), hover && hover.body === b);
    };
    for (const b of order) if (b.d < 0) drawBody(b);
    drawSun(scene, alpha);
    for (const ring of scene.rings) ringArc(scene, ring, true, (course ? 0.26 : 0.22) * alpha * dimRing(ring) * (focusRing === ring ? 2 : 1));
    for (const b of order) if (b.d >= 0) drawBody(b);

    // names: rings at their front, planets when there is room (Rho's "near names")
    if (course) {
      if (alpha > 0.5) labelRects = [];
      // ring names sit where each ring crosses a line out from the sun at the lower right,
      // so they step outward like a staircase instead of piling up at the front
      ctx.font = '500 9.5px "JetBrains Mono", ui-monospace, monospace';
      const A = 0.3 * Math.PI, ca = Math.cos(A), sa = Math.sin(A);
      for (const ring of scene.rings) {
        const x = scene.sun.px + ring.sr * ca + 8, y = scene.sun.py + ring.sr * TILT * sa + 4;
        const t = spaced(ring.label) + '  ' + ring.count;
        const on = focusRing === ring || (hover && hover.ring === ring);
        const w = ctx.measureText(t).width;
        ctx.textAlign = 'left';
        ctx.fillStyle = `rgba(4,4,5,${0.72 * alpha})`; ctx.fillRect(x - 4, y - 10, w + 8, 14);
        ctx.fillStyle = rgba(ring.color, (on ? 1 : 0.75) * alpha * dimRing(ring)); ctx.fillText(t, x, y);
        if (alpha > 0.5) labelRects.push({ ring, x: x - 4, y: y - 10, w: w + 8, h: 14 });
      }
      for (const b of order) {
        const id = b.note.id;
        const room = view && view.cam.z > 1.6 && (2 * Math.PI * b.ring.sr) / Math.max(1, b.ring.count) > 190;
        const show = id === focusId || id === selected || (focusId && nbr.has(id) && b.d > -0.6) || (room && b.d > 0.25 && !focusId) || (focusRing === b.ring && b.d > 0.2 && (2 * Math.PI * b.ring.sr) / b.ring.count > 60);
        if (show) label(b.note.title, b.px, b.py - b.pr - 7, alpha * (id === focusId ? 1 : 0.85), id === focusId || id === selected);
      }
    }
    if (scene.empty && alpha > 0.1) {
      ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(scene.sun.color, 0.35 * alpha);
      ctx.beginPath(); ctx.ellipse(scene.sun.px, scene.sun.py, scene.sun.pr * 3, scene.sun.pr * 3 * TILT, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ---------------------------------------------------------------- loop
  let dtSec = 0, running = false;
  function frame(now) {
    running = false;
    dtSec = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!REDUCED) clock += dtSec;
    const spin = REDUCED ? 0 : 1;
    for (const sc of [view && view.scene, tr && tr.from.scene].filter(Boolean)) for (const ring of sc.rings) ring.phase += ring.w * dtSec * spin;

    if (tr) {
      const p = clamp((now - tr.t0) / tr.dur, 0, 1), e = ease(p);
      const { from, to } = tr;
      if (tr.dir === 'in') {
        const b = tr.body, zBig = Math.max(4, (Math.min(W, H) * 0.42) / (b.size * layout(from.scene).fit));
        place(from.scene, from.cam, layout(from.scene));
        from.cam.x = lerp(tr.c0.x, b.wx, e); from.cam.y = lerp(tr.c0.y, b.wy, e); from.cam.z = lerp(tr.c0.z, zBig, e * e);
        to.cam.z = lerp(0.12, 1, sstep(0.35, 1, p));
        drawSky(from.cam, layout(from.scene));
        drawScene(from.scene, from.cam, 1 - sstep(0.4, 0.78, p));
        drawScene(to.scene, to.cam, sstep(0.5, 0.95, p));
      } else if (tr.dir === 'out') {
        const b = tr.body;
        place(to.scene, to.cam, layout(to.scene));
        const zBig = Math.max(4, (Math.min(W, H) * 0.42) / (b.size * layout(to.scene).fit));
        to.cam.x = lerp(b.wx, 0, e); to.cam.y = lerp(b.wy, 0, e); to.cam.z = lerp(zBig, 1, 1 - Math.pow(1 - e, 2));
        from.cam.z = lerp(tr.c0.z, 0.12, e);
        drawSky(to.cam, layout(to.scene));
        drawScene(from.scene, from.cam, 1 - sstep(0.0, 0.45, p));
        drawScene(to.scene, to.cam, sstep(0.25, 0.7, p));
      } else {
        to.cam.z = lerp(0.72, 1, e);
        drawSky(to.cam, layout(to.scene));
        drawScene(from.scene, from.cam, 1 - sstep(0, 0.5, p));
        drawScene(to.scene, to.cam, sstep(0.25, 1, p));
      }
      if (p >= 1) { view = to; tr = null; afterView(); }
    } else if (view) {
      // smooth camera
      const c = view.cam, t = view.target;
      if (t) { const f = 1 - Math.pow(0.0008, dtSec); c.x = lerp(c.x, t.x, f); c.y = lerp(c.y, t.y, f); c.z = lerp(c.z, t.z, f); if (Math.abs(c.z - t.z) < 1e-3 && Math.abs(c.x - t.x) < 0.05 && Math.abs(c.y - t.y) < 0.05) { Object.assign(c, t); view.target = null; } }
      drawSky(view.cam, layout(view.scene));
      drawScene(view.scene, view.cam, 1);
      if (!standalone.on && !tr) checkZoomThresholds();
    }
    if (hover && hover.body && !tr) positionTip();
    if (!document.hidden && !standalone.on) schedule();
  }
  function schedule() { if (!running) { running = true; requestAnimationFrame(frame); } }
  function redraw() { if (standalone.on) { lastT = performance.now(); frame(lastT); } else schedule(); }

  // ---------------------------------------------------------------- navigation
  function freshCam() { return { x: 0, y: 0, z: 1 }; }
  function goRoot({ push = true } = {}) {
    if (tr || !view || view.scene.kind === 'root') return;
    const root = sceneFor('');
    const body = root.bodies.find((b) => b.course.id === view.scene.id);
    const to = { scene: root, cam: freshCam() };
    focusRing = null; hover = null; hideTip();
    tr = { dir: 'out', from: view, to, body, t0: performance.now(), dur: OUT_DUR, c0: { ...view.cam } };
    view.target = null;
    if (push) setUrl(BASE);
    renderChrome(root);
    schedule();
  }
  function goCourse(id, { push = true } = {}) {
    if (!courseById.has(id) || tr) return;
    if (view && view.scene.id === id && view.scene.kind === 'course') return;
    const to = { scene: sceneFor(id), cam: freshCam() };
    focusRing = null; hover = null; hideTip();
    if (!view) { view = to; afterView(); }
    else if (view.scene.kind === 'root') {
      const body = view.scene.bodies.find((b) => b.course.id === id);
      tr = { dir: 'in', from: view, to, body, t0: performance.now(), dur: IN_DUR, c0: { ...view.cam } };
    } else tr = { dir: 'swap', from: view, to, t0: performance.now(), dur: SWAP_DUR };
    if (view) view.target = null;
    if (push) setUrl(BASE + id + '/');
    renderChrome(to.scene);
    schedule();
  }
  function afterView() { renderChrome(view.scene); }

  let zoomIntent = 0, zoomPt = { x: 0, y: 0 };
  function checkZoomThresholds() {
    if (!zoomIntent) return;
    const c = view.cam;
    if (view.scene.kind === 'root' && zoomIntent > 0 && c.z > 2.6) {
      // zoomed deep into a course globe: open it
      const cx = zoomPt.x, cy = zoomPt.y;
      let best = null, bd = Infinity;
      for (const b of view.scene.bodies) { const d = Math.hypot(b.px - cx, b.py - cy) - b.pr * 2.5; if (d < bd) { bd = d; best = b; } }
      if (best && bd < Math.min(W, H) * 0.25 && best.course) { zoomIntent = 0; goCourse(best.course.id); return; }
    }
    if (view.scene.kind === 'course' && zoomIntent < 0 && c.z < 0.5) { zoomIntent = 0; goRoot(); return; }
    zoomIntent = 0;
  }

  // ---------------------------------------------------------------- chrome (crumbs, legend, hint)
  function renderChrome(scene) {
    const c = scene.kind === 'course' ? scene.course : null;
    els.crumbs.innerHTML = '';
    const crumb = (text, fn, cur) => { const b = document.createElement(fn ? 'button' : 'span'); b.textContent = text; if (fn) { b.type = 'button'; b.onclick = fn; } if (cur) b.className = 'cur'; els.crumbs.appendChild(b); };
    const sep = () => { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '›'; els.crumbs.appendChild(s); };
    if (standalone.on) {
      const a = document.createElement('a'); a.href = BASE; a.textContent = M.root; a.style.textDecoration = 'none'; els.crumbs.appendChild(a);
      const n = selected && notesById.get(selected);
      if (n) { sep(); const b = document.createElement('a'); b.href = BASE + n.course + '/'; b.textContent = courseById.get(n.course).name; b.style.textDecoration = 'none'; b.className = 'cur'; els.crumbs.appendChild(b); }
      return;
    }
    document.title = c ? `${c.name} · Walker's Law Library` : "Walker's Law Library";
    if (c) {
      crumb(M.root, () => goRoot()); sep(); crumb(c.name, null, true);
      const out = document.createElement('button'); out.type = 'button'; out.className = 'out'; out.textContent = 'Zoom out'; out.title = 'Back to all courses (Esc)'; out.onclick = () => goRoot();
      els.crumbs.appendChild(out);
    } else crumb(M.root, null, true);

    const L = els.legend;
    const shut = L.classList.contains('shut') || (W <= 760 && !L.dataset.touched);
    L.innerHTML = '';
    L.classList.toggle('shut', shut);
    const tg = document.createElement('button'); tg.type = 'button'; tg.className = 'toggle';
    tg.innerHTML = `<span>${c ? 'Orbits in ' + esc(c.name) : 'Course orbits'}</span><span>${shut ? '▴' : '▾'}</span>`;
    tg.onclick = () => { L.dataset.touched = '1'; L.classList.toggle('shut'); tg.lastChild.textContent = L.classList.contains('shut') ? '▴' : '▾'; };
    L.appendChild(tg);
    const h = document.createElement('h2');
    if (!c) {
      h.textContent = 'Course orbits'; L.appendChild(h);
      for (const course of M.courses) {
        const b = row(course.color, course.name, course.count || '—', () => goCourse(course.id));
        if (!course.count) b.classList.add('empty');
        b.title = course.count ? `Open the ${course.name} orbit` : `${course.name}: no notes yet`;
        b.onmouseenter = () => { focusRing = view && view.scene.rings.find((r) => r.course === course) || null; };
        b.onmouseleave = () => { focusRing = null; };
        L.appendChild(b);
      }
      els.hint.textContent = 'Click or zoom into a course to open its orbit · drag to pan · scroll to zoom';
    } else {
      const hub = c.hub && notesById.get(c.hub);
      if (hub) { const b = row('#e9e6df', `${c.name} hub note`, '', () => openNote(hub.id)); b.classList.add('hubrow'); L.appendChild(b); }
      h.textContent = c.groups.length ? 'Orbits' : 'Only the hub note so far'; L.appendChild(h);
      const sc = scene;
      c.groups.slice().reverse().forEach((g) => {
        const ring = sc.rings.find((r) => r.group === g);
        const b = row(ring.color, g.name, g.notes.length, () => toggleRing(ring));
        b.dataset.key = g.key;
        b.onmouseenter = () => { if (!focusRing) hover = { ring }; };
        b.onmouseleave = () => { if (hover && hover.ring === ring) hover = null; };
        L.appendChild(b);
        if (focusRing === ring) {
          b.classList.add('on');
          const list = document.createElement('div'); list.className = 'notes';
          for (const id of g.notes) {
            const n = notesById.get(id), nb = document.createElement('button');
            nb.type = 'button'; nb.textContent = n.title; nb.title = n.title; if (id === selected) nb.className = 'on';
            nb.onclick = () => openNote(id);
            nb.onmouseenter = () => { linkHover = id; }; nb.onmouseleave = () => { linkHover = null; };
            list.appendChild(nb);
          }
          L.appendChild(list);
        }
      });
      els.hint.textContent = 'Click a planet to read it · click an orbit name to focus it · Esc or zoom out to return';
    }
  }
  function row(color, name, n, fn) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'row';
    b.innerHTML = `<span class="dot" style="background:${color};color:${color}"></span><span class="nm">${esc(name)}</span><span class="n">${n}</span>`;
    b.onclick = fn; return b;
  }
  function toggleRing(ring) { focusRing = focusRing === ring ? null : ring; renderChrome(view.scene); schedule(); }

  // ---------------------------------------------------------------- picking & input
  function pickAt(x, y) {
    if (!view || tr) return null;
    const sc = view.scene;
    for (const r of labelRects) if (sc.kind === 'course' && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { ring: r.ring };
    let best = null, bd = Infinity;
    for (const b of sc.bodies) {
      const rr = sc.kind === 'root' ? b.pr * 1.9 : Math.max(b.pr + 5, 10);
      const d = Math.hypot(b.px - x, b.py - y);
      if (d < rr && d - b.d * 2 < bd) { bd = d - b.d * 2; best = b; }
    }
    if (best) return { body: best };
    if (Math.hypot(sc.sun.px - x, sc.sun.py - y) < sc.sun.pr) return { sun: sc.sun };
    return null;
  }
  let lastMouse = { x: 0, y: 0 };
  function positionTip() {
    const t = els.tip; if (t.hidden) return;
    let x = lastMouse.x + 14, y = lastMouse.y + 14;
    if (x + t.offsetWidth > W - 8) x = lastMouse.x - t.offsetWidth - 14;
    if (y + t.offsetHeight > H - 8) y = lastMouse.y - t.offsetHeight - 14;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function showTip(html) { els.tip.innerHTML = html; els.tip.hidden = false; positionTip(); }
  function hideTip() { els.tip.hidden = true; }
  function updateHover(x, y) {
    const h = pickAt(x, y);
    hover = h;
    canvas.classList.toggle('hot', !!(h && (h.body || h.ring || (h.sun && h.sun.note))));
    if (h && h.body) {
      if (h.body.course) {
        const c = h.body.course;
        showTip(`<b>${esc(c.name)}</b><small>${c.count ? `${c.count} notes · ${c.groups.length} orbit${c.groups.length === 1 ? '' : 's'} · click to open` : 'No notes yet'}</small>`);
      } else {
        const n = h.body.note, deg = noteDegree(n);
        showTip(`<b>${esc(n.title)}</b>${n.meta.citation ? `<br>${esc(n.meta.citation)}` : ''}<small>${esc(groupOfNote.get(n.id) || '')} · ${deg} link${deg === 1 ? '' : 's'}</small>`);
      }
    } else if (h && h.sun && h.sun.note) showTip(`<b>${esc(h.sun.note.title)}</b><small>Course hub · click to read</small>`);
    else if (h && h.sun) showTip(`<b>${esc(M.root)}</b><small>${M.notes.length} notes across ${M.courses.length} courses</small>`);
    else hideTip();
  }
  function clickAt(x, y) {
    const h = pickAt(x, y);
    if (!h) return;
    if (h.ring) return toggleRing(h.ring);
    if (h.body && h.body.course) return goCourse(h.body.course.id);
    if (h.body && h.body.note) return openNote(h.body.note.id);
    if (h.sun && h.sun.note) return openNote(h.sun.note.id);
  }
  function screenToWorld(x, y) { const sc = view.scene, L = layout(sc), k = L.fit * view.cam.z; return { x: (x - L.cx) / k + view.cam.x, y: (y - L.cy) / k + view.cam.y }; }
  function zoomAt(x, y, factor) {
    if (!view || tr) return;
    const cam = view.target || { ...view.cam };
    const before = screenToWorld(x, y);
    const z = clamp(cam.z * factor, 0.3, 9);
    const L = layout(view.scene), k = L.fit * z;
    view.target = { x: before.x - (x - L.cx) / k, y: before.y - (y - L.cy) / k, z };
    // keep the world point under the cursor without waiting for the ease
    view.cam.z = lerp(view.cam.z, z, 0.5);
    zoomIntent = factor > 1 ? 1 : -1; zoomPt = { x, y };
    schedule();
  }

  const pointers = new Map();
  let drag = null, pinch = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (standalone.on) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0, cam: { ...view.cam } };
    else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; }
  });
  canvas.addEventListener('pointermove', (e) => {
    lastMouse = { x: e.clientX, y: e.clientY };
    if (standalone.on) return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0 && pinch.d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
      pinch.d = d; return;
    }
    if (drag && view && !tr) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      if (drag.moved > 4) {
        canvas.classList.add('drag'); hideTip();
        const k = layout(view.scene).fit * view.cam.z;
        view.cam.x = drag.cam.x - dx / k; view.cam.y = drag.cam.y - dy / k; view.target = null;
        schedule();
      }
      return;
    }
    if (e.pointerType === 'mouse') updateHover(e.clientX, e.clientY);
  });
  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
    canvas.classList.remove('drag');
    if (drag && drag.moved <= 4 && e.type === 'pointerup') clickAt(e.clientX, e.clientY);
    drag = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { if (!drag) { hover = null; hideTip(); canvas.classList.remove('hot'); } });
  canvas.addEventListener('wheel', (e) => { if (standalone.on) return; e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-clamp(e.deltaY, -120, 120) * 0.0022)); }, { passive: false });
  canvas.addEventListener('dblclick', (e) => { if (!view || tr || pickAt(e.clientX, e.clientY)) return; view.target = freshCam(); schedule(); });

  document.addEventListener('keydown', (e) => {
    const typing = e.target === els.q;
    if (e.key === '/' && !typing) { e.preventDefault(); els.q.focus(); els.q.select(); return; }
    if (e.key === 'Escape') {
      if (typing) { closeSugg(); els.q.blur(); return; }
      if (!els.reader.hidden && !standalone.on) { closeReader(); return; }
      if (focusRing) { focusRing = null; renderChrome(view.scene); return; }
      if (view && view.scene.kind === 'course' && !standalone.on) goRoot();
    }
  });

  // ---------------------------------------------------------------- search
  let suggRows = [], suggAt = 0;
  const haystack = new Map();
  function searchNotes(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const n of M.notes) {
      const hay = haystack.get(n.id);
      if (!words.every((w) => hay.includes(w))) continue;
      const t = n.title.toLowerCase(), q0 = words.join(' ');
      const score = (t.startsWith(q0) ? 0 : t.includes(q0) ? 1 : words.every((w) => t.includes(w)) ? 2 : 3) * 1000 + t.length;
      out.push([score, n]);
    }
    for (const c of M.courses) if (c.name.toLowerCase().includes(words.join(' '))) out.push([-1, { course: c }]);
    return out.sort((a, b) => a[0] - b[0]).slice(0, 14).map((x) => x[1]);
  }
  function renderSugg() {
    const rows = suggRows;
    els.sugg.innerHTML = rows.length ? '' : '<li class="none">No matching notes</li>';
    rows.forEach((r, i) => {
      const li = document.createElement('li'); li.setAttribute('role', 'option'); li.setAttribute('aria-selected', i === suggAt ? 'true' : 'false');
      if (r.course) li.innerHTML = `<span class="dot" style="background:${r.course.color}"></span><span class="t">${esc(r.course.name)}</span><span class="c">Course orbit</span>`;
      else { const c = courseById.get(r.course); li.innerHTML = `<span class="dot" style="background:${c.color}"></span><span class="t">${esc(r.title)}</span><span class="c">${esc(c.name)}</span>`; }
      li.onmousedown = (e) => { e.preventDefault(); chooseSugg(i); };
      els.sugg.appendChild(li);
    });
    els.sugg.hidden = false;
  }
  function closeSugg() { els.sugg.hidden = true; suggRows = []; }
  function chooseSugg(i) {
    const r = suggRows[i]; if (!r) return;
    closeSugg(); els.q.value = ''; els.q.blur();
    if (r.course && typeof r.course === 'object') { if (standalone.on) location.href = BASE + r.course.id + '/'; else goCourse(r.course.id); return; }
    if (standalone.on) { openNote(r.id); return; }
    if (!view || view.scene.id !== r.course) goCourse(r.course);
    openNote(r.id);
  }
  els.q.addEventListener('input', () => { suggRows = searchNotes(els.q.value); suggAt = 0; if (els.q.value.trim()) renderSugg(); else closeSugg(); });
  els.q.addEventListener('keydown', (e) => {
    if (els.sugg.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); suggAt = Math.min(suggRows.length - 1, suggAt + 1); renderSugg(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); suggAt = Math.max(0, suggAt - 1); renderSugg(); }
    else if (e.key === 'Enter') { e.preventDefault(); chooseSugg(suggAt); }
  });
  els.q.addEventListener('blur', () => setTimeout(closeSugg, 120));

  // ---------------------------------------------------------------- reader
  const hist = { stack: [], at: -1 };
  async function fetchNote(id) {
    if (htmlCache.has(id)) return htmlCache.get(id);
    const p = fetch(DATA + 'notes/' + id + '.html').then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
    htmlCache.set(id, p);
    p.catch(() => htmlCache.delete(id));
    return p;
  }
  function metaBlock(n) {
    const m = n.meta, rows = [];
    const add = (k, v) => { if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) rows.push(`<dt>${k}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v)}</dd>`); };
    add('Citation', m.citation); add('Court', m.court); add('Casebook', m.casebook); add('Week', m.week); add('Professor', m.professor); add('Term', m.term);
    const chips = (m.topics || []).map((t) => `<span class="chip">${esc(String(t).replace(/-/g, ' '))}</span>`).join('');
    return (rows.length ? `<dl class="d-meta">${rows.join('')}</dl>` : '') + (chips ? `<div class="chips">${chips}</div>` : '');
  }
  async function openNote(id, { record = true, heading = null, pushUrl = standalone.on } = {}) {
    const n = notesById.get(id); if (!n) return;
    const c = courseById.get(n.course);
    selected = id;
    if (record) { hist.stack.length = hist.at + 1; hist.stack.push(id); hist.at = hist.stack.length - 1; }
    els.rBack.disabled = hist.at <= 0;
    els.reader.hidden = false;
    els.rPath.innerHTML = `${esc(c.name)} › <i>${esc(groupOfNote.get(id) || 'Course hub')}</i>`;
    if (standalone.on) {
      els.rNew.href = BASE + n.course + '/#' + n.slug; els.rNew.target = '_self';
      els.rNew.innerHTML = 'View in orbit <span aria-hidden="true">&#8599;</span>'; els.rNew.title = 'Open the course orbit with this note';
      document.title = `${n.title} · Walker's Law Library`;
      if (pushUrl) setUrl(BASE + id + '/');
      if (!view || view.scene.id !== n.course) { view = { scene: sceneFor(n.course), cam: freshCam() }; }
      renderChrome(view.scene);
      redraw();
    } else els.rNew.href = BASE + id + '/';
    els.doc.style.setProperty('--accent', c.color);
    const head = `<header class="d-head"><div class="d-kicker"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}${groupOfNote.get(id) ? ' · ' + esc(groupOfNote.get(id)) : ''}</div><h1 class="d-title">${esc(n.title)}</h1>${metaBlock(n)}</header>`;
    els.doc.innerHTML = head + '<p class="loading">Loading…</p>';
    els.rScroll.scrollTop = 0;
    let html;
    try { html = await fetchNote(id); } catch (_) { if (selected === id) els.doc.innerHTML = head + '<p class="err">This note could not be loaded.</p>'; return; }
    if (selected !== id) return;
    const bl = (backlinks.get(id) || []).map((b) => notesById.get(b)).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));
    const blHtml = bl.length ? `<section class="backlinks"><h4>Linked from ${bl.length} note${bl.length === 1 ? '' : 's'}</h4><ul>${bl.map((b) => `<li><a class="wl" data-note="${b.id}" href="${BASE}${b.id}/">${esc(b.title)}</a></li>`).join('')}</ul></section>` : '';
    els.doc.innerHTML = head + `<div class="d-body">${html}</div>` + blHtml;
    for (const a of els.doc.querySelectorAll('a.wl')) { const t = notesById.get(a.dataset.note); if (t) a.style.setProperty('--c', courseById.get(t.course).color); }
    if (heading) {
      const h = els.doc.querySelector('#' + CSS.escape(heading));
      if (h) { h.scrollIntoView({ block: 'start' }); h.classList.add('flash'); }
    }
    if (!standalone.on && view && view.scene.kind === 'course') { renderChrome(view.scene); schedule(); }
  }
  function closeReader() { els.reader.hidden = true; selected = null; linkHover = null; hist.stack = []; hist.at = -1; if (view) renderChrome(view.scene); schedule(); }
  els.rClose.onclick = closeReader;
  els.rBack.onclick = () => { if (hist.at > 0) { hist.at--; openNote(hist.stack[hist.at], { record: false }); } };
  els.doc.addEventListener('click', (e) => {
    const a = e.target.closest('a.wl');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const id = a.dataset.note, h = a.dataset.h || (a.hash ? a.hash.slice(1) : null);
    if (id === selected && h) { const el = els.doc.querySelector('#' + CSS.escape(h)); if (el) { el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } return; }
    openNote(id, { heading: h });
  });
  els.doc.addEventListener('mouseover', (e) => { const a = e.target.closest('a.wl'); linkHover = a ? a.dataset.note : null; });
  els.doc.addEventListener('mouseleave', () => { linkHover = null; });

  // drag the reader window by its bar
  els.rbar.addEventListener('pointerdown', (e) => {
    if (standalone.on || W <= 760 || e.target.closest('button, a')) return;
    const r = els.reader.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    els.rbar.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const x = clamp(r.left + ev.clientX - sx, 8 - r.width + 120, W - 120), y = clamp(r.top + ev.clientY - sy, 8, H - 50);
      Object.assign(els.reader.style, { left: x + 'px', top: y + 'px', right: 'auto' });
    };
    const up = () => { els.rbar.removeEventListener('pointermove', move); els.rbar.removeEventListener('pointerup', up); };
    els.rbar.addEventListener('pointermove', move); els.rbar.addEventListener('pointerup', up);
  });

  window.addEventListener('popstate', () => applyRoute(false));
  function applyRoute(first) {
    const r = routeOf(location.pathname);
    if (r.course && r.slug && notesById.has(r.course + '/' + r.slug)) {
      standalone.on = true; document.body.classList.add('standalone');
      openNote(r.course + '/' + r.slug, { pushUrl: false, heading: location.hash ? decodeURIComponent(location.hash.slice(1)) : null });
      return;
    }
    if (standalone.on && !first) { location.reload(); return; }
    if (r.course && courseById.has(r.course)) {
      goCourse(r.course, { push: false });
      const m = /^#(.+)$/.exec(location.hash);
      if (m && first) { const id = r.course + '/' + decodeURIComponent(m[1]); if (notesById.has(id)) openNote(id); setUrl(BASE + r.course + '/', true); }
    } else {
      if (r.course && first) setUrl(BASE, true);
      if (!view) { view = { scene: sceneFor(''), cam: freshCam() }; afterView(); }
      else goRoot({ push: false });
    }
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    redraw();
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastT = performance.now(); redraw(); } });

  // ---------------------------------------------------------------- boot
  async function boot() {
    // a deep link that came through the site's 404 page
    try { const p = sessionStorage.getItem('wos_law_path'); if (p) { sessionStorage.removeItem('wos_law_path'); history.replaceState(null, '', p); } } catch (_) {}
    try { M = await fetch(DATA + 'manifest.json').then((r) => r.json()); }
    catch (_) { els.hint.textContent = 'The library index could not be loaded.'; return; }
    M.courses.forEach((c, i) => { c.gem = COURSE_GEMS[i % COURSE_GEMS.length]; c.color = GEMS[c.gem].glow; });
    for (const c of M.courses) { courseById.set(c.id, c); for (const g of c.groups) for (const id of g.notes) groupOfNote.set(id, g.name); }
    for (const n of M.notes) {
      notesById.set(n.id, n);
      haystack.set(n.id, [n.title, ...(n.aliases || []), n.meta.citation || '', courseById.get(n.course).name, ...(n.meta.topics || [])].join(' ').toLowerCase());
      for (const l of n.links) { if (!backlinks.has(l)) backlinks.set(l, []); backlinks.get(l).push(n.id); }
    }
    resize();
    applyRoute(true);
    schedule();
  }
  boot();
})();
