'use strict';

/**
 * Client Podium de reference, a copier dans `server/integrations/podium.js`
 * d'un jeu. Zero dependance : `crypto` et `fetch` de Node 22.
 *
 * Trois fonctions :
 *   - readIdentity(cookieHeader)  → { pid, pseudo, avatar } | null
 *   - postResults(slug, payload)  → reponse JSON | null (jamais d'exception)
 *   - activeChallenges(slug)      → [challenge] (cache 5 min, [] si injoignable)
 *
 * Inerte sans PODIUM_URL.
 */

const crypto = require('crypto');

const URL_BASE = String(process.env.PODIUM_URL || '').replace(/\/+$/, '');
const GAME_KEY = process.env.PODIUM_GAME_KEY || '';
const SSO_SECRET = process.env.PODIUM_SSO_SECRET || '';
const SSO_COOKIE = process.env.PODIUM_SSO_COOKIE || 'nqnt_id';

const enabled = () => Boolean(URL_BASE);

/* ---------------------------------------------------------------- */
/* Identite                                                         */
/* ---------------------------------------------------------------- */

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

/** Verifie et decode le cookie d'identite Podium. Null si absent ou invalide. */
function readIdentity(cookieHeader) {
  if (!SSO_SECRET) return null;
  const raw = parseCookies(cookieHeader)[SSO_COOKIE];
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = b64url(crypto.createHmac('sha256', SSO_SECRET).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.v !== 1 || typeof payload.pid !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    return {
      pid: payload.pid,
      pseudo: String(payload.pseudo || '').slice(0, 24),
      avatar: String(payload.avatar || '').slice(0, 8),
    };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- */
/* Resultats                                                        */
/* ---------------------------------------------------------------- */

async function fetchJson(url, init, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envoie un classement. Une nouvelle tentative apres 5 s en cas d'echec
 * reseau ou 5xx, puis abandon silencieux (log). Rend la reponse JSON ou null.
 */
async function postResults(slug, payload) {
  if (!enabled() || !GAME_KEY) return null;
  const url = `${URL_BASE}/api/v1/games/${encodeURIComponent(slug)}/results`;
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GAME_KEY}` },
    body: JSON.stringify(payload),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchJson(url, init);
      if (res.ok) return res.json;
      // 4xx : inutile de reessayer, le payload ou la cle sont en cause.
      if (res.status < 500) {
        console.warn(`[podium] resultats refuses (${res.status}) : ${res.json?.error || 'sans detail'}`);
        return null;
      }
      console.warn(`[podium] hub en erreur (${res.status}), tentative ${attempt + 1}/2`);
    } catch (err) {
      console.warn(`[podium] hub injoignable : ${err.message}, tentative ${attempt + 1}/2`);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

/* ---------------------------------------------------------------- */
/* Defis                                                            */
/* ---------------------------------------------------------------- */

const cache = new Map(); // slug -> { at, list }
const CACHE_MS = 5 * 60 * 1000;

/** Defis actifs pour ce jeu. Tableau vide si le hub est injoignable. */
async function activeChallenges(slug) {
  if (!enabled()) return [];
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  try {
    const res = await fetchJson(`${URL_BASE}/api/v1/games/${encodeURIComponent(slug)}/challenges/active`, {}, 5000);
    const list = res.ok && Array.isArray(res.json?.challenges) ? res.json.challenges : [];
    cache.set(slug, { at: Date.now(), list });
    return list;
  } catch (err) {
    console.warn(`[podium] defis indisponibles : ${err.message}`);
    return hit?.list ?? [];
  }
}

module.exports = { enabled, readIdentity, postResults, activeChallenges, parseCookies, SSO_COOKIE, URL_BASE };
