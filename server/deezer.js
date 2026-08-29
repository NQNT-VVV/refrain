'use strict';

const fs = require('fs');
const path = require('path');
const metrics = require('./metrics');
// Meme normalisation que la correction des reponses : les cles doivent coincider
// avec celles utilisees a la construction des listes.
const { normalize: titleKey } = require('./match');

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
  if (hit && Date.now() - hit.at < ttl) {
    metrics.deezerCache.inc({ result: 'hit' });
    return hit.value;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(diskPath(key), 'utf8'));
    if (Date.now() - raw.at < ttl) {
      MEM.set(key, raw);
      metrics.deezerCache.inc({ result: 'hit' });
      return raw.value;
    }
  } catch { /* pas de cache disque */ }
  metrics.deezerCache.inc({ result: 'miss' });
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
  const stopTimer = metrics.deezerDuration.startTimer();
  let outcome = 'error';
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
    outcome = 'ok';
    return json;
  } catch (err) {
    outcome = err.quota ? 'quota' : err.name === 'AbortError' ? 'timeout' : 'error';
    throw err;
  } finally {
    clearTimeout(timer);
    stopTimer();
    metrics.deezerRequests.inc({ outcome });
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

/**
 * Les URL d'extrait Deezer sont signees et expirent en moins d'une heure :
 * une URL rangee dans le cache des listes (6 h) renvoie 403 a la lecture.
 * On les re-resout donc juste avant de jouer, avec un cache memoire tres court.
 */
const PREVIEW_TTL = 8 * 60 * 1000;
const previews = new Map(); // trackId -> { at, url }

async function freshPreview(trackId) {
  const id = String(trackId);
  const hit = previews.get(id);
  if (hit && Date.now() - hit.at < PREVIEW_TTL) return hit.url;

  const json = await dz(`/track/${id}`);
  const url = json?.preview || null;
  if (url) {
    previews.set(id, { at: Date.now(), url });
    // Evite une croissance sans fin sur les longues sessions
    if (previews.size > 500) {
      for (const [key, value] of previews) {
        if (Date.now() - value.at > PREVIEW_TTL) previews.delete(key);
      }
    }
  }
  return url;
}

/**
 * Recherche par ISRC — l'identifiant international d'un enregistrement.
 *
 * C'est le pont exact depuis un autre catalogue : pas d'ambiguite de titre, pas
 * de reprise prise pour l'original. L'association est stable, on la garde une
 * semaine ; seule l'URL d'extrait expire, et elle est re-resolue a chaque manche.
 */
/** Artistes correspondant a une recherche, les plus suivis d'abord. */
async function searchArtists(query, limit = 8) {
  const key = `artists_${query}_${limit}`;
  const cached = readCache(key, DEFAULT_TTL);
  if (cached) return cached;
  const json = await dz(`/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`);
  const artists = (json.data || []).map((a) => ({
    id: String(a.id),
    name: a.name,
    picture: a.picture_medium || a.picture || '',
    fans: a.nb_fan || 0,
    albums: a.nb_album || 0,
  }));
  writeCache(key, artists);
  return artists;
}

async function artistInfo(artistId) {
  const key = `artistinfo_${artistId}`;
  const cached = readCache(key, DEFAULT_TTL);
  if (cached) return cached;
  const json = await dz(`/artist/${artistId}`);
  const info = {
    id: String(json.id),
    name: json.name,
    picture: json.picture_big || json.picture_medium || '',
    fans: json.nb_fan || 0,
  };
  writeCache(key, info);
  return info;
}

/**
 * Discographie complete d'un artiste : albums, EP et singles.
 *
 * Le top d'un artiste tient en cinquante titres ; pour un mode « vrai fan » il
 * faut descendre dans les albums, piste par piste. Chaque piste porte son rang
 * de popularite, ce qui permet ensuite de separer les tubes des faces B.
 */
async function artistDiscography(artistId, { maxReleases = 45 } = {}) {
  const key = `discog_${artistId}_${maxReleases}`;
  const cached = readCache(key, 24 * 60 * 60 * 1000);
  if (cached) return cached;

  const releases = await dz(`/artist/${artistId}/albums?limit=${maxReleases}`);
  // Les albums et EP d'abord : les singles reprennent souvent leurs pistes.
  const order = { album: 0, ep: 1, single: 2, compile: 3 };
  const sorted = (releases.data || [])
    .sort((a, b) => (order[a.record_type] ?? 9) - (order[b.record_type] ?? 9))
    .slice(0, maxReleases);

  const tracks = [];
  for (let i = 0; i < sorted.length; i += 4) {
    const batch = await Promise.all(sorted.slice(i, i + 4).map(async (album) => {
      try {
        const full = await dz(`/album/${album.id}`);
        return (full.tracks?.data || []).map((t) => toTrack({
          ...t,
          album: { title: full.title, cover_big: full.cover_big, cover_medium: full.cover_medium },
          artist: t.artist || { name: full.artist?.name },
        }));
      } catch {
        return [];
      }
    }));
    for (const list of batch) for (const t of list) if (t) tracks.push(t);
  }

  writeCache(key, tracks);
  return tracks;
}

/**
 * Collaborations d'un artiste, en deux familles.
 *
 *   - `sharedIds` : sous son nom, mais avec un autre artiste en tete d'affiche ;
 *   - `guests`    : il est invite, l'affiche est a quelqu'un d'autre.
 *
 * Trois pieges evites ici. Les pistes d'album ne portent ni contributeurs ni
 * mention « feat » : l'information vient du top de l'artiste, qui les liste avec
 * leur role. Le role compte : « Bohemian Rhapsody » ne credite que Queen en
 * Main, alors qu'« Under Pressure » credite Queen et David Bowie. Et l'exclusion
 * se fait par identifiant de piste, jamais par titre : le top de Queen contient
 * quatre « Bohemian Rhapsody » — l'album, un live, un medley et une version avec
 * les Muppets — et seules les deux dernieres sont des collaborations.
 */
async function artistCollaborations(artistId, artistName) {
  const key = `collabs_${artistId}_v5`;
  const cached = readCache(key, 24 * 60 * 60 * 1000);
  if (cached) return cached;

  const wanted = norm(artistName);
  const [top, found] = await Promise.all([
    dz(`/artist/${artistId}/top?limit=100`).catch(() => ({ data: [] })),
    dz(`/search/track?q=${encodeURIComponent(artistName)}&limit=50`).catch(() => ({ data: [] })),
  ]);

  // Le meme enregistrement porte des identifiants differents selon qu'il vienne
  // du top ou d'un album : on releve donc aussi les titres dont *toutes* les
  // versions sont des collaborations. « Under Pressure » l'est toujours ;
  // « Bohemian Rhapsody » ne l'est que dans ses versions Muppets et live, ce qui
  // laisse la version d'album tranquille.
  const sharedIds = [];
  const stats = new Map();
  for (const raw of top.data || []) {
    const mains = (raw.contributors || []).filter((c) => String(c.role || '').toLowerCase() === 'main');
    const collab = mains.some((c) => norm(c.name) !== wanted);
    if (collab) sharedIds.push(String(raw.id));
    const key2 = titleKey(raw.title_short || raw.title);
    const entry = stats.get(key2) || { total: 0, collab: 0 };
    entry.total += 1;
    if (collab) entry.collab += 1;
    stats.set(key2, entry);
  }
  const sharedTitles = [...stats.entries()]
    .filter(([, v]) => v.total > 0 && v.collab === v.total)
    .map(([title]) => title);

  // La recherche ne renvoie pas les contributeurs : on verifie piste par piste,
  // sinon « Dancing Queen » d'ABBA passerait pour une collaboration de Queen.
  const candidates = (found.data || [])
    .filter((raw) => norm(raw.artist?.name || '') !== wanted)
    .slice(0, 12);

  const guests = [];
  const checked = await Promise.all(candidates.map(async (raw) => {
    try {
      const full = await dz(`/track/${raw.id}`);
      const credited = (full.contributors || []).map((c) => norm(c.name));
      return credited.includes(wanted) ? toTrack(full) : null;
    } catch {
      return null;
    }
  }));
  for (const track of checked) if (track?.preview) guests.push(track);

  const result = { sharedIds, sharedTitles, guests };
  writeCache(key, result);
  return result;
}

async function trackByIsrc(isrc) {
  const key = `isrc_${isrc}`;
  const cached = readCache(key, 7 * 24 * 60 * 60 * 1000);
  if (cached !== null) return cached;
  try {
    const json = await dz(`/track/isrc:${encodeURIComponent(isrc)}`);
    const track = toTrack(json);
    writeCache(key, track);
    return track;
  } catch {
    writeCache(key, false);   // negatif memorise : inutile de reessayer en boucle
    return null;
  }
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

module.exports = { dz, toTrack, searchTracks, artistTopTracks, resolveArtistId, freshPreview, trackByIsrc,
  searchArtists, artistInfo, artistDiscography, artistCollaborations, chartTracks, playlistTracks, readCache, writeCache };
