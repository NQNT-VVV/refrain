'use strict';

const dz = require('./deezer');
const { matchTitle, matchArtist } = require('./match');

/**
 * Spotify comme catalogue, Deezer comme source sonore.
 *
 * Depuis fin 2024, l'API Spotify ne renvoie plus d'extrait de 30 s sur la
 * plupart des morceaux en client-credentials : elle reste excellente pour
 * savoir *quoi* jouer — playlists editoriales, tops d'artistes — mais elle ne
 * donne plus de quoi le jouer. On lui demande donc la liste, et on retrouve
 * chaque morceau chez Deezer par son ISRC, l'identifiant international de
 * l'enregistrement : pas d'ambiguite de titre, pas de reprise prise pour
 * l'original.
 */

const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const MAX_TRACKS = 200;

const clientId = () => process.env.SPOTIFY_CLIENT_ID || '';
const clientSecret = () => process.env.SPOTIFY_CLIENT_SECRET || '';

/** Les identifiants sont fournis par l'environnement, jamais par le code. */
function enabled() {
  return Boolean(clientId() && clientSecret());
}

let token = null; // { value, expiresAt }

async function getToken() {
  if (!enabled()) throw new Error('Spotify n\'est pas configure sur ce serveur.');
  if (token && Date.now() < token.expiresAt - 30_000) return token.value;

  const credentials = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const detail = res.status === 400 || res.status === 401 ? 'identifiants refuses' : `erreur ${res.status}`;
    throw new Error(`Spotify : ${detail}.`);
  }
  const json = await res.json();
  token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
  return token.value;
}

async function api(path) {
  const bearer = await getToken();
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${bearer}` } });
  if (res.status === 401) {
    token = null;                       // jeton perime : une seule relance
    const retry = await fetch(API + path, { headers: { Authorization: `Bearer ${await getToken()}` } });
    if (!retry.ok) throw new Error(`Spotify a repondu ${retry.status}.`);
    return retry.json();
  }
  if (res.status === 404) throw new Error('Playlist Spotify introuvable ou privee.');
  if (res.status === 429) throw new Error('Spotify limite les appels, reessaie dans un instant.');
  if (!res.ok) throw new Error(`Spotify a repondu ${res.status}.`);
  return res.json();
}

/** Extrait un identifiant de playlist d'une URL, d'un URI ou d'un id nu. */
function parsePlaylistId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const url = raw.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]{16,})/);
  if (url) return url[1];
  const uri = raw.match(/^spotify:playlist:([A-Za-z0-9]{16,})$/);
  if (uri) return uri[1];
  if (/^[A-Za-z0-9]{22}$/.test(raw)) return raw;
  return null;
}

/** Metadonnees d'une playlist, sans ses morceaux. */
async function playlistInfo(playlistId) {
  const json = await api(`/playlists/${playlistId}?fields=name,owner(display_name),images,tracks(total)`);
  return {
    name: json.name || 'Playlist Spotify',
    owner: json.owner?.display_name || '',
    cover: json.images?.[0]?.url || '',
    total: json.tracks?.total || 0,
  };
}

/** Morceaux d'une playlist, pagines. */
async function playlistItems(playlistId, max = MAX_TRACKS) {
  const fields = 'items(track(name,artists(name),album(name),external_ids(isrc),duration_ms)),next';
  const out = [];
  for (let offset = 0; offset < max; offset += 100) {
    const page = await api(`/playlists/${playlistId}/tracks?limit=100&offset=${offset}&fields=${encodeURIComponent(fields)}`);
    for (const item of page.items || []) {
      const t = item?.track;
      if (!t?.name || !t.artists?.length) continue;
      out.push({
        title: t.name,
        artist: t.artists[0].name,
        artists: t.artists.map((a) => a.name),
        album: t.album?.name || '',
        isrc: t.external_ids?.isrc || null,
      });
      if (out.length >= max) return out;
    }
    if (!page.next) break;
  }
  return out;
}

/**
 * Retrouve chez Deezer un morceau repere sur Spotify.
 * L'ISRC d'abord — exact — puis la recherche titre + artiste en dernier recours.
 */
async function toPlayable(entry) {
  if (entry.isrc) {
    const byIsrc = await dz.trackByIsrc(entry.isrc);
    if (byIsrc?.preview) return byIsrc;
  }
  try {
    const results = await dz.searchTracks(`${entry.title} ${entry.artist}`, 5);
    for (const candidate of results) {
      if (!candidate.preview) continue;
      if (matchTitle(entry.title, candidate.title) && matchArtist(entry.artist, candidate.artist, candidate.contributors)) {
        return candidate;
      }
    }
  } catch { /* Deezer indisponible : le morceau sera simplement ecarte */ }
  return null;
}

/**
 * Retrouve les extraits jouables d'une liste de morceaux Spotify.
 * `onProgress` permet a l'animateur de voir la resolution avancer.
 */
async function resolvePlayable(entries, onProgress) {
  const tracks = [];
  const BATCH = 8;
  for (let i = 0; i < entries.length; i += BATCH) {
    const found = await Promise.all(entries.slice(i, i + BATCH).map(toPlayable));
    for (const track of found) if (track?.preview) tracks.push(track);
    onProgress?.(Math.min(i + BATCH, entries.length), entries.length, tracks.length);
  }
  return tracks;
}

/** Enchainement complet, pour les appels qui n'ont pas besoin de progression. */
async function playableTracks(playlistId, { max = MAX_TRACKS, onProgress } = {}) {
  const info = await playlistInfo(playlistId);
  const entries = await playlistItems(playlistId, max);
  const tracks = await resolvePlayable(entries, onProgress);
  return { info, requested: entries.length, tracks };
}

module.exports = {
  enabled, parsePlaylistId, playlistInfo, playlistItems,
  resolvePlayable, playableTracks, toPlayable, MAX_TRACKS,
};
