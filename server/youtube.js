'use strict';

/**
 * Lecture directe depuis YouTube.
 *
 * Sans cle API, le serveur ne sait rien des videos : c'est le terminal charge
 * du son qui charge la playlist dans le lecteur YouTube, remonte la liste des
 * identifiants puis, a chaque manche, le titre de la video en cours. Ce module
 * fait le sale boulot : extraire un identifiant de playlist d'une URL, et tirer
 * un couple (titre, artiste) exploitable d'un titre de video.
 */

/** Blocs editoriaux a jeter : « (Official Video) », « [4K] », « (Clip officiel) »… */
const NOISE = /\s*[([]\s*(official\s*(music\s*|lyrics?\s*)*(video|audio|visualizer)?|clip\s*(officiel|video)?|video\s*officiel(le)?|lyrics?(\s*video)?|paroles|audio(\s*officiel)?|hd|hq|4k|8k|1080p|720p|remaster(ed)?[^)\]]*|live(\s*(session|performance|at|@)[^)\]]*)?|visualizer|mv|m\/v|color\s*coded[^)\]]*|prod\.?[^)\]]*|explicit|clean|full\s*(album|song)|extended|radio\s*edit|cover\s*art|pseudo\s*video)\s*[)\]]/gi;

/** Mentions de featuring en queue de titre : utiles a l'oreille, pas a la saisie. */
const FEAT_TAIL = /\s+(ft\.?|feat\.?|featuring|avec)\s+.+$/i;

/** Suffixes de chaine sans interet : « Artiste - Topic », « ArtisteVEVO ». */
function cleanChannel(channel) {
  return String(channel || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/\s*(Official|Music)$/i, '')
    .trim();
}

const SEPARATORS = [' - ', ' – ', ' — ', ' _ ', ' ~ '];
// Le guillemet ouvrant suit un espace et le fermant precede un espace ou la
// fin : une apostrophe dans un mot (« Qu'est-ce qu'on attend ») n'en est pas un.
const QUOTED = /^(.{2,}?)\s+['‘’"“”]([^'‘’"“”]{2,})['‘’"“”](?=\s|$)/;
/** Numero de piste en tete : « 10. Fabe - … », « 01- kery james - … ». */
const TRACK_NUMBER = /^\s*\d{1,3}\s*[.)\-–]\s*/;

/**
 * Transforme un titre de video en couple exploitable pour la correction.
 * « Daft Punk - Get Lucky (Official Audio) [HD] » -> { artist, title }
 */
