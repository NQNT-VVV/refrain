'use strict';

const { toPlayable, resolvePlayable } = require('./resolve');

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
const MAX_TRACKS = 400;
const EMBED_URL = 'https://open.spotify.com/embed/playlist/';

const clientId = () => process.env.SPOTIFY_CLIENT_ID || '';
const clientSecret = () => process.env.SPOTIFY_CLIENT_SECRET || '';

/** Les identifiants sont fournis par l'environnement, jamais par le code. */
function enabled() {
  return Boolean(clientId() && clientSecret());
}

let token = null; // { value, expiresAt }

async function getToken() {
  if (!enabled()) throw new Error('Spotify n’est pas configuré sur ce serveur.');
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
    const detail = res.status === 400 || res.status === 401 ? 'identifiants refusés' : `erreur ${res.status}`;
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
    if (!retry.ok) throw new Error(`Spotify a répondu ${retry.status}.`);
    return retry.json();
  }
  if (res.status === 404 || res.status === 403) {
    throw Object.assign(new Error('Playlist Spotify introuvable ou privée.'), { status: res.status });
  }
  if (res.status === 429) throw new Error('Spotify limite les appels, réessaie dans un instant.');
  if (!res.ok) throw new Error(`Spotify a répondu ${res.status}.`);
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

/**
 * Lecture de secours : la page « embed » publique d'une playlist.
 *
 * Sans cle et sans quota, elle repond aussi pour les playlists editoriales
 * (« Today's Top Hits »), que l'API refuse en client-credentials depuis fin
 * 2024, et pour un serveur ou Spotify n'est pas configure. Elle se limite aux
 * cent premiers titres et ne donne pas l'ISRC : la resolution chez Deezer se
 * fait alors par titre et artiste, qui reussit sur l'immense majorite.
 */
async function embedPlaylist(playlistId) {
  const res = await fetch(EMBED_URL + encodeURIComponent(playlistId), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; refrain/1.0)', 'Accept-Language': 'fr-FR,fr;q=0.9' },
  });
  if (!res.ok) throw new Error('Playlist Spotify introuvable ou privée.');
  const html = await res.text();
  const raw = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  const entity = raw ? JSON.parse(raw)?.props?.pageProps?.state?.data?.entity : null;
  if (!entity?.trackList?.length) throw new Error('Playlist Spotify introuvable ou privée.');
  const entries = entity.trackList
    .filter((t) => t?.title && t.subtitle && (t.entityType || 'track') === 'track')
    .map((t) => {
      const artists = String(t.subtitle).split(/\s*,\s*/).filter(Boolean);
      return { title: t.title, artist: artists[0], artists, album: '', isrc: null };
    });
  return {
    info: {
      name: entity.name || entity.title || 'Playlist Spotify',
      owner: entity.subtitle || '',
      cover: entity.coverArt?.sources?.[0]?.url || '',
      total: entries.length,
    },
    entries,
  };
}

/** Metadonnees d'une playlist, sans ses morceaux. */
async function playlistInfo(playlistId) {
  if (!enabled()) return (await embedPlaylist(playlistId)).info;
  try {
    const json = await api(`/playlists/${playlistId}?fields=name,owner(display_name),images`);
    return {
      name: json.name || 'Playlist Spotify',
      owner: json.owner?.display_name || '',
      cover: json.images?.[0]?.url || '',
    };
  } catch (err) {
    if (!err.status) throw err;
    return (await embedPlaylist(playlistId)).info;
  }
}

/** Reduit un element de playlist a ce qui sert a le retrouver chez Deezer. */
function toEntry(item) {
  // `item` dans le nouveau point d'acces, `track` dans l'ancien.
  const t = item?.item || item?.track;
  if (!t?.name || !t.artists?.length) return null;
  if (t.type && t.type !== 'track') return null;      // episodes de podcast
  return {
    title: t.name,
    artist: t.artists[0].name,
    artists: t.artists.map((a) => a.name),
    album: t.album?.name || '',
    isrc: t.external_ids?.isrc || null,
  };
}

/** Pages de l'API, sur un chemin donne (`items` ou `tracks`). */
async function apiItems(playlistId, route, max) {
  const out = [];
  for (let offset = 0; offset < max; offset += 100) {
    const page = await api(`/playlists/${playlistId}/${route}?limit=100&offset=${offset}`);
    for (const item of page.items || []) {
      const entry = toEntry(item);
      if (entry) out.push(entry);
      if (out.length >= max) return out;
    }
    if (!page.next) break;
  }
  return out;
}

/**
 * Morceaux d'une playlist, pagines.
 *
 * Spotify a renomme `/tracks` en `/items` en 2026 ; on essaie le nouveau, puis
 * l'ancien, puis la page publique. Une reponse vide compte comme un echec :
 * c'est ce que renvoie l'API quand elle masque le contenu d'une playlist.
 */
async function playlistItems(playlistId, max = MAX_TRACKS) {
  if (enabled()) {
    for (const route of ['items', 'tracks']) {
      try {
        const entries = await apiItems(playlistId, route, max);
        if (entries.length) return entries;
      } catch (err) {
        if (!err.status) throw err;     // quota, panne : inutile d'insister
      }
    }
  }
  return (await embedPlaylist(playlistId)).entries.slice(0, max);
}

/** Enchainement complet, pour les appels qui n'ont pas besoin de progression. */
async function playableTracks(playlistId, { max = MAX_TRACKS, onProgress } = {}) {
  const info = await playlistInfo(playlistId);
  const entries = await playlistItems(playlistId, max);
  const tracks = await resolvePlayable(entries, onProgress);
  return { info, requested: entries.length, tracks };
}

module.exports = {
  enabled, parsePlaylistId, playlistInfo, playlistItems, embedPlaylist,
  resolvePlayable, playableTracks, toPlayable, MAX_TRACKS,
};
