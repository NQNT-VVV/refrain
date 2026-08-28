'use strict';

/**
 * Normalisation + comparaison floue des reponses joueurs.
 * L'objectif : etre indulgent sur l'orthographe et les mentions parasites
 * ("(Remastered 2011)", "feat. X", accents, ponctuation) sans accepter n'importe quoi.
 */

const LEADING_ARTICLE = /^(the|le|la|les|l|un|une|des|el|los|las|a|an)\s+/;

// Coupures : tout ce qui suit est du bruit editorial ("- Radio Edit", "feat. X")
const CUT_MARKERS = [
  ' - ', ' feat ', ' feat. ', ' ft ', ' ft. ', ' featuring ',
  ' avec ', ' with ', ' vs ', ' vs. ', ' x ', ' & ', ' / ',
];

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Normalise un titre ou un nom d'artiste en une cle comparable. */
function normalize(raw) {
  if (!raw) return '';
  let t = stripAccents(String(raw)).toLowerCase();

  // Enleve les blocs entre parentheses / crochets : (Remastered), [Live]
  t = t.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');

  // Uniformise la ponctuation avant de chercher les marqueurs de coupure
  t = t.replace(/[‘’“”`]/g, "'").replace(/\s+/g, ' ').trim();
  t = ` ${t} `;
  for (const marker of CUT_MARKERS) {
    const idx = t.indexOf(marker);
    if (idx > 0) t = t.slice(0, idx);
  }

  t = t.replace(/\$/g, 's');            // stylisations : Ke$ha, A$AP
  t = t.replace(/[^a-z0-9]+/g, ' ').trim();

  // On ne retire l'article que s'il reste de quoi identifier : sans ce garde-fou
  // « a-ha » deviendrait « ha », et plus personne ne le trouverait.
  const withoutArticle = t.replace(LEADING_ARTICLE, '');
  if (withoutArticle.replace(/ /g, '').length >= 4) t = withoutArticle;

  return t.replace(/\s+/g, ' ').trim();
}

/** Toutes les variantes acceptables d'un champ artiste ("Daft Punk & Pharrell"). */
function artistVariants(raw) {
  if (!raw) return [];
  const base = stripAccents(String(raw)).toLowerCase();
  const parts = base.split(/\s*(?:,|&|\/|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bavec\b|\bwith\b|\bvs\.?\b|\bx\b)\s*/g);
  const out = new Set();
  const full = normalize(raw);
  if (full) out.add(full);
  const whole = normalize(base.replace(/[^a-z0-9]+/g, ' '));
  if (whole) out.add(whole);
  for (const p of parts) {
    const n = normalize(p);
    if (n.length >= 2) out.add(n);
  }
  return [...out];
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / max;
}

/** Seuil adaptatif : plus la chaine est courte, moins on tolere d'erreurs. */
function threshold(len) {
  if (len <= 4) return 1;      // "SOS", "Hey" -> exact
  if (len <= 8) return 0.85;
  if (len <= 14) return 0.82;
  return 0.79;
}

function isClose(guess, reference) {
  if (!guess || !reference) return false;
  if (guess === reference) return true;
  // Les espaces issus de la ponctuation ne doivent pas compter :
  // « aha » vaut « a-ha », « acdc » vaut « AC/DC », « nwa » vaut « N.W.A ».
  if (guess.replace(/ /g, '') === reference.replace(/ /g, '')) return true;
  // Le joueur a tape une sous-partie significative ("bohemian" pour "bohemian rhapsody")
  const shorter = guess.length <= reference.length ? guess : reference;
  const longer = shorter === guess ? reference : guess;
  if (longer.includes(shorter) && shorter.length >= Math.max(5, longer.length * 0.6)) return true;
  return similarity(guess, reference) >= threshold(Math.max(guess.length, reference.length));
}

/** Le titre propose correspond-il au titre du morceau ? */
function matchTitle(guess, trackTitle) {
  const g = normalize(guess);
  if (g.length < 2) return false;
  const refs = new Set([normalize(trackTitle)]);
  // Variante sans coupure : certains titres contiennent legitimement " - "
  refs.add(normalize(String(trackTitle).replace(/\s-\s/g, ' ')));
  for (const r of refs) if (r && isClose(g, r)) return true;
  return false;
}

// Mots trop generiques pour identifier un artiste a eux seuls.
const WEAK_TOKENS = new Set([
  'the', 'les', 'los', 'and', 'band', 'boys', 'girls', 'crew', 'group', 'gang',
  'feat', 'orchestra', 'project', 'brothers', 'sisters', 'family', 'club', 'all',
]);

/**
 * Le joueur a-t-il tape une sous-partie identifiante du nom ?
 * "jackson" -> "michael jackson" OK, "boys" -> "Beach Boys" KO.
 */
function matchesTokenRun(guess, reference) {
  const gTokens = guess.split(' ').filter(Boolean);
  const rTokens = reference.split(' ').filter(Boolean);
  if (!gTokens.length || gTokens.length >= rTokens.length) return false;
  const meaningful = gTokens.filter((t) => t.length >= 4 && !WEAK_TOKENS.has(t));
  if (!meaningful.length) return false;
  for (let i = 0; i + gTokens.length <= rTokens.length; i++) {
    const run = rTokens.slice(i, i + gTokens.length);
    if (run.every((tok, k) => isClose(gTokens[k], tok))) return true;
  }
  return false;
}

/** L'artiste propose correspond-il (nom principal ou featuring) ? */
function matchArtist(guess, trackArtist, contributors = []) {
  const g = normalize(guess);
  if (g.length < 2) return false;
  const refs = new Set(artistVariants(trackArtist));
  for (const c of contributors) for (const v of artistVariants(c)) refs.add(v);
  for (const r of refs) {
    if (!r) continue;
    if (isClose(g, r)) return true;
    if (matchesTokenRun(g, r)) return true;
  }
  return false;
}

module.exports = { normalize, artistVariants, similarity, matchTitle, matchArtist, levenshtein };
