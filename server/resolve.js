'use strict';

const dz = require('./deezer');
const { matchTitle, matchArtist, normalize } = require('./match');

/**
 * Pont vers Deezer pour les playlists venues d'ailleurs (Spotify, YouTube) :
 * Deezer fournit l'extrait de 30 s, des titres propres pour la correction, et
 * un son que les telephones peuvent jouer en meme temps que l'ecran.
 */

/** Titre debarrasse de ce qui gene la recherche : « - Remastered 2011 », « (feat. X) ». */
function searchableTitle(title) {
  return String(title || '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .trim() || String(title || '');
}

/**
 * Retrouve chez Deezer un morceau repere ailleurs (Spotify, YouTube).
 * L'ISRC d'abord — exact — puis deux recherches titre + artiste, verifiees par
 * le meme correcteur que les reponses des joueurs : une reprise ou un homonyme
 * ne passe pas.
 */
async function toPlayable(entry) {
  if (entry.isrc) {
    const byIsrc = await dz.trackByIsrc(entry.isrc);
    if (byIsrc?.preview) return byIsrc;
  }
  const title = searchableTitle(entry.title);
  const artists = entry.artists?.length ? entry.artists : [entry.artist].filter(Boolean);
  const fits = (candidate) => candidate.preview
    && matchTitle(entry.title, candidate.title)
    && artists.some((a) => matchArtist(a, candidate.artist, candidate.contributors));
  const queries = entry.title && artists.length ? [
    `${title} ${artists[0]}`,
    `artist:"${artists[0]}" track:"${title}"`,
  ] : [];
  for (const q of queries) {
    try {
      const found = (await dz.searchTracks(q, 8)).find(fits);
      if (found) return found;
    } catch { /* Deezer indisponible : le morceau sera simplement ecarte */ }
  }
  // Dernier recours pour un titre de video sans separateur (« Mc solaar
  // Caroline ») : on cherche le texte brut, et on n'accepte un resultat que si
  // ce texte contient a la fois son titre et son artiste.
  if (entry.raw) {
    const raw = ` ${normalize(entry.raw)} `;
    const inRaw = (s) => { const n = normalize(s); return n.length >= 3 && raw.includes(` ${n} `); };
    try {
      const found = (await dz.searchTracks(entry.raw, 8))
        .find((c) => c.preview && inRaw(c.title) && inRaw(c.artist));
      if (found) return found;
    } catch { /* idem */ }
  }
  return null;
}

/**
 * Resout une liste d'entrees, dans l'ordre : le resultat est aligne sur
 * l'entree (morceau Deezer ou null). `onProgress` permet a l'animateur de voir
 * la resolution avancer.
 */
async function resolveEach(entries, onProgress) {
  const out = [];
  let found = 0;
  const BATCH = 8;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = await Promise.all(entries.slice(i, i + BATCH).map(toPlayable));
    for (const track of batch) {
      const playable = track?.preview ? track : null;
      if (playable) found += 1;
      out.push(playable);
    }
    onProgress?.(Math.min(i + BATCH, entries.length), entries.length, found);
  }
  return out;
}

/** Seulement les morceaux retrouves. */
async function resolvePlayable(entries, onProgress) {
  return (await resolveEach(entries, onProgress)).filter(Boolean);
}

module.exports = { toPlayable, resolveEach, resolvePlayable, searchableTitle };
