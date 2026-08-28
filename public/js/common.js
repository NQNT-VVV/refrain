/* Refrain — utilitaires partages par les quatre pages. */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* Stockage local (reconnexion apres refresh)                          */
/* ------------------------------------------------------------------ */
export const store = {
  get(key, fallback = null) {
    try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* mode prive */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* mode prive */ } },
};

/* ------------------------------------------------------------------ */
/* Notifications                                                      */
/* ------------------------------------------------------------------ */
export function toast(message, kind = '') {
  let host = $('#toasts');
  if (!host) { host = el('div', { id: 'toasts' }); document.body.append(host); }
  const node = el('div', { class: `toast ${kind}`, text: message });
  host.append(node);
  setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 320); }, 3200);
  return node;
}

/* ------------------------------------------------------------------ */
/* Socket + horloge serveur                                            */
/* ------------------------------------------------------------------ */
export function connect() {
  const socket = io({ transports: ['websocket', 'polling'] });
  socket.call = (event, payload, timeout = 12000) => new Promise((resolve) => {
    let settled = false;
    const done = (res) => { if (!settled) { settled = true; resolve(res || { ok: false, error: 'Pas de reponse du serveur.' }); } };
    socket.emit(event, payload ?? {}, done); // toujours (charge utile, accuse de reception)
    setTimeout(() => done({ ok: false, error: 'Le serveur ne repond pas.' }), timeout);
  });
  return socket;
}

export const clock = {
  offset: 0,
  now() { return Date.now() + this.offset; },
  async sync(socket, samples = 4) {
    const deltas = [];
    for (let i = 0; i < samples; i++) {
      const t0 = Date.now();
      const res = await socket.call('time:sync');
      if (!res?.ok) continue;
      const rtt = Date.now() - t0;
      deltas.push(res.serverNow + rtt / 2 - Date.now());
      await new Promise((r) => setTimeout(r, 60));
    }
    if (deltas.length) {
      deltas.sort((a, b) => a - b);
      this.offset = deltas[Math.floor(deltas.length / 2)];
    }
    return this.offset;
  },
};

/* ------------------------------------------------------------------ */
/* Sons de plateau (synthetises, aucun fichier a charger)              */
/* ------------------------------------------------------------------ */
export const sfx = {
  ctx: null,
  enabled: true,
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone({ freq = 440, dur = 0.16, type = 'sine', gain = 0.16, slide = 0, delay = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.03);
  },
  tick()   { this.tone({ freq: 620, dur: 0.09, type: 'triangle', gain: 0.1 }); },
  go()     { this.tone({ freq: 880, dur: 0.28, type: 'triangle', gain: 0.16, slide: 320 }); },
  buzz()   { this.tone({ freq: 180, dur: 0.42, type: 'sawtooth', gain: 0.2, slide: -60 }); this.tone({ freq: 270, dur: 0.4, type: 'square', gain: 0.07 }); },
  good()   { [0, 0.09, 0.18].forEach((d, i) => this.tone({ freq: [523, 659, 880][i], dur: 0.2, type: 'sine', gain: 0.15, delay: d })); },
  great()  { [0, 0.08, 0.16, 0.26].forEach((d, i) => this.tone({ freq: [523, 659, 784, 1046][i], dur: 0.24, type: 'triangle', gain: 0.15, delay: d })); },
  bad()    { this.tone({ freq: 200, dur: 0.3, type: 'sawtooth', gain: 0.12, slide: -80 }); },
  reveal() { [0, 0.1].forEach((d, i) => this.tone({ freq: [392, 587][i], dur: 0.4, type: 'sine', gain: 0.13, delay: d })); },
  win()    { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.14, delay: i * 0.11 })); },
};

/* ------------------------------------------------------------------ */
/* Confettis                                                          */
/* ------------------------------------------------------------------ */
export function confetti(canvas, { count = 160, duration = 5200 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  };
  resize();
  const colors = ['#8b5cf6', '#22d3ee', '#ff3d8b', '#fbbf24', '#34d399', '#ffffff'];
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height * 0.5,
    w: (6 + Math.random() * 8) * dpr,
    h: (8 + Math.random() * 12) * dpr,
    vy: (1.6 + Math.random() * 3.2) * dpr,
    vx: (Math.random() - 0.5) * 2.2 * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.22,
    color: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  let raf;
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.012 * dpr;
      if (p.y > canvas.height + 40) { p.y = -30; p.x = Math.random() * canvas.width; p.vy = (1.6 + Math.random() * 3) * dpr; }
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = t > duration - 900 ? Math.max(0, (duration - t) / 900) : 1;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < duration) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  raf = requestAnimationFrame(frame);
  window.addEventListener('resize', resize);
  return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, canvas.width, canvas.height); };
}

/* ------------------------------------------------------------------ */
/* Divers                                                             */
/* ------------------------------------------------------------------ */
export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

export function copy(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } });
  ta.value = text; document.body.append(ta); ta.select();
  document.execCommand('copy'); ta.remove();
  return Promise.resolve();
}

export function backdrop() {
  const wrap = el('div', { class: 'aurora' }, el('span'), el('span'), el('span'));
  document.body.prepend(el('div', { class: 'grain' }));
  document.body.prepend(wrap);
}
