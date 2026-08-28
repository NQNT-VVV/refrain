'use strict';

const fs = require('fs');
const path = require('path');

const API = 'https://api.deezer.com';
const CACHE_DIR = path.join(__dirname, '..', '.cache');
const MEM = new Map(); // key -> { at, value }
const DEFAULT_TTL = 6 * 60 * 60 * 1000; // 6 h

fs.mkdirSync(CACHE_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/* Limiteur : l'API Deezer plafonne a ~50 requetes par fenetre de 5 s.  */
/* Fenetre glissante + petite concurrence = debit stable sans quota.    */
/* ------------------------------------------------------------------ */
const WINDOW_MS = 5000;
const MAX_PER_WINDOW = 40;
const MAX_CONCURRENT = 3;

let active = 0;
const recent = [];      // horodatages des requetes de la fenetre courante
const queue = [];
let pumping = false;

function schedule(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}

function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length && active < MAX_CONCURRENT) {
      const now = Date.now();
      while (recent.length && now - recent[0] > WINDOW_MS) recent.shift();
      if (recent.length >= MAX_PER_WINDOW) {
        const retryIn = WINDOW_MS - (now - recent[0]) + 20;
        setTimeout(pump, retryIn);
        return;
      }
      const job = queue.shift();
      recent.push(now);
      active++;
      job.task().then(job.resolve, job.reject).finally(() => {
        active--;
        pump();
      });
    }
  } finally {
    pumping = false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */

function norm(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function diskPath(key) {
  return path.join(CACHE_DIR, `${key.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 120)}.json`);
}

function readCache(key, ttl) {
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  try {
    const raw = JSON.parse(fs.readFileSync(diskPath(key), 'utf8'));
    if (Date.now() - raw.at < ttl) {
      MEM.set(key, raw);
      return raw.value;
    }
  } catch { /* pas de cache disque */ }
  return null;
}

function writeCache(key, value) {
  const entry = { at: Date.now(), value };
  MEM.set(key, entry);
  try { fs.writeFileSync(diskPath(key), JSON.stringify(entry)); } catch { /* disque en lecture seule */ }
}

async function fetchOnce(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(API + endpoint, {
      signal: controller.signal,
      headers: { 'User-Agent': 'refrain/1.0', Accept: 'application/json' },
    });
    if (res.status === 429) throw Object.assign(new Error('Quota limit exceeded'), { quota: true });
    if (!res.ok) throw new Error(`Deezer ${res.status} sur ${endpoint}`);
    const json = await res.json();
    if (json && json.error && Object.keys(json.error).length) {
      const msg = json.error.message || json.error.type || 'erreur inconnue';
      throw Object.assign(new Error(`Deezer: ${msg}`), { quota: /quota/i.test(msg) });
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** Appel API avec relance progressive quand Deezer renvoie un depassement de quota. */
async function dz(endpoint, attempt = 0) {
  try {
    return await schedule(() => fetchOnce(endpoint));
  } catch (err) {
    if (err.quota && attempt < 3) {
      await sleep(1200 * (attempt + 1) + Math.floor(Math.random() * 400));
      return dz(endpoint, attempt + 1);
    }
    throw err;
  }
}

/** Reduit un objet Deezer au strict necessaire pour le jeu. */
function toTrack(raw) {
  if (!raw || !raw.preview) return null;
  const artist = raw.artist?.name || raw.artist || '';
  if (!raw.title || !artist) return null;
  return {
    id: String(raw.id),
    title: raw.title_short || raw.title,
    fullTitle: raw.title,
    artist,
    album: raw.album?.title || '',
    cover: raw.album?.cover_big || raw.album?.cover_medium || raw.album?.cover || '',
    preview: raw.preview,
    link: raw.link || '',
    contributors: (raw.contributors || []).map((c) => c.name).filter(Boolean),
    duration: raw.duration || 0,
    rank: raw.rank || 0,
  };
}

async function searchTracks(q, limit = 25) {
  const key = `search_${q}_${limit}`;
  const cached = readCache(key, DEFAULT_TTL);
  if (cached) return cached;
  const json = await dz(`/search/track?q=${encodeURIComponent(q)}&order=RANKING&limit=${limit}`);
  const tracks = (json.data || []).map(toTrack).filter(Boolean);
  writeCache(key, tracks);
  return tracks;
}

/**
 * Resout un nom d'artiste vers son id Deezer.
 * La recherche avancee `artist:"..."` n'est pas filtrante cote Deezer :
 * on passe donc par /search/artist puis /artist/{id}/top, qui est exact.
 */
async function resolveArtistId(name) {
  const key = `artistid_${name}`;
  const cached = readCache(key, 30 * 24 * 60 * 60 * 1000); // 30 j : un id ne bouge pas
  if (cached) return cached.id;
  const json = await dz(`/search/artist?q=${encodeURIComponent(name)}&limit=5`);
  const candidates = json.data || [];
  if (!candidates.length) return null;
  const wanted = norm(name);
  const exact = candidates.filter((c) => norm(c.name) === wanted);
  const pool = exact.length ? exact : candidates;
  const best = pool.reduce((a, b) => ((b.nb_fan || 0) > (a.nb_fan || 0) ? b : a));
  writeCache(key, { id: best.id, name: best.name });
  return best.id;
}

async function artistTopTracks(name, limit = 8) {
  const key = `artisttop_${name}_${limit}`;
  const cached = readCache(key, DEFAULT_TTL);
  if (cached) return cached;
  const id = await resolveArtistId(name);
  if (!id) {
    writeCache(key, []);
    return [];
  }
  const json = await dz(`/artist/${id}/top?limit=${limit}`);
  const tracks = (json.data || []).map(toTrack).filter(Boolean);
  writeCache(key, tracks);
  return tracks;
}

async function chartTracks(genreId = 0, limit = 100) {
  const key = `chart_${genreId}_${limit}`;
  const cached = readCache(key, 60 * 60 * 1000); // 1 h : le top bouge
  if (cached) return cached;
  const json = await dz(`/chart/${genreId}/tracks?limit=${limit}`);
  const tracks = (json.data || []).map(toTrack).filter(Boolean);
  writeCache(key, tracks);
  return tracks;
}

async function playlistTracks(playlistId, limit = 200) {
  const key = `playlist_${playlistId}_${limit}`;
  const cached = readCache(key, DEFAULT_TTL);
  if (cached) return cached;
  const json = await dz(`/playlist/${playlistId}?limit=${limit}`);
  const tracks = (json.tracks?.data || []).map(toTrack).filter(Boolean);
  const value = { title: json.title || `Playlist ${playlistId}`, cover: json.picture_big || '', tracks };
  writeCache(key, value);
  return value;
}

module.exports = { dz, toTrack, searchTracks, artistTopTracks, resolveArtistId, chartTracks, playlistTracks, readCache, writeCache };
