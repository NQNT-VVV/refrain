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
const QUOTED = /^(.{2,}?)\s*['‘’"“”]([^'‘’"“”]{2,})['‘’"“”]/;

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

  const author = cleanChannel(channel);

  // Convention K-pop et assimiles : ARTISTE 'Titre' …
  const quoted = text.match(QUOTED);
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
      if (artist && title) return { artist, title: title.replace(FEAT_TAIL, '').trim() };
    }
  }

  return {
    artist: author || '',
    title: (bare || String(rawTitle || '').trim()).replace(FEAT_TAIL, '').trim(),
  };
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

module.exports = { parseVideoTitle, parsePlaylistId, toTrack, cleanChannel };