function parseVideoTitle(rawTitle, channel) {
  let text = String(rawTitle || '');

  // Tout ce qui suit « | » ou « // » releve de l'habillage de chaine
  for (const tail of [' | ', ' // ', ' //']) {
    const at = text.indexOf(tail);
    if (at > 3) text = text.slice(0, at);
  }

  text = text.replace(NOISE, ' ').replace(/\s{2,}/g, ' ').trim();
  text = text.replace(/[\s\-–—_|]+$/, '').trim();
  text = text.replace(TRACK_NUMBER, '');
  // Les memes mentions, sans parentheses, en queue de titre.
  text = text.replace(/\s+(clip\s+officiel|official\s+(music\s+)?video|official\s+mv|audio\s+officiel|lyrics?|m\/v|mv)\s*$/i, '').trim();

  const author = cleanChannel(channel);

  // Convention K-pop et assimiles : ARTISTE 'Titre' … — seulement en l'absence
  // de separateur, qui fait foi quand il existe.
  const quoted = SEPARATORS.some((sep) => text.includes(sep)) ? null : text.match(QUOTED);
  if (quoted) {
    const artist = quoted[1].replace(/[\s\-–—:]+$/, '').trim();
    const title = quoted[2].trim();
    if (artist && title) return { artist, title: title.replace(FEAT_TAIL, '').trim() };
  }

  const bare = text.replace(/["“”«»]/g, '').trim();

  for (const sep of SEPARATORS) {
    const at = bare.indexOf(sep);
    // Un separateur trop pres du bord ne separe pas un artiste d'un titre
    if (at > 1 && at < bare.length - 2) {
      const artist = bare.slice(0, at).trim();
      const title = bare.slice(at + sep.length).trim();
      if (artist && title) {
        return { artist, title: title.replace(FEAT_TAIL, '').replace(/^['‘’](.+)['‘’]$/, '$1').trim() };
      }
    }
  }

  return {
    artist: author || '',
    title: (bare || String(rawTitle || '').trim()).replace(FEAT_TAIL, '').trim(),
  };
}

/**
 * Noms d'artistes candidats pour retrouver une video chez Deezer :
 * « Shakira, Burna Boy » donne les deux, et la chaine s'y ajoute — « Indochine
 * - Topic » nomme l'artiste quand le titre de la video ne le fait pas.
 */
function splitArtists(artist, channel) {
  const names = String(artist || '')
    .split(/\s*(?:,|&|\+|\bx\b|\band\b|\bet\b|\bfeat\.?|\bft\.?|\bvs\.?)\s*/i)
    .map((n) => n.trim())
    .filter((n) => n.length > 1);
  const fromChannel = cleanChannel(channel);
  if (fromChannel) names.push(fromChannel);
  return [...new Set(names)];
}

/** Extrait l'identifiant de playlist d'une URL YouTube, ou null. */
function parsePlaylistId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const fromUrl = raw.match(/[?&]list=([A-Za-z0-9_-]{12,})/);
  if (fromUrl) return fromUrl[1];
  if (/^(PL|UU|OL|RD|FL|LL)[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;
  return null;
}

/** Construit un morceau jouable a partir d'un identifiant de video. */
function toTrack(videoId, index) {
  return {
    id: String(videoId),
    source: 'youtube',
    videoId: String(videoId),
    index,
    title: '',
    artist: '',
    album: '',
    // maxres n'a pas les bandes noires de hqdefault ; repli cote client.
    cover: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    coverFallback: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    link: `https://www.youtube.com/watch?v=${videoId}`,
    preview: null,
    contributors: [],
    duration: 0,
    rank: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Lecture d'une playlist cote serveur                                 */
/* ------------------------------------------------------------------ */

const PAGE_URL = 'https://www.youtube.com/playlist?list=';
const BROWSE_URL = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&key=';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.6',
  // Evite la page de consentement europeenne, qui ne contient aucune donnee.
  Cookie: 'SOCS=CAI; CONSENT=YES+',
};
const MAX_VIDEOS = 400;

/** Extrait un objet JSON affecte a une variable dans un <script>. */
function scriptJson(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  const end = html.indexOf(';</script>', start);
  if (start < 0 || end < 0) return null;
  try { return JSON.parse(html.slice(start, end)); } catch { return null; }
}

const text = (node) => node?.content ?? node?.simpleText ?? node?.runs?.map((r) => r.text).join('') ?? '';

/**
 * Releve les videos d'une reponse YouTube, quel que soit le gabarit : le
 * nouveau (`lockupViewModel`) ou l'ancien (`playlistVideoRenderer`).
 */
function collect(node, videos, state) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collect(child, videos, state);
    // Le jeton de suite est le dernier element du tableau qui porte directement
    // les videos ; les autres jetons de la page (etagere de suggestions, en
    // queue du tableau parent) meneraient ailleurs.
    const tail = node[node.length - 1];
    const cont = tail?.continuationItemViewModel || tail?.continuationItemRenderer;
    const holdsVideos = node.some((child) => child?.lockupViewModel || child?.playlistVideoRenderer);
    if (cont && holdsVideos) {
      const token = JSON.stringify(cont).match(/"continuationCommand":\{"token":"([^"]+)"/)?.[1];
      if (token) state.token = token;
    }
    return;
  }
  if (node.lockupViewModel) {
    const l = node.lockupViewModel;
    if (l.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && l.contentId) {
      const meta = l.metadata?.lockupMetadataViewModel;
      videos.push({
        videoId: l.contentId,
        title: text(meta?.title),
        channel: text(meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text),
      });
    }
    return;
  }
  if (node.playlistVideoRenderer) {
    const v = node.playlistVideoRenderer;
    if (v.videoId && v.isPlayable !== false) {
      videos.push({ videoId: v.videoId, title: text(v.title), channel: text(v.shortBylineText) });
    }
    return;
  }
  if (node.continuationItemViewModel || node.continuationItemRenderer) return;
  for (const key of Object.keys(node)) collect(node[key], videos, state);
}

/**
 * Lit une playlist publique ou non repertoriee sans cle API : la page web
 * porte les cent premieres videos, la suite vient par pages de cent.
 *
 * Renvoie null si YouTube ne donne rien d'exploitable (playlist privee, mix
 * genere « RD… », page de verification) : l'appelant se rabat alors sur le
 * lecteur du terminal audio.
 */
async function fetchPlaylist(listId, max = MAX_VIDEOS) {
  const res = await fetch(PAGE_URL + encodeURIComponent(listId), { headers: HEADERS });
  if (!res.ok) return null;
  const html = await res.text();
  const data = scriptJson(html, 'ytInitialData = ') || scriptJson(html, 'ytInitialData"] = ');
  if (!data) return null;

  const title = data.metadata?.playlistMetadataRenderer?.title || 'Playlist YouTube';
  const videos = [];
  const state = { token: null };
  collect(data.contents, videos, state);

  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  while (state.token && videos.length < max && apiKey && clientVersion) {
    const token = state.token;
    state.token = null;
    try {
      const next = await fetch(BROWSE_URL + apiKey, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion, hl: 'fr', gl: 'FR' } },
          continuation: token,
        }),
      });
      if (!next.ok) break;
      const before = videos.length;
      collect(await next.json(), videos, state);
      if (videos.length === before) break;
    } catch {
      break;   // on garde ce qui est deja lu
    }
  }

  const unique = [];
  const seen = new Set();
  for (const v of videos) {
    if (seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    unique.push(v);
    if (unique.length >= max) break;
  }
  return unique.length ? { title, videos: unique } : null;
}

module.exports = { parseVideoTitle, parsePlaylistId, toTrack, cleanChannel, splitArtists, fetchPlaylist };
